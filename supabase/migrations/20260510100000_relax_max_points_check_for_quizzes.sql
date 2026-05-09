-- Phase 8b fix: relax activities_max_points_check from > 0 to >= 0.
--
-- Rationale: createQuizActivity inserts a new quiz with max_points = 0
-- because the value is computed (sum of question points), and a brand-new
-- quiz has no questions. The previous constraint (max_points > 0), correct
-- for assignments where teachers set the value up front, blocks quiz
-- creation entirely.
--
-- Assignment validation in the action layer continues to enforce > 0 from
-- the UI side (AddActivityBar), so assignments still can't reach 0 points
-- through normal flows. The DB constraint is now the broader "no negative
-- max_points" floor, which is the actual data-integrity invariant.

ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_max_points_check;

ALTER TABLE activities
  ADD CONSTRAINT activities_max_points_check
  CHECK (max_points >= 0);