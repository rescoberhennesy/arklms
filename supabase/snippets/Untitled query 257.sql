-- Helper: does the calling user share a class with the given enrollment row?
-- SECURITY DEFINER bypasses RLS on the inner SELECT, which is what
-- breaks the recursion when called from a policy ON class_enrollments.
CREATE OR REPLACE FUNCTION public.is_classmate_of(p_class_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments
    WHERE class_id = p_class_id
      AND student_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_classmate_of(UUID, UUID) TO authenticated;

-- Recreate the policy using the helper (no recursion now)
CREATE POLICY enrollments_select_classmate ON public.class_enrollments
  FOR SELECT
  TO authenticated
  USING (
    public.is_classmate_of(class_enrollments.class_id, auth.uid())
  );

COMMENT ON POLICY enrollments_select_classmate ON public.class_enrollments IS
  'Students can view enrollment rows for any class they are enrolled in (lets them see classmates). Uses is_classmate_of() to avoid RLS recursion.';