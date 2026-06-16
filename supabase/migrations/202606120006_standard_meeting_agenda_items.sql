create type public.standard_agenda_item_key as enum (
  'agenda_approval',
  'previous_minutes_approval',
  'any_other_business'
);

alter table public.agenda_items
add column standard_key public.standard_agenda_item_key;

create index agenda_items_standard_key_idx
on public.agenda_items (committee_id, standard_key)
where standard_key is not null;

create or replace function public.validate_standard_agenda_item_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    and new.standard_key is not null
    and not public.can_manage_committee(new.committee_id)
  then
    raise exception 'Kun udvalgets ledelse kan oprette standardpunkter.';
  end if;

  if tg_op = 'UPDATE'
    and new.standard_key is distinct from old.standard_key
  then
    raise exception 'Standardpunktets nøgle kan ikke ændres.';
  end if;

  return new;
end;
$$;

create trigger agenda_items_validate_standard_key
before insert or update on public.agenda_items
for each row execute function public.validate_standard_agenda_item_key();

create or replace function public.keep_any_other_business_last()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_standard_key public.standard_agenda_item_key;
  eventual_occurrence_id uuid;
  last_position integer;
begin
  select ai.standard_key
  into inserted_standard_key
  from public.agenda_items ai
  where ai.id = new.agenda_item_id;

  if inserted_standard_key = 'any_other_business' then
    return new;
  end if;

  select aio.id
  into eventual_occurrence_id
  from public.agenda_item_occurrences aio
  join public.agenda_items ai on ai.id = aio.agenda_item_id
  where aio.meeting_id = new.meeting_id
    and ai.standard_key = 'any_other_business'
  order by aio.position desc
  limit 1;

  if eventual_occurrence_id is null then
    return new;
  end if;

  select coalesce(max(aio.position), -1) + 1
  into last_position
  from public.agenda_item_occurrences aio
  where aio.meeting_id = new.meeting_id;

  update public.agenda_item_occurrences
  set position = last_position
  where id = eventual_occurrence_id;

  new.position := last_position - 1;
  return new;
end;
$$;

create trigger agenda_occurrences_keep_eventual_last
before insert on public.agenda_item_occurrences
for each row execute function public.keep_any_other_business_last();

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
