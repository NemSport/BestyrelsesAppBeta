create or replace function public.reorder_agenda_item_occurrence(
  target_occurrence_id uuid,
  move_direction text
)
returns setof public.agenda_item_occurrences
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_record public.agenda_item_occurrences;
  swap_record public.agenda_item_occurrences;
begin
  if move_direction not in ('up', 'down') then
    raise exception 'Invalid agenda occurrence move direction';
  end if;

  select *
  into target_record
  from public.agenda_item_occurrences
  where id = target_occurrence_id
    and deleted_at is null
  for update;

  if target_record.id is null then
    raise exception 'Agenda occurrence not found';
  end if;

  if not public.can_manage_committee(target_record.committee_id) then
    raise exception 'Not authorized to reorder agenda occurrence';
  end if;

  perform 1
  from public.agenda_item_occurrences
  where meeting_id = target_record.meeting_id
  for update;

  if move_direction = 'up' then
    select *
    into swap_record
    from public.agenda_item_occurrences
    where meeting_id = target_record.meeting_id
      and deleted_at is null
      and position < target_record.position
    order by position desc, created_at desc, id desc
    limit 1;
  else
    select *
    into swap_record
    from public.agenda_item_occurrences
    where meeting_id = target_record.meeting_id
      and deleted_at is null
      and position > target_record.position
    order by position asc, created_at asc, id asc
    limit 1;
  end if;

  if swap_record.id is null then
    perform public.normalize_agenda_item_occurrence_positions(target_record.meeting_id);
    return query
      select *
      from public.agenda_item_occurrences
      where meeting_id = target_record.meeting_id
        and deleted_at is null
      order by position, created_at, id;
    return;
  end if;

  update public.agenda_item_occurrences
  set position = position + 1000000
  where meeting_id = target_record.meeting_id;

  update public.agenda_item_occurrences
  set position = swap_record.position
  where id = target_record.id;

  update public.agenda_item_occurrences
  set position = target_record.position
  where id = swap_record.id;

  perform public.normalize_agenda_item_occurrence_positions(target_record.meeting_id);

  return query
    select *
    from public.agenda_item_occurrences
    where meeting_id = target_record.meeting_id
      and deleted_at is null
    order by position, created_at, id;
end;
$$;

revoke all on function public.reorder_agenda_item_occurrence(uuid, text)
from public, anon;
grant execute on function public.reorder_agenda_item_occurrence(uuid, text)
to authenticated;
