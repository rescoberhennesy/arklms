-- =====================================================================
-- Migration: Fix RLS policies that depend on missing JWT role claim
-- Date: 2026-05-02
-- =====================================================================

DROP POLICY IF EXISTS "classes_insert_teacher" ON public.classes;
CREATE POLICY "classes_insert_teacher"
  ON public.classes FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'teacher'
    )
  );

DROP POLICY IF EXISTS "profiles_staff_view" ON public.profiles;
CREATE POLICY "profiles_staff_view"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) IN ('admin', 'teacher')
  );

GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;