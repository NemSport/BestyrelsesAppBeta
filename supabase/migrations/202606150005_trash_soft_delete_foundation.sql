alter table public.committees
  add column deleted_at timestamptz,
  add column deleted_by uuid,
  add column delete_expires_at timestamptz;

alter table public.meetings
  add column deleted_at timestamptz,
  add column deleted_by uuid,
  add column delete_expires_at timestamptz;

alter table public.agenda_items
  add column deleted_at timestamptz,
  add column deleted_by uuid,
  add column delete_expires_at timestamptz;

alter table public.agenda_item_occurrences
  add column deleted_at timestamptz,
  add column deleted_by uuid,
  add column delete_expires_at timestamptz;

create index committees_trash_idx
  on public.committees(organization_id, delete_expires_at)
  where deleted_at is not null;
create index meetings_trash_idx
  on public.meetings(organization_id, committee_id, delete_expires_at)
  where deleted_at is not null;
create index agenda_items_trash_idx
  on public.agenda_items(organization_id, committee_id, delete_expires_at)
  where deleted_at is not null;
create index agenda_occurrences_trash_idx
  on public.agenda_item_occurrences(organization_id, committee_id, delete_expires_at)
  where deleted_at is not null;

create or replace function public.validate_trash_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      new.deleted_by := null;
      new.delete_expires_at := null;
    else
      new.deleted_at := now();
      new.deleted_by := auth.uid();
      new.delete_expires_at := now() + interval '30 days';
    end if;
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := auth.uid();
    new.delete_expires_at := now() + interval '30 days';
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
    new.delete_expires_at := null;
  elsif old.deleted_at is not null then
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
    new.delete_expires_at := old.delete_expires_at;
  else
    new.deleted_by := null;
    new.delete_expires_at := null;
  end if;
  return new;
end;
$$;

create trigger committees_validate_trash before insert or update on public.committees
for each row execute function public.validate_trash_metadata();
create trigger meetings_validate_trash before insert or update on public.meetings
for each row execute function public.validate_trash_metadata();
create trigger agenda_items_validate_trash before insert or update on public.agenda_items
for each row execute function public.validate_trash_metadata();
create trigger agenda_occurrences_validate_trash before insert or update on public.agenda_item_occurrences
for each row execute function public.validate_trash_metadata();

create or replace function public.soft_delete_committee(target_committee_id uuid)
returns public.committees
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marker timestamptz := now();
  result public.committees;
begin
  if not public.can_manage_committee(target_committee_id) then
    raise exception 'Not authorized to delete committee';
  end if;
  update public.committees
  set deleted_at = marker, deleted_by = auth.uid(), delete_expires_at = marker + interval '30 days'
  where id = target_committee_id and deleted_at is null
  returning * into result;
  if result.id is null then raise exception 'Committee not found or already deleted'; end if;

  update public.meetings
  set deleted_at = marker, deleted_by = auth.uid(), delete_expires_at = marker + interval '30 days'
  where committee_id = target_committee_id and deleted_at is null;
  update public.agenda_item_occurrences
  set deleted_at = marker, deleted_by = auth.uid(), delete_expires_at = marker + interval '30 days'
  where committee_id = target_committee_id and deleted_at is null;
  return result;
end;
$$;

create or replace function public.restore_committee(target_committee_id uuid)
returns public.committees
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marker timestamptz;
  actor uuid;
  result public.committees;
begin
  if not public.can_manage_committee(target_committee_id) then
    raise exception 'Not authorized to restore committee';
  end if;
  select deleted_at, deleted_by into marker, actor from public.committees where id = target_committee_id;
  if marker is null then raise exception 'Committee is not in trash'; end if;
  update public.committees set deleted_at = null, deleted_by = null, delete_expires_at = null
  where id = target_committee_id returning * into result;
  update public.meetings set deleted_at = null, deleted_by = null, delete_expires_at = null
  where committee_id = target_committee_id and deleted_at = marker and deleted_by = actor;
  update public.agenda_item_occurrences set deleted_at = null, deleted_by = null, delete_expires_at = null
  where committee_id = target_committee_id and deleted_at = marker and deleted_by = actor;
  return result;
end;
$$;

create or replace function public.soft_delete_meeting(target_meeting_id uuid)
returns public.meetings
language plpgsql
security invoker
set search_path = ''
as $$
declare marker timestamptz := now(); result public.meetings;
begin
  if not exists (select 1 from public.meetings where id = target_meeting_id and public.can_manage_committee(committee_id))
  then raise exception 'Not authorized to delete meeting'; end if;
  update public.meetings
  set deleted_at = marker, deleted_by = auth.uid(), delete_expires_at = marker + interval '30 days'
  where id = target_meeting_id and deleted_at is null returning * into result;
  if result.id is null then raise exception 'Meeting not found or already deleted'; end if;
  update public.agenda_item_occurrences
  set deleted_at = marker, deleted_by = auth.uid(), delete_expires_at = marker + interval '30 days'
  where meeting_id = target_meeting_id and deleted_at is null;
  return result;
end;
$$;

create or replace function public.restore_meeting(target_meeting_id uuid)
returns public.meetings
language plpgsql
security invoker
set search_path = ''
as $$
declare marker timestamptz; actor uuid; result public.meetings;
begin
  if not exists (select 1 from public.meetings where id = target_meeting_id and public.can_manage_committee(committee_id))
  then raise exception 'Not authorized to restore meeting'; end if;
  select deleted_at, deleted_by into marker, actor from public.meetings where id = target_meeting_id;
  if marker is null then raise exception 'Meeting is not in trash'; end if;
  update public.meetings set deleted_at = null, deleted_by = null, delete_expires_at = null
  where id = target_meeting_id returning * into result;
  update public.agenda_item_occurrences set deleted_at = null, deleted_by = null, delete_expires_at = null
  where meeting_id = target_meeting_id and deleted_at = marker and deleted_by = actor;
  return result;
end;
$$;

create or replace function public.soft_delete_agenda_item(target_agenda_item_id uuid)
returns public.agenda_items
language plpgsql
security invoker
set search_path = ''
as $$
declare marker timestamptz := now(); result public.agenda_items;
begin
  if not exists (select 1 from public.agenda_items where id = target_agenda_item_id and public.can_manage_committee(committee_id))
  then raise exception 'Not authorized to delete agenda item'; end if;
  update public.agenda_items
  set deleted_at = marker, deleted_by = auth.uid(), delete_expires_at = marker + interval '30 days'
  where id = target_agenda_item_id and deleted_at is null returning * into result;
  if result.id is null then raise exception 'Agenda item not found or already deleted'; end if;
  update public.agenda_item_occurrences
  set deleted_at = marker, deleted_by = auth.uid(), delete_expires_at = marker + interval '30 days'
  where agenda_item_id = target_agenda_item_id and deleted_at is null;
  return result;
end;
$$;

create or replace function public.restore_agenda_item(target_agenda_item_id uuid)
returns public.agenda_items
language plpgsql
security invoker
set search_path = ''
as $$
declare marker timestamptz; actor uuid; result public.agenda_items;
begin
  if not exists (select 1 from public.agenda_items where id = target_agenda_item_id and public.can_manage_committee(committee_id))
  then raise exception 'Not authorized to restore agenda item'; end if;
  select deleted_at, deleted_by into marker, actor from public.agenda_items where id = target_agenda_item_id;
  if marker is null then raise exception 'Agenda item is not in trash'; end if;
  update public.agenda_items set deleted_at = null, deleted_by = null, delete_expires_at = null
  where id = target_agenda_item_id returning * into result;
  update public.agenda_item_occurrences set deleted_at = null, deleted_by = null, delete_expires_at = null
  where agenda_item_id = target_agenda_item_id and deleted_at = marker and deleted_by = actor;
  return result;
end;
$$;

create or replace function public.soft_delete_agenda_item_occurrence(target_occurrence_id uuid)
returns public.agenda_item_occurrences
language plpgsql
security invoker
set search_path = ''
as $$
declare marker timestamptz := now(); result public.agenda_item_occurrences;
begin
  if not exists (select 1 from public.agenda_item_occurrences where id = target_occurrence_id and public.can_manage_committee(committee_id))
  then raise exception 'Not authorized to delete occurrence'; end if;
  update public.agenda_item_occurrences
  set deleted_at = marker, deleted_by = auth.uid(), delete_expires_at = marker + interval '30 days'
  where id = target_occurrence_id and deleted_at is null returning * into result;
  if result.id is null then raise exception 'Occurrence not found or already deleted'; end if;
  return result;
end;
$$;

create or replace function public.restore_agenda_item_occurrence(target_occurrence_id uuid)
returns public.agenda_item_occurrences
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.agenda_item_occurrences;
begin
  if not exists (select 1 from public.agenda_item_occurrences where id = target_occurrence_id and public.can_manage_committee(committee_id))
  then raise exception 'Not authorized to restore occurrence'; end if;
  update public.agenda_item_occurrences
  set deleted_at = null, deleted_by = null, delete_expires_at = null
  where id = target_occurrence_id and deleted_at is not null returning * into result;
  if result.id is null then raise exception 'Occurrence is not in trash'; end if;
  return result;
end;
$$;

drop policy if exists meetings_delete_manager on public.meetings;
drop policy if exists agenda_items_delete_manager on public.agenda_items;

revoke delete on public.committees from authenticated;
revoke delete on public.meetings from authenticated;
revoke delete on public.agenda_items from authenticated;
revoke delete on public.agenda_item_occurrences from authenticated;

revoke execute on function public.soft_delete_committee(uuid) from public, anon;
revoke execute on function public.restore_committee(uuid) from public, anon;
revoke execute on function public.soft_delete_meeting(uuid) from public, anon;
revoke execute on function public.restore_meeting(uuid) from public, anon;
revoke execute on function public.soft_delete_agenda_item(uuid) from public, anon;
revoke execute on function public.restore_agenda_item(uuid) from public, anon;
revoke execute on function public.soft_delete_agenda_item_occurrence(uuid) from public, anon;
revoke execute on function public.restore_agenda_item_occurrence(uuid) from public, anon;

grant execute on function public.soft_delete_committee(uuid) to authenticated;
grant execute on function public.restore_committee(uuid) to authenticated;
grant execute on function public.soft_delete_meeting(uuid) to authenticated;
grant execute on function public.restore_meeting(uuid) to authenticated;
grant execute on function public.soft_delete_agenda_item(uuid) to authenticated;
grant execute on function public.restore_agenda_item(uuid) to authenticated;
grant execute on function public.soft_delete_agenda_item_occurrence(uuid) to authenticated;
grant execute on function public.restore_agenda_item_occurrence(uuid) to authenticated;
