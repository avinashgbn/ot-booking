import { sendWhatsApp, formatDate, createSupabaseClient } from '../_shared/whatsapp.ts';
import {
  notifyStep,
  advanceCascade,
  buildTimeoutReminderBody,
  STALLED_GRACE_MS,
} from '../_shared/cascade.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BOOKING_CASCADE_SELECT = `
  *,
  surgeon:users!bookings_surgeon_id_fkey(*),
  practice:practices!bookings_practice_id_fkey(*, admin:users!practices_admin_user_id_fkey(*))
`;

const STEP_WITH_BOOKING_SELECT = `
  *,
  booking:bookings!cascade_steps_booking_id_fkey(${BOOKING_CASCADE_SELECT}),
  anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
`;

async function startCascade(supabase: any, bookingId: string): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select(BOOKING_CASCADE_SELECT)
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) return;

  // Filtering to 'pending' also lets this function safely re-run after a booking
  // was previously exhausted (all_declined) and new anaesthetists were added.
  const { data: steps } = await supabase
    .from('cascade_steps')
    .select('*, anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)')
    .eq('booking_id', bookingId)
    .eq('outcome', 'pending')
    .order('rank');

  if (!steps || steps.length === 0) return;

  if (booking.cascade_mode === 'sequential') {
    // Only notify the current lowest-rank step; later ranks are notified as
    // earlier ones decline/expire/fail (see advanceCascade).
    await notifyStep(supabase, booking, steps[0]);
  } else {
    // Simultaneous: notify all at once. Each notifyStep call is independent —
    // one failing to send doesn't block or falsely time-start the others.
    for (const step of steps) {
      await notifyStep(supabase, booking, step);
    }
  }
}

// Sweeps three kinds of stuck state, run every 30s by pg_cron:
//  1. Steps whose reply window has expired -> advance the cascade.
//  2. Steps that were never actually notified (client 'start' call failed,
//     or a WhatsApp send failed and is due a retry) -> (re)notify them.
//  3. Steps about to expire -> send a one-time reminder nudge.
// Plus the existing 30-minute unacknowledged-cancellation alert.
async function checkExpirations(supabase: any): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Expired pending steps.
  const { data: expiredSteps } = await supabase
    .from('cascade_steps')
    .select(STEP_WITH_BOOKING_SELECT)
    .eq('outcome', 'pending')
    .not('notified_at', 'is', null)
    .lt('expires_at', nowIso);

  for (const step of expiredSteps || []) {
    const { data: updated, error } = await supabase
      .from('cascade_steps')
      .update({ outcome: 'expired', responded_at: nowIso })
      .eq('id', step.id)
      .eq('outcome', 'pending')
      .select()
      .maybeSingle();
    if (error) {
      console.error(`cascade_steps expire update failed for step ${step.id}:`, error.message);
      continue;
    }
    if (!updated || !step.booking) continue; // already resolved by a concurrent reply
    await advanceCascade(supabase, step.booking);
  }

  // 2) Stalled steps: still pending, never notified, booking still says
  // it's cascading. Covers both "the initial/next-step notify call never
  // reached us" and "sendWhatsApp failed and is due a retry" (see notifyStep).
  const staleBefore = new Date(now.getTime() - STALLED_GRACE_MS).toISOString();
  const { data: stalledSteps } = await supabase
    .from('cascade_steps')
    .select(STEP_WITH_BOOKING_SELECT)
    .eq('outcome', 'pending')
    .is('notified_at', null)
    .lt('created_at', staleBefore)
    .order('rank');

  const handledSequentialBookings = new Set<string>();
  for (const step of stalledSteps || []) {
    if (!step.booking || step.booking.status !== 'cascade_running') continue;

    if (step.booking.cascade_mode === 'sequential') {
      if (handledSequentialBookings.has(step.booking_id)) continue;

      // Only the lowest-rank pending step is "current" for a sequential
      // cascade; skip notifying later ranks out of order.
      const { data: lowestPending } = await supabase
        .from('cascade_steps')
        .select('id')
        .eq('booking_id', step.booking_id)
        .eq('outcome', 'pending')
        .order('rank')
        .limit(1)
        .maybeSingle();

      handledSequentialBookings.add(step.booking_id);
      if (!lowestPending || lowestPending.id !== step.id) continue;
    }

    await notifyStep(supabase, step.booking, step);
  }

  // 3) Pre-expiry nudge, once per step, ~90s before its window closes.
  const nudgeWindowEnd = new Date(now.getTime() + 90 * 1000).toISOString();
  const { data: closingSteps } = await supabase
    .from('cascade_steps')
    .select(STEP_WITH_BOOKING_SELECT)
    .eq('outcome', 'pending')
    .is('nudge_sent_at', null)
    .not('notified_at', 'is', null)
    .lt('expires_at', nudgeWindowEnd)
    .gt('expires_at', nowIso);

  for (const step of closingSteps || []) {
    if (!step.booking || !step.anaesthetist) continue;
    const minutesRemaining = Math.max(
      1,
      Math.round((new Date(step.expires_at).getTime() - now.getTime()) / 60000),
    );
    const body = buildTimeoutReminderBody(step.booking, minutesRemaining);
    const sent = await sendWhatsApp(step.anaesthetist.phone, body);

    const { error } = await supabase
      .from('cascade_steps')
      .update({ nudge_sent_at: nowIso })
      .eq('id', step.id)
      .eq('outcome', 'pending');
    if (error) console.error(`cascade_steps nudge update failed for step ${step.id}:`, error.message);

    if (sent) {
      const { error: logError } = await supabase.from('whatsapp_log').insert({
        booking_id: step.booking_id,
        anaesthetist_id: step.anaesthetist_id,
        direction: 'outbound',
        message_type: 'timeout_reminder',
        body,
        to_phone: step.anaesthetist.phone,
        sent_at: nowIso,
      });
      if (logError) console.error('whatsapp_log insert failed for nudge:', logError.message);
    }
  }

  // 4) Check unacknowledged cancellations (30 min).
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const { data: unackBookings } = await supabase
    .from('bookings')
    .select('*, confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*)')
    .eq('status', 'cancelled')
    .eq('cancel_acknowledged', false)
    .lt('cancelled_at', thirtyMinAgo);

  for (const booking of unackBookings || []) {
    if (booking.confirmed_anaesthetist && booking.secretary_phone) {
      const alertBody = `ALERT: Dr ${booking.confirmed_anaesthetist.full_name} has not acknowledged the cancellation of ${booking.patient_initials} on ${formatDate(booking.surgery_date)}. Please call them directly: ${booking.confirmed_anaesthetist.phone}`;
      const sent = await sendWhatsApp(booking.secretary_phone, alertBody);
      if (!sent) console.error(`Failed to send unacknowledged-cancellation alert for booking ${booking.id}`);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { bookingId, action } = await req.json();
    const supabase = createSupabaseClient();

    if (action === 'start' && bookingId) {
      await startCascade(supabase, bookingId);
      return new Response(JSON.stringify({ success: true, message: 'Cascade started' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'check_expirations') {
      await checkExpirations(supabase);
      return new Response(JSON.stringify({ success: true, message: 'Expirations checked' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error('cascade-engine error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
