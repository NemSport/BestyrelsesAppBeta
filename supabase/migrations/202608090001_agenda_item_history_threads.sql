-- Version 3.6.1: explicit, stable agenda-item history threads.
-- Existing parent/transfer relations are the only source used to connect
-- historical items. Titles, descriptions and meeting dates are never matched.

alter table public.agenda_items
  add column agenda_item_thread_id uuid;

-- Every existing item starts as its own history thread.
update public.agenda_items
set agenda_item_thread_id = id
where agenda_item_thread_id is null;

-- Merge only components backed by an explicit parent or scheduled-transfer
-- relation. The undirected walk handles multi-step transfer chains safely.
with recursive explicit_links as (
  select
    parent.id as source_id,
    child.id as target_id
  from public.agenda_items child
  join public.agenda_items parent
    on parent.id = child.parent_id
   and parent.organization_id = child.organization_id
   and parent.committee_id = child.committee_id

  union

  select
    source_item.id as source_id,
    target_item.id as target_id
  from public.transferred_agenda_items transfer
  join public.agenda_items source_item
    on source_item.id = transfer.source_agenda_item_id
   and source_item.organization_id = transfer.organization_id
   and source_item.committee_id = transfer.committee_id
  join public.agenda_items target_item
    on target_item.id = transfer.target_agenda_item_id
   and target_item.organization_id = transfer.organization_id
   and target_item.committee_id = transfer.committee_id
  where transfer.status = 'scheduled'
),
thread_walk(seed_id, item_id) as (
  select id, id
  from public.agenda_items

  union

  select
    thread_walk.seed_id,
    case
      when explicit_links.source_id = thread_walk.item_id
        then explicit_links.target_id
      else explicit_links.source_id
    end
  from thread_walk
  join explicit_links
    on explicit_links.source_id = thread_walk.item_id
    or explicit_links.target_id = thread_walk.item_id
),
thread_components as (
  select
    item_id,
    min(seed_id::text)::uuid as agenda_item_thread_id
  from thread_walk
  group by item_id
)
update public.agenda_items item
set agenda_item_thread_id = component.agenda_item_thread_id
from thread_components component
where component.item_id = item.id;

alter table public.agenda_items
  alter column agenda_item_thread_id set default gen_random_uuid(),
  alter column agenda_item_thread_id set not null;

create index agenda_items_thread_history_idx
on public.agenda_items (
  agenda_item_thread_id,
  organization_id,
  committee_id,
  created_at
)
where deleted_at is null;

create or replace function public.validate_agenda_item_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_item public.agenda_items;
begin
  if tg_op = 'UPDATE'
    and new.agenda_item_thread_id is distinct from old.agenda_item_thread_id
  then
    raise exception 'Dagsordenspunktets historikreference kan ikke ændres.';
  end if;

  if tg_op = 'UPDATE'
    and new.parent_id is distinct from old.parent_id
  then
    raise exception 'Dagsordenspunktets oprindelige parent-reference kan ikke ændres.';
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

create trigger agenda_items_validate_thread
before insert or update of
  agenda_item_thread_id,
  parent_id,
  organization_id,
  committee_id
on public.agenda_items
for each row execute function public.validate_agenda_item_thread();
