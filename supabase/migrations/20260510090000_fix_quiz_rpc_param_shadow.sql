-- Fix: submit_quiz_attempt's OUT param `submission_id` shadowed the
-- activity_grades.submission_id column inside its INSERT ... ON CONFLICT clause,
-- producing "column reference is ambiguous" at runtime.
--
-- Same gotcha bites recompute_quiz_score-adjacent code if anything in there
-- shadows a column name. Renaming the OUT params on submit_quiz_attempt
-- avoids the issue without changing the public contract for callers using
-- positional access.
--
-- start_quiz_attempt also returns columns; renamed for symmetry and to
-- preempt any future shadow.
--
-- IMPORTANT: must DROP FUNCTION first because Postgres treats RETURNS TABLE
-- column names as part of the function signature; CREATE OR REPLACE rejects
-- changes to OUT parameter names.

DROP FUNCTION IF EXISTS submit_quiz_attempt(uuid);
DROP FUNCTION IF EXISTS start_quiz_attempt(uuid);

-- ============================================================================
-- start_quiz_attempt (renamed OUT params for symmetry)
-- ============================================================================
CREATE FUNCTION start_quiz_attempt(
  p_activity_id uuid
)
RETURNS TABLE (
  out_attempt_id          uuid,
  out_started_at          timestamptz,
  out_time_limit_minutes  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user           uuid := auth.uid();
  v_class_id       uuid;
  v_published      boolean;
  v_kind           activity_kind;
  v_time_limit     integer;
  v_existing_id    uuid;
  v_existing_started timestamptz;
  v_existing_submitted timestamptz;
  v_new_id         uuid;
  v_new_started    timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT a.class_id, a.published, a.activity_kind, a.time_limit_minutes
    INTO v_class_id, v_published, v_kind, v_time_limit
  FROM activities a
  WHERE a.id = p_activity_id;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'activity not found';
  END IF;

  IF v_kind <> 'quiz' THEN
    RAISE EXCEPTION 'activity is not a quiz';
  END IF;

  IF NOT v_published THEN
    RAISE EXCEPTION 'quiz is not published';
  END IF;

  IF NOT is_student_in_class(v_class_id, v_user) THEN
    RAISE EXCEPTION 'not enrolled in class';
  END IF;

  SELECT qa.id, qa.started_at, qa.submitted_at
    INTO v_existing_id, v_existing_started, v_existing_submitted
  FROM quiz_attempts qa
  WHERE qa.activity_id = p_activity_id
    AND qa.student_id = v_user;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_submitted IS NOT NULL THEN
      RAISE EXCEPTION 'quiz already submitted';
    END IF;
    out_attempt_id := v_existing_id;
    out_started_at := v_existing_started;
    out_time_limit_minutes := v_time_limit;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO quiz_attempts (activity_id, student_id, started_at)
  VALUES (p_activity_id, v_user, now())
  RETURNING quiz_attempts.id, quiz_attempts.started_at
    INTO v_new_id, v_new_started;

  out_attempt_id := v_new_id;
  out_started_at := v_new_started;
  out_time_limit_minutes := v_time_limit;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION start_quiz_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION start_quiz_attempt(uuid) TO authenticated;

-- ============================================================================
-- submit_quiz_attempt (out_* prefixed OUT params, fully-qualified column refs)
-- ============================================================================
CREATE FUNCTION submit_quiz_attempt(
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

  -- Grade each question.
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
              SELECT COALESCE(
                array_agg(value::int ORDER BY value::int),
                ARRAY[]::int[]
              )
              FROM jsonb_array_elements_text(v_response.answer -> 'selected')
            )
            =
            (
              SELECT COALESCE(
                array_agg(value::int ORDER BY value::int),
                ARRAY[]::int[]
              )
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

  -- Create activity_submission. Fully-qualified target columns (was fine
  -- before, kept that way).
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

  -- Create activity_grade. ON CONFLICT (submission_id) is the column, not
  -- the OUT param, but with the rename to out_submission_id this is no
  -- longer ambiguous either way.
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

  -- Finalize attempt.
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