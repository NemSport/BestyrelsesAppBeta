-- V2.hotfix.1: move meeting-level internal notes out of shared minutes and
-- store them with the same owner-only boundary as agenda-item private notes.

alter table public.agenda_item_private_notes
alter column agenda_item_id drop not null;

create unique index if not exists agenda_item_private_notes_meeting_user_unique
on public.agenda_item_private_notes (meeting_id, user_id)
where agenda_item_id is null;

create or replace function public.validate_agenda_item_private_note_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.organization_id is distinct from old.organization_id
    or new.committee_id is distinct from old.committee_id
    or new.meeting_id is distinct from old.meeting_id
    or new.agenda_item_id is distinct from old.agenda_item_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Den private notes tilknytning kan ikke ændres.';
  end if;

  if auth.uid() is not null then
    if new.user_id <> auth.uid() then
      raise exception 'Private noter kan kun gemmes for den aktuelle bruger.';
    end if;

    if not exists (
      select 1
      from public.committee_members cm
      where cm.committee_id = new.committee_id
        and cm.user_id = new.user_id
        and cm.status = 'active'
    ) and not exists (
      select 1
      from public.organization_members om
      where om.organization_id = new.organization_id
        and om.user_id = new.user_id
        and om.status = 'active'
        and om.role in ('owner', 'admin')
    ) then
      raise exception 'Brugeren skal have adgang til mødet.';
    end if;
  end if;

  if not exists (
    select 1
    from public.meetings m
    where m.id = new.meeting_id
      and m.organization_id = new.organization_id
      and m.committee_id = new.committee_id
      and (auth.uid() is null or m.deleted_at is null)
  ) then
    raise exception 'Mødet matcher ikke organisationen og udvalget.';
  end if;

  if new.agenda_item_id is not null then
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
  end if;

  return new;
end;
$$;

insert into public.agenda_item_private_notes (
  organization_id,
  committee_id,
  meeting_id,
  agenda_item_id,
  user_id,
  content,
  created_at,
  updated_at
)
select
  mm.organization_id,
  mm.committee_id,
  mm.meeting_id,
  null,
  coalesce(mm.updated_by, mm.created_by),
  mm.internal_note,
  mm.created_at,
  mm.updated_at
from public.meeting_minutes mm
where nullif(btrim(mm.internal_note), '') is not null
on conflict (meeting_id, user_id) where agenda_item_id is null
do nothing;

-- The authoritative copy now lives behind owner-only RLS. Keeping the shared
-- column would continue exposing it through the meeting_minutes row.
alter table public.meeting_minutes drop column internal_note;

drop policy if exists agenda_item_private_notes_select_own
on public.agenda_item_private_notes;
create policy agenda_item_private_notes_select_own
on public.agenda_item_private_notes
for select
to authenticated
using (
  user_id = auth.uid()
  and (
    public.is_committee_member(committee_id)
    or public.is_organization_admin(organization_id)
  )
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.deleted_at is null
  )
);

drop policy if exists agenda_item_private_notes_insert_own
on public.agenda_item_private_notes;
create policy agenda_item_private_notes_insert_own
on public.agenda_item_private_notes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    public.is_committee_member(committee_id)
    or public.is_organization_admin(organization_id)
  )
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.deleted_at is null
  )
);

drop policy if exists agenda_item_private_notes_update_own
on public.agenda_item_private_notes;
create policy agenda_item_private_notes_update_own
on public.agenda_item_private_notes
for update
to authenticated
using (
  user_id = auth.uid()
  and (
    public.is_committee_member(committee_id)
    or public.is_organization_admin(organization_id)
  )
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.deleted_at is null
  )
)
with check (
  user_id = auth.uid()
  and (
    public.is_committee_member(committee_id)
    or public.is_organization_admin(organization_id)
  )
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.deleted_at is null
  )
);

drop policy if exists agenda_item_private_notes_delete_own
on public.agenda_item_private_notes;
create policy agenda_item_private_notes_delete_own
on public.agenda_item_private_notes
for delete
to authenticated
using (
  user_id = auth.uid()
  and (
    public.is_committee_member(committee_id)
    or public.is_organization_admin(organization_id)
  )
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.deleted_at is null
  )
);
