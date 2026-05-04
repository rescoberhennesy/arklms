-- Fix swapped is_class_teacher argument order in regenerate_class_invite_code.
-- Function signature is is_class_teacher(p_class_id, p_user_id) -- class first, user second.
-- Session 3 wrote this call with the arguments swapped.

CREATE OR REPLACE FUNCTION public.regenerate_class_invite_code(
  p_class_id uuid,
  p_expires_in_hours integer DEFAULT 168
)
RETURNS TABLE(invite_code text, invite_code_expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_code text;
  v_expires  timestamptz;
BEGIN
  IF NOT public.is_class_teacher(p_class_id, auth.uid()) THEN
    RAISE EXCEPTION 'not authorized to regenerate invite code for this class';
  END IF;

  v_new_code := public.generate_invite_code();
  v_expires  := CASE
                  WHEN p_expires_in_hours IS NULL THEN NULL
                  ELSE now() + make_interval(hours => p_expires_in_hours)
                END;

  UPDATE public.classes
  SET invite_code            = v_new_code,
      invite_code_expires_at = v_expires,
      invite_code_disabled   = false,
      updated_at             = now()
  WHERE id = p_class_id;

  RETURN QUERY
  SELECT v_new_code, v_expires;
END;
$function$;
