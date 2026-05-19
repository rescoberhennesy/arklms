-- Enrolled students need to see co-enrollment rows in classes they share,
-- so the People tab and card-roster avatars work without bypassing RLS.
--
-- Scope: an enrollment row E is visible to user U if U is also enrolled
-- in the same class. Mirrors the spirit of profiles_classmate_view in
-- migration 20260508010000.
--
-- Teachers already see all enrollments in their own classes via the
-- existing `enrollments_select_teacher` policy; admins see all via
-- `enrollments_select_admin`. This new policy is the missing
-- student-to-classmate case.

CREATE POLICY enrollments_select_classmate ON public.class_enrollments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_enrollments my_enroll
      WHERE my_enroll.class_id = class_enrollments.class_id
        AND my_enroll.student_id = auth.uid()
    )
  );

COMMENT ON POLICY enrollments_select_classmate ON public.class_enrollments IS
  'Students can view enrollment rows for any class they are enrolled in (lets them see classmates).';