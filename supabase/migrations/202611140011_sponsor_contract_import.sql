create policy ai_activity_log_read_own_sponsor_contract on public.ai_activity_log
for select to authenticated using (
  field = 'sponsor_contract' and meeting_id is null and agenda_item_id is null
  and user_id = auth.uid() and public.can_manage_stakeholder_data(organization_id)
);

create policy ai_activity_log_insert_own_sponsor_contract on public.ai_activity_log
for insert to authenticated with check (
  field = 'sponsor_contract' and meeting_id is null and agenda_item_id is null
  and user_id = auth.uid() and public.can_manage_stakeholder_data(organization_id)
);

alter table public.stakeholder_contracts add column import_file_hash text
  check (import_file_hash ~ '^[a-f0-9]{64}$');
create unique index stakeholder_contract_import_once
  on public.stakeholder_contracts(organization_id, import_file_hash)
  where import_file_hash is not null;

create function public.approve_sponsor_contract_import(target_organization uuid, approval jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  sponsor_id uuid := (approval->>'sponsorId')::uuid;
  saved_contract uuid;
  sponsor jsonb := approval->'sponsor';
  terms jsonb := approval->'contract';
  benefit text;
begin
  if not public.can_manage_stakeholder_data(target_organization) or not exists (
    select 1 from public.organizations o where o.id=target_organization and o.deleted_at is null
  ) then raise exception 'Sponsor import requires write access' using errcode='42501'; end if;
  if approval->>'fileHash' is null or jsonb_typeof(approval->'deliverables') is distinct from 'array'
    or jsonb_array_length(approval->'deliverables')>20
  then raise exception 'Invalid approval' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_organization::text, 1));
  if sponsor_id is null then
    if exists (select 1 from public.stakeholders s where s.organization_id=target_organization
      and (trim(regexp_replace(lower(s.name),'[^[:alnum:]]+',' ','g'))=trim(regexp_replace(lower(sponsor->>'name'),'[^[:alnum:]]+',' ','g'))
        or (nullif(sponsor->>'cvr','') is not null and regexp_replace(s.cvr_number,'[^0-9]','','g')=sponsor->>'cvr')
        or (nullif(sponsor->>'email','') is not null and lower(s.email)=lower(sponsor->>'email'))))
    then raise exception 'Sponsor already exists' using errcode='23505'; end if;
    insert into public.stakeholders (organization_id,name,stakeholder_type,relationship_status,created_by,updated_by)
      values(target_organization,sponsor->>'name','sponsor','active',actor,actor) returning id into sponsor_id;
  end if;
  if nullif(sponsor->>'cvr','') is not null and exists (
    select 1 from public.stakeholders s where s.organization_id=target_organization
      and s.id<>sponsor_id and regexp_replace(s.cvr_number,'[^0-9]','','g')=sponsor->>'cvr'
  ) then raise exception 'CVR belongs to another sponsor' using errcode='40001'; end if;

  update public.stakeholders s set
    cvr_number=coalesce(nullif(s.cvr_number,''),nullif(sponsor->>'cvr','')),
    address_line=coalesce(nullif(s.address_line,''),nullif(sponsor->>'address','')),
    postal_code=coalesce(nullif(s.postal_code,''),nullif(sponsor->>'postalCode','')),
    city=coalesce(nullif(s.city,''),nullif(sponsor->>'city','')),
    phone=coalesce(nullif(s.phone,''),nullif(sponsor->>'phone','')),
    email=coalesce(nullif(s.email,''),nullif(sponsor->>'email','')),
    updated_by=actor
    where s.id=sponsor_id and s.organization_id=target_organization and s.archived_at is null
      and (nullif(sponsor->>'cvr','') is null or nullif(s.cvr_number,'') is null
        or regexp_replace(s.cvr_number,'[^0-9]','','g')=sponsor->>'cvr');
  if not found then raise exception 'Sponsor unavailable or different CVR' using errcode='40001'; end if;

  if nullif(sponsor->>'contact','') is not null and not exists (
    select 1 from public.stakeholder_contacts c where c.organization_id=target_organization
      and c.stakeholder_id=sponsor_id and c.archived_at is null and lower(c.name)=lower(sponsor->>'contact')
  ) then
    insert into public.stakeholder_contacts (organization_id,stakeholder_id,name,email,phone,created_by,updated_by)
      values(target_organization,sponsor_id,sponsor->>'contact',nullif(sponsor->>'email',''),nullif(sponsor->>'phone',''),actor,actor);
  end if;
  insert into public.stakeholder_contracts
    (organization_id,stakeholder_id,title,status,contract_value,annual_value,currency,start_date,end_date,
     notice_deadline,renewal_deadline,auto_renew,import_file_hash,created_by,updated_by)
  values
    (target_organization,sponsor_id,terms->>'title','draft',(terms->>'contractValue')::numeric,
     (terms->>'annualValue')::numeric,terms->>'currency',(terms->>'startDate')::date,(terms->>'endDate')::date,
     (terms->>'noticeDeadline')::date,(terms->>'renewalDeadline')::date,(terms->>'autoRenew')::boolean,
     approval->>'fileHash',actor,actor)
  returning id into saved_contract;
  for benefit in select value from jsonb_array_elements_text(approval->'deliverables') loop
    insert into public.stakeholder_contract_deliverables
      (organization_id,contract_id,deliverable_type,title,created_by,updated_by)
    values(target_organization,saved_contract,'Sponsorat',benefit,actor,actor);
  end loop;
  return sponsor_id;
end $$;
revoke all on function public.approve_sponsor_contract_import(uuid,jsonb) from public,anon;
grant execute on function public.approve_sponsor_contract_import(uuid,jsonb) to authenticated;
