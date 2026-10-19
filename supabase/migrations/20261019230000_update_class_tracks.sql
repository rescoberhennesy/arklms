begin;

-- Drop the old track CHECK constraint, whatever it's named
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.classes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%track%'
  loop
    execute format('alter table public.classes drop constraint %I', c);
  end loop;
end $$;

-- Move existing classes to the new strands
update public.classes
set track = case track
  when 'ABM'   then 'BE'
  when 'HUMSS' then 'ASSH'
  when 'H.E'   then 'H&T'
  else track
end
where track in ('ABM', 'HUMSS', 'H.E');

alter table public.classes
  add constraint classes_track_check
  check (track is null or track in ('ASSH', 'BE', 'H&T', 'ICT'));

comment on column public.classes.track is
  'SHS strand: ASSH, BE, H&T, or ICT. Nullable for legacy classes.';

commit;

notify pgrst, 'reload schema';