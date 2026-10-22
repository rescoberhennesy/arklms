-- Announcement likes (acknowledgements)

create table if not exists public.announcement_likes (
  announcement_id uuid not null references public.class_announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists announcement_likes_user_idx
  on public.announcement_likes (user_id);

alter table public.announcement_likes enable row level security;

-- Anyone who can see the announcement can see its likes
-- (the subquery respects class_announcements RLS)
drop policy if exists likes_select_via_parent on public.announcement_likes;
create policy likes_select_via_parent on public.announcement_likes
  for select to authenticated
  using (exists (
    select 1 from public.class_announcements a where a.id = announcement_id
  ));

-- You can only like as yourself, on announcements you can see
drop policy if exists likes_insert_own on public.announcement_likes;
create policy likes_insert_own on public.announcement_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.class_announcements a where a.id = announcement_id
    )
  );

-- You can only remove your own like
drop policy if exists likes_delete_own on public.announcement_likes;
create policy likes_delete_own on public.announcement_likes
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.announcement_likes to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261022233000', 'announcement_likes')
on conflict do nothing;