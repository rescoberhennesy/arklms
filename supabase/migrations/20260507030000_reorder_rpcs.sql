-- Phase 5a #2 -- reorder RPCs (atomic display_order updates)
--
-- Each RPC takes an array of class/enrollment IDs in the new order and
-- rewrites display_order in one statement. Postgres validates uniqueness
-- AFTER the statement completes, so the final state being consistent is
-- enough -- no two-pass dance needed.
--
-- SECURITY DEFINER so the function can run the UPDATE; we gate access
-- by checking auth.uid() owns each row before updating.

-- ---------- reorder_my_classes ----------
CREATE OR REPLACE FUNCTION public.reorder_my_classes(p_class_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_owned_count integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Confirm caller owns ALL the listed classes. If even one isn't theirs,
  -- reject the whole reorder. This protects against client-side tampering
  -- where the array might include a class the user can see but not own.
  SELECT COUNT(*) INTO v_owned_count
  FROM public.classes
  WHERE id = ANY(p_class_ids) AND teacher_id = v_user;

  IF v_owned_count <> array_length(p_class_ids, 1) THEN
    RAISE EXCEPTION 'unauthorized: not all classes belong to caller';
  END IF;

  -- Apply new ordering atomically.
  UPDATE public.classes c
  SET display_order = ord.new_order
  FROM (
    SELECT unnest(p_class_ids) AS id,
           generate_subscripts(p_class_ids, 1) - 1 AS new_order
  ) ord
  WHERE c.id = ord.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reorder_my_classes(uuid[]) TO authenticated;

-- ---------- reorder_my_enrollments ----------
CREATE OR REPLACE FUNCTION public.reorder_my_enrollments(p_class_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_owned_count integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Confirm caller is enrolled in ALL the listed classes.
  SELECT COUNT(*) INTO v_owned_count
  FROM public.class_enrollments
  WHERE class_id = ANY(p_class_ids) AND student_id = v_user;

  IF v_owned_count <> array_length(p_class_ids, 1) THEN
    RAISE EXCEPTION 'unauthorized: not all classes belong to caller';
  END IF;

  UPDATE public.class_enrollments e
  SET display_order = ord.new_order
  FROM (
    SELECT unnest(p_class_ids) AS class_id,
           generate_subscripts(p_class_ids, 1) - 1 AS new_order
  ) ord
  WHERE e.class_id = ord.class_id AND e.student_id = v_user;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reorder_my_enrollments(uuid[]) TO authenticated;
