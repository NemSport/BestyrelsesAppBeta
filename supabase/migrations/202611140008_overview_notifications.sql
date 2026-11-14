alter table public.meeting_date_poll_voters add column responded_at timestamptz;
alter table public.meeting_date_poll_voters add column sent_at timestamptz;

create table public.organization_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  path text not null check (
    path ~ '^/invite/[0-9a-f-]{36}$'
    or path ~ '^/api/organizations/[0-9a-f-]{36}/overview/(poll|meeting)/[0-9a-f-]{36}$'
    or path ~ '^/organizations/[0-9a-f-]{36}/committees/[0-9a-f-]{36}/meetings/[0-9a-f-]{36}(#minutes-approval|[?]view=preparation#bestie-agenda-heading)?$'
  ),
  title text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, path, title)
);

create index organization_notifications_inbox
  on public.organization_notifications (organization_id, user_id, created_at desc);
alter table public.organization_notifications enable row level security;
revoke all on public.organization_notifications from public, anon, authenticated;
grant select on public.organization_notifications to authenticated;
grant select, insert, update on public.organization_notifications to service_role;
create policy organization_notifications_own on public.organization_notifications
  for select to authenticated using (
    user_id = auth.uid() and public.is_organization_member(organization_id)
  );

create function public.record_organization_email_notification(
  target_org uuid, recipient_emails text[], notification_path text, notification_title text, push_path text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.meeting_date_poll_voters v set sent_at = coalesce(v.sent_at, now())
  from public.meeting_date_polls p
  where v.poll_id=p.id and p.organization_id=target_org
    and '/meeting-vote/'||v.token=push_path and v.email=any(recipient_emails);

  insert into public.organization_notifications (organization_id, user_id, path, title)
  select target_org, u.id, notification_path, notification_title
  from auth.users u join public.profiles p on p.id = u.id
  where u.email_confirmed_at is not null and lower(u.email) = any(recipient_emails)
  on conflict (organization_id, user_id, path, title)
    do update set created_at = now();
end;
$$;
revoke all on function public.record_organization_email_notification(uuid, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.record_organization_email_notification(uuid, text[], text, text, text) to service_role;


alter table public.meeting_invitation_responses add column responded_at timestamptz;

create function public.stamp_overview_response()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.responded_at := now();
  return new;
end;
$$;
create trigger meeting_date_poll_response_time
before update of choices on public.meeting_date_poll_voters
for each row execute function public.stamp_overview_response();
create trigger meeting_invitation_response_time
before update of response on public.meeting_invitation_responses
for each row when (new.response is not null) execute function public.stamp_overview_response();

create function public.read_admin_overview(target_org uuid)
returns table (section text, item_id text, title text, detail text, path text, occurred_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_organization_admin(target_org) or not exists (
    select 1 from public.organizations o where o.id=target_org and o.deleted_at is null
  ) then raise exception 'Administrator access required' using errcode = '42501'; end if;

  return query
  with active_committees as (
    select c.id from public.committees c where c.organization_id=target_org and c.deleted_at is null and c.archived_at is null
  ), meetings as (
    select m.*, '/committees/'||m.committee_id||'/meetings/'||m.id as href
    from public.meetings m join active_committees c on c.id=m.committee_id
    where m.organization_id=target_org and m.deleted_at is null and m.status <> 'cancelled'
  ), tasks as (
    select t.*, '/tasks?scope=all&task='||t.id||'&committee='||t.committee_id as href
    from public.tasks t join active_committees c on c.id=t.committee_id
    where t.organization_id=target_org and t.archived_at is null
  ), items as (
    select 'overdue'::text as kind, t.id::text as key, t.title as subject,
      concat(coalesce(p.full_name,'Ingen ansvarlig'), ' · Frist ', to_char(t.deadline,'DD.MM.YYYY')) as context,
      t.href, (t.deadline::timestamp at time zone 'Europe/Copenhagen') as item_time
    from tasks t left join public.profiles p on p.id=t.responsible_user_id
    where t.status not in ('completed','cancelled') and t.deadline < (now() at time zone 'Europe/Copenhagen')::date
    union all
    select 'waiting', b.id::text, t.title, concat(coalesce(p.full_name,'Ansvarlig'), ' · ',
      case when r.expires_at<=now() then 'Status efterspurgt · svarfrist udløbet' else 'Status efterspurgt' end), t.href, b.created_at
    from tasks t join public.bestie_threads b on b.task_id=t.id and b.user_id=t.responsible_user_id
    join public.bestie_status_requests r on r.thread_id=b.id
    left join public.profiles p on p.id=b.user_id
    where t.status not in ('completed','cancelled')
      and not b.messages @> '[{"role":"user"}]'::jsonb
      and not exists (
        select 1 from public.bestie_threads newer join public.bestie_status_requests nr on nr.thread_id=newer.id
        where newer.task_id=t.id and newer.user_id=b.user_id
          and (newer.created_at,newer.id)>(b.created_at,b.id)
      )
    union all
    select 'recent', b.id::text, t.title,
      concat(coalesce(p.full_name,'Ansvarlig'), ' · Har svaret i Bestie · afventer godkendelse'),
      t.href, b.updated_at
    from tasks t join public.bestie_threads b on b.task_id=t.id and b.user_id=t.responsible_user_id
    join public.bestie_status_requests r on r.thread_id=b.id
    left join public.profiles p on p.id=b.user_id
    where b.pending_action is not null and b.pending_action <> 'null'::jsonb
      and b.messages @> '[{"role":"user"}]'::jsonb
    union all
    select case when a.status='pending' then 'waiting' else 'recent' end, a.id::text, m.title,
      concat(coalesce(p.full_name,'Medlem'), ' · ', case a.status
        when 'approved' then 'Godkendte referatet' when 'change_requested' then 'Bad om ændringer' else 'Mangler referatgodkendelse' end),
      m.href||'#minutes-approval', coalesce(a.responded_at,a.created_at)
    from meetings m join public.meeting_minute_approvals a on a.meeting_id=m.id and a.organization_id=target_org
    join public.meeting_minutes mm on mm.id=a.meeting_minutes_id and mm.meeting_id=m.id
    left join public.profiles p on p.id=a.user_id
    where (a.status='pending' and mm.status='ready_for_approval')
      or (a.status in ('approved','change_requested') and a.responded_at is not null)
    union all
    select case when r.response is null then 'waiting' else 'recent' end, r.token::text, m.title,
      concat(r.name, ' · ', case r.response when 'accepted' then 'Deltager' when 'declined' then 'Deltager ikke' else 'Mangler svar på indkaldelsen' end),
      m.href, coalesce(r.responded_at,r.sent_at)
    from meetings m join public.meeting_invitation_responses r on r.meeting_id=m.id and r.starts_at=m.starts_at
    where r.sent_at is not null and (r.response is not null or m.starts_at>now())
    union all
    select case when v.choices is null then 'waiting' else 'recent' end, v.token::text, poll.title,
      concat(v.email, ' · ', case when v.choices is null then 'Mangler svar på datoafstemningen' else 'Svarede på datoafstemningen' end),
      '/committees/'||poll.committee_id||'/meetings/polls/'||poll.id, coalesce(v.responded_at,poll.created_at)
    from public.meeting_date_polls poll join active_committees c on c.id=poll.committee_id
    join public.meeting_date_poll_voters v on v.poll_id=poll.id
    where poll.organization_id=target_org and
      (v.choices is not null or (poll.meeting_id is null and exists (select 1 from unnest(poll.options) opt where opt>now())
        and v.sent_at is not null))
    union all
    select 'recent', tc.id::text, t.title, concat(coalesce(p.full_name,'Medlem'), ' · Gav en opgavestatus'),
      t.href, tc.created_at
    from tasks t join public.task_comments tc on tc.task_id=t.id and tc.organization_id=target_org
    left join public.profiles p on p.id=tc.created_by
  )
  select i.kind, i.key, i.subject, i.context, i.href, i.item_time
  from items i
  where i.kind <> 'recent' or i.item_time >= now() - interval '30 days'
  order by i.kind,
    case when i.kind = 'recent' then i.item_time end desc,
    case when i.kind <> 'recent' then i.item_time end asc, i.key;
end;
$$;
revoke all on function public.read_admin_overview(uuid) from public, anon, authenticated;
grant execute on function public.read_admin_overview(uuid) to authenticated;
