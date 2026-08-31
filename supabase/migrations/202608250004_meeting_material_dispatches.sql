-- Immutable metadata snapshots for manual meeting-material distributions.
-- Files and task records remain canonical in Documents V2 and Tasks V2.

create table public.meeting_material_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  subject text not null check (char_length(subject) between 3 and 180),
  message text not null default '' check (char_length(message) <= 2000),
  content_types text[] not null check (
    cardinality(content_types) between 1 and 3
    and content_types <@ array['agenda', 'tasks', 'minutes']::text[]
  ),
  task_list_mode text check (task_list_mode in ('general', 'personal')),
  recipient_count integer not null check (recipient_count > 0 and recipient_count <= 250),
  recipient_snapshot jsonb not null check (jsonb_typeof(recipient_snapshot) = 'array'),
  document_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(document_snapshot) = 'array'),
  delivery_status text not null check (delivery_status in ('sent', 'stubbed', 'partial', 'failed', 'skipped_missing_config')),
  delivery_mode text not null check (delivery_mode in ('stub', 'resend')),
  sent_at timestamptz not null default now(),
  check (
    ('tasks' = any(content_types) and task_list_mode is not null)
    or ('tasks' <> all(content_types) and task_list_mode is null)
  )
);

create index meeting_material_dispatches_meeting_history_idx
on public.meeting_material_dispatches (meeting_id, sent_at desc);

create or replace function public.validate_meeting_material_dispatch_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.meetings meeting
    where meeting.id = new.meeting_id
      and meeting.organization_id = new.organization_id
      and meeting.committee_id = new.committee_id
      and meeting.deleted_at is null
  ) then
    raise exception 'Udsendelsen krydser organisation eller udvalg.';
  end if;
  return new;
end;
$$;

create trigger meeting_material_dispatches_validate_scope
before insert on public.meeting_material_dispatches
for each row execute function public.validate_meeting_material_dispatch_scope();

alter table public.meeting_material_dispatches enable row level security;

create policy meeting_material_dispatches_read
on public.meeting_material_dispatches for select to authenticated
using (
  public.is_organization_admin(organization_id)
  or public.is_committee_member(committee_id)
);

create policy meeting_material_dispatches_insert
on public.meeting_material_dispatches for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.can_manage_committee(committee_id)
);

grant select, insert on public.meeting_material_dispatches to authenticated;
