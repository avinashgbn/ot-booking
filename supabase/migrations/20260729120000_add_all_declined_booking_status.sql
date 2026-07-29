/*
# Add all_declined booking status

## Overview
When every anaesthetist in a case's cascade has declined or let their reply
window expire without anyone accepting, the booking now moves to a distinct
`all_declined` status instead of silently reverting to `pending`. This lets
the dashboard flag it in red so a secretary knows to add another
anaesthetist, rather than it looking like a booking that was never started.

## Details
- Widens the bookings.status CHECK constraint to allow 'all_declined'.
*/

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending','cascade_running','confirmed','cancelled','all_declined'));
