create table if not exists public.activity_answer_keys (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.activity_answer_keys enable row level security;

-- Teachers/admins only, and only for activities they can already see
drop policy if exists answer_keys_teacher_all on public.activity_answer_keys;
create policy answer_keys_teacher_all on public.activity_answer_keys
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','admin'))
    and exists (select 1 from public.activities a where a.id = activity_id)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','admin'))
    and exists (select 1 from public.activities a where a.id = activity_id)
  );

grant select, insert, update, delete on public.activity_answer_keys to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261023010000', 'activity_answer_keys')
on conflict do nothing;