-- Phase 7 Layer A: reorder RPCs for modules and lessons.
-- Same two-pass-write pattern as reorder_my_classes / reorder_my_enrollments
-- (see 20260507040000). Postgres unique indexes are non-deferrable, so
-- multi-row UPDATEs swapping display_order values across rows hit
-- intermediate-state collisions. Pass 1 writes negative offsets; Pass 2
-- writes the final non-negative values.

-- Reorder modules within a class.
-- Caller must be the teacher of the class. p_module_ids must be the FULL
-- set of modules in that class -- partial reorders are rejected to keep
-- the unique index clean.
CREATE OR REPLACE FUNCTION public.reorder_modules(
  p_class_id UUID,
  p_module_ids UUID[]
) RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_owned_count INT;
  v_total_count INT;
  i INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_class_teacher(p_class_id, v_user_id) THEN
    RAISE EXCEPTION 'not authorized: not the teacher of this class';
  END IF;

  -- Verify the array contains exactly the modules of this class.
  SELECT count(*) INTO v_total_count
    FROM public.class_modules
    WHERE class_id = p_class_id;

  SELECT count(*) INTO v_owned_count
    FROM public.class_modules
    WHERE class_id = p_class_id
      AND id = ANY(p_module_ids);

  IF v_owned_count <> array_length(p_module_ids, 1) THEN
    RAISE EXCEPTION 'module list contains ids not in this class';
  END IF;

  IF v_owned_count <> v_total_count THEN
    RAISE EXCEPTION 'module list is incomplete: must include all modules in the class';
  END IF;

  -- Pass 1: clear the >=0 space by moving everything to -(new_order + 1)
  FOR i IN 1..array_length(p_module_ids, 1) LOOP
    UPDATE public.class_modules
      SET display_order = -(i)
      WHERE id = p_module_ids[i] AND class_id = p_class_id;
  END LOOP;

  -- Pass 2: apply final non-negative ordering (0-indexed)
  FOR i IN 1..array_length(p_module_ids, 1) LOOP
    UPDATE public.class_modules
      SET display_order = i - 1
      WHERE id = p_module_ids[i] AND class_id = p_class_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.reorder_modules(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_modules(UUID, UUID[]) TO authenticated;

-- Reorder lessons within a module.
CREATE OR REPLACE FUNCTION public.reorder_lessons(
  p_module_id UUID,
  p_lesson_ids UUID[]
) RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_class_id UUID;
  v_owned_count INT;
  v_total_count INT;
  i INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Look up parent class to verify teacher ownership.
  SELECT class_id INTO v_class_id
    FROM public.class_modules
    WHERE id = p_module_id;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'module not found';
  END IF;

  IF NOT public.is_class_teacher(v_class_id, v_user_id) THEN
    RAISE EXCEPTION 'not authorized: not the teacher of this class';
  END IF;

  -- Verify the array is exactly the lessons of this module.
  SELECT count(*) INTO v_total_count
    FROM public.module_lessons
    WHERE module_id = p_module_id;

  SELECT count(*) INTO v_owned_count
    FROM public.module_lessons
    WHERE module_id = p_module_id
      AND id = ANY(p_lesson_ids);

  IF v_owned_count <> array_length(p_lesson_ids, 1) THEN
    RAISE EXCEPTION 'lesson list contains ids not in this module';
  END IF;

  IF v_owned_count <> v_total_count THEN
    RAISE EXCEPTION 'lesson list is incomplete: must include all lessons in the module';
  END IF;

  -- Pass 1: clear the >=0 space
  FOR i IN 1..array_length(p_lesson_ids, 1) LOOP
    UPDATE public.module_lessons
      SET display_order = -(i)
      WHERE id = p_lesson_ids[i] AND module_id = p_module_id;
  END LOOP;

  -- Pass 2: final ordering (0-indexed)
  FOR i IN 1..array_length(p_lesson_ids, 1) LOOP
    UPDATE public.module_lessons
      SET display_order = i - 1
      WHERE id = p_lesson_ids[i] AND module_id = p_module_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.reorder_lessons(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_lessons(UUID, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_modules(UUID, UUID[]) IS
  'Reorder all modules within a class. Two-pass write to avoid unique-index collisions.';
COMMENT ON FUNCTION public.reorder_lessons(UUID, UUID[]) IS
  'Reorder all lessons within a module. Two-pass write to avoid unique-index collisions.';