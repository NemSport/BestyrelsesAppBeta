create or replace function public.bestie_apply_reply(
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
  previous_actor text := current_setting('request.jwt.claim.sub', true);
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
    -- Existing task, comment and Annual Wheel triggers use auth.uid() to
    -- stamp the author. Set it only after checking the actor and target.
    perform set_config('request.jwt.claim.sub', actor_id::text, true);
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
    perform set_config('request.jwt.claim.sub', coalesce(previous_actor, ''), true);
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
