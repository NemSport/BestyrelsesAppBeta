create type public.meeting_minute_approval_status as enum (
  'pending',
  'approved',
  'change_requested',
  'no_response'
);

alter table public.meeting_minutes
add column approval_deadline date;

create table public.meeting_minute_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  meeting_minutes_id uuid not null references public.meeting_minutes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.meeting_minute_approval_status not null default 'pending',
  comment text,
  responded_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_minutes_id, user_id)
);

create table public.meeting_minute_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  meeting_minutes_id uuid not null references public.meeting_minutes(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agenda_item_minute_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  agenda_item_minutes_id uuid not null references public.agenda_item_minutes(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meeting_minute_approvals_minutes_status_idx
on public.meeting_minute_approvals (meeting_minutes_id, status);

create index meeting_minute_approvals_user_idx
on public.meeting_minute_approvals (user_id, status);

create index meeting_minute_attachments_minutes_idx
on public.meeting_minute_attachments (meeting_minutes_id, created_at);

create index agenda_item_minute_attachments_minutes_idx
on public.agenda_item_minute_attachments (agenda_item_minutes_id, created_at);

create trigger meeting_minute_approvals_set_updated_at
before update on public.meeting_minute_approvals
for each row execute function public.set_updated_at();

create trigger meeting_minute_attachments_set_updated_at
before update on public.meeting_minute_attachments
for each row execute function public.set_updated_at();

create trigger agenda_item_minute_attachments_set_updated_at
before update on public.agenda_item_minute_attachments
for each row execute function public.set_updated_at();

create or replace function public.can_approve_meeting_minutes(
  target_meeting_minutes_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.meeting_minutes mm
    join public.committee_members cm
      on cm.organization_id = mm.organization_id
      and cm.committee_id = mm.committee_id
      and cm.user_id = auth.uid()
    where mm.id = target_meeting_minutes_id
      and cm.status = 'active'
      and cm.voting_rights
      and cm.role in ('chair', 'secretary', 'member')
  );
$$;

create or replace function public.send_meeting_minutes_for_approval(
  target_meeting_minutes_id uuid,
  target_deadline date
)
returns public.meeting_minutes
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.meeting_minutes;
begin
  select *
  into result
  from public.meeting_minutes
  where id = target_meeting_minutes_id;

  if result.id is null then
    raise exception 'Referatet blev ikke fundet.';
  end if;

  if not public.can_manage_committee(result.committee_id) then
    raise exception 'Du har ikke adgang til at sende referatet til godkendelse.';
  end if;

  if target_deadline < current_date then
    raise exception 'Godkendelsesfristen kan ikke ligge i fortiden.';
  end if;

  update public.meeting_minutes
  set status = 'ready_for_approval',
      approval_deadline = target_deadline,
      updated_by = auth.uid()
  where id = target_meeting_minutes_id
  returning * into result;

  delete from public.meeting_minute_approvals approval
  where approval.meeting_minutes_id = target_meeting_minutes_id
    and not exists (
      select 1
      from public.committee_members cm
      where cm.organization_id = result.organization_id
        and cm.committee_id = result.committee_id
        and cm.user_id = approval.user_id
        and cm.status = 'active'
        and cm.voting_rights
        and cm.role in ('chair', 'secretary', 'member')
    );

  insert into public.meeting_minute_approvals (
    organization_id,
    committee_id,
    meeting_id,
    meeting_minutes_id,
    user_id,
    status,
    comment,
    responded_at,
    created_by,
    updated_by
  )
  select
    result.organization_id,
    result.committee_id,
    result.meeting_id,
    result.id,
    cm.user_id,
    'pending',
    null,
    null,
    auth.uid(),
    auth.uid()
  from public.committee_members cm
  where cm.organization_id = result.organization_id
    and cm.committee_id = result.committee_id
    and cm.status = 'active'
    and cm.voting_rights
    and cm.role in ('chair', 'secretary', 'member')
  on conflict (meeting_minutes_id, user_id)
  do update set
    status = 'pending',
    comment = null,
    responded_at = null,
    updated_by = auth.uid();

  if not exists (
    select 1
    from public.meeting_minute_approvals
    where meeting_minutes_id = target_meeting_minutes_id
  ) then
    raise exception 'Udvalget har ingen aktive stemmeberettigede medlemmer.';
  end if;

  return result;
end;
$$;

create or replace function public.respond_to_meeting_minutes_approval(
  target_meeting_minutes_id uuid,
  response_status public.meeting_minute_approval_status,
  response_comment text default null
)
returns public.meeting_minute_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.meeting_minute_approvals;
begin
  if response_status not in ('approved', 'change_requested') then
    raise exception 'Godkendelsessvaret er ugyldigt.';
  end if;

  if response_status = 'change_requested'
    and nullif(btrim(coalesce(response_comment, '')), '') is null then
    raise exception 'Begrundelse for ændringer skal udfyldes.';
  end if;

  if not public.can_approve_meeting_minutes(target_meeting_minutes_id) then
    raise exception 'Du har ikke adgang til at godkende dette referat.';
  end if;

  update public.meeting_minute_approvals
  set status = response_status,
      comment = case
        when response_status = 'change_requested' then btrim(response_comment)
        else null
      end,
      responded_at = now(),
      updated_by = auth.uid()
  where meeting_minutes_id = target_meeting_minutes_id
    and user_id = auth.uid()
  returning * into result;

  if result.id is null then
    raise exception 'Referatet er ikke sendt til dig til godkendelse.';
  end if;

  if response_status = 'change_requested' then
    update public.meeting_minutes
    set status = 'ready_for_approval',
        updated_by = auth.uid()
    where id = target_meeting_minutes_id;
  elsif not exists (
    select 1
    from public.meeting_minute_approvals
    where meeting_minutes_id = target_meeting_minutes_id
      and status in ('pending', 'change_requested')
  ) then
    update public.meeting_minutes
    set status = 'approved',
        updated_by = auth.uid()
    where id = target_meeting_minutes_id;
  end if;

  return result;
end;
$$;

create or replace function public.mark_missing_approval_responses(
  target_meeting_minutes_id uuid
)
returns setof public.meeting_minute_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutes_record public.meeting_minutes;
begin
  select *
  into minutes_record
  from public.meeting_minutes
  where id = target_meeting_minutes_id;

  if minutes_record.id is null then
    raise exception 'Referatet blev ikke fundet.';
  end if;

  if not public.can_manage_committee(minutes_record.committee_id) then
    raise exception 'Du har ikke adgang til at afslutte manglende svar.';
  end if;

  if minutes_record.approval_deadline is null
    or minutes_record.approval_deadline >= current_date then
    raise exception 'Godkendelsesfristen er ikke overskredet endnu.';
  end if;

  update public.meeting_minute_approvals
  set status = 'no_response',
      comment = 'Ingen respons inden frist',
      responded_at = now(),
      updated_by = auth.uid()
  where meeting_minutes_id = target_meeting_minutes_id
    and status = 'pending';

  if not exists (
    select 1
    from public.meeting_minute_approvals
    where meeting_minutes_id = target_meeting_minutes_id
      and status in ('pending', 'change_requested')
  ) then
    update public.meeting_minutes
    set status = 'approved',
        updated_by = auth.uid()
    where id = target_meeting_minutes_id;
  end if;

  return query
  select *
  from public.meeting_minute_approvals
  where meeting_minutes_id = target_meeting_minutes_id
  order by created_at;
end;
$$;

create or replace function public.validate_minutes_attachment_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'meeting_minute_attachments' then
    if not exists (
      select 1
      from public.meeting_minutes mm
      where mm.id = new.meeting_minutes_id
        and mm.organization_id = new.organization_id
        and mm.committee_id = new.committee_id
        and mm.meeting_id = new.meeting_id
    ) then
      raise exception 'Vedhæftningen matcher ikke mødereferatet.';
    end if;
  else
    if not exists (
      select 1
      from public.agenda_item_minutes aim
      where aim.id = new.agenda_item_minutes_id
        and aim.organization_id = new.organization_id
        and aim.committee_id = new.committee_id
        and aim.meeting_id = new.meeting_id
        and aim.agenda_item_id = new.agenda_item_id
    ) then
      raise exception 'Vedhæftningen matcher ikke punktreferatet.';
    end if;
  end if;

  return new;
end;
$$;

create trigger meeting_minute_attachments_validate_scope
before insert or update on public.meeting_minute_attachments
for each row execute function public.validate_minutes_attachment_scope();

create trigger agenda_item_minute_attachments_validate_scope
before insert or update on public.agenda_item_minute_attachments
for each row execute function public.validate_minutes_attachment_scope();

alter table public.meeting_minute_approvals enable row level security;
alter table public.meeting_minute_attachments enable row level security;
alter table public.agenda_item_minute_attachments enable row level security;

create policy meeting_minute_approvals_select_authorized
on public.meeting_minute_approvals
for select
to authenticated
using (
  exists (
    select 1
    from public.meeting_minutes mm
    where mm.id = meeting_minutes_id
      and public.can_read_meeting_minutes(mm.committee_id, mm.status)
  )
);

create policy meeting_minute_attachments_select_authorized
on public.meeting_minute_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.meeting_minutes mm
    where mm.id = meeting_minutes_id
      and public.can_read_meeting_minutes(mm.committee_id, mm.status)
  )
);

create policy meeting_minute_attachments_insert_manager
on public.meeting_minute_attachments
for insert
to authenticated
with check (
  public.can_manage_committee(committee_id)
  and uploaded_by = auth.uid()
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy meeting_minute_attachments_delete_manager
on public.meeting_minute_attachments
for delete
to authenticated
using (public.can_manage_committee(committee_id));

create policy agenda_item_minute_attachments_select_authorized
on public.agenda_item_minute_attachments
for select
to authenticated
using (public.can_read_agenda_item_minutes(committee_id, meeting_id));

create policy agenda_item_minute_attachments_insert_manager
on public.agenda_item_minute_attachments
for insert
to authenticated
with check (
  public.can_manage_committee(committee_id)
  and uploaded_by = auth.uid()
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy agenda_item_minute_attachments_delete_manager
on public.agenda_item_minute_attachments
for delete
to authenticated
using (public.can_manage_committee(committee_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('meeting-minute-attachments', 'meeting-minute-attachments', false, 26214400)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create or replace function public.can_manage_minutes_storage_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[];
begin
  folders := storage.foldername(object_name);
  return array_length(folders, 1) >= 3
    and public.can_manage_committee(folders[2]::uuid);
exception when others then
  return false;
end;
$$;

create or replace function public.can_read_minutes_storage_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[];
  minutes_record public.meeting_minutes;
begin
  folders := storage.foldername(object_name);
  if array_length(folders, 1) < 3 then
    return false;
  end if;

  select *
  into minutes_record
  from public.meeting_minutes
  where meeting_id = folders[3]::uuid;

  return minutes_record.id is not null
    and public.can_read_meeting_minutes(
      minutes_record.committee_id,
      minutes_record.status
    );
exception when others then
  return false;
end;
$$;

create policy minutes_storage_insert_manager
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meeting-minute-attachments'
  and public.can_manage_minutes_storage_path(name)
);

create policy minutes_storage_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'meeting-minute-attachments'
  and public.can_read_minutes_storage_path(name)
);

create policy minutes_storage_delete_manager
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meeting-minute-attachments'
  and public.can_manage_minutes_storage_path(name)
);

revoke all on function public.can_approve_meeting_minutes(uuid) from public, anon;
revoke all on function public.send_meeting_minutes_for_approval(uuid, date) from public, anon;
revoke all on function public.respond_to_meeting_minutes_approval(
  uuid,
  public.meeting_minute_approval_status,
  text
) from public, anon;
revoke all on function public.mark_missing_approval_responses(uuid) from public, anon;
revoke all on function public.can_manage_minutes_storage_path(text) from public, anon;
revoke all on function public.can_read_minutes_storage_path(text) from public, anon;

grant execute on function public.can_approve_meeting_minutes(uuid) to authenticated;
grant execute on function public.send_meeting_minutes_for_approval(uuid, date) to authenticated;
grant execute on function public.respond_to_meeting_minutes_approval(
  uuid,
  public.meeting_minute_approval_status,
  text
) to authenticated;
grant execute on function public.mark_missing_approval_responses(uuid) to authenticated;
grant execute on function public.can_manage_minutes_storage_path(text) to authenticated;
grant execute on function public.can_read_minutes_storage_path(text) to authenticated;
