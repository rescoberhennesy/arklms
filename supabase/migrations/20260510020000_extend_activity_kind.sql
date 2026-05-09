-- Extend the activity_kind enum to include 'quiz' (Phase 8b).
--
-- IMPORTANT: This migration must be standalone. Postgres requires the
-- ALTER TYPE ... ADD VALUE to commit before the new value can be referenced
-- (e.g. in a CHECK constraint, DEFAULT, or comparison). Subsequent quiz
-- migrations reference 'quiz' freely.

ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'quiz';