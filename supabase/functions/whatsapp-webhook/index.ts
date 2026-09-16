import {
  sendWhatsApp,
  formatDate,
  anaesthesiaLabel,
  createSupabaseClient,
  stripWhatsAppPrefix,
  verifyTwilioSignature,
} from '../_shared/whatsapp.ts';
import { advanceCascade, buildAlreadyFilledBody } from '../_shared/cascade.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function logMessage(supabase: any, row: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('whatsapp_log').insert(row);
  if (error) console.error('whatsapp_log insert failed:', error.message, row);
}

async function sendConfirmationWhatsApp(supabase: any, booking: any, anaesthetist: any): Promise<void> {
  const anaesPrefs = (booking.anaesthesia_preferences || []).map(anaesthesiaLabel).join(', ');
  const body = `Dear Dr ${anaesthetist.full_name},\n\nYou are confirmed for the following case:\n\nPatient: ${booking.patient_initials}, ${booking.patient_age} yrs\nProcedure: ${booking.procedure}\nSurgeon: Dr ${booking.surgeon?.full_name || 'Unknown'}\nHospital/Clinic: ${booking.hospital_clinic || 'Unknown'}\nLocation: ${booking.ot_location}\nDate: ${formatDate(booking.surgery_date)}\nTime: ${formatTime(booking.surgery_time)}\nDuration: ${booking.duration_hours} hrs\nAnaesthesia: ${anaesPrefs}\n\nContact ${booking.secretary_phone} if you have any queries.`;

  const sent = await sendWhatsApp(anaesthetist.phone, body);
  if (sent) {
    await logMessage(supabase, {
      booking_id: booking.id,
      anaesthetist_id: anaesthetist.id,
      direction: 'outbound',
      message_type: 'confirmation',
      body,
      to_phone: anaesthetist.phone,
      sent_at: new Date().toISOString(),
    });
  } else {
    console.error(`Failed to send confirmation WhatsApp to anaesthetist ${anaesthetist.id} for booking ${booking.id}`);
  }
}

async function sendReleaseWhatsApp(supabase: any, booking: any, anaesthetist: any): Promise<void> {
  const body = `Hi Dr ${anaesthetist.full_name}, this case (${booking.patient_initials} - ${booking.procedure} on ${formatDate(booking.surgery_date)}) has been filled by another anaesthetist. Thank you for your availability.`;
  const sent = await sendWhatsApp(anaesthetist.phone, body);
  if (sent) {
    await logMessage(supabase, {
      booking_id: booking.id,
      anaesthetist_id: anaesthetist.id,
      direction: 'outbound',
      message_type: 'release',
      body,
      to_phone: anaesthetist.phone,
      sent_at: new Date().toISOString(),
    });
  }
}

async function sendInvalidReplyWhatsApp(supabase: any, booking: any, anaesthetist: any): Promise<void> {
  const body = `Sorry, we did not recognise your reply.\n\nReply 1 to ACCEPT or 2 to DECLINE the case for ${booking.patient_initials} on ${formatDate(booking.surgery_date)}.\n\nYou have time remaining on your window.`;
  const sent = await sendWhatsApp(anaesthetist.phone, body);
  if (sent) {
    await logMessage(supabase, {
      booking_id: booking.id,
      anaesthetist_id: anaesthetist.id,
      direction: 'outbound',
      message_type: 'invalid_reply',
      body,
      to_phone: anaesthetist.phone,
      sent_at: new Date().toISOString(),
    });
  }
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${ampm}`;
}

const EMPTY_TWIML = new Response('<Response/>', {
  status: 200,
  headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // Twilio always posts webhooks as application/x-www-form-urlencoded and
    // signs exactly that payload — reject anything else outright rather than
    // accepting an unsigned JSON body as a bypass.
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return new Response('Unsupported content type', { status: 400, headers: corsHeaders });
    }

    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value.toString();
    }

    const signature = req.headers.get('X-Twilio-Signature') || '';
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`;

    const validSignature = await verifyTwilioSignature(authToken, webhookUrl, params, signature);
    if (!validSignature) {
      console.error('Rejected whatsapp-webhook request: invalid or missing X-Twilio-Signature');
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    let fromPhone = params['From'] || '';
    const bodyText = params['Body'] || '';

    // Twilio prefixes WhatsApp addresses with "whatsapp:"; stored phone numbers are plain E.164
    fromPhone = stripWhatsAppPrefix(fromPhone);

    if (!fromPhone || !bodyText) {
      return EMPTY_TWIML;
    }

    // Normalise reply: trim, take first char
    const reply = bodyText.trim();
    const firstChar = reply.charAt(0).toLowerCase();

    // Log inbound WhatsApp message
    await logMessage(supabase, {
      direction: 'inbound',
      body: bodyText,
      from_phone: fromPhone,
      sent_at: new Date().toISOString(),
    });

    // Find the most recent active cascade step for this phone
    const { data: anaesthetist } = await supabase
      .from('anaesthetists')
      .select('*')
      .eq('phone', fromPhone)
      .maybeSingle();

    if (!anaesthetist) {
      return EMPTY_TWIML;
    }

    // Check for cancelled booking awaiting acknowledgement
    const { data: cancelledBooking } = await supabase
      .from('bookings')
      .select('*, confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*)')
      .eq('confirmed_anaesthetist_id', anaesthetist.id)
      .eq('status', 'cancelled')
      .eq('cancel_acknowledged', false)
      .order('cancelled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cancelledBooking && firstChar === '1') {
      const { data: acked, error } = await supabase
        .from('bookings')
        .update({ cancel_acknowledged: true, cancel_acknowledged_at: new Date().toISOString() })
        .eq('id', cancelledBooking.id)
        .eq('cancel_acknowledged', false)
        .select()
        .maybeSingle();
      if (error) console.error(`Failed to acknowledge cancellation for booking ${cancelledBooking.id}:`, error.message);

      if (acked) {
        const ackBody = `Thank you Dr ${anaesthetist.full_name}. Cancellation acknowledged and recorded.`;
        const sent = await sendWhatsApp(fromPhone, ackBody);
        if (sent) {
          await logMessage(supabase, {
            booking_id: cancelledBooking.id,
            anaesthetist_id: anaesthetist.id,
            direction: 'outbound',
            message_type: 'cancellation_ack',
            body: ackBody,
            to_phone: fromPhone,
            sent_at: new Date().toISOString(),
          });
        }
      }

      return EMPTY_TWIML;
    }

    // Find active cascade step
    const now = new Date().toISOString();
    const { data: activeStep } = await supabase
      .from('cascade_steps')
      .select(`
        *,
        booking:bookings!cascade_steps_booking_id_fkey(
          *,
          surgeon:users!bookings_surgeon_id_fkey(*),
          practice:practices!bookings_practice_id_fkey(*, admin:users!practices_admin_user_id_fkey(*))
        ),
        anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
      `)
      .eq('anaesthetist_id', anaesthetist.id)
      .eq('outcome', 'pending')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeStep) {
      return EMPTY_TWIML;
    }

    const booking = activeStep.booking;

    if (firstChar === '1') {
      // Accept — conditional update guards against this step having already
      // expired/been released concurrently. The unique index on
      // cascade_steps(booking_id) WHERE outcome='accepted' is the real
      // backstop against two anaesthetists both accepting the same
      // simultaneous-mode booking in the same instant: if another step for
      // this booking wins the race, this update violates that index instead
      // of silently succeeding, and we tell this doctor the case is taken
      // rather than falsely confirming both.
      const { data: acceptedStep, error: acceptError } = await supabase
        .from('cascade_steps')
        .update({ outcome: 'accepted', responded_at: now })
        .eq('id', activeStep.id)
        .eq('outcome', 'pending')
        .select()
        .maybeSingle();

      if (acceptError) {
        if (acceptError.code === '23505') {
          const sent = await sendWhatsApp(fromPhone, buildAlreadyFilledBody(booking, anaesthetist.full_name));
          if (sent) {
            await logMessage(supabase, {
              booking_id: booking.id,
              anaesthetist_id: anaesthetist.id,
              direction: 'outbound',
              message_type: 'already_filled',
              body: buildAlreadyFilledBody(booking, anaesthetist.full_name),
              to_phone: fromPhone,
              sent_at: now,
            });
          }
        } else {
          console.error(`cascade_steps accept update failed for step ${activeStep.id}:`, acceptError.message);
        }
        return EMPTY_TWIML;
      }

      if (!acceptedStep) {
        // Step was no longer pending (expired or already handled elsewhere).
        return EMPTY_TWIML;
      }

      const { error: confirmError } = await supabase
        .from('bookings')
        .update({ status: 'confirmed', confirmed_anaesthetist_id: anaesthetist.id, confirmed_at: now })
        .eq('id', booking.id);
      if (confirmError) console.error(`bookings confirm update failed for booking ${booking.id}:`, confirmError.message);

      await sendConfirmationWhatsApp(supabase, booking, anaesthetist);

      // If simultaneous, release all other pending steps.
      if (booking.cascade_mode === 'simultaneous') {
        const { data: otherSteps } = await supabase
          .from('cascade_steps')
          .select('*, anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)')
          .eq('booking_id', booking.id)
          .eq('outcome', 'pending')
          .neq('id', activeStep.id);

        for (const step of otherSteps || []) {
          const { data: released, error } = await supabase
            .from('cascade_steps')
            .update({ outcome: 'released', responded_at: now })
            .eq('id', step.id)
            .eq('outcome', 'pending')
            .select()
            .maybeSingle();
          if (error) console.error(`cascade_steps release update failed for step ${step.id}:`, error.message);
          if (released) await sendReleaseWhatsApp(supabase, booking, step.anaesthetist);
        }
      }
    } else if (firstChar === '2') {
      // Decline
      const { data: declinedStep, error } = await supabase
        .from('cascade_steps')
        .update({ outcome: 'declined', responded_at: now })
        .eq('id', activeStep.id)
        .eq('outcome', 'pending')
        .select()
        .maybeSingle();
      if (error) console.error(`cascade_steps decline update failed for step ${activeStep.id}:`, error.message);
      if (declinedStep) await advanceCascade(supabase, booking);
    } else {
      // Invalid reply
      await sendInvalidReplyWhatsApp(supabase, booking, anaesthetist);
    }

    return EMPTY_TWIML;
  } catch (err) {
    console.error('whatsapp-webhook error:', err);
    // Still return 200 to Twilio: a non-2xx triggers Twilio retries, and
    // without an idempotency key a retried reply could be double-processed
    // (e.g. double-advancing the cascade). Logging above is what makes this
    // failure visible instead of silent.
    return EMPTY_TWIML;
  }
});
