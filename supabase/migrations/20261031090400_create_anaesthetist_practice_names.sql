/*
# Per-practice display names for anaesthetists

## Overview
Each anaesthetist has one shared record (identified by phone) with a
canonical full_name. Practices often know the same person by a different
name, so anaesthetist_practice_names holds one optional display_name per
(anaesthetist, practice). The app shows a practice's own name and falls
back to full_name when it has none.

- Every signed-in user can read all rows (the directory is shared, and a
  booking from another practice can show that practice's name).
- Only a practice's own practice_admin/secretary, or a superadmin, can
  insert, edit or delete that practice's rows.

## Rollback
DROP TABLE IF EXISTS anaesthetist_practice_names;
(This deletes every saved display name.)
*/

CREATE TABLE IF NOT EXISTS anaesthetist_practice_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anaesthetist_id uuid NOT NULL REFERENCES anaesthetists(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anaesthetist_practice_names_anaesthetist_practice_key
    UNIQUE (anaesthetist_id, practice_id)
);

CREATE INDEX IF NOT EXISTS idx_anaesthetist_practice_names_practice_id
  ON anaesthetist_practice_names(practice_id);

ALTER TABLE anaesthetist_practice_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anaesthetist_practice_names_select" ON anaesthetist_practice_names;
CREATE POLICY "anaesthetist_practice_names_select" ON anaesthetist_practice_names
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "anaesthetist_practice_names_insert" ON anaesthetist_practice_names;
CREATE POLICY "anaesthetist_practice_names_insert" ON anaesthetist_practice_names
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_superadmin())
    OR (
      practice_id = (SELECT public.current_user_practice_id())
      AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "anaesthetist_practice_names_update" ON anaesthetist_practice_names;
CREATE POLICY "anaesthetist_practice_names_update" ON anaesthetist_practice_names
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_superadmin())
    OR (
      practice_id = (SELECT public.current_user_practice_id())
      AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  )
  WITH CHECK (
    (SELECT public.is_superadmin())
    OR (
      practice_id = (SELECT public.current_user_practice_id())
      AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  );

DROP POLICY IF EXISTS "anaesthetist_practice_names_delete" ON anaesthetist_practice_names;
CREATE POLICY "anaesthetist_practice_names_delete" ON anaesthetist_practice_names
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_superadmin())
    OR (
      practice_id = (SELECT public.current_user_practice_id())
      AND (SELECT public.current_user_role()) IN ('practice_admin','secretary')
    )
  );
