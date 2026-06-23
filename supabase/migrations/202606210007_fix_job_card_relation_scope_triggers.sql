-- Fix job card relation scope validation so each trigger only references
-- columns that exist on its own table. A shared function with SQL AND
-- conditions can still evaluate NEW.committee_id for tables that do not have
-- that column.

drop trigger if exists role_responsibilities_validate on public.role_profile_responsibility_areas;
drop trigger if exists role_committees_validate on public.role_profile_committees;
drop trigger if exists role_assignments_validate on public.role_profile_assignments;
drop trigger if exists task_templates_validate on public.task_templates;
drop trigger if exists role_documents_validate on public.role_documents;
drop trigger if exists onboarding_guides_validate on public.onboarding_guides;

create or replace function public.validate_role_profile_responsibility_area_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Job card role profile scope is invalid';
  end if;

  if not exists (
    select 1
    from public.responsibility_areas
    where id = new.responsibility_area_id
      and organization_id = new.organization_id
      and archived_at is null
  ) then
    raise exception 'Job card responsibility scope is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.validate_role_profile_committee_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Job card role profile scope is invalid';
  end if;

  if not exists (
    select 1
    from public.committees
    where id = new.committee_id
      and organization_id = new.organization_id
      and deleted_at is null
  ) then
    raise exception 'Job card committee scope is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.validate_role_profile_assignment_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Job card role profile scope is invalid';
  end if;

  if not exists (
    select 1
    from public.organization_members
    where organization_id = new.organization_id
      and user_id = new.user_id
      and status = 'active'
  ) then
    raise exception 'Job card assignment scope is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.validate_task_template_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Job card role profile scope is invalid';
  end if;

  if not exists (
    select 1
    from public.committees
    where id = new.committee_id
      and organization_id = new.organization_id
      and deleted_at is null
  ) then
    raise exception 'Task template scope is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.validate_role_document_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Role document scope is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.validate_onboarding_guide_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Onboarding guide scope is invalid';
  end if;

  return new;
end;
$$;

create trigger role_responsibilities_validate
before insert or update on public.role_profile_responsibility_areas
for each row execute function public.validate_role_profile_responsibility_area_scope();

create trigger role_committees_validate
before insert or update on public.role_profile_committees
for each row execute function public.validate_role_profile_committee_scope();

create trigger role_assignments_validate
before insert or update on public.role_profile_assignments
for each row execute function public.validate_role_profile_assignment_scope();

create trigger task_templates_validate
before insert or update on public.task_templates
for each row execute function public.validate_task_template_scope();

create trigger role_documents_validate
before insert or update on public.role_documents
for each row execute function public.validate_role_document_scope();

create trigger onboarding_guides_validate
before insert or update on public.onboarding_guides
for each row execute function public.validate_onboarding_guide_scope();
