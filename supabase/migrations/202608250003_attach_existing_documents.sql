-- Link an already accessible Documents V2 record to a new canonical context
-- without granting mutation rights over the document itself.

create or replace function public.attach_existing_document(
  target_document_id uuid,
  target_relation_type public.document_relation_type,
  target_relation_id uuid default null
)
returns public.document_relations
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document public.documents;
  target_committee_id uuid;
  result public.document_relations;
begin
  if auth.uid() is null then
    raise exception 'Du skal være logget ind.';
  end if;

  select * into target_document
  from public.documents
  where id = target_document_id and deleted_at is null;

  if target_document.id is null or not public.can_read_document(target_document.id) then
    raise exception 'Dokumentet findes ikke, eller du har ikke adgang.';
  end if;

  if target_relation_type = 'organization' then
    if target_relation_id is not null
      or not public.is_organization_member(target_document.organization_id) then
      raise exception 'Organisationsrelationen er ugyldig.';
    end if;
  elsif target_relation_type = 'committee' then
    select id into target_committee_id from public.committees
    where id = target_relation_id
      and organization_id = target_document.organization_id
      and deleted_at is null;
    if target_committee_id is null or not public.can_edit_agenda_item(target_committee_id) then
      raise exception 'Udvalgsrelationen er ugyldig eller skrivebeskyttet.';
    end if;
  elsif target_relation_type = 'meeting' then
    select committee_id into target_committee_id from public.meetings
    where id = target_relation_id
      and organization_id = target_document.organization_id
      and deleted_at is null;
    if target_committee_id is null or not public.can_edit_agenda_item(target_committee_id) then
      raise exception 'Møderelationen er ugyldig eller skrivebeskyttet.';
    end if;
  elsif target_relation_type = 'agenda_item' then
    select committee_id into target_committee_id from public.agenda_items
    where id = target_relation_id
      and organization_id = target_document.organization_id
      and deleted_at is null;
    if target_committee_id is null or not public.can_edit_agenda_item(target_committee_id) then
      raise exception 'Dagsordensrelationen er ugyldig eller skrivebeskyttet.';
    end if;
  elsif target_relation_type = 'task' then
    select committee_id into target_committee_id from public.tasks
    where id = target_relation_id
      and organization_id = target_document.organization_id
      and archived_at is null;
    if target_committee_id is null or not public.can_edit_agenda_item(target_committee_id) then
      raise exception 'Opgaverelationen er ugyldig eller skrivebeskyttet.';
    end if;
  elsif target_relation_type = 'annual_wheel_event' then
    select committee_id into target_committee_id from public.annual_wheel_events
    where id = target_relation_id
      and organization_id = target_document.organization_id
      and deleted_at is null;
    if not found or not (
      (target_committee_id is null and public.is_organization_admin(target_document.organization_id))
      or (target_committee_id is not null and public.can_edit_agenda_item(target_committee_id))
    ) then
      raise exception 'Årshjulsrelationen er ugyldig eller skrivebeskyttet.';
    end if;
  elsif target_relation_type = 'stakeholder' then
    if not public.can_manage_stakeholder_data(target_document.organization_id)
      or not exists (
        select 1 from public.stakeholders
        where id = target_relation_id
          and organization_id = target_document.organization_id
          and archived_at is null
      ) then
      raise exception 'Interessentrelationen er ugyldig eller skrivebeskyttet.';
    end if;
  elsif target_relation_type = 'stakeholder_contract' then
    if not public.can_manage_stakeholder_data(target_document.organization_id)
      or not exists (
        select 1 from public.stakeholder_contracts
        where id = target_relation_id
          and organization_id = target_document.organization_id
          and archived_at is null
      ) then
      raise exception 'Kontraktrelationen er ugyldig eller skrivebeskyttet.';
    end if;
  else
    raise exception 'Dokumentrelationstypen understøttes ikke.';
  end if;

  insert into public.document_relations (
    organization_id,
    document_id,
    relation_type,
    committee_id,
    meeting_id,
    agenda_item_id,
    task_id,
    annual_wheel_event_id,
    stakeholder_id,
    stakeholder_contract_id,
    created_by
  ) values (
    target_document.organization_id,
    target_document.id,
    target_relation_type,
    case when target_relation_type = 'committee' then target_relation_id end,
    case when target_relation_type = 'meeting' then target_relation_id end,
    case when target_relation_type = 'agenda_item' then target_relation_id end,
    case when target_relation_type = 'task' then target_relation_id end,
    case when target_relation_type = 'annual_wheel_event' then target_relation_id end,
    case when target_relation_type = 'stakeholder' then target_relation_id end,
    case when target_relation_type = 'stakeholder_contract' then target_relation_id end,
    auth.uid()
  )
  on conflict do nothing
  returning * into result;

  if result.id is null then
    select * into result from public.document_relations relation
    where relation.document_id = target_document.id
      and relation.relation_type = target_relation_type
      and (
        (target_relation_type = 'organization')
        or (target_relation_type = 'committee' and relation.committee_id = target_relation_id)
        or (target_relation_type = 'meeting' and relation.meeting_id = target_relation_id)
        or (target_relation_type = 'agenda_item' and relation.agenda_item_id = target_relation_id)
        or (target_relation_type = 'task' and relation.task_id = target_relation_id)
        or (target_relation_type = 'annual_wheel_event' and relation.annual_wheel_event_id = target_relation_id)
        or (target_relation_type = 'stakeholder' and relation.stakeholder_id = target_relation_id)
        or (target_relation_type = 'stakeholder_contract' and relation.stakeholder_contract_id = target_relation_id)
      );
  end if;

  return result;
end;
$$;

create or replace function public.detach_existing_document(
  target_relation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  relation public.document_relations;
  target_committee_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Du skal være logget ind.';
  end if;

  select * into relation from public.document_relations
  where id = target_relation_id;
  if relation.id is null then
    raise exception 'Dokumentrelationen findes ikke.';
  end if;

  if relation.relation_type = 'organization' then
    if not public.is_organization_admin(relation.organization_id) then
      raise exception 'Du har ikke adgang til at fjerne relationen.';
    end if;
  elsif relation.relation_type = 'committee' then
    target_committee_id := relation.committee_id;
  elsif relation.relation_type = 'meeting' then
    select committee_id into target_committee_id from public.meetings where id = relation.meeting_id;
  elsif relation.relation_type = 'agenda_item' then
    select committee_id into target_committee_id from public.agenda_items where id = relation.agenda_item_id;
  elsif relation.relation_type = 'task' then
    select committee_id into target_committee_id from public.tasks where id = relation.task_id;
  elsif relation.relation_type = 'annual_wheel_event' then
    select committee_id into target_committee_id from public.annual_wheel_events where id = relation.annual_wheel_event_id;
    if target_committee_id is null and not public.is_organization_admin(relation.organization_id) then
      raise exception 'Du har ikke adgang til at fjerne relationen.';
    end if;
  elsif relation.relation_type in ('stakeholder', 'stakeholder_contract') then
    if not public.can_manage_stakeholder_data(relation.organization_id) then
      raise exception 'Du har ikke adgang til at fjerne relationen.';
    end if;
  end if;

  if target_committee_id is not null and not public.can_edit_agenda_item(target_committee_id) then
    raise exception 'Du har ikke adgang til at fjerne relationen.';
  end if;

  delete from public.document_relations where id = relation.id;
  return relation.id;
end;
$$;

revoke all on function public.attach_existing_document(uuid, public.document_relation_type, uuid) from public, anon;
revoke all on function public.detach_existing_document(uuid) from public, anon;
grant execute on function public.attach_existing_document(uuid, public.document_relation_type, uuid) to authenticated;
grant execute on function public.detach_existing_document(uuid) to authenticated;
