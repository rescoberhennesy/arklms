# Phase 12 smoke test — personal_tasks

Verifies the new `personal_tasks` table behaves correctly: RLS scopes
to owner, soft-delete via `completed_at` works, updated_at trigger fires,
and the optional `due_at` column is truly nullable.

## Setup — confirm schema

```bash
docker exec -i $(docker ps -q -f name=supabase_db) psql -U postgres -d postgres <<'SQL'
\d public.personal_tasks
SELECT polname FROM pg_policy WHERE polrelid = 'public.personal_tasks'::regclass ORDER BY polname;
SQL
```

Expected: 5 policies (the four CREATE POLICY statements above), columns
match the migration, partial indexes present.

## Run smoke test

```bash
docker exec -i $(docker ps -q -f name=supabase_db) psql -U postgres -d postgres <<'SQL'
DO $$
DECLARE
  v_teacher_id uuid := 'c5c425cb-40e1-4906-98d2-636a6b094a91'; -- teachertest
  v_student_id uuid := 'e62b252a-9237-499e-8960-efd6dcc79739'; -- studenttest
  v_task_dated_id uuid;
  v_task_undated_id uuid;
  v_count int;
  v_completed_at timestamptz;
  v_initial_updated_at timestamptz;
  v_new_updated_at timestamptz;
BEGIN
  -- ✔ 1. Teacher inserts a dated personal task
  SET LOCAL ROLE authenticated;
  SET LOCAL "request.jwt.claims" = '{"sub":"c5c425cb-40e1-4906-98d2-636a6b094a91","role":"authenticated"}';

  INSERT INTO public.personal_tasks (owner_id, title, notes, due_at)
  VALUES (v_teacher_id, 'Prep lecture slides', 'Plate tectonics intro', now() + interval '2 days')
  RETURNING id INTO v_task_dated_id;
  RAISE NOTICE '✔ 1. Teacher created dated task %', v_task_dated_id;

  -- ✔ 2. Teacher inserts an undated personal task (due_at NULL)
  INSERT INTO public.personal_tasks (owner_id, title)
  VALUES (v_teacher_id, 'Reply to admin emails')
  RETURNING id INTO v_task_undated_id;
  RAISE NOTICE '✔ 2. Teacher created undated task %', v_task_undated_id;

  -- ✔ 3. Teacher sees own active tasks (both)
  SELECT count(*) INTO v_count
  FROM public.personal_tasks
  WHERE owner_id = v_teacher_id AND completed_at IS NULL;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Expected teacher to see 2 active tasks, saw %', v_count;
  END IF;
  RAISE NOTICE '✔ 3. Teacher sees 2 own active tasks';

  -- ✔ 4. Teacher CANNOT insert a task owned by the student (RLS WITH CHECK)
  BEGIN
    INSERT INTO public.personal_tasks (owner_id, title)
    VALUES (v_student_id, 'Sneaky impersonation');
    RAISE EXCEPTION 'Expected RLS to block cross-owner insert';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE '✔ 4. Teacher blocked from inserting student-owned task';
    WHEN OTHERS THEN
      -- Supabase returns RLS violations as 42501 (insufficient_privilege)
      -- but cross-role RLS often surfaces as a permission error too.
      IF SQLSTATE = '42501' THEN
        RAISE NOTICE '✔ 4. Teacher blocked from inserting student-owned task';
      ELSE
        RAISE;
      END IF;
  END;

  -- Switch to student
  SET LOCAL "request.jwt.claims" = '{"sub":"e62b252a-9237-499e-8960-efd6dcc79739","role":"authenticated"}';

  -- ✔ 5. Student sees ZERO of the teacher's tasks (RLS scopes by owner_id)
  SELECT count(*) INTO v_count
  FROM public.personal_tasks
  WHERE id IN (v_task_dated_id, v_task_undated_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Expected student to see 0 teacher tasks, saw %', v_count;
  END IF;
  RAISE NOTICE '✔ 5. Student cannot read teacher tasks';

  -- ✔ 6. Student cannot UPDATE teacher's task (zero rows match)
  UPDATE public.personal_tasks
  SET title = 'hijacked'
  WHERE id = v_task_dated_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Expected student to be blocked from updating teacher task';
  END IF;
  RAISE NOTICE '✔ 6. Student blocked from updating teacher task';

  -- ✔ 7. Student cannot DELETE teacher's task (zero rows match)
  DELETE FROM public.personal_tasks WHERE id = v_task_dated_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Expected student to be blocked from deleting teacher task';
  END IF;
  RAISE NOTICE '✔ 7. Student blocked from deleting teacher task';

  -- Back to teacher to test own updates
  SET LOCAL "request.jwt.claims" = '{"sub":"c5c425cb-40e1-4906-98d2-636a6b094a91","role":"authenticated"}';

  -- ✔ 8. Soft-delete via completed_at
  -- Capture updated_at first to verify the trigger fires.
  SELECT updated_at INTO v_initial_updated_at
  FROM public.personal_tasks WHERE id = v_task_dated_id;

  PERFORM pg_sleep(0.05); -- ensure measurable timestamp delta

  UPDATE public.personal_tasks
  SET completed_at = now()
  WHERE id = v_task_dated_id;

  SELECT completed_at, updated_at
  INTO v_completed_at, v_new_updated_at
  FROM public.personal_tasks WHERE id = v_task_dated_id;

  IF v_completed_at IS NULL THEN
    RAISE EXCEPTION 'Expected completed_at to be set after soft-delete';
  END IF;
  IF v_new_updated_at = v_initial_updated_at THEN
    RAISE EXCEPTION 'Expected updated_at to advance via trigger';
  END IF;
  RAISE NOTICE '✔ 8. Soft-delete sets completed_at and trigger bumps updated_at';

  -- ✔ 9. Active count drops to 1 after soft-delete
  SELECT count(*) INTO v_count
  FROM public.personal_tasks
  WHERE owner_id = v_teacher_id AND completed_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected 1 active task after soft-delete, saw %', v_count;
  END IF;
  RAISE NOTICE '✔ 9. Active task count is 1 after soft-delete';

  -- ✔ 10. Cleanup: hard-delete both rows so test is rerunnable
  DELETE FROM public.personal_tasks
  WHERE id IN (v_task_dated_id, v_task_undated_id);
  RAISE NOTICE '✔ 10. Cleanup: hard-deleted both test rows';
END
$$;
SQL
```

Expected output: ten ✔ notices, no exceptions raised.

## Notes for future sessions

- `completed_at` is the soft-delete column; future UI must filter `completed_at IS NULL` to show only active tasks.
- `due_at` is optional. Calendar reads must filter `due_at IS NOT NULL`; to-do widget reads do not.
- Task ownership is enforced by RLS at the row level; action layer doesn't need to re-check `auth.uid()` for ownership.
- Partial indexes are owner-scoped + active-scoped — they speed up the dashboard fetches but stop helping once `completed_at` is set. This is intentional; we don't query completed tasks today.