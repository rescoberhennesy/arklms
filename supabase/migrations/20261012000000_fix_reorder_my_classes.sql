-- Rewrite reorder_my_classes: set display_order from the array position.
-- Only updates classes owned by the caller, so it is safe as SECURITY DEFINER.
DROP FUNCTION IF EXISTS public.reorder_my_classes(uuid[]);

CREATE FUNCTION public.reorder_my_classes(p_class_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.classes AS c
  SET display_order = t.ord - 1
  FROM unnest(p_class_ids) WITH ORDINALITY AS t(id, ord)
  WHERE c.id = t.id
    AND c.teacher_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.reorder_my_classes(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_my_classes(uuid[]) TO authenticated;
