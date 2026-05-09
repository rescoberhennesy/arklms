-- supabase/migrations/20260509030001_fix_submission_update_recursion.sql
--
-- Fixup for Migration 3.
-- The UPDATE policy on activity_submissions referenced activity_grades,
-- which has its own RLS policy referencing activity_submissions, causing
-- infinite recursion when students tried to update their own submission.
--
-- Fix: use a SECURITY DEFINER helper that checks for grade existence
-- without going through activity_grades RLS. Same pattern as
-- is_class_teacher() and get_user_role() elsewhere in this codebase.

CREATE OR REPLACE FUNCTION submission_has_grade(p_submission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM activity_grades g
    WHERE g.submission_id = p_submission_id
  );
$$;

REVOKE ALL ON FUNCTION submission_has_grade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submission_has_grade(uuid) TO authenticated;

COMMENT ON FUNCTION submission_has_grade(uuid) IS
  'SECURITY DEFINER helper to check grade existence without triggering activity_grades RLS. Used by activity_submissions UPDATE policy to avoid recursion.';

-- Re-create the UPDATE policy using the helper
CREATE POLICY activity_submissions_student_update ON activity_submissions
  FOR UPDATE
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_submissions.activity_id
        AND a.published = true
        AND a.start_at <= now()
        AND (now() <= a.due_at OR a.allow_late = true)
        AND (
          NOT submission_has_grade(activity_submissions.id)
          OR a.allow_resubmission = true
        )
    )
  )
  WITH CHECK (student_id = auth.uid());
