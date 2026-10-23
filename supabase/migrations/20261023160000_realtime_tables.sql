-- Let these tables broadcast changes (RLS still decides who receives them)
do $$
declare
  t text;
  tables text[] := array[
    'activities',
    'activity_submissions',
    'activity_grades',
    'quiz_attempts',
    'class_modules',
    'module_lessons',
    'class_announcements',
    'announcement_comments',
    'announcement_likes',
    'class_enrollments',
    'notifications',
    'flashcard_decks'
  ];
begin
  foreach t in array tables loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t)
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261023160000', 'realtime_tables')
on conflict do nothing;