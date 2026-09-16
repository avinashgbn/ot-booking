import {
  sendWhatsApp,
  formatDate,
  formatTime,
  buildCaseRequestBody,
  buildRescheduleRequestBody,
} from './whatsapp.ts';

// After this many failed WhatsApp send attempts for a single step, stop
// retrying it and advance the cascade as if the anaesthetist had declined —
// otherwise a permanently bad number would retry forever and the case would
// never move on.
export const MAX_NOTIFY_ATTEMPTS = 6;

// How long a cascade_steps row may sit pending with notified_at still null
// before checkExpirations treats it as stalled and (re)notifies it. Gives an
// in-flight 'start' request from the client a window to finish normally
// before the server-side sweep steps in.
export const STALLED_GRACE_MS = 60 * 1000;

function windowMinutesFor(booking: any): number {
  return booking.cascade_mode === 'sequential' ? 5 : 8;
}

export function buildTimeoutReminderBody(booking: any, minutesRemaining: number): string {
  return [
    'Reminder — your response window is closing for the following case:',
    '',
    `Patient: ${booking.patient_initials}`,
    `Surgery: ${booking.procedure}`,
    `Date: ${formatDate(booking.surgery_date)}`,
    `Time: ${formatTime(booking.surgery_time)}`,
    `Hospital/Clinic: ${booking.hospital_clinic || 'Unknown'}`,
    '',
    `Closes in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}. Reply 1 to ACCEPT or 2 to DECLINE.`,
  ].join('\n');
}

export function buildAllDeclinedAlertBody(booking: any): string {
  return [
    'ALERT: No anaesthetist has accepted this case.',
    '',
    `Patient: ${booking.patient_initials}, ${booking.patient_age} yrs`,
    `Surgery: ${booking.procedure}`,
    `Date: ${formatDate(booking.surgery_date)}`,
    `Time: ${formatTime(booking.surgery_time)}`,
    `Hospital/Clinic: ${booking.hospital_clinic || 'Unknown'}`,
    '',
    'Every anaesthetist in the cascade has declined, timed out, or could not be reached. Please add another anaesthetist or contact one directly.',
  ].join('\n');
}

export function buildAlreadyFilledBody(booking: any, anaesthetistName: string): string {
  return `Sorry Dr ${anaesthetistName}, this case (${booking.patient_initials} - ${booking.procedure} on ${formatDate(booking.surgery_date)}) has just been filled by another anaesthetist. Thank you for your availability.`;
}

async function logMessage(supabase: any, row: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('whatsapp_log').insert(row);
  if (error) console.error('whatsapp_log insert failed:', error.message, row);
}

// Sends (or retries) the case-request message for one cascade step.
//
// On success: stamps notified_at/expires_at so checkExpirations' timeout
// sweep can track the reply window, and resets the retry/nudge bookkeeping.
//
// On failure: does NOT stamp notified_at/expires_at, so the step stays
// pending with the anaesthetist never actually notified. checkExpirations'
// stalled-step sweep will retry it on its next tick (every ~30s) instead of
// the reply window silently ticking down on a message nobody received.
// After MAX_NOTIFY_ATTEMPTS the step is marked 'send_failed' and the cascade
// advances to the next rank / all_declined, same as a real decline.
export async function notifyStep(supabase: any, booking: any, step: any): Promise<boolean> {
  const windowMinutes = windowMinutesFor(booking);
  const isReschedule = step.cascade_context === 'reschedule';
  const body = isReschedule
    ? buildRescheduleRequestBody(booking, windowMinutes)
    : buildCaseRequestBody(booking, windowMinutes);

  const sent = await sendWhatsApp(step.anaesthetist.phone, body);
  const now = new Date();
  const nowIso = now.toISOString();

  if (sent) {
    const { error } = await supabase
      .from('cascade_steps')
      .update({
        notified_at: nowIso,
        expires_at: new Date(now.getTime() + windowMinutes * 60 * 1000).toISOString(),
        nudge_sent_at: null,
        last_notify_error: null,
      })
      .eq('id', step.id)
      .eq('outcome', 'pending');
    if (error) console.error(`cascade_steps notify update failed for step ${step.id}:`, error.message);

    await logMessage(supabase, {
      booking_id: booking.id,
      anaesthetist_id: step.anaesthetist.id,
      direction: 'outbound',
      message_type: isReschedule ? 'reschedule_request' : 'request',
      body,
      to_phone: step.anaesthetist.phone,
      sent_at: nowIso,
    });
    return true;
  }

  const attempts = (step.notify_attempts || 0) + 1;
  console.error(`sendWhatsApp failed for cascade step ${step.id} (attempt ${attempts}/${MAX_NOTIFY_ATTEMPTS})`);

  if (attempts >= MAX_NOTIFY_ATTEMPTS) {
    const { data: failedStep, error } = await supabase
      .from('cascade_steps')
      .update({
        outcome: 'send_failed',
        responded_at: nowIso,
        notify_attempts: attempts,
        last_notify_error: 'WhatsApp send failed after max attempts',
      })
      .eq('id', step.id)
      .eq('outcome', 'pending')
      .select()
      .maybeSingle();
    if (error) console.error(`cascade_steps send_failed update failed for step ${step.id}:`, error.message);
    if (failedStep) await advanceCascade(supabase, booking);
  } else {
    const { error } = await supabase
      .from('cascade_steps')
      .update({
        notify_attempts: attempts,
        last_notify_error: 'WhatsApp send failed, will retry',
      })
      .eq('id', step.id)
      .eq('outcome', 'pending');
    if (error) console.error(`cascade_steps attempt-count update failed for step ${step.id}:`, error.message);
  }
  return false;
}

// Called whenever a cascade step finalizes as non-pending without an
// acceptance (expired, declined, or send_failed). Moves a sequential cascade
// to the next rank, or checks whether a simultaneous cascade is fully
// exhausted — and if nothing pending remains anywhere, flags the booking
// all_declined and alerts the secretary directly, instead of leaving it to
// only a dashboard badge that nobody may be looking at.
export async function advanceCascade(supabase: any, booking: any): Promise<void> {
  if (booking.cascade_mode === 'sequential') {
    const { data: nextStep } = await supabase
      .from('cascade_steps')
      .select('*, anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)')
      .eq('booking_id', booking.id)
      .eq('outcome', 'pending')
      .order('rank')
      .limit(1)
      .maybeSingle();

    if (nextStep) {
      await notifyStep(supabase, booking, nextStep);
      return;
    }
  } else {
    const { data: remaining } = await supabase
      .from('cascade_steps')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('outcome', 'pending');

    if (remaining && remaining.length > 0) return;
  }

  await markAllDeclined(supabase, booking);
}

export async function markAllDeclined(supabase: any, booking: any): Promise<void> {
  // Only flip bookings that are still actively cascading — never clobber a
  // status that changed for another reason (e.g. cancelled) in the meantime,
  // and the .eq('status', ...) guard also makes this idempotent so a step
  // finalizing twice concurrently can't send the secretary alert twice.
  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ status: 'all_declined' })
    .eq('id', booking.id)
    .eq('status', 'cascade_running')
    .select()
    .maybeSingle();
  if (error) console.error(`bookings all_declined update failed for booking ${booking.id}:`, error.message);
  if (!updated) return;

  if (booking.secretary_phone) {
    const body = buildAllDeclinedAlertBody(booking);
    const sent = await sendWhatsApp(booking.secretary_phone, body);
    if (sent) {
      await logMessage(supabase, {
        booking_id: booking.id,
        direction: 'outbound',
        message_type: 'all_declined_alert',
        body,
        to_phone: booking.secretary_phone,
        sent_at: new Date().toISOString(),
      });
    } else {
      console.error(`Failed to send all_declined alert to secretary for booking ${booking.id}`);
    }
  } else {
    console.error(`Booking ${booking.id} went all_declined but has no secretary_phone to alert`);
  }
}
