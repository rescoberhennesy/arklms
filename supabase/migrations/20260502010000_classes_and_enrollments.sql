-- =====================================================================
-- Migration: Classes and Enrollments
-- Date: 2026-05-02
-- Purpose: Core schema for teacher-created classes (Google Classroom style)
--   - classes: a teacher's class for a subject in a given semester.
--     "section" is a free-text label owned by the teacher (no central
--     sections table); the modal autocompletes from the teacher's own
--     past values via a DISTINCT query.
--   - class_enrollments: students enrolled in a class
--   - Invite codes: 7-char unambiguous lowercase+digit, like Google Classroom
--
-- Schema is designed for a single teacher-per-class today, but RLS policies
-- route through is_class_teacher() so co-teachers can be added later by
-- introducing a class_teachers table without rewriting policies.
-- =====================================================================


-- =====================================================================
-- 1. CLASSES TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                                    -- "Web Development"
  section       TEXT,                                             -- "BSIT-3A" (free text, teacher-owned)
  subject_code  TEXT,                                             -- "IT-301"
  semester      TEXT NOT NULL,                                    -- "1st Sem 2026-2027"
  description   TEXT,
  color         TEXT NOT NULL DEFAULT '#dc2626',                  -- auto-assigned hex
  invite_code   TEXT NOT NULL UNIQUE,                             -- 7-char, e.g., "gabxk2p"
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classes_teacher_id_idx     ON public.classes (teacher_id);
CREATE INDEX IF NOT EXISTS classes_invite_code_idx    ON public.classes (invite_code);
CREATE INDEX IF NOT EXISTS classes_is_archived_idx    ON public.classes (is_archived);
-- Speeds up the autocomplete query: DISTINCT section WHERE teacher_id = ?
CREATE INDEX IF NOT EXISTS classes_teacher_section_idx ON public.classes (teacher_id, section);


-- =====================================================================
-- 2. CLASS_ENROLLMENTS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.class_enrollments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS class_enrollments_class_id_idx   ON public.class_enrollments (class_id);
CREATE INDEX IF NOT EXISTS class_enrollments_student_id_idx ON public.class_enrollments (student_id);


-- =====================================================================
-- 3. INVITE CODE GENERATOR
-- =====================================================================
-- 7-char codes from an unambiguous alphabet (no 0/o/1/l/i to avoid confusion).
-- ~31^7 ≈ 27 billion combinations; collisions are vanishingly rare,
-- but we still retry up to 5 times against the UNIQUE constraint.
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet  TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';  -- no 0,o,1,l,i
  result    TEXT;
  i         INT;
  attempt   INT := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..7 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;

    -- Check uniqueness against existing classes
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE invite_code = result) THEN
      RETURN result;
    END IF;

    attempt := attempt + 1;
    IF attempt >= 5 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 5 attempts';
    END IF;
  END LOOP;
END;
$$;


-- =====================================================================
-- 4. AUTO-ASSIGN INVITE CODE & UPDATED_AT TRIGGERS
-- =====================================================================
-- Auto-generate invite_code on insert if not provided
CREATE OR REPLACE FUNCTION public.classes_set_invite_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    NEW.invite_code := public.generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classes_set_invite_code_trigger ON public.classes;
CREATE TRIGGER classes_set_invite_code_trigger
  BEFORE INSERT ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.classes_set_invite_code();

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classes_updated_at_trigger ON public.classes;
CREATE TRIGGER classes_updated_at_trigger
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =====================================================================
-- 5. is_class_teacher() — central authorization helper
-- =====================================================================
-- All teacher-side RLS policies route through this function.
-- Today: returns TRUE if user is the class's teacher_id.
-- Tomorrow (when co-teachers ship): also check class_teachers table.
-- Updating this one function will retroactively grant all teacher
-- privileges to co-teachers across every policy.
CREATE OR REPLACE FUNCTION public.is_class_teacher(p_class_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id AND teacher_id = p_user_id
  );
$$;


-- =====================================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE public.classes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 7. RLS POLICIES — CLASSES
-- =====================================================================
-- Teachers can SELECT their own classes
DROP POLICY IF EXISTS "classes_select_teacher" ON public.classes;
CREATE POLICY "classes_select_teacher"
  ON public.classes FOR SELECT
  TO authenticated
  USING (public.is_class_teacher(id, auth.uid()));

-- Students can SELECT classes they are enrolled in
DROP POLICY IF EXISTS "classes_select_enrolled_student" ON public.classes;
CREATE POLICY "classes_select_enrolled_student"
  ON public.classes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_enrollments
      WHERE class_enrollments.class_id = classes.id
        AND class_enrollments.student_id = auth.uid()
    )
  );

-- Admins can SELECT all classes
DROP POLICY IF EXISTS "classes_select_admin" ON public.classes;
CREATE POLICY "classes_select_admin"
  ON public.classes FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Teachers can INSERT classes (only with themselves as teacher_id)
DROP POLICY IF EXISTS "classes_insert_teacher" ON public.classes;
CREATE POLICY "classes_insert_teacher"
  ON public.classes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'teacher'
    AND teacher_id = auth.uid()
  );

-- Teachers can UPDATE their own classes (route through is_class_teacher)
DROP POLICY IF EXISTS "classes_update_teacher" ON public.classes;
CREATE POLICY "classes_update_teacher"
  ON public.classes FOR UPDATE
  TO authenticated
  USING (public.is_class_teacher(id, auth.uid()))
  WITH CHECK (public.is_class_teacher(id, auth.uid()));

-- Teachers can DELETE their own classes
-- (UI uses archive, but DELETE is exposed for future admin tools / cleanup)
DROP POLICY IF EXISTS "classes_delete_teacher" ON public.classes;
CREATE POLICY "classes_delete_teacher"
  ON public.classes FOR DELETE
  TO authenticated
  USING (public.is_class_teacher(id, auth.uid()));

-- Admins can do anything on classes
DROP POLICY IF EXISTS "classes_admin_all" ON public.classes;
CREATE POLICY "classes_admin_all"
  ON public.classes FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');


-- =====================================================================
-- 8. RLS POLICIES — CLASS_ENROLLMENTS
-- =====================================================================
-- Teachers can SELECT enrollments for their own classes (to see roster)
DROP POLICY IF EXISTS "enrollments_select_teacher" ON public.class_enrollments;
CREATE POLICY "enrollments_select_teacher"
  ON public.class_enrollments FOR SELECT
  TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()));

-- Students can SELECT their own enrollments
DROP POLICY IF EXISTS "enrollments_select_self" ON public.class_enrollments;
CREATE POLICY "enrollments_select_self"
  ON public.class_enrollments FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- Admins can SELECT all enrollments
DROP POLICY IF EXISTS "enrollments_select_admin" ON public.class_enrollments;
CREATE POLICY "enrollments_select_admin"
  ON public.class_enrollments FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Students can INSERT their own enrollment (used by join-via-code flow next session)
DROP POLICY IF EXISTS "enrollments_insert_self" ON public.class_enrollments;
CREATE POLICY "enrollments_insert_self"
  ON public.class_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND public.get_user_role(auth.uid()) = 'student'
  );

-- Teachers can DELETE enrollments in their classes (kick students)
DROP POLICY IF EXISTS "enrollments_delete_teacher" ON public.class_enrollments;
CREATE POLICY "enrollments_delete_teacher"
  ON public.class_enrollments FOR DELETE
  TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()));

-- Students can DELETE their own enrollment (leave class)
DROP POLICY IF EXISTS "enrollments_delete_self" ON public.class_enrollments;
CREATE POLICY "enrollments_delete_self"
  ON public.class_enrollments FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());


-- =====================================================================
-- 9. GRANTS
-- =====================================================================
-- Standard grants so policies can run; RLS still restricts row visibility.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_enrollments TO authenticated;

GRANT EXECUTE ON FUNCTION public.generate_invite_code()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_teacher(UUID, UUID)          TO authenticated;