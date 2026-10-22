-- Direct messages: 1-on-1 text chat between people who share a class.
begin;

-- ---------- Tables ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- ---------- Helper functions ----------
-- Is the current user in this conversation? (security definer avoids RLS recursion)
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

-- Do two users share an active class (as teacher or enrolled student)?
create or replace function public.users_share_class(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  with memberships as (
    select c.id as class_id, c.teacher_id as user_id
    from classes c
    where not coalesce(c.is_archived, false)
    union
    select e.class_id, e.student_id
    from class_enrollments e
    join classes c on c.id = e.class_id
    where not coalesce(c.is_archived, false)
  )
  select exists (
    select 1
    from memberships m1
    join memberships m2 on m1.class_id = m2.class_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

-- Start (or reuse) a 1-on-1 conversation with someone in one of your classes.
create or replace function public.start_direct_conversation(p_other uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if p_other = v_me then
    raise exception 'You cannot message yourself.';
  end if;
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
    return v_id;
  end if;

  insert into conversations default values returning id into v_id;
  insert into conversation_participants (conversation_id, user_id)
  values (v_id, v_me), (v_id, p_other);
  return v_id;
end;
$$;

-- Inbox list for the current user, with the other person's info + unread count.
create or replace function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_full_name text,
  other_username text,
  other_avatar_url text,
  other_role text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int
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
    )
  from conversation_participants me
  join conversations c on c.id = me.conversation_id
  join conversation_participants other
    on other.conversation_id = c.id and other.user_id <> me.user_id
  join profiles p on p.id = other.user_id
  where me.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

-- Total unread messages for the sidebar badge.
create or replace function public.unread_message_count()
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(count(*), 0)::int
  from messages m
  join conversation_participants me
    on me.conversation_id = m.conversation_id and me.user_id = auth.uid()
  where m.sender_id <> auth.uid()
    and m.created_at > me.last_read_at;
$$;

-- Keep the conversation preview fresh and mark the sender as having read it.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations
    set last_message_at = new.created_at,
        last_message_preview = left(new.body, 140)
    where id = new.conversation_id;
  update conversation_participants
    set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- ---------- Permissions ----------
revoke all on function public.users_share_class(uuid, uuid) from public, anon;
revoke all on function public.start_direct_conversation(uuid) from public, anon;
revoke all on function public.list_my_conversations() from public, anon;
revoke all on function public.unread_message_count() from public, anon;
grant execute on function public.users_share_class(uuid, uuid) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;
grant execute on function public.unread_message_count() to authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

-- ---------- Row Level Security ----------
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists "participants can view conversation" on public.conversations;
create policy "participants can view conversation" on public.conversations
  for select to authenticated
  using (public.is_conversation_participant(id));

drop policy if exists "participants can view members" on public.conversation_participants;
create policy "participants can view members" on public.conversation_participants
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "users update own read state" on public.conversation_participants;
create policy "users update own read state" on public.conversation_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "participants can read messages" on public.messages;
create policy "participants can read messages" on public.messages
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "participants can send messages" on public.messages;
create policy "participants can send messages" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_participant(conversation_id));

-- ---------- Realtime ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';