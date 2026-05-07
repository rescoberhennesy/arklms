-- Phase 5a #2 -- fix reorder RPCs: two-pass write to avoid unique-index
-- collisions during multi-row reordering. (Discovered via smoke test.)
--
-- The unique index (teacher_id, display_order) -- and similarly for
-- enrollments -- is non-deferrable, so a single UPDATE that swaps multiple
-- display_order values across rows hits intermediate collisions and rolls
-- back. Splitting into two passes (negative offsets, then final values)
-- avoids this without dropping the constraint.

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

  SELECT COUNT(*) INTO v_owned_count
  FROM public.classes
  WHERE id = ANY(p_class_ids) AND teacher_id = v_user;

  IF v_owned_count <> array_length(p_class_ids, 1) THEN
    RAISE EXCEPTION 'unauthorized: not all classes belong to caller';
  END IF;

  -- Pass 1: move targeted rows to negative offsets (clears the >=0 space).
  UPDATE public.classes c
  SET display_order = -(ord.new_order + 1)
  FROM (
    SELECT unnest(p_class_ids) AS id,
           generate_subscripts(p_class_ids, 1) - 1 AS new_order
  ) ord
  WHERE c.id = ord.id;

  -- Pass 2: apply final non-negative ordering.
  UPDATE public.classes c
  SET display_order = ord.new_order
  FROM (
    SELECT unnest(p_class_ids) AS id,
           generate_subscripts(p_class_ids, 1) - 1 AS new_order
  ) ord
  WHERE c.id = ord.id;
END;
$function$;

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

  SELECT COUNT(*) INTO v_owned_count
  FROM public.class_enrollments
  WHERE class_id = ANY(p_class_ids) AND student_id = v_user;

  IF v_owned_count <> array_length(p_class_ids, 1) THEN
    RAISE EXCEPTION 'unauthorized: not all classes belong to caller';
  END IF;

  -- Pass 1
  UPDATE public.class_enrollments e
  SET display_order = -(ord.new_order + 1)
  FROM (
    SELECT unnest(p_class_ids) AS class_id,
           generate_subscripts(p_class_ids, 1) - 1 AS new_order
  ) ord
  WHERE e.class_id = ord.class_id AND e.student_id = v_user;

  -- Pass 2
  UPDATE public.class_enrollments e
  SET display_order = ord.new_order
  FROM (
    SELECT unnest(p_class_ids) AS class_id,
           generate_subscripts(p_class_ids, 1) - 1 AS new_order
  ) ord
  WHERE e.class_id = ord.class_id AND e.student_id = v_user;
END;
$function$;
