alter type public.document_relation_type add value if not exists 'stakeholder';
alter type public.document_relation_type add value if not exists 'stakeholder_contract';

create type public.stakeholder_type as enum (
  'sponsor', 'supplier', 'partner', 'other'
);

create type public.stakeholder_relationship_status as enum (
  'lead', 'active', 'inactive', 'ended'
);

create type public.stakeholder_contract_status as enum (
  'draft', 'active', 'expired', 'terminated'
);

create type public.stakeholder_activity_type as enum (
  'note', 'phone_call', 'email', 'meeting', 'follow_up',
  'contract_event', 'pipeline_change'
);

create type public.stakeholder_pipeline_stage as enum (
  'lead', 'contacted', 'dialogue', 'proposal_sent', 'won', 'lost'
);

create table public.stakeholders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 180),
  stakeholder_type public.stakeholder_type not null,
  relationship_status public.stakeholder_relationship_status not null default 'lead',
  internal_owner_user_id uuid references public.profiles(id) on delete set null,
  website text check (website is null or char_length(website) <= 300),
  phone text check (phone is null or char_length(phone) <= 80),
  email text check (email is null or char_length(email) <= 254),
  cvr_number text check (cvr_number is null or char_length(cvr_number) <= 32),
  address_line text check (address_line is null or char_length(address_line) <= 240),
  postal_code text check (postal_code is null or char_length(postal_code) <= 24),
  city text check (city is null or char_length(city) <= 120),
  country text check (country is null or char_length(country) <= 80),
  notes text check (notes is null or char_length(notes) <= 10000),
  next_follow_up_at timestamptz,
  next_follow_up_note text check (next_follow_up_note is null or char_length(next_follow_up_note) <= 500),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.stakeholder_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stakeholder_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  job_title text check (job_title is null or char_length(job_title) <= 160),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 80),
  is_primary boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, stakeholder_id)
    references public.stakeholders(organization_id, id) on delete cascade,
  unique (organization_id, id)
);

create unique index stakeholder_contacts_one_primary_idx
on public.stakeholder_contacts (stakeholder_id)
where is_primary and archived_at is null;

create table public.stakeholder_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stakeholder_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  status public.stakeholder_contract_status not null default 'draft',
  contract_value numeric(14, 2) check (contract_value is null or contract_value >= 0),
  annual_value numeric(14, 2) check (annual_value is null or annual_value >= 0),
  currency char(3) not null default 'DKK' check (currency = upper(currency)),
  start_date date not null,
  end_date date,
  notice_deadline date,
  renewal_deadline date,
  auto_renew boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 10000),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, stakeholder_id)
    references public.stakeholders(organization_id, id) on delete cascade,
  unique (organization_id, id),
  check (end_date is null or end_date >= start_date),
  check (notice_deadline is null or notice_deadline >= start_date),
  check (renewal_deadline is null or renewal_deadline >= start_date),
  check (end_date is null or notice_deadline is null or notice_deadline <= end_date),
  check (end_date is null or renewal_deadline is null or renewal_deadline <= end_date)
);

create table public.stakeholder_contract_deliverables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null,
  deliverable_type text not null check (char_length(btrim(deliverable_type)) between 2 and 80),
  title text not null check (char_length(btrim(title)) between 2 and 180),
  description text check (description is null or char_length(description) <= 2000),
  quantity_details text check (quantity_details is null or char_length(quantity_details) <= 500),
  fulfillment_status text not null default 'planned'
    check (fulfillment_status in ('planned', 'in_progress', 'fulfilled', 'not_applicable')),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, contract_id)
    references public.stakeholder_contracts(organization_id, id) on delete cascade
);

create table public.stakeholder_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stakeholder_id uuid not null,
  activity_type public.stakeholder_activity_type not null,
  activity_source text not null default 'manual'
    check (activity_source in ('manual', 'system')),
  title text not null check (char_length(btrim(title)) between 2 and 180),
  description text check (description is null or char_length(description) <= 5000),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  contact_id uuid,
  contract_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, stakeholder_id)
    references public.stakeholders(organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id)
    references public.stakeholder_contacts(organization_id, id) on delete set null,
  foreign key (organization_id, contract_id)
    references public.stakeholder_contracts(organization_id, id) on delete set null
);

create table public.stakeholder_pipeline_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stakeholder_id uuid not null,
  pipeline_type text not null default 'sponsor' check (pipeline_type in ('sponsor')),
  stage public.stakeholder_pipeline_stage not null default 'lead',
  internal_owner_user_id uuid references public.profiles(id) on delete set null,
  estimated_value numeric(14, 2) check (estimated_value is null or estimated_value >= 0),
  currency char(3) not null default 'DKK' check (currency = upper(currency)),
  next_follow_up_at timestamptz,
  next_follow_up_note text check (next_follow_up_note is null or char_length(next_follow_up_note) <= 500),
  last_contact_at timestamptz,
  lost_reason text check (lost_reason is null or char_length(lost_reason) <= 1000),
  closed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, stakeholder_id)
    references public.stakeholders(organization_id, id) on delete cascade,
  unique (organization_id, id),
  check ((stage in ('won', 'lost')) = (closed_at is not null)),
  check (stage = 'lost' or lost_reason is null)
);

create unique index stakeholder_pipeline_one_open_idx
on public.stakeholder_pipeline_entries (stakeholder_id, pipeline_type)
where closed_at is null;

create table public.stakeholder_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_entry_id uuid not null,
  from_stage public.stakeholder_pipeline_stage,
  to_stage public.stakeholder_pipeline_stage not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  foreign key (organization_id, pipeline_entry_id)
    references public.stakeholder_pipeline_entries(organization_id, id) on delete cascade
);

create index stakeholders_org_name_idx on public.stakeholders (organization_id, name)
where archived_at is null;
create index stakeholders_org_type_status_idx
on public.stakeholders (organization_id, stakeholder_type, relationship_status)
where archived_at is null;
create index stakeholders_owner_idx
on public.stakeholders (organization_id, internal_owner_user_id)
where archived_at is null;
create index stakeholder_contacts_parent_idx
on public.stakeholder_contacts (stakeholder_id, name) where archived_at is null;
create index stakeholder_contracts_parent_idx
on public.stakeholder_contracts (stakeholder_id, status) where archived_at is null;
create index stakeholder_contracts_deadlines_idx
on public.stakeholder_contracts (organization_id, notice_deadline, renewal_deadline, end_date)
where archived_at is null and status = 'active';
create index stakeholder_deliverables_contract_idx
on public.stakeholder_contract_deliverables (contract_id) where archived_at is null;
create index stakeholder_activities_parent_idx
on public.stakeholder_activities (stakeholder_id, occurred_at desc);
create index stakeholder_pipeline_board_idx
on public.stakeholder_pipeline_entries (organization_id, stage, updated_at desc);
create index stakeholder_pipeline_owner_followup_idx
on public.stakeholder_pipeline_entries (organization_id, internal_owner_user_id, next_follow_up_at)
where closed_at is null;
create index stakeholder_pipeline_events_entry_idx
on public.stakeholder_pipeline_events (pipeline_entry_id, changed_at desc);

create or replace function public.can_manage_stakeholder_data(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.validate_stakeholder_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_stakeholder_id uuid;
begin
  if tg_table_name = 'stakeholders' then
    if new.internal_owner_user_id is not null and not exists (
      select 1 from public.organization_members om
      where om.organization_id = new.organization_id
        and om.user_id = new.internal_owner_user_id
        and om.status = 'active'
    ) then raise exception 'Den interne ansvarlige skal være et aktivt medlem af organisationen.';
    end if;
    if tg_op = 'UPDATE' and new.archived_at is distinct from old.archived_at
      and not public.is_organization_admin(new.organization_id) then
      raise exception 'Kun ejere og administratorer kan ændre interessentens arkivstatus.';
    end if;
    return new;
  end if;

  if tg_table_name = 'stakeholder_pipeline_entries' then
    if new.internal_owner_user_id is not null and not exists (
      select 1 from public.organization_members om
      where om.organization_id = new.organization_id
        and om.user_id = new.internal_owner_user_id
        and om.status = 'active'
    ) then raise exception 'Pipeline-ansvarlig skal være et aktivt medlem af organisationen.';
    end if;
    if tg_op = 'UPDATE' and new.stage is distinct from old.stage
      and coalesce(current_setting('app.pipeline_stage_change', true), '') <> 'allowed' then
      raise exception 'Pipeline-fase skal ændres gennem det atomiske workflow.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.ensure_single_primary_stakeholder_contact()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.is_primary and new.archived_at is null then
    update public.stakeholder_contacts
    set is_primary = false, updated_by = auth.uid(), updated_at = now()
    where stakeholder_id = new.stakeholder_id and id <> new.id and is_primary;
  end if;
  return new;
end;
$$;

create or replace function public.validate_stakeholder_activity_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.contact_id is not null and not exists (
    select 1
    from public.stakeholder_contacts contact
    where contact.id = new.contact_id
      and contact.organization_id = new.organization_id
      and contact.stakeholder_id = new.stakeholder_id
  ) then
    raise exception 'Aktivitetens kontakt skal tilhøre interessenten.';
  end if;

  if new.contract_id is not null and not exists (
    select 1
    from public.stakeholder_contracts contract
    where contract.id = new.contract_id
      and contract.organization_id = new.organization_id
      and contract.stakeholder_id = new.stakeholder_id
  ) then
    raise exception 'Aktivitetens kontrakt skal tilhøre interessenten.';
  end if;

  return new;
end;
$$;

create trigger stakeholders_validate_scope before insert or update on public.stakeholders
for each row execute function public.validate_stakeholder_scope();
create trigger stakeholder_pipeline_validate_scope before insert or update on public.stakeholder_pipeline_entries
for each row execute function public.validate_stakeholder_scope();
create trigger stakeholder_contacts_primary before insert or update on public.stakeholder_contacts
for each row execute function public.ensure_single_primary_stakeholder_contact();
create trigger stakeholder_activities_validate_scope before insert or update on public.stakeholder_activities
for each row execute function public.validate_stakeholder_activity_scope();

create trigger stakeholders_set_updated_at before update on public.stakeholders
for each row execute function public.set_updated_at();
create trigger stakeholder_contacts_set_updated_at before update on public.stakeholder_contacts
for each row execute function public.set_updated_at();
create trigger stakeholder_contracts_set_updated_at before update on public.stakeholder_contracts
for each row execute function public.set_updated_at();
create trigger stakeholder_deliverables_set_updated_at before update on public.stakeholder_contract_deliverables
for each row execute function public.set_updated_at();
create trigger stakeholder_activities_set_updated_at before update on public.stakeholder_activities
for each row execute function public.set_updated_at();
create trigger stakeholder_pipeline_set_updated_at before update on public.stakeholder_pipeline_entries
for each row execute function public.set_updated_at();

create or replace function public.update_stakeholder_pipeline_stage(
  target_organization_id uuid,
  target_pipeline_entry_id uuid,
  target_stage public.stakeholder_pipeline_stage,
  target_lost_reason text default null
)
returns public.stakeholder_pipeline_entries
language plpgsql security definer set search_path = '' as $$
declare current_entry public.stakeholder_pipeline_entries;
declare updated_entry public.stakeholder_pipeline_entries;
begin
  if not public.can_manage_stakeholder_data(target_organization_id) then
    raise exception 'Du har ikke adgang til at ændre sponsor-pipelinen.';
  end if;
  select * into current_entry from public.stakeholder_pipeline_entries
  where id = target_pipeline_entry_id and organization_id = target_organization_id
  for update;
  if current_entry.id is null then raise exception 'Pipelinekortet findes ikke.'; end if;
  if target_stage = current_entry.stage then return current_entry; end if;
  if target_stage = 'lost' and nullif(btrim(target_lost_reason), '') is null then
    raise exception 'Angiv hvorfor sponsorleadet blev tabt.';
  end if;

  perform set_config('app.pipeline_stage_change', 'allowed', true);
  update public.stakeholder_pipeline_entries set
    stage = target_stage,
    lost_reason = case when target_stage = 'lost' then btrim(target_lost_reason) else null end,
    closed_at = case when target_stage in ('won', 'lost') then now() else null end,
    updated_by = auth.uid()
  where id = current_entry.id returning * into updated_entry;

  insert into public.stakeholder_pipeline_events (
    organization_id, pipeline_entry_id, from_stage, to_stage, changed_by
  ) values (
    target_organization_id, current_entry.id, current_entry.stage, target_stage, auth.uid()
  );
  insert into public.stakeholder_activities (
    organization_id, stakeholder_id, activity_type, activity_source,
    title, description, occurred_at, created_by
  ) values (
    target_organization_id, current_entry.stakeholder_id, 'pipeline_change', 'system',
    'Pipeline ændret', current_entry.stage::text || ' → ' || target_stage::text,
    now(), auth.uid()
  );
  return updated_entry;
end;
$$;

create or replace function public.record_initial_stakeholder_pipeline_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stakeholder_pipeline_events (
    organization_id, pipeline_entry_id, from_stage, to_stage, changed_by
  ) values (new.organization_id, new.id, null, new.stage, new.created_by);
  insert into public.stakeholder_activities (
    organization_id, stakeholder_id, activity_type, activity_source,
    title, description, occurred_at, created_by
  ) values (
    new.organization_id, new.stakeholder_id, 'pipeline_change', 'system',
    'Tilføjet til sponsor-pipeline', new.stage::text, now(), new.created_by
  );
  return new;
end;
$$;

create trigger stakeholder_pipeline_record_initial_stage
after insert on public.stakeholder_pipeline_entries
for each row execute function public.record_initial_stakeholder_pipeline_stage();

alter table public.stakeholders enable row level security;
alter table public.stakeholder_contacts enable row level security;
alter table public.stakeholder_contracts enable row level security;
alter table public.stakeholder_contract_deliverables enable row level security;
alter table public.stakeholder_activities enable row level security;
alter table public.stakeholder_pipeline_entries enable row level security;
alter table public.stakeholder_pipeline_events enable row level security;

create policy stakeholders_read on public.stakeholders for select to authenticated
using (public.is_organization_member(organization_id));
create policy stakeholders_insert on public.stakeholders for insert to authenticated
with check (public.can_manage_stakeholder_data(organization_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy stakeholders_update on public.stakeholders for update to authenticated
using (public.can_manage_stakeholder_data(organization_id))
with check (public.can_manage_stakeholder_data(organization_id) and updated_by = auth.uid());

create policy stakeholder_contacts_read on public.stakeholder_contacts for select to authenticated
using (public.is_organization_member(organization_id));
create policy stakeholder_contacts_insert on public.stakeholder_contacts for insert to authenticated
with check (public.can_manage_stakeholder_data(organization_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy stakeholder_contacts_update on public.stakeholder_contacts for update to authenticated
using (public.can_manage_stakeholder_data(organization_id))
with check (public.can_manage_stakeholder_data(organization_id) and updated_by = auth.uid());

create policy stakeholder_contracts_read on public.stakeholder_contracts for select to authenticated
using (public.is_organization_member(organization_id));
create policy stakeholder_contracts_insert on public.stakeholder_contracts for insert to authenticated
with check (public.can_manage_stakeholder_data(organization_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy stakeholder_contracts_update on public.stakeholder_contracts for update to authenticated
using (public.can_manage_stakeholder_data(organization_id))
with check (public.can_manage_stakeholder_data(organization_id) and updated_by = auth.uid());

create policy stakeholder_deliverables_read on public.stakeholder_contract_deliverables for select to authenticated
using (public.is_organization_member(organization_id));
create policy stakeholder_deliverables_insert on public.stakeholder_contract_deliverables for insert to authenticated
with check (public.can_manage_stakeholder_data(organization_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy stakeholder_deliverables_update on public.stakeholder_contract_deliverables for update to authenticated
using (public.can_manage_stakeholder_data(organization_id))
with check (public.can_manage_stakeholder_data(organization_id) and updated_by = auth.uid());

create policy stakeholder_activities_read on public.stakeholder_activities for select to authenticated
using (public.is_organization_member(organization_id));
create policy stakeholder_activities_insert on public.stakeholder_activities for insert to authenticated
with check (public.can_manage_stakeholder_data(organization_id) and created_by = auth.uid() and activity_source = 'manual');

create policy stakeholder_pipeline_read on public.stakeholder_pipeline_entries for select to authenticated
using (public.is_organization_member(organization_id));
create policy stakeholder_pipeline_insert on public.stakeholder_pipeline_entries for insert to authenticated
with check (public.can_manage_stakeholder_data(organization_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy stakeholder_pipeline_update on public.stakeholder_pipeline_entries for update to authenticated
using (public.can_manage_stakeholder_data(organization_id))
with check (public.can_manage_stakeholder_data(organization_id) and updated_by = auth.uid());
create policy stakeholder_pipeline_events_read on public.stakeholder_pipeline_events for select to authenticated
using (public.is_organization_member(organization_id));

grant select, insert, update on public.stakeholders to authenticated;
grant select, insert, update on public.stakeholder_contacts to authenticated;
grant select, insert, update on public.stakeholder_contracts to authenticated;
grant select, insert, update on public.stakeholder_contract_deliverables to authenticated;
grant select, insert on public.stakeholder_activities to authenticated;
grant select, insert, update on public.stakeholder_pipeline_entries to authenticated;
grant select on public.stakeholder_pipeline_events to authenticated;
revoke all on function public.can_manage_stakeholder_data(uuid) from public, anon;
grant execute on function public.can_manage_stakeholder_data(uuid) to authenticated;
revoke all on function public.update_stakeholder_pipeline_stage(uuid, uuid, public.stakeholder_pipeline_stage, text) from public, anon;
grant execute on function public.update_stakeholder_pipeline_stage(uuid, uuid, public.stakeholder_pipeline_stage, text) to authenticated;
