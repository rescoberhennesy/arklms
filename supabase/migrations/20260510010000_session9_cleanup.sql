-- Session 9 carry-forward cleanup:
--  1. Drop duplicate UNIQUE constraint on class_enrollments(class_id, student_id)
--  2. Drop duplicate unified_* policies on classes (granular policies cover them)
--
-- Safe to apply: all dropped objects have functional equivalents already in place.

-- ============================================================================
-- 1. Drop duplicate unique constraint on class_enrollments
-- ============================================================================
-- Both class_enrollments_class_id_student_id_key and class_enrollments_unique_pair
-- enforce UNIQUE(class_id, student_id). Keep the auto-named *_key (Postgres-generated
-- from UNIQUE inline in CREATE TABLE), drop the explicitly-named duplicate.

ALTER TABLE class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_unique_pair;

-- ============================================================================
-- 2. Drop duplicate unified_* policies on classes
-- ============================================================================
-- These are leftover from an earlier consolidation attempt. The granular
-- classes_select_admin / _teacher / _enrolled_student and classes_insert_policy
-- policies cover all required access paths. RLS policies OR together so these
-- duplicates don't gate anything, but they're noise in \d output and EXPLAIN.

DROP POLICY IF EXISTS unified_select_classes ON classes;
DROP POLICY IF EXISTS unified_insert_classes ON classes;