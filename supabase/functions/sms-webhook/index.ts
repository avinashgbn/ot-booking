import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sendTwilioSms(to: string, body: string): Promise<boolean> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromPhone) return false;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = btoa(`${accountSid}:${authToken}`);

  const formData = new URLSearchParams();
  formData.append('To', to);
  formData.append('From', fromPhone);
  formData.append('Body', body);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${ampm}`;
}

function anaesthesiaLabel(pref: string): string {
  switch (pref) {
    case 'up_to_anaesthetist': return 'Up to anaesthetist';
    case 'GA': return 'GA';
    case 'regional': return 'Regional';
    case 'sedation': return 'Sedation';
    default: return pref;
  }
}

async function sendConfirmationSms(supabase: any, booking: any, anaesthetist: any): Promise<void> {
  const anaesPrefs = (booking.anaesthesia_preferences || []).map(anaesthesiaLabel).join(', ');
  const body = `Dear Dr ${anaesthetist.full_name},\n\nYou are confirmed for ${booking.patient_initials}'s case — ${booking.procedure} on ${formatDate(booking.surgery_date)} at ${formatTime(booking.surgery_time)} for ${booking.duration_hours} hrs at ${booking.ot_location}.\n\nAnaesthesia: ${anaesPrefs}.\n\nContact ${booking.secretary_phone} if you have any queries.`;

  const sent = await sendTwilioSms(anaesthetist.phone, body);
  if (sent) {
    await supabase.from('sms_log').insert({
      booking_id: booking.id,
      anaesthetist_id: anaesthetist.id,
      direction: 'outbound',
      message_type: 'confirmation',
      body,
      to_phone: anaesthetist.phone,
      sent_at: new Date().toISOString(),
    });
  }
}

async function sendReleaseSms(supabase: any, booking: any, anaesthetist: any): Promise<void> {
  const body = `Hi Dr ${anaesthetist.full_name}, this case (${booking.patient_initials} \u00B7 ${booking.procedure} on ${formatDate(booking.surgery_date)}) has been filled by another anaesthetist. Thank you for your availability.`;
  const sent = await sendTwilioSms(anaesthetist.phone, body);
  if (sent) {
    await supabase.from('sms_log').insert({
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

async function sendInvalidReplySms(supabase: any, booking: any, anaesthetist: any): Promise<void> {
  const body = `Sorry, we did not recognise your reply.\n\nReply 1 to ACCEPT or 2 to DECLINE the case for ${booking.patient_initials} on ${formatDate(booking.surgery_date)}.\n\nYou have time remaining on your window.`;
  const sent = await sendTwilioSms(anaesthetist.phone, body);
  if (sent) {
    await supabase.from('sms_log').insert({
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse Twilio webhook (form-encoded)
    const contentType = req.headers.get('content-type') || '';
    let fromPhone = '';
    let bodyText = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      fromPhone = (formData.get('From') as string) || '';
      bodyText = (formData.get('Body') as string) || '';
    } else {
      const json = await req.json();
      fromPhone = json.From || json.from || '';
      bodyText = json.Body || json.body || '';
    }

    if (!fromPhone || !bodyText) {
      return new Response('<Response/>', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    // Normalise reply: trim, take first char
    const reply = bodyText.trim();
    const firstChar = reply.charAt(0).toLowerCase();

    // Log inbound SMS
    await supabase.from('sms_log').insert({
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
      return new Response('<Response/>', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    // Check for cancelled booking awaiting acknowledgement
    const { data: cancelledBooking } = await supabase
      .from('bookings')
      .select(`
        *,
        confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*)
      `)
      .eq('confirmed_anaesthetist_id', anaesthetist.id)
      .eq('status', 'cancelled')
      .eq('cancel_acknowledged', false)
      .order('cancelled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cancelledBooking && firstChar === '1') {
      // Acknowledge cancellation
      await supabase.from('bookings').update({
        cancel_acknowledged: true,
        cancel_acknowledged_at: new Date().toISOString(),
      }).eq('id', cancelledBooking.id);

      const ackBody = `Thank you Dr ${anaesthetist.full_name}. Cancellation acknowledged and recorded.`;
      const sent = await sendTwilioSms(fromPhone, ackBody);
      if (sent) {
        await supabase.from('sms_log').insert({
          booking_id: cancelledBooking.id,
          anaesthetist_id: anaesthetist.id,
          direction: 'outbound',
          message_type: 'cancellation_ack',
          body: ackBody,
          to_phone: fromPhone,
          sent_at: new Date().toISOString(),
        });
      }

      return new Response('<Response/>', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    // Find active cascade step
    const now = new Date().toISOString();
    const { data: activeStep } = await supabase
      .from('cascade_steps')
      .select(`
        *,
        booking:bookings!cascade_steps_booking_id_fkey(
          *,
          surgeon:users!bookings_surgeon_id_fkey(*)
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
      return new Response('<Response/>', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    const booking = activeStep.booking;

    if (firstChar === '1') {
      // Accept
      await supabase.from('cascade_steps').update({
        outcome: 'accepted',
        responded_at: now,
      }).eq('id', activeStep.id);

      await supabase.from('bookings').update({
        status: 'confirmed',
        confirmed_anaesthetist_id: anaesthetist.id,
        confirmed_at: now,
      }).eq('id', booking.id);

      await sendConfirmationSms(supabase, booking, anaesthetist);

      // If simultaneous, release all other pending steps
      if (booking.cascade_mode === 'simultaneous') {
        const { data: otherSteps } = await supabase
          .from('cascade_steps')
          .select(`
            *,
            anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
          `)
          .eq('booking_id', booking.id)
          .eq('outcome', 'pending')
          .neq('id', activeStep.id);

        if (otherSteps) {
          for (const step of otherSteps) {
            await supabase.from('cascade_steps').update({
              outcome: 'released',
              responded_at: now,
            }).eq('id', step.id);
            await sendReleaseSms(supabase, booking, step.anaesthetist);
          }
        }
      }
    } else if (firstChar === '2') {
      // Decline
      await supabase.from('cascade_steps').update({
        outcome: 'declined',
        responded_at: now,
      }).eq('id', activeStep.id);

      // If sequential, move to next rank
      if (booking.cascade_mode === 'sequential') {
        const { data: nextStep } = await supabase
          .from('cascade_steps')
          .select(`
            *,
            anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
          `)
          .eq('booking_id', booking.id)
          .eq('outcome', 'pending')
          .order('rank')
          .limit(1)
          .maybeSingle();

        if (nextStep) {
          const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          await supabase.from('cascade_steps').update({
            notified_at: now,
            expires_at: expires,
          }).eq('id', nextStep.id);

          // Send case request to next anaesthetist
          const anaesPrefs = (booking.anaesthesia_preferences || []).map(anaesthesiaLabel).join(' or ');
          const reqBody = `You have a case request:\n\nPatient: ${booking.patient_initials}, ${booking.patient_age} yrs\nProcedure: ${booking.procedure}\nDate: ${formatDate(booking.surgery_date)} \u00B7 ${formatTime(booking.surgery_time)} (${booking.duration_hours} hrs)\nLocation: ${booking.ot_location}\nSurgeon: Dr ${booking.surgeon?.full_name || 'Unknown'}\nAnaesthesia: ${anaesPrefs}\n\nReply 1 to ACCEPT\nReply 2 to DECLINE\n\nReply within 5 minutes.`;

          const sent = await sendTwilioSms(nextStep.anaesthetist.phone, reqBody);
          if (sent) {
            await supabase.from('sms_log').insert({
              booking_id: booking.id,
              anaesthetist_id: nextStep.anaesthetist.id,
              direction: 'outbound',
              message_type: 'request',
              body: reqBody,
              to_phone: nextStep.anaesthetist.phone,
              sent_at: now,
            });
          }
        } else {
          // All exhausted
          await supabase.from('bookings').update({ status: 'pending' }).eq('id', booking.id);
        }
      } else {
        // Simultaneous: check if all done
        const { data: remaining } = await supabase
          .from('cascade_steps')
          .select('id')
          .eq('booking_id', booking.id)
          .eq('outcome', 'pending');

        if (!remaining || remaining.length === 0) {
          await supabase.from('bookings').update({ status: 'pending' }).eq('id', booking.id);
        }
      }
    } else {
      // Invalid reply
      await sendInvalidReplySms(supabase, booking, anaesthetist);
    }

    return new Response('<Response/>', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    return new Response('<Response/>', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  }
});
