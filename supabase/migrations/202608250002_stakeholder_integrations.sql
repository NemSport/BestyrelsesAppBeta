alter table public.tasks
  add column stakeholder_id uuid,
  add column stakeholder_contract_id uuid,
  add constraint tasks_stakeholder_scope_fkey
    foreign key (organization_id, stakeholder_id)
    references public.stakeholders(organization_id, id) on delete set null,
  add constraint tasks_stakeholder_contract_scope_fkey
    foreign key (organization_id, stakeholder_contract_id)
    references public.stakeholder_contracts(organization_id, id) on delete set null;

create index tasks_stakeholder_idx on public.tasks (stakeholder_id, status)
where stakeholder_id is not null and archived_at is null;
create index tasks_stakeholder_contract_idx on public.tasks (stakeholder_contract_id)
where stakeholder_contract_id is not null and archived_at is null;

create or replace function public.validate_task_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.committees where id = new.committee_id
      and organization_id = new.organization_id
  ) then raise exception 'Task committee scope is invalid'; end if;
  if new.meeting_id is not null and not exists (
    select 1 from public.meetings where id = new.meeting_id
      and organization_id = new.organization_id and committee_id = new.committee_id
  ) then raise exception 'Task meeting scope is invalid'; end if;
  if new.agenda_item_id is not null and not exists (
    select 1 from public.agenda_items where id = new.agenda_item_id
      and organization_id = new.organization_id and committee_id = new.committee_id
  ) then raise exception 'Task agenda item scope is invalid'; end if;
  if new.decision_id is not null and not exists (
    select 1 from public.decisions where id = new.decision_id
      and organization_id = new.organization_id and committee_id = new.committee_id
  ) then raise exception 'Task decision scope is invalid'; end if;
  if new.stakeholder_contract_id is not null and not exists (
    select 1 from public.stakeholder_contracts c
    where c.id = new.stakeholder_contract_id
      and c.organization_id = new.organization_id
      and c.stakeholder_id = new.stakeholder_id
  ) then raise exception 'Task stakeholder contract scope is invalid'; end if;
  if new.responsible_user_id is not null and not exists (
    select 1 from public.committee_members where committee_id = new.committee_id
      and organization_id = new.organization_id and user_id = new.responsible_user_id
      and status = 'active'
  ) then raise exception 'Task responsible user must be an active committee member'; end if;
  new.updated_by = auth.uid();
  if new.status = 'completed' and new.completed_at is null then new.completed_at = now();
  elsif new.status <> 'completed' then new.completed_at = null;
  end if;
  return new;
end;
$$;

alter table public.document_relations
  add column stakeholder_id uuid,
  add column stakeholder_contract_id uuid,
  add constraint document_relations_stakeholder_scope_fkey
    foreign key (organization_id, stakeholder_id)
    references public.stakeholders(organization_id, id) on delete cascade,
  add constraint document_relations_stakeholder_contract_scope_fkey
    foreign key (organization_id, stakeholder_contract_id)
    references public.stakeholder_contracts(organization_id, id) on delete cascade;

alter table public.document_relations drop constraint if exists document_relations_check;
alter table public.document_relations add constraint document_relations_target_valid check (
  (relation_type = 'organization' and num_nonnulls(committee_id, meeting_id, agenda_item_id, task_id, annual_wheel_event_id, stakeholder_id, stakeholder_contract_id) = 0)
  or (relation_type = 'committee' and committee_id is not null and num_nonnulls(meeting_id, agenda_item_id, task_id, annual_wheel_event_id, stakeholder_id, stakeholder_contract_id) = 0)
  or (relation_type = 'meeting' and meeting_id is not null and num_nonnulls(committee_id, agenda_item_id, task_id, annual_wheel_event_id, stakeholder_id, stakeholder_contract_id) = 0)
  or (relation_type = 'agenda_item' and agenda_item_id is not null and num_nonnulls(committee_id, meeting_id, task_id, annual_wheel_event_id, stakeholder_id, stakeholder_contract_id) = 0)
  or (relation_type = 'task' and task_id is not null and num_nonnulls(committee_id, meeting_id, agenda_item_id, annual_wheel_event_id, stakeholder_id, stakeholder_contract_id) = 0)
  or (relation_type = 'annual_wheel_event' and annual_wheel_event_id is not null and num_nonnulls(committee_id, meeting_id, agenda_item_id, task_id, stakeholder_id, stakeholder_contract_id) = 0)
  or (relation_type = 'stakeholder' and stakeholder_id is not null and num_nonnulls(committee_id, meeting_id, agenda_item_id, task_id, annual_wheel_event_id, stakeholder_contract_id) = 0)
  or (relation_type = 'stakeholder_contract' and stakeholder_contract_id is not null and num_nonnulls(committee_id, meeting_id, agenda_item_id, task_id, annual_wheel_event_id, stakeholder_id) = 0)
);

create unique index document_relations_stakeholder_unique
on public.document_relations (document_id, stakeholder_id)
where relation_type = 'stakeholder';
create unique index document_relations_stakeholder_contract_unique
on public.document_relations (document_id, stakeholder_contract_id)
where relation_type = 'stakeholder_contract';

create or replace function public.validate_document_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare document_organization_id uuid;
begin
  if tg_table_name = 'documents' then
    if new.category_id is not null and not exists (
      select 1 from public.document_categories c where c.id = new.category_id and c.organization_id = new.organization_id
    ) then raise exception 'Dokumentkategorien tilhører en anden organisation.'; end if;
    if new.primary_committee_id is not null and not exists (
      select 1 from public.committees c where c.id = new.primary_committee_id and c.organization_id = new.organization_id
    ) then raise exception 'Dokumentudvalget tilhører en anden organisation.'; end if;
    return new;
  end if;
  select d.organization_id into document_organization_id from public.documents d where d.id = new.document_id;
  if document_organization_id is null or document_organization_id <> new.organization_id then
    raise exception 'Dokumentrelationen krydser organisation.';
  end if;
  if tg_table_name = 'document_versions' then return new; end if;
  if new.relation_type = 'committee' and not exists (select 1 from public.committees c where c.id = new.committee_id and c.organization_id = new.organization_id) then raise exception 'Udvalgsrelationen krydser organisation.';
  elsif new.relation_type = 'meeting' and not exists (select 1 from public.meetings m where m.id = new.meeting_id and m.organization_id = new.organization_id) then raise exception 'Møderelationen krydser organisation.';
  elsif new.relation_type = 'agenda_item' and not exists (select 1 from public.agenda_items a where a.id = new.agenda_item_id and a.organization_id = new.organization_id) then raise exception 'Dagsordensrelationen krydser organisation.';
  elsif new.relation_type = 'task' and not exists (select 1 from public.tasks t where t.id = new.task_id and t.organization_id = new.organization_id) then raise exception 'Opgaverelationen krydser organisation.';
  elsif new.relation_type = 'annual_wheel_event' and not exists (select 1 from public.annual_wheel_events e where e.id = new.annual_wheel_event_id and e.organization_id = new.organization_id) then raise exception 'Årshjulsrelationen krydser organisation.';
  elsif new.relation_type = 'stakeholder' and (
    not public.can_manage_stakeholder_data(new.organization_id)
    or not exists (select 1 from public.stakeholders s where s.id = new.stakeholder_id and s.organization_id = new.organization_id and s.archived_at is null)
  ) then raise exception 'Interessentrelationen er ugyldig eller skrivebeskyttet.';
  elsif new.relation_type = 'stakeholder_contract' and (
    not public.can_manage_stakeholder_data(new.organization_id)
    or not exists (select 1 from public.stakeholder_contracts c where c.id = new.stakeholder_contract_id and c.organization_id = new.organization_id and c.archived_at is null)
  ) then raise exception 'Kontraktrelationen er ugyldig eller skrivebeskyttet.';
  end if;
  return new;
end;
$$;

create or replace function public.can_read_document(target_document_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare target public.documents;
begin
  select * into target from public.documents d where d.id = target_document_id and d.deleted_at is null;
  if target.id is null then return false; end if;
  if target.uploaded_by = auth.uid() or public.is_organization_admin(target.organization_id) then return true; end if;
  if target.legacy_source_type = 'meeting_attachment' and exists (
    select 1 from public.meeting_minute_attachments a join public.meeting_minutes mm on mm.id = a.meeting_minutes_id
    where a.id = target.legacy_source_id and public.can_read_meeting_minutes(mm.committee_id, mm.status)
  ) then return true;
  elsif target.legacy_source_type = 'agenda_attachment' and exists (
    select 1 from public.agenda_item_minute_attachments a
    join public.agenda_item_minutes aim on aim.id = a.agenda_item_minutes_id
    join public.meeting_minutes mm on mm.meeting_id = aim.meeting_id
    where a.id = target.legacy_source_id and public.can_read_meeting_minutes(mm.committee_id, mm.status)
  ) then return true;
  end if;
  return exists (
    select 1 from public.document_relations r where r.document_id = target.id and (
      (r.relation_type = 'organization' and public.is_organization_member(r.organization_id))
      or (r.relation_type = 'committee' and (public.is_committee_member(r.committee_id) or public.is_organization_admin(r.organization_id)))
      or (r.relation_type = 'meeting' and exists (select 1 from public.meetings m where m.id = r.meeting_id and (public.is_committee_member(m.committee_id) or public.is_organization_admin(r.organization_id))))
      or (r.relation_type = 'agenda_item' and exists (select 1 from public.agenda_items a where a.id = r.agenda_item_id and (public.is_committee_member(a.committee_id) or public.is_organization_admin(r.organization_id))))
      or (r.relation_type = 'task' and exists (select 1 from public.tasks t where t.id = r.task_id and (public.is_committee_member(t.committee_id) or public.is_organization_admin(r.organization_id))))
      or (r.relation_type = 'annual_wheel_event' and exists (select 1 from public.annual_wheel_events e where e.id = r.annual_wheel_event_id and ((e.committee_id is null and public.is_organization_member(r.organization_id)) or public.is_committee_member(e.committee_id) or public.is_organization_admin(r.organization_id))))
      or (r.relation_type in ('stakeholder', 'stakeholder_contract') and public.is_organization_member(r.organization_id))
    )
  );
end;
$$;

alter table public.action_user_states drop constraint if exists action_user_states_type_valid;
alter table public.action_user_states add constraint action_user_states_type_valid check (action_type in (
  'task_overdue', 'task_due_soon', 'task_reminder', 'minutes_approval',
  'annual_wheel_overdue', 'annual_wheel_due', 'stakeholder_follow_up',
  'stakeholder_contract_notice', 'stakeholder_contract_renewal',
  'stakeholder_contract_end', 'stakeholder_pipeline_follow_up'
));
alter table public.action_user_states drop constraint if exists action_user_states_source_valid;
alter table public.action_user_states add constraint action_user_states_source_valid check (source_type in (
  'task', 'meeting_minutes', 'annual_wheel_event', 'stakeholder',
  'stakeholder_contract', 'stakeholder_pipeline'
));
