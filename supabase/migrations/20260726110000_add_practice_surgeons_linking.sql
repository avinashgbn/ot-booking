/*
# Multi-practice surgeon linking

## Overview
A surgeon can work at more than one practice (their own clinic plus others they
operate at). Rather than creating a second users/auth row for the same phone
number (which would collide, since login identity is derived 1:1 from phone),
additional practices link to the surgeon's single existing users row via a new
practice_surgeons join table. The surgeon keeps one identity/login; each linked
practice's secretaries/admins can book cases and manage anaesthetist preference
lists for them exactly as if they were a native member of that practice.

## Table
- practice_surgeons(practice_id, surgeon_id) - additional practice memberships
  for an existing surgeon, beyond their home practice_id on users.

## Security (RLS)
- Practice members can see which surgeons are linked to their practice.
- Practice admins/secretaries can link/unlink surgeons for their own practice.
- Extends users_select_own_or_practice and anaesthetist_preferences_select so
  a linked practice's members can see the surgeon's row and preference list.
*/

CREATE TABLE IF NOT EXISTS practice_surgeons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  surgeon_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (practice_id, surgeon_id)
);

ALTER TABLE practice_surgeons ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_practice_surgeons_practice_id ON practice_surgeons(practice_id);
CREATE INDEX IF NOT EXISTS idx_practice_surgeons_surgeon_id ON practice_surgeons(surgeon_id);

-- practice_surgeons policies
DROP POLICY IF EXISTS "practice_surgeons_select" ON practice_surgeons;
CREATE POLICY "practice_surgeons_select" ON practice_surgeons
  FOR SELECT TO authenticated
  USING (
    practice_id = public.current_user_practice_id()
    OR surgeon_id = auth.uid()
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS "practice_surgeons_insert" ON practice_surgeons;
CREATE POLICY "practice_surgeons_insert" ON practice_surgeons
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "practice_surgeons_delete" ON practice_surgeons;
CREATE POLICY "practice_surgeons_delete" ON practice_surgeons
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );

-- Extend users select so linked practices can see the surgeon's row
DROP POLICY IF EXISTS "users_select_own_or_practice" ON users;
CREATE POLICY "users_select_own_or_practice" ON users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR practice_id = public.current_user_practice_id()
    OR public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM practice_surgeons ps
      WHERE ps.surgeon_id = users.id
      AND ps.practice_id = public.current_user_practice_id()
    )
  );

-- Extend anaesthetist_preferences select so linked practices can see the list
DROP POLICY IF EXISTS "anaesthetist_preferences_select" ON anaesthetist_preferences;
CREATE POLICY "anaesthetist_preferences_select" ON anaesthetist_preferences
  FOR SELECT TO authenticated
  USING (
    surgeon_id = auth.uid()
    OR surgeon_id IN (SELECT id FROM users WHERE practice_id = public.current_user_practice_id())
    OR surgeon_id IN (SELECT surgeon_id FROM practice_surgeons WHERE practice_id = public.current_user_practice_id())
    OR public.is_superadmin()
  );
