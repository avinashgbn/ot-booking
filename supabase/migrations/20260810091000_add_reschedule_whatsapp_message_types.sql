/*
# Add reschedule message types to whatsapp_log

## Overview
Rescheduling a confirmed booking sends two new kinds of outbound WhatsApp
message (see 20260810090000_add_reschedule_support.sql):
- reschedule_request: cascade request to anaesthetists for the new
  date/time/location, analogous to 'request'.
- reschedule: notice to the surgeon that their case has been rescheduled,
  analogous to how 'cancellation' is reused for the surgeon-facing cancellation.

## Details
- Widens the whatsapp_log message_type CHECK to allow both values.
- NOTE: whatsapp_log was renamed from sms_log; the inline CHECK constraint kept
  its original auto-generated name 'sms_log_message_type_check' (a table rename
  does not rename constraints). We drop that name and re-add under the clean
  'whatsapp_log_message_type_check'. The second defensive DROP covers a DB where
  the constraint was already renamed manually.
*/

ALTER TABLE whatsapp_log DROP CONSTRAINT IF EXISTS sms_log_message_type_check;
ALTER TABLE whatsapp_log DROP CONSTRAINT IF EXISTS whatsapp_log_message_type_check;
ALTER TABLE whatsapp_log ADD CONSTRAINT whatsapp_log_message_type_check
  CHECK (message_type IN (
    'request','confirmation','cancellation','cancellation_ack',
    'invalid_reply','release','reschedule_request','reschedule'
  ));
