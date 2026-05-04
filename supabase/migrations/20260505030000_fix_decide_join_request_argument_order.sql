-- Fix swapped is_class_teacher argument order in decide_join_request.
-- Function signature is is_class_teacher(p_class_id, p_user_id) -- class first, user second.
-- Session 3 wrote this call with the arguments swapped, causing every approve/reject
-- to raise 'not authorized'.

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
    INSERT INTO public.class_enrollments (class_id, student_id)
    VALUES (v_request.class_id, v_request.student_id)
    ON CONFLICT DO NOTHING;

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
