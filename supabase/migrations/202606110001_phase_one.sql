create extension if not exists pgcrypto;

create type public.organization_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.membership_status as enum ('active', 'suspended');
create type public.committee_role as enum ('chair', 'secretary', 'member', 'viewer');
create type public.meeting_status as enum ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled');
create type public.attendance_status as enum ('invited', 'accepted', 'declined', 'attended', 'absent');
create type public.meeting_role as enum ('chair', 'secretary', 'member', 'guest');
create type public.agenda_item_type as enum ('information', 'discussion', 'decision', 'follow_up');
create type public.agenda_item_status as enum ('backlog', 'scheduled', 'preparation', 'active', 'follow_up', 'resolved', 'archived');
create type public.agenda_item_source as enum ('manual', 'meeting');
create type public.occurrence_status as enum ('planned', 'discussed', 'deferred', 'decided', 'skipped');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  timezone text not null default 'UTC',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null default 'member',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.committees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '',
  created_by uuid not null references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.committee_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.committee_role not null default 'member',
  title text,
  voting_rights boolean not null default true,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (committee_id, user_id)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  description text not null default '',
  status public.meeting_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.meeting_attendees (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.meeting_role not null default 'member',
  attendance_status public.attendance_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  parent_id uuid references public.agenda_items(id) on delete set null,
  title text not null check (char_length(title) between 2 and 200),
  description text not null default '',
  objective text not null default '',
  item_type public.agenda_item_type not null default 'discussion',
  lifecycle_status public.agenda_item_status not null default 'backlog',
  owner_id uuid references public.profiles(id) on delete set null,
  source public.agenda_item_source not null default 'manual',
  target_date date,
  resolved_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agenda_item_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  position integer not null check (position >= 0),
  presenter_id uuid references public.profiles(id) on delete set null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  meeting_status public.occurrence_status not null default 'planned',
  outcome_summary text not null default '',
  carried_forward boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agenda_item_id, meeting_id),
  unique (meeting_id, position)
);

create index organization_members_user_idx on public.organization_members(user_id);
create index committees_organization_idx on public.committees(organization_id);
create index committee_members_user_idx on public.committee_members(user_id);
create index meetings_committee_starts_idx on public.meetings(committee_id, starts_at desc);
create index agenda_items_committee_status_idx on public.agenda_items(committee_id, lifecycle_status, updated_at desc);
create index agenda_occurrences_meeting_position_idx on public.agenda_item_occurrences(meeting_id, position);
create index agenda_occurrences_item_idx on public.agenda_item_occurrences(agenda_item_id, created_at desc);

create or replace function public.validate_committee_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.committees
    where id = new.committee_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Committee does not belong to the specified organization';
  end if;
  return new;
end;
$$;

create or replace function public.validate_occurrence_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.meetings
    where id = new.meeting_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
  ) then
    raise exception 'Meeting scope does not match occurrence scope';
  end if;
  if not exists (
    select 1 from public.agenda_items
    where id = new.agenda_item_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
  ) then
    raise exception 'Agenda item scope does not match occurrence scope';
  end if;
  return new;
end;
$$;

create trigger committee_members_validate_scope
before insert or update on public.committee_members
for each row execute function public.validate_committee_scope();
create trigger meetings_validate_scope
before insert or update on public.meetings
for each row execute function public.validate_committee_scope();
create trigger meeting_attendees_validate_scope
before insert or update on public.meeting_attendees
for each row execute function public.validate_committee_scope();
create trigger agenda_items_validate_scope
before insert or update on public.agenda_items
for each row execute function public.validate_committee_scope();
create trigger agenda_occurrences_validate_scope
before insert or update on public.agenda_item_occurrences
for each row execute function public.validate_occurrence_scope();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger organization_members_set_updated_at before update on public.organization_members
for each row execute function public.set_updated_at();
create trigger committees_set_updated_at before update on public.committees
for each row execute function public.set_updated_at();
create trigger committee_members_set_updated_at before update on public.committee_members
for each row execute function public.set_updated_at();
create trigger meetings_set_updated_at before update on public.meetings
for each row execute function public.set_updated_at();
create trigger meeting_attendees_set_updated_at before update on public.meeting_attendees
for each row execute function public.set_updated_at();
create trigger agenda_items_set_updated_at before update on public.agenda_items
for each row execute function public.set_updated_at();
create trigger agenda_item_occurrences_set_updated_at before update on public.agenda_item_occurrences
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_committee_member(target_committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_members
    where committee_id = target_committee_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.can_manage_committee(target_committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_members cm
    where cm.committee_id = target_committee_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role in ('chair', 'secretary')
  ) or exists (
    select 1
    from public.committees c
    join public.organization_members om on om.organization_id = c.organization_id
    where c.id = target_committee_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role in ('owner', 'admin')
  );
$$;

create or replace function public.shares_organization(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid() or exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = target_user_id
      and theirs.status = 'active'
  );
$$;

create or replace function public.create_organization_with_owner(
  organization_name text,
  organization_slug text
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_organization public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (organization_name, organization_slug, auth.uid())
  returning * into created_organization;

  insert into public.organization_members (organization_id, user_id, role)
  values (created_organization.id, auth.uid(), 'owner');

  return created_organization;
end;
$$;

create or replace function public.create_committee_with_chair(
  target_organization_id uuid,
  committee_name text,
  committee_description text default ''
)
returns public.committees
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_committee public.committees;
begin
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Organization administrator access required';
  end if;

  insert into public.committees (organization_id, name, description, created_by)
  values (target_organization_id, committee_name, committee_description, auth.uid())
  returning * into created_committee;

  insert into public.committee_members (
    organization_id,
    committee_id,
    user_id,
    role
  )
  values (
    target_organization_id,
    created_committee.id,
    auth.uid(),
    'chair'
  );

  return created_committee;
end;
$$;

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
  if not public.is_committee_member(target_committee_id) then
    raise exception 'Committee membership required';
  end if;

  if not exists (
    select 1 from public.committees
    where id = target_committee_id
      and organization_id = target_organization_id
  ) then
    raise exception 'Committee scope is invalid';
  end if;

  if target_meeting_id is not null and not public.can_manage_committee(target_committee_id) then
    raise exception 'Committee manager access required to schedule an agenda item';
  end if;

  if target_meeting_id is not null and not exists (
    select 1 from public.meetings
    where id = target_meeting_id
      and organization_id = target_organization_id
      and committee_id = target_committee_id
  ) then
    raise exception 'Meeting scope is invalid';
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
    agenda_target_date,
    case
  when target_meeting_id is null then 'manual'::public.agenda_item_source
  else 'meeting'::public.agenda_item_source
end,
    auth.uid()
  )
  returning * into created_agenda_item;

  if target_meeting_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(target_meeting_id::text, 0));

    select coalesce(max(position), -1) + 1
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
    raise exception 'Committee manager access required';
  end if;

  if not exists (
    select 1 from public.meetings
    where id = target_meeting_id
      and organization_id = target_organization_id
      and committee_id = target_committee_id
  ) then
    raise exception 'Meeting scope is invalid';
  end if;

  if not exists (
    select 1 from public.agenda_items
    where id = target_agenda_item_id
      and organization_id = target_organization_id
      and committee_id = target_committee_id
  ) then
    raise exception 'Agenda item scope is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_meeting_id::text, 0));

  select coalesce(max(position), -1) + 1
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

revoke execute on function public.create_organization_with_owner(text, text) from public, anon;
revoke execute on function public.create_committee_with_chair(uuid, text, text) from public, anon;
revoke execute on function public.create_agenda_item(
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
revoke execute on function public.schedule_agenda_item(uuid, uuid, uuid, uuid, integer)
from public, anon;
revoke execute on function public.is_organization_member(uuid) from public, anon;
revoke execute on function public.is_organization_admin(uuid) from public, anon;
revoke execute on function public.is_committee_member(uuid) from public, anon;
revoke execute on function public.can_manage_committee(uuid) from public, anon;
revoke execute on function public.shares_organization(uuid) from public, anon;

grant execute on function public.create_organization_with_owner(text, text) to authenticated;
grant execute on function public.create_committee_with_chair(uuid, text, text) to authenticated;
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
grant execute on function public.schedule_agenda_item(uuid, uuid, uuid, uuid, integer)
to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_admin(uuid) to authenticated;
grant execute on function public.is_committee_member(uuid) to authenticated;
grant execute on function public.can_manage_committee(uuid) to authenticated;
grant execute on function public.shares_organization(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.committees enable row level security;
alter table public.committee_members enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.agenda_items enable row level security;
alter table public.agenda_item_occurrences enable row level security;

create policy profiles_select_authenticated on public.profiles
for select to authenticated using (public.shares_organization(id));
create policy profiles_update_self on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_select_member on public.organizations
for select to authenticated using (public.is_organization_member(id));
create policy organizations_update_admin on public.organizations
for update to authenticated using (public.is_organization_admin(id))
with check (public.is_organization_admin(id));

create policy organization_members_select_member on public.organization_members
for select to authenticated using (public.is_organization_member(organization_id));
create policy organization_members_manage_admin on public.organization_members
for all to authenticated using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

create policy committees_select_member on public.committees
for select to authenticated using (
  public.is_committee_member(id) or public.is_organization_admin(organization_id)
);
create policy committees_update_manager on public.committees
for update to authenticated using (public.can_manage_committee(id))
with check (public.can_manage_committee(id));

create policy committee_members_select_member on public.committee_members
for select to authenticated using (
  public.is_committee_member(committee_id) or public.is_organization_admin(organization_id)
);
create policy committee_members_manage on public.committee_members
for all to authenticated using (public.can_manage_committee(committee_id))
with check (
  public.can_manage_committee(committee_id)
  and public.is_organization_member(organization_id)
);

create policy meetings_select_member on public.meetings
for select to authenticated using (public.is_committee_member(committee_id));
create policy meetings_insert_manager on public.meetings
for insert to authenticated with check (
  public.can_manage_committee(committee_id)
  and created_by = auth.uid()
);
create policy meetings_update_manager on public.meetings
for update to authenticated using (public.can_manage_committee(committee_id))
with check (public.can_manage_committee(committee_id));
create policy meetings_delete_manager on public.meetings
for delete to authenticated using (public.can_manage_committee(committee_id));

create policy meeting_attendees_select_member on public.meeting_attendees
for select to authenticated using (public.is_committee_member(committee_id));
create policy meeting_attendees_manage on public.meeting_attendees
for all to authenticated using (public.can_manage_committee(committee_id))
with check (public.can_manage_committee(committee_id));

create policy agenda_items_select_member on public.agenda_items
for select to authenticated using (public.is_committee_member(committee_id));
create policy agenda_items_insert_member on public.agenda_items
for insert to authenticated with check (
  public.is_committee_member(committee_id)
  and created_by = auth.uid()
);
create policy agenda_items_update_member on public.agenda_items
for update to authenticated using (public.is_committee_member(committee_id))
with check (public.is_committee_member(committee_id));
create policy agenda_items_delete_manager on public.agenda_items
for delete to authenticated using (public.can_manage_committee(committee_id));

create policy agenda_occurrences_select_member on public.agenda_item_occurrences
for select to authenticated using (public.is_committee_member(committee_id));
create policy agenda_occurrences_manage on public.agenda_item_occurrences
for all to authenticated using (public.can_manage_committee(committee_id))
with check (public.can_manage_committee(committee_id));
