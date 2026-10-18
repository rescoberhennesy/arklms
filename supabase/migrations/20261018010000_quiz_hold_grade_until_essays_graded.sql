-- ============================================================================
-- Quizzes with essays: hold the grade until the teacher grades every essay
-- ============================================================================
-- Before: submit_quiz_attempt always created an activity_grades row (essays
-- counted as 0) and, with auto_release_grade on, released it immediately.
-- The teacher's Activities tab then showed the quiz as "Graded" and the
-- student could see a partial score.
--
-- After:
--   1. submit_quiz_attempt only creates the grade row when there are no
--      answered essay questions waiting for a manual score.
--   2. recompute_quiz_score (runs on "Save grades") creates the grade row
--      once every answered essay has manual_points. If the quiz has
--      auto_release_grade on, the grade is released at that moment.
--      An existing grade keeps its returned_at (teacher controls release).
--   3. One-time cleanup: removes grade rows that were created early for
--      quizzes that still have ungraded essays.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. submit_quiz_attempt (same signature as 20260510090000)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_quiz_attempt(
  p_attempt_id uuid
)
RETURNS TABLE (
  out_score          numeric,
  out_max_score      numeric,
  out_submission_id  uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user             uuid := auth.uid();
  v_attempt          quiz_attempts%ROWTYPE;
  v_activity         activities%ROWTYPE;
  v_now              timestamptz := now();
  v_is_late          boolean := false;
  v_total_score      numeric := 0;
  v_max_score        numeric := 0;
  v_submission_id    uuid;
  v_question         RECORD;
  v_response         RECORD;
  v_correct          boolean;
  v_points           numeric;
  v_pending_manual   boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_attempt FROM quiz_attempts WHERE quiz_attempts.id = p_attempt_id;
  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'attempt not found';
  END IF;
  IF v_attempt.student_id <> v_user THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;
  IF v_attempt.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'already submitted';
  END IF;

  SELECT * INTO v_activity FROM activities WHERE activities.id = v_attempt.activity_id;

  FOR v_question IN
    SELECT quiz_questions.id, quiz_questions.question_kind,
           quiz_questions.points, quiz_questions.config
    FROM quiz_questions
    WHERE quiz_questions.activity_id = v_activity.id
    ORDER BY quiz_questions.display_order
  LOOP
    v_max_score := v_max_score + v_question.points;

    SELECT * INTO v_response
    FROM quiz_responses
    WHERE quiz_responses.attempt_id = p_attempt_id
      AND quiz_responses.question_id = v_question.id;

    v_correct := NULL;
    v_points := NULL;

    IF v_response.id IS NOT NULL THEN
      CASE v_question.question_kind
        WHEN 'mc_single' THEN
          v_correct := (
            (v_response.answer ->> 'selected')::int
            = ((v_question.config -> 'correct') -> 0)::int
          );
          v_points := CASE WHEN v_correct THEN v_question.points ELSE 0 END;

        WHEN 'mc_multi' THEN
          v_correct := (
            (
              SELECT COALESCE(array_agg(value::int ORDER BY value::int), ARRAY[]::int[])
              FROM jsonb_array_elements_text(v_response.answer -> 'selected')
            )
            =
            (
              SELECT COALESCE(array_agg(value::int ORDER BY value::int), ARRAY[]::int[])
              FROM jsonb_array_elements_text(v_question.config -> 'correct')
            )
          );
          v_points := CASE WHEN v_correct THEN v_question.points ELSE 0 END;

        WHEN 'true_false' THEN
          v_correct := (
            (v_response.answer ->> 'selected')::boolean
            = (v_question.config ->> 'correct')::boolean
          );
          v_points := CASE WHEN v_correct THEN v_question.points ELSE 0 END;

        WHEN 'short_answer' THEN
          v_correct := EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(v_question.config -> 'acceptable') AS a(val)
            WHERE
              CASE
                WHEN COALESCE((v_question.config ->> 'case_sensitive')::boolean, false)
                  THEN trim(v_response.answer ->> 'text') = trim(a.val)
                ELSE lower(trim(v_response.answer ->> 'text')) = lower(trim(a.val))
              END
          );
          v_points := CASE WHEN v_correct THEN v_question.points ELSE 0 END;

        WHEN 'matching' THEN
          v_correct := (
            (
              SELECT COALESCE(
                array_agg(
                  (elem -> 0)::text || ':' || (elem -> 1)::text
                  ORDER BY (elem -> 0)::text || ':' || (elem -> 1)::text
                ),
                ARRAY[]::text[]
              )
              FROM jsonb_array_elements(v_response.answer -> 'pairs') AS elem
            )
            =
            (
              SELECT COALESCE(
                array_agg(
                  (elem -> 0)::text || ':' || (elem -> 1)::text
                  ORDER BY (elem -> 0)::text || ':' || (elem -> 1)::text
                ),
                ARRAY[]::text[]
              )
              FROM jsonb_array_elements(v_question.config -> 'pairs') AS elem
            )
          );
          v_points := CASE WHEN v_correct THEN v_question.points ELSE 0 END;

        WHEN 'essay' THEN
          v_correct := NULL;
          v_points := NULL;
          -- Answered essay: the teacher must grade it before a score exists.
          IF v_response.manual_points IS NULL THEN
            v_pending_manual := true;
          END IF;
      END CASE;

      UPDATE quiz_responses
      SET auto_correct = v_correct,
          auto_points = v_points
      WHERE quiz_responses.id = v_response.id;

      IF v_points IS NOT NULL THEN
        v_total_score := v_total_score + v_points;
      END IF;
    END IF;
  END LOOP;

  v_is_late := v_now > v_activity.due_at;

  INSERT INTO activity_submissions (
    activity_id, student_id, submitted_at, text_body, is_late
  )
  VALUES (
    v_activity.id, v_user, v_now, '', v_is_late
  )
  ON CONFLICT (activity_id, student_id) DO UPDATE
    SET submitted_at = EXCLUDED.submitted_at,
        is_late      = EXCLUDED.is_late,
        text_body    = EXCLUDED.text_body
  RETURNING activity_submissions.id INTO v_submission_id;

  IF v_pending_manual THEN
    -- Hold the grade: no row means "To grade" for the teacher and no
    -- partial score for the student.
    DELETE FROM activity_grades
    WHERE activity_grades.submission_id = v_submission_id;
  ELSE
    INSERT INTO activity_grades (
      submission_id, score, feedback, graded_by, returned_at
    )
    VALUES (
      v_submission_id,
      v_total_score,
      '',
      v_user,
      CASE WHEN v_activity.auto_release_grade THEN v_now ELSE NULL END
    )
    ON CONFLICT (submission_id) DO UPDATE
      SET score       = EXCLUDED.score,
          graded_at   = v_now,
          returned_at = EXCLUDED.returned_at;
  END IF;

  UPDATE quiz_attempts
  SET submitted_at  = v_now,
      auto_score    = v_total_score,
      submission_id = v_submission_id
  WHERE quiz_attempts.id = p_attempt_id;

  out_score := v_total_score;
  out_max_score := v_max_score;
  out_submission_id := v_submission_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION submit_quiz_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION submit_quiz_attempt(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. recompute_quiz_score (same signature as 20260510080000)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_quiz_score(
  p_attempt_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user           uuid := auth.uid();
  v_attempt        quiz_attempts%ROWTYPE;
  v_class_id       uuid;
  v_auto_release   boolean;
  v_total          numeric;
  v_submission_id  uuid;
  v_pending_manual boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_attempt FROM quiz_attempts WHERE quiz_attempts.id = p_attempt_id;
  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'attempt not found';
  END IF;

  SELECT a.class_id, a.auto_release_grade
    INTO v_class_id, v_auto_release
  FROM activities a
  WHERE a.id = v_attempt.activity_id;

  IF NOT is_class_teacher(v_class_id, v_user) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_attempt.submitted_at IS NULL THEN
    RAISE EXCEPTION 'attempt not yet submitted';
  END IF;

  SELECT COALESCE(SUM(COALESCE(qr.manual_points, qr.auto_points, 0)), 0)
    INTO v_total
  FROM quiz_responses qr
  WHERE qr.attempt_id = p_attempt_id;

  -- Any answered essay still without a manual score?
  SELECT EXISTS (
    SELECT 1
    FROM quiz_responses qr
    JOIN quiz_questions qq ON qq.id = qr.question_id
    WHERE qr.attempt_id = p_attempt_id
      AND qq.question_kind = 'essay'
      AND qr.manual_points IS NULL
  ) INTO v_pending_manual;

  v_submission_id := v_attempt.submission_id;

  IF v_submission_id IS NOT NULL THEN
    IF v_pending_manual THEN
      -- Still waiting on essays: keep it in "To grade", no score shown.
      DELETE FROM activity_grades
      WHERE activity_grades.submission_id = v_submission_id;
    ELSE
      -- Everything graded: create the grade (released now if the quiz has
      -- auto-release on), or update an existing one without touching its
      -- release state.
      INSERT INTO activity_grades (
        submission_id, score, feedback, graded_by, returned_at
      )
      VALUES (
        v_submission_id,
        v_total,
        '',
        v_user,
        CASE WHEN v_auto_release THEN now() ELSE NULL END
      )
      ON CONFLICT (submission_id) DO UPDATE
        SET score     = EXCLUDED.score,
            graded_at = now(),
            graded_by = EXCLUDED.graded_by;
    END IF;
  END IF;

  UPDATE quiz_attempts
  SET manual_score_override = v_total
  WHERE quiz_attempts.id = p_attempt_id;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION recompute_quiz_score(uuid) FROM public;
GRANT EXECUTE ON FUNCTION recompute_quiz_score(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. One-time cleanup: remove grades created before essays were graded
-- ----------------------------------------------------------------------------
DELETE FROM activity_grades g
USING quiz_attempts qa
WHERE g.submission_id = qa.submission_id
  AND qa.submitted_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM quiz_responses qr
    JOIN quiz_questions qq ON qq.id = qr.question_id
    WHERE qr.attempt_id = qa.id
      AND qq.question_kind = 'essay'
      AND qr.manual_points IS NULL
  );