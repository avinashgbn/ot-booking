/*
# Archive anaesthetists instead of deleting them; block deletes that break history

## Overview
Deleting an anaesthetist used to wipe their cascade steps (ON DELETE CASCADE)
and blank the confirmed anaesthetist on bookings (ON DELETE SET NULL).
Archiving (active = false) is now the way to remove someone from new
requests while keeping their history and name on past bookings.

- cascade_steps.anaesthetist_id and bookings.confirmed_anaesthetist_id
  become ON DELETE RESTRICT, so the database refuses to delete an
  anaesthetist who is still referenced, whoever tries it (including the
  service role). Constraint names are unchanged, so the app's
  !cascade_steps_anaesthetist_id_fkey / !bookings_confirmed_anaesthetist_id_fkey
  join hints keep working.
- anaesthetists_in_use() returns the ids of anaesthetists referenced by any
  cascade step or confirmed booking, so the directory can show "Archive"
  instead of "Delete". RLS hides other practices' bookings and cascade
  steps from the browser; this returns ids only, no booking data.
  Signed-in users only.

whatsapp_log.anaesthetist_id (SET NULL), anaesthetist_preferences and
anaesthetist_practice_names (CASCADE) are unchanged.

## Rollback
DROP FUNCTION IF EXISTS public.anaesthetists_in_use();
ALTER TABLE bookings
  DROP CONSTRAINT bookings_confirmed_anaesthetist_id_fkey,
  ADD CONSTRAINT bookings_confirmed_anaesthetist_id_fkey
    FOREIGN KEY (confirmed_anaesthetist_id) REFERENCES anaesthetists(id) ON DELETE SET NULL;
ALTER TABLE cascade_steps
  DROP CONSTRAINT cascade_steps_anaesthetist_id_fkey,
  ADD CONSTRAINT cascade_steps_anaesthetist_id_fkey
    FOREIGN KEY (anaesthetist_id) REFERENCES anaesthetists(id) ON DELETE CASCADE;
*/

ALTER TABLE cascade_steps
  DROP CONSTRAINT cascade_steps_anaesthetist_id_fkey,
  ADD CONSTRAINT cascade_steps_anaesthetist_id_fkey
    FOREIGN KEY (anaesthetist_id) REFERENCES anaesthetists(id) ON DELETE RESTRICT;

ALTER TABLE bookings
  DROP CONSTRAINT bookings_confirmed_anaesthetist_id_fkey,
  ADD CONSTRAINT bookings_confirmed_anaesthetist_id_fkey
    FOREIGN KEY (confirmed_anaesthetist_id) REFERENCES anaesthetists(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.anaesthetists_in_use()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT anaesthetist_id FROM cascade_steps
  UNION
  SELECT confirmed_anaesthetist_id FROM bookings WHERE confirmed_anaesthetist_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.anaesthetists_in_use() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anaesthetists_in_use() FROM anon;
GRANT EXECUTE ON FUNCTION public.anaesthetists_in_use() TO authenticated;
