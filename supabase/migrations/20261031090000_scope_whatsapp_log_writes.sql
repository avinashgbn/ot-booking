/*
# Lock down whatsapp_log writes from the browser

## Overview
Browser code never inserts or updates whatsapp_log (BookingDetailPage only
selects it and subscribes to realtime changes). Every write comes from edge
functions using the service-role key, which bypasses RLS.

- whatsapp_log_update is dropped: log rows become immutable to users.
- whatsapp_log_insert is scoped like cascade_steps_insert: superadmin, or
  practice_admin/secretary of the booking's own practice. Rows with no
  booking_id (invite messages) are superadmin-only from the browser;
  send-whatsapp still writes them via the service role.
- whatsapp_log_select is unchanged, so realtime delivery is unchanged.

## Rollback
DROP POLICY IF EXISTS "whatsapp_log_insert" ON whatsapp_log;
CREATE POLICY "whatsapp_log_insert" ON whatsapp_log FOR INSERT TO authenticated
  WITH CHECK (is_superadmin() OR (current_user_role() IS NOT NULL));
CREATE POLICY "whatsapp_log_update" ON whatsapp_log FOR UPDATE TO authenticated
  USING (is_superadmin() OR (current_user_role() IS NOT NULL))
  WITH CHECK (is_superadmin() OR (current_user_role() IS NOT NULL));
*/

DROP POLICY IF EXISTS "whatsapp_log_update" ON whatsapp_log;

DROP POLICY IF EXISTS "whatsapp_log_insert" ON whatsapp_log;
CREATE POLICY "whatsapp_log_insert" ON whatsapp_log
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_superadmin())
    OR EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = whatsapp_log.booking_id
        AND bookings.practice_id = (SELECT public.current_user_practice_id())
        AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  );
