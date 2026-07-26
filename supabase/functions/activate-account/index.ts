import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { token, full_name, pin } = await req.json();

    if (!token || !full_name || !pin || pin.length !== 4) {
      return new Response(JSON.stringify({ error: 'Invalid activation data' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('invite_token', token)
      .maybeSingle();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user.invite_expires_at && new Date(user.invite_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link has expired' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user.active) {
      return new Response(JSON.stringify({ error: 'Account already active' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pinHash = await hashPin(pin);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        full_name,
        pin_hash: pinHash,
        active: true,
        invite_token: null,
        invite_expires_at: null,
      })
      .eq('id', user.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Activation failed' }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth.users entry so RLS works
    await supabase.auth.admin.createUser({
      id: user.id,
      email: `${user.phone}@ot-booking.local`,
      password: pinHash,
      email_confirm: true,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
