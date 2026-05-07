-- Enrolled students need to see the names of co-members (teachers and
-- fellow students) of any class they share. Without this, names show as
-- "Unknown" in the announcement feed because PostgREST joins to profiles
-- via author_id and the row is filtered by RLS.
--
-- Scope: a profile P is visible to user U if there exists a class C such
-- that:
--   - U is enrolled in C, AND
--   - P is the teacher of C OR P is enrolled in C
--
-- Phrased as the policy USING clause on profiles, where `id` is the
-- profile being read:

CREATE POLICY profiles_classmate_view ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_enrollments my_enroll
      JOIN public.classes c ON c.id = my_enroll.class_id
      LEFT JOIN public.class_enrollments their_enroll
        ON their_enroll.class_id = c.id AND their_enroll.student_id = profiles.id
      WHERE my_enroll.student_id = auth.uid()
        AND (
          c.teacher_id = profiles.id
          OR their_enroll.student_id = profiles.id
        )
    )
  );

COMMENT ON POLICY profiles_classmate_view ON public.profiles IS
  'Students can view profiles of co-members (teacher + classmates) in any class they are enrolled in.';