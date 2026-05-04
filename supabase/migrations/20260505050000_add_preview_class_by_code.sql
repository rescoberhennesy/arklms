-- Read-only preview of a class by invite code, used by /join/[code] confirmation page.
-- Does NOT create any rows. Returns a status indicating what state the join would be in.
-- Mirrors the validation logic in request_join_class_by_code so the UI can render
-- the same outcomes without committing.

CREATE TYPE public.join_preview_status AS ENUM (
  'valid',
  'not_found',
  'disabled',
  'expired',
  'already_enrolled',
  'request_pending'
);

CREATE OR REPLACE FUNCTION public.preview_class_by_code(p_code text)
RETURNS TABLE(
  status public.join_preview_status,
  class_id uuid,
  class_name text,
  class_section text,
  class_semester text,
  class_color text,
  teacher_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_class   public.classes%ROWTYPE;
  v_user    uuid := auth.uid();
  v_role    public.user_role;
  v_teacher_name text;
  v_already_enrolled boolean;
  v_pending_exists boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_role := public.get_user_role(v_user);
  IF v_role <> 'student' THEN
    RAISE EXCEPTION 'only students can preview class invite codes';
  END IF;

  SELECT * INTO v_class
  FROM public.classes c
  WHERE lower(c.invite_code) = lower(trim(p_code))
    AND c.is_archived = false
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::public.join_preview_status,
      NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT p.full_name INTO v_teacher_name
  FROM public.profiles p
  WHERE p.id = v_class.teacher_id;

  IF v_class.invite_code_disabled THEN
    RETURN QUERY SELECT
      'disabled'::public.join_preview_status,
      v_class.id, v_class.name, v_class.section, v_class.semester,
      v_class.color, v_teacher_name;
    RETURN;
  END IF;

  IF v_class.invite_code_expires_at IS NOT NULL
     AND v_class.invite_code_expires_at < now() THEN
    RETURN QUERY SELECT
      'expired'::public.join_preview_status,
      v_class.id, v_class.name, v_class.section, v_class.semester,
      v_class.color, v_teacher_name;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    WHERE ce.class_id = v_class.id AND ce.student_id = v_user
  ) INTO v_already_enrolled;

  IF v_already_enrolled THEN
    RETURN QUERY SELECT
      'already_enrolled'::public.join_preview_status,
      v_class.id, v_class.name, v_class.section, v_class.semester,
      v_class.color, v_teacher_name;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.class_join_requests cjr
    WHERE cjr.class_id = v_class.id
      AND cjr.student_id = v_user
      AND cjr.status = 'pending'
  ) INTO v_pending_exists;

  IF v_pending_exists THEN
    RETURN QUERY SELECT
      'request_pending'::public.join_preview_status,
      v_class.id, v_class.name, v_class.section, v_class.semester,
      v_class.color, v_teacher_name;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'valid'::public.join_preview_status,
    v_class.id, v_class.name, v_class.section, v_class.semester,
    v_class.color, v_teacher_name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.preview_class_by_code(text) TO authenticated;
