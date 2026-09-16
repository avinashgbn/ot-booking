/*
# Cascade hardening

## Overview
Fixes found in a code audit of the anaesthetist booking cascade:

1. The pg_cron job that drives cascade timeouts was provisioned (in
   20260725164117_setup_pg_cron.sql) against a stale placeholder Supabase
   project URL with no auth header — never matching this project. The
   live database had since been hand-patched to the correct URL/token, but
   the migration history didn't reflect that, so replaying migrations on
   any fresh environment (disaster recovery, staging, a new project) would
   silently install a non-functional escalation timer. This re-provisions
   the job idempotently with the correct URL and an Authorization header.

2. Adds columns cascade-engine needs to retry failed WhatsApp sends instead
   of silently starting the reply-timeout clock on a message nobody
   received, and to send a one-time pre-expiry reminder.

3. Widens cascade_steps.outcome to allow 'send_failed', for a step that
   exhausted its send retries.

4. Adds a unique partial index enforcing at most one 'accepted' cascade
   step per booking — the hard backstop against two anaesthetists both
   accepting a simultaneous-mode cascade in the same instant.

5. Widens whatsapp_log.message_type for the new message types this
   hardening pass sends (timeout reminder, all-declined alert to the
   secretary, and "already filled" to a doctor who loses the accept race).

## Notes
No destructive changes; all ALTERs are additive or widen existing checks.
*/

-- 1. Re-provision the cascade-expiration-check cron job against the correct
-- project URL with a valid Authorization header. Safe to run even though the
-- live job was already hand-corrected: unschedule-then-reschedule with the
-- same definition is a no-op in effect.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cascade-expiration-check') THEN
    PERFORM cron.unschedule('cascade-expiration-check');
  END IF;

  PERFORM cron.schedule(
    'cascade-expiration-check',
    '30 seconds',
    $cron$
      SELECT content::text FROM http_post(
        'https://iyvpnnmirbcjadtoptxo.supabase.co/functions/v1/cascade-engine',
        '{"action":"check_expirations"}',
        'application/json',
        ARRAY[http_header('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5dnBubm1pcmJjamFkdG9wdHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDIxMDIsImV4cCI6MjEwMDYxODEwMn0.7tvnmlN972HZOpSAFETQknVb5uZG1VLPxS-Q4IBrl5U')]
      );
    $cron$
  );
END $$;

-- 2. Retry / nudge bookkeeping on cascade_steps.
ALTER TABLE cascade_steps ADD COLUMN IF NOT EXISTS notify_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE cascade_steps ADD COLUMN IF NOT EXISTS last_notify_error text;
ALTER TABLE cascade_steps ADD COLUMN IF NOT EXISTS nudge_sent_at timestamptz;

-- 3. Allow 'send_failed' as a terminal outcome.
ALTER TABLE cascade_steps DROP CONSTRAINT IF EXISTS cascade_steps_outcome_check;
ALTER TABLE cascade_steps ADD CONSTRAINT cascade_steps_outcome_check
  CHECK (outcome IN ('pending','accepted','declined','expired','released','send_failed'));

-- 4. At most one accepted cascade step per booking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cascade_steps_one_accepted_per_booking
  ON cascade_steps(booking_id) WHERE outcome = 'accepted';

-- 5. New outbound message types.
ALTER TABLE whatsapp_log DROP CONSTRAINT IF EXISTS whatsapp_log_message_type_check;
ALTER TABLE whatsapp_log ADD CONSTRAINT whatsapp_log_message_type_check
  CHECK (message_type IN (
    'request','confirmation','cancellation','cancellation_ack',
    'invalid_reply','release','reschedule_request','reschedule',
    'timeout_reminder','all_declined_alert','already_filled'
  ));
