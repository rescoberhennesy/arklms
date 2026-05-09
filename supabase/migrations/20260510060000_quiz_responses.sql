-- quiz_responses: one row per (attempt, question).
--
-- answer jsonb shape varies by question kind, mirroring quiz_questions.config:
--
--   mc_single:    {"selected": 2}                  -- single index
--   mc_multi:     {"selected": [0, 2]}             -- array of indices
--   true_false:   {"selected": true}
--   short_answer: {"text": "1066"}
--   essay:        {"text": "long answer..."}
--   matching:     {"pairs": [[0,1],[1,0],[2,2]]}   -- array of [left, right]
--
-- auto_correct + auto_points are filled by submit_quiz_attempt for the
-- auto-gradable kinds. essay always has auto_correct = NULL, auto_points = NULL.
-- manual_points takes precedence in recompute_quiz_score.

CREATE TABLE IF NOT EXISTS quiz_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    uuid NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  answer        jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_correct  boolean,
  auto_points   numeric,
  manual_points numeric,
  feedback      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS quiz_responses_attempt_idx
  ON quiz_responses (attempt_id);

CREATE INDEX IF NOT EXISTS quiz_responses_question_idx
  ON quiz_responses (question_id);

CREATE OR REPLACE FUNCTION quiz_responses_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_responses_touch_updated_at ON quiz_responses;
CREATE TRIGGER quiz_responses_touch_updated_at
  BEFORE UPDATE ON quiz_responses
  FOR EACH ROW
  EXECUTE FUNCTION quiz_responses_touch_updated_at();

ALTER TABLE quiz_responses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE quiz_responses IS
  'Student answer per question per attempt. answer jsonb shape varies by question kind.';