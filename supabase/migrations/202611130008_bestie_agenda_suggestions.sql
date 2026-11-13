create table public.bestie_agenda_sources (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  source_kind text not null check (source_kind in ('task', 'decision')),
  source_id uuid not null,
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  primary key (meeting_id, source_kind, source_id)
);

alter table public.bestie_agenda_sources enable row level security;
revoke all on public.bestie_agenda_sources from public, anon, authenticated;
grant select on public.bestie_agenda_sources to authenticated;
create policy bestie_agenda_sources_read on public.bestie_agenda_sources
  for select to authenticated using (exists (
    select 1 from public.meetings m where m.id = bestie_agenda_sources.meeting_id
      and m.deleted_at is null and public.can_manage_committee(m.committee_id)
  ));

create function public.approve_bestie_agenda_suggestion(
  target_meeting uuid, target_org uuid, target_committee uuid,
  item_source_kind text, item_source_id uuid, item_title text, item_description text,
  item_objective text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  next_meeting uuid;
  created_item uuid;
  linked_item uuid;
begin
  if auth.uid() is null or not coalesce(public.can_manage_committee(target_committee), false) then
    raise exception 'Meeting management required' using errcode = '42501';
  end if;

  -- Use the same lock order as the normal agenda creation function.
  perform pg_advisory_xact_lock(hashtextextended(target_meeting::text, 0));
  perform 1 from public.meetings where id = target_meeting
    and organization_id = target_org and committee_id = target_committee
    and deleted_at is null and status = 'scheduled' for update;
  if not found then return false; end if;

  select m.id into next_meeting from public.meetings m
  join public.committees c on c.id = m.committee_id and c.deleted_at is null and c.archived_at is null
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  where m.organization_id = target_org and m.committee_id = target_committee
    and m.deleted_at is null and m.status = 'scheduled' and m.starts_at >= now()
  order by m.starts_at, m.id limit 1;
  if next_meeting is distinct from target_meeting or exists (
    select 1 from public.meeting_minutes where meeting_id = target_meeting and status = 'approved'
  ) then return false; end if;

  if item_source_kind = 'task' then
    select agenda_item_id into linked_item from public.tasks
    where id = item_source_id and organization_id = target_org and committee_id = target_committee
      and archived_at is null and status not in ('completed', 'cancelled') for share;
  elsif item_source_kind = 'decision' then
    select agenda_item_id into linked_item from public.decisions
    where id = item_source_id and organization_id = target_org and committee_id = target_committee
      and archived_at is null and status not in ('completed', 'cancelled') for share;
  else return false;
  end if;
  if not found then return false; end if;

  if exists (
    select 1 from public.agenda_item_occurrences occurrence
    join public.agenda_items item on item.id = occurrence.agenda_item_id and item.deleted_at is null
    where occurrence.meeting_id = target_meeting and occurrence.deleted_at is null
      and (item.id = linked_item or lower(btrim(item.title)) = lower(btrim(item_title)))
  ) or exists (
    select 1 from public.bestie_agenda_sources source where source.meeting_id = target_meeting
      and source.source_kind = item_source_kind and source.source_id = item_source_id
  ) then return false; end if;

  if item_title is null or char_length(btrim(item_title)) not between 1 and 200
    or item_description is null or char_length(item_description) > 10000
    or item_objective is null or char_length(btrim(item_objective)) not between 1 and 4000
  then return false; end if;

  select id into created_item from public.create_agenda_item(
    target_org, target_committee, item_title, item_description, item_objective,
    'follow_up', 'scheduled', null, target_meeting
  );
  insert into public.bestie_agenda_sources (meeting_id, source_kind, source_id, agenda_item_id)
  values (target_meeting, item_source_kind, item_source_id, created_item);
  return true;
end;
$$;

revoke all on function public.approve_bestie_agenda_suggestion(uuid, uuid, uuid, text, uuid, text, text, text)
  from public, anon;
grant execute on function public.approve_bestie_agenda_suggestion(uuid, uuid, uuid, text, uuid, text, text, text)
  to authenticated;
