-- Quiz-specific columns on activities (Phase 8b).
--
-- These columns are NULL/false for assignment-kind activities. The
-- application enforces that quiz activities populate them; we don't add
-- a CHECK constraint conditional on activity_kind = 'quiz' because the
-- RPC layer is the single point of write.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS time_limit_minutes integer,
  ADD COLUMN IF NOT EXISTS shuffle_questions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_release_grade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_correct_answers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiz_total_points numeric;

COMMENT ON COLUMN activities.time_limit_minutes IS
  'Quiz time limit in minutes. NULL = untimed. Enforced by submit_quiz_attempt RPC.';

COMMENT ON COLUMN activities.shuffle_questions IS
  'If true, quiz_attempts.id seeds a deterministic question order per attempt.';

COMMENT ON COLUMN activities.auto_release_grade IS
  'If true, submit_quiz_attempt sets returned_at = now() on the resulting activity_grade row.';

COMMENT ON COLUMN activities.show_correct_answers IS
  'If true, students see correct answers + their per-question score after submission.';

COMMENT ON COLUMN activities.quiz_total_points IS
  'Cached SUM(quiz_questions.points) for this activity. Recomputed by question CRUD RPCs to avoid join cost on list views. NULL for non-quiz activities.';