do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'annual_wheel_event_status'
  ) then
    create type public.annual_wheel_event_status as enum (
      'planned',
      'in_progress',
      'completed',
      'postponed',
      'cancelled'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'annual_wheel_deadline_anchor'
  ) then
    create type public.annual_wheel_deadline_anchor as enum (
      'start',
      'end'
    );
  end if;
end $$;

alter table public.annual_wheel_events
  add column if not exists status public.annual_wheel_event_status not null default 'planned';

create table if not exists public.annual_wheel_task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  annual_wheel_event_id uuid not null references public.annual_wheel_events(id) on delete cascade,
  title text not null,
  description text not null default '',
  suggested_responsible_user_id uuid references public.profiles(id) on delete set null,
  deadline_anchor public.annual_wheel_deadline_anchor not null default 'start',
  deadline_offset_days integer,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint annual_wheel_task_templates_title_check check (length(trim(title)) > 0),
  constraint annual_wheel_task_templates_deadline_offset_check check (
    deadline_offset_days is null
    or deadline_offset_days between -3650 and 3650
  )
);

alter table public.tasks
  add column if not exists annual_wheel_event_id uuid references public.annual_wheel_events(id) on delete set null,
  add column if not exists annual_wheel_task_template_id uuid references public.annual_wheel_task_templates(id) on delete set null,
  add column if not exists annual_wheel_activation_year integer;

create unique index if not exists tasks_annual_wheel_template_year_unique
  on public.tasks(annual_wheel_task_template_id, annual_wheel_activation_year)
  where annual_wheel_task_template_id is not null
    and annual_wheel_activation_year is not null
    and archived_at is null;

create index if not exists tasks_annual_wheel_event_idx
  on public.tasks(annual_wheel_event_id, annual_wheel_activation_year)
  where annual_wheel_event_id is not null;

create index if not exists annual_wheel_task_templates_event_idx
  on public.annual_wheel_task_templates(annual_wheel_event_id, sort_order)
  where archived_at is null;

create or replace function public.validate_annual_wheel_task_template_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.annual_wheel_events
    where id = new.annual_wheel_event_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Annual wheel task template activity scope is invalid';
  end if;

  if new.suggested_responsible_user_id is not null and not exists (
    select 1
    from public.organization_members
    where organization_id = new.organization_id
      and user_id = new.suggested_responsible_user_id
      and status = 'active'
  ) then
    raise exception 'Annual wheel task template responsible user scope is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.validate_task_annual_wheel_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.annual_wheel_event_id is not null and not exists (
    select 1
    from public.annual_wheel_events
    where id = new.annual_wheel_event_id
      and organization_id = new.organization_id
      and (committee_id is null or committee_id = new.committee_id)
  ) then
    raise exception 'Task annual wheel activity scope is invalid';
  end if;

  if new.annual_wheel_task_template_id is not null and not exists (
    select 1
    from public.annual_wheel_task_templates
    where id = new.annual_wheel_task_template_id
      and organization_id = new.organization_id
      and annual_wheel_event_id = new.annual_wheel_event_id
      and archived_at is null
  ) then
    raise exception 'Task annual wheel template scope is invalid';
  end if;

  if new.annual_wheel_task_template_id is not null
     and new.annual_wheel_activation_year is null then
    raise exception 'Task annual wheel activation year is required';
  end if;

  return new;
end;
$$;

drop trigger if exists annual_wheel_task_templates_validate_scope
  on public.annual_wheel_task_templates;
create trigger annual_wheel_task_templates_validate_scope
before insert or update on public.annual_wheel_task_templates
for each row execute function public.validate_annual_wheel_task_template_scope();

drop trigger if exists annual_wheel_task_templates_set_updated_at
  on public.annual_wheel_task_templates;
create trigger annual_wheel_task_templates_set_updated_at
before update on public.annual_wheel_task_templates
for each row execute function public.set_updated_at();

drop trigger if exists tasks_validate_annual_wheel_links on public.tasks;
create trigger tasks_validate_annual_wheel_links
before insert or update on public.tasks
for each row execute function public.validate_task_annual_wheel_links();

alter table public.annual_wheel_task_templates enable row level security;

drop policy if exists annual_wheel_task_templates_select_member
  on public.annual_wheel_task_templates;
create policy annual_wheel_task_templates_select_member
on public.annual_wheel_task_templates for select to authenticated using (
  public.is_organization_member(organization_id)
);

drop policy if exists annual_wheel_task_templates_insert_editor
  on public.annual_wheel_task_templates;
create policy annual_wheel_task_templates_insert_editor
on public.annual_wheel_task_templates for insert to authenticated with check (
  created_by = auth.uid()
  and updated_by = auth.uid()
  and exists (
    select 1
    from public.annual_wheel_events event
    where event.id = annual_wheel_event_id
      and event.organization_id = organization_id
      and (
        (event.committee_id is null and public.is_organization_admin(organization_id))
        or (event.committee_id is not null and public.can_edit_agenda_item(event.committee_id))
      )
  )
);

drop policy if exists annual_wheel_task_templates_update_editor
  on public.annual_wheel_task_templates;
create policy annual_wheel_task_templates_update_editor
on public.annual_wheel_task_templates for update to authenticated using (
  exists (
    select 1
    from public.annual_wheel_events event
    where event.id = annual_wheel_event_id
      and event.organization_id = organization_id
      and (
        (event.committee_id is null and public.is_organization_admin(organization_id))
        or (event.committee_id is not null and public.can_edit_agenda_item(event.committee_id))
      )
  )
)
with check (
  updated_by = auth.uid()
  and exists (
    select 1
    from public.annual_wheel_events event
    where event.id = annual_wheel_event_id
      and event.organization_id = organization_id
      and (
        (event.committee_id is null and public.is_organization_admin(organization_id))
        or (event.committee_id is not null and public.can_edit_agenda_item(event.committee_id))
      )
  )
);

revoke all on public.annual_wheel_task_templates from anon;
grant select, insert, update on public.annual_wheel_task_templates to authenticated;
