-- Fix argument order in class_join_requests teacher RLS policies.
-- Function signature is is_class_teacher(p_class_id, p_user_id) -- class first, user second.
-- Session 3 incorrectly wrote these two policies with arguments swapped, causing
-- them to always return false and silently filter out all rows for teachers.

DROP POLICY IF EXISTS class_join_requests_select_teacher ON public.class_join_requests;
DROP POLICY IF EXISTS class_join_requests_update_teacher ON public.class_join_requests;

CREATE POLICY class_join_requests_select_teacher
  ON public.class_join_requests
  FOR SELECT
  USING (public.is_class_teacher(class_id, auth.uid()));

CREATE POLICY class_join_requests_update_teacher
  ON public.class_join_requests
  FOR UPDATE
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));
