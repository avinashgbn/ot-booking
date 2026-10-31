/*
# Mark existing anaesthetists as platform-owned

## Overview
The anaesthetists that existed before added_by_practice_id was introduced
are platform-owned (NULL), so only a superadmin can edit or delete them.
After 20261031090100 these rows are already NULL; this statement makes the
intent explicit and is expected to update 0 rows.

## Rollback
None needed: no prior per-row value existed to restore.
*/

UPDATE anaesthetists
SET added_by_practice_id = NULL
WHERE added_by_practice_id IS NOT NULL;
