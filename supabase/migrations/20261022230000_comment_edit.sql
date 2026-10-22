-- Comment editing: updated_at + trigger + author-only UPDATE policy

alter table public.announcement_comments
  add column if not exists updated_at timestamptz not null default now();

-- Existing comments shouldn't show "(edited)"
update public.announcement_comments set updated_at = created_at;

create or replace function public.touch_comment_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists announcement_comments_touch on public.announcement_comments;
create trigger announcement_comments_touch
  before update on public.announcement_comments
  for each row execute function public.touch_comment_updated_at();

-- Only the author can edit their own comment
drop policy if exists comments_update_own on public.announcement_comments;
create policy comments_update_own on public.announcement_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Only the body column is editable (can't move a comment to another post)
revoke update on public.announcement_comments from anon, authenticated;
grant update (body) on public.announcement_comments to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261022230000', 'comment_edit')
on conflict do nothing;