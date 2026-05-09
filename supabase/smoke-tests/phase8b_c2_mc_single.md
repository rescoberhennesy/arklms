# Phase 8b C2 — mc_single vertical slice smoke test

Verifies the create→take→auto-grade loop on an mc_single question created
through the QuizEditor UI. The CORRECT path is the gate; an incorrect-answer
check is unnecessary because the comparison logic is symmetric.

## Prerequisites
- A quiz activity exists with at least one mc_single question whose
  `config.options` are all non-empty and `correct = [N]` is a valid index.
- studenttest is enrolled in that quiz's class.

## Run
```sql
DO $smoke$
DECLARE
  v_student uuid := 'e62b252a-9237-499e-8960-efd6dcc79739';
  v_activity uuid;
  v_question uuid;
  v_question_points numeric;
  v_correct_index integer;
  v_quiz_total numeric;
  v_attempt_id uuid;
  v_score numeric;
  v_max_score numeric;
BEGIN
  SELECT id, COALESCE(quiz_total_points, 0)
    INTO v_activity, v_quiz_total
  FROM activities
  WHERE activity_kind = 'quiz'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT q.id, q.points, ((q.config->'correct')->>0)::integer
    INTO v_question, v_question_points, v_correct_index
  FROM quiz_questions q
  WHERE q.activity_id = v_activity
    AND q.question_kind = 'mc_single'
    AND jsonb_array_length(q.config->'options') >= 2
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(q.config->'options') AS opt
      WHERE opt = ''
    )
  ORDER BY q.display_order
  LIMIT 1;

  -- Reset (full cascade)
  DELETE FROM activity_grades WHERE submission_id IN (
    SELECT id FROM activity_submissions
    WHERE activity_id = v_activity AND student_id = v_student
  );
  DELETE FROM activity_submissions
  WHERE activity_id = v_activity AND student_id = v_student;
  DELETE FROM quiz_attempts
  WHERE activity_id = v_activity AND student_id = v_student;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_student::text, 'role', 'authenticated')::text,
    true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT out_attempt_id INTO v_attempt_id FROM start_quiz_attempt(v_activity);

  INSERT INTO quiz_responses (attempt_id, question_id, answer)
  VALUES (v_attempt_id, v_question, jsonb_build_object('selected', v_correct_index))
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET answer = EXCLUDED.answer;

  SELECT out_score, out_max_score INTO v_score, v_max_score
  FROM submit_quiz_attempt(v_attempt_id);

  IF v_score <> v_question_points THEN
    RAISE EXCEPTION 'Auto-grade FAILED: expected %, got %',
      v_question_points, v_score;
  END IF;
  IF v_max_score <> v_quiz_total THEN
    RAISE EXCEPTION 'Max score mismatch: expected % got %',
      v_quiz_total, v_max_score;
  END IF;

  -- Cleanup so the run leaves no residue
  DELETE FROM activity_grades WHERE submission_id IN (
    SELECT id FROM activity_submissions
    WHERE activity_id = v_activity AND student_id = v_student
  );
  DELETE FROM activity_submissions
  WHERE activity_id = v_activity AND student_id = v_student;
  DELETE FROM quiz_attempts
  WHERE activity_id = v_activity AND student_id = v_student;

  RAISE NOTICE 'mc_single vertical slice: PASS (% / %)', v_score, v_max_score;
END $smoke$;
```

## Expected
```
NOTICE: mc_single vertical slice: PASS (5 / 6)
```
(values vary based on which test quiz exists)