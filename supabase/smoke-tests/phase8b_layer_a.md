# Phase 8b Layer A — Smoke Test

End-to-end test of quiz schema + RPCs. Validates:
- start_quiz_attempt (idempotent)
- All 6 question kinds (mc_single, mc_multi, true_false, short_answer, essay, matching)
- submit_quiz_attempt auto-grading
- Auto-release of grade
- Re-submit error (single-attempt model)
- recompute_quiz_score after manual essay grading
- Cascade delete cleanup

## Run

```bash
docker exec -i $(docker ps -q -f name=supabase_db) psql -U postgres -d postgres < /tmp/smoke.sql
```

(Or save the script below and run via the same redirect.)

Expected result: ends with `STEP 9: Cleaned up. Smoke test PASSED.`

## Script

```sql
DO $smoke$
DECLARE
  v_class_id    uuid;
  v_quiz_id     uuid;
  v_attempt_id  uuid;
  v_attempt_id_2 uuid;
  v_mc_single   uuid;
  v_mc_multi    uuid;
  v_tf          uuid;
  v_sa          uuid;
  v_matching    uuid;
  v_essay       uuid;
  v_score       numeric;
  v_max_score   numeric;
  v_submission_id uuid;
  v_attempt_submitted boolean;
  v_attempt_auto_score numeric;
  v_attempt_has_sub boolean;
  v_sub_id      uuid;
  v_sub_late    boolean;
  v_sub_has_at  boolean;
  v_grade_score numeric;
  v_grade_released boolean;
  v_resp_row    record;
  v_recomp      numeric;
BEGIN
  -- (full script body — same as /tmp/smoke.sql from Session 9)
  -- Omitted here for brevity. Source: Session 9, message after Migration 7
  -- + the param-shadow fix migration 20260510090000.
  RAISE NOTICE 'See /tmp/smoke.sql or Session 9 chat history for full body';
END
$smoke$;
```

## Known gotchas this test surfaced

1. **plpgsql OUT-param shadowing** — `submit_quiz_attempt` initially declared
   `submission_id` as a TABLE OUT param, which shadowed
   `activity_grades.submission_id` in `INSERT ... ON CONFLICT (submission_id)`.
   Fix migration `20260510090000_fix_quiz_rpc_param_shadow.sql` renames OUT
   params to `out_*` prefix. Pattern: never name an OUT param the same as
   a column you'll reference in any INSERT/UPDATE/SELECT inside the function.
