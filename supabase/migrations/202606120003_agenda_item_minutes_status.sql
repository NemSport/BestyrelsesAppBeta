create type public.agenda_item_minutes_status as enum (
  'not_started',
  'in_progress',
  'needs_decision',
  'needs_responsible',
  'completed'
);

alter table public.agenda_item_minutes
add column status public.agenda_item_minutes_status not null default 'not_started';

create index agenda_item_minutes_status_idx
on public.agenda_item_minutes (meeting_id, status);
