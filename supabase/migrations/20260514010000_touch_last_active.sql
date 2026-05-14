
-- 20260514010000_touch_last_active.sql
--
-- Self-service "last seen" update.
--
-- WHY AN RPC INSTEAD OF AN RLS UPDATE POLICY:
-- profiles has no FOR UPDATE policy that lets a regular user touch their
-- own row — only "Admins can update all profiles" exists. Adding a blanket
-- "users can update their own profile" policy would be a privilege-
-- escalation hole: Postgres RLS restricts WHICH ROWS an UPDATE may touch,
-- not WHICH COLUMNS, so a student could rewrite their own `role` to
-- 'admin'. This SECURITY DEFINER function sidesteps that entirely: it runs
-- with the definer's privileges (bypassing RLS) but its body can ONLY ever
-- set last_active_at, and ONLY for auth.uid(). The function is the whole
-- attack surface, and it does exactly one harmless thing.
--
-- Called by the auth middleware (src/lib/supabase/middleware.ts) on
-- protected-route navigation, fire-and-forget.
--
-- Side effect: the existing BEFORE UPDATE trigger update_profiles_updated_at
-- also bumps profiles.updated_at. Harmless — updated_at is not load-bearing.

create or replace function public.touch_last_active()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for unauthenticated callers; the UPDATE then
  -- matches no rows and the function is a harmless no-op. The middleware
  -- only calls this for authenticated users anyway.
  update public.profiles
     set last_active_at = now()
   where id = auth.uid();
end;
$$;

comment on function public.touch_last_active() is
  'Sets last_active_at = now() for the calling user (auth.uid()). '
  'SECURITY DEFINER so it works without a self-update RLS policy on '
  'profiles, while structurally limiting writes to a single safe column.';

-- Allow any authenticated user to call it. The function body — not GRANT —
-- is what scopes the write to the caller's own row and to one column.
revoke all on function public.touch_last_active() from public;
grant execute on function public.touch_last_active() to authenticated;
