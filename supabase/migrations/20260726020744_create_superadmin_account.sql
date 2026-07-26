/*
# Create superadmin account

## Overview
Creates a superadmin auth user (email + password) and a matching record in the
public.users table with role = 'superadmin'.

## Details
- Email: avinashgbn@hotmail.co.uk
- Name: Avinash
- Role: superadmin
- Password is bcrypt-hashed and stored in auth.users.encrypted_password

## Security
- This is a one-time setup migration. The password is hashed, not stored in plaintext.
- The superadmin role bypasses all RLS policies via the is_superadmin() helper.
*/

-- Generate a UUID for the superadmin
DO $$
DECLARE
  superadmin_id uuid := gen_random_uuid();
  bcrypt_hash text;
BEGIN
  -- bcrypt hash for "Password1234" (cost 10)
  -- Using crypt with gen_salt('bf') to produce a bcrypt hash
  bcrypt_hash := crypt('Password1234', gen_salt('bf', 10));

  -- Insert into auth.users
  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  ) VALUES (
    superadmin_id,
    'authenticated',
    'authenticated',
    'avinashgbn@hotmail.co.uk',
    bcrypt_hash,
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  );

  -- Insert into public.users
  INSERT INTO public.users (
    id,
    full_name,
    phone,
    role,
    active
  ) VALUES (
    superadmin_id,
    'Avinash',
    '00000000',
    'superadmin',
    true
  );
END $$;
