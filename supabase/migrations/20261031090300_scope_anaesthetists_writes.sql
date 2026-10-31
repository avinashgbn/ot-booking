/*
# Limit anaesthetist writes to the practice that added them

## Overview
Previously any practice_admin or secretary could insert, edit or delete any
anaesthetist, including ones another practice relies on. Now:
- insert: superadmin, or practice_admin/secretary inserting under their own
  practice (the column default fills added_by_practice_id).
- update/delete: superadmin, or practice_admin/secretary of the practice
  that added the anaesthetist. Platform-owned rows (NULL) are
  superadmin-only.
Reads are unchanged: every signed-in user sees the whole directory.

## Rollback
DROP POLICY IF EXISTS "anaesthetists_manage_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_manage_staff" ON anaesthetists FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('practice_admin','secretary','superadmin'));
DROP POLICY IF EXISTS "anaesthetists_update_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_update_staff" ON anaesthetists FOR UPDATE TO authenticated
  USING (current_user_role() IN ('practice_admin','secretary','superadmin'))
  WITH CHECK (current_user_role() IN ('practice_admin','secretary','superadmin'));
DROP POLICY IF EXISTS "anaesthetists_delete_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_delete_staff" ON anaesthetists FOR DELETE TO authenticated
  USING (current_user_role() IN ('practice_admin','secretary','superadmin'));
*/

DROP POLICY IF EXISTS "anaesthetists_manage_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_manage_staff" ON anaesthetists
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_superadmin())
    OR (
      added_by_practice_id = (SELECT public.current_user_practice_id())
      AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "anaesthetists_update_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_update_staff" ON anaesthetists
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_superadmin())
    OR (
      added_by_practice_id = (SELECT public.current_user_practice_id())
      AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  )
  WITH CHECK (
    (SELECT public.is_superadmin())
    OR (
      added_by_practice_id = (SELECT public.current_user_practice_id())
      AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "anaesthetists_delete_staff" ON anaesthetists;
CREATE POLICY "anaesthetists_delete_staff" ON anaesthetists
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_superadmin())
    OR (
      added_by_practice_id = (SELECT public.current_user_practice_id())
      AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  );
