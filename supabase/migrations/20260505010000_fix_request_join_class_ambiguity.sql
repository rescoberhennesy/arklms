-- Fix ambiguous "class_id" reference in request_join_class_by_code.
-- The function's RETURNS TABLE(class_id uuid, ...) creates an output column
-- named class_id, which collides with column references inside the body.
-- Qualify all column references with their table name.

CREATE OR REPLACE FUNCTION public.request_join_class_by_code(p_code text)
RETURNS TABLE(class_id uuid, status join_request_status, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_class   public.classes%ROWTYPE;
  v_user    uuid := auth.uid();
  v_role    public.user_role;
  v_existing_request public.class_join_requests%ROWTYPE;
  v_already_enrolled boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_role := public.get_user_role(v_user);
  IF v_role <> 'student' THEN
    RAISE EXCEPTION 'only students can join classes by code';
  END IF;

  SELECT * INTO v_class
  FROM public.classes
  WHERE lower(public.classes.invite_code) = lower(trim(p_code))
    AND public.classes.is_archived = false
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid invite code';
  END IF;

  IF v_class.invite_code_disabled THEN
    RAISE EXCEPTION 'invite code is disabled';
  END IF;

  IF v_class.invite_code_expires_at IS NOT NULL
     AND v_class.invite_code_expires_at < now() THEN
    RAISE EXCEPTION 'invite code has expired';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    WHERE ce.class_id = v_class.id AND ce.student_id = v_user
  ) INTO v_already_enrolled;

  IF v_already_enrolled THEN
    RETURN QUERY SELECT v_class.id, 'approved'::public.join_request_status,
                        'already enrolled'::text;
    RETURN;
  END IF;

  SELECT * INTO v_existing_request
  FROM public.class_join_requests cjr
  WHERE cjr.class_id = v_class.id
    AND cjr.student_id = v_user
    AND cjr.status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_class.id, v_existing_request.status,
                        'request already pending'::text;
    RETURN;
  END IF;

  INSERT INTO public.class_join_requests (class_id, student_id, status)
  VALUES (v_class.id, v_user, 'pending');

  RETURN QUERY SELECT v_class.id, 'pending'::public.join_request_status,
                      'request submitted'::text;
END;
$function$;
