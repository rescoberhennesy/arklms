-- quiz_questions: per-quiz question bank.
--
-- Question type-specific data lives in `config jsonb`. Schema by question_kind:
--
--   mc_single, mc_multi:
--     {"options": ["text1","text2",...], "correct": [0, 2]}
--     - options: ordered array of choice texts
--     - correct: array of indices into options (single-element for mc_single)
--
--   true_false:
--     {"correct": true}
--
--   short_answer:
--     {"acceptable": ["1066","one thousand sixty-six"], "case_sensitive": false}
--
--   essay:
--     {} (manual grading only)
--
--   matching:
--     {"left": ["A","B"], "right": ["X","Y"], "pairs": [[0,1],[1,0]]}
--     - pairs: array of [left_index, right_index] correct-pairings
--
-- shuffle_options (per-question) overrides the activity-level shuffle for
-- option order within this question. Together with quiz_attempts.id as a
-- seed, the front-end deterministically reorders.

CREATE TABLE IF NOT EXISTS quiz_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  question_kind   text NOT NULL CHECK (question_kind IN (
                    'mc_single', 'mc_multi', 'true_false',
                    'short_answer', 'essay', 'matching'
                  )),
  prompt          text NOT NULL DEFAULT '',
  points          numeric NOT NULL DEFAULT 1 CHECK (points >= 0),
  display_order   integer NOT NULL DEFAULT 0,
  shuffle_options boolean NOT NULL DEFAULT false,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Display order is unique within an activity to keep the editor's
  -- reorder logic simple. Insertions append (MAX + 1).
  UNIQUE (activity_id, display_order)
);

CREATE INDEX IF NOT EXISTS quiz_questions_activity_idx
  ON quiz_questions (activity_id, display_order);

-- Touch updated_at on UPDATE.
CREATE OR REPLACE FUNCTION quiz_questions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_questions_touch_updated_at ON quiz_questions;
CREATE TRIGGER quiz_questions_touch_updated_at
  BEFORE UPDATE ON quiz_questions
  FOR EACH ROW
  EXECUTE FUNCTION quiz_questions_touch_updated_at();

-- RLS is enabled here but policies live in 20260510070000_quiz_rls_and_helpers.sql
-- so they can reference is_student_in_class() helper.
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE quiz_questions IS
  'Question bank for quiz-kind activities. config jsonb shape varies by question_kind.';