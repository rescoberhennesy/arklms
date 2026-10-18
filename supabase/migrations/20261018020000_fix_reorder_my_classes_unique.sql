-- Fix: "duplicate key value violates unique constraint
-- classes_teacher_display_order_idx" when reordering classes.
--
-- The unique index on (teacher_id, display_order) is checked row by row,
-- so a single UPDATE that swaps positions collides mid-statement. Archived
-- classes (not sent from the page) could also collide with the new numbers.
--
-- New approach:
--   1. Compute the final order for ALL of this teacher's classes:
--      listed ids first (in the given order), then the rest in their
--      previous order.
--   2. Park every row on a unique negative number (no collisions).
--   3. Write the final 0-based positions.

create or replace function public.reorder_my_classes(p_class_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_pos int[];
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Final order for every class this teacher owns.
  select array_agg(s.id order by s.rn), array_agg(s.rn order by s.rn)
    into v_ids, v_pos
  from (
    select c.id,
           (row_number() over (
              order by (w.ord is null),          -- listed classes first
                       w.ord,                     -- in the order given
                       c.display_order nulls last,-- then the rest, as before
                       c.id
            ) - 1)::int as rn
      from public.classes c
      left join unnest(p_class_ids) with ordinality as w(id, ord)
        on w.id = c.id
     where c.teacher_id = v_uid
  ) s;

  if v_ids is null then
    return; -- teacher has no classes
  end if;

  -- 2. Park on unique negative numbers so the unique index never collides.
  update public.classes c
     set display_order = -(t.pos + 1)
    from unnest(v_ids, v_pos) as t(id, pos)
   where c.id = t.id
     and c.teacher_id = v_uid;

  -- 3. Final positions (0, 1, 2, ...).
  update public.classes c
     set display_order = t.pos
    from unnest(v_ids, v_pos) as t(id, pos)
   where c.id = t.id
     and c.teacher_id = v_uid;
end;
$$;