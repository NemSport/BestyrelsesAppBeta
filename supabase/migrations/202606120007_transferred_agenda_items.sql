create type public.transferred_agenda_item_status as enum (
  'pending',
  'scheduled',
  'dismissed'
);

create type public.agenda_item_transfer_reason as enum (
  'discussion_continue',
  'discussion_requires_decision',
  'decision_requires_follow_up'
);

create table public.transferred_agenda_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  source_meeting_id uuid not null references public.meetings(id) on delete cascade,
  source_agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  source_agenda_item_occurrence_id uuid references public.agenda_item_occurrences(id) on delete set null,
  source_agenda_item_minutes_id uuid not null references public.agenda_item_minutes(id) on delete cascade,
  target_meeting_id uuid references public.meetings(id) on delete set null,
  target_agenda_item_id uuid references public.agenda_items(id) on delete set null,
  transfer_reason public.agenda_item_transfer_reason not null,
  source_status public.agenda_item_minutes_status not null,
  target_item_type public.agenda_item_type not null,
  status public.transferred_agenda_item_status not null default 'pending',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transferred_agenda_items_target_pair_check check (
    (target_meeting_id is null and target_agenda_item_id is null)
    or (target_meeting_id is not null and target_agenda_item_id is not null)
  ),
  constraint transferred_agenda_items_scheduled_target_check check (
    status <> 'scheduled'
    or (target_meeting_id is not null and target_agenda_item_id is not null)
  ),
  unique (
    source_agenda_item_minutes_id,
    source_status,
    target_item_type
  )
);

create index transferred_agenda_items_committee_status_idx
on public.transferred_agenda_items (committee_id, status, created_at desc);

create index transferred_agenda_items_source_meeting_idx
on public.transferred_agenda_items (source_meeting_id, status, created_at);

create trigger transferred_agenda_items_set_updated_at
before update on public.transferred_agenda_items
for each row execute function public.set_updated_at();

create or replace function public.validate_transferred_agenda_item_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_item_type public.agenda_item_type;
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.committee_id <> old.committee_id
    or new.source_meeting_id <> old.source_meeting_id
    or new.source_agenda_item_id <> old.source_agenda_item_id
    or new.source_agenda_item_occurrence_id is distinct from old.source_agenda_item_occurrence_id
    or new.source_agenda_item_minutes_id <> old.source_agenda_item_minutes_id
    or new.transfer_reason <> old.transfer_reason
    or new.source_status <> old.source_status
    or new.target_item_type <> old.target_item_type
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
  ) then
    raise exception 'Overførslens kilde og regel kan ikke ændres.';
  end if;

  select ai.item_type
  into source_item_type
  from public.agenda_item_minutes aim
  join public.agenda_items ai on ai.id = aim.agenda_item_id
  where aim.id = new.source_agenda_item_minutes_id
    and aim.organization_id = new.organization_id
    and aim.committee_id = new.committee_id
    and aim.meeting_id = new.source_meeting_id
    and aim.agenda_item_id = new.source_agenda_item_id
    and aim.agenda_item_occurrence_id is not distinct from new.source_agenda_item_occurrence_id
    and aim.status = new.source_status;

  if source_item_type is null then
    raise exception 'Punktreferatet matcher ikke overførslens kilde.';
  end if;

  if not (
    (
      source_item_type = 'discussion'
      and new.source_status = 'discussion_continue'
      and new.transfer_reason = 'discussion_continue'
      and new.target_item_type = 'discussion'
    )
    or (
      source_item_type = 'discussion'
      and new.source_status = 'needs_decision'
      and new.transfer_reason = 'discussion_requires_decision'
      and new.target_item_type = 'decision'
    )
    or (
      source_item_type = 'decision'
      and new.source_status = 'decision_requires_follow_up'
      and new.transfer_reason = 'decision_requires_follow_up'
      and new.target_item_type = 'follow_up'
    )
  ) then
    raise exception 'Kombinationen af type, status og overførselsregel er ugyldig.';
  end if;

  if new.target_meeting_id is not null and not exists (
    select 1
    from public.meetings m
    where m.id = new.target_meeting_id
      and m.organization_id = new.organization_id
      and m.committee_id = new.committee_id
  ) then
    raise exception 'Målmødet matcher ikke organisationen og udvalget.';
  end if;

  if new.target_agenda_item_id is not null and not exists (
    select 1
    from public.agenda_items ai
    where ai.id = new.target_agenda_item_id
      and ai.organization_id = new.organization_id
      and ai.committee_id = new.committee_id
      and ai.item_type = new.target_item_type
  ) then
    raise exception 'Måldagsordenspunktet matcher ikke overførslen.';
  end if;

  return new;
end;
$$;

create trigger transferred_agenda_items_validate_scope
before insert or update on public.transferred_agenda_items
for each row execute function public.validate_transferred_agenda_item_scope();

alter table public.transferred_agenda_items enable row level security;

create policy transferred_agenda_items_select_authorized
on public.transferred_agenda_items
for select
to authenticated
using (
  public.can_read_agenda_item_minutes(committee_id, source_meeting_id)
);

create policy transferred_agenda_items_insert_manager
on public.transferred_agenda_items
for insert
to authenticated
with check (
  public.can_manage_committee(committee_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy transferred_agenda_items_update_manager
on public.transferred_agenda_items
for update
to authenticated
using (public.can_manage_committee(committee_id))
with check (
  public.can_manage_committee(committee_id)
  and updated_by = auth.uid()
);

create policy transferred_agenda_items_delete_manager
on public.transferred_agenda_items
for delete
to authenticated
using (public.can_manage_committee(committee_id));

insert into public.transferred_agenda_items (
  organization_id,
  committee_id,
  source_meeting_id,
  source_agenda_item_id,
  source_agenda_item_occurrence_id,
  source_agenda_item_minutes_id,
  transfer_reason,
  source_status,
  target_item_type,
  status,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  aim.organization_id,
  aim.committee_id,
  aim.meeting_id,
  aim.agenda_item_id,
  aim.agenda_item_occurrence_id,
  aim.id,
  case
    when aim.status = 'discussion_continue'
      then 'discussion_continue'::public.agenda_item_transfer_reason
    when aim.status = 'needs_decision'
      then 'discussion_requires_decision'::public.agenda_item_transfer_reason
    else 'decision_requires_follow_up'::public.agenda_item_transfer_reason
  end,
  aim.status,
  case
    when aim.status = 'discussion_continue'
      then 'discussion'::public.agenda_item_type
    when aim.status = 'needs_decision'
      then 'decision'::public.agenda_item_type
    else 'follow_up'::public.agenda_item_type
  end,
  'pending',
  aim.updated_by,
  aim.updated_by,
  aim.updated_at,
  aim.updated_at
from public.agenda_item_minutes aim
join public.agenda_items ai on ai.id = aim.agenda_item_id
where (
  ai.item_type = 'discussion'
  and aim.status in ('discussion_continue', 'needs_decision')
)
or (
  ai.item_type = 'decision'
  and aim.status = 'decision_requires_follow_up'
)
on conflict (
  source_agenda_item_minutes_id,
  source_status,
  target_item_type
) do nothing;
