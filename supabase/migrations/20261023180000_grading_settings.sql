alter table public.class_grade_weights
  add column if not exists passing_grade numeric not null default 75,
  add column if not exists grading_method text not null default 'raw';

do $$ begin
  alter table public.class_grade_weights
    add constraint class_grade_weights_method_check check (grading_method in ('raw','deped'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.class_grade_weights
    add constraint class_grade_weights_passing_check check (passing_grade between 1 and 100);
exception when duplicate_object then null; end $$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261023180000', 'grading_settings')
on conflict do nothing;