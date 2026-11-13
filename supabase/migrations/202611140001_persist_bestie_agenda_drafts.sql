create table public.bestie_agenda_drafts (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  source_kind text not null check (source_kind in ('task', 'decision')),
  source_id uuid not null,
  source_title text not null check (char_length(source_title) between 1 and 240),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null check (char_length(description) <= 1000),
  objective text not null check (char_length(btrim(objective)) between 1 and 400),
  created_at timestamptz not null default now(),
  primary key (meeting_id, source_kind, source_id)
);

create unique index bestie_agenda_drafts_title_idx
  on public.bestie_agenda_drafts (meeting_id, lower(btrim(title)));

alter table public.bestie_agenda_drafts enable row level security;
revoke all on public.bestie_agenda_drafts from public, anon, authenticated;
grant select on public.bestie_agenda_drafts to authenticated;

create policy bestie_agenda_drafts_read on public.bestie_agenda_drafts
for select to authenticated using (exists (
  select 1 from public.meetings m
  where m.id = bestie_agenda_drafts.meeting_id and m.deleted_at is null
    and public.can_manage_committee(m.committee_id)
));

create function public.save_bestie_agenda_drafts(target_meeting uuid, drafts jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  target public.meetings;
  saved integer;
begin
  if jsonb_typeof(drafts) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(drafts) > 5 then return 0; end if;

  select * into target from public.meetings where id = target_meeting;
  if not found or auth.uid() is null
    or not coalesce(public.can_manage_committee(target.committee_id), false)
  then raise exception 'Meeting management required' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_meeting::text, 0));
  perform 1 from public.meetings m where m.id = target_meeting
    and m.deleted_at is null and m.status = 'scheduled' and m.starts_at >= now()
    and not exists (
      select 1 from public.meetings earlier
      where earlier.organization_id = m.organization_id and earlier.committee_id = m.committee_id
        and earlier.deleted_at is null and earlier.status = 'scheduled' and earlier.starts_at >= now()
        and (earlier.starts_at, earlier.id) < (m.starts_at, m.id)
    )
    and not exists (
      select 1 from public.meeting_minutes where meeting_id = m.id and status = 'approved'
    )
  for update;
  if not found then return 0; end if;

  insert into public.bestie_agenda_drafts (meeting_id, source_kind, source_id, source_title, title, description, objective)
  select target_meeting, draft.source_kind, draft.source_id, source.title, draft.title, draft.description, draft.objective
  from jsonb_to_recordset(drafts) draft(source_kind text, source_id uuid, title text, description text, objective text)
  join lateral (
    select t.title, t.agenda_item_id from public.tasks t
    where draft.source_kind = 'task' and t.id = draft.source_id
      and t.organization_id = target.organization_id and t.committee_id = target.committee_id
      and t.archived_at is null and t.status not in ('completed', 'cancelled')
    union all
    select d.title, d.agenda_item_id from public.decisions d
    where draft.source_kind = 'decision' and d.id = draft.source_id
      and d.organization_id = target.organization_id and d.committee_id = target.committee_id
      and d.archived_at is null and d.status not in ('completed', 'cancelled')
  ) source on true
  where not exists (
    select 1 from public.bestie_agenda_sources s where s.meeting_id = target_meeting
      and s.source_kind = draft.source_kind and s.source_id = draft.source_id
  ) and not exists (
    select 1 from public.agenda_item_occurrences occurrence
    join public.agenda_items item on item.id = occurrence.agenda_item_id and item.deleted_at is null
    where occurrence.meeting_id = target_meeting and occurrence.deleted_at is null
      and (item.id = source.agenda_item_id or lower(btrim(item.title)) = lower(btrim(draft.title)))
  ) and not exists (
    select 1 from public.bestie_agenda_drafts existing where existing.meeting_id = target_meeting
      and lower(btrim(existing.title)) = lower(btrim(draft.title))
  )
  on conflict do nothing;
  get diagnostics saved = row_count;
  return saved;
end;
$$;

create function public.approve_bestie_agenda_draft(
  target_meeting uuid, target_org uuid, target_committee uuid,
  draft_kind text, draft_source uuid, rich_description text, rich_objective text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  draft_title text;
begin
  if auth.uid() is null or not coalesce(public.can_manage_committee(target_committee), false)
  then raise exception 'Meeting management required' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_meeting::text, 0));
  select title into draft_title from public.bestie_agenda_drafts
  where meeting_id = target_meeting and source_kind = draft_kind and source_id = draft_source;
  if not found then return false; end if;

  if not public.approve_bestie_agenda_suggestion(
    target_meeting, target_org, target_committee, draft_kind, draft_source,
    draft_title, rich_description, rich_objective
  ) then return false; end if;

  delete from public.bestie_agenda_drafts
  where meeting_id = target_meeting and source_kind = draft_kind and source_id = draft_source;
  return true;
end;
$$;

revoke all on function public.save_bestie_agenda_drafts(uuid, jsonb) from public, anon;
grant execute on function public.save_bestie_agenda_drafts(uuid, jsonb) to authenticated;
revoke all on function public.approve_bestie_agenda_draft(uuid, uuid, uuid, text, uuid, text, text) from public, anon;
grant execute on function public.approve_bestie_agenda_draft(uuid, uuid, uuid, text, uuid, text, text) to authenticated;
