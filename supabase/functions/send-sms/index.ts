import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APP_URL = Deno.env.get('APP_URL') || 'https://ot-booking.app';

async function sendTwilioSms(to: string, body: string): Promise<boolean> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromPhone) {
    console.error('Twilio credentials not configured');
    return false;
  }

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

    if (!response.ok) {
      const err = await response.text();
      console.error('Twilio error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Twilio fetch error:', err);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { type, token, phone, bookingId, appUrl } = await req.json();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const baseUrl = appUrl || Deno.env.get('APP_URL') || 'https://ot-booking.app';

    if (type === 'invite') {
      // Look up user by token to get name and practice
      const { data: user } = await supabase
        .from('users')
        .select('full_name, role, practice_id, practices!inner(name)')
        .eq('invite_token', token)
        .maybeSingle();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const practiceName = (user as any).practices?.name || 'your practice';
      const roleLabel = user.role === 'surgeon' ? 'Surgeon' : user.role === 'secretary' ? 'Secretary' : user.role;
      const inviteLink = `${baseUrl}/join/${token}`;

      const body = `Hi ${user.full_name}, you have been added to ${practiceName} on OT Booking as a ${roleLabel}.\n\nTap to confirm your details and activate your account:\n${inviteLink}\n\nValid for 72 hours. Do not share this link.`;

      const sent = await sendTwilioSms(phone, body);

      if (sent) {
        await supabase.from('sms_log').insert({
          direction: 'outbound',
          message_type: 'request',
          body,
          to_phone: phone,
          sent_at: new Date().toISOString(),
        });
      }

      return new Response(JSON.stringify({ success: sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === 'confirmation' && bookingId) {
      const { data: booking } = await supabase
        .from('bookings')
        .select(`
          *,
          confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*)
        `)
        .eq('id', bookingId)
        .maybeSingle();

      if (!booking || !booking.confirmed_anaesthetist) {
        return new Response(JSON.stringify({ error: 'No confirmed anaesthetist' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anaesPrefs = (booking.anaesthesia_preferences || []).map(anaesthesiaLabel).join(', ');
      const body = `Dear Dr ${booking.confirmed_anaesthetist.full_name},\n\nYou are confirmed for ${booking.patient_initials}'s case — ${booking.procedure} on ${formatDate(booking.surgery_date)} at ${formatTime(booking.surgery_time)} for ${booking.duration_hours} hrs at ${booking.ot_location}.\n\nAnaesthesia: ${anaesPrefs}.\n\nContact ${booking.secretary_phone} if you have any queries.`;

      const sent = await sendTwilioSms(booking.confirmed_anaesthetist.phone, body);

      if (sent) {
        await supabase.from('sms_log').insert({
          booking_id: bookingId,
          anaesthetist_id: booking.confirmed_anaesthetist.id,
          direction: 'outbound',
          message_type: 'confirmation',
          body,
          to_phone: booking.confirmed_anaesthetist.phone,
          sent_at: new Date().toISOString(),
        });
      }

      return new Response(JSON.stringify({ success: sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === 'cancellation' && bookingId) {
      const { data: booking } = await supabase
        .from('bookings')
        .select(`
          *,
          confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*),
          surgeon:users!bookings_surgeon_id_fkey(*)
        `)
        .eq('id', bookingId)
        .maybeSingle();

      if (!booking) {
        return new Response(JSON.stringify({ error: 'Booking not found' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let success = true;

      // Send to confirmed anaesthetist
      if (booking.confirmed_anaesthetist) {
        const anaesBody = `\u26A0\uFE0F CASE CANCELLED\n\nDear Dr ${booking.confirmed_anaesthetist.full_name},\n\nThe following confirmed case has been cancelled:\n\nPatient: ${booking.patient_initials}, ${booking.patient_age} yrs\nProcedure: ${booking.procedure}\nDate: ${formatDate(booking.surgery_date)} \u00B7 ${formatTime(booking.surgery_time)}\nLocation: ${booking.ot_location}\n\nReason: ${booking.cancel_reason}\n\nWe apologise for the inconvenience. For queries contact ${booking.secretary_phone}.\n\nReply 1 to acknowledge this cancellation.`;

        const sent = await sendTwilioSms(booking.confirmed_anaesthetist.phone, anaesBody);
        if (!sent) success = false;

        if (sent) {
          await supabase.from('sms_log').insert({
            booking_id: bookingId,
            anaesthetist_id: booking.confirmed_anaesthetist.id,
            direction: 'outbound',
            message_type: 'cancellation',
            body: anaesBody,
            to_phone: booking.confirmed_anaesthetist.phone,
            sent_at: new Date().toISOString(),
          });
        }
      }

      // Send to surgeon
      if (booking.surgeon) {
        const surgeonBody = `\u26A0\uFE0F CASE CANCELLED\n\nDear Dr ${booking.surgeon.full_name},\n\nThe following case has been cancelled:\n\nPatient: ${booking.patient_initials}, ${booking.patient_age} yrs\nProcedure: ${booking.procedure}\nDate: ${formatDate(booking.surgery_date)} \u00B7 ${formatTime(booking.surgery_time)}\nLocation: ${booking.ot_location}\n\nReason: ${booking.cancel_reason}\n\n${booking.confirmed_anaesthetist ? booking.confirmed_anaesthetist.full_name + ' has been notified. ' : ''}Please contact your secretary for further information.`;

        const sent = await sendTwilioSms(booking.surgeon.phone, surgeonBody);
        if (!sent) success = false;

        if (sent) {
          await supabase.from('sms_log').insert({
            booking_id: bookingId,
            direction: 'outbound',
            message_type: 'cancellation',
            body: surgeonBody,
            to_phone: booking.surgeon.phone,
            sent_at: new Date().toISOString(),
          });
        }
      }

      // Release SMS to any pending cascade steps
      const { data: pendingSteps } = await supabase
        .from('cascade_steps')
        .select(`
          *,
          anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
        `)
        .eq('booking_id', bookingId)
        .eq('outcome', 'pending');

      if (pendingSteps) {
        for (const step of pendingSteps) {
          const releaseBody = `Hi Dr ${step.anaesthetist?.full_name}, this case (${booking.patient_initials} \u00B7 ${booking.procedure} on ${formatDate(booking.surgery_date)}) has been cancelled. Thank you for your availability.`;
          const sent = await sendTwilioSms(step.anaesthetist?.phone || '', releaseBody);
          if (sent) {
            await supabase.from('cascade_steps').update({ outcome: 'released' }).eq('id', step.id);
            await supabase.from('sms_log').insert({
              booking_id: bookingId,
              anaesthetist_id: step.anaesthetist_id,
              direction: 'outbound',
              message_type: 'release',
              body: releaseBody,
              to_phone: step.anaesthetist?.phone,
              sent_at: new Date().toISOString(),
            });
          }
        }
      }

      return new Response(JSON.stringify({ success }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown SMS type' }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
