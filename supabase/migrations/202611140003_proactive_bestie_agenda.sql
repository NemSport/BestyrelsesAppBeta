alter table public.meetings
  add column responsible_user_id uuid references public.profiles(id) on delete set null;

create function public.can_review_bestie_agenda(target_org uuid, target_committee uuid, reviewer uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = target_org and om.user_id = reviewer and om.status = 'active'
      and (om.role in ('owner', 'admin') or exists (
        select 1 from public.committee_members cm
        where cm.organization_id = target_org and cm.committee_id = target_committee
          and cm.user_id = reviewer and cm.status = 'active' and cm.role in ('chair', 'secretary')
      ))
  );
$$;

create function public.validate_meeting_responsible()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.organization_id, new.committee_id, new.responsible_user_id)
        is not distinct from (old.organization_id, old.committee_id, old.responsible_user_id)
    then return new; end if;
  end if;
  if new.responsible_user_id is not null and not public.can_review_bestie_agenda(
    new.organization_id, new.committee_id, new.responsible_user_id
  ) then raise exception 'Meeting reviewer must have agenda scheduling access' using errcode = '23514'; end if;
  return new;
end;
$$;

create trigger meetings_validate_responsible
before insert or update of responsible_user_id, organization_id, committee_id on public.meetings
for each row execute function public.validate_meeting_responsible();

revoke all on function public.can_review_bestie_agenda(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_review_bestie_agenda(uuid, uuid, uuid) to service_role;
grant select on public.bestie_agenda_drafts, public.bestie_agenda_sources to service_role;
revoke all on function public.validate_meeting_responsible() from public, anon, authenticated;

create table public.bestie_agenda_reminders (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null,
  prepared_at timestamptz,
  finished_at timestamptz,
  push_sent_at timestamptz,
  generation jsonb,
  primary key (meeting_id, user_id)
);

alter table public.bestie_agenda_reminders enable row level security;
revoke all on public.bestie_agenda_reminders from public, anon, authenticated;
grant select, update on public.bestie_agenda_reminders to service_role;

create index meetings_bestie_responsible_idx on public.meetings (starts_at)
where responsible_user_id is not null and status = 'scheduled' and deleted_at is null;

create view public.bestie_due_agendas as
select m.id as meeting_id, m.organization_id, m.committee_id, m.responsible_user_id as user_id, m.starts_at
from public.meetings m
join public.organizations o on o.id = m.organization_id and o.deleted_at is null
join public.committees c on c.id = m.committee_id and c.organization_id = m.organization_id
  and c.deleted_at is null and c.archived_at is null
where m.responsible_user_id is not null
  and m.deleted_at is null and m.status = 'scheduled'
  and m.starts_at > now() and m.starts_at <= now() + interval '72 hours'
  and public.can_review_bestie_agenda(m.organization_id, m.committee_id, m.responsible_user_id)
  and not exists (
    select 1 from public.meetings earlier
    where earlier.organization_id = m.organization_id and earlier.committee_id = m.committee_id
      and earlier.deleted_at is null and earlier.status = 'scheduled' and earlier.starts_at > now()
      and (earlier.starts_at, earlier.id) < (m.starts_at, m.id)
  )
  and not exists (
    select 1 from public.meeting_minutes where meeting_id = m.id and status = 'approved'
  );

revoke all on public.bestie_due_agendas from public, anon, authenticated;
grant select on public.bestie_due_agendas to service_role;

create function public.claim_bestie_agendas()
returns table (meeting_id uuid, user_id uuid, organization_id uuid, committee_id uuid, claimed_at timestamptz, prepared_at timestamptz)
language sql security definer set search_path = ''
as $$
  with candidates as (
    select due.* from public.bestie_due_agendas due
    left join public.bestie_agenda_reminders reminder using (meeting_id, user_id)
    where reminder.finished_at is null
      and (reminder.prepared_at is null or exists (
        select 1 from public.bestie_push_subscriptions sub where sub.user_id = due.user_id
      ) or not exists (
        select 1 from public.bestie_agenda_drafts d
        where d.meeting_id = due.meeting_id and d.dismissed_at is null
      ))
      and (reminder.claimed_at is null or reminder.claimed_at < now() - interval '10 minutes')
    order by due.starts_at, due.meeting_id
    limit 8
  ), claimed as (
    insert into public.bestie_agenda_reminders as reminder (meeting_id, user_id, claimed_at)
    select c.meeting_id, c.user_id, now() from candidates c
    on conflict on constraint bestie_agenda_reminders_pkey do update set claimed_at = excluded.claimed_at
    where reminder.finished_at is null and reminder.claimed_at < now() - interval '10 minutes'
    returning reminder.meeting_id, reminder.user_id, reminder.claimed_at, reminder.prepared_at
  )
  select c.meeting_id, c.user_id, due.organization_id, due.committee_id, c.claimed_at, c.prepared_at
  from claimed c join candidates due using (meeting_id, user_id);
$$;

create function public.save_proactive_bestie_agenda_drafts(
  target_meeting uuid, reviewer uuid, claim_time timestamptz, drafts jsonb, generation_log jsonb
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  previous_subject text := current_setting('request.jwt.claim.sub', true);
begin
  perform pg_advisory_xact_lock(hashtextextended(target_meeting::text, 0));
  if not exists (
    select 1 from public.bestie_agenda_reminders r join public.bestie_due_agendas due using (meeting_id, user_id)
    where r.meeting_id = target_meeting and r.user_id = reviewer and r.claimed_at = claim_time and r.prepared_at is null
  ) then return false; end if;

  -- Reuse the scoped draft writer with the validated reviewer's identity.
  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform public.save_bestie_agenda_drafts(target_meeting, drafts);
  perform set_config('request.jwt.claim.sub', coalesce(previous_subject, ''), true);

  update public.bestie_agenda_reminders set prepared_at = now(), generation = generation_log
  where meeting_id = target_meeting and user_id = reviewer and claimed_at = claim_time;
  return found;
end;
$$;

revoke all on function public.claim_bestie_agendas() from public, anon, authenticated;
grant execute on function public.claim_bestie_agendas() to service_role;
revoke all on function public.save_proactive_bestie_agenda_drafts(uuid, uuid, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_proactive_bestie_agenda_drafts(uuid, uuid, timestamptz, jsonb, jsonb) to service_role;
