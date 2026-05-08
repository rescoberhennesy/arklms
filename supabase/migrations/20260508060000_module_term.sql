-- Phase 7: add term tagging to class_modules.
-- Each module belongs to one of four terms within its class. Drag-reorder
-- is scoped to a single (class, term) bucket -- the unique index reflects
-- that, and so does reorder_modules.

-- 1. Enum
CREATE TYPE module_term AS ENUM ('prelim', 'midterm', 'prefinal', 'final');

-- 2. Add column. Two-step because the table already has rows: add nullable,
--    backfill, then set NOT NULL.
ALTER TABLE public.class_modules
  ADD COLUMN term module_term;

-- Backfill: existing module's title indicates 'prelim'.
-- (Generic safe default for any other rows would also be 'prelim' as the
-- earliest term.)
UPDATE public.class_modules SET term = 'prelim' WHERE term IS NULL;

ALTER TABLE public.class_modules
  ALTER COLUMN term SET NOT NULL;

-- 3. Reshape the unique index: scope display_order to (class_id, term).
DROP INDEX IF EXISTS public.class_modules_class_order_uniq;
CREATE UNIQUE INDEX class_modules_class_term_order_uniq
  ON public.class_modules (class_id, term, display_order);

-- 4. Replace reorder_modules to take a term argument and only reorder
--    rows in that (class, term) bucket. Same two-pass-write pattern.
DROP FUNCTION IF EXISTS public.reorder_modules(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.reorder_modules(
  p_class_id UUID,
  p_term module_term,
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

  -- Verify the array contains exactly the modules of (this class, this term).
  SELECT count(*) INTO v_total_count
    FROM public.class_modules
    WHERE class_id = p_class_id AND term = p_term;

  SELECT count(*) INTO v_owned_count
    FROM public.class_modules
    WHERE class_id = p_class_id
      AND term = p_term
      AND id = ANY(p_module_ids);

  IF v_owned_count <> array_length(p_module_ids, 1) THEN
    RAISE EXCEPTION 'module list contains ids not in this (class, term) bucket';
  END IF;

  IF v_owned_count <> v_total_count THEN
    RAISE EXCEPTION 'module list is incomplete: must include all modules in this term';
  END IF;

  -- Pass 1: clear the >=0 space
  FOR i IN 1..array_length(p_module_ids, 1) LOOP
    UPDATE public.class_modules
      SET display_order = -(i)
      WHERE id = p_module_ids[i] AND class_id = p_class_id AND term = p_term;
  END LOOP;

  -- Pass 2: final ordering (0-indexed)
  FOR i IN 1..array_length(p_module_ids, 1) LOOP
    UPDATE public.class_modules
      SET display_order = i - 1
      WHERE id = p_module_ids[i] AND class_id = p_class_id AND term = p_term;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.reorder_modules(UUID, module_term, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_modules(UUID, module_term, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_modules(UUID, module_term, UUID[]) IS
  'Reorder modules within (class, term) bucket. Two-pass write to avoid unique-index collisions.';

COMMENT ON COLUMN public.class_modules.term IS
  'Which term this module belongs to. Drives grouping in the Modules tab.';