begin;

-- ---------- Tables ----------
create table if not exists public.class_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  from_teacher uuid not null references public.profiles(id) on delete cascade,
  to_teacher uuid not null references public.profiles(id) on delete cascade,
  note text,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists class_transfer_to_idx on public.class_transfer_requests (to_teacher, status);

create table if not exists public.class_teacher_history (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  from_teacher uuid references public.profiles(id) on delete set null,
  to_teacher uuid references public.profiles(id) on delete set null,
  method text not null check (method in ('transfer','it_reassign')),
  changed_at timestamptz not null default now()
);

-- Only the functions below touch these tables
alter table public.class_transfer_requests enable row level security;
alter table public.class_teacher_history enable row level security;

-- ---------- Helper: display name ----------
create or replace function public.profile_display_name(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(full_name), ''), email, 'A teacher') from profiles where id = p_id;
$$;

-- ---------- Teacher: send a transfer request ----------
create or replace function public.request_class_transfer(p_class_id uuid, p_email text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_to uuid;
  v_id uuid;
  v_class record;
begin
  select id, name, section, teacher_id into v_class from classes where id = p_class_id;
  if v_class.id is null or v_class.teacher_id is distinct from v_me then
    raise exception 'Only the teacher of this class can transfer it.';
  end if;

  select id into v_to from profiles
  where lower(email) = lower(btrim(p_email)) and role::text = 'teacher';
  if v_to is null then raise exception 'No teacher account found with that email.'; end if;
  if v_to = v_me then raise exception 'You already handle this class.'; end if;

  -- Only one pending request per class
  update class_transfer_requests set status = 'cancelled', responded_at = now()
  where class_id = p_class_id and status = 'pending';

  insert into class_transfer_requests (class_id, from_teacher, to_teacher, note)
  values (p_class_id, v_me, v_to, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  insert into notifications (user_id, type, ref_id, title, body, link_path)
  values (
    v_to, 'class_transfer_request', v_id,
    profile_display_name(v_me) || ' wants to transfer ' || v_class.name
      || coalesce(' (' || v_class.section || ')', '') || ' to you',
    nullif(btrim(coalesce(p_note, '')), ''),
    '/teacher/classes'
  );
  return v_id;
end;
$$;

-- ---------- Teacher: cancel own pending request ----------
create or replace function public.cancel_class_transfer(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update class_transfer_requests set status = 'cancelled', responded_at = now()
  where id = p_request_id and from_teacher = auth.uid() and status = 'pending';
  if not found then raise exception 'There is no pending transfer to cancel.'; end if;
end;
$$;

-- ---------- Replacement teacher: accept / decline ----------
create or replace function public.respond_class_transfer(p_request_id uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  r record;
  v_class record;
  v_me_name text := profile_display_name(auth.uid());
begin
  select * into r from class_transfer_requests where id = p_request_id and status = 'pending' for update;
  if r.id is null or r.to_teacher is distinct from v_me then
    raise exception 'This transfer request is no longer available.';
  end if;

  select id, name, section, teacher_id into v_class from classes where id = r.class_id for update;
  if v_class.teacher_id is distinct from r.from_teacher then
    update class_transfer_requests set status = 'cancelled', responded_at = now() where id = r.id;
    raise exception 'This class was already handed to someone else.';
  end if;

  if not p_accept then
    update class_transfer_requests set status = 'declined', responded_at = now() where id = r.id;
    insert into notifications (user_id, type, ref_id, title, body, link_path)
    values (r.from_teacher, 'class_transfer_update', r.id,
            v_me_name || ' declined the transfer of ' || v_class.name, null,
            '/teacher/classes/' || r.class_id || '/settings');
    return r.class_id;
  end if;

  update classes set teacher_id = v_me where id = r.class_id;
  update class_transfer_requests set status = 'accepted', responded_at = now() where id = r.id;
  insert into class_teacher_history (class_id, from_teacher, to_teacher, method)
  values (r.class_id, r.from_teacher, v_me, 'transfer');

  -- Old teacher
  insert into notifications (user_id, type, ref_id, title, body, link_path)
  values (r.from_teacher, 'class_transfer_update', r.id,
          v_me_name || ' accepted ' || v_class.name || '. The class is now theirs.', null,
          '/teacher/classes');

  -- Students
  insert into notifications (user_id, type, ref_id, title, body, link_path)
  select e.student_id, 'class_teacher_changed', r.class_id,
         v_me_name || ' is now handling ' || v_class.name, null,
         '/student/classes/' || r.class_id
  from class_enrollments e where e.class_id = r.class_id;

  return r.class_id;
end;
$$;

-- ---------- Lists for the UI ----------
create or replace function public.list_my_incoming_class_transfers()
returns table (
  request_id uuid, class_id uuid, class_name text, class_section text,
  from_name text, note text, created_at timestamptz, student_count int
)
language sql stable security definer set search_path = public as $$
  select r.id, c.id, c.name, c.section, profile_display_name(r.from_teacher), r.note, r.created_at,
         (select count(*)::int from class_enrollments e where e.class_id = c.id)
  from class_transfer_requests r
  join classes c on c.id = r.class_id
  where r.to_teacher = auth.uid() and r.status = 'pending'
  order by r.created_at desc;
$$;

create or replace function public.get_pending_class_transfer(p_class_id uuid)
returns table (request_id uuid, to_name text, to_email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, profile_display_name(r.to_teacher), p.email, r.created_at
  from class_transfer_requests r
  join profiles p on p.id = r.to_teacher
  where r.class_id = p_class_id and r.from_teacher = auth.uid() and r.status = 'pending'
  limit 1;
$$;

-- ---------- School IT backup (SQL Editor only, NOT callable from the app) ----------
-- Usage: select it_reassign_class('<class uuid>', 'newteacher@arklms.institute');
create or replace function public.it_reassign_class(p_class_id uuid, p_new_teacher_email text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_to uuid;
  v_old uuid;
  v_name text;
begin
  select id into v_to from profiles
  where lower(email) = lower(btrim(p_new_teacher_email)) and role::text = 'teacher';
  if v_to is null then raise exception 'No teacher account with that email.'; end if;

  select teacher_id, name into v_old, v_name from classes where id = p_class_id for update;
  if v_name is null then raise exception 'Class not found.'; end if;

  update classes set teacher_id = v_to where id = p_class_id;
  update class_transfer_requests set status = 'cancelled', responded_at = now()
  where class_id = p_class_id and status = 'pending';
  insert into class_teacher_history (class_id, from_teacher, to_teacher, method)
  values (p_class_id, v_old, v_to, 'it_reassign');

  insert into notifications (user_id, type, ref_id, title, body, link_path)
  values (v_to, 'class_transfer_update', p_class_id,
          'You are now the teacher of ' || v_name, 'Assigned by school IT.', '/teacher/classes/' || p_class_id);
  insert into notifications (user_id, type, ref_id, title, body, link_path)
  select e.student_id, 'class_teacher_changed', p_class_id,
         profile_display_name(v_to) || ' is now handling ' || v_name, null,
         '/student/classes/' || p_class_id
  from class_enrollments e where e.class_id = p_class_id;

  return 'Reassigned ' || v_name || ' to ' || profile_display_name(v_to);
end;
$$;

-- ---------- Permissions ----------
revoke all on function public.profile_display_name(uuid) from public, anon;
revoke all on function public.request_class_transfer(uuid, text, text) from public, anon;
revoke all on function public.cancel_class_transfer(uuid) from public, anon;
revoke all on function public.respond_class_transfer(uuid, boolean) from public, anon;
revoke all on function public.list_my_incoming_class_transfers() from public, anon;
revoke all on function public.get_pending_class_transfer(uuid) from public, anon;
revoke all on function public.it_reassign_class(uuid, text) from public, anon, authenticated;

grant execute on function public.profile_display_name(uuid) to authenticated;
grant execute on function public.request_class_transfer(uuid, text, text) to authenticated;
grant execute on function public.cancel_class_transfer(uuid) to authenticated;
grant execute on function public.respond_class_transfer(uuid, boolean) to authenticated;
grant execute on function public.list_my_incoming_class_transfers() to authenticated;
grant execute on function public.get_pending_class_transfer(uuid) to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261023170000', 'class_transfers')
on conflict do nothing;

commit;

notify pgrst, 'reload schema';