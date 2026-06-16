create type public.decision_status as enum (
  'not_started',
  'in_progress',
  'waiting',
  'completed',
  'cancelled'
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete set null,
  agenda_item_id uuid references public.agenda_items(id) on delete set null,
  title text not null check (char_length(title) between 2 and 240),
  description text not null default '',
  status public.decision_status not null default 'not_started',
  responsible_user_id uuid references public.profiles(id) on delete set null,
  decision_date date not null,
  deadline date,
  category text,
  internal_note text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  cancelled_at timestamptz,
  check (category is null or char_length(category) <= 120),
  check (status = 'cancelled' or cancelled_at is null)
);

create index decisions_organization_updated_idx
  on public.decisions(organization_id, updated_at desc);
create index decisions_committee_status_idx
  on public.decisions(committee_id, status, decision_date desc);
create index decisions_responsible_deadline_idx
  on public.decisions(responsible_user_id, deadline)
  where responsible_user_id is not null;
create index decisions_meeting_idx on public.decisions(meeting_id)
  where meeting_id is not null;
create index decisions_agenda_item_idx on public.decisions(agenda_item_id)
  where agenda_item_id is not null;

create or replace function public.validate_decision_scope()
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
    raise exception 'Decision committee scope is invalid';
  end if;

  if new.meeting_id is not null and not exists (
    select 1
    from public.meetings
    where id = new.meeting_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
  ) then
    raise exception 'Decision meeting scope is invalid';
  end if;

  if new.agenda_item_id is not null and not exists (
    select 1
    from public.agenda_items
    where id = new.agenda_item_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
  ) then
    raise exception 'Decision agenda item scope is invalid';
  end if;

  if new.responsible_user_id is not null and not exists (
    select 1
    from public.committee_members
    where committee_id = new.committee_id
      and organization_id = new.organization_id
      and user_id = new.responsible_user_id
      and status = 'active'
  ) then
    raise exception 'Decision responsible user must be an active committee member';
  end if;

  new.updated_by = auth.uid();
  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at = now();
  elsif new.status <> 'cancelled' then
    new.cancelled_at = null;
  end if;

  return new;
end;
$$;

create trigger decisions_validate_scope
before insert or update on public.decisions
for each row execute function public.validate_decision_scope();

create trigger decisions_set_updated_at
before update on public.decisions
for each row execute function public.set_updated_at();

alter table public.decisions enable row level security;

create policy decisions_select_member on public.decisions
for select to authenticated using (
  public.is_committee_member(committee_id)
  or public.is_organization_admin(organization_id)
);

create policy decisions_insert_editor on public.decisions
for insert to authenticated with check (
  public.can_edit_agenda_item(committee_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy decisions_update_editor on public.decisions
for update to authenticated using (
  public.can_edit_agenda_item(committee_id)
)
with check (
  public.can_edit_agenda_item(committee_id)
  and updated_by = auth.uid()
);

revoke all on public.decisions from anon;
grant select, insert, update on public.decisions to authenticated;
