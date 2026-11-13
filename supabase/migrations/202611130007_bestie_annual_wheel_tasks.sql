create or replace function public.bestie_generate_messages()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Copenhagen')::date;
  added integer;
  follow_ups integer;
begin
  with linked_tasks as (
    select distinct on (t.id) t.id, e.id as event_id, e.title as activity_title, e.starts_on as activity_start
    from public.tasks t
    join public.annual_wheel_events e on (
      e.id = t.annual_wheel_event_id or (t.annual_wheel_event_id is null and e.task_id = t.id)
    )
      and e.organization_id = t.organization_id
      and (e.committee_id is null or e.committee_id = t.committee_id)
      and e.deleted_at is null and e.status in ('planned', 'in_progress')
      and (t.annual_wheel_activation_year is null
        or t.annual_wheel_activation_year = extract(year from e.starts_on))
    where t.responsible_user_id is not null and t.archived_at is null
      and t.status not in ('completed', 'cancelled')
    order by t.id, e.starts_on, e.id
  ), task_candidates as (
    select t.organization_id, t.committee_id, t.responsible_user_id as user_id,
      t.id as task_id, linked.event_id, linked.activity_start, t.title,
      case when t.deadline is null then
        concat('annual-task:', linked.event_id, ':', t.id, ':', t.responsible_user_id, ':', linked.activity_start)
      else
        concat('task:', t.id, ':', t.responsible_user_id, ':', t.deadline, ':',
          case when t.deadline < today then 'overdue' else 'due' end)
      end as key,
      case
        when linked.event_id is not null and t.deadline is null then
          format('Hej! Årshjulsaktiviteten “%s” starter %s. Hvordan går det med “%s”?',
            linked.activity_title, to_char(linked.activity_start, 'DD.MM.YYYY'), t.title)
        when linked.event_id is not null and t.deadline < today then
          format('Hej! Fristen for “%s” i årshjulet var %s. Hvad er status?',
            t.title, to_char(t.deadline, 'DD.MM.YYYY'))
        when linked.event_id is not null then
          format('Hej! “%s” i årshjulet har frist %s. Hvor langt er du?',
            t.title, to_char(t.deadline, 'DD.MM.YYYY'))
        when t.deadline < today then
          format('Hej! Fristen for “%s” var %s. Hvad er status?', t.title, to_char(t.deadline, 'DD.MM.YYYY'))
        else
          format('Hej! “%s” har frist %s. Hvor langt er du?', t.title, to_char(t.deadline, 'DD.MM.YYYY'))
      end as body
    from public.tasks t
    left join linked_tasks linked on linked.id = t.id
    where t.responsible_user_id is not null and t.archived_at is null
      and t.status not in ('completed', 'cancelled')
      and (
        t.deadline between today - 1 and today + case when linked.event_id is null then 3 else 7 end
        or (t.deadline is null and linked.activity_start between today and today + 14)
      )
      and not exists (
        select 1 from public.bestie_threads b where b.task_id = t.id and b.user_id = t.responsible_user_id
          and (b.follow_up_on is not null
            or (b.event_id = linked.event_id and b.activity_start = linked.activity_start
              and b.dedup_key like 'event:%'))
      )
  ), candidates as (
    select * from task_candidates
    union all
    select e.organization_id, e.committee_id, e.responsible_user_id,
      null::uuid, e.id, e.starts_on, e.title,
      concat('event:', e.id, ':', e.responsible_user_id, ':', e.starts_on),
      format('Hej! “%s” i årshjulet starter %s. Hvordan går forberedelsen?', e.title, to_char(e.starts_on, 'DD.MM.YYYY'))
    from public.annual_wheel_events e
    where e.responsible_user_id is not null and e.deleted_at is null
      and e.status in ('planned', 'in_progress')
      and e.starts_on between today and today + 14
      and not exists (select 1 from linked_tasks l where l.event_id = e.id)
  )
  insert into public.bestie_threads
    (organization_id, committee_id, user_id, task_id, event_id, activity_start, title, dedup_key, messages)
  select c.organization_id, c.committee_id, c.user_id, c.task_id, c.event_id, c.activity_start,
    c.title, c.key, jsonb_build_array(jsonb_build_object('role', 'bestie', 'body', c.body))
  from candidates c
  where public.bestie_target_is_accessible(
    jsonb_populate_record(null::public.bestie_threads, to_jsonb(c))
  )
  on conflict (dedup_key) do nothing;
  get diagnostics added = row_count;

  with due as (
    select b.id, public.bestie_target_is_accessible(b)
      and (b.task_id is null or exists (
        select 1 from public.tasks t where t.id = b.task_id and t.status not in ('completed', 'cancelled')
      ))
      and (b.event_id is null or exists (
        select 1 from public.annual_wheel_events e where e.id = b.event_id and e.status not in ('completed', 'cancelled')
      )) as active
    from public.bestie_threads b
    where b.follow_up_on <= today
    for update of b skip locked
  )
  update public.bestie_threads b
  set follow_up_on = null,
    messages = case when due.active then b.messages || jsonb_build_array(jsonb_build_object(
      'role', 'bestie', 'body', format('Hej igen! Vi aftalte at følge op på “%s” i dag. Hvad er status?', b.title)
    )) else b.messages end,
    updated_at = case when due.active then now() else b.updated_at end,
    push_sent_at = case when due.active then null else b.push_sent_at end,
    push_claimed_at = case when due.active then null else b.push_claimed_at end
  from due where b.id = due.id;
  get diagnostics follow_ups = row_count;
  return added + follow_ups;
end;
$$;
