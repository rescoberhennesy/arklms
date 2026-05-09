-- ============================================================================
-- HELPER: is_student_in_class
-- ============================================================================
-- SECURITY DEFINER bypass to avoid RLS recursion when other tables' policies
-- need to check "does this user have an enrollment in this class". Without
-- this, quiz_questions RLS would recurse into class_enrollments policies.
--
-- Parallels is_class_teacher.

CREATE OR REPLACE FUNCTION is_student_in_class(
  p_class_id uuid,
  p_user_id  uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_enrollments ce
    WHERE ce.class_id = p_class_id
      AND ce.student_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION is_student_in_class(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION is_student_in_class(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION is_student_in_class(uuid, uuid) IS
  'SECURITY DEFINER: returns true if user has an enrollment row in the class. Used by quiz_* RLS to break recursion into class_enrollments policies.';

-- ============================================================================
-- RLS: quiz_questions
-- ============================================================================
-- Teachers (and admins): full CRUD on questions in their classes.
-- Students: SELECT only when activity is published AND the student has
--   started an attempt that hasn't been submitted. After submission,
--   if activities.show_correct_answers is true, students continue to see
--   the questions to review correct answers.

DROP POLICY IF EXISTS quiz_questions_select_teacher ON quiz_questions;
CREATE POLICY quiz_questions_select_teacher ON quiz_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_questions.activity_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
);

DROP POLICY IF EXISTS quiz_questions_select_admin ON quiz_questions;
CREATE POLICY quiz_questions_select_admin ON quiz_questions
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS quiz_questions_select_student ON quiz_questions;
CREATE POLICY quiz_questions_select_student ON quiz_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM activities a
    JOIN quiz_attempts qa
      ON qa.activity_id = a.id
     AND qa.student_id  = auth.uid()
    WHERE a.id = quiz_questions.activity_id
      AND a.published = true
      AND is_student_in_class(a.class_id, auth.uid())
      AND (
        qa.submitted_at IS NULL
        OR a.show_correct_answers = true
      )
  )
);

DROP POLICY IF EXISTS quiz_questions_insert_teacher ON quiz_questions;
CREATE POLICY quiz_questions_insert_teacher ON quiz_questions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_questions.activity_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
);

DROP POLICY IF EXISTS quiz_questions_update_teacher ON quiz_questions;
CREATE POLICY quiz_questions_update_teacher ON quiz_questions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_questions.activity_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_questions.activity_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
);

DROP POLICY IF EXISTS quiz_questions_delete_teacher ON quiz_questions;
CREATE POLICY quiz_questions_delete_teacher ON quiz_questions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_questions.activity_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
);

-- ============================================================================
-- RLS: quiz_attempts
-- ============================================================================
-- Students: SELECT/INSERT/UPDATE own attempts.
-- Teachers (and admins): SELECT all attempts in their classes.
--
-- Insert/update of attempts is mediated by RPCs (start_quiz_attempt,
-- submit_quiz_attempt) but we still need student-write RLS so the RPCs
-- (which run as the calling user, not SECURITY DEFINER) succeed.
-- The RPCs themselves enforce business rules like single-attempt and
-- "can't update after submitted".

DROP POLICY IF EXISTS quiz_attempts_select_self ON quiz_attempts;
CREATE POLICY quiz_attempts_select_self ON quiz_attempts
FOR SELECT
TO authenticated
USING (student_id = auth.uid());

DROP POLICY IF EXISTS quiz_attempts_select_teacher ON quiz_attempts;
CREATE POLICY quiz_attempts_select_teacher ON quiz_attempts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_attempts.activity_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
);

DROP POLICY IF EXISTS quiz_attempts_select_admin ON quiz_attempts;
CREATE POLICY quiz_attempts_select_admin ON quiz_attempts
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS quiz_attempts_insert_self ON quiz_attempts;
CREATE POLICY quiz_attempts_insert_self ON quiz_attempts
FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_attempts.activity_id
      AND a.published = true
      AND is_student_in_class(a.class_id, auth.uid())
  )
);

DROP POLICY IF EXISTS quiz_attempts_update_self ON quiz_attempts;
CREATE POLICY quiz_attempts_update_self ON quiz_attempts
FOR UPDATE
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

-- Teachers may update attempts in their class (e.g. to set manual_score_override
-- after grading essay questions).
DROP POLICY IF EXISTS quiz_attempts_update_teacher ON quiz_attempts;
CREATE POLICY quiz_attempts_update_teacher ON quiz_attempts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_attempts.activity_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM activities a
    WHERE a.id = quiz_attempts.activity_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
);

-- ============================================================================
-- RLS: quiz_responses
-- ============================================================================
-- Students: SELECT/INSERT/UPDATE own responses (via the attempt link).
-- Teachers: SELECT/UPDATE responses in their class (UPDATE for manual grading).

DROP POLICY IF EXISTS quiz_responses_select_self ON quiz_responses;
CREATE POLICY quiz_responses_select_self ON quiz_responses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM quiz_attempts qa
    WHERE qa.id = quiz_responses.attempt_id
      AND qa.student_id = auth.uid()
  )
);

DROP POLICY IF EXISTS quiz_responses_select_teacher ON quiz_responses;
CREATE POLICY quiz_responses_select_teacher ON quiz_responses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM quiz_attempts qa
    JOIN activities a ON a.id = qa.activity_id
    WHERE qa.id = quiz_responses.attempt_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
);

DROP POLICY IF EXISTS quiz_responses_select_admin ON quiz_responses;
CREATE POLICY quiz_responses_select_admin ON quiz_responses
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS quiz_responses_insert_self ON quiz_responses;
CREATE POLICY quiz_responses_insert_self ON quiz_responses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM quiz_attempts qa
    WHERE qa.id = quiz_responses.attempt_id
      AND qa.student_id = auth.uid()
      AND qa.submitted_at IS NULL
  )
);

DROP POLICY IF EXISTS quiz_responses_update_self ON quiz_responses;
CREATE POLICY quiz_responses_update_self ON quiz_responses
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM quiz_attempts qa
    WHERE qa.id = quiz_responses.attempt_id
      AND qa.student_id = auth.uid()
      AND qa.submitted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM quiz_attempts qa
    WHERE qa.id = quiz_responses.attempt_id
      AND qa.student_id = auth.uid()
      AND qa.submitted_at IS NULL
  )
);

DROP POLICY IF EXISTS quiz_responses_update_teacher ON quiz_responses;
CREATE POLICY quiz_responses_update_teacher ON quiz_responses
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM quiz_attempts qa
    JOIN activities a ON a.id = qa.activity_id
    WHERE qa.id = quiz_responses.attempt_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM quiz_attempts qa
    JOIN activities a ON a.id = qa.activity_id
    WHERE qa.id = quiz_responses.attempt_id
      AND is_class_teacher(a.class_id, auth.uid())
  )
);