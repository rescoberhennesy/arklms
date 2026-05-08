-- Phase 7 Layer A: module_lessons
-- Lessons live inside modules. A lesson has a markdown body, a published
-- flag (students only see published lessons), and a per-module display_order
-- for drag-and-drop reordering.
--
-- Note on RLS for student SELECT: we have to derive class_id from the
-- module to apply is_class_teacher and enrollment checks. Done via EXISTS
-- subquery against class_modules.

CREATE TABLE public.module_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.class_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-module unique display_order, plus index for ordered fetch.
CREATE UNIQUE INDEX module_lessons_module_order_uniq
  ON public.module_lessons (module_id, display_order);

-- Index for the common student query: published lessons in a module.
CREATE INDEX module_lessons_module_published_idx
  ON public.module_lessons (module_id, published, display_order);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_module_lessons_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER module_lessons_set_updated_at
  BEFORE UPDATE ON public.module_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_module_lessons_set_updated_at();

-- published_at trigger: set when published flips false -> true,
-- clear when flipping true -> false.
CREATE OR REPLACE FUNCTION public.tg_module_lessons_set_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.published = true AND (OLD.published IS DISTINCT FROM true) THEN
    NEW.published_at = now();
  ELSIF NEW.published = false AND OLD.published = true THEN
    NEW.published_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER module_lessons_set_published_at
  BEFORE UPDATE OF published ON public.module_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_module_lessons_set_published_at();

-- Initial INSERT: if published=true on creation, set published_at too
CREATE OR REPLACE FUNCTION public.tg_module_lessons_set_published_at_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.published = true THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER module_lessons_set_published_at_insert
  BEFORE INSERT ON public.module_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_module_lessons_set_published_at_insert();

-- RLS
ALTER TABLE public.module_lessons ENABLE ROW LEVEL SECURITY;

-- SELECT: admin OR teacher of parent class OR (enrolled student AND published)
CREATE POLICY module_lessons_select ON public.module_lessons
  FOR SELECT
  TO authenticated
  USING (
    get_user_role(auth.uid()) = 'admin'::user_role
    OR EXISTS (
      SELECT 1 FROM public.class_modules m
      WHERE m.id = module_lessons.module_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
    OR (
      module_lessons.published = true
      AND EXISTS (
        SELECT 1
        FROM public.class_modules m
        JOIN public.class_enrollments e ON e.class_id = m.class_id
        WHERE m.id = module_lessons.module_id
          AND e.student_id = auth.uid()
      )
    )
  );

-- INSERT: teacher of parent class only
CREATE POLICY module_lessons_insert ON public.module_lessons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_modules m
      WHERE m.id = module_lessons.module_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

-- UPDATE: teacher of parent class only
CREATE POLICY module_lessons_update ON public.module_lessons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_modules m
      WHERE m.id = module_lessons.module_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.class_modules m
      WHERE m.id = module_lessons.module_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

-- DELETE: teacher of parent class only
CREATE POLICY module_lessons_delete ON public.module_lessons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_modules m
      WHERE m.id = module_lessons.module_id
        AND is_class_teacher(m.class_id, auth.uid())
    )
  );

COMMENT ON TABLE public.module_lessons IS
  'Lessons within a module. Students only see published lessons.';