create function public.activate_stakeholder_contract(
  target_organization uuid,
  target_stakeholder uuid,
  target_contract uuid,
  target_committee uuid,
  responsible_member uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  contract public.stakeholder_contracts%rowtype;
  sponsor_name text;
begin
  if actor is null or not public.can_manage_stakeholder_data(target_organization)
    or not exists (
      select 1 from public.organizations
      where id = target_organization and deleted_at is null
    )
  then
    raise exception 'Contract activation requires write access' using errcode = '42501';
  end if;

  select name into sponsor_name from public.stakeholders
  where id = target_stakeholder and organization_id = target_organization and archived_at is null;
  if not found then
    raise exception 'Stakeholder not found' using errcode = 'P0002';
  end if;

  select * into contract from public.stakeholder_contracts
  where id = target_contract and organization_id = target_organization
    and stakeholder_id = target_stakeholder and archived_at is null
  for update;
  if not found then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;
  if contract.status = 'active' then return; end if;
  if contract.status <> 'draft' then
    raise exception 'Only drafts can be activated' using errcode = '55000';
  end if;

  if contract.renewal_deadline is not null or contract.notice_deadline is not null then
    if target_committee is null or not public.can_edit_agenda_item(target_committee)
      or not exists (
        select 1 from public.committees c
        where c.id = target_committee and c.organization_id = target_organization and c.deleted_at is null
      )
    then
      raise exception 'Choose an editable committee' using errcode = '42501';
    end if;
    if responsible_member is null or not exists (
      select 1 from public.committee_members cm
      where cm.committee_id = target_committee and cm.organization_id = target_organization
        and cm.user_id = responsible_member and cm.status = 'active'
    )
    then
      raise exception 'Choose an active committee member' using errcode = '22023';
    end if;

    insert into public.tasks (
      organization_id, committee_id, stakeholder_id, stakeholder_contract_id,
      title, description, deadline, responsible_user_id, created_by, updated_by
    )
    select target_organization, target_committee, target_stakeholder, target_contract,
      left(format('%s · %s', obligation.title, sponsor_name), 240),
      format('%s Sponsoraftale: %s.', obligation.description, contract.title),
      obligation.deadline, responsible_member, actor, actor
    from (values
      ('Genforhandl sponsoraftalen', 'Afklar videre samarbejde og afslut genforhandlingen inden fristen.', contract.renewal_deadline),
      ('Tag stilling til opsigelse af sponsoraftalen', 'Gennemgå aftalen og afklar eventuel opsigelse inden fristen.', contract.notice_deadline)
    ) as obligation(title, description, deadline)
    where obligation.deadline is not null;
  end if;

  update public.stakeholder_contracts
    set status = 'active', updated_by = actor
    where id = target_contract and organization_id = target_organization;
end;
$$;

revoke all on function public.activate_stakeholder_contract(uuid,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.activate_stakeholder_contract(uuid,uuid,uuid,uuid,uuid) to authenticated;
