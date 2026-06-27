create or replace function public.create_agenda_item(
  target_organization_id uuid,
  target_committee_id uuid,
  agenda_title text,
  agenda_description text,
  agenda_objective text,
  agenda_type public.agenda_item_type,
  agenda_status public.agenda_item_status,
  agenda_target_date date default null,
  target_meeting_id uuid default null
)
returns public.agenda_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_agenda_item public.agenda_items;
  next_position integer;
begin
  if (target_meeting_id is null and agenda_target_date is null)
    or (target_meeting_id is not null and agenda_target_date is not null)
  then
    raise exception 'Vælg præcis ét af møde eller dato.';
  end if;

  if not public.can_edit_agenda_item(target_committee_id) then
    raise exception 'Du har ikke adgang til at oprette dagsordenspunkter.';
  end if;

  if not exists (
    select 1 from public.committees
    where id = target_committee_id
      and organization_id = target_organization_id
  ) then
    raise exception 'Udvalget matcher ikke organisationen.';
  end if;

  if target_meeting_id is not null
    and not public.can_manage_committee(target_committee_id)
  then
    raise exception 'Kun udvalgets ledelse kan planlægge et dagsordenspunkt.';
  end if;

  if target_meeting_id is not null and not exists (
    select 1 from public.meetings
    where id = target_meeting_id
      and organization_id = target_organization_id
      and committee_id = target_committee_id
      and status <> 'cancelled'
  ) then
    raise exception 'Mødet er ikke et tilgængeligt møde i dette udvalg.';
  end if;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    title,
    description,
    objective,
    item_type,
    lifecycle_status,
    target_date,
    source,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    agenda_title,
    agenda_description,
    agenda_objective,
    agenda_type,
    case when target_meeting_id is null then agenda_status else 'scheduled' end,
    case when target_meeting_id is null then agenda_target_date else null end,
    case
      when target_meeting_id is null then 'manual'::public.agenda_item_source
      else 'meeting'::public.agenda_item_source
    end,
    auth.uid()
  )
  returning * into created_agenda_item;

  if target_meeting_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(target_meeting_id::text, 0));

    perform 1
    from public.meetings
    where id = target_meeting_id
      and organization_id = target_organization_id
      and committee_id = target_committee_id
      and status <> 'cancelled'
    for update;

    if not found then
      raise exception 'Mødet er ikke et tilgængeligt møde i dette udvalg.';
    end if;

    select coalesce(max(position), 0) + 1
    into next_position
    from public.agenda_item_occurrences
    where meeting_id = target_meeting_id;

    insert into public.agenda_item_occurrences (
      organization_id,
      committee_id,
      agenda_item_id,
      meeting_id,
      position
    )
    values (
      target_organization_id,
      target_committee_id,
      created_agenda_item.id,
      target_meeting_id,
      next_position
    );
  end if;

  return created_agenda_item;
end;
$$;

create or replace function public.schedule_agenda_item(
  target_organization_id uuid,
  target_committee_id uuid,
  target_agenda_item_id uuid,
  target_meeting_id uuid,
  target_duration_minutes integer default null
)
returns public.agenda_item_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_occurrence public.agenda_item_occurrences;
  next_position integer;
begin
  if not public.can_manage_committee(target_committee_id) then
    raise exception 'Kun udvalgets ledelse kan planlægge et dagsordenspunkt.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_meeting_id::text, 0));

  perform 1
  from public.meetings
  where id = target_meeting_id
    and organization_id = target_organization_id
    and committee_id = target_committee_id
    and status <> 'cancelled'
  for update;

  if not found then
    raise exception 'Mødet er ikke et tilgængeligt møde i dette udvalg.';
  end if;

  if not exists (
    select 1 from public.agenda_items
    where id = target_agenda_item_id
      and organization_id = target_organization_id
      and committee_id = target_committee_id
      and deleted_at is null
  ) then
    raise exception 'Dagsordenspunktet matcher ikke organisationen og udvalget.';
  end if;

  select coalesce(max(position), 0) + 1
  into next_position
  from public.agenda_item_occurrences
  where meeting_id = target_meeting_id;

  insert into public.agenda_item_occurrences (
    organization_id,
    committee_id,
    agenda_item_id,
    meeting_id,
    position,
    duration_minutes
  )
  values (
    target_organization_id,
    target_committee_id,
    target_agenda_item_id,
    target_meeting_id,
    next_position,
    target_duration_minutes
  )
  returning * into created_occurrence;

  update public.agenda_items
  set lifecycle_status = 'scheduled'
  where id = target_agenda_item_id
    and lifecycle_status = 'backlog';

  return created_occurrence;
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

  perform 1
  from public.meetings
  where id = selected_meeting.id
  for update;

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

  select coalesce(max(position), 0) + 1
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

  return transfer_record;
end;
$$;

revoke all on function public.create_agenda_item(
  uuid,
  uuid,
  text,
  text,
  text,
  public.agenda_item_type,
  public.agenda_item_status,
  date,
  uuid
) from public, anon;

grant execute on function public.create_agenda_item(
  uuid,
  uuid,
  text,
  text,
  text,
  public.agenda_item_type,
  public.agenda_item_status,
  date,
  uuid
) to authenticated;

revoke all on function public.schedule_agenda_item(
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) from public, anon;

grant execute on function public.schedule_agenda_item(
  uuid,
  uuid,
  uuid,
  uuid,
  integer
) to authenticated;

revoke all on function public.schedule_transferred_agenda_item(uuid, uuid)
from public, anon;

grant execute on function public.schedule_transferred_agenda_item(uuid, uuid)
to authenticated;
