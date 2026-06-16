create type public.task_status as enum (
  'not_started',
  'in_progress',
  'waiting',
  'completed',
  'cancelled'
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 240),
  description text not null default '',
  status public.task_status not null default 'not_started',
  responsible_user_id uuid references public.profiles(id) on delete set null,
  deadline date,
  category text,
  internal_note text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  completed_at timestamptz,
  check (category is null or char_length(category) <= 120),
  check (status = 'completed' or completed_at is null)
);

create index tasks_organization_updated_idx
  on public.tasks(organization_id, updated_at desc);
create index tasks_committee_status_idx
  on public.tasks(committee_id, status, created_at desc);
create index tasks_responsible_deadline_idx
  on public.tasks(responsible_user_id, deadline)
  where responsible_user_id is not null;
create index tasks_deadline_idx
  on public.tasks(committee_id, deadline)
  where deadline is not null and archived_at is null;

create or replace function public.validate_task_scope()
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
    raise exception 'Task committee scope is invalid';
  end if;

  if new.responsible_user_id is not null and not exists (
    select 1
    from public.committee_members
    where committee_id = new.committee_id
      and organization_id = new.organization_id
      and user_id = new.responsible_user_id
      and status = 'active'
  ) then
    raise exception 'Task responsible user must be an active committee member';
  end if;

  new.updated_by = auth.uid();
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at = now();
  elsif new.status <> 'completed' then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

create trigger tasks_validate_scope
before insert or update on public.tasks
for each row execute function public.validate_task_scope();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy tasks_select_member on public.tasks
for select to authenticated using (
  public.is_committee_member(committee_id)
  or public.is_organization_admin(organization_id)
);

create policy tasks_insert_editor on public.tasks
for insert to authenticated with check (
  public.can_edit_agenda_item(committee_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy tasks_update_editor on public.tasks
for update to authenticated using (
  public.can_edit_agenda_item(committee_id)
)
with check (
  public.can_edit_agenda_item(committee_id)
  and updated_by = auth.uid()
);

revoke all on public.tasks from anon;
grant select, insert, update on public.tasks to authenticated;
