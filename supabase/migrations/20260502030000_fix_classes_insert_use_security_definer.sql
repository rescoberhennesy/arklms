-- =====================================================================
-- Migration: Fix classes INSERT policy to use SECURITY DEFINER function
-- Date: 2026-05-02
-- Purpose:
--   The previous INSERT policy used "EXISTS (SELECT 1 FROM profiles ...)"
--   which runs in the authenticated user's RLS context. PostgREST caches
--   the profiles SELECT policies aggressively, and stale cache caused
--   the EXISTS subquery to silently return zero rows even for valid
--   teacher accounts — blocking every class creation.
--
--   Fix: use the existing SECURITY DEFINER function get_user_role(uuid),
--   which runs as the postgres user and bypasses RLS on profiles.
-- =====================================================================

DROP POLICY IF EXISTS "classes_insert_teacher" ON public.classes;
CREATE POLICY "classes_insert_teacher"
  ON public.classes FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND public.get_user_role(auth.uid()) = 'teacher'
  );

-- Force PostgREST to reload policy definitions
NOTIFY pgrst, 'reload schema';