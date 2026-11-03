-- A saved "Fortsættes næste møde" is an explicit request to continue.
-- Reuse the existing atomic transfer operation and its history relation.
create or replace function public.continue_agenda_items_on_meeting(target_meeting_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.meetings;
  pending record;
  transferred_count integer := 0;
begin
  select * into target from public.meetings where id = target_meeting_id;
  if target.id is null or target.deleted_at is not null then
    raise exception 'Mødet blev ikke fundet.';
  end if;
  if auth.uid() is null or not public.can_manage_committee(target.committee_id) then
    raise exception 'Kun udvalgets ledelse kan overføre punkter.';
  end if;
  if target.status not in ('draft', 'scheduled', 'in_progress') then
    return 0;
  end if;

  for pending in
    select t.id
    from public.transferred_agenda_items t
    join public.meetings source on source.id = t.source_meeting_id
    join public.agenda_items item on item.id = t.source_agenda_item_id
    join public.agenda_item_occurrences occurrence on occurrence.id = t.source_agenda_item_occurrence_id
    join public.agenda_item_minutes minutes on minutes.id = t.source_agenda_item_minutes_id
    where t.organization_id = target.organization_id
      and t.committee_id = target.committee_id
      and t.status = 'pending'
      and t.source_status = 'discussion_continue'
      and minutes.status = 'discussion_continue'
      and item.deleted_at is null
      and occurrence.deleted_at is null
      and source.deleted_at is null
      and source.status <> 'cancelled'
      and source.starts_at < target.starts_at
      and not exists (
        select 1 from public.meetings earlier
        where earlier.organization_id = target.organization_id
          and earlier.committee_id = target.committee_id
          and earlier.deleted_at is null
          and earlier.status <> 'cancelled'
          and earlier.starts_at > source.starts_at
          and (earlier.starts_at, earlier.created_at, earlier.id)
            < (target.starts_at, target.created_at, target.id)
      )
    order by t.id
    for update of t
  loop
    perform public.schedule_transferred_agenda_item(pending.id, target.id);
    transferred_count := transferred_count + 1;
  end loop;
  return transferred_count;
end;
$$;

revoke all on function public.continue_agenda_items_on_meeting(uuid) from public, anon;
grant execute on function public.continue_agenda_items_on_meeting(uuid) to authenticated;

-- Handle a continuation saved after the next meeting already exists.
create or replace function public.schedule_new_discussion_continuation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_meeting_id uuid;
begin
  if new.status = 'pending' and new.source_status = 'discussion_continue' then
    select m.id into next_meeting_id
    from public.meetings m
    join public.meetings source on source.id = new.source_meeting_id
    where m.organization_id = new.organization_id
      and m.committee_id = new.committee_id
      and m.starts_at > source.starts_at
      and m.deleted_at is null
      and m.status <> 'cancelled'
    order by m.starts_at, m.created_at, m.id
    limit 1;
    if next_meeting_id is not null then
      perform public.continue_agenda_items_on_meeting(next_meeting_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.schedule_new_discussion_continuation() from public, anon, authenticated;
create trigger transferred_agenda_items_continue_discussion
after insert on public.transferred_agenda_items
for each row execute function public.schedule_new_discussion_continuation();

-- Keep creation and continuation in the same transaction.
create or replace function public.create_meeting_with_standard_items(
  target_organization_id uuid,
  target_committee_id uuid,
  meeting_title text,
  meeting_description text,
  meeting_starts_at timestamptz,
  meeting_ends_at timestamptz default null,
  meeting_location text default null
)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_meeting public.meetings;
  agenda_approval_id uuid;
  previous_minutes_approval_id uuid;
  any_other_business_id uuid;
begin
  if not public.can_manage_committee(target_committee_id) then
    raise exception 'Kun udvalgets formand eller sekretær kan oprette møder.';
  end if;

  if not exists (
    select 1
    from public.committees c
    where c.id = target_committee_id
      and c.organization_id = target_organization_id
      and c.archived_at is null
  ) then
    raise exception 'Udvalget matcher ikke organisationen.';
  end if;

  insert into public.meetings (
    organization_id,
    committee_id,
    title,
    description,
    status,
    starts_at,
    ends_at,
    location,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    meeting_title,
    meeting_description,
    'scheduled',
    meeting_starts_at,
    meeting_ends_at,
    meeting_location,
    auth.uid()
  )
  returning * into created_meeting;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    title,
    item_type,
    lifecycle_status,
    source,
    standard_key,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    'Godkendelse af dagsorden',
    'decision',
    'scheduled',
    'meeting',
    'agenda_approval',
    auth.uid()
  )
  returning id into agenda_approval_id;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    title,
    item_type,
    lifecycle_status,
    source,
    standard_key,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    'Godkendelse af seneste referat',
    'decision',
    'scheduled',
    'meeting',
    'previous_minutes_approval',
    auth.uid()
  )
  returning id into previous_minutes_approval_id;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    title,
    item_type,
    lifecycle_status,
    source,
    standard_key,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    'Eventuelt',
    'information',
    'scheduled',
    'meeting',
    'any_other_business',
    auth.uid()
  )
  returning id into any_other_business_id;

  insert into public.agenda_item_occurrences (
    organization_id,
    committee_id,
    agenda_item_id,
    meeting_id,
    position
  )
  values
    (
      target_organization_id,
      target_committee_id,
      agenda_approval_id,
      created_meeting.id,
      0
    ),
    (
      target_organization_id,
      target_committee_id,
      previous_minutes_approval_id,
      created_meeting.id,
      1
    ),
    (
      target_organization_id,
      target_committee_id,
      any_other_business_id,
      created_meeting.id,
      2
    );

  perform public.continue_agenda_items_on_meeting(created_meeting.id);

  return created_meeting;
end;
$$;

revoke all on function public.create_meeting_with_standard_items(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) from public, anon;

grant execute on function public.create_meeting_with_standard_items(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) to authenticated;
