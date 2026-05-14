-- Student-facing read of their own join requests, WITH the class name.
--
-- Why this exists: class_join_requests has class_join_requests_select_own
-- (student_id = auth.uid()), so a student CAN read their own request rows.
-- But the class name lives in public.classes, and a student with a *pending*
-- or *rejected* request is NOT enrolled -- classes_select_enrolled_student
-- doesn't apply, so an embedded PostgREST join (classes:class_id(name))
-- returns null and the UI shows "(unknown class)".
--
-- This SECURITY DEFINER function bypasses RLS to read classes.name, but is
-- tightly scoped: it ONLY ever returns rows where
-- class_join_requests.student_id = auth.uid(). It exposes the class id, name,
-- request status, and timestamps -- nothing else about the class. A student
-- can only see a name for a class they demonstrably have a request row for.
--
-- search_path is pinned. Function body is the entire attack surface.

create or replace function public.get_my_join_requests()
returns table (
  id           uuid,
  class_id     uuid,
  class_name   text,
  status       join_request_status,
  requested_at timestamptz,
  decided_at   timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    r.id,
    r.class_id,
    c.name as class_name,
    r.status,
    r.requested_at,
    r.decided_at
  from public.class_join_requests r
  join public.classes c on c.id = r.class_id
  where r.student_id = auth.uid()
$$;

-- Authenticated users may call it; the body's auth.uid() filter is the gate.
grant execute on function public.get_my_join_requests() to authenticated;