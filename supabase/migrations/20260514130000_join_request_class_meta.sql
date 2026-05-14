-- Helper for the join-request notification fan-out.
--
-- Problem: when a student requests to join a class, requestJoinClassByCode
-- needs the class name + teacher_id to notify the teacher. But that code runs
-- in the STUDENT's session, and a student with only a pending request is not
-- enrolled -- classes RLS (classes_select_enrolled_student) hides the row.
-- The .select('name, teacher_id') returns null, the notify call is skipped,
-- and the teacher never gets notified.
--
-- This SECURITY DEFINER function returns name + teacher_id for a class, but
-- ONLY if the calling user actually has a class_join_requests row for it.
-- A student can't use it to read arbitrary classes -- they'd need a real
-- request row first. Scoped, search_path pinned, body is the whole surface.

create or replace function public.get_join_request_class_meta(p_class_id uuid)
returns table (
  class_name text,
  teacher_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.name, c.teacher_id
  from public.classes c
  where c.id = p_class_id
    and exists (
      select 1
      from public.class_join_requests r
      where r.class_id = p_class_id
        and r.student_id = auth.uid()
    )
$$;

grant execute on function public.get_join_request_class_meta(uuid) to authenticated;