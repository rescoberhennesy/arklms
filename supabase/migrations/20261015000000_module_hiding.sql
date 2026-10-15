-- 20261015000000_module_hiding.sql
-- Adds class_modules.is_hidden and hides hidden modules (and their lessons)
-- from students. Teachers and admins still see everything.

begin;

-- 1. Column
alter table public.class_modules
  add column if not exists is_hidden boolean not null default false;

comment on column public.class_modules.is_hidden is
  'When true, the module and its lessons are hidden from enrolled students.';

-- 2. Modules: students only see non-hidden modules
drop policy if exists class_modules_select on public.class_modules;
create policy class_modules_select on public.class_modules
  for select
  using (
    get_user_role(auth.uid()) = 'admin'::user_role
    or is_class_teacher(class_id, auth.uid())
    or (
      is_hidden = false
      and exists (
        select 1
        from class_enrollments e
        where e.class_id = class_modules.class_id
          and e.student_id = auth.uid()
      )
    )
  );

-- 3. Lessons: students only see published lessons in non-hidden modules
drop policy if exists module_lessons_select on public.module_lessons;
create policy module_lessons_select on public.module_lessons
  for select
  using (
    get_user_role(auth.uid()) = 'admin'::user_role
    or exists (
      select 1
      from class_modules m
      where m.id = module_lessons.module_id
        and is_class_teacher(m.class_id, auth.uid())
    )
    or (
      published = true
      and exists (
        select 1
        from class_modules m
        join class_enrollments e on e.class_id = m.class_id
        where m.id = module_lessons.module_id
          and m.is_hidden = false
          and e.student_id = auth.uid()
      )
    )
  );

commit;