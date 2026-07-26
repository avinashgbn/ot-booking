import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const { phone, full_name } = await req.json();

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone required' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('id, practice_id, role')
      .eq('id', authUser.id)
      .maybeSingle();

    if (callerError || !caller || !caller.practice_id || !['practice_admin', 'secretary'].includes(caller.role)) {
      return new Response(JSON.stringify({ error: 'Not authorized to add surgeons' }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const practiceId = caller.practice_id;

    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      if (existing.role !== 'surgeon') {
        return new Response(JSON.stringify({ error: 'Phone already registered to a different role' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (existing.practice_id === practiceId) {
        return new Response(JSON.stringify({ error: 'Already part of this practice' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingLink } = await supabase
        .from('practice_surgeons')
        .select('id')
        .eq('practice_id', practiceId)
        .eq('surgeon_id', existing.id)
        .maybeSingle();

      if (existingLink) {
        return new Response(JSON.stringify({ error: 'Already linked to this practice' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: linkError } = await supabase
        .from('practice_surgeons')
        .insert({ practice_id: practiceId, surgeon_id: existing.id });

      if (linkError) {
        return new Response(JSON.stringify({ error: 'Failed to link surgeon' }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, linked: true, surgeon: existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!full_name || !full_name.trim()) {
      return new Response(JSON.stringify({ error: 'Full name required' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { data: created, error: createError } = await supabase
      .from('users')
      .insert({
        practice_id: practiceId,
        full_name: full_name.trim(),
        phone,
        role: 'surgeon',
        invite_token: token,
        invite_expires_at: expiresAt,
        active: false,
      })
      .select()
      .single();

    if (createError || !created) {
      return new Response(JSON.stringify({ error: 'Failed to add surgeon' }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, linked: false, surgeon: created, token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
