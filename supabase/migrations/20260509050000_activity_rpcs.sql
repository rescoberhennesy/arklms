-- supabase/migrations/20260509050000_activity_rpcs.sql
--
-- Phase 8a Layer A — Migration 5 of 5
-- RPCs for activities: reorder, submit, bulk-return-grades.
--
-- All functions are SECURITY DEFINER with explicit search_path.
-- Permissions are revoked from PUBLIC and granted to authenticated only.

-- reorder_activities -------------------------------------------------------
-- Two-pass-write to dodge the (class_id, term, display_order) unique index.

CREATE OR REPLACE FUNCTION reorder_activities(
  p_class_id uuid,
  p_term module_term,
  p_activity_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count integer;
BEGIN
  -- Authorization: caller must be the class teacher
  IF NOT is_class_teacher(p_class_id, v_caller) THEN
    RAISE EXCEPTION 'Not authorized to reorder activities in this class';
  END IF;

  -- Validate: every id in the array must belong to this (class, term).
  -- Otherwise a malicious client could re-order activities across terms
  -- or across classes.
  SELECT count(*) INTO v_count
  FROM activities
  WHERE id = ANY(p_activity_ids)
    AND class_id = p_class_id
    AND term = p_term;

  IF v_count <> array_length(p_activity_ids, 1) THEN
    RAISE EXCEPTION 'Activity id list does not match (class, term) bucket';
  END IF;

  -- Pass 1: assign negative offsets (-1, -2, -3, ...) to dodge unique index
  UPDATE activities a
  SET display_order = -1 - idx.ord
  FROM unnest(p_activity_ids) WITH ORDINALITY AS idx(activity_id, ord)
  WHERE a.id = idx.activity_id;

  -- Pass 2: assign final values (0, 1, 2, ...)
  UPDATE activities a
  SET display_order = idx.ord - 1
  FROM unnest(p_activity_ids) WITH ORDINALITY AS idx(activity_id, ord)
  WHERE a.id = idx.activity_id;
END;
$$;

REVOKE ALL ON FUNCTION reorder_activities(uuid, module_term, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reorder_activities(uuid, module_term, uuid[]) TO authenticated;

-- submit_activity ----------------------------------------------------------
-- Atomic upsert with resubmit-clears-grade semantics.
--
-- Returns a row with:
--   submission_id  uuid
--   is_late        boolean
--   replaced_grade boolean   -- true if a prior grade was deleted as part of resubmit

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
  -- Validate caller
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate parallel attachment array lengths
  IF array_length(p_attachment_paths, 1) IS DISTINCT FROM array_length(p_attachment_names, 1)
     OR array_length(p_attachment_paths, 1) IS DISTINCT FROM array_length(p_attachment_sizes, 1)
     OR array_length(p_attachment_paths, 1) IS DISTINCT FROM array_length(p_attachment_mime_types, 1) THEN
    RAISE EXCEPTION 'Attachment arrays must be parallel and equal-length';
  END IF;

  -- Fetch activity (RLS-bypassed because SECURITY DEFINER)
  SELECT * INTO v_activity FROM activities WHERE id = p_activity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  -- Caller must be enrolled in the activity's class
  IF NOT EXISTS (
    SELECT 1 FROM class_enrollments
    WHERE class_id = v_activity.class_id AND student_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Not enrolled in class';
  END IF;

  -- Activity must be published and started
  IF NOT v_activity.published OR v_activity.start_at > now() THEN
    RAISE EXCEPTION 'Activity is not open for submission';
  END IF;

  -- Deadline check
  IF now() > v_activity.due_at AND NOT v_activity.allow_late THEN
    RAISE EXCEPTION 'Submission deadline has passed';
  END IF;

  -- Compute is_late authoritatively from server clock
  v_is_late := now() > v_activity.due_at;

  -- Look up existing submission for this (activity, student)
  SELECT id INTO v_submission_id
  FROM activity_submissions
  WHERE activity_id = p_activity_id AND student_id = v_caller;

  IF v_submission_id IS NOT NULL THEN
    -- Existing submission: check if there's a grade to clear
    SELECT EXISTS (
      SELECT 1 FROM activity_grades WHERE submission_id = v_submission_id
    ) INTO v_grade_exists;

    IF v_grade_exists AND NOT v_activity.allow_resubmission THEN
      RAISE EXCEPTION 'Submission has been graded and resubmission is not allowed';
    END IF;

    IF v_grade_exists THEN
      DELETE FROM activity_grades WHERE submission_id = v_submission_id;
      v_replaced_grade := true;
    END IF;

    -- Update existing submission row
    UPDATE activity_submissions
    SET text_body = p_text_body,
        is_late = v_is_late,
        submitted_at = now()
    WHERE id = v_submission_id;

    -- Wipe old attachment rows (storage cleanup is the action layer's job)
    DELETE FROM submission_attachments WHERE submission_id = v_submission_id;
  ELSE
    -- New submission
    INSERT INTO activity_submissions (activity_id, student_id, text_body, is_late)
    VALUES (p_activity_id, v_caller, p_text_body, v_is_late)
    RETURNING id INTO v_submission_id;
  END IF;

  -- Insert attachment metadata rows
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

REVOKE ALL ON FUNCTION submit_activity(uuid, text, text[], text[], bigint[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_activity(uuid, text, text[], text[], bigint[], text[]) TO authenticated;

-- return_all_grades --------------------------------------------------------
-- Bulk-set returned_at = now() for all unreturned grades on an activity.

CREATE OR REPLACE FUNCTION return_all_grades(p_activity_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_class_id   uuid;
  v_returned   integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT class_id INTO v_class_id FROM activities WHERE id = p_activity_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  IF NOT is_class_teacher(v_class_id, v_caller) THEN
    RAISE EXCEPTION 'Not authorized to return grades for this activity';
  END IF;

  UPDATE activity_grades g
  SET returned_at = now()
  FROM activity_submissions s
  WHERE g.submission_id = s.id
    AND s.activity_id = p_activity_id
    AND g.returned_at IS NULL;

  GET DIAGNOSTICS v_returned = ROW_COUNT;
  RETURN v_returned;
END;
$$;

REVOKE ALL ON FUNCTION return_all_grades(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION return_all_grades(uuid) TO authenticated;

-- Comments -----------------------------------------------------------------

COMMENT ON FUNCTION reorder_activities(uuid, module_term, uuid[]) IS
  'Reorders activities within a (class, term) bucket. Two-pass write to dodge unique-index conflict. Teacher-only.';
COMMENT ON FUNCTION submit_activity(uuid, text, text[], text[], bigint[], text[]) IS
  'Atomic submit: validates window, upserts submission, sets is_late from server clock, clears prior grade if resubmission is allowed, replaces attachments.';
COMMENT ON FUNCTION return_all_grades(uuid) IS
  'Bulk-releases all unreturned grades for an activity. Returns count of grades released. Teacher-only.';
