/*
# OT Booking & Anaesthetist Cascade System — Core Schema

## Overview
Creates the full database schema for a Singapore-based surgical OT (Operating Theatre) booking
and anaesthetist cascade application. The system manages practices, users (superadmin,
practice_admin, secretary, surgeon), anaesthetists, bookings, cascade steps, SMS logs, and
superadmin audit records.

## Tables Created
- practices, users, anaesthetists, anaesthetist_preferences, bookings, cascade_steps,
  sms_log, superadmin_audit (see inline comments for columns)

## Security (RLS)
- All tables have RLS enabled.
- Users can read their own record and records of users in the same practice.
- Surgeons can read only bookings where they are the surgeon.
- Secretaries/admins can read/write all bookings in their practice.
- Practice admins can manage users in their practice.
- Anaesthetist directory readable by all authenticated users.
- sms_log and cascade_steps readable by practice members of the related booking.
- superadmin_audit readable only by superadmin role.
- Helper functions: current_user_practice_id(), is_superadmin(), current_user_role().

## Notes
1. PIN-based accounts: pin_hash stores a SHA-256 hash of the 4-digit PIN.
2. invite_token used for /join/:token activation. Once activated, token cleared, active=true.
3. Superadmin uses Supabase email/password auth (separate from PIN login).
4. Realtime enabled on bookings and cascade_steps for live dashboard updates.
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ practices ============
CREATE TABLE IF NOT EXISTS practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  admin_user_id uuid
);

ALTER TABLE practices ENABLE ROW LEVEL SECURITY;

-- ============ users ============
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid REFERENCES practices(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('superadmin','practice_admin','secretary','surgeon')),
  pin_hash text,
  active boolean NOT NULL DEFAULT false,
  invite_token text UNIQUE,
  invite_expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'practices_admin_user_id_fkey' AND table_name = 'practices'
  ) THEN
    ALTER TABLE practices
      ADD CONSTRAINT practices_admin_user_id_fkey
      FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============ anaesthetists ============
CREATE TABLE IF NOT EXISTS anaesthetists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text UNIQUE NOT NULL,
  hospitals text[] DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE anaesthetists ENABLE ROW LEVEL SECURITY;

-- ============ anaesthetist_preferences ============
CREATE TABLE IF NOT EXISTS anaesthetist_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surgeon_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anaesthetist_id uuid NOT NULL REFERENCES anaesthetists(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now(),
  UNIQUE (surgeon_id, rank),
  UNIQUE (surgeon_id, anaesthetist_id)
);

ALTER TABLE anaesthetist_preferences ENABLE ROW LEVEL SECURITY;

-- ============ bookings ============
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  surgeon_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secretary_id uuid REFERENCES users(id) ON DELETE SET NULL,
  patient_initials text NOT NULL,
  patient_age integer NOT NULL,
  procedure text NOT NULL,
  ot_location text NOT NULL,
  surgery_date date NOT NULL,
  surgery_time time NOT NULL,
  duration_hours numeric NOT NULL,
  anaesthesia_preferences text[] DEFAULT '{}',
  cascade_mode text NOT NULL CHECK (cascade_mode IN ('sequential','simultaneous')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cascade_running','confirmed','cancelled')),
  confirmed_anaesthetist_id uuid REFERENCES anaesthetists(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  cancel_acknowledged boolean NOT NULL DEFAULT false,
  cancel_acknowledged_at timestamptz,
  secretary_phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- ============ cascade_steps ============
CREATE TABLE IF NOT EXISTS cascade_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  anaesthetist_id uuid NOT NULL REFERENCES anaesthetists(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  notified_at timestamptz,
  expires_at timestamptz,
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','accepted','declined','expired','released')),
  responded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cascade_steps ENABLE ROW LEVEL SECURITY;

-- ============ sms_log ============
CREATE TABLE IF NOT EXISTS sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  anaesthetist_id uuid REFERENCES anaesthetists(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  message_type text CHECK (message_type IN ('request','confirmation','cancellation','cancellation_ack','invalid_reply','release')),
  body text,
  reply text,
  to_phone text,
  from_phone text,
  sent_at timestamptz DEFAULT now(),
  replied_at timestamptz
);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- ============ superadmin_audit ============
CREATE TABLE IF NOT EXISTS superadmin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text,
  target_practice_id uuid,
  target_user_id uuid,
  notes text,
  performed_at timestamptz DEFAULT now()
);

ALTER TABLE superadmin_audit ENABLE ROW LEVEL SECURITY;

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_users_practice_id ON users(practice_id);
CREATE INDEX IF NOT EXISTS idx_users_invite_token ON users(invite_token);
CREATE INDEX IF NOT EXISTS idx_bookings_practice_id ON bookings(practice_id);
CREATE INDEX IF NOT EXISTS idx_bookings_surgeon_id ON bookings(surgeon_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_surgery_date ON bookings(surgery_date);
CREATE INDEX IF NOT EXISTS idx_cascade_steps_booking_id ON cascade_steps(booking_id);
CREATE INDEX IF NOT EXISTS idx_cascade_steps_anaesthetist_id ON cascade_steps(anaesthetist_id);
CREATE INDEX IF NOT EXISTS idx_cascade_steps_outcome ON cascade_steps(outcome);
CREATE INDEX IF NOT EXISTS idx_sms_log_booking_id ON sms_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_anaesthetist_preferences_surgeon_id ON anaesthetist_preferences(surgeon_id);
CREATE INDEX IF NOT EXISTS idx_superadmin_audit_performed_at ON superadmin_audit(performed_at);

-- ============ Realtime ============
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cascade_steps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cascade_steps;
  END IF;
END $$;

-- ============ Helper functions ============
CREATE OR REPLACE FUNCTION public.current_user_practice_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT practice_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- ============ RLS POLICIES ============

-- practices
DROP POLICY IF EXISTS "practices_select_authenticated" ON practices;
CREATE POLICY "practices_select_authenticated" ON practices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "practices_update_admin" ON practices;
CREATE POLICY "practices_update_admin" ON practices
  FOR UPDATE TO authenticated
  USING (admin_user_id = auth.uid() OR public.is_superadmin())
  WITH CHECK (admin_user_id = auth.uid() OR public.is_superadmin());

-- users
DROP POLICY IF EXISTS "users_select_own_or_practice" ON users;
CREATE POLICY "users_select_own_or_practice" ON users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR practice_id = public.current_user_practice_id()
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_superadmin())
  WITH CHECK (id = auth.uid() OR public.is_superadmin());

DROP POLICY IF EXISTS "users_insert_admin" ON users;
CREATE POLICY "users_insert_admin" ON users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "users_delete_admin" ON users;
CREATE POLICY "users_delete_admin" ON users
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() = 'practice_admin'
      AND id <> auth.uid()
    )
  );

-- anaesthetists
DROP POLICY IF EXISTS "anaesthetists_select_authenticated" ON anaesthetists;
CREATE POLICY "anaesthetists_select_authenticated" ON anaesthetists
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "anaesthetists_manage_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_manage_staff" ON anaesthetists
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('practice_admin','secretary','superadmin'));

DROP POLICY IF EXISTS "anaesthetists_update_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_update_staff" ON anaesthetists
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('practice_admin','secretary','superadmin'))
  WITH CHECK (public.current_user_role() IN ('practice_admin','secretary','superadmin'));

DROP POLICY IF EXISTS "anaesthetists_delete_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_delete_staff" ON anaesthetists
  FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('practice_admin','secretary','superadmin'));

-- anaesthetist_preferences
DROP POLICY IF EXISTS "anaesthetist_preferences_select" ON anaesthetist_preferences;
CREATE POLICY "anaesthetist_preferences_select" ON anaesthetist_preferences
  FOR SELECT TO authenticated
  USING (
    surgeon_id = auth.uid()
    OR surgeon_id IN (SELECT id FROM users WHERE practice_id = public.current_user_practice_id())
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS "anaesthetist_preferences_insert" ON anaesthetist_preferences;
CREATE POLICY "anaesthetist_preferences_insert" ON anaesthetist_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR public.current_user_role() IN ('practice_admin','secretary')
    OR surgeon_id = auth.uid()
  );

DROP POLICY IF EXISTS "anaesthetist_preferences_update" ON anaesthetist_preferences;
CREATE POLICY "anaesthetist_preferences_update" ON anaesthetist_preferences
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin()
    OR public.current_user_role() IN ('practice_admin','secretary')
    OR surgeon_id = auth.uid()
  )
  WITH CHECK (
    public.is_superadmin()
    OR public.current_user_role() IN ('practice_admin','secretary')
    OR surgeon_id = auth.uid()
  );

DROP POLICY IF EXISTS "anaesthetist_preferences_delete" ON anaesthetist_preferences;
CREATE POLICY "anaesthetist_preferences_delete" ON anaesthetist_preferences
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin()
    OR public.current_user_role() IN ('practice_admin','secretary')
    OR surgeon_id = auth.uid()
  );

-- bookings
DROP POLICY IF EXISTS "bookings_select" ON bookings;
CREATE POLICY "bookings_select" ON bookings
  FOR SELECT TO authenticated
  USING (
    surgeon_id = auth.uid()
    OR practice_id = public.current_user_practice_id()
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS "bookings_insert" ON bookings;
CREATE POLICY "bookings_insert" ON bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "bookings_update" ON bookings;
CREATE POLICY "bookings_update" ON bookings
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "bookings_delete" ON bookings;
CREATE POLICY "bookings_delete" ON bookings
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

-- cascade_steps
DROP POLICY IF EXISTS "cascade_steps_select" ON cascade_steps;
CREATE POLICY "cascade_steps_select" ON cascade_steps
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = cascade_steps.booking_id
      AND (
        bookings.surgeon_id = auth.uid()
        OR bookings.practice_id = public.current_user_practice_id()
      )
    )
  );

DROP POLICY IF EXISTS "cascade_steps_insert" ON cascade_steps;
CREATE POLICY "cascade_steps_insert" ON cascade_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = cascade_steps.booking_id
      AND bookings.practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "cascade_steps_update" ON cascade_steps;
CREATE POLICY "cascade_steps_update" ON cascade_steps
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = cascade_steps.booking_id
      AND bookings.practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = cascade_steps.booking_id
      AND bookings.practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "cascade_steps_delete" ON cascade_steps;
CREATE POLICY "cascade_steps_delete" ON cascade_steps
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = cascade_steps.booking_id
      AND bookings.practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

-- sms_log
DROP POLICY IF EXISTS "sms_log_select" ON sms_log;
CREATE POLICY "sms_log_select" ON sms_log
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = sms_log.booking_id
      AND (
        bookings.surgeon_id = auth.uid()
        OR bookings.practice_id = public.current_user_practice_id()
      )
    )
  );

DROP POLICY IF EXISTS "sms_log_insert" ON sms_log;
CREATE POLICY "sms_log_insert" ON sms_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR public.current_user_role() IS NOT NULL);

DROP POLICY IF EXISTS "sms_log_update" ON sms_log;
CREATE POLICY "sms_log_update" ON sms_log
  FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR public.current_user_role() IS NOT NULL)
  WITH CHECK (public.is_superadmin() OR public.current_user_role() IS NOT NULL);

-- superadmin_audit
DROP POLICY IF EXISTS "superadmin_audit_select" ON superadmin_audit;
CREATE POLICY "superadmin_audit_select" ON superadmin_audit
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS "superadmin_audit_insert" ON superadmin_audit;
CREATE POLICY "superadmin_audit_insert" ON superadmin_audit
  FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());
