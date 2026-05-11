# Phase 8b C7 — Teacher quiz grader manual-override path

End-to-end smoke test for the teacher manual-grading flow. Uses studenttest's
first class enrollment so we don't have to know specific class names. Cleanup
deletes only the quiz this test created.

## How to run

```bash
docker exec -i $(docker ps -q -f name=supabase_db) psql -U postgres -d postgres <<'SQL'
\set ON_ERROR_STOP on

DO $$
DECLARE
  -- Test accounts (Session 4–10 carry-forward).
  v_teacher_id  uuid := 'c5c425cb-40e1-4906-98d2-636a6b094a91';
  v_student_id  uuid := 'e62b252a-9237-499e-8960-efd6dcc79739';

  v_class_id    uuid;
  v_quiz_id     uuid;
  v_q_mc_id     uuid;
  v_q_tf_id     uuid;
  v_q_essay_id  uuid;
  v_attempt_id  uuid;
  v_response_id uuid;
  v_submission_id uuid;
  v_grade_returned_at_before timestamptz;
  v_grade_returned_at_after  timestamptz;
  v_auto_score        numeric;
  v_auto_score_after  numeric;
  v_override_score    numeric;
  v_grade_score       numeric;
  v_needs_manual      boolean;
BEGIN
  -- =====================================================================
  -- SETUP: pick studenttest's first enrolled class, requiring teachertest
  -- to be the teacher (so the recompute auth gate later succeeds without
  -- a separate fix migration).
  -- =====================================================================
  SELECT ce.class_id INTO v_class_id
  FROM class_enrollments ce
  JOIN classes c ON c.id = ce.class_id
  WHERE ce.student_id = v_student_id
    AND c.teacher_id = v_teacher_id
  ORDER BY ce.display_order ASC, ce.class_id ASC
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION
      'No class found where studenttest is enrolled AND teachertest is the teacher. '
      'Seed at least one such class to run this smoke test.';
  END IF;
  RAISE NOTICE '✔ Using class % for the smoke test.', v_class_id;

  -- =====================================================================
  -- 1. TEACHER: create a quiz with auto_release_grade = true.
  -- =====================================================================
  INSERT INTO activities (
    class_id, term, activity_kind, title, instructions, prompt,
    max_points, due_at, allow_late, allow_resubmission, submission_type,
    display_order, published,
    time_limit_minutes, shuffle_questions, auto_release_grade,
    show_correct_answers, quiz_total_points
  ) VALUES (
    v_class_id, 'prelim', 'quiz',
    'C7 Smoke Quiz (delete me)',
    '', '',
    0, now() + interval '7 days', false, false, 'none',
    9999, true,
    null, false, true,
    true, 0
  )
  RETURNING id INTO v_quiz_id;

  INSERT INTO quiz_questions (
    activity_id, question_kind, prompt, points, display_order,
    shuffle_options, config
  ) VALUES (
    v_quiz_id, 'mc_single', 'Capital of France?', 2, 0, false,
    '{"options":["Berlin","Paris","Rome","Madrid"],"correct":[1]}'::jsonb
  )
  RETURNING id INTO v_q_mc_id;

  INSERT INTO quiz_questions (
    activity_id, question_kind, prompt, points, display_order,
    shuffle_options, config
  ) VALUES (
    v_quiz_id, 'true_false', '2 + 2 = 4', 1, 1, false,
    '{"correct":true}'::jsonb
  )
  RETURNING id INTO v_q_tf_id;

  INSERT INTO quiz_questions (
    activity_id, question_kind, prompt, points, display_order,
    shuffle_options, config
  ) VALUES (
    v_quiz_id, 'essay', 'Explain why the sky is blue.', 5, 2, false,
    '{}'::jsonb
  )
  RETURNING id INTO v_q_essay_id;

  UPDATE activities
  SET quiz_total_points = (
        SELECT COALESCE(SUM(points), 0) FROM quiz_questions WHERE activity_id = v_quiz_id
      ),
      max_points = (
        SELECT COALESCE(SUM(points), 0) FROM quiz_questions WHERE activity_id = v_quiz_id
      )
  WHERE id = v_quiz_id;

  RAISE NOTICE '✔ Quiz created with 3 questions (total points = 8).';

  -- =====================================================================
  -- 2. STUDENT: start attempt + answer.
  -- =====================================================================
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student_id::text, 'role', 'authenticated')::text,
    true
  );

  SELECT out_attempt_id INTO v_attempt_id
  FROM start_quiz_attempt(v_quiz_id);

  INSERT INTO quiz_responses (attempt_id, question_id, answer)
  VALUES (v_attempt_id, v_q_mc_id, '{"selected":1}'::jsonb);

  INSERT INTO quiz_responses (attempt_id, question_id, answer)
  VALUES (v_attempt_id, v_q_tf_id, '{"selected":true}'::jsonb);

  INSERT INTO quiz_responses (attempt_id, question_id, answer)
  VALUES (
    v_attempt_id, v_q_essay_id,
    '{"text":"Rayleigh scattering — short wavelengths scatter more."}'::jsonb
  );

  -- 3. Submit.
  SELECT out_submission_id INTO v_submission_id
  FROM submit_quiz_attempt(v_attempt_id);

  -- =====================================================================
  -- Drop back to postgres BEFORE assertion SELECTs (Session 10 Bug 2).
  -- =====================================================================
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- =====================================================================
  -- 4. Verify auto-score = 3 (mc 2 + tf 1; essay deferred).
  -- =====================================================================
  SELECT auto_score INTO v_auto_score
  FROM quiz_attempts WHERE id = v_attempt_id;

  IF v_auto_score IS NULL OR v_auto_score != 3 THEN
    RAISE EXCEPTION 'auto_score mismatch: expected 3, got %', v_auto_score;
  END IF;
  RAISE NOTICE '✔ Auto-score = 3 (mc 2pt + tf 1pt, essay deferred).';

  SELECT EXISTS (
    SELECT 1
    FROM quiz_responses r
    JOIN quiz_questions q ON q.id = r.question_id
    WHERE r.attempt_id = v_attempt_id
      AND q.question_kind IN ('essay','short_answer')
      AND r.manual_points IS NULL
  ) INTO v_needs_manual;

  IF NOT v_needs_manual THEN
    RAISE EXCEPTION 'Expected needsManualReview = true after submit, got false';
  END IF;
  RAISE NOTICE '✔ needsManualReview = true (essay awaits grading).';

  -- =====================================================================
  -- 5. Verify auto-release set returned_at.
  -- =====================================================================
  SELECT returned_at INTO v_grade_returned_at_before
  FROM activity_grades
  WHERE submission_id = v_submission_id;

  IF v_grade_returned_at_before IS NULL THEN
    RAISE EXCEPTION 'Expected returned_at to be set after auto-release submit, got null';
  END IF;
  RAISE NOTICE '✔ Grade auto-released at %.', v_grade_returned_at_before;

  -- =====================================================================
  -- 6. TEACHER: write manual_points + feedback (plain UPDATE; the action
  --    layer setManualResponseGrade just does this), then impersonate the
  --    teacher to call recompute_quiz_score (the RPC gates on
  --    is_class_teacher(class, auth.uid())).
  -- =====================================================================
  SELECT id INTO v_response_id
  FROM quiz_responses
  WHERE attempt_id = v_attempt_id AND question_id = v_q_essay_id;

  UPDATE quiz_responses
  SET manual_points = 4,
      feedback = 'Good — could mention shorter wavelengths more clearly.'
  WHERE id = v_response_id;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_teacher_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM recompute_quiz_score(v_attempt_id);

  -- Drop back to postgres again before reading.
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- =====================================================================
  -- 7. Verify final score. recompute_quiz_score writes the new total to
  --    manual_score_override (NOT auto_score). auto_score stays at the
  --    original auto-grade.
  -- =====================================================================
  SELECT auto_score, manual_score_override
    INTO v_auto_score_after, v_override_score
  FROM quiz_attempts WHERE id = v_attempt_id;

  IF v_auto_score_after IS DISTINCT FROM v_auto_score THEN
    RAISE EXCEPTION
      'auto_score changed unexpectedly: before=%, after=%',
      v_auto_score, v_auto_score_after;
  END IF;

  IF v_override_score IS NULL OR v_override_score != 7 THEN
    RAISE EXCEPTION
      'manual_score_override mismatch: expected 7, got %', v_override_score;
  END IF;
  RAISE NOTICE '✔ manual_score_override = 7 (2 + 1 + 4); auto_score preserved at %.', v_auto_score_after;

  -- =====================================================================
  -- 8. returned_at preservation (Session 11 locked design).
  -- =====================================================================
  SELECT returned_at INTO v_grade_returned_at_after
  FROM activity_grades
  WHERE submission_id = v_submission_id;

  IF v_grade_returned_at_after IS DISTINCT FROM v_grade_returned_at_before THEN
    RAISE EXCEPTION
      'returned_at was modified by recompute_quiz_score: before=%, after=%',
      v_grade_returned_at_before, v_grade_returned_at_after;
  END IF;
  RAISE NOTICE '✔ returned_at preserved (% → %).',
    v_grade_returned_at_before, v_grade_returned_at_after;

  -- 9. needsManualReview = false now.
  SELECT EXISTS (
    SELECT 1
    FROM quiz_responses r
    JOIN quiz_questions q ON q.id = r.question_id
    WHERE r.attempt_id = v_attempt_id
      AND q.question_kind IN ('essay','short_answer')
      AND r.manual_points IS NULL
  ) INTO v_needs_manual;

  IF v_needs_manual THEN
    RAISE EXCEPTION 'Expected needsManualReview = false after grading, got true';
  END IF;
  RAISE NOTICE '✔ needsManualReview = false after manual grade.';

  -- 10. activity_grades.score reflects the recomputed value.
  SELECT score INTO v_grade_score
  FROM activity_grades WHERE submission_id = v_submission_id;
  IF v_grade_score IS DISTINCT FROM v_override_score THEN
    RAISE EXCEPTION
      'activity_grades.score does not match recomputed score (expected %, got %)',
      v_override_score, v_grade_score;
  END IF;
  RAISE NOTICE '✔ activity_grades.score updated to %.', v_grade_score;

  -- =====================================================================
  -- CLEANUP.
  -- =====================================================================
  DELETE FROM activities WHERE id = v_quiz_id;
  RAISE NOTICE '✔ Cleanup complete (quiz deleted, class preserved).';

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'C7 SMOKE TEST PASSED';
  RAISE NOTICE '════════════════════════════════════════════';
END;
$$;
SQL
```

## What this exercises

- `start_quiz_attempt` + `submit_quiz_attempt` RPCs (student impersonation).
- `recompute_quiz_score` RPC under teacher impersonation (the RPC gates on
  `is_class_teacher(class, auth.uid())`).
- Auto-release path: submit creates `activity_grades.returned_at`.
- Manual override write semantics: `manual_points` is a plain UPDATE; the
  recompute pushes the new total into `quiz_attempts.manual_score_override`
  and `activity_grades.score`, leaving `auto_score` untouched.
- `returned_at` preservation across recompute (Session 11 locked decision).
- `needsManualReview` derivation, matching the action layer.

## Known caveats

- Depends on at least one class where studenttest is enrolled AND teachertest
  is the teacher (the recompute auth gate requires teacher ownership).
- Role-reset to `postgres` before assertion SELECTs is critical (Session 10
  Bug 2). Plain SELECTs respect RLS; `SECURITY DEFINER` RPCs don't, but they
  still read `auth.uid()`.
- `recompute_quiz_score` writes the total to `quiz_attempts.manual_score_override`
  (NOT `auto_score`). The grader UI reads `manual_score_override ?? auto_score`
  via `getAttemptForGrading.currentScore`.