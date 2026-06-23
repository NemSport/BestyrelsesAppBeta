-- Split Job Card link validation for tasks and Annual Wheel events.
--
-- The original shared trigger function was attached to both tables and
-- referenced NEW.task_template_id inside a guarded condition. PostgreSQL still
-- resolves that record field for annual_wheel_events, where the column does
-- not exist, causing 42703 during activity creation.

drop trigger if exists tasks_validate_job_card_links on public.tasks;
drop trigger if exists annual_wheel_validate_job_card_links on public.annual_wheel_events;

create or replace function public.validate_task_job_card_record_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role_profile_id is not null and not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Task role profile scope is invalid';
  end if;

  if new.task_template_id is not null and not exists (
    select 1
    from public.task_templates
    where id = new.task_template_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
      and (
        new.role_profile_id is null
        or role_profile_id = new.role_profile_id
      )
  ) then
    raise exception 'Task template scope is invalid';
  end if;

  return new;
end;
$$;

create or replace function public.validate_annual_wheel_job_card_record_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role_profile_id is not null and not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Annual wheel role profile scope is invalid';
  end if;

  return new;
end;
$$;

create trigger tasks_validate_job_card_links
before insert or update on public.tasks
for each row execute function public.validate_task_job_card_record_links();

create trigger annual_wheel_validate_job_card_links
before insert or update on public.annual_wheel_events
for each row execute function public.validate_annual_wheel_job_card_record_links();
