-- Phase 5a #2 -- Class ordering (drag-and-drop)
--
-- Adds display_order to:
--   classes              (per teacher)
--   class_enrollments    (per student)
--
-- Lower number = higher in the list. Newer rows get lower numbers so unmoved
-- ordering matches "newest first," which is the Google Classroom default.

-- ---------- classes.display_order ----------
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Backfill: per teacher, newest = 0, next = 1, etc.
WITH ranked AS (
  SELECT id,
         (row_number() OVER (PARTITION BY teacher_id ORDER BY created_at DESC) - 1) AS rn
  FROM public.classes
)
UPDATE public.classes c
SET display_order = ranked.rn
FROM ranked
WHERE c.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS classes_teacher_display_order_idx
  ON public.classes (teacher_id, display_order);

-- ---------- class_enrollments.display_order ----------
ALTER TABLE public.class_enrollments
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id,
         (row_number() OVER (PARTITION BY student_id ORDER BY enrolled_at DESC) - 1) AS rn
  FROM public.class_enrollments
)
UPDATE public.class_enrollments e
SET display_order = ranked.rn
FROM ranked
WHERE e.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS enrollments_student_display_order_idx
  ON public.class_enrollments (student_id, display_order);

-- ---------- UPDATE policy on class_enrollments ----------
-- Students must be able to UPDATE their own enrollments to persist a new
-- display_order. The existing 6 policies cover SELECT/INSERT/DELETE only.
DROP POLICY IF EXISTS enrollments_update_self ON public.class_enrollments;
CREATE POLICY enrollments_update_self
  ON public.class_enrollments
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- ---------- decide_join_request: set display_order on new enrollment ----------
-- When a teacher approves a join request, the resulting enrollment row should
-- land at the TOP of the student's class list. Compute (min current - 1) for
-- that student; if they have no enrollments yet, default to 0.
CREATE OR REPLACE FUNCTION public.decide_join_request(p_request_id uuid, p_approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.class_join_requests%ROWTYPE;
  v_user    uuid := auth.uid();
  v_min_order integer;
BEGIN
  SELECT * INTO v_request
  FROM public.class_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF NOT public.is_class_teacher(v_request.class_id, v_user) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request already decided';
  END IF;

  IF p_approve THEN
    SELECT COALESCE(MIN(display_order) - 1, 0) INTO v_min_order
    FROM public.class_enrollments
    WHERE student_id = v_request.student_id;

    INSERT INTO public.class_enrollments (class_id, student_id, display_order)
    VALUES (v_request.class_id, v_request.student_id, v_min_order)
    ON CONFLICT DO NOTHING;

    UPDATE public.class_join_requests
    SET status = 'approved', decided_at = now(), decided_by = v_user
    WHERE id = p_request_id;
  ELSE
    UPDATE public.class_join_requests
    SET status = 'rejected', decided_at = now(), decided_by = v_user
    WHERE id = p_request_id;
  END IF;
END;
$function$;
