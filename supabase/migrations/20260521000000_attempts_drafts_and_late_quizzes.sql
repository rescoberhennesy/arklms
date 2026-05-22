-- ============================================================================
-- Attempts, drafts, and late quiz submissions
-- ============================================================================
-- Adds three related features to the activity/submission/quiz model:
--
--   1. activities.max_attempts (INT, default 1)
--      How many times a student may submit this assignment. Default 1 = the
--      current single-submission behavior, so existing rows continue to work
--      unchanged. Supersedes the older allow_resubmission boolean, which is
--      kept for backward compatibility but no longer drives behavior.
--
--   2. activity_submissions.attempt_number (INT, default 1)
--      activity_submissions.is_draft (BOOLEAN, default FALSE)
--      Tracks which attempt this submission represents, and whether it's a
--      saved draft (only visible to the owner) vs. a final submission
--      (visible to the teacher). Once is_draft flips false, the row is
--      locked from further edits.
--
--   3. quiz_attempts.is_late (BOOLEAN, default FALSE)
--      Flags quiz attempts submitted after the activity's due_at. Mirrors
--      activity_submissions.is_late for symmetry. Whether late attempts are
--      permitted is governed by the existing activities.allow_late column.
--
-- Migration is additive only — every column has a sensible default, no
-- existing rows need to be backfilled or rewritten. Idempotent via
-- IF NOT EXISTS guards so re-running this migration is safe.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Assignments: bounded multi-attempt support
-- ----------------------------------------------------------------------------

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1;

-- Sanity bounds: at least 1, at most 10. Ten is an arbitrary cap chosen to
-- prevent obvious misconfiguration (a teacher accidentally typing 100).
-- Adjust if pedagogical needs change.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activities_max_attempts_check'
  ) THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_max_attempts_check
      CHECK (max_attempts >= 1 AND max_attempts <= 10);
  END IF;
END $$;

COMMENT ON COLUMN activities.max_attempts IS
  'Maximum number of submission attempts a student may make on this assignment. Default 1 = single submission. Quizzes ignore this column (quizzes use the single-attempt-locked model).';

-- ----------------------------------------------------------------------------
-- 2. Submissions: attempt tracking + draft state
-- ----------------------------------------------------------------------------

ALTER TABLE activity_submissions
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_draft       BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activity_submissions_attempt_number_check'
  ) THEN
    ALTER TABLE activity_submissions
      ADD CONSTRAINT activity_submissions_attempt_number_check
      CHECK (attempt_number >= 1);
  END IF;
END $$;

COMMENT ON COLUMN activity_submissions.attempt_number IS
  'Which attempt this row represents (1 = first submission, 2 = resubmission, ...). Always <= activities.max_attempts.';
COMMENT ON COLUMN activity_submissions.is_draft IS
  'TRUE while the student is composing; FALSE once submitted. Drafts are owner-only; submitted rows are visible to the teacher.';

-- --------------