/*
# Surgeon archiving

## Overview
bookings.surgeon_id has no ON DELETE cascade/set-null (by design — booking
history must never be silently destroyed by deleting a person), so a surgeon
who has ever had a booking cannot be hard-deleted; the delete fails with a
foreign key violation. "Remove surgeon" needs a non-destructive fallback:
archiving. An archived surgeon is no longer selectable for new bookings or
preference-list management at their home practice, but their identity and
booking history stay intact (and stay visible for historical filtering).

## Changes
- users.archived: true means this surgeon is archived at their HOME practice.
  Practices linked via practice_surgeons are unaffected by this flag and are
  managed independently via linking/unlinking.
- users_update_own RLS policy extended so practice_admin/secretary can update
  other users' rows within their own practice (previously only self or
  superadmin could — this also happens to fix resend-invite and admin-transfer,
  which relied on the same update path and were silently blocked by RLS).
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR public.is_superadmin()
    OR (
      practice_id = public.current_user_practice_id()
      AND public.current_user_role() IN ('practice_admin','secretary')
    )
  );
