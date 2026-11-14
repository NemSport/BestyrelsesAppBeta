create function public.apply_sponsor_import(target_organization uuid, operations jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  operation jsonb;
  fields jsonb;
  target uuid;
  actor uuid := auth.uid();
  owner_id uuid;
  contact_name text;
  incoming_cvr text;
begin
  if not public.can_manage_stakeholder_data(target_organization) then
    raise exception 'Sponsor import requires write access' using errcode = '42501';
  end if;
  if jsonb_typeof(operations) is distinct from 'array' or jsonb_array_length(operations) not between 1 and 500 then
    raise exception 'Invalid sponsor import' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_organization::text, 1));
  for operation in select value from jsonb_array_elements(operations) loop
    fields := operation->'fields';
    target := (operation->>'id')::uuid;
    owner_id := (operation->>'owner')::uuid;
    contact_name := nullif(btrim(operation->>'contact'), '');
    incoming_cvr := nullif(regexp_replace(fields->>'cvr_number', '[^0-9]', '', 'g'), '');
    if exists (
      select 1 from public.stakeholders s
      where s.organization_id=target_organization and s.id is distinct from target
        and ((incoming_cvr is not null and regexp_replace(s.cvr_number,'[^0-9]','','g')=incoming_cvr)
          or (target is null and lower(btrim(s.name))=lower(btrim(fields->>'name'))))
    ) then
      raise exception 'Sponsor already exists' using errcode = '23505';
    end if;
    if target is null then
      insert into public.stakeholders (organization_id, name, stakeholder_type, relationship_status,
        cvr_number,address_line,postal_code,city,phone,email,notes,internal_owner_user_id,created_by,updated_by)
      values (target_organization, fields->>'name', 'sponsor','active', fields->>'cvr_number',
        fields->>'address_line',fields->>'postal_code',fields->>'city',fields->>'phone',fields->>'email',
        fields->>'notes',owner_id,actor,actor)
      returning id into target;
    else
      update public.stakeholders s
        set name=coalesce(nullif(btrim(fields->>'name'),''),s.name),
          cvr_number=coalesce(nullif(btrim(fields->>'cvr_number'),''),s.cvr_number),
          address_line=coalesce(nullif(btrim(fields->>'address_line'),''),s.address_line),
          postal_code=coalesce(nullif(btrim(fields->>'postal_code'),''),s.postal_code),
          city=coalesce(nullif(btrim(fields->>'city'),''),s.city),
          phone=coalesce(nullif(btrim(fields->>'phone'),''),s.phone),
          email=coalesce(nullif(btrim(fields->>'email'),''),s.email),
          notes=coalesce(nullif(btrim(fields->>'notes'),''),s.notes),
          internal_owner_user_id=coalesce(owner_id,s.internal_owner_user_id),updated_by=actor
        where s.id=target and s.organization_id=target_organization and s.archived_at is null
          and s.updated_at=(operation->>'version')::timestamptz;
      if not found then
        raise exception 'Stale sponsor import' using errcode = '40001';
      end if;
    end if;
    if contact_name is not null and not exists (
      select 1 from public.stakeholder_contacts c where c.organization_id=target_organization
        and c.stakeholder_id=target and c.archived_at is null and lower(btrim(c.name))=lower(contact_name)
    ) then
      insert into public.stakeholder_contacts (organization_id,stakeholder_id,name,email,phone,created_by,updated_by)
        values (target_organization,target,contact_name,fields->>'email',fields->>'phone',actor,actor);
    end if;
  end loop;
  return jsonb_array_length(operations);
end;
$$;
revoke all on function public.apply_sponsor_import(uuid,jsonb) from public, anon;
grant execute on function public.apply_sponsor_import(uuid,jsonb) to authenticated;
