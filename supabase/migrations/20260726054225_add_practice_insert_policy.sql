-- Allow superadmin to create new practices
DROP POLICY IF EXISTS "practices_insert_superadmin" ON practices;
CREATE POLICY "practices_insert_superadmin" ON practices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
