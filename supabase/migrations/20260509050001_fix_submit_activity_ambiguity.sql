-- supabase/migrations/20260509050001_fix_submit_activity_ambiguity.sql
--
-- Fixup for Migration 5.
-- submit_activity has an ambiguous column reference: inside the function,
-- the EXISTS check 'WHERE submission_id = v_submission_id' couldn't tell
-- whether 'submission_id' meant the OUT parameter or the column on
-- activity_grades. Found by Test 6 (resubmit branch).
--
-- Fix: qualify the column with the table name (activity_grades.submission_id,
-- submission_attachments.submission_id, activity_submissions.id).

CREATE OR REPLACE FUNCTION submit_activity(
  p_activity_id uuid,
  p_text_body text,
  p_attachment_paths text[],
  p_attachment_names text[],
  p_attachment_sizes bigint[],
  p_attachment_mime_types text[]
)
RETURNS TABLE (
  submission_id uuid,
  is_late boolean,
  replaced_grade boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller         uuid := auth.uid();
  v_activity       activities%ROWTYPE;
  v_submission_id  uuid;
  v_is_late        boolean;
  v_replaced_grade boolean := false;
  v_grade_exists   boolean;
  v_attach_count   integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF array_length(p_attachment_paths, 1) IS DISTINCT FROM array_length(p_attachment_names, 1)
     OR array_length(p_attachment_paths, 1) IS DISTINCT FROM array_length(p_attachment_sizes, 1)
     OR array_length(p_attachment_paths, 1) IS DISTINCT FROM array_length(p_attachment_mime_types, 1) THEN
    RAISE EXCEPTION 'Attachment arrays must be parallel and equal-length';
  END IF;

  SELECT * INTO v_activity FROM activities WHERE activities.id = p_activity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM class_enrollments
    WHERE class_enrollments.class_id = v_activity.class_id
      AND class_enrollments.student_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Not enrolled in class';
  END IF;

  IF NOT v_activity.published OR v_activity.start_at > now() THEN
    RAISE EXCEPTION 'Activity is not open for submission';
  END IF;

  IF now() > v_activity.due_at AND NOT v_activity.allow_late THEN
    RAISE EXCEPTION 'Submission deadline has passed';
  END IF;

  v_is_late := now() > v_activity.due_at;

  SELECT activity_submissions.id INTO v_submission_id
  FROM activity_submissions
  WHERE activity_submissions.activity_id = p_activity_id
    AND activity_submissions.student_id = v_caller;

  IF v_submission_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM activity_grades
      WHERE activity_grades.submission_id = v_submission_id
    ) INTO v_grade_exists;

    IF v_grade_exists AND NOT v_activity.allow_resubmission THEN
      RAISE EXCEPTION 'Submission has been graded and resubmission is not allowed';
    END IF;

    IF v_grade_exists THEN
      DELETE FROM activity_grades
      WHERE activity_grades.submission_id = v_submission_id;
      v_replaced_grade := true;
    END IF;

    UPDATE activity_submissions
    SET text_body = p_text_body,
        is_late = v_is_late,
        submitted_at = now()
    WHERE activity_submissions.id = v_submission_id;

    DELETE FROM submission_attachments
    WHERE submission_attachments.submission_id = v_submission_id;
  ELSE
    INSERT INTO activity_submissions (activity_id, student_id, text_body, is_late)
    VALUES (p_activity_id, v_caller, p_text_body, v_is_late)
    RETURNING activity_submissions.id INTO v_submission_id;
  END IF;

  v_attach_count := COALESCE(array_length(p_attachment_paths, 1), 0);
  IF v_attach_count > 0 THEN
    INSERT INTO submission_attachments (submission_id, file_path, file_name, file_size, mime_type)
    SELECT v_submission_id,
           p_attachment_paths[i],
           p_attachment_names[i],
           p_attachment_sizes[i],
           p_attachment_mime_types[i]
    FROM generate_series(1, v_attach_count) AS i;
  END IF;

  RETURN QUERY SELECT v_submission_id, v_is_late, v_replaced_grade;
END;
$$;
