/*
# Close public read access and fix the cascade cron job

## Overview
Two production faults found in the 2026-10-07 audit, neither of which was
represented in this migration history:

1. The live database carried seven hand-added SELECT policies for the
   `public` role with USING (true) — allow_read_users, allow_read_bookings,
   allow_read_cascade, allow_read_sms_log (on whatsapp_log),
   allow_read_anaesthetists, allow_read_prefs and allow_read_practices.
   Postgres ORs permissive policies together, so these overrode every
   practice-scoped policy and let anyone holding the anon key (which ships
   in the frontend bundle) read all patients, phone numbers, invite tokens
   and PIN hashes. They are dropped here; the authenticated, practice-scoped
   policies from earlier migrations remain and already cover every signed-in
   read the app makes.

2. The only legitimate anonymous read was JoinPage looking up an invitee by
   invite token. That moves to get_invite(), a SECURITY DEFINER function
   that returns just the fields the join screen shows, and only for an
   exact token match.

3. The cascade-expiration-check cron job (re-provisioned in
   20260916120000_cascade_hardening.sql) called
   http_post(url, body, content_type, http_header[]) — a signature the
   `http` extension does not have — so every run since has failed and no
   cascade timeout, retry, reminder or alert has fired. It is rescheduled
   here using http() with an http_request, which does accept headers.

## Notes
The Authorization header carries the project's public anon key (the same
one the frontend ships); cascade-engine is deployed with verify_jwt on, and
the anon key satisfies that. Restricting who may call cascade-engine is a
separate task.
*/

-- 1. Drop the public read-everything policies.
DROP POLICY IF EXISTS "allow_read_users" ON users;
DROP POLICY IF EXISTS "allow_read_bookings" ON bookings;
DROP POLICY IF EXISTS "allow_read_cascade" ON cascade_steps;
DROP POLICY IF EXISTS "allow_read_sms_log" ON whatsapp_log;
DROP POLICY IF EXISTS "allow_read_anaesthetists" ON anaesthetists;
DROP POLICY IF EXISTS "allow_read_prefs" ON anaesthetist_preferences;
DROP POLICY IF EXISTS "allow_read_practices" ON practices;

-- 2. Narrow invite lookup for the (signed-out) join screen.
CREATE OR REPLACE FUNCTION public.get_invite(p_token text)
RETURNS TABLE (
  full_name text,
  phone text,
  role text,
  active boolean,
  invite_expires_at timestamptz,
  practice_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.full_name, u.phone, u.role, u.active, u.invite_expires_at, p.name
  FROM users u
  LEFT JOIN practices p ON p.id = u.practice_id
  WHERE p_token IS NOT NULL
    AND length(p_token) >= 32
    AND u.invite_token = p_token;
$$;

REVOKE ALL ON FUNCTION public.get_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite(text) TO anon, authenticated;

-- 3. Reschedule the cascade sweep with a call the http extension supports.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cascade-expiration-check') THEN
    PERFORM cron.unschedule('cascade-expiration-check');
  END IF;

  PERFORM cron.schedule(
    'cascade-expiration-check',
    '30 seconds',
    $cron$
      SELECT status FROM http((
        'POST',
        'https://iyvpnnmirbcjadtoptxo.supabase.co/functions/v1/cascade-engine',
        ARRAY[http_header('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5dnBubm1pcmJjamFkdG9wdHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDIxMDIsImV4cCI6MjEwMDYxODEwMn0.7tvnmlN972HZOpSAFETQknVb5uZG1VLPxS-Q4IBrl5U')],
        'application/json',
        '{"action":"check_expirations"}'
      )::http_request);
    $cron$
  );
END $$;
