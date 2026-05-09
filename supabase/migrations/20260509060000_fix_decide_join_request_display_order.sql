-- Fix: decide_join_request silently fails to enroll students because
-- the INSERT didn't supply display_order, defaulting it to 0, which
-- collided with the existing unique index on (student_id, display_order).
-- The ON CONFLICT DO NOTHING then swallowed the conflict.
--
-- Fix:
--   1. Compute next display_order for the student (max + 1, or 0 if none).
--   2. Tighten ON CONFLICT to the intended (class_id, student_id) target,
--      so any other constraint violation surfaces as an error rather than
--      a silent no-op.

CREATE OR REPLACE FUNCTION public.decide_join_request(
  p_request_id uuid,
  p_approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.class_join_requests%ROWTYPE;
  v_user    uuid := auth.uid();
  v_next_display_order integer;
BEGIN
  SELECT * INTO v_request
  FROM public.class_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF NOT public.is_class_teacher(v_request.class_id, v_user) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request already decided';
  END IF;

  IF p_approve THEN
    -- Compute next display_order slot for this student.
    -- COALESCE handles the case where the student has no existing
    -- enrollments (-1 + 1 = 0).
    SELECT COALESCE(MAX(display_order), -1) + 1
      INTO v_next_display_order
    FROM public.class_enrollments
    WHERE student_id = v_request.student_id;

    -- Explicit ON CONFLICT target so any other violation
    -- (e.g. the (student_id, display_order) index, which would now
    -- indicate a real bug) surfaces instead of being swallowed.
    INSERT INTO public.class_enrollments (class_id, student_id, display_order)
    VALUES (v_request.class_id, v_request.student_id, v_next_display_order)
    ON CONFLICT (class_id, student_id) DO NOTHING;

    UPDATE public.class_join_requests
    SET status = 'approved', decided_at = now(), decided_by = v_user
    WHERE id = p_request_id;
  ELSE
    UPDATE public.class_join_requests
    SET status = 'rejected', decided_at = now(), decided_by = v_user
    WHERE id = p_request_id;
  END IF;
END;
$function$;
