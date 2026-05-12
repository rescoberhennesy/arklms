-- Fix: personal_tasks.updated_at must advance even within a single
-- transaction. now() returns transaction start time, so two updates
-- in the same statement (or a test using pg_sleep) keep the same
-- updated_at. clock_timestamp() returns true wall-clock time which is
-- the standard choice for updated_at trigger columns.
--
-- Forward-fix only: replace the trigger function body. The trigger
-- itself remains intact and continues firing.

CREATE OR REPLACE FUNCTION public.touch_personal_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;