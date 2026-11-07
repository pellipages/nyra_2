-- Admin access without MFA.
-- Decision (7 Nov 2026): the hosting clients share one admin account that
-- signs in with email + password. Access is still gated by a row in
-- public.admins; only the "must be aal2" (MFA) condition is removed.
-- All RLS policies call is_admin(), so replacing the function is enough.
-- CREATE OR REPLACE keeps the existing grants on the function.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  );
$$;
