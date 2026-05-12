-- Personal tasks for both teachers and students.
--
-- Private to the owner: no class scope, no sharing. RLS enforces
-- owner_id = auth.uid() on every operation.
--
-- Soft-delete semantics via completed_at timestamp. A row with
-- completed_at IS NULL is "active" (shows in to-do widget). A row
-- with completed_at IS NOT NULL is "done" (hidden from widget,
-- preserved for history).
--
-- due_at is OPTIONAL. Tasks without a due_at appear in the to-do
-- widget under a "No date" subsection but do NOT surface on the
-- calendar.

CREATE TABLE public.personal_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(trim(title)) > 0),
  notes       text,
  due_at      timestamptz,
  completed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
-- Primary lookup: owner's active tasks ordered by due_at.
CREATE INDEX personal_tasks_owner_active_idx
  ON public.personal_tasks (owner_id, due_at)
  WHERE completed_at IS NULL;

-- Calendar fetch: owner's tasks with a date in a window.
CREATE INDEX personal_tasks_owner_due_idx
  ON public.personal_tasks (owner_id, due_at)
  WHERE due_at IS NOT NULL AND completed_at IS NULL;

-- Bump updated_at on UPDATE.
CREATE OR REPLACE FUNCTION public.touch_personal_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER personal_tasks_set_updated_at
  BEFORE UPDATE ON public.personal_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_personal_tasks_updated_at();

-- Row-Level Security
ALTER TABLE public.personal_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY personal_tasks_owner_select
  ON public.personal_tasks
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY personal_tasks_owner_insert
  ON public.personal_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY personal_tasks_owner_update
  ON public.personal_tasks
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY personal_tasks_owner_delete
  ON public.personal_tasks
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_tasks TO authenticated;