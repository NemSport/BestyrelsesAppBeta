alter table public.tasks
  add column meeting_id uuid references public.meetings(id) on delete set null,
  add column agenda_item_id uuid references public.agenda_items(id) on delete set null,
  add column decision_id uuid references public.decisions(id) on delete set null;

create index tasks_meeting_idx on public.tasks(meeting_id)
  where meeting_id is not null;
create index tasks_agenda_item_idx on public.tasks(agenda_item_id)
  where agenda_item_id is not null;
create index tasks_decision_idx on public.tasks(decision_id)
  where decision_id is not null;

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

  if new.meeting_id is not null and not exists (
    select 1
    from public.meetings
    where id = new.meeting_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
  ) then
    raise exception 'Task meeting scope is invalid';
  end if;

  if new.agenda_item_id is not null and not exists (
    select 1
    from public.agenda_items
    where id = new.agenda_item_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
  ) then
    raise exception 'Task agenda item scope is invalid';
  end if;

  if new.decision_id is not null and not exists (
    select 1
    from public.decisions
    where id = new.decision_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
  ) then
    raise exception 'Task decision scope is invalid';
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
