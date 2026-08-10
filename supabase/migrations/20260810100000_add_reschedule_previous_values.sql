/*
# Store previous scheduling details on reschedule

## Overview
So the reschedule WhatsApp messages and the booking detail page can show
"old -> new", capture the date/time/hospital/location as they were just before
the most recent reschedule. Set by the client in the same UPDATE that writes the
new values (see BookingDetailPage handleReschedule). All nullable; only populated
once a booking has been rescheduled at least once.
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS previous_surgery_date date;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS previous_surgery_time time;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS previous_hospital_clinic text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS previous_ot_location text;
