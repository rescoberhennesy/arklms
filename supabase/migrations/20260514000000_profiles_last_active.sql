
-- 20260514000000_profiles_last_active.sql
--
-- Adds profiles.last_active_at — a coarse "last seen" timestamp updated
-- by the auth middleware (src/lib/supabase/middleware.ts) on protected
-- route navigation, throttled to at most one write per user per 5 min.
--
-- Nullable, no default: NULL means "not seen since this column shipped"
-- and renders as "Never" in the teacher roster UI.
--
-- No index: the column is never used in a WHERE/ORDER on its own. The
-- middleware updates a single row by primary key (id); the roster read
-- selects it as a plain column on an already-filtered enrollment join.
-- Adding an index would only cost write throughput for no read benefit.
--
-- Note on the existing BEFORE UPDATE trigger (update_profiles_updated_at):
-- the middleware's UPDATE will also bump profiles.updated_at as a side
-- effect. This is harmless — updated_at is not load-bearing anywhere —
-- but is called out here so a future reader isn't surprised that
-- updated_at moves on mere navigation.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

COMMENT ON COLUMN public.profiles.last_active_at IS
  'Coarse last-seen timestamp. Updated by auth middleware on protected '
  'route navigation, throttled to ~5 min granularity. NULL = never seen '
  'since the column was added.';
