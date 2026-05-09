-- supabase/migrations/20260509030000_activity_grades.sql
--
-- Phase 8a Layer A — Migration 3 of 5
-- Activity grades + the deferred UPDATE policy on activity_submissions.
--
-- Design notes:
-- * UNIQUE(submission_id) — strictly 1:1 with submission. Re-grading is
--   UPDATE in place, not INSERT a new row.
-- * returned_at is the "released to student" timestamp. NULL = teacher
--   has graded but not yet released; student cannot SELECT.
-- * No updated_at trigger — graded_at and returned_at carry the temporal
--   info we need.
-- * The deferred UPDATE policy on activity_submissions is added at the
--   end of this file. It governs: a student can update their own
--   submission only if no grade exists OR allow_resubmission = true.
--   Action layer (Migration 5) will atomically clear the grade row on
--   resubmit; the policy doesn't need to enforce that.

-- activity_grades -----------------------------------------------------------

CREATE TABLE activity_grades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES activity_submissions(id) ON DELETE CASCADE,
  score           numeric(8, 2) NOT NULL CHECK (score >= 0),
  feedback        text NOT NULL DEFAULT '',
  graded_by       uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  graded_at       timestamptz NOT NULL DEFAULT now(),
  returned_at     timestamptz,

  CONSTRAINT activity_grades_unique_per_submission UNIQUE (submission_id)
);

CREATE INDEX activity_grades_submission_idx
  ON activity_grades (submission_id);

-- Index for the "find unreturned grades for an activity" query that
-- powers the bulk-return-grades RPC and teacher gradebook view.
CREATE INDEX activity_grades_unreturned_idx
  ON activity_grades (returned_at)
  WHERE returned_at IS NULL;

-- RLS: activity_grades ------------------------------------------------------

ALTER TABLE activity_grades ENABLE ROW LEVEL SECURITY;

-- SELECT: admin always
CREATE POLICY activity_grades_admin_select ON activity_grades
  FOR SELECT
  USING (get_user_role(auth.uid()) = 'admin');

-- SELECT: teacher of the class (regardless of return state)
CREATE POLICY activity_grades_teacher_select ON activity_grades
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      JOIN activities a ON a.id = s.activity_id
      WHERE s.id = activity_grades.submission_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  );

-- SELECT: student sees own grade, but ONLY when returned_at IS NOT NULL
CREATE POLICY activity_grades_student_select ON activity_grades
  FOR SELECT
  USING (
    returned_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM activity_submissions s
      WHERE s.id = activity_grades.submission_id
        AND s.student_id = auth.uid()
    )
  );

-- INSERT: teacher of the class only, and graded_by must be self
CREATE POLICY activity_grades_teacher_insert ON activity_grades
  FOR INSERT
  WITH CHECK (
    graded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM activity_submissions s
      JOIN activities a ON a.id = s.activity_id
      WHERE s.id = activity_grades.submission_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  );

-- UPDATE: teacher of the class (re-grading or releasing)
CREATE POLICY activity_grades_teacher_update ON activity_grades
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      JOIN activities a ON a.id = s.activity_id
      WHERE s.id = activity_grades.submission_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      JOIN activities a ON a.id = s.activity_id
      WHERE s.id = activity_grades.submission_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  );

-- DELETE: teacher of the class (un-grade flow, e.g. before a resubmit)
CREATE POLICY activity_grades_teacher_delete ON activity_grades
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM activity_submissions s
      JOIN activities a ON a.id = s.activity_id
      WHERE s.id = activity_grades.submission_id
        AND is_class_teacher(a.class_id, auth.uid())
    )
  );

-- Deferred UPDATE policy on activity_submissions ----------------------------
-- Now that activity_grades exists, we can add this policy.
-- A student can update their own submission only if:
--   * Activity is published and within the submission window, AND
--   * No grade exists OR the activity allows resubmission

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
          NOT EXISTS (
            SELECT 1 FROM activity_grades g
            WHERE g.submission_id = activity_submissions.id
          )
          OR a.allow_resubmission = true
        )
    )
  )
  WITH CHECK (student_id = auth.uid());

-- Comments ------------------------------------------------------------------

COMMENT ON TABLE activity_grades IS '1:1 with activity_submissions. NULL returned_at = graded but not yet released to student.';
COMMENT ON COLUMN activity_grades.returned_at IS 'When the teacher released this grade to the student. NULL until released.';
COMMENT ON COLUMN activity_grades.graded_by IS 'Teacher who entered the grade. ON DELETE RESTRICT to preserve audit trail.';
