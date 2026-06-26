create or replace function public.normalize_agenda_item_occurrence_positions(
  target_meeting_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.meetings
    where id = target_meeting_id
      and public.can_manage_committee(committee_id)
  )
  then
    raise exception 'Not authorized to normalize agenda occurrence positions';
  end if;

  update public.agenda_item_occurrences
  set position = position + 1000000
  where meeting_id = target_meeting_id;

  with ordered_occurrences as (
    select
      id,
      row_number() over (
        order by
          (deleted_at is not null),
          position,
          created_at,
          id
      ) - 1 as next_position
    from public.agenda_item_occurrences
    where meeting_id = target_meeting_id
  )
  update public.agenda_item_occurrences occurrence
  set position = ordered_occurrences.next_position
  from ordered_occurrences
  where occurrence.id = ordered_occurrences.id;
end;
$$;

create or replace function public.soft_delete_agenda_item(target_agenda_item_id uuid)
returns public.agenda_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marker timestamptz := now();
  result public.agenda_items;
  affected_meeting_ids uuid[];
  affected_meeting_id uuid;
begin
  if not exists (
    select 1
    from public.agenda_items
    where id = target_agenda_item_id
      and public.can_manage_committee(committee_id)
  )
  then
    raise exception 'Not authorized to delete agenda item';
  end if;

  select coalesce(array_agg(distinct meeting_id), array[]::uuid[])
  into affected_meeting_ids
  from public.agenda_item_occurrences
  where agenda_item_id = target_agenda_item_id
    and deleted_at is null;

  update public.agenda_items
  set deleted_at = marker,
      deleted_by = auth.uid(),
      delete_expires_at = marker + interval '30 days'
  where id = target_agenda_item_id
    and deleted_at is null
  returning * into result;

  if result.id is null then
    raise exception 'Agenda item not found or already deleted';
  end if;

  update public.agenda_item_occurrences
  set deleted_at = marker,
      deleted_by = auth.uid(),
      delete_expires_at = marker + interval '30 days'
  where agenda_item_id = target_agenda_item_id
    and deleted_at is null;

  foreach affected_meeting_id in array affected_meeting_ids loop
    perform public.normalize_agenda_item_occurrence_positions(affected_meeting_id);
  end loop;

  return result;
end;
$$;

create or replace function public.restore_agenda_item(target_agenda_item_id uuid)
returns public.agenda_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marker timestamptz;
  actor uuid;
  result public.agenda_items;
  affected_meeting_ids uuid[];
  affected_meeting_id uuid;
begin
  if not exists (
    select 1
    from public.agenda_items
    where id = target_agenda_item_id
      and public.can_manage_committee(committee_id)
  )
  then
    raise exception 'Not authorized to restore agenda item';
  end if;

  select deleted_at, deleted_by
  into marker, actor
  from public.agenda_items
  where id = target_agenda_item_id;

  if marker is null then
    raise exception 'Agenda item is not in trash';
  end if;

  select coalesce(array_agg(distinct meeting_id), array[]::uuid[])
  into affected_meeting_ids
  from public.agenda_item_occurrences
  where agenda_item_id = target_agenda_item_id
    and deleted_at = marker
    and deleted_by = actor;

  update public.agenda_items
  set deleted_at = null,
      deleted_by = null,
      delete_expires_at = null
  where id = target_agenda_item_id
  returning * into result;

  update public.agenda_item_occurrences
  set deleted_at = null,
      deleted_by = null,
      delete_expires_at = null
  where agenda_item_id = target_agenda_item_id
    and deleted_at = marker
    and deleted_by = actor;

  foreach affected_meeting_id in array affected_meeting_ids loop
    perform public.normalize_agenda_item_occurrence_positions(affected_meeting_id);
  end loop;

  return result;
end;
$$;

create or replace function public.soft_delete_agenda_item_occurrence(
  target_occurrence_id uuid
)
returns public.agenda_item_occurrences
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marker timestamptz := now();
  result public.agenda_item_occurrences;
begin
  if not exists (
    select 1
    from public.agenda_item_occurrences
    where id = target_occurrence_id
      and public.can_manage_committee(committee_id)
  )
  then
    raise exception 'Not authorized to delete occurrence';
  end if;

  update public.agenda_item_occurrences
  set deleted_at = marker,
      deleted_by = auth.uid(),
      delete_expires_at = marker + interval '30 days'
  where id = target_occurrence_id
    and deleted_at is null
  returning * into result;

  if result.id is null then
    raise exception 'Occurrence not found or already deleted';
  end if;

  perform public.normalize_agenda_item_occurrence_positions(result.meeting_id);

  select *
  into result
  from public.agenda_item_occurrences
  where id = target_occurrence_id;

  return result;
end;
$$;

create or replace function public.restore_agenda_item_occurrence(
  target_occurrence_id uuid
)
returns public.agenda_item_occurrences
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.agenda_item_occurrences;
begin
  if not exists (
    select 1
    from public.agenda_item_occurrences
    where id = target_occurrence_id
      and public.can_manage_committee(committee_id)
  )
  then
    raise exception 'Not authorized to restore occurrence';
  end if;

  update public.agenda_item_occurrences
  set deleted_at = null,
      deleted_by = null,
      delete_expires_at = null
  where id = target_occurrence_id
    and deleted_at is not null
  returning * into result;

  if result.id is null then
    raise exception 'Occurrence is not in trash';
  end if;

  perform public.normalize_agenda_item_occurrence_positions(result.meeting_id);

  select *
  into result
  from public.agenda_item_occurrences
  where id = target_occurrence_id;

  return result;
end;
$$;

revoke all on function public.normalize_agenda_item_occurrence_positions(uuid)
from public, anon;
grant execute on function public.normalize_agenda_item_occurrence_positions(uuid)
to authenticated;
