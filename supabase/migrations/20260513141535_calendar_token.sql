-- Session 13: per-user opaque token for calendar.ics subscription URLs.
--
-- The token IS the credential for the calendar feed — Google/Apple Calendar
-- can't send Supabase auth cookies, so the URL itself carries access. The
-- column is nullable: lazy-create on first request from the Subscribe UI.
-- Regenerating overwrites the previous value, which immediately invalidates
-- the old subscription URL (useful if the user suspects the URL was shared).
--
-- We do NOT need RLS on this column because:
--   - The /calendar/[token]/route.ts handler uses service-role to look up
--     the profile by token, bypassing RLS entirely (the token IS the auth)
--   - Reads/writes via session-scoped supabase client go through existing
--     profile RLS policies (self-service select/update), which already
--     restrict to auth.uid()
--
-- Storage: 32 url-safe random bytes encoded as base64url (~43 chars).

ALTER TABLE public.profiles
  ADD COLUMN calendar_token text;

-- Unique index for fast token lookup. Partial (only non-null rows) so we
-- don't waste space on users who never subscribe.
CREATE UNIQUE INDEX profiles_calendar_token_key
  ON public.profiles (calendar_token)
  WHERE calendar_token IS NOT NULL;
