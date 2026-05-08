-- Phase 7 Layer A: class_modules
-- Two-level content hierarchy. Modules are the top-level grouping;
-- lessons live inside modules (next migration). A module belongs to one
-- class and has a per-class display_order for drag-and-drop reordering.

CREATE TABLE public.class_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-class unique display_order, plus index for ordered fetch.
-- Two-pass-write pattern (see reorder RPC) handles the non-deferrable
-- collision during multi-row UPDATEs.
CREATE UNIQUE INDEX class_modules_class_order_uniq
  ON public.class_modules (class_id, display_order);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_class_modules_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER class_modules_set_updated_at
  BEFORE UPDATE ON public.class_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_class_modules_set_updated_at();

-- RLS
ALTER TABLE public.class_modules ENABLE ROW LEVEL SECURITY;

-- SELECT: admin OR teacher of class OR enrolled student
CREATE POLICY class_modules_select ON public.class_modules
  FOR SELECT
  TO authenticated
  USING (
    get_user_role(auth.uid()) = 'admin'::user_role
    OR is_class_teacher(class_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.class_enrollments e
      WHERE e.class_id = class_modules.class_id
        AND e.student_id = auth.uid()
    )
  );

-- INSERT: teacher of class only
CREATE POLICY class_modules_insert ON public.class_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (is_class_teacher(class_id, auth.uid()));

-- UPDATE: teacher of class only
CREATE POLICY class_modules_update ON public.class_modules
  FOR UPDATE
  TO authenticated
  USING (is_class_teacher(class_id, auth.uid()))
  WITH CHECK (is_class_teacher(class_id, auth.uid()));

-- DELETE: teacher of class only
CREATE POLICY class_modules_delete ON public.class_modules
  FOR DELETE
  TO authenticated
  USING (is_class_teacher(class_id, auth.uid()));

COMMENT ON TABLE public.class_modules IS
  'Top-level content grouping within a class. Contains lessons.';