-- Teachers read their own classes by checking teacher_id directly.
-- The old is_class_teacher(id, ...) version queried the classes table, which
-- can't see a row during its own INSERT ... RETURNING, so createClass failed.
DROP POLICY IF EXISTS classes_select_teacher ON public.classes;

CREATE POLICY classes_select_teacher
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());
