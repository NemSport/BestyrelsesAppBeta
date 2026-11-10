-- Do not expose an implicit tasks<->meetings many-to-many embedding through
-- PostgREST: older application deployments use the canonical tasks.meeting_id.
-- Keep the exact same uniqueness invariant, FKs, policies and existing rows.
-- Append id so the original RPC's five positional insert values retain order;
-- PostgreSQL supplies the default for the omitted trailing id column.
alter table public.meeting_task_links
  add column id uuid not null default gen_random_uuid();
alter table public.meeting_task_links
  drop constraint meeting_task_links_pkey,
  add constraint meeting_task_links_meeting_task_unique unique (meeting_id, task_id),
  add constraint meeting_task_links_pkey primary key (id);

notify pgrst, 'reload schema';
