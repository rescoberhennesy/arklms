-- ============================================================================
-- Submit-activity RPC: drafts and bounded attempts
-- ============================================================================
-- Replaces the previous submit_activity function with one that supports:
--   - Saving as a draft (p_is_draft = TRUE): writes/upserts a draft row that
--     only the student can see. No teacher notification, no late flagging.
--   - Submitting (p_is_draft = FALSE): converts the draft (or creates a new
--     submission) into a final submission, increments attempt_number, and
--     marks late if past due.
--
-- Lifecycle for a single student on a single assignment:
--   1. Student starts editing → upsert draft row (attempt_number = 1, is_draft = TRUE)
--   2. Student saves more times → same row updates
--   3. Student submits → is_draft flips to FALSE, submitted_at set, late computed
--   4. Student wants to revise → if attempts remain, a NEW draft row is created
--      with attempt_number = previous + 1, replacing the prior submission's
--      visibility (only latest non-draft is "the" submission shown to teacher
--      — handled in the application layer's mapping function).
--
-- Notes:
--   - Quizzes do NOT use this RPC. They have their own start_quiz_attempt /
--     submit_quiz_attempt functions.
--   - We do not delete prior submissions; they're kept for audit. The
--     application layer surfaces only the highest attempt_number that's
--     non-draft as "the current submission" to the teacher.
--   - allow_resubmission is NOT consulted. max_attempts is the source of truth.
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_activity(
  p_activity_id            UUID,
  p_text_body              TEXT,
  p_attachment_paths       TEXT[],
  p_attachment_names       TEXT[],
  p_attachment_sizes       BIGINT[],
  p_attachment_mime_types  TEXT[],
  p_is_draft               BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  submission_id    UUID,
  is_late          BOOLEAN,
  is_draft         BOOLEAN,
  attempt_number   INTEGER,
  replaced_grade   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id        UUID;
  v_activity          RECORD;
  v_existing          RECORD;
  v_submission_id     UUID;
  v_attempt_number    INTEGER;
  v_now               TIMESTAMPTZ := NOW();
  v_is_late           BOOLEAN;
  v_replaced_grade    BOOLEAN := FALSE;
  v_i                 INTEGER;
BEGIN
  -- ---- Auth -------------------------------------------------------------
  v_student_id := auth.uid();
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ---- Activity -----------------------------------------------------------
  SELECT
    a.id, a.class_id, a.activity_kind, a.due_at,
    a.allow_late, a.max_attempts, a.submission_type, a.published
  INTO v_activity
  FROM activities a
  WHERE a.id = p_activity_id;

  IF v_activity IS NULL THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;
  IF v_activity.activity_kind <> 'assignment' THEN
    RAISE EXCEPTION 'This RPC is for assignments only; quizzes use submit_quiz_attempt';
  END IF;
  IF NOT v_activity.published THEN
    RAISE EXCEPTION 'Cannot submit to an unpublished activity';
  END IF;

  -- ---- Find latest existing row (any state) for this student -------------
  SELECT
    s.id, s.attempt_number, s.is_draft, s.submitted_at
  INTO v_existing
  FROM activity_submissions s
  WHERE s.activity_id = p_activity_id
    AND s.student_id = v_student_id
  ORDER BY s.attempt_number DESC
  LIMIT 1;

  -- ---- Compute late flag (only relevant for non-draft submits) ----------
  v_is_late := (NOT p_is_draft) AND (v_now > v_activity.due_at);

  -- ---- Late gate ---------------------------------------------------------
  IF v_is_late AND NOT v_activity.allow_late THEN
    RAISE EXCEPTION 'The deadline has passed and late submissions are not allowed';
  END IF;

  -- ---- Decide which row to write ----------------------------------------
  IF v_existing IS NULL THEN
    -- First-ever interaction. Create attempt 1.
    v_attempt_number := 1;
    INSERT INTO activity_submissions (
      activity_id, student_id, submitted_at, text_body, is_late,
      attempt_number, is_draft
    )
    VALUES (
      p_activity_id, v_student_id,
      CASE WHEN p_is_draft THEN NULL ELSE v_now END,
      p_text_body, v_is_late,
      v_attempt_number, p_is_draft
    )
    RETURNING id INTO v_submission_id;

  ELSIF v_existing.is_draft THEN
    -- Existing draft on this attempt — overwrite it.
    v_attempt_number := v_existing.attempt_number;
    v_submission_id := v_existing.id;

    UPDATE activity_submissions
    SET text_body     = p_text_body,
        is_late       = v_is_late,
        is_draft      = p_is_draft,
        submitted_at  = CASE WHEN p_is_draft THEN NULL ELSE v_now END,
        updated_at    = v_now
    WHERE id = v_submission_id;

    -- Drop the draft's previous attachments before re-inserting.
    DELETE FROM submission_attachments WHERE submission_id = v_submission_id;

  ELSE
    -- Existing row is a FINAL submission (not a draft).
    -- This is a resubmission request. Need a new attempt.
    IF v_existing.attempt_number >= v_activity.max_attempts THEN
      RAISE EXCEPTION
        'You have used all % attempt(s) for this assignment',
        v_activity.max_attempts;
    END IF;

    v_attempt_number := v_existing.attempt_number + 1;

    -- If the previous submission had a released grade, clear it. Teacher
    -- must re-grade the new attempt. Mark replaced_grade in the return so
    -- the UI can warn the student.
    IF EXISTS (
      SELECT 1 FROM activity_grades g WHERE g.submission_id = v_existing.id
    ) THEN
      v_replaced_grade := TRUE;
      DELETE FROM activity_grades WHERE submission_id = v_existing.id;
    END IF;

    INSERT INTO activity_submissions (
      activity_id, student_id, submitted_at, text_body, is_late,
      attempt_number, is_draft
    )
    VALUES (
      p_activity_id, v_student_id,
      CASE WHEN p_is_draft THEN NULL ELSE v_now END,
      p_text_body, v_is_late,
      v_attempt_number, p_is_draft
    )
    RETURNING id INTO v_submission_id;
  END IF;

  -- ---- Attachments ------------------------------------------------------
  IF array_length(p_attachment_paths, 1) IS NOT NULL THEN
    FOR v_i IN 1..array_length(p_attachment_paths, 1) LOOP
      INSERT INTO submission_attachments (
        submission_id, file_path, file_name, file_size, mime_type
      )
      VALUES (
        v_submission_id,
        p_attachment_paths[v_i],
        p_attachment_names[v_i],
        p_attachment_sizes[v_i],
        p_attachment_mime_types[v_i]
      );
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    v_submission_id,
    v_is_late,
    p_is_draft,
    v_attempt_number,
    v_replaced_grade;
END;
$$;