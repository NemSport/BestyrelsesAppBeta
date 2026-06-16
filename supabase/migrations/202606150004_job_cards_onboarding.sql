create table public.responsibility_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, name)
);

create table public.role_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  purpose text not null default '',
  description text not null default '',
  responsibilities text not null default '',
  exclusions text not null default '',
  competencies text not null default '',
  collaboration text not null default '',
  meeting_expectations text not null default '',
  contact_people text not null default '',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.role_profile_responsibility_areas (
  role_profile_id uuid not null references public.role_profiles(id) on delete cascade,
  responsibility_area_id uuid not null references public.responsibility_areas(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (role_profile_id, responsibility_area_id)
);

create table public.role_profile_committees (
  role_profile_id uuid not null references public.role_profiles(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (role_profile_id, committee_id)
);

create table public.role_profile_assignments (
  id uuid primary key default gen_random_uuid(),
  role_profile_id uuid not null references public.role_profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null default current_date,
  ends_on date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create unique index role_profile_active_assignment_idx
  on public.role_profile_assignments(role_profile_id, user_id)
  where ends_on is null;

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_profile_id uuid not null references public.role_profiles(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  description text not null default '',
  category text,
  default_deadline_days integer check (default_deadline_days between 0 and 3650),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.role_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_profile_id uuid not null references public.role_profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  url text not null check (
    char_length(url) between 8 and 2048
    and url ~ '^https?://'
  ),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.onboarding_guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_profile_id uuid not null unique references public.role_profiles(id) on delete cascade,
  introduction text not null default '',
  first_30_days text not null default '',
  practical_information text not null default '',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks
  add column role_profile_id uuid references public.role_profiles(id) on delete set null,
  add column task_template_id uuid references public.task_templates(id) on delete set null;

alter table public.annual_wheel_events
  add column role_profile_id uuid references public.role_profiles(id) on delete set null;

create or replace function public.validate_job_card_record_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role_profile_id is not null and not exists (
    select 1 from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Role profile scope is invalid';
  end if;
  if tg_table_name = 'tasks' and new.task_template_id is not null and not exists (
    select 1 from public.task_templates
    where id = new.task_template_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
      and (new.role_profile_id is null or role_profile_id = new.role_profile_id)
  ) then
    raise exception 'Task template scope is invalid';
  end if;
  return new;
end;
$$;

create trigger tasks_validate_job_card_links
before insert or update on public.tasks
for each row execute function public.validate_job_card_record_links();

create trigger annual_wheel_validate_job_card_links
before insert or update on public.annual_wheel_events
for each row execute function public.validate_job_card_record_links();

create index role_profiles_organization_idx
  on public.role_profiles(organization_id, title) where archived_at is null;
create index role_profile_assignments_user_idx
  on public.role_profile_assignments(organization_id, user_id);
create index task_templates_role_idx
  on public.task_templates(role_profile_id) where archived_at is null;
create index role_documents_role_idx on public.role_documents(role_profile_id);
create index tasks_role_profile_idx on public.tasks(role_profile_id)
  where role_profile_id is not null;
create index annual_wheel_role_profile_idx on public.annual_wheel_events(role_profile_id)
  where role_profile_id is not null;

create or replace function public.validate_job_card_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'role_profile_responsibility_areas' and (
    not exists (select 1 from public.role_profiles where id = new.role_profile_id and organization_id = new.organization_id)
    or not exists (select 1 from public.responsibility_areas where id = new.responsibility_area_id and organization_id = new.organization_id)
  ) then raise exception 'Job card responsibility scope is invalid';
  elsif tg_table_name = 'role_profile_committees' and (
    not exists (select 1 from public.role_profiles where id = new.role_profile_id and organization_id = new.organization_id)
    or not exists (select 1 from public.committees where id = new.committee_id and organization_id = new.organization_id)
  ) then raise exception 'Job card committee scope is invalid';
  elsif tg_table_name = 'role_profile_assignments' and (
    not exists (select 1 from public.role_profiles where id = new.role_profile_id and organization_id = new.organization_id)
    or not exists (select 1 from public.organization_members where organization_id = new.organization_id and user_id = new.user_id and status = 'active')
  ) then raise exception 'Job card assignment scope is invalid';
  elsif tg_table_name = 'task_templates' and (
    not exists (select 1 from public.role_profiles where id = new.role_profile_id and organization_id = new.organization_id)
    or not exists (select 1 from public.committees where id = new.committee_id and organization_id = new.organization_id)
  ) then raise exception 'Task template scope is invalid';
  elsif tg_table_name = 'role_documents' and
    not exists (select 1 from public.role_profiles where id = new.role_profile_id and organization_id = new.organization_id)
  then raise exception 'Role document scope is invalid';
  elsif tg_table_name = 'onboarding_guides' and
    not exists (select 1 from public.role_profiles where id = new.role_profile_id and organization_id = new.organization_id)
  then raise exception 'Onboarding guide scope is invalid';
  end if;
  return new;
end;
$$;

create trigger role_responsibilities_validate before insert or update on public.role_profile_responsibility_areas
for each row execute function public.validate_job_card_scope();
create trigger role_committees_validate before insert or update on public.role_profile_committees
for each row execute function public.validate_job_card_scope();
create trigger role_assignments_validate before insert or update on public.role_profile_assignments
for each row execute function public.validate_job_card_scope();
create trigger task_templates_validate before insert or update on public.task_templates
for each row execute function public.validate_job_card_scope();
create trigger role_documents_validate before insert or update on public.role_documents
for each row execute function public.validate_job_card_scope();
create trigger onboarding_guides_validate before insert or update on public.onboarding_guides
for each row execute function public.validate_job_card_scope();

create trigger responsibility_areas_updated before update on public.responsibility_areas
for each row execute function public.set_updated_at();
create trigger role_profiles_updated before update on public.role_profiles
for each row execute function public.set_updated_at();
create trigger task_templates_updated before update on public.task_templates
for each row execute function public.set_updated_at();
create trigger onboarding_guides_updated before update on public.onboarding_guides
for each row execute function public.set_updated_at();

alter table public.responsibility_areas enable row level security;
alter table public.role_profiles enable row level security;
alter table public.role_profile_responsibility_areas enable row level security;
alter table public.role_profile_committees enable row level security;
alter table public.role_profile_assignments enable row level security;
alter table public.task_templates enable row level security;
alter table public.role_documents enable row level security;
alter table public.onboarding_guides enable row level security;

create policy responsibility_areas_read on public.responsibility_areas for select to authenticated
using (public.is_organization_member(organization_id));
create policy role_profiles_read on public.role_profiles for select to authenticated
using (public.is_organization_member(organization_id));
create policy role_responsibilities_read on public.role_profile_responsibility_areas for select to authenticated
using (public.is_organization_member(organization_id));
create policy role_committees_read on public.role_profile_committees for select to authenticated
using (public.is_organization_member(organization_id));
create policy role_assignments_read on public.role_profile_assignments for select to authenticated
using (public.is_organization_member(organization_id));
create policy task_templates_read on public.task_templates for select to authenticated
using (public.is_organization_member(organization_id));
create policy role_documents_read on public.role_documents for select to authenticated
using (public.is_organization_member(organization_id));
create policy onboarding_guides_read on public.onboarding_guides for select to authenticated
using (public.is_organization_member(organization_id));

create policy responsibility_areas_admin on public.responsibility_areas for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy role_profiles_admin on public.role_profiles for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy role_responsibilities_admin on public.role_profile_responsibility_areas for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy role_committees_admin on public.role_profile_committees for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy role_assignments_admin on public.role_profile_assignments for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy task_templates_admin on public.task_templates for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy role_documents_admin on public.role_documents for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy onboarding_guides_admin on public.onboarding_guides for all to authenticated
using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

grant select, insert, update, delete on public.responsibility_areas to authenticated;
grant select, insert, update, delete on public.role_profiles to authenticated;
grant select, insert, update, delete on public.role_profile_responsibility_areas to authenticated;
grant select, insert, update, delete on public.role_profile_committees to authenticated;
grant select, insert, update, delete on public.role_profile_assignments to authenticated;
grant select, insert, update, delete on public.task_templates to authenticated;
grant select, insert, update, delete on public.role_documents to authenticated;
grant select, insert, update, delete on public.onboarding_guides to authenticated;

revoke all on public.responsibility_areas from anon;
revoke all on public.role_profiles from anon;
revoke all on public.role_profile_responsibility_areas from anon;
revoke all on public.role_profile_committees from anon;
revoke all on public.role_profile_assignments from anon;
revoke all on public.task_templates from anon;
revoke all on public.role_documents from anon;
revoke all on public.onboarding_guides from anon;
