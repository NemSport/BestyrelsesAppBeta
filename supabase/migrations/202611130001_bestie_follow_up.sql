create table public.bestie_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  committee_id uuid references public.committees on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  task_id uuid references public.tasks on delete cascade,
  event_id uuid references public.annual_wheel_events on delete cascade,
  activity_start date,
  dedup_key text not null unique,
  title text not null,
  messages jsonb not null default '[]',
  pending_action jsonb,
  follow_up_on date,
  last_read_at timestamptz,
  push_sent_at timestamptz,
  push_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (task_id is not null or event_id is not null),
  check (task_id is null or committee_id is not null)
);

create index bestie_threads_inbox on public.bestie_threads (user_id, organization_id, updated_at desc);
create index bestie_threads_follow_up on public.bestie_threads (follow_up_on) where follow_up_on is not null;
create index bestie_threads_push_queue on public.bestie_threads (created_at) where push_sent_at is null;

create table public.bestie_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create index bestie_push_subscriptions_user on public.bestie_push_subscriptions(user_id);

alter table public.bestie_threads enable row level security;
alter table public.bestie_push_subscriptions enable row level security;
revoke all on public.bestie_threads, public.bestie_push_subscriptions from anon, authenticated;
grant select on public.bestie_threads to authenticated;
grant all on public.bestie_threads, public.bestie_push_subscriptions to service_role;

-- Recheck membership and assignment on every read, reply and delivery.
create function public.bestie_target_is_accessible(thread public.bestie_threads)
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
revoke all on function public.bestie_target_is_accessible(public.bestie_threads) from public;
grant execute on function public.bestie_target_is_accessible(public.bestie_threads) to authenticated, service_role;
create policy bestie_threads_read_own on public.bestie_threads for select to authenticated
using (user_id = auth.uid() and public.bestie_target_is_accessible(bestie_threads));

create function public.bestie_generate_messages()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Copenhagen')::date;
  added integer;
  follow_ups integer;
begin
  with task_candidates as (
    select t.*, case when deadline < today then 'overdue' else 'due' end as kind
    from public.tasks t
    where t.responsible_user_id is not null and t.archived_at is null
      and t.status not in ('completed', 'cancelled')
      and t.deadline between today - 1 and today + 3
      and not exists (
        select 1 from public.bestie_threads b where b.task_id = t.id
          and b.user_id = t.responsible_user_id and b.follow_up_on is not null
      )
  ), candidates as (
    select t.organization_id, t.committee_id, t.responsible_user_id as user_id,
      t.id as task_id, null::uuid as event_id, null::date as activity_start, t.title,
      concat('task:', t.id, ':', t.responsible_user_id, ':', t.deadline, ':', t.kind) as key,
      case when t.kind = 'overdue' then
        format('Hej! Fristen for “%s” var %s. Hvad er status?', t.title, to_char(t.deadline, 'DD.MM.YYYY'))
      else
        format('Hej! “%s” har frist %s. Hvor langt er du?', t.title, to_char(t.deadline, 'DD.MM.YYYY'))
      end as body
    from task_candidates t
    union all
    select e.organization_id, coalesce(t.committee_id, e.committee_id), e.responsible_user_id,
      t.id, e.id, e.starts_on, e.title,
      concat('event:', e.id, ':', e.responsible_user_id, ':', e.starts_on),
      case when t.id is null then
        format('Hej! “%s” i årshjulet starter %s. Hvordan går forberedelsen?', e.title, to_char(e.starts_on, 'DD.MM.YYYY'))
      else
        format('Hej! “%s” i årshjulet starter %s. Hvordan går det med opgaven “%s”?', e.title, to_char(e.starts_on, 'DD.MM.YYYY'), t.title)
      end
    from public.annual_wheel_events e
    left join lateral (
      select linked.id, linked.committee_id, linked.title
      from public.tasks linked
      join public.committees c on c.id = linked.committee_id and c.deleted_at is null
      where (linked.id = e.task_id or linked.annual_wheel_event_id = e.id)
        and linked.organization_id = e.organization_id
        and (e.committee_id is null or linked.committee_id = e.committee_id)
        and linked.responsible_user_id = e.responsible_user_id
        and linked.archived_at is null and linked.status not in ('completed', 'cancelled')
        and (linked.id = e.task_id or linked.annual_wheel_activation_year is null
          or linked.annual_wheel_activation_year = extract(year from e.starts_on))
        and (exists (select 1 from public.committee_members cm
          where cm.committee_id = c.id and cm.user_id = e.responsible_user_id and cm.status = 'active')
          or exists (select 1 from public.organization_members om
          where om.organization_id = e.organization_id and om.user_id = e.responsible_user_id
            and om.status = 'active' and om.role in ('owner', 'admin')))
      order by linked.deadline nulls last, linked.id
      limit 1
    ) t on true
    where e.responsible_user_id is not null and e.deleted_at is null
      and e.status in ('planned', 'in_progress')
      and e.starts_on between today and today + 14
      and not exists (
        select 1 from task_candidates tc where tc.id = t.id
      )
      and not exists (
        select 1 from public.bestie_threads previous
        where previous.task_id = t.id and previous.user_id = e.responsible_user_id
          and previous.follow_up_on is not null
      )
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
revoke all on function public.bestie_generate_messages() from public;
grant execute on function public.bestie_generate_messages() to service_role;

create function public.bestie_claim_pushes()
returns setof public.bestie_threads
language sql security definer set search_path = ''
as $$
  with queued as (
    select b.id from public.bestie_threads b
    where b.push_sent_at is null and b.updated_at > now() - interval '2 days'
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
revoke all on function public.bestie_claim_pushes() from public;
grant execute on function public.bestie_claim_pushes() to service_role;

create function public.bestie_apply_reply(
  target_id uuid, actor_id uuid, expected_version timestamptz, expected_task_version timestamptz, reply_id uuid,
  user_body text, assistant_body text, next_action jsonb, note_body text,
  new_deadline date, complete_task boolean, reminder_date date, ai_metadata jsonb
)
returns public.bestie_threads
language plpgsql security definer set search_path = ''
as $$
declare
  b public.bestie_threads;
  t public.tasks;
  original_deadline date;
  audit_note text := note_body;
  today date := (now() at time zone 'Europe/Copenhagen')::date;
begin
  select * into b from public.bestie_threads
  where id = target_id and user_id = actor_id for update;
  if not found or not public.bestie_target_is_accessible(b) then
    raise exception 'Bestie thread unavailable' using errcode = '42501';
  end if;
  if b.messages @> jsonb_build_array(jsonb_build_object('id', reply_id::text)) then
    return b;
  end if;
  if b.updated_at <> expected_version then
    raise exception 'Bestie thread has changed' using errcode = '40001';
  end if;
  if (reminder_date is not null and reminder_date <= today)
     or (new_deadline is not null and new_deadline < today) then
    raise exception 'Bestie date has passed' using errcode = '22023';
  end if;

  if b.task_id is not null and (audit_note is not null or new_deadline is not null or complete_task) then
    select * into t from public.tasks where id = b.task_id for update;
    if not found or t.responsible_user_id is distinct from actor_id
       or t.organization_id <> b.organization_id or t.committee_id <> b.committee_id
       or t.archived_at is not null or t.status in ('completed', 'cancelled')
       or t.updated_at is distinct from expected_task_version then
      raise exception 'Bestie task has changed' using errcode = '40001';
    end if;
    if not exists (
      select 1 from public.organization_members om
      where om.organization_id = b.organization_id and om.user_id = actor_id and om.status = 'active'
        and (om.role in ('owner', 'admin') or exists (
          select 1 from public.committee_members cm
          where cm.committee_id = b.committee_id and cm.user_id = actor_id
            and cm.status = 'active' and cm.role in ('chair', 'secretary', 'member')
        ))
    ) then
      raise exception 'Bestie task editor access required' using errcode = '42501';
    end if;
    original_deadline := t.deadline;
    if complete_task and t.annual_wheel_event_id is not null and t.annual_wheel_activation_year is not null then
      perform 1 from public.annual_wheel_events where id = t.annual_wheel_event_id for update;
    end if;
    if new_deadline is not null or complete_task then
      update public.tasks set
        deadline = coalesce(new_deadline, deadline),
        status = case when complete_task then 'completed' else status end,
        completed_at = case when complete_task then coalesce(completed_at, now()) else completed_at end,
        updated_by = actor_id
      where id = t.id;
      if new_deadline is not null and new_deadline is distinct from original_deadline then
        audit_note := concat_ws(E'\n', audit_note, format('Bestie ændrede fristen fra %s til %s.',
          coalesce(to_char(original_deadline, 'DD.MM.YYYY'), 'ingen frist'), to_char(new_deadline, 'DD.MM.YYYY')));
      end if;
      if complete_task then
        audit_note := concat_ws(E'\n', audit_note, 'Bestie markerede opgaven som færdig.');
        if t.annual_wheel_event_id is not null and t.annual_wheel_activation_year is not null then
          update public.annual_wheel_events e set status = 'completed', updated_by = actor_id
          where e.id = t.annual_wheel_event_id and e.organization_id = t.organization_id
            and e.deleted_at is null and e.status not in ('completed', 'cancelled')
            and (e.committee_id is null or e.committee_id = t.committee_id)
            and (
              e.committee_id is not null or exists (
                select 1 from public.organization_members om where om.organization_id = e.organization_id
                  and om.user_id = actor_id and om.status = 'active' and om.role in ('owner', 'admin')
              )
            )
            and not exists (
              select 1 from public.tasks other
              where other.annual_wheel_event_id = e.id
                and other.annual_wheel_activation_year = t.annual_wheel_activation_year
                and other.archived_at is null and other.status <> 'completed'
            );
        end if;
      end if;
    end if;
    if audit_note is not null then
      insert into public.task_comments (task_id, organization_id, committee_id, body, created_by)
      values (t.id, t.organization_id, t.committee_id, audit_note, actor_id);
    end if;
  elsif new_deadline is not null or complete_task then
    raise exception 'Bestie thread has no task' using errcode = '22023';
  end if;

  update public.bestie_threads
  set messages = messages || jsonb_build_array(
      jsonb_build_object('id', reply_id, 'role', 'user', 'body', user_body),
      jsonb_build_object('role', 'bestie', 'body', assistant_body, 'ai', ai_metadata)
    ),
    pending_action = next_action,
    follow_up_on = case when complete_task then null else coalesce(reminder_date, follow_up_on) end,
    updated_at = now(), last_read_at = now(), push_sent_at = now()
  where id = target_id returning * into b;
  return b;
end;
$$;
revoke all on function public.bestie_apply_reply(
  uuid, uuid, timestamptz, timestamptz, uuid, text, text, jsonb, text, date, boolean, date, jsonb
) from public;
grant execute on function public.bestie_apply_reply(
  uuid, uuid, timestamptz, timestamptz, uuid, text, text, jsonb, text, date, boolean, date, jsonb
) to service_role;
