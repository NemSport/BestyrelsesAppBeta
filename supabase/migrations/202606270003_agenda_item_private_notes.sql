create table if not exists public.agenda_item_private_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, agenda_item_id, user_id)
);

create index if not exists agenda_item_private_notes_user_meeting_idx
on public.agenda_item_private_notes (user_id, meeting_id);

create index if not exists agenda_item_private_notes_agenda_item_idx
on public.agenda_item_private_notes (agenda_item_id, user_id);

drop trigger if exists agenda_item_private_notes_set_updated_at on public.agenda_item_private_notes;
create trigger agenda_item_private_notes_set_updated_at
before update on public.agenda_item_private_notes
for each row execute function public.set_updated_at();

create or replace function public.validate_agenda_item_private_note_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.committee_id <> old.committee_id
    or new.meeting_id <> old.meeting_id
    or new.agenda_item_id <> old.agenda_item_id
    or new.user_id <> old.user_id
    or new.created_at <> old.created_at
  ) then
    raise exception 'Den private notes tilknytning kan ikke ændres.';
  end if;

  if not exists (
    select 1
    from public.meetings m
    where m.id = new.meeting_id
      and m.organization_id = new.organization_id
      and m.committee_id = new.committee_id
  ) then
    raise exception 'Mødet matcher ikke organisationen og udvalget.';
  end if;

  if not exists (
    select 1
    from public.agenda_items ai
    where ai.id = new.agenda_item_id
      and ai.organization_id = new.organization_id
      and ai.committee_id = new.committee_id
  ) then
    raise exception 'Dagsordenspunktet matcher ikke organisationen og udvalget.';
  end if;

  if not exists (
    select 1
    from public.agenda_item_occurrences aio
    where aio.meeting_id = new.meeting_id
      and aio.agenda_item_id = new.agenda_item_id
      and aio.organization_id = new.organization_id
      and aio.committee_id = new.committee_id
      and aio.deleted_at is null
  ) then
    raise exception 'Dagsordenspunktet er ikke aktivt på mødet.';
  end if;

  if not exists (
    select 1
    from public.committee_members cm
    where cm.committee_id = new.committee_id
      and cm.user_id = new.user_id
      and cm.status = 'active'
  ) then
    raise exception 'Brugeren skal være aktivt medlem af udvalget.';
  end if;

  return new;
end;
$$;

drop trigger if exists agenda_item_private_notes_validate_scope on public.agenda_item_private_notes;
create trigger agenda_item_private_notes_validate_scope
before insert or update on public.agenda_item_private_notes
for each row execute function public.validate_agenda_item_private_note_scope();

alter table public.agenda_item_private_notes enable row level security;

drop policy if exists agenda_item_private_notes_select_own on public.agenda_item_private_notes;
create policy agenda_item_private_notes_select_own
on public.agenda_item_private_notes
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_committee_member(committee_id)
);

drop policy if exists agenda_item_private_notes_insert_own on public.agenda_item_private_notes;
create policy agenda_item_private_notes_insert_own
on public.agenda_item_private_notes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_committee_member(committee_id)
);

drop policy if exists agenda_item_private_notes_update_own on public.agenda_item_private_notes;
create policy agenda_item_private_notes_update_own
on public.agenda_item_private_notes
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_committee_member(committee_id)
)
with check (
  user_id = auth.uid()
  and public.is_committee_member(committee_id)
);

drop policy if exists agenda_item_private_notes_delete_own on public.agenda_item_private_notes;
create policy agenda_item_private_notes_delete_own
on public.agenda_item_private_notes
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.is_committee_member(committee_id)
);
