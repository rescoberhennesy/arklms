-- ============================================================================
-- start_quiz_attempt
-- ============================================================================
-- Idempotent. Returns existing in-progress attempt if one exists.
-- Errors if a submitted attempt exists (single-attempt model).

CREATE OR REPLACE FUNCTION start_quiz_attempt(
  p_activity_id uuid
)
RETURNS TABLE (
  attempt_id          uuid,
  started_at          timestamptz,
  time_limit_minutes  integer
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

  -- Idempotency: if an attempt exists, reuse if in-progress, error if submitted.
  SELECT qa.id, qa.started_at, qa.submitted_at
    INTO v_existing_id, v_existing_started, v_existing_submitted
  FROM quiz_attempts qa
  WHERE qa.activity_id = p_activity_id
    AND qa.student_id = v_user;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_submitted IS NOT NULL THEN
      RAISE EXCEPTION 'quiz already submitted';
    END IF;
    attempt_id := v_existing_id;
    started_at := v_existing_started;
    time_limit_minutes := v_time_limit;
    RETURN NEXT;
    RETURN;
  END IF;

  -- New attempt.
  INSERT INTO quiz_attempts (activity_id, student_id, started_at)
  VALUES (p_activity_id, v_user, now())
  RETURNING quiz_attempts.id, quiz_attempts.started_at
    INTO v_new_id, v_new_started;

  attempt_id := v_new_id;
  started_at := v_new_started;
  time_limit_minutes := v_time_limit;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION start_quiz_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION start_quiz_attempt(uuid) TO authenticated;

-- ============================================================================
-- submit_quiz_attempt
-- ============================================================================
-- Grades all auto-gradable responses, sums to attempts.auto_score, creates
-- activity_submission + activity_grade rows, links via attempts.submission_id.
-- If activities.auto_release_grade, sets returned_at = now() on the grade.
--
-- Score precedence: manual_points > auto_points (per response).
-- If any non-essay/non-short_answer response is missing, that question
-- counts 0 (no auto_correct, no auto_points).

CREATE OR REPLACE FUNCTION submit_quiz_attempt(
  p_attempt_id uuid
)
RETURNS TABLE (
  score          numeric,
  max_score      numeric,
  submission_id  uuid
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

  SELECT * INTO v_attempt FROM quiz_attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'attempt not found';
  END IF;
  IF v_attempt.student_id <> v_user THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;
  IF v_attempt.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'already submitted';
  END IF;

  SELECT * INTO v_activity FROM activities WHERE id = v_attempt.activity_id;

  -- Grade each question.
  FOR v_question IN
    SELECT id, question_kind, points, config
    FROM quiz_questions
    WHERE activity_id = v_activity.id
    ORDER BY display_order
  LOOP
    v_max_score := v_max_score + v_question.points;

    SELECT * INTO v_response
    FROM quiz_responses
    WHERE attempt_id = p_attempt_id
      AND question_id = v_question.id;

    -- Default: not answered, no credit (essay still goes through manual path)
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
          -- All-or-nothing: selected set must equal correct set exactly.
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
          -- All-or-nothing: pair set must equal exactly.
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
      WHERE id = v_response.id;

      IF v_points IS NOT NULL THEN
        v_total_score := v_total_score + v_points;
      END IF;
    END IF;
  END LOOP;

  -- Late?
  v_is_late := v_now > v_activity.due_at;

  -- Create activity_submission.
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
  RETURNING id INTO v_submission_id;

  -- Create activity_grade. auto_release_grade flips returned_at on insert.
  INSERT INTO activity_grades (
    submission_id, score, feedback, graded_by, returned_at
  )
  VALUES (
    v_submission_id,
    v_total_score,
    '',
    v_user,  -- auto-graded by the student's own submit; teacher overwrite later
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
  WHERE id = p_attempt_id;

  score := v_total_score;
  max_score := v_max_score;
  submission_id := v_submission_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION submit_quiz_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION submit_quiz_attempt(uuid) TO authenticated;

-- ============================================================================
-- recompute_quiz_score
-- ============================================================================
-- After teacher manually grades essay/short_answer responses (setting
-- quiz_responses.manual_points), recompute total = SUM(COALESCE(manual, auto, 0))
-- and update activity_grades.score.
--
-- Does NOT change returned_at; teacher controls release separately.

CREATE OR REPLACE FUNCTION recompute_quiz_score(
  p_attempt_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_attempt     quiz_attempts%ROWTYPE;
  v_class_id    uuid;
  v_total       numeric;
  v_submission_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_attempt FROM quiz_attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'attempt not found';
  END IF;

  SELECT a.class_id INTO v_class_id
  FROM activities a
  WHERE a.id = v_attempt.activity_id;

  -- Only the teacher may recompute (admins via direct SQL; we keep RPC tight).
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

  v_submission_id := v_attempt.submission_id;

  IF v_submission_id IS NOT NULL THEN
    UPDATE activity_grades
    SET score = v_total,
        graded_at = now()
    WHERE submission_id = v_submission_id;
  END IF;

  -- Track in attempts too so /grading view doesn't have to re-aggregate.
  UPDATE quiz_attempts
  SET manual_score_override = v_total
  WHERE id = p_attempt_id;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION recompute_quiz_score(uuid) FROM public;
GRANT EXECUTE ON FUNCTION recompute_quiz_score(uuid) TO authenticated;

COMMENT ON FUNCTION start_quiz_attempt(uuid) IS
  'Idempotent: returns in-progress attempt or creates a new one. Errors if quiz already submitted.';
COMMENT ON FUNCTION submit_quiz_attempt(uuid) IS
  'Auto-grades all auto-gradable responses, creates activity_submission + activity_grade, finalizes attempt.';
COMMENT ON FUNCTION recompute_quiz_score(uuid) IS
  'After teacher manual grading, recomputes total score (manual_points takes precedence over auto_points).';