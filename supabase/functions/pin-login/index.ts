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
    const { phone, pin } = await req.json();

    if (!phone || !pin) {
      return new Response(JSON.stringify({ error: 'Phone and PIN required' }), {
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
      .eq('phone', phone)
      .eq('active', true)
      .maybeSingle();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pinHash = await hashPin(pin);

    if (user.pin_hash !== pinHash) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sign in as this user using the admin API
    // Create or get an auth.users entry with the same ID
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(user.id);

    let session = null;

    if (authError || !authUser.user) {
      // Create the auth user with the same ID
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        id: user.id,
        email: `${user.phone}@ot-booking.local`,
        password: pinHash,
        email_confirm: true,
      });

      if (createError || !created.user) {
        return new Response(JSON.stringify({ error: 'Authentication setup failed' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: `${user.phone}@ot-booking.local`,
        password: pinHash,
      });

      if (signInError || !signInData.session) {
        return new Response(JSON.stringify({ error: 'Login failed' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      session = signInData.session;
    } else {
      // Update password and sign in
      await supabase.auth.admin.updateUserById(user.id, { password: pinHash });

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: `${user.phone}@ot-booking.local`,
        password: pinHash,
      });

      if (signInError || !signInData.session) {
        return new Response(JSON.stringify({ error: 'Login failed' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      session = signInData.session;
    }

    return new Response(JSON.stringify({ session, user }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
