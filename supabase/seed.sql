-- Local test seed for the OT Booking app.
-- Runs automatically after migrations on `supabase db reset` (local only).
-- Gives you a secretary login and a CONFIRMED booking so you can test Reschedule.
--
-- LOGIN (on the app's PIN login screen):
--   Phone: +6580000001
--   PIN:   1234
--
-- pin_hash is SHA-256 hex of the PIN (matches supabase/functions/pin-login).
-- The auth.users record is created automatically by pin-login on first sign-in,
-- so we only seed public.users here.

-- ---- Practice ----
INSERT INTO practices (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Surgical Practice');

-- ---- Users (secretary + surgeon) ----
INSERT INTO users (id, practice_id, full_name, phone, role, pin_hash, active)
VALUES
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'Sam Secretary', '+6580000001', 'secretary',
   encode(digest('1234', 'sha256'), 'hex'), true),
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Sara Surgeon', '+6580000002', 'surgeon',
   encode(digest('1234', 'sha256'), 'hex'), true);

-- Point the practice's admin_user_id at the secretary (harmless for testing).
UPDATE practices
SET admin_user_id = '22222222-2222-2222-2222-222222222222'
WHERE id = '11111111-1111-1111-1111-111111111111';

-- Link the surgeon to the practice (so they appear in practice-scoped views).
INSERT INTO practice_surgeons (practice_id, surgeon_id)
VALUES ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');

-- ---- Anaesthetists (directory) ----
INSERT INTO anaesthetists (id, full_name, phone, hospitals)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Dr Alice Tan', '+6580001001', ARRAY['Mount Elizabeth']),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Dr Bob Lim',   '+6580001002', ARRAY['Mount Elizabeth']),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Dr Carol Ng',  '+6580001003', ARRAY['Mount Elizabeth']);

-- ---- Surgeon's ranked anaesthetist preferences ----
INSERT INTO anaesthetist_preferences (surgeon_id, anaesthetist_id, rank)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 1),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000002', 2),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000003', 3);

-- ---- A CONFIRMED booking (Dr Alice Tan already accepted) ----
INSERT INTO bookings (
  id, practice_id, surgeon_id, secretary_id,
  patient_initials, patient_age, procedure,
  hospital_clinic, ot_location, surgery_date, surgery_time, duration_hours,
  anaesthesia_preferences, cascade_mode, status,
  confirmed_anaesthetist_id, confirmed_at, secretary_phone
)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'JD', 45, 'Laparoscopic cholecystectomy',
  'Mount Elizabeth', 'OT 3', '2026-08-20', '09:00', 2,
  ARRAY['GA'], 'sequential', 'confirmed',
  'aaaaaaaa-0000-0000-0000-000000000001', now(), '+6580000001'
);

-- Original cascade history: Alice was rank 1 and accepted (context NULL = normal round).
INSERT INTO cascade_steps (booking_id, anaesthetist_id, rank, outcome, notified_at, responded_at)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001', 1, 'accepted', now(), now()
);
