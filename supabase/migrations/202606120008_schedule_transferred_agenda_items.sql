create or replace function public.normalize_meeting_agenda_order(
  p_target_meeting_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_target_meeting_id::text, 0));

  update public.agenda_item_occurrences
  set position = position + 100000
  where meeting_id = p_target_meeting_id;

  with ordered_occurrences as (
    select
      aio.id,
      row_number() over (
        order by
          case
            when ai.standard_key = 'agenda_approval' then 0
            when ai.standard_key = 'previous_minutes_approval' then 1
            when tai.id is not null then 2
            when ai.standard_key = 'any_other_business' then 4
            else 3
          end,
          case when tai.id is not null then tai.created_at end,
          aio.position,
          aio.created_at,
          aio.id
      ) - 1 as next_position
    from public.agenda_item_occurrences aio
    join public.agenda_items ai on ai.id = aio.agenda_item_id
    left join public.transferred_agenda_items tai
      on tai.target_agenda_item_id = ai.id
      and tai.target_meeting_id = aio.meeting_id
      and tai.status = 'scheduled'
    where aio.meeting_id = p_target_meeting_id
  )
  update public.agenda_item_occurrences aio
  set position = ordered_occurrences.next_position
  from ordered_occurrences
  where aio.id = ordered_occurrences.id;
end;
$$;

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
  next_position integer;
  context_description text;
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

  context_description := concat_ws(
    E'\n\n',
    nullif(left(source_item.description, 3000), ''),
    format(
      'Overført fra: %s (%s)',
      source_meeting.title,
      to_char(source_meeting.starts_at at time zone 'Europe/Copenhagen', 'DD.MM.YYYY')
    ),
    'Årsag: ' || case transfer_record.transfer_reason
      when 'discussion_continue' then 'Fortsættes næste møde'
      when 'discussion_requires_decision' then 'Kræver beslutning'
      when 'decision_requires_follow_up' then 'Kræver opfølgning'
    end,
    case
      when source_minutes.notes <> ''
      then 'Noter:' || E'\n' || left(source_minutes.notes, 2200)
    end,
    case
      when source_minutes.decision <> ''
      then 'Beslutning:' || E'\n' || left(source_minutes.decision, 1800)
    end,
    case
      when source_minutes.follow_up <> ''
      then 'Opfølgning:' || E'\n' || left(source_minutes.follow_up, 2200)
    end
  );

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
    left(context_description, 10000),
    left(source_item.objective, 4000),
    transfer_record.target_item_type,
    'scheduled',
    source_minutes.responsible_user_id,
    'meeting',
    source_minutes.deadline,
    auth.uid()
  )
  returning * into created_item;

  select coalesce(max(position), -1) + 1
  into next_position
  from public.agenda_item_occurrences
  where meeting_id = selected_meeting.id;

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

  perform public.normalize_meeting_agenda_order(selected_meeting.id);

  return transfer_record;
end;
$$;

revoke all on function public.normalize_meeting_agenda_order(uuid)
from public, anon, authenticated;

revoke all on function public.schedule_transferred_agenda_item(uuid, uuid)
from public, anon;

grant execute on function public.schedule_transferred_agenda_item(uuid, uuid)
to authenticated;
