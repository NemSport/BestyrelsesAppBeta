create type public.meeting_minutes_status as enum (
  'draft',
  'ready_for_approval',
  'approved'
);

create table public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  minutes_text text not null default '',
  decisions text not null default '',
  internal_note text,
  status public.meeting_minutes_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id)
);

create table public.agenda_item_minutes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  agenda_item_occurrence_id uuid references public.agenda_item_occurrences(id) on delete cascade,
  notes text not null default '',
  decision text not null default '',
  follow_up text not null default '',
  responsible_user_id uuid references public.profiles(id) on delete set null,
  deadline date,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, agenda_item_id),
  unique (agenda_item_occurrence_id)
);

create index meeting_minutes_committee_status_idx
on public.meeting_minutes (committee_id, status, updated_at desc);

create index agenda_item_minutes_meeting_idx
on public.agenda_item_minutes (meeting_id, agenda_item_id);

create index agenda_item_minutes_responsible_idx
on public.agenda_item_minutes (responsible_user_id, deadline)
where responsible_user_id is not null;

create trigger meeting_minutes_set_updated_at
before update on public.meeting_minutes
for each row execute function public.set_updated_at();

create trigger agenda_item_minutes_set_updated_at
before update on public.agenda_item_minutes
for each row execute function public.set_updated_at();

create or replace function public.validate_meeting_minutes_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.committee_id <> old.committee_id
    or new.meeting_id <> old.meeting_id
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Referatets tilknytning og oprindelige forfatter kan ikke ændres.';
  end if;

  if not exists (
    select 1
    from public.meetings m
    where m.id = new.meeting_id
      and m.organization_id = new.organization_id
      and m.committee_id = new.committee_id
  ) then
    raise exception 'Mødet matcher ikke organisationen og udvalget.';
  end if;

  return new;
end;
$$;

create trigger meeting_minutes_validate_scope
before insert or update on public.meeting_minutes
for each row execute function public.validate_meeting_minutes_scope();

create or replace function public.validate_agenda_item_minutes_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.committee_id <> old.committee_id
    or new.meeting_id <> old.meeting_id
    or new.agenda_item_id <> old.agenda_item_id
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Punktreferatets tilknytning og oprindelige forfatter kan ikke ændres.';
  end if;

  if not exists (
    select 1
    from public.meetings m
    where m.id = new.meeting_id
      and m.organization_id = new.organization_id
      and m.committee_id = new.committee_id
  ) then
    raise exception 'Mødet matcher ikke organisationen og udvalget.';
  end if;

  if not exists (
    select 1
    from public.agenda_items ai
    where ai.id = new.agenda_item_id
      and ai.organization_id = new.organization_id
      and ai.committee_id = new.committee_id
  ) then
    raise exception 'Dagsordenspunktet matcher ikke organisationen og udvalget.';
  end if;

  if new.agenda_item_occurrence_id is not null and not exists (
    select 1
    from public.agenda_item_occurrences aio
    where aio.id = new.agenda_item_occurrence_id
      and aio.organization_id = new.organization_id
      and aio.committee_id = new.committee_id
      and aio.meeting_id = new.meeting_id
      and aio.agenda_item_id = new.agenda_item_id
  ) then
    raise exception 'Dagsordenspunktets mødeforekomst er ugyldig.';
  end if;

  if new.responsible_user_id is not null and not exists (
    select 1
    from public.organization_members om
    where om.organization_id = new.organization_id
      and om.user_id = new.responsible_user_id
      and om.status = 'active'
  ) then
    raise exception 'Den ansvarlige skal være et aktivt medlem af organisationen.';
  end if;

  return new;
end;
$$;

create trigger agenda_item_minutes_validate_scope
before insert or update on public.agenda_item_minutes
for each row execute function public.validate_agenda_item_minutes_scope();

create or replace function public.can_read_meeting_minutes(
  target_committee_id uuid,
  target_status public.meeting_minutes_status
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_committee(target_committee_id)
    or exists (
      select 1
      from public.committee_members cm
      where cm.committee_id = target_committee_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
        and (
          cm.role in ('chair', 'secretary', 'member')
          or (cm.role = 'viewer' and target_status = 'approved')
        )
    );
$$;

create or replace function public.can_read_agenda_item_minutes(
  target_committee_id uuid,
  target_meeting_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_committee(target_committee_id)
    or exists (
      select 1
      from public.committee_members cm
      where cm.committee_id = target_committee_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.role in ('chair', 'secretary', 'member')
    )
    or (
      exists (
        select 1
        from public.committee_members cm
        where cm.committee_id = target_committee_id
          and cm.user_id = auth.uid()
          and cm.status = 'active'
          and cm.role = 'viewer'
      )
      and exists (
        select 1
        from public.meeting_minutes mm
        where mm.meeting_id = target_meeting_id
          and mm.committee_id = target_committee_id
          and mm.status = 'approved'
      )
    );
$$;

alter table public.meeting_minutes enable row level security;
alter table public.agenda_item_minutes enable row level security;

create policy meetings_select_organization_admin
on public.meetings
for select
to authenticated
using (public.is_organization_admin(organization_id));

create policy agenda_items_select_organization_admin
on public.agenda_items
for select
to authenticated
using (public.is_organization_admin(organization_id));

create policy agenda_occurrences_select_organization_admin
on public.agenda_item_occurrences
for select
to authenticated
using (public.is_organization_admin(organization_id));

create policy meeting_minutes_select_authorized
on public.meeting_minutes
for select
to authenticated
using (public.can_read_meeting_minutes(committee_id, status));

create policy meeting_minutes_insert_manager
on public.meeting_minutes
for insert
to authenticated
with check (
  public.can_manage_committee(committee_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy meeting_minutes_update_manager
on public.meeting_minutes
for update
to authenticated
using (public.can_manage_committee(committee_id))
with check (
  public.can_manage_committee(committee_id)
  and updated_by = auth.uid()
);

create policy meeting_minutes_delete_manager
on public.meeting_minutes
for delete
to authenticated
using (public.can_manage_committee(committee_id));

create policy agenda_item_minutes_select_authorized
on public.agenda_item_minutes
for select
to authenticated
using (public.can_read_agenda_item_minutes(committee_id, meeting_id));

create policy agenda_item_minutes_insert_manager
on public.agenda_item_minutes
for insert
to authenticated
with check (
  public.can_manage_committee(committee_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy agenda_item_minutes_update_manager
on public.agenda_item_minutes
for update
to authenticated
using (public.can_manage_committee(committee_id))
with check (
  public.can_manage_committee(committee_id)
  and updated_by = auth.uid()
);

create policy agenda_item_minutes_delete_manager
on public.agenda_item_minutes
for delete
to authenticated
using (public.can_manage_committee(committee_id));

revoke all on function public.can_read_meeting_minutes(
  uuid,
  public.meeting_minutes_status
) from public, anon;
revoke all on function public.can_read_agenda_item_minutes(uuid, uuid)
from public, anon;

grant execute on function public.can_read_meeting_minutes(
  uuid,
  public.meeting_minutes_status
) to authenticated;
grant execute on function public.can_read_agenda_item_minutes(uuid, uuid)
to authenticated;
