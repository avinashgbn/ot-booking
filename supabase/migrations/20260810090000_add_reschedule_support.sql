/*
# Add reschedule support to bookings and cascade_steps

## Overview
Lets a secretary reschedule a confirmed booking to a new date/time/location.
Rescheduling clears the current confirmation and starts a fresh WhatsApp cascade,
so this adds:
- bookings.rescheduled_at / rescheduled_by: audit of the most recent reschedule,
  mirroring the existing cancelled_at / cancelled_by columns.
- cascade_steps.cascade_context: tags which cascade_steps rows belong to a
  reschedule-triggered round (vs a normal round) so that cascade-engine and
  whatsapp-webhook select reschedule-flavoured WhatsApp copy for those rows on
  every invocation (initial send, cron expiry fallback, decline fallback),
  without that information being passed transiently in a request body.

## Details
- rescheduled_by references users(id) ON DELETE SET NULL, same as cancelled_by.
- cascade_context is nullable; NULL means a normal cascade round. Only 'reschedule'
  is defined for now, but the CHECK is written so future context values are easy
  to add.
- No booking status is added: rescheduling reuses the existing 'cascade_running'.
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rescheduled_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE cascade_steps ADD COLUMN IF NOT EXISTS cascade_context text;
ALTER TABLE cascade_steps DROP CONSTRAINT IF EXISTS cascade_steps_cascade_context_check;
ALTER TABLE cascade_steps ADD CONSTRAINT cascade_steps_cascade_context_check
  CHECK (cascade_context IS NULL OR cascade_context IN ('reschedule'));
