-- Phase 6 -- Class announcements and comments.
--
-- Two tables:
--   class_announcements   teacher-authored posts on the class stream
--   announcement_comments threaded discussion under each announcement
--
-- Conventions match the rest of the schema:
--   - SECURITY DEFINER functions where RLS would be awkward.
--   - is_class_teacher(class_id, user_id)  CLASS FIRST, USER SECOND.
--   - Per-command RLS policies, no FOR ALL.
--
-- Pinning: at most one pinned announcement per class, enforced by a partial
-- unique index. Toggling pin is done through set_announcement_pinned() which
-- atomically unpins any prior pinned announcement before setting the target.

-- ============================================================
-- class_announcements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.class_announcements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  author_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  body        text        NOT NULL,
  pinned      boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_announcements_class_idx
  ON public.class_announcements (class_id, created_at DESC);

-- At most one pinned per class.
CREATE UNIQUE INDEX IF NOT EXISTS class_announcements_one_pinned_per_class
  ON public.class_announcements (class_id)
  WHERE pinned = true;

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION public.tg_class_announcements_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS class_announcements_set_updated_at ON public.class_announcements;
CREATE TRIGGER class_announcements_set_updated_at
  BEFORE UPDATE ON public.class_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_class_announcements_set_updated_at();

ALTER TABLE public.class_announcements ENABLE ROW LEVEL SECURITY;

-- SELECT: admin OR teacher of class OR enrolled student in class.
DROP POLICY IF EXISTS announcements_select_admin ON public.class_announcements;
CREATE POLICY announcements_select_admin
  ON public.class_announcements FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::user_role);

DROP POLICY IF EXISTS announcements_select_teacher ON public.class_announcements;
CREATE POLICY announcements_select_teacher
  ON public.class_announcements FOR SELECT TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()));

DROP POLICY IF EXISTS announcements_select_enrolled_student ON public.class_announcements;
CREATE POLICY announcements_select_enrolled_student
  ON public.class_announcements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    WHERE ce.class_id = class_announcements.class_id
      AND ce.student_id = auth.uid()
  ));

-- INSERT: teacher of the class only. author_id must equal the inserter.
DROP POLICY IF EXISTS announcements_insert_teacher ON public.class_announcements;
CREATE POLICY announcements_insert_teacher
  ON public.class_announcements FOR INSERT TO authenticated
  WITH CHECK (
    public.is_class_teacher(class_id, auth.uid())
    AND author_id = auth.uid()
  );

-- UPDATE: teacher of the class only. (Pin toggling goes through the RPC.)
DROP POLICY IF EXISTS announcements_update_teacher ON public.class_announcements;
CREATE POLICY announcements_update_teacher
  ON public.class_announcements FOR UPDATE TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

-- DELETE: teacher of the class only.
DROP POLICY IF EXISTS announcements_delete_teacher ON public.class_announcements;
CREATE POLICY announcements_delete_teacher
  ON public.class_announcements FOR DELETE TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()));

-- ============================================================
-- announcement_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.announcement_comments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid        NOT NULL REFERENCES public.class_announcements(id) ON DELETE CASCADE,
  author_id       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  body            text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcement_comments_announcement_idx
  ON public.announcement_comments (announcement_id, created_at ASC);

ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: inherit visibility from the parent announcement. The user can SELECT
-- the comment iff they could SELECT the parent (any of admin / teacher /
-- enrolled student of the parent's class).
DROP POLICY IF EXISTS comments_select_via_parent ON public.announcement_comments;
CREATE POLICY comments_select_via_parent
  ON public.announcement_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_announcements a
    WHERE a.id = announcement_comments.announcement_id
      AND (
        public.get_user_role(auth.uid()) = 'admin'::user_role
        OR public.is_class_teacher(a.class_id, auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.class_enrollments ce
          WHERE ce.class_id = a.class_id
            AND ce.student_id = auth.uid()
        )
      )
  ));

-- INSERT: any authenticated user who can SELECT the parent. author_id must
-- equal the inserter.
DROP POLICY IF EXISTS comments_insert_can_view_parent ON public.announcement_comments;
CREATE POLICY comments_insert_can_view_parent
  ON public.announcement_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.class_announcements a
      WHERE a.id = announcement_id
        AND (
          public.is_class_teacher(a.class_id, auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            WHERE ce.class_id = a.class_id
              AND ce.student_id = auth.uid()
          )
        )
    )
  );

-- DELETE: author of the comment OR teacher of the parent's class.
DROP POLICY IF EXISTS comments_delete_author_or_teacher ON public.announcement_comments;
CREATE POLICY comments_delete_author_or_teacher
  ON public.announcement_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_announcements a
      WHERE a.id = announcement_comments.announcement_id
        AND public.is_class_teacher(a.class_id, auth.uid())
    )
  );

-- (No UPDATE policy on comments. Comments are immutable in v1.)

-- ============================================================
-- set_announcement_pinned RPC
-- ============================================================
-- Atomic pin toggle. When p_pinned = true, unpins any currently pinned
-- announcement in the same class first (avoiding the partial unique index
-- conflict), then pins the target. When p_pinned = false, just unpins target.
-- SECURITY DEFINER so it can perform the unpin even though the standard UPDATE
-- policy already permits it for the teacher of class -- this just keeps the
-- function self-contained and not dependent on the policy ordering.

CREATE OR REPLACE FUNCTION public.set_announcement_pinned(p_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_class_id uuid;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT class_id INTO v_class_id
  FROM public.class_announcements
  WHERE id = p_id;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'announcement not found';
  END IF;

  IF NOT public.is_class_teacher(v_class_id, v_user) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_pinned THEN
    UPDATE public.class_announcements
    SET pinned = false
    WHERE class_id = v_class_id
      AND pinned = true
      AND id <> p_id;

    UPDATE public.class_announcements
    SET pinned = true
    WHERE id = p_id;
  ELSE
    UPDATE public.class_announcements
    SET pinned = false
    WHERE id = p_id;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_announcement_pinned(uuid, boolean) TO authenticated;
