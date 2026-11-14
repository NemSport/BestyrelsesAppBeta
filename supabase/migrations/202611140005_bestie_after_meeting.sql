alter table public.bestie_threads
  add column meeting_id uuid references public.meetings(id) on delete cascade,
  add column meeting_summary jsonb,
  drop constraint bestie_threads_check,
  add constraint bestie_threads_target_check check (num_nonnulls(task_id, event_id, meeting_id) > 0),
  add constraint bestie_threads_meeting_check check (
    meeting_id is null or (committee_id is not null and task_id is null and event_id is null and meeting_summary is not null)
  );

create index bestie_threads_meeting_idx on public.bestie_threads(meeting_id) where meeting_id is not null;

create or replace function public.bestie_target_is_accessible(thread public.bestie_threads)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    join public.organization_members om on om.organization_id = o.id
    where (auth.uid() is null or auth.uid() = thread.user_id)
      and o.id = thread.organization_id and o.deleted_at is null
      and om.user_id = thread.user_id and om.status = 'active'
      and (
        thread.committee_id is null or exists (
          select 1 from public.committees c
          where c.id = thread.committee_id and c.organization_id = o.id
            and c.deleted_at is null
            and (
              om.role in ('owner', 'admin') or exists (
                select 1 from public.committee_members cm
                where cm.committee_id = c.id and cm.user_id = om.user_id
                  and cm.status = 'active'
              )
            )
        )
      )
      and (thread.meeting_id is null or exists (
        select 1 from public.meetings m
        join public.meeting_minutes mm on mm.meeting_id = m.id and mm.status = 'approved'
        join public.committees c on c.id = m.committee_id and c.archived_at is null
        where m.id = thread.meeting_id and m.organization_id = o.id
          and m.committee_id = thread.committee_id and m.deleted_at is null
          and mm.organization_id = o.id and mm.committee_id = thread.committee_id
      ))
      and (thread.task_id is null or exists (
        select 1 from public.tasks t
        where t.id = thread.task_id and t.organization_id = o.id
          and t.committee_id = thread.committee_id
          and t.responsible_user_id = om.user_id and t.archived_at is null
      ))
      and (thread.event_id is null or exists (
        select 1 from public.annual_wheel_events e
        where e.id = thread.event_id and e.organization_id = o.id
          and e.deleted_at is null
          and (thread.task_id is not null or (
            e.committee_id is not distinct from thread.committee_id
            and e.responsible_user_id = om.user_id
          ))
      ))
  );
$$;

create function public.bestie_claim_meeting_pushes(target_meeting uuid)
returns setof public.bestie_threads
language sql security definer set search_path = ''
as $$
  with queued as (
    select b.id from public.bestie_threads b
    where (target_meeting is null or b.meeting_id = target_meeting)
      and b.push_sent_at is null and b.updated_at > now() - interval '2 days'
      and (b.last_read_at is null or b.last_read_at < b.updated_at)
      and (b.push_claimed_at is null or b.push_claimed_at < now() - interval '15 minutes')
      and public.bestie_target_is_accessible(b)
      and (b.task_id is null or exists (
        select 1 from public.tasks t where t.id = b.task_id and t.status not in ('completed', 'cancelled')
      ))
      and (b.event_id is null or exists (
        select 1 from public.annual_wheel_events e where e.id = b.event_id and e.status not in ('completed', 'cancelled')
      ))
      and exists (select 1 from public.bestie_push_subscriptions s where s.user_id = b.user_id)
    order by b.updated_at
    limit 100
    for update skip locked
  )
  update public.bestie_threads b set push_claimed_at = now()
  from queued where b.id = queued.id
  returning b.*;
$$;

revoke all on function public.bestie_claim_meeting_pushes(uuid) from public, anon, authenticated;
grant execute on function public.bestie_claim_meeting_pushes(uuid) to service_role;

create or replace function public.bestie_claim_pushes()
returns setof public.bestie_threads
language sql security definer set search_path = ''
as $$
  select * from public.bestie_claim_meeting_pushes(null);
$$;

create function public.bestie_prepare_meeting_summary()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;

  with meeting as (
    select m.* from public.meetings m
    join public.organizations o on o.id = m.organization_id and o.deleted_at is null
    join public.committees c on c.id = m.committee_id and c.deleted_at is null and c.archived_at is null
    where m.id = new.meeting_id and m.organization_id = new.organization_id
      and m.committee_id = new.committee_id and m.deleted_at is null and m.status <> 'cancelled'
  ), agenda as (
    select o.id as occurrence_id, o.agenda_item_id, a.title
    from meeting m join public.agenda_item_occurrences o on o.meeting_id = m.id and o.deleted_at is null
    join public.agenda_items a on a.id = o.agenda_item_id and a.deleted_at is null
  ), decisions as (
    select d.id, d.title, d.responsible_user_id, d.agenda_item_id
    from meeting m join public.decisions d on d.organization_id = m.organization_id and d.committee_id = m.committee_id
    where d.archived_at is null and d.status <> 'cancelled'
      and (d.meeting_id = m.id or (d.meeting_id is null and d.agenda_item_id in (select agenda_item_id from agenda)))
  ), tasks as (
    select t.id, t.title, t.deadline, t.responsible_user_id, t.decision_id, t.agenda_item_id
    from meeting m join public.tasks t on t.organization_id = m.organization_id and t.committee_id = m.committee_id
    where t.responsible_user_id is not null and t.archived_at is null and t.status not in ('completed','cancelled')
      and (t.meeting_id = m.id or t.agenda_item_id in (select agenda_item_id from agenda)
        or t.decision_id in (select id from decisions)
        or exists (select 1 from public.meeting_task_links l join agenda a on a.occurrence_id = l.occurrence_id
          where l.meeting_id = m.id and l.task_id = t.id))
  ), participants as (
    select a.user_id from public.meeting_attendees a
    where a.meeting_id = new.meeting_id and a.attendance_status in ('accepted','attended')
    union
    select a.user_id from public.meeting_minute_approvals a
    where a.meeting_minutes_id = new.id and a.status = 'approved'
  ), recipients as (
    select user_id from participants
    union select responsible_user_id from tasks
    union select responsible_user_id from decisions where responsible_user_id is not null
  ), personal as (
    select m.id as meeting_id, m.organization_id, m.committee_id, m.title, r.user_id,
      (select jsonb_agg(jsonb_build_object('title', t.title, 'deadline', t.deadline) order by t.deadline nulls last, t.title, t.id)
       from tasks t where t.responsible_user_id = r.user_id) as own_tasks,
      (select jsonb_agg(d.title order by d.title, d.id) from decisions d
       where d.responsible_user_id = r.user_id or exists (select 1 from participants p where p.user_id = r.user_id)
         or exists (select 1 from tasks t where t.responsible_user_id = r.user_id and
           (t.decision_id = d.id or (d.agenda_item_id is not null and d.agenda_item_id = t.agenda_item_id)))) as relevant_decisions
    from meeting m cross join recipients r
  )
  insert into public.bestie_threads (meeting_id, organization_id, committee_id, user_id, title, dedup_key, messages, meeting_summary)
  select p.meeting_id, p.organization_id, p.committee_id, p.user_id,
    'Efter mødet: ' || p.title, concat('meeting-summary:', p.meeting_id, ':', p.user_id),
    jsonb_build_array(jsonb_build_object('role', 'bestie', 'body',
      concat_ws(E'\n\n', format('Referatet fra “%s” er godkendt.', p.title),
        case when p.own_tasks is not null then 'Dine åbne opgaver' || E'\n' ||
          (select string_agg('• ' || (t->>'title') || ' · ' || coalesce(to_char((t->>'deadline')::date,'DD.MM.YYYY'), 'Ingen frist'), E'\n' order by position)
           from jsonb_array_elements(p.own_tasks) with ordinality items(t, position))
        else 'Du har ingen åbne opgaver fra mødet.' end,
        case when p.relevant_decisions is not null then 'Relevante beslutninger' || E'\n' ||
          (select string_agg('• ' || decision, E'\n' order by position)
           from jsonb_array_elements_text(p.relevant_decisions) with ordinality items(decision, position)) end,
        'Skriv her, hvis du har en opdatering eller et spørgsmål til opsamlingen.'
      ))),
    jsonb_build_object('tasks', coalesce(p.own_tasks, '[]'::jsonb), 'decisions', coalesce(p.relevant_decisions, '[]'::jsonb))
  from personal p
  where exists (
    select 1 from public.organization_members om
    where om.organization_id = p.organization_id and om.user_id = p.user_id and om.status = 'active'
      and (om.role in ('owner','admin') or exists (
        select 1 from public.committee_members cm
        where cm.committee_id = p.committee_id and cm.user_id = p.user_id and cm.status = 'active'
      ))
  )
  on conflict (dedup_key) do nothing;

  return new;
end;
$$;

revoke all on function public.bestie_prepare_meeting_summary() from public, anon, authenticated;
create trigger bestie_prepare_meeting_summary
after insert or update of status on public.meeting_minutes
for each row execute function public.bestie_prepare_meeting_summary();
