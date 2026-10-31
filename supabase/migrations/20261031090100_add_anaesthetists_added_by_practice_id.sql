/*
# Record which practice added each anaesthetist

## Overview
The anaesthetist directory is shared across practices. added_by_practice_id
records the practice that added each anaesthetist, so only that practice
(or a superadmin) can edit or delete them (policies in
20261031090300_scope_anaesthetists_writes.sql). NULL means platform-owned.

The column is added first and the default set separately, so existing rows
stay NULL rather than having the default evaluated for them during the
migration. New rows default to the inserting user's practice; a superadmin
has no practice, so their inserts are platform-owned. If a practice is
deleted, its anaesthetists become platform-owned (ON DELETE SET NULL).

## Rollback
ALTER TABLE anaesthetists DROP COLUMN IF EXISTS added_by_practice_id;
*/

ALTER TABLE anaesthetists
  ADD COLUMN IF NOT EXISTS added_by_practice_id uuid REFERENCES practices(id) ON DELETE SET NULL;

ALTER TABLE anaesthetists
  ALTER COLUMN added_by_practice_id SET DEFAULT public.current_user_practice_id();

CREATE INDEX IF NOT EXISTS idx_anaesthetists_added_by_practice_id
  ON anaesthetists(added_by_practice_id);
