-- quiz_attempts: one row per (activity, student) attempt.
--
-- Single-attempt model: UNIQUE (activity_id, student_id). Phase 9 may add
-- attempt_number for multi-attempt quizzes; for now there's exactly one.
--
-- Lifecycle:
--   1. start_quiz_attempt RPC inserts row with started_at = now(), submitted_at NULL.
--   2. Student answers questions; quiz_responses rows accumulate.
--   3. submit_quiz_attempt RPC fills submitted_at, computes auto_score,
--      creates the activity_submission + activity_grade rows, links via submission_id.
--   4. Teacher manually grades essay/short_answer questions; recompute_quiz_score
--      may update manual_score_override.

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id            uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  student_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at             timestamptz NOT NULL DEFAULT now(),
  submitted_at           timestamptz,
  auto_score             numeric,
  manual_score_override  numeric,
  submission_id          uuid REFERENCES activity_submissions(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, student_id)
);

CREATE INDEX IF NOT EXISTS quiz_attempts_activity_idx
  ON quiz_attempts (activity_id);

CREATE INDEX IF NOT EXISTS quiz_attempts_student_idx
  ON quiz_attempts (student_id);

CREATE INDEX IF NOT EXISTS quiz_attempts_submission_idx
  ON quiz_attempts (submission_id);

CREATE OR REPLACE FUNCTION quiz_attempts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_attempts_touch_updated_at ON quiz_attempts;
CREATE TRIGGER quiz_attempts_touch_updated_at
  BEFORE UPDATE ON quiz_attempts
  FOR EACH ROW
  EXECUTE FUNCTION quiz_attempts_touch_updated_at();

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE quiz_attempts IS
  'One quiz attempt per (activity, student). Single-attempt model in 8b.';
COMMENT ON COLUMN quiz_attempts.auto_score IS
  'Sum of quiz_responses.auto_points for auto-graded question kinds. Filled by submit_quiz_attempt.';
COMMENT ON COLUMN quiz_attempts.manual_score_override IS
  'When set, takes precedence over auto_score for the activity_grade total. Used after teacher grading of essay/short_answer.';