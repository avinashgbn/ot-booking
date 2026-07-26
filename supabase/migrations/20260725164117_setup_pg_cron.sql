/*
# Set up pg_cron for cascade expiration checks

## Overview
Enables pg_cron and http extensions, then creates a scheduled job that calls the
cascade-engine edge function every 30 seconds to check for expired cascade steps
and unacknowledged cancellations.

## Changes
- Enables pg_cron and http extensions
- Creates a cron job (every 30 seconds) that POSTs to the cascade-engine edge function

## Notes
1. The cron job uses the http extension to call the edge function endpoint.
2. The edge function handles expired cascade steps and 30-min unacknowledged cancellation alerts.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cascade-expiration-check'
  ) THEN
    PERFORM cron.schedule(
      'cascade-expiration-check',
      '30 seconds',
      $cron$
        SELECT content::text FROM http_post(
          'https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/cascade-engine',
          '{"action":"check_expirations"}',
          'application/json'
        );
      $cron$
    );
  END IF;
END $$;
