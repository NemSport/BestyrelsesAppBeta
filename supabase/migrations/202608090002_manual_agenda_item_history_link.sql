-- Version 3.6.3: controlled manual linking of one standalone agenda item to
-- an existing history thread. The general thread immutability guard remains.

create or replace function public.validate_agenda_item_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_item public.agenda_items;
  controlled_link boolean := false;
begin
  if tg_op = 'UPDATE'
    and new.agenda_item_thread_id is distinct from old.agenda_item_thread_id
  then
    controlled_link :=
      current_setting('app.agenda_item_history_link_item', true) = old.id::text
      and current_setting('app.agenda_item_history_link_target', true) = new.agenda_item_thread_id::text;

    if not controlled_link then
      raise exception 'Dagsordenspunktets historikreference kan ikke Ã¦ndres.';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and new.parent_id is distinct from old.parent_id
  then
    raise exception 'Dagsordenspunktets oprindelige parent-reference kan ikke Ã¦ndres.';
  end if;

  if new.parent_id is not null then
    select *
    into parent_item
    from public.agenda_items
    where id = new.parent_id;

    if parent_item.id is null
      or parent_item.organization_id <> new.organization_id
      or parent_item.committee_id <> new.committee_id
    then
      raise exception 'Dagsordenspunktets parent matcher ikke organisationen og udvalget.';
    end if;

    if tg_op = 'INSERT' then
      new.agenda_item_thread_id := parent_item.agenda_item_thread_id;
    end if;
  end if;

  new.agenda_item_thread_id := coalesce(
    new.agenda_item_thread_id,
    gen_random_uuid()
  );

  if exists (
    select 1
    from public.agenda_items existing_item
    where existing_item.agenda_item_thread_id = new.agenda_item_thread_id
      and existing_item.id <> new.id
      and (
        existing_item.organization_id <> new.organization_id
        or existing_item.committee_id <> new.committee_id
      )
  ) then
    raise exception 'Dagsordenspunktets historikreference krydser organisation eller udvalg.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_agenda_item_thread() from public, anon;

create or replace function public.link_agenda_item_to_history(
  target_organization_id uuid,
  target_committee_id uuid,
  source_agenda_item_id uuid,
  target_agenda_item_id uuid,
  expected_source_thread_id uuid
)
returns public.agenda_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_item public.agenda_items;
  target_item public.agenda_items;
  updated_item public.agenda_items;
  source_thread_member_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not public.can_edit_agenda_item(target_committee_id) then
    raise exception 'AGENDA_ITEM_EDITOR_REQUIRED';
  end if;

  if source_agenda_item_id = target_agenda_item_id then
    raise exception 'AGENDA_HISTORY_SELF_LINK';
  end if;

  -- Deterministic locks protect both identities from concurrent relinking.
  perform 1
  from public.agenda_items item
  where item.id in (source_agenda_item_id, target_agenda_item_id)
  order by item.id
  for update;

  select *
  into source_item
  from public.agenda_items item
  where item.id = source_agenda_item_id
    and item.deleted_at is null;

  select *
  into target_item
  from public.agenda_items item
  where item.id = target_agenda_item_id
    and item.deleted_at is null;

  if source_item.id is null or target_item.id is null then
    raise exception 'AGENDA_HISTORY_ITEM_NOT_FOUND';
  end if;

  if source_item.organization_id <> target_organization_id
    or source_item.committee_id <> target_committee_id
    or target_item.organization_id <> target_organization_id
    or target_item.committee_id <> target_committee_id
  then
    raise exception 'AGENDA_HISTORY_SCOPE_MISMATCH';
  end if;

  if source_item.agenda_item_thread_id <> expected_source_thread_id then
    raise exception 'AGENDA_HISTORY_CONCURRENT_CHANGE';
  end if;

  if source_item.agenda_item_thread_id = target_item.agenda_item_thread_id then
    return source_item;
  end if;

  select count(*)::integer
  into source_thread_member_count
  from public.agenda_items item
  where item.agenda_item_thread_id = source_item.agenda_item_thread_id;

  if source_thread_member_count > 1 then
    raise exception 'AGENDA_HISTORY_SOURCE_HAS_HISTORY';
  end if;

  perform set_config(
    'app.agenda_item_history_link_item',
    source_item.id::text,
    true
  );
  perform set_config(
    'app.agenda_item_history_link_target',
    target_item.agenda_item_thread_id::text,
    true
  );

  update public.agenda_items item
  set
    agenda_item_thread_id = target_item.agenda_item_thread_id
  where item.id = source_item.id
  returning item.* into updated_item;

  return updated_item;
end;
$$;

revoke all on function public.link_agenda_item_to_history(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon;
grant execute on function public.link_agenda_item_to_history(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) to authenticated;
