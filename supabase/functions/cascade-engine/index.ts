import { sendWhatsApp, formatDate, buildCaseRequestBody, createSupabaseClient } from '../_shared/whatsapp.ts';

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

async function sendCaseRequest(supabase: any, booking: any, anaesthetist: any, windowMinutes: number): Promise<void> {
  const body = buildCaseRequestBody(booking, windowMinutes);

  const sent = await sendWhatsApp(anaesthetist.phone, body);

  if (sent) {
    await supabase.from('sms_log').insert({
      booking_id: booking.id,
      anaesthetist_id: anaesthetist.id,
      direction: 'outbound',
      message_type: 'request',
      body,
      to_phone: anaesthetist.phone,
      sent_at: new Date().toISOString(),
    });
  }
}

async function startCascade(supabase: any, bookingId: string): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select(BOOKING_CASCADE_SELECT)
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) return;

  const { data: steps } = await supabase
    .from('cascade_steps')
    .select(`
      *,
      anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
    `)
    .eq('booking_id', bookingId)
    .order('rank');

  if (!steps || steps.length === 0) return;

  if (booking.cascade_mode === 'sequential') {
    // Start with rank 1
    const firstStep = steps[0];
    const now = new Date();
    const expires = new Date(now.getTime() + 5 * 60 * 1000);

    await supabase.from('cascade_steps').update({
      notified_at: now.toISOString(),
      expires_at: expires.toISOString(),
    }).eq('id', firstStep.id);

    await sendCaseRequest(supabase, booking, firstStep.anaesthetist, 5);
  } else {
    // Simultaneous: notify all at once
    const now = new Date();
    const expires = new Date(now.getTime() + 8 * 60 * 1000);

    for (const step of steps) {
      await supabase.from('cascade_steps').update({
        notified_at: now.toISOString(),
        expires_at: expires.toISOString(),
      }).eq('id', step.id);

      await sendCaseRequest(supabase, booking, step.anaesthetist, 8);
    }
  }
}

async function checkExpirations(supabase: any): Promise<void> {
  const now = new Date().toISOString();

  // Find expired pending steps
  const { data: expiredSteps } = await supabase
    .from('cascade_steps')
    .select(`
      *,
      booking:bookings!cascade_steps_booking_id_fkey(${BOOKING_CASCADE_SELECT}),
      anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
    `)
    .eq('outcome', 'pending')
    .lt('expires_at', now);

  if (!expiredSteps) return;

  for (const step of expiredSteps) {
    // Mark as expired
    await supabase.from('cascade_steps').update({
      outcome: 'expired',
      responded_at: now,
    }).eq('id', step.id);

    if (step.booking.cascade_mode === 'sequential') {
      // Move to next rank
      const { data: nextStep } = await supabase
        .from('cascade_steps')
        .select(`
          *,
          anaesthetist:anaesthetists!cascade_steps_anaesthetist_id_fkey(*)
        `)
        .eq('booking_id', step.booking_id)
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

        await sendCaseRequest(supabase, step.booking, nextStep.anaesthetist, 5);
      } else {
        // All exhausted, set booking back to pending
        await supabase.from('bookings').update({ status: 'pending' }).eq('id', step.booking_id);
      }
    } else {
      // Simultaneous: check if all are done
      const { data: remaining } = await supabase
        .from('cascade_steps')
        .select('id')
        .eq('booking_id', step.booking_id)
        .eq('outcome', 'pending');

      if (!remaining || remaining.length === 0) {
        await supabase.from('bookings').update({ status: 'pending' }).eq('id', step.booking_id);
      }
    }
  }

  // Check unacknowledged cancellations (30 min)
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: unackBookings } = await supabase
    .from('bookings')
    .select(`
      *,
      confirmed_anaesthetist:anaesthetists!bookings_confirmed_anaesthetist_id_fkey(*)
    `)
    .eq('status', 'cancelled')
    .eq('cancel_acknowledged', false)
    .lt('cancelled_at', thirtyMinAgo);

  if (unackBookings) {
    for (const booking of unackBookings) {
      if (booking.confirmed_anaesthetist && booking.secretary_phone) {
        const alertBody = `ALERT: Dr ${booking.confirmed_anaesthetist.full_name} has not acknowledged the cancellation of ${booking.patient_initials} on ${formatDate(booking.surgery_date)}. Please call them directly: ${booking.confirmed_anaesthetist.phone}`;
        await sendWhatsApp(booking.secretary_phone, alertBody);
      }
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
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
