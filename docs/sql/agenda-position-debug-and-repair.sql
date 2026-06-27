-- Agenda occurrence position diagnostics and one-time repair helpers.
-- Run these in Supabase SQL editor or psql as an authorized database operator.

-- 1. Inspect the active RPC definitions and confirm there is only one
-- overload per expected argument list.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_agenda_item',
    'schedule_agenda_item',
    'schedule_transferred_agenda_item',
    'keep_any_other_business_last'
  )
order by p.proname, identity_arguments;

-- 2. Confirm the old position-mutating trigger is gone.
select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'agenda_item_occurrences'
order by trigger_name;

-- 3. Inspect the live positions for the affected meeting.
select
  aio.id,
  aio.meeting_id,
  aio.position,
  aio.deleted_at,
  ai.title,
  ai.standard_key,
  aio.created_at
from public.agenda_item_occurrences aio
join public.agenda_items ai on ai.id = aio.agenda_item_id
where aio.meeting_id = 'f78d72f5-9a26-4667-87bb-008ba465c731'
order by aio.position, aio.created_at, aio.id;

-- 4. Detect duplicate positions for the affected meeting.
select
  meeting_id,
  position,
  count(*) as row_count,
  array_agg(id order by created_at, id) as occurrence_ids
from public.agenda_item_occurrences
where meeting_id = 'f78d72f5-9a26-4667-87bb-008ba465c731'
group by meeting_id, position
having count(*) > 1
order by position;

-- 5. One-time repair for the affected meeting.
-- This normalizes all occurrences that still occupy the unique position space,
-- including soft-deleted rows, so future max(position) + 1 appends safely.
begin;

select 1
from public.meetings
where id = 'f78d72f5-9a26-4667-87bb-008ba465c731'
for update;

update public.agenda_item_occurrences
set position = position + 1000000
where meeting_id = 'f78d72f5-9a26-4667-87bb-008ba465c731';

with ordered_occurrences as (
  select
    id,
    row_number() over (
      order by
        case when deleted_at is null then 0 else 1 end,
        position,
        created_at,
        id
    ) as repaired_position
  from public.agenda_item_occurrences
  where meeting_id = 'f78d72f5-9a26-4667-87bb-008ba465c731'
)
update public.agenda_item_occurrences occurrence
set position = ordered_occurrences.repaired_position
from ordered_occurrences
where occurrence.id = ordered_occurrences.id;

commit;

-- 6. Verify max + next after repair.
select
  max(position) as current_max_position,
  coalesce(max(position), 0) + 1 as next_insert_position
from public.agenda_item_occurrences
where meeting_id = 'f78d72f5-9a26-4667-87bb-008ba465c731';
