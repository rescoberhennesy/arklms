-- supabase/migrations/20260509040000_class_grade_weights.sql
--
-- Phase 8a Layer A — Migration 4 of 5
-- Per-class term weights for final grade computation.
--
-- Design notes:
-- * One row per class. Absence of row = unweighted fallback (action layer
--   computes mean across all returned grades regardless of term).
-- * Weights are per-term percentages summing to exactly 100. CHECK
--   enforced at write time.
-- * Numeric(5,2) supports values like 25.00 or 33.33 (rounding edge case
--   when teacher splits four terms unevenly). Sum-to-100 check tolerates
--   tiny float drift via 0.01 epsilon.
-- * No display_order, no soft-delete, no history — this is config data.

CREATE TABLE class_grade_weights (
  class_id     uuid PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  prelim_pct   numeric(5, 2) NOT NULL CHECK (prelim_pct >= 0 AND prelim_pct <= 100),
  midterm_pct  numeric(5, 2) NOT NULL CHECK (midterm_pct >= 0 AND midterm_pct <= 100),
  prefinal_pct numeric(5, 2) NOT NULL CHECK (prefinal_pct >= 0 AND prefinal_pct <= 100),
  final_pct    numeric(5, 2) NOT NULL CHECK (final_pct >= 0 AND final_pct <= 100),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT class_grade_weights_sum_100
    CHECK (abs((prelim_pct + midterm_pct + prefinal_pct + final_pct) - 100) < 0.01)
);

CREATE TRIGGER tg_class_grade_weights_set_updated_at
  BEFORE UPDATE ON class_grade_weights
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS ----------------------------------------------------------------------

ALTER TABLE class_grade_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY class_grade_weights_admin_select ON class_grade_weights
  FOR SELECT
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY class_grade_weights_teacher_select ON class_grade_weights
  FOR SELECT
  USING (is_class_teacher(class_id, auth.uid()));

-- Students of the class can read so they see how their grade is computed
CREATE POLICY class_grade_weights_student_select ON class_grade_weights
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_enrollments e
      WHERE e.class_id = class_grade_weights.class_id
        AND e.student_id = auth.uid()
    )
  );

CREATE POLICY class_grade_weights_teacher_insert ON class_grade_weights
  FOR INSERT
  WITH CHECK (is_class_teacher(class_id, auth.uid()));

CREATE POLICY class_grade_weights_teacher_update ON class_grade_weights
  FOR UPDATE
  USING (is_class_teacher(class_id, auth.uid()))
  WITH CHECK (is_class_teacher(class_id, auth.uid()));

CREATE POLICY class_grade_weights_teacher_delete ON class_grade_weights
  FOR DELETE
  USING (is_class_teacher(class_id, auth.uid()));

-- Comments -----------------------------------------------------------------

COMMENT ON TABLE class_grade_weights IS 'Per-class term weights for final grade computation. Absent row = unweighted fallback.';
COMMENT ON COLUMN class_grade_weights.prelim_pct IS 'Weight (0-100) for Prelim term in final grade. Sum of all four columns must equal 100.';
