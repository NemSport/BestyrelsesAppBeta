alter table public.bestie_agenda_drafts add column dismissed_at timestamptz;

create function public.review_bestie_agenda_draft(
  target_meeting uuid, target_org uuid, target_committee uuid,
  draft_kind text, draft_source uuid, dismiss boolean,
  edited_title text, rich_description text, rich_objective text
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
  perform 1 from public.meetings m
  join public.committees c on c.id = m.committee_id and c.deleted_at is null and c.archived_at is null
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  where m.id = target_meeting and m.organization_id = target_org and m.committee_id = target_committee
    and m.deleted_at is null and m.status = 'scheduled' and m.starts_at >= now()
    and not exists (
      select 1 from public.meetings earlier
      where earlier.organization_id = target_org and earlier.committee_id = target_committee
        and earlier.deleted_at is null and earlier.status = 'scheduled' and earlier.starts_at >= now()
        and (earlier.starts_at, earlier.id) < (m.starts_at, m.id)
    )
    and not exists (
      select 1 from public.meeting_minutes where meeting_id = m.id and status = 'approved'
    )
  for update of m;
  if not found then return false; end if;

  if dismiss then
    update public.bestie_agenda_drafts set dismissed_at = now()
    where meeting_id = target_meeting and source_kind = draft_kind and source_id = draft_source
      and dismissed_at is null;
    return found;
  end if;

  select title into draft_title from public.bestie_agenda_drafts
  where meeting_id = target_meeting and source_kind = draft_kind and source_id = draft_source
    and dismissed_at is null;
  if not found then return false; end if;

  if not public.approve_bestie_agenda_suggestion(
    target_meeting, target_org, target_committee, draft_kind, draft_source,
    coalesce(btrim(edited_title), draft_title), rich_description, rich_objective
  ) then return false; end if;

  delete from public.bestie_agenda_drafts
  where meeting_id = target_meeting and source_kind = draft_kind and source_id = draft_source;
  return true;
end;
$$;

revoke all on function public.review_bestie_agenda_draft(uuid, uuid, uuid, text, uuid, boolean, text, text, text) from public, anon;
grant execute on function public.review_bestie_agenda_draft(uuid, uuid, uuid, text, uuid, boolean, text, text, text) to authenticated;

-- Keep the previous deployment compatible during rollout.
create or replace function public.approve_bestie_agenda_draft(
  target_meeting uuid, target_org uuid, target_committee uuid,
  draft_kind text, draft_source uuid, rich_description text, rich_objective text
)
returns boolean
language sql security definer set search_path = ''
as $$
  select public.review_bestie_agenda_draft(
    target_meeting, target_org, target_committee, draft_kind, draft_source,
    false, null, rich_description, rich_objective
  );
$$;
