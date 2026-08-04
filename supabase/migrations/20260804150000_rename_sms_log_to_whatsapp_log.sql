/*
# Rename sms_log to whatsapp_log

## Overview
All messaging in this app goes through WhatsApp only (see the switch from
Twilio SMS to Twilio WhatsApp). This renames the sms_log table and its
supporting index/policies to match, since "sms_log" was a leftover name
from before that switch.
*/

ALTER TABLE sms_log RENAME TO whatsapp_log;

ALTER INDEX idx_sms_log_booking_id RENAME TO idx_whatsapp_log_booking_id;

ALTER POLICY "sms_log_select" ON whatsapp_log RENAME TO "whatsapp_log_select";
ALTER POLICY "sms_log_insert" ON whatsapp_log RENAME TO "whatsapp_log_insert";
ALTER POLICY "sms_log_update" ON whatsapp_log RENAME TO "whatsapp_log_update";
