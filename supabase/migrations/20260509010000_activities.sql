-- supabase/migrations/20260509010000_activities.sql
--
-- Phase 8a Layer A — Migration 1 of 5
-- Activities table (assignments only for now; quiz support added in 8b).
--
-- Design notes:
-- * activity_kind is an enum so 8b can add 'quiz' with ALTER TYPE without
--   touching this table.
-- * submission_type 'none' covers participation-graded activities (teacher
--   grades manually with no student submission).
-- * start_at gates visibility for students even when published = true.
--   Teacher can schedule an activity ahead of time.
-- * allow_late and allow_resubmission are per-activity teacher toggles.
-- * term mirrors the module_term enum from Phase 7 so the gradebook can
--   group by Prelim/Midterm/Prefinal/Final.

-- Enums --------------------------------------------------------------------

CREATE TYPE activity_kind AS ENUM ('assignment');

CREATE TYPE submission_type AS ENUM ('file', 'text', 'both', 'none');

-- Table --------------------------------------------------------------------

CREATE TABLE activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term            module_term NOT NULL,
  activity_kind   activity_kind NOT NULL DEFAULT 'assignment',
  title           text NOT NULL CHECK (length(trim(title)) > 0),
  description     text NOT NULL DEFAULT '',
  max_points      numeric(8, 2) NOT NULL CHECK (max_points > 0),
  start_at        timestamptz NOT NULL DEFAULT now(),
  due_at          timestamptz NOT NULL,
  allow_late      boolean NOT NULL DEFAULT false,
  allow_resubmission boolean NOT NULL DEFAULT false,
  submission_type submission_type NOT NULL,
  published       boolean NOT NULL DEFAULT false,
  display_order   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT activities_due_after_start CHECK (due_at >= start_at)
);

-- Indexes ------------------------------------------------------------------

CREATE UNIQUE INDEX activities_class_term_order_idx
  ON activities (class_id, term, display_order);

CREATE INDEX activities_student_visibility_idx
  ON activities (class_id, published, start_at);

CREATE INDEX activities_class_id_idx ON activities (class_id);

-- updated_at trigger -------------------------------------------------------

CREATE TRIGGER tg_activities_set_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS ----------------------------------------------------------------------

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY activities_admin_select ON activities
  FOR SELECT
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY activities_teacher_select ON activities
  FOR SELECT
  USING (is_class_teacher(class_id, auth.uid()));

-- Note: column on class_enrollments is student_id (not user_id).
CREATE POLICY activities_student_select ON activities
  FOR SELECT
  USING (
    published = true
    AND start_at <= now()
    AND EXISTS (
      SELECT 1 FROM class_enrollments e
      WHERE e.class_id = activities.class_id
        AND e.student_id = auth.uid()
    )
  );

CREATE POLICY activities_teacher_insert ON activities
  FOR INSERT
  WITH CHECK (is_class_teacher(class_id, auth.uid()));

CREATE POLICY activities_teacher_update ON activities
  FOR UPDATE
  USING (is_class_teacher(class_id, auth.uid()))
  WITH CHECK (is_class_teacher(class_id, auth.uid()));

CREATE POLICY activities_teacher_delete ON activities
  FOR DELETE
  USING (is_class_teacher(class_id, auth.uid()));

-- Comments -----------------------------------------------------------------

COMMENT ON TABLE activities IS 'Per-class graded activities (assignments now, quizzes in Phase 8b).';
COMMENT ON COLUMN activities.start_at IS 'Activity is hidden from students until this time, even if published.';
COMMENT ON COLUMN activities.due_at IS 'Past this time, no submissions accepted unless allow_late = true.';
COMMENT ON COLUMN activities.allow_late IS 'When true, students can submit after due_at; submission is flagged is_late.';
COMMENT ON COLUMN activities.allow_resubmission IS 'When true, students can replace their submission even after grading (clears the grade).';
COMMENT ON COLUMN activities.published IS 'Drafts are not visible to students. Combined with start_at for scheduled release.';
