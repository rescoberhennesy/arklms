# Phase 8c — Dashboard widget data layer

Smoke test for `src/lib/actions/dashboard.ts`. Verifies the four actions
return the right shape against fixture data:

1. Student to-do surfaces an overdue unsubmitted assignment and an upcoming
   quiz with no attempt, but NOT a submitted assignment or a far-future one.
2. Teacher to-do surfaces an ungraded submission AND a separate quiz attempt
   with manual-pending essay.
3. Calendar queries return rows due in the target month, with drafts
   included for teachers and excluded for students.

Reuses studenttest's first class with teachertest as teacher (same
invariant the C7 smoke test established).

## How to run

```bash
docker exec -i $(docker ps -q -f name=supabase_db) psql -U postgres -d postgres <<'SQL'
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_teacher_id uuid := 'c5c425cb-40e1-4906-98d2-636a6b094a91';
  v_student_id uuid := 'e62b252a-9237-499e-8960-efd6dcc79739';

  v_class_id uuid;

  -- Fixture activities
  v_assn_overdue_id uuid;       -- assignment, due 2 days ago, unsubmitted → student to-do
  v_assn_done_id    uuid;       -- assignment, due tomorrow, SUBMITTED + ungraded → teacher to-do
  v_assn_far_id     uuid;       -- assignment, due in 14 days → drops out of student to-do
  v_quiz_unattempted_id uuid;   -- quiz, due in 3 days, no attempt → student to-do
  v_quiz_essay_pending_id uuid; -- quiz, submitted, essay manual_points null → teacher to-do
  v_quiz_draft_id   uuid;       -- quiz, published=false → teacher calendar only

  -- Fixture submission/attempt
  v_done_submission_id uuid;
  v_essay_q_id         uuid;
  v_essay_attempt_id   uuid;
  v_essay_submission_id uuid;

  -- Assertion counters
  v_count int;
BEGIN
  -- =====================================================================
  -- SETUP CLASS — same invariant as C7 smoke test.
  -- =====================================================================
  SELECT ce.class_id INTO v_class_id
  FROM class_enrollments ce
  JOIN classes c ON c.id = ce.class_id
  WHERE ce.student_id = v_student_id
    AND c.teacher_id = v_teacher_id
  ORDER BY ce.display_order ASC, ce.class_id ASC
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'No class with studenttest enrolled AND teachertest as teacher.';
  END IF;
  RAISE NOTICE '✔ Using class % for the smoke test.', v_class_id;

  -- =====================================================================
  -- FIXTURE 1: Overdue unsubmitted assignment (student to-do).
  -- =====================================================================
  INSERT INTO activities (
    class_id, term, activity_kind, title, instructions, prompt,
    max_points, start_at, due_at, allow_late, allow_resubmission,
    submission_type, display_order, published
  ) VALUES (
    v_class_id, 'prelim', 'assignment',
    'C8 Smoke: Overdue assignment',
    '', '',
    10, now() - interval '5 days', now() - interval '2 days',
    true, false, 'text', 9001, true
  )
  RETURNING id INTO v_assn_overdue_id;

  -- =====================================================================
  -- FIXTURE 2: Submitted assignment, no grade yet (teacher to-do).
  --   Student-side: drops out (submission exists).
  --   Teacher-side: surfaces in submission_ungraded bucket.
  -- =====================================================================
  INSERT INTO activities (
    class_id, term, activity_kind, title, instructions, prompt,
    max_points, start_at, due_at, allow_late, allow_resubmission,
    submission_type, display_order, published
  ) VALUES (
    v_class_id, 'prelim', 'assignment',
    'C8 Smoke: Submitted assignment',
    '', '',
    10, now() - interval '3 days', now() + interval '1 day',
    false, false, 'text', 9002, true
  )
  RETURNING id INTO v_assn_done_id;

  INSERT INTO activity_submissions (activity_id, student_id, text_body)
  VALUES (v_assn_done_id, v_student_id, 'My submission')
  RETURNING id INTO v_done_submission_id;

  -- =====================================================================
  -- FIXTURE 3: Far-future assignment (drops out of student 7-day horizon).
  -- =====================================================================
  INSERT INTO activities (
    class_id, term, activity_kind, title, instructions, prompt,
    max_points, start_at, due_at, allow_late, allow_resubmission,
    submission_type, display_order, published
  ) VALUES (
    v_class_id, 'prelim', 'assignment',
    'C8 Smoke: Far-future assignment',
    '', '',
    10, now() - interval '1 day', now() + interval '14 days',
    false, false, 'text', 9003, true
  )
  RETURNING id INTO v_assn_far_id;

  -- =====================================================================
  -- FIXTURE 4: Quiz due in 3 days, not attempted → student to-do.
  -- =====================================================================
  INSERT INTO activities (
    class_id, term, activity_kind, title, instructions, prompt,
    max_points, start_at, due_at, allow_late, allow_resubmission,
    submission_type, display_order, published,
    time_limit_minutes, shuffle_questions, auto_release_grade,
    show_correct_answers, quiz_total_points
  ) VALUES (
    v_class_id, 'prelim', 'quiz',
    'C8 Smoke: Unattempted quiz',
    '', '',
    5, now() - interval '1 day', now() + interval '3 days',
    false, false, 'none', 9004, true,
    null, false, true, true, 5
  )
  RETURNING id INTO v_quiz_unattempted_id;

  INSERT INTO quiz_questions (
    activity_id, question_kind, prompt, points, display_order,
    shuffle_options, config
  ) VALUES (
    v_quiz_unattempted_id, 'essay', 'Unattempted quiz essay', 5, 0, false, '{}'::jsonb
  );

  -- =====================================================================
  -- FIXTURE 5: Quiz submitted by student WITH pending essay (teacher to-do).
  --   Student-side: drops out (attempt submitted).
  --   Teacher-side: surfaces in quiz_manual_pending bucket.
  -- =====================================================================
  INSERT INTO activities (
    class_id, term, activity_kind, title, instructions, prompt,
    max_points, start_at, due_at, allow_late, allow_resubmission,
    submission_type, display_order, published,
    time_limit_minutes, shuffle_questions, auto_release_grade,
    show_correct_answers, quiz_total_points
  ) VALUES (
    v_class_id, 'prelim', 'quiz',
    'C8 Smoke: Essay-pending quiz',
    '', '',
    5, now() - interval '1 day', now() + interval '5 days',
    false, false, 'none', 9006, true,
    null, false, true, true, 5
  )
  RETURNING id INTO v_quiz_essay_pending_id;

  INSERT INTO quiz_questions (
    activity_id, question_kind, prompt, points, display_order,
    shuffle_options, config
  ) VALUES (
    v_quiz_essay_pending_id, 'essay', 'Essay question', 5, 0, false, '{}'::jsonb
  )
  RETURNING id INTO v_essay_q_id;

  -- Student impersonation for the quiz attempt flow.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student_id::text, 'role', 'authenticated')::text,
    true
  );

  SELECT out_attempt_id INTO v_essay_attempt_id
  FROM start_quiz_attempt(v_quiz_essay_pending_id);

  INSERT INTO quiz_responses (attempt_id, question_id, answer)
  VALUES (v_essay_attempt_id, v_essay_q_id, '{"text":"some answer"}'::jsonb);

  SELECT out_submission_id INTO v_essay_submission_id
  FROM submit_quiz_attempt(v_essay_attempt_id);

  -- Drop back to postgres before assertion SELECTs (Session 10 Bug 2).
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- =====================================================================
  -- FIXTURE 6: Draft quiz (teacher calendar only).
  -- =====================================================================
  INSERT INTO activities (
    class_id, term, activity_kind, title, instructions, prompt,
    max_points, start_at, due_at, allow_late, allow_resubmission,
    submission_type, display_order, published,
    time_limit_minutes, shuffle_questions, auto_release_grade,
    show_correct_answers, quiz_total_points
  ) VALUES (
    v_class_id, 'prelim', 'quiz',
    'C8 Smoke: Draft quiz',
    '', '',
    0, now() - interval '1 day', now() + interval '1 day',
    false, false, 'none', 9005, false,
    null, false, false, false, 0
  )
  RETURNING id INTO v_quiz_draft_id;

  RAISE NOTICE '✔ Fixtures created (6 activities, 1 submission, 1 quiz attempt).';

  -- =====================================================================
  -- ASSERTION 1 — STUDENT TO-DO
  -- Expected: 2 rows
  --   - v_assn_overdue_id    (overdue assignment, unsubmitted)
  --   - v_quiz_unattempted_id (quiz, no attempt, due in 3 days)
  -- Excluded:
  --   - v_assn_done_id        (assignment, submitted)
  --   - v_assn_far_id         (assignment, outside 7-day horizon)
  --   - v_quiz_essay_pending_id (quiz, attempt SUBMITTED)
  --   - v_quiz_draft_id       (quiz, unpublished)
  -- =====================================================================
  SELECT COUNT(*) INTO v_count
  FROM activities a
  WHERE a.class_id = v_class_id
    AND a.published = true
    AND a.start_at <= now()
    AND a.due_at < now() + interval '7 days'
    AND a.title LIKE 'C8 Smoke:%'
    AND (
      (a.activity_kind = 'assignment'
       AND NOT EXISTS (
         SELECT 1 FROM activity_submissions s
         WHERE s.activity_id = a.id AND s.student_id = v_student_id
       ))
      OR
      (a.activity_kind = 'quiz'
       AND NOT EXISTS (
         SELECT 1 FROM quiz_attempts qa
         WHERE qa.activity_id = a.id
           AND qa.student_id = v_student_id
           AND qa.submitted_at IS NOT NULL
       ))
    );
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Student to-do filter expected 2 rows, got %', v_count;
  END IF;
  RAISE NOTICE '✔ Student to-do: 2 rows (overdue assignment + unattempted quiz).';

  -- =====================================================================
  -- ASSERTION 2 — TEACHER UNGRADED SUBMISSIONS
  -- Expected: 1 row (v_done_submission_id, no activity_grades row).
  -- =====================================================================
  SELECT COUNT(*) INTO v_count
  FROM activity_submissions s
  JOIN activities a ON a.id = s.activity_id
  WHERE a.class_id = v_class_id
    AND a.activity_kind = 'assignment'
    AND a.title LIKE 'C8 Smoke:%'
    AND NOT EXISTS (
      SELECT 1 FROM activity_grades g
      WHERE g.submission_id = s.id AND g.returned_at IS NOT NULL
    );
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Teacher ungraded-submission filter expected 1, got %', v_count;
  END IF;
  RAISE NOTICE '✔ Teacher to-do: 1 ungraded assignment submission.';

  -- =====================================================================
  -- ASSERTION 3 — TEACHER QUIZ MANUAL-PENDING
  -- Expected: 1 attempt (v_essay_attempt_id, essay manual_points null).
  -- =====================================================================
  SELECT COUNT(DISTINCT qa.id) INTO v_count
  FROM quiz_attempts qa
  JOIN activities a ON a.id = qa.activity_id
  JOIN quiz_responses qr ON qr.attempt_id = qa.id
  JOIN quiz_questions qq ON qq.id = qr.question_id
  WHERE a.class_id = v_class_id
    AND qa.submitted_at IS NOT NULL
    AND qq.question_kind IN ('essay','short_answer')
    AND qr.manual_points IS NULL
    AND a.title LIKE 'C8 Smoke:%';
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Teacher quiz-manual-pending filter expected 1, got %', v_count;
  END IF;
  RAISE NOTICE '✔ Teacher to-do: 1 quiz attempt awaiting manual review.';

  -- =====================================================================
  -- ASSERTION 4 — TEACHER CALENDAR (this month)
  -- All 6 fixtures whose due_at falls in the current calendar month.
  -- Drafts are included for teachers.
  --
  -- We range-check rather than asserting an exact count because two
  -- fixtures (the 14-day-out assignment and the 5-day-out quiz) can roll
  -- into next month depending on the day-of-month at run time:
  --   - Best case (early in month): all 6 in current month
  --   - Worst case (late in month): some roll over to next month
  -- Lower bound: at minimum the 4 "near" fixtures (overdue, tomorrow,
  -- 3-days, 1-day-draft) should land in current month.
  -- =====================================================================
  SELECT COUNT(*) INTO v_count
  FROM activities a
  WHERE a.class_id = v_class_id
    AND a.title LIKE 'C8 Smoke:%'
    AND a.due_at >= date_trunc('month', now())
    AND a.due_at <  date_trunc('month', now() + interval '1 month');
  IF v_count < 4 OR v_count > 6 THEN
    RAISE EXCEPTION 'Teacher calendar expected 4–6 rows this month, got %', v_count;
  END IF;
  RAISE NOTICE '✔ Teacher calendar: % activities this month (drafts included).', v_count;

  -- =====================================================================
  -- ASSERTION 5 — STUDENT CALENDAR (this month, published only)
  -- One less than teacher: the draft quiz is excluded.
  -- =====================================================================
  SELECT COUNT(*) INTO v_count
  FROM activities a
  WHERE a.class_id = v_class_id
    AND a.title LIKE 'C8 Smoke:%'
    AND a.published = true
    AND a.due_at >= date_trunc('month', now())
    AND a.due_at <  date_trunc('month', now() + interval '1 month');
  IF v_count < 3 OR v_count > 5 THEN
    RAISE EXCEPTION 'Student calendar expected 3–5 rows this month, got %', v_count;
  END IF;
  RAISE NOTICE '✔ Student calendar: % activities this month (drafts excluded).', v_count;

  -- =====================================================================
  -- CLEANUP — delete the 6 activities; cascades take submissions, attempts,
  -- responses, grades.
  -- =====================================================================
  DELETE FROM activities WHERE id IN (
    v_assn_overdue_id,
    v_assn_done_id,
    v_assn_far_id,
    v_quiz_unattempted_id,
    v_quiz_essay_pending_id,
    v_quiz_draft_id
  );
  RAISE NOTICE '✔ Cleanup complete.';

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'PHASE 8c SLICE A SMOKE TEST PASSED';
  RAISE NOTICE '════════════════════════════════════════════';
END;
$$;
SQL
```

## What this exercises

- Student to-do core predicate: published, started, unsubmitted-or-no-attempt, within 7-day horizon.
- Teacher ungraded-submission filter.
- Teacher quiz-manual-pending filter (essay/short_answer with manual_points null).
- Calendar published-vs-draft visibility split.
- Role impersonation switching for the student attempt flow.

## Known caveats

- This validates the SQL predicates, NOT the TypeScript action layer's in-memory filters / sorts / limits. The TS layer is pure functions over the fetched rows; cover them with browser testing in Slice B+ or unit tests later.
- Calendar counts are range-checked (not exact) because fixtures with `due_at` near month boundary can roll over depending on when the test runs.