create or replace function public.reorder_agenda_item_occurrences(
  target_meeting_id uuid,
  ordered_occurrence_ids uuid[]
)
returns setof public.agenda_item_occurrences
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_committee_id uuid;
  active_count integer;
  provided_count integer;
  distinct_provided_count integer;
  invalid_count integer;
begin
  select committee_id
  into target_committee_id
  from public.meetings
  where id = target_meeting_id
    and deleted_at is null;

  if target_committee_id is null then
    raise exception 'Meeting not found';
  end if;

  if not public.can_manage_committee(target_committee_id) then
    raise exception 'Not authorized to reorder agenda occurrences';
  end if;

  perform 1
  from public.agenda_item_occurrences
  where meeting_id = target_meeting_id
  for update;

  select count(*)
  into active_count
  from public.agenda_item_occurrences
  where meeting_id = target_meeting_id
    and deleted_at is null;

  select count(*), count(distinct occurrence_id)
  into provided_count, distinct_provided_count
  from unnest(ordered_occurrence_ids) as occurrence_id;

  if provided_count <> active_count or distinct_provided_count <> active_count then
    raise exception 'Agenda occurrence order must include each active occurrence exactly once';
  end if;

  select count(*)
  into invalid_count
  from unnest(ordered_occurrence_ids) as occurrence_id
  left join public.agenda_item_occurrences aio
    on aio.id = occurrence_id
    and aio.meeting_id = target_meeting_id
    and aio.deleted_at is null
  where aio.id is null;

  if invalid_count > 0 then
    raise exception 'Agenda occurrence order includes invalid occurrence ids';
  end if;

  update public.agenda_item_occurrences
  set position = position + 1000000
  where meeting_id = target_meeting_id;

  update public.agenda_item_occurrences aio
  set position = ordered_items.ordinality - 1
  from unnest(ordered_occurrence_ids) with ordinality as ordered_items(id, ordinality)
  where aio.id = ordered_items.id
    and aio.meeting_id = target_meeting_id;

  perform public.normalize_agenda_item_occurrence_positions(target_meeting_id);

  return query
    select *
    from public.agenda_item_occurrences
    where meeting_id = target_meeting_id
      and deleted_at is null
    order by position, created_at, id;
end;
$$;

revoke all on function public.reorder_agenda_item_occurrences(uuid, uuid[])
from public, anon;
grant execute on function public.reorder_agenda_item_occurrences(uuid, uuid[])
to authenticated;
