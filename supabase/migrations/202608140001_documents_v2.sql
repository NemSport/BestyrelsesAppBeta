create type public.document_relation_type as enum (
  'organization',
  'committee',
  'meeting',
  'agenda_item',
  'task',
  'annual_wheel_event'
);

create table public.document_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (char_length(description) <= 500),
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index document_categories_org_name_unique
on public.document_categories (organization_id, lower(name));

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.document_categories(id) on delete set null,
  primary_committee_id uuid references public.committees(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  description text check (char_length(description) <= 4000),
  current_version_number integer not null default 0 check (current_version_number >= 0),
  uploaded_by uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  legacy_source_type text check (legacy_source_type in ('meeting_attachment', 'agenda_attachment')),
  legacy_source_id uuid,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((legacy_source_type is null) = (legacy_source_id is null))
);

create unique index documents_legacy_source_unique
on public.documents (legacy_source_type, legacy_source_id)
where legacy_source_id is not null;

create index documents_org_updated_idx
on public.documents (organization_id, updated_at desc)
where deleted_at is null;

create index documents_category_idx
on public.documents (organization_id, category_id)
where deleted_at is null;

create index documents_committee_idx
on public.documents (organization_id, primary_committee_id)
where deleted_at is null;

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_bucket text not null check (storage_bucket in ('organization-documents', 'meeting-minute-attachments')),
  storage_path text not null,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 240),
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (storage_bucket, storage_path)
);

create index document_versions_document_idx
on public.document_versions (document_id, version_number desc);

create table public.document_relations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  relation_type public.document_relation_type not null,
  committee_id uuid references public.committees(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  agenda_item_id uuid references public.agenda_items(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  annual_wheel_event_id uuid references public.annual_wheel_events(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (relation_type = 'organization' and num_nonnulls(committee_id, meeting_id, agenda_item_id, task_id, annual_wheel_event_id) = 0)
    or (relation_type = 'committee' and committee_id is not null and num_nonnulls(meeting_id, agenda_item_id, task_id, annual_wheel_event_id) = 0)
    or (relation_type = 'meeting' and meeting_id is not null and num_nonnulls(committee_id, agenda_item_id, task_id, annual_wheel_event_id) = 0)
    or (relation_type = 'agenda_item' and agenda_item_id is not null and num_nonnulls(committee_id, meeting_id, task_id, annual_wheel_event_id) = 0)
    or (relation_type = 'task' and task_id is not null and num_nonnulls(committee_id, meeting_id, agenda_item_id, annual_wheel_event_id) = 0)
    or (relation_type = 'annual_wheel_event' and annual_wheel_event_id is not null and num_nonnulls(committee_id, meeting_id, agenda_item_id, task_id) = 0)
  )
);

create unique index document_relations_organization_unique
on public.document_relations (document_id) where relation_type = 'organization';
create unique index document_relations_committee_unique
on public.document_relations (document_id, committee_id) where relation_type = 'committee';
create unique index document_relations_meeting_unique
on public.document_relations (document_id, meeting_id) where relation_type = 'meeting';
create unique index document_relations_agenda_unique
on public.document_relations (document_id, agenda_item_id) where relation_type = 'agenda_item';
create unique index document_relations_task_unique
on public.document_relations (document_id, task_id) where relation_type = 'task';
create unique index document_relations_annual_unique
on public.document_relations (document_id, annual_wheel_event_id) where relation_type = 'annual_wheel_event';
create index document_relations_document_idx on public.document_relations (document_id, created_at);

create trigger document_categories_set_updated_at
before update on public.document_categories
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create or replace function public.protect_document_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id
    or new.uploaded_by <> old.uploaded_by
    or new.created_by <> old.created_by
    or new.legacy_source_type is distinct from old.legacy_source_type
    or new.legacy_source_id is distinct from old.legacy_source_id then
    raise exception 'Dokumentets tenant- og kildeidentitet kan ikke ændres.';
  end if;
  return new;
end;
$$;
create trigger documents_protect_identity
before update on public.documents
for each row execute function public.protect_document_identity();

create or replace function public.validate_document_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  document_organization_id uuid;
begin
  if tg_table_name = 'documents' then
    if new.category_id is not null and not exists (
      select 1 from public.document_categories c
      where c.id = new.category_id and c.organization_id = new.organization_id
    ) then
      raise exception 'Dokumentkategorien tilhører en anden organisation.';
    end if;
    if new.primary_committee_id is not null and not exists (
      select 1 from public.committees c
      where c.id = new.primary_committee_id and c.organization_id = new.organization_id
    ) then
      raise exception 'Dokumentudvalget tilhører en anden organisation.';
    end if;
    return new;
  end if;

  select d.organization_id into document_organization_id
  from public.documents d where d.id = new.document_id;
  if document_organization_id is null or document_organization_id <> new.organization_id then
    raise exception 'Dokumentrelationen krydser organisation.';
  end if;

  if tg_table_name = 'document_versions' then
    return new;
  end if;

  if new.relation_type = 'committee' and not exists (
    select 1 from public.committees c where c.id = new.committee_id and c.organization_id = new.organization_id
  ) then raise exception 'Udvalgsrelationen krydser organisation.';
  elsif new.relation_type = 'meeting' and not exists (
    select 1 from public.meetings m where m.id = new.meeting_id and m.organization_id = new.organization_id
  ) then raise exception 'Møderelationen krydser organisation.';
  elsif new.relation_type = 'agenda_item' and not exists (
    select 1 from public.agenda_items a where a.id = new.agenda_item_id and a.organization_id = new.organization_id
  ) then raise exception 'Dagsordensrelationen krydser organisation.';
  elsif new.relation_type = 'task' and not exists (
    select 1 from public.tasks t where t.id = new.task_id and t.organization_id = new.organization_id
  ) then raise exception 'Opgaverelationen krydser organisation.';
  elsif new.relation_type = 'annual_wheel_event' and not exists (
    select 1 from public.annual_wheel_events e where e.id = new.annual_wheel_event_id and e.organization_id = new.organization_id
  ) then raise exception 'Årshjulsrelationen krydser organisation.';
  end if;
  return new;
end;
$$;

create trigger documents_validate_scope
before insert or update on public.documents
for each row execute function public.validate_document_scope();
create trigger document_versions_validate_scope
before insert or update on public.document_versions
for each row execute function public.validate_document_scope();
create trigger document_relations_validate_scope
before insert or update on public.document_relations
for each row execute function public.validate_document_scope();

create or replace function public.can_mutate_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id
      and (d.uploaded_by = auth.uid() or public.is_organization_admin(d.organization_id))
  );
$$;

create or replace function public.can_read_document(target_document_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.documents;
begin
  select * into target from public.documents d
  where d.id = target_document_id and d.deleted_at is null;
  if target.id is null then return false; end if;
  if target.uploaded_by = auth.uid() or public.is_organization_admin(target.organization_id) then return true; end if;

  if target.legacy_source_type = 'meeting_attachment' then
    if exists (
      select 1 from public.meeting_minute_attachments a
      join public.meeting_minutes mm on mm.id = a.meeting_minutes_id
      where a.id = target.legacy_source_id
        and public.can_read_meeting_minutes(mm.committee_id, mm.status)
    ) then return true; end if;
  elsif target.legacy_source_type = 'agenda_attachment' then
    if exists (
      select 1 from public.agenda_item_minute_attachments a
      join public.agenda_item_minutes aim on aim.id = a.agenda_item_minutes_id
      join public.meeting_minutes mm on mm.meeting_id = aim.meeting_id
      where a.id = target.legacy_source_id
        and public.can_read_meeting_minutes(mm.committee_id, mm.status)
    ) then return true; end if;
  end if;

  return exists (
    select 1 from public.document_relations r
    where r.document_id = target.id and (
      (r.relation_type = 'organization' and public.is_organization_member(r.organization_id))
      or (r.relation_type = 'committee' and (public.is_committee_member(r.committee_id) or public.is_organization_admin(r.organization_id)))
      or (r.relation_type = 'meeting' and exists (
        select 1 from public.meetings m where m.id = r.meeting_id
          and (public.is_committee_member(m.committee_id) or public.is_organization_admin(r.organization_id))
      ))
      or (r.relation_type = 'agenda_item' and exists (
        select 1 from public.agenda_items a where a.id = r.agenda_item_id
          and (public.is_committee_member(a.committee_id) or public.is_organization_admin(r.organization_id))
      ))
      or (r.relation_type = 'task' and exists (
        select 1 from public.tasks t where t.id = r.task_id
          and (public.is_committee_member(t.committee_id) or public.is_organization_admin(r.organization_id))
      ))
      or (r.relation_type = 'annual_wheel_event' and exists (
        select 1 from public.annual_wheel_events e where e.id = r.annual_wheel_event_id
          and ((e.committee_id is null and public.is_organization_member(r.organization_id))
            or public.is_committee_member(e.committee_id)
            or public.is_organization_admin(r.organization_id))
      ))
    )
  );
end;
$$;

alter table public.document_categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_relations enable row level security;

create policy document_categories_read on public.document_categories for select to authenticated
using (public.is_organization_member(organization_id));
create policy document_categories_admin_insert on public.document_categories for insert to authenticated
with check (public.is_organization_admin(organization_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy document_categories_admin_update on public.document_categories for update to authenticated
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id) and updated_by = auth.uid());
create policy documents_read on public.documents for select to authenticated
using (public.can_read_document(id));
create policy documents_insert on public.documents for insert to authenticated
with check (public.is_organization_member(organization_id) and uploaded_by = auth.uid() and created_by = auth.uid() and updated_by = auth.uid());
create policy documents_update on public.documents for update to authenticated
using (public.can_mutate_document(id))
with check (public.can_mutate_document(id) and updated_by = auth.uid());
create policy documents_delete on public.documents for delete to authenticated
using (public.can_mutate_document(id) and current_version_number = 0);

create policy document_versions_read on public.document_versions for select to authenticated
using (public.can_read_document(document_id));
create policy document_versions_insert on public.document_versions for insert to authenticated
with check (public.can_mutate_document(document_id) and uploaded_by = auth.uid());

create policy document_relations_read on public.document_relations for select to authenticated
using (public.can_read_document(document_id));
create policy document_relations_insert on public.document_relations for insert to authenticated
with check (public.can_mutate_document(document_id) and created_by = auth.uid());
create policy document_relations_delete on public.document_relations for delete to authenticated
using (public.can_mutate_document(document_id));

insert into public.document_categories (organization_id, name, is_system)
select o.id, category.name, true
from public.organizations o
cross join (values
  ('Vedtægter'), ('Politikker'), ('Forretningsordener'), ('Økonomi'),
  ('Kontrakter'), ('Sponsorater'), ('Referencer / vejledninger'),
  ('Skabeloner'), ('Strategi'), ('Diverse')
) as category(name)
on conflict do nothing;

create or replace function public.seed_document_categories()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.document_categories (organization_id, name, is_system)
  values
    (new.id, 'Vedtægter', true), (new.id, 'Politikker', true),
    (new.id, 'Forretningsordener', true), (new.id, 'Økonomi', true),
    (new.id, 'Kontrakter', true), (new.id, 'Sponsorater', true),
    (new.id, 'Referencer / vejledninger', true), (new.id, 'Skabeloner', true),
    (new.id, 'Strategi', true), (new.id, 'Diverse', true)
  on conflict do nothing;
  return new;
end;
$$;
create trigger organizations_seed_document_categories
after insert on public.organizations
for each row execute function public.seed_document_categories();

insert into public.documents (
  id, organization_id, primary_committee_id, name, current_version_number,
  uploaded_by, created_by, updated_by, legacy_source_type, legacy_source_id,
  created_at, updated_at
)
select a.id, a.organization_id, a.committee_id,
  regexp_replace(a.file_name, '\.[^.]+$', ''), 1,
  a.uploaded_by, a.created_by, a.updated_by, 'meeting_attachment', a.id,
  a.created_at, a.updated_at
from public.meeting_minute_attachments a
on conflict do nothing;

insert into public.document_versions (
  organization_id, document_id, version_number, storage_bucket, storage_path,
  file_name, mime_type, file_size, uploaded_by, created_at
)
select a.organization_id, a.id, 1, 'meeting-minute-attachments', a.storage_path,
  a.file_name, a.mime_type, a.file_size, a.uploaded_by, a.created_at
from public.meeting_minute_attachments a
on conflict do nothing;

insert into public.document_relations (
  organization_id, document_id, relation_type, meeting_id, created_by, created_at
)
select a.organization_id, a.id, 'meeting', a.meeting_id, a.created_by, a.created_at
from public.meeting_minute_attachments a
on conflict do nothing;

insert into public.documents (
  id, organization_id, primary_committee_id, name, current_version_number,
  uploaded_by, created_by, updated_by, legacy_source_type, legacy_source_id,
  created_at, updated_at
)
select a.id, a.organization_id, a.committee_id,
  regexp_replace(a.file_name, '\.[^.]+$', ''), 1,
  a.uploaded_by, a.created_by, a.updated_by, 'agenda_attachment', a.id,
  a.created_at, a.updated_at
from public.agenda_item_minute_attachments a
on conflict do nothing;

insert into public.document_versions (
  organization_id, document_id, version_number, storage_bucket, storage_path,
  file_name, mime_type, file_size, uploaded_by, created_at
)
select a.organization_id, a.id, 1, 'meeting-minute-attachments', a.storage_path,
  a.file_name, a.mime_type, a.file_size, a.uploaded_by, a.created_at
from public.agenda_item_minute_attachments a
on conflict do nothing;

insert into public.document_relations (
  organization_id, document_id, relation_type, agenda_item_id, created_by, created_at
)
select a.organization_id, a.id, 'agenda_item', a.agenda_item_id, a.created_by, a.created_at
from public.agenda_item_minute_attachments a
on conflict do nothing;

create or replace function public.mirror_minutes_attachment_to_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare source_type text; relation_kind public.document_relation_type;
begin
  source_type := case when tg_table_name = 'meeting_minute_attachments' then 'meeting_attachment' else 'agenda_attachment' end;
  relation_kind := case when tg_table_name = 'meeting_minute_attachments' then 'meeting'::public.document_relation_type else 'agenda_item'::public.document_relation_type end;
  insert into public.documents (
    id, organization_id, primary_committee_id, name, current_version_number,
    uploaded_by, created_by, updated_by, legacy_source_type, legacy_source_id,
    created_at, updated_at
  ) values (
    new.id, new.organization_id, new.committee_id,
    regexp_replace(new.file_name, '\.[^.]+$', ''), 1,
    new.uploaded_by, new.created_by, new.updated_by, source_type, new.id,
    new.created_at, new.updated_at
  ) on conflict do nothing;
  insert into public.document_versions (
    organization_id, document_id, version_number, storage_bucket, storage_path,
    file_name, mime_type, file_size, uploaded_by, created_at
  ) values (
    new.organization_id, new.id, 1, 'meeting-minute-attachments', new.storage_path,
    new.file_name, new.mime_type, new.file_size, new.uploaded_by, new.created_at
  ) on conflict do nothing;
  if relation_kind = 'meeting' then
    insert into public.document_relations (organization_id, document_id, relation_type, meeting_id, created_by, created_at)
    values (new.organization_id, new.id, relation_kind, new.meeting_id, new.created_by, new.created_at)
    on conflict do nothing;
  else
    insert into public.document_relations (organization_id, document_id, relation_type, agenda_item_id, created_by, created_at)
    values (new.organization_id, new.id, relation_kind, new.agenda_item_id, new.created_by, new.created_at)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger meeting_attachments_mirror_document
after insert on public.meeting_minute_attachments
for each row execute function public.mirror_minutes_attachment_to_document();
create trigger agenda_attachments_mirror_document
after insert on public.agenda_item_minute_attachments
for each row execute function public.mirror_minutes_attachment_to_document();

-- Removing a legacy attachment only removes its context relation. The central
-- document and immutable storage object remain available in the archive.
create or replace function public.unlink_deleted_minutes_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'meeting_minute_attachments' then
    delete from public.document_relations
    where document_id = old.id and relation_type = 'meeting' and meeting_id = old.meeting_id;
  else
    delete from public.document_relations
    where document_id = old.id and relation_type = 'agenda_item' and agenda_item_id = old.agenda_item_id;
  end if;
  return old;
end;
$$;
create trigger meeting_attachments_unlink_document
after delete on public.meeting_minute_attachments
for each row execute function public.unlink_deleted_minutes_attachment();
create trigger agenda_attachments_unlink_document
after delete on public.agenda_item_minute_attachments
for each row execute function public.unlink_deleted_minutes_attachment();

create or replace function public.remove_deleted_document_legacy_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    if new.legacy_source_type = 'meeting_attachment' then
      delete from public.meeting_minute_attachments where id = new.legacy_source_id;
    elsif new.legacy_source_type = 'agenda_attachment' then
      delete from public.agenda_item_minute_attachments where id = new.legacy_source_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger documents_remove_deleted_legacy_context
after update of deleted_at on public.documents
for each row execute function public.remove_deleted_document_legacy_context();

-- Upload is deliberately broader than attachment administration: committee
-- members may add files in their scope while deletion stays manager-only.
drop policy if exists meeting_minute_attachments_insert_manager on public.meeting_minute_attachments;
create policy meeting_minute_attachments_insert_member on public.meeting_minute_attachments
for insert to authenticated with check (
  (public.is_committee_member(committee_id) or public.is_organization_admin(organization_id))
  and uploaded_by = auth.uid() and created_by = auth.uid() and updated_by = auth.uid()
);
drop policy if exists agenda_item_minute_attachments_insert_manager on public.agenda_item_minute_attachments;
create policy agenda_item_minute_attachments_insert_member on public.agenda_item_minute_attachments
for insert to authenticated with check (
  (public.is_committee_member(committee_id) or public.is_organization_admin(organization_id))
  and uploaded_by = auth.uid() and created_by = auth.uid() and updated_by = auth.uid()
);

create or replace function public.can_upload_minutes_storage_path(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare folders text[];
begin
  folders := storage.foldername(object_name);
  return array_length(folders, 1) >= 3
    and (public.is_committee_member(folders[2]::uuid) or public.is_organization_admin(folders[1]::uuid));
exception when others then return false;
end;
$$;
drop policy if exists minutes_storage_insert_manager on storage.objects;
create policy minutes_storage_insert_member on storage.objects for insert to authenticated
with check (bucket_id = 'meeting-minute-attachments' and public.can_upload_minutes_storage_path(name));

create or replace function public.add_document_version(
  target_document_id uuid, target_storage_bucket text, target_storage_path text,
  target_file_name text, target_mime_type text, target_file_size bigint
)
returns public.document_versions
language plpgsql security invoker set search_path = '' as $$
declare target public.documents; result public.document_versions; next_version integer;
begin
  select * into target from public.documents where id = target_document_id for update;
  if target.id is null or not public.can_mutate_document(target.id) then
    raise exception 'Du har ikke adgang til at erstatte dokumentet.';
  end if;
  next_version := target.current_version_number + 1;
  insert into public.document_versions (
    organization_id, document_id, version_number, storage_bucket, storage_path,
    file_name, mime_type, file_size, uploaded_by
  ) values (
    target.organization_id, target.id, next_version, target_storage_bucket,
    target_storage_path, target_file_name, target_mime_type, target_file_size, auth.uid()
  ) returning * into result;
  update public.documents set current_version_number = next_version, updated_by = auth.uid()
  where id = target.id;
  return result;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('organization-documents', 'organization-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.can_insert_document_storage_path(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare folders text[];
begin
  folders := storage.foldername(object_name);
  return array_length(folders, 1) >= 3
    and exists (
      select 1 from public.documents d
      where d.id = folders[3]::uuid
        and d.organization_id = folders[1]::uuid
        and public.can_mutate_document(d.id)
    );
exception when others then return false;
end;
$$;

create or replace function public.can_read_document_storage_path(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare folders text[];
begin
  folders := storage.foldername(object_name);
  return array_length(folders, 1) >= 3 and public.can_read_document(folders[3]::uuid);
exception when others then return false;
end;
$$;

create or replace function public.can_mutate_document_storage_path(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare folders text[];
begin
  folders := storage.foldername(object_name);
  return array_length(folders, 1) >= 3 and public.can_mutate_document(folders[3]::uuid);
exception when others then return false;
end;
$$;

create policy document_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'organization-documents' and public.can_insert_document_storage_path(name));
create policy document_storage_select on storage.objects for select to authenticated
using (bucket_id = 'organization-documents' and public.can_read_document_storage_path(name));
create policy document_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'organization-documents' and public.can_mutate_document_storage_path(name));

grant select, insert, update on public.document_categories to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert on public.document_versions to authenticated;
grant select, insert, delete on public.document_relations to authenticated;
grant execute on function public.add_document_version(uuid, text, text, text, text, bigint) to authenticated;
grant execute on function public.can_upload_minutes_storage_path(text) to authenticated;
revoke all on function public.can_read_document(uuid) from public, anon;
revoke all on function public.can_mutate_document(uuid) from public, anon;
revoke all on function public.can_upload_minutes_storage_path(text) from public, anon;
revoke all on function public.can_insert_document_storage_path(text) from public, anon;
revoke all on function public.can_read_document_storage_path(text) from public, anon;
revoke all on function public.can_mutate_document_storage_path(text) from public, anon;
grant execute on function public.can_read_document(uuid) to authenticated;
grant execute on function public.can_mutate_document(uuid) to authenticated;
grant execute on function public.can_upload_minutes_storage_path(text) to authenticated;
grant execute on function public.can_insert_document_storage_path(text) to authenticated;
grant execute on function public.can_read_document_storage_path(text) to authenticated;
grant execute on function public.can_mutate_document_storage_path(text) to authenticated;
