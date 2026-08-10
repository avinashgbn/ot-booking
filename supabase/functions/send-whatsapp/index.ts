import { sendWhatsApp, formatDate, formatTime, anaesthesiaLabel, createSupabaseClient } from '../_shared/whatsapp.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { type, token, phone, bookingId, appUrl } = await req.json();
    const supabase = createSupabaseClient();
    const baseUrl = appUrl || Deno.env.get('APP_URL') || 'https://ot-booking.app';

    if (type === 'invite') {
      // Look up user by token to get name and practice
      const { data: user } = await supabase
        .from('users')
        .select('full_name, role, practice_id, practices!users_practice_id_fkey!inner(name)')
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

      const sent = await sendWhatsApp(phone, body);

      if (sent) {
        await supabase.from('whatsapp_log').insert({
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
          confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*),
          surgeon:users!bookings_surgeon_id_fkey(*)
        `)
        .eq('id', bookingId)
        .maybeSingle();

      if (!booking || !booking.confirmed_anaesthetist) {
        return new Response(JSON.stringify({ error: 'No confirmed anaesthetist' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anaesPrefs = (booking.anaesthesia_preferences || []).map(anaesthesiaLabel).join(', ');
      const body = `Dear Dr ${booking.confirmed_anaesthetist.full_name},\n\nYou are confirmed for the following case:\n\nPatient: ${booking.patient_initials}, ${booking.patient_age} yrs\nProcedure: ${booking.procedure}\nSurgeon: Dr ${booking.surgeon?.full_name || 'Unknown'}\nHospital/Clinic: ${booking.hospital_clinic || 'Unknown'}\nLocation: ${booking.ot_location}\nDate: ${formatDate(booking.surgery_date)}\nTime: ${formatTime(booking.surgery_time)}\nDuration: ${booking.duration_hours} hrs\nAnaesthesia: ${anaesPrefs}\n\nContact ${booking.secretary_phone} if you have any queries.`;

      const sent = await sendWhatsApp(booking.confirmed_anaesthetist.phone, body);

      if (sent) {
        await supabase.from('whatsapp_log').insert({
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
        const anaesBody = `ALERT: CASE CANCELLED\n\nDear Dr ${booking.confirmed_anaesthetist.full_name},\n\nThe following confirmed case has been cancelled:\n\nPatient: ${booking.patient_initials}, ${booking.patient_age} yrs\nProcedure: ${booking.procedure}\nSurgeon: Dr ${booking.surgeon?.full_name || 'Unknown'}\nDate: ${formatDate(booking.surgery_date)}\nTime: ${formatTime(booking.surgery_time)}\nLocation: ${booking.ot_location}\n\nReason: ${booking.cancel_reason}\n\nWe apologise for the inconvenience. For queries contact ${booking.secretary_phone}.\n\nReply 1 to acknowledge this cancellation.`;

        const sent = await sendWhatsApp(booking.confirmed_anaesthetist.phone, anaesBody);
        if (!sent) success = false;

        if (sent) {
          await supabase.from('whatsapp_log').insert({
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
        const surgeonBody = `ALERT: CASE CANCELLED\n\nDear Dr ${booking.surgeon.full_name},\n\nThe following case has been cancelled:\n\nPatient: ${booking.patient_initials}, ${booking.patient_age} yrs\nProcedure: ${booking.procedure}\nDate: ${formatDate(booking.surgery_date)} - ${formatTime(booking.surgery_time)}\nLocation: ${booking.ot_location}\n\nReason: ${booking.cancel_reason}\n\n${booking.confirmed_anaesthetist ? booking.confirmed_anaesthetist.full_name + ' has been notified. ' : ''}Please contact your secretary for further information.`;

        const sent = await sendWhatsApp(booking.surgeon.phone, surgeonBody);
        if (!sent) success = false;

        if (sent) {
          await supabase.from('whatsapp_log').insert({
            booking_id: bookingId,
            direction: 'outbound',
            message_type: 'cancellation',
            body: surgeonBody,
            to_phone: booking.surgeon.phone,
            sent_at: new Date().toISOString(),
          });
        }
      }

      // Release WhatsApp message to any pending cascade steps
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
          const releaseBody = `Hi Dr ${step.anaesthetist?.full_name}, this case (${booking.patient_initials} - ${booking.procedure} on ${formatDate(booking.surgery_date)}) has been cancelled. Thank you for your availability.`;
          const sent = await sendWhatsApp(step.anaesthetist?.phone || '', releaseBody);
          if (sent) {
            await supabase.from('cascade_steps').update({ outcome: 'released' }).eq('id', step.id);
            await supabase.from('whatsapp_log').insert({
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

    if (type === 'reschedule' && bookingId) {
      // Booking row already reflects the NEW date/time/location by the time the
      // client calls this (the bookings UPDATE runs before this fetch).
      const { data: booking } = await supabase
        .from('bookings')
        .select(`
          *,
          surgeon:users!bookings_surgeon_id_fkey(*)
        `)
        .eq('id', bookingId)
        .maybeSingle();

      if (!booking || !booking.surgeon) {
        return new Response(JSON.stringify({ error: 'Booking or surgeon not found' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rDate = booking.previous_surgery_date
        ? `${formatDate(booking.previous_surgery_date)} -> ${formatDate(booking.surgery_date)}`
        : formatDate(booking.surgery_date);
      const rTime = booking.previous_surgery_time
        ? `${formatTime(booking.previous_surgery_time)} -> ${formatTime(booking.surgery_time)}`
        : formatTime(booking.surgery_time);
      const rHospital = booking.previous_hospital_clinic
        ? `${booking.previous_hospital_clinic} -> ${booking.hospital_clinic || 'Unknown'}`
        : (booking.hospital_clinic || 'Unknown');
      const rLocation = booking.previous_ot_location
        ? `${booking.previous_ot_location} -> ${booking.ot_location}`
        : booking.ot_location;

      const surgeonBody = `ALERT: CASE RESCHEDULED\n\nDear Dr ${booking.surgeon.full_name},\n\nThe following case has been rescheduled (previous -> new):\n\nPatient: ${booking.patient_initials}, ${booking.patient_age} yrs\nProcedure: ${booking.procedure}\n\nDate: ${rDate}\nTime: ${rTime}\nHospital/Clinic: ${rHospital}\nLocation: ${rLocation}\n\nWe are contacting anaesthetists for the new date/time. You will be notified once confirmed.\n\nFor queries contact ${booking.secretary_phone}.`;

      const sent = await sendWhatsApp(booking.surgeon.phone, surgeonBody);

      if (sent) {
        await supabase.from('whatsapp_log').insert({
          booking_id: bookingId,
          direction: 'outbound',
          message_type: 'reschedule',
          body: surgeonBody,
          to_phone: booking.surgeon.phone,
          sent_at: new Date().toISOString(),
        });
      }

      return new Response(JSON.stringify({ success: sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown WhatsApp message type' }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
