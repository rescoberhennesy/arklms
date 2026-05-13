-- Add attempt-level feedback to quiz_attempts.
-- Per-question feedback already lives on quiz_responses.feedback (nullable).
-- This column stores the overall, attempt-wide note from the teacher,
-- analogous to activity_grades.feedback for non-quiz submissions.
--
-- NOT NULL DEFAULT '' so the grader UI never has to deal with null vs ''.
-- Backfill is implicit via the default.

alter table public.quiz_attempts
  add column if not exists feedback text not null default '';

comment on column public.quiz_attempts.feedback is
  'Attempt-level (overall) feedback shown to the student alongside the quiz score.';
