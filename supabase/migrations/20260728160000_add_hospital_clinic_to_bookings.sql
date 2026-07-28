/*
# Add hospital_clinic to bookings

## Overview
Splits the previously combined "OT location / hospital and theatre" field into two:
- hospital_clinic: the hospital or clinic name
- ot_location: the theatre/venue within it (OT number, Day Surgery, Endoscopy, etc.)

## Details
- Adds bookings.hospital_clinic as NOT NULL with a default of '' so existing rows
  remain valid; new bookings are validated in the app to require a real value.
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hospital_clinic text NOT NULL DEFAULT '';
