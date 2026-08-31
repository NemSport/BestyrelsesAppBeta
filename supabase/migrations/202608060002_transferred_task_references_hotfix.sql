-- Version 2.hotfix.2: keep transferred meeting history as references.
-- The target agenda item remains a new occurrence, but previous minutes,
-- decisions and follow-up text are no longer copied into editable content.
create or replace function public.schedule_transferred_agenda_item(
  target_transfer_id uuid,
  requested_target_meeting_id uuid default null
)
returns public.transferred_agenda_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_record public.transferred_agenda_items;
  source_meeting public.meetings;
  source_item public.agenda_items;
  source_minutes public.agenda_item_minutes;
  selected_meeting public.meetings;
  created_item public.agenda_items;
  current_max_position integer;
  next_position integer;
begin
  select *
  into transfer_record
  from public.transferred_agenda_items
  where id = target_transfer_id
  for update;

  if transfer_record.id is null then
    raise exception 'Det overførte punkt blev ikke fundet.';
  end if;

  if not public.can_manage_committee(transfer_record.committee_id) then
    raise exception 'Kun udvalgets ledelse kan planlægge overførte punkter.';
  end if;

  if transfer_record.status = 'dismissed' then
    raise exception 'Et afvist overført punkt kan ikke planlægges.';
  end if;

  if transfer_record.status = 'scheduled' then
    if requested_target_meeting_id is null
      or requested_target_meeting_id = transfer_record.target_meeting_id
    then
      return transfer_record;
    end if;
    raise exception 'Det overførte punkt er allerede planlagt på et andet møde.';
  end if;

  select *
  into source_meeting
  from public.meetings
  where id = transfer_record.source_meeting_id
    and organization_id = transfer_record.organization_id
    and committee_id = transfer_record.committee_id;

  select *
  into source_item
  from public.agenda_items
  where id = transfer_record.source_agenda_item_id
    and organization_id = transfer_record.organization_id
    and committee_id = transfer_record.committee_id;

  select *
  into source_minutes
  from public.agenda_item_minutes
  where id = transfer_record.source_agenda_item_minutes_id
    and meeting_id = transfer_record.source_meeting_id
    and agenda_item_id = transfer_record.source_agenda_item_id;

  if source_meeting.id is null
    or source_item.id is null
    or source_minutes.id is null
  then
    raise exception 'Kilden til det overførte punkt er ikke længere tilgængelig.';
  end if;

  if requested_target_meeting_id is null then
    select *
    into selected_meeting
    from public.meetings
    where organization_id = transfer_record.organization_id
      and committee_id = transfer_record.committee_id
      and starts_at > source_meeting.starts_at
      and status <> 'cancelled'
    order by starts_at asc, created_at asc
    limit 1;
  else
    select *
    into selected_meeting
    from public.meetings
    where id = requested_target_meeting_id
      and organization_id = transfer_record.organization_id
      and committee_id = transfer_record.committee_id
      and starts_at > source_meeting.starts_at
      and status <> 'cancelled';

    if selected_meeting.id is null then
      raise exception 'Det valgte møde er ikke et kommende møde i samme udvalg.';
    end if;
  end if;

  if selected_meeting.id is null then
    return transfer_record;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(selected_meeting.id::text, 0));

  perform 1
  from public.meetings
  where id = selected_meeting.id
  for update;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    parent_id,
    title,
    description,
    objective,
    item_type,
    lifecycle_status,
    owner_id,
    source,
    target_date,
    created_by
  )
  values (
    transfer_record.organization_id,
    transfer_record.committee_id,
    source_item.id,
    source_item.title,
    left(source_item.description, 10000),
    left(source_item.objective, 4000),
    transfer_record.target_item_type,
    'scheduled',
    source_minutes.responsible_user_id,
    'meeting',
    source_minutes.deadline,
    auth.uid()
  )
  returning * into created_item;

  select max(position), coalesce(max(position), 0) + 1
  into current_max_position, next_position
  from public.agenda_item_occurrences
  where meeting_id = selected_meeting.id;

  raise log 'schedule_transferred_agenda_item next occurrence position: meeting_id=%, current_max=%, next_position=%',
    selected_meeting.id,
    current_max_position,
    next_position;

  insert into public.agenda_item_occurrences (
    organization_id,
    committee_id,
    agenda_item_id,
    meeting_id,
    position,
    presenter_id,
    carried_forward
  )
  values (
    transfer_record.organization_id,
    transfer_record.committee_id,
    created_item.id,
    selected_meeting.id,
    next_position,
    source_minutes.responsible_user_id,
    true
  );

  update public.transferred_agenda_items
  set
    target_meeting_id = selected_meeting.id,
    target_agenda_item_id = created_item.id,
    status = 'scheduled',
    updated_by = auth.uid()
  where id = transfer_record.id
  returning * into transfer_record;

  return transfer_record;
end;
$$;

revoke all on function public.schedule_transferred_agenda_item(uuid, uuid)
from public, anon;

grant execute on function public.schedule_transferred_agenda_item(uuid, uuid)
to authenticated;
