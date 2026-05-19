-- Restores the self-update capability for profiles.
--
-- The original "Users can update own profile" UPDATE policy from
-- 20260429000000_init_profiles.sql was dropped during the RLS recursion
-- fix and never recreated — only the SELECT half (profiles_self_service)
-- came back. Without an UPDATE policy, teachers and students silently
-- fail to update their own profile (0 rows affected, no error), which
-- broke avatar upload and name editing on the Profile page.

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY profiles_update_self ON public.profiles IS
  'Authenticated users can update their own profile row (e.g. name, username, avatar_url).';