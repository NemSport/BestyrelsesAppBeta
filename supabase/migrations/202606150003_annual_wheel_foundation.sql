create type public.annual_wheel_priority as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create type public.annual_wheel_recurrence as enum (
  'none',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'custom'
);

create table public.annual_wheel_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid references public.committees(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  series_id uuid not null default gen_random_uuid(),
  occurrence_index integer not null default 0 check (occurrence_index >= 0),
  title text not null check (char_length(title) between 2 and 240),
  description text not null default '',
  starts_on date not null,
  ends_on date not null,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  category text,
  priority public.annual_wheel_priority not null default 'medium',
  recurrence public.annual_wheel_recurrence not null default 'none',
  recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 120),
  recurrence_rule text,
  is_exception boolean not null default false,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_on >= starts_on),
  check (category is null or char_length(category) <= 120),
  unique (series_id, occurrence_index)
);

create index annual_wheel_events_organization_dates_idx
  on public.annual_wheel_events(organization_id, starts_on, ends_on)
  where deleted_at is null;
create index annual_wheel_events_committee_dates_idx
  on public.annual_wheel_events(committee_id, starts_on)
  where committee_id is not null and deleted_at is null;
create index annual_wheel_events_responsible_idx
  on public.annual_wheel_events(responsible_user_id, starts_on)
  where responsible_user_id is not null and deleted_at is null;
create index annual_wheel_events_series_idx
  on public.annual_wheel_events(series_id, occurrence_index);

create or replace function public.validate_annual_wheel_event_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.committee_id is not null and not exists (
    select 1 from public.committees
    where id = new.committee_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Annual wheel committee scope is invalid';
  end if;

  if new.meeting_id is not null and not exists (
    select 1 from public.meetings
    where id = new.meeting_id
      and organization_id = new.organization_id
      and (new.committee_id is null or committee_id = new.committee_id)
  ) then
    raise exception 'Annual wheel meeting scope is invalid';
  end if;

  if new.task_id is not null and not exists (
    select 1 from public.tasks
    where id = new.task_id
      and organization_id = new.organization_id
      and (new.committee_id is null or committee_id = new.committee_id)
  ) then
    raise exception 'Annual wheel task scope is invalid';
  end if;

  if new.responsible_user_id is not null and not exists (
    select 1 from public.organization_members
    where organization_id = new.organization_id
      and user_id = new.responsible_user_id
      and status = 'active'
  ) then
    raise exception 'Annual wheel responsible user must be an active organization member';
  end if;

  if new.committee_id is not null and new.responsible_user_id is not null
     and not exists (
       select 1 from public.committee_members
       where organization_id = new.organization_id
         and committee_id = new.committee_id
         and user_id = new.responsible_user_id
         and status = 'active'
     ) then
    raise exception 'Annual wheel responsible user must belong to the committee';
  end if;

  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger annual_wheel_events_validate_scope
before insert or update on public.annual_wheel_events
for each row execute function public.validate_annual_wheel_event_scope();

create trigger annual_wheel_events_set_updated_at
before update on public.annual_wheel_events
for each row execute function public.set_updated_at();

alter table public.annual_wheel_events enable row level security;

create policy annual_wheel_events_select_member
on public.annual_wheel_events for select to authenticated using (
  public.is_organization_member(organization_id)
  and (
    committee_id is null
    or public.is_committee_member(committee_id)
    or public.is_organization_admin(organization_id)
  )
);

create policy annual_wheel_events_insert_editor
on public.annual_wheel_events for insert to authenticated with check (
  created_by = auth.uid()
  and updated_by = auth.uid()
  and (
    (committee_id is null and public.is_organization_admin(organization_id))
    or (committee_id is not null and public.can_edit_agenda_item(committee_id))
  )
);

create policy annual_wheel_events_update_editor
on public.annual_wheel_events for update to authenticated using (
  (committee_id is null and public.is_organization_admin(organization_id))
  or (committee_id is not null and public.can_edit_agenda_item(committee_id))
)
with check (
  updated_by = auth.uid()
  and (
    (committee_id is null and public.is_organization_admin(organization_id))
    or (committee_id is not null and public.can_edit_agenda_item(committee_id))
  )
);

revoke all on public.annual_wheel_events from anon;
grant select, insert, update on public.annual_wheel_events to authenticated;
