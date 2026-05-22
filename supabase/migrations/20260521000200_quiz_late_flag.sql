-- ============================================================================
-- Add is_late computation to submit_quiz_attempt
-- ============================================================================
-- The existing submit_quiz_attempt RPC scores the attempt, creates a grade
-- row, etc. This migration patches it to also:
--   1. Reject the submit if past due AND activity.allow_late is FALSE
--   2. Set quiz_attempts.is_late = TRUE if past due AND allow_late
--
-- We use a separate WRAPPER function rather than touching the existing one,
-- so behavior reverts cleanly if rolled back. The wrapper runs BEFORE the
-- original logic.
-- ============================================================================

-- We can't easily wrap the existing function without seeing it, so instead
-- add a row-level enforcement trigger. This is the safest path: it gates
-- the submit at the DB layer regardless of how submit_quiz_attempt is
-- shaped today.

CREATE OR REPLACE FUNCTION enforce_quiz_late_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_due_at      TIMESTAMPTZ;
  v_allow_late  BOOLEAN;
BEGIN
  -- Only act on the transition from "not submitted" to "submitted".
  IF NEW.submitted_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.submitted_at IS NOT NULL THEN
    -- Already submitted; later updates (e.g. score recomputation) bypass.
    RETURN NEW;
  END IF;

  SELECT a.due_at, a.allow_late
  INTO v_due_at, v_allow_late
  FROM activities a
  WHERE a.id = NEW.activity_id;

  IF NEW.submitted_at > v_due_at THEN
    IF NOT v_allow_late THEN
      RAISE EXCEPTION 'Quiz deadline has passed and late submissions are not allowed';
    END IF;
    NEW.is_late := TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_late_policy_trigger ON quiz_attempts;

CREATE TRIGGER quiz_late_policy_trigger
  BEFORE UPDATE OF submitted_at ON quiz_attempts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_quiz_late_policy();

-- Also gate the START side: if past due and !allow_late, block creating
-- a new attempt row. start_quiz_attempt likely INSERTs, so a BEFORE INSERT
-- trigger covers it.
CREATE OR REPLACE FUNCTION enforce_quiz_late_start_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_due_at      TIMESTAMPTZ;
  v_allow_late  BOOLEAN;
BEGIN
  SELECT a.due_at, a.allow_late
  INTO v_due_at, v_allow_late
  FROM activities a
  WHERE a.id = NEW.activity_id;

  IF NOW() > v_due_at AND NOT v_allow_late THEN
    RAISE EXCEPTION 'Quiz deadline has passed and late attempts are not allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_late_start_trigger ON quiz_attempts;

CREATE TRIGGER quiz_late_start_trigger
  BEFORE INSERT ON quiz_attempts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_quiz_late_start_policy();