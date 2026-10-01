CREATE OR REPLACE FUNCTION public.is_enrolled_in_class(p_class_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_enrollments
    WHERE class_id = p_class_id
      AND student_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_enrolled_in_class(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_class(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS enrollments_select_classmate ON public.class_enrollments;

CREATE POLICY enrollments_select_classmate
  ON public.class_enrollments
  FOR SELECT
  TO authenticated
  USING (public.is_enrolled_in_class(class_id, auth.uid()));
