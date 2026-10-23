-- Message requests, edit/delete messages, delete conversation (for me)
begin;

-- ---------- Columns ----------
alter table public.conversations
  add column if not exists status text not null default 'accepted',
  add column if not exists requested_by uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.conversations
    add constraint conversations_status_check check (status in ('pending','accepted','declined'));
exception when duplicate_object then null; end $$;

alter table public.conversation_participants
  add column if not exists cleared_at timestamptz;

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- ---------- Who can send right now ----------
-- Accepted: both. Pending: only the requester, and only their first message.
create or replace function public.can_send_in_conversation(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from conversations c
    join conversation_participants me
      on me.conversation_id = c.id and me.user_id = auth.uid()
    where c.id = p_conversation_id
      and (
        c.status = 'accepted'
        or (
          c.status = 'pending'
          and c.requested_by = auth.uid()
          and not exists (select 1 from messages m where m.conversation_id = c.id)
        )
      )
  );
$$;

drop policy if exists "participants can send messages" on public.messages;
create policy "participants can send messages" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_send_in_conversation(conversation_id));

-- ---------- Start conversation (teachers/admins skip the request) ----------
create or replace function public.start_direct_conversation(p_other uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_status text;
  v_requested_by uuid;
  v_auto boolean;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_other = v_me then raise exception 'You cannot message yourself.'; end if;
  if not users_share_class(v_me, p_other) then
    raise exception 'You can only message people in your classes.';
  end if;

  select cp1.conversation_id into v_id
  from conversation_participants cp1
  join conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id and cp2.user_id = p_other
  where cp1.user_id = v_me
  limit 1;

  if v_id is not null then
    select status, requested_by into v_status, v_requested_by from conversations where id = v_id;
    -- If the person who RECEIVED a request reaches out themselves, treat it as accepting.
    if v_status <> 'accepted' and v_requested_by is distinct from v_me then
      update conversations set status = 'accepted' where id = v_id;
    end if;
    return v_id;
  end if;

  v_auto := exists (select 1 from profiles where id = v_me and role::text in ('teacher','admin'));

  insert into conversations (status, requested_by)
  values (case when v_auto then 'accepted' else 'pending' end, v_me)
  returning id into v_id;

  insert into conversation_participants (conversation_id, user_id)
  values (v_id, v_me), (v_id, p_other);
  return v_id;
end;
$$;

-- ---------- Accept / decline ----------
create or replace function public.respond_to_message_request(p_conversation_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_conversation_participant(p_conversation_id) then
    raise exception 'Not allowed.';
  end if;
  update conversations
    set status = case when p_accept then 'accepted' else 'declined' end
    where id = p_conversation_id
      and status = 'pending'
      and requested_by is distinct from auth.uid();
  if not found then raise exception 'There is no request to respond to.'; end if;
end;
$$;

-- ---------- Edit / delete own message ----------
create or replace function public.edit_message(p_message_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid;
  v_latest uuid;
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Message must be 1 to 2000 characters.';
  end if;
  update messages
    set body = btrim(p_body), edited_at = now()
    where id = p_message_id and sender_id = auth.uid() and deleted_at is null
    returning conversation_id into v_conv;
  if v_conv is null then raise exception 'You can only edit your own messages.'; end if;

  select id into v_latest from messages where conversation_id = v_conv order by created_at desc limit 1;
  if v_latest = p_message_id then
    update conversations set last_message_preview = left(btrim(p_body), 140) where id = v_conv;
  end if;
end;
$$;

create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid;
  v_latest uuid;
begin
  update messages
    set body = '[deleted]', deleted_at = now()
    where id = p_message_id and sender_id = auth.uid() and deleted_at is null
    returning conversation_id into v_conv;
  if v_conv is null then raise exception 'You can only delete your own messages.'; end if;

  select id into v_latest from messages where conversation_id = v_conv order by created_at desc limit 1;
  if v_latest = p_message_id then
    update conversations set last_message_preview = 'Message deleted' where id = v_conv;
  end if;
end;
$$;

-- ---------- Delete conversation (only for me) ----------
create or replace function public.clear_conversation_for_me(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update conversation_participants
    set cleared_at = now(), last_read_at = now()
    where conversation_id = p_conversation_id and user_id = auth.uid();
  if not found then raise exception 'Conversation not found.'; end if;
end;
$$;

-- ---------- Inbox (now with request status, hides cleared/declined) ----------
drop function if exists public.list_my_conversations();
create function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_full_name text,
  other_username text,
  other_avatar_url text,
  other_role text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int,
  status text,
  requested_by_me boolean,
  cleared_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    p.id,
    p.full_name,
    p.username,
    p.avatar_url,
    p.role::text,
    c.last_message_at,
    c.last_message_preview,
    (
      select count(*)::int from messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > me.last_read_at
    ),
    -- The requester never learns they were declined: it just stays "pending" for them.
    case when c.status = 'declined' and c.requested_by = auth.uid() then 'pending' else c.status end,
    coalesce(c.requested_by = auth.uid(), false),
    me.cleared_at
  from conversation_participants me
  join conversations c on c.id = me.conversation_id
  join conversation_participants other
    on other.conversation_id = c.id and other.user_id <> me.user_id
  join profiles p on p.id = other.user_id
  where me.user_id = auth.uid()
    and (me.cleared_at is null or c.last_message_at > me.cleared_at)
    and not (c.status = 'declined' and c.requested_by is distinct from auth.uid())
    and (c.last_message_preview is not null or c.requested_by is not distinct from auth.uid())
  order by c.last_message_at desc;
$$;

-- Unread badge ignores conversations I declined
create or replace function public.unread_message_count()
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(count(*), 0)::int
  from messages m
  join conversation_participants me
    on me.conversation_id = m.conversation_id and me.user_id = auth.uid()
  join conversations c on c.id = m.conversation_id
  where m.sender_id <> auth.uid()
    and m.created_at > me.last_read_at
    and not (c.status = 'declined' and c.requested_by is distinct from auth.uid());
$$;

-- ---------- Permissions ----------
revoke all on function public.can_send_in_conversation(uuid) from public, anon;
revoke all on function public.respond_to_message_request(uuid, boolean) from public, anon;
revoke all on function public.edit_message(uuid, text) from public, anon;
revoke all on function public.delete_message(uuid) from public, anon;
revoke all on function public.clear_conversation_for_me(uuid) from public, anon;
revoke all on function public.list_my_conversations() from public, anon;
grant execute on function public.can_send_in_conversation(uuid) to authenticated;
grant execute on function public.respond_to_message_request(uuid, boolean) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.clear_conversation_for_me(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;

-- ---------- Realtime: accepted requests update live ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261023140000', 'message_requests_edit_delete')
on conflict do nothing;

commit;

notify pgrst, 'reload schema';