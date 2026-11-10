alter table public.tasks add column is_critical boolean not null default false;
alter table public.meeting_material_dispatches add column task_snapshot jsonb not null default '[]'::jsonb
  check (jsonb_typeof(task_snapshot) = 'array');

-- Meeting occurrences reference canonical tasks; task origin references never move.
create table public.meeting_task_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  occurrence_id uuid not null references public.agenda_item_occurrences(id) on delete cascade,
  primary key (meeting_id, task_id)
);
create index meeting_task_links_task_idx on public.meeting_task_links(task_id);
create table public.meeting_task_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('update', 'link')),
  note text not null default '' check (char_length(note) <= 5000),
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
create index meeting_task_events_meeting_idx on public.meeting_task_events(meeting_id, created_at);
alter table public.meeting_task_links enable row level security;
alter table public.meeting_task_events enable row level security;
create policy meeting_task_links_read on public.meeting_task_links for select to authenticated
  using (public.is_committee_member(committee_id) or public.is_organization_admin(organization_id));
create policy meeting_task_events_read on public.meeting_task_events for select to authenticated
  using (public.is_committee_member(committee_id) or public.is_organization_admin(organization_id));
-- Writes only through the scoped transaction below; clients cannot fabricate history.
revoke all on public.meeting_task_links, public.meeting_task_events from anon, authenticated;
grant select on public.meeting_task_links, public.meeting_task_events to authenticated;

create function public.meeting_task_public_state(task public.tasks)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', task.id, 'title', task.title, 'status', task.status,
    'deadline', task.deadline, 'responsible_user_id', task.responsible_user_id,
    'responsible_name', (select full_name from public.profiles where id = task.responsible_user_id),
    'is_critical', task.is_critical, 'updated_at', task.updated_at, 'archived_at', task.archived_at,
    'latest_note', (select body from public.task_comments where task_id = task.id order by created_at desc, id limit 1));
$$;
revoke all on function public.meeting_task_public_state(public.tasks) from public, anon;
grant execute on function public.meeting_task_public_state(public.tasks) to authenticated;

create function public.read_meeting_task_follow_up(target_meeting_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare m public.meetings;
begin
  select * into m from public.meetings where id = target_meeting_id and deleted_at is null;
  if m.id is null or auth.uid() is null or not
    (public.is_committee_member(m.committee_id) or public.is_organization_admin(m.organization_id)) then
    raise exception 'Ingen adgang til mødet.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'writable', m.status in ('draft', 'scheduled', 'in_progress') and not exists
      (select 1 from public.meeting_minutes where meeting_id = m.id and status = 'approved'),
    'tasks', coalesce((select jsonb_agg(public.meeting_task_public_state(t)) from public.tasks t
      where t.organization_id = m.organization_id and t.committee_id = m.committee_id and t.archived_at is null), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('task_id', l.task_id, 'occurrence_id', l.occurrence_id))
      from public.meeting_task_links l join public.agenda_item_occurrences o on o.id = l.occurrence_id
      join public.agenda_items a on a.id = o.agenda_item_id
      where l.meeting_id = m.id and o.deleted_at is null and a.deleted_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('actor_name', p.full_name) order by e.created_at desc, e.id)
      from public.meeting_task_events e left join public.profiles p on p.id = e.actor_id where e.meeting_id = m.id), '[]'::jsonb),
    'occurrences', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', a.title) order by o.position)
      from public.agenda_item_occurrences o join public.agenda_items a on a.id = o.agenda_item_id
      where o.meeting_id = m.id and o.deleted_at is null and a.deleted_at is null and a.standard_key is null), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.full_name, ''), 'Medlem')))
      from public.committee_members cm join public.profiles p on p.id = cm.user_id
      where cm.committee_id = m.committee_id and cm.organization_id = m.organization_id and cm.status = 'active'), '[]'::jsonb),
    'snapshots', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'sent_at', d.sent_at,
      'delivery_status', d.delivery_status, 'task_snapshot', d.task_snapshot) order by d.sent_at desc)
      from public.meeting_material_dispatches d where d.meeting_id = m.id and d.task_snapshot <> '[]'::jsonb), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.read_meeting_task_follow_up(uuid) from public, anon;
grant execute on function public.read_meeting_task_follow_up(uuid) to authenticated;

create function public.mutate_meeting_task_follow_up(target_meeting_id uuid, target_task_id uuid,
  request_id uuid, expected_version timestamptz, mutation jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.meetings; t public.tasks; before_value jsonb; occurrence uuid; item uuid;
  existing_event public.meeting_task_events; action_name text := mutation->>'action';
  note_text text := btrim(coalesce(mutation->>'note', ''));
begin
  -- Serialize meeting scheduling, then task mutation; duplicate requests are idempotent.
  select * into m from public.meetings where id = target_meeting_id and deleted_at is null for update;
  if m.id is null or auth.uid() is null or not public.can_edit_agenda_item(m.committee_id) then
    raise exception 'Ingen adgang til handlingen.' using errcode = '42501';
  end if;
  select * into t from public.tasks where id = target_task_id
    and organization_id = m.organization_id and committee_id = m.committee_id for update;
  if t.id is null then raise exception 'Opgaven tilhører ikke mødet.' using errcode = '42501'; end if;
  select * into existing_event from public.meeting_task_events where id = request_id;
  if existing_event.id is not null then
    if existing_event.meeting_id = m.id and existing_event.task_id = t.id and existing_event.actor_id = auth.uid() then return; end if;
    raise exception 'Ugyldig gentagelse.' using errcode = '42501';
  end if;
  if m.status not in ('draft', 'scheduled', 'in_progress') or exists
    (select 1 from public.meeting_minutes where meeting_id = m.id and status = 'approved') then
    raise exception 'Mødet er afsluttet eller referatet godkendt.' using errcode = '22023';
  end if;
  if t.archived_at is not null then raise exception 'Opgaven er arkiveret.' using errcode = '22023'; end if;
  if t.updated_at is distinct from expected_version then
    raise exception 'Opgaven er ændret af en anden. Opdatér oversigten og prøv igen.' using errcode = '40001';
  end if;
  if action_name not in ('update', 'link') or action_name is null or char_length(note_text) > 5000 then
    raise exception 'Ugyldig opgavehandling.' using errcode = '22023';
  end if;
  before_value := public.meeting_task_public_state(t);
  if action_name = 'link' then
    if not public.can_manage_committee(m.committee_id) then
      raise exception 'Kun udvalgets ledelse kan planlægge punkter.' using errcode = '42501';
    end if;
    select l.occurrence_id into occurrence from public.meeting_task_links l
      join public.agenda_item_occurrences o on o.id = l.occurrence_id
      join public.agenda_items a on a.id = o.agenda_item_id
      where l.meeting_id = m.id and l.task_id = t.id and o.deleted_at is null and a.deleted_at is null;
    if occurrence is not null then return; end if;
    if mutation->>'occurrenceId' is not null then
      select o.id into occurrence from public.agenda_item_occurrences o
        join public.agenda_items a on a.id = o.agenda_item_id
        where o.id = (mutation->>'occurrenceId')::uuid and o.meeting_id = m.id
          and o.organization_id = m.organization_id and o.committee_id = m.committee_id
          and o.deleted_at is null and a.deleted_at is null and a.standard_key is null;
      if occurrence is null then raise exception 'Punktet tilhører ikke mødet.' using errcode = '42501'; end if;
    else
      -- Reuse the durable agenda item on subsequent meetings when available.
      select o.agenda_item_id into item from public.meeting_task_links l
        join public.agenda_item_occurrences o on o.id = l.occurrence_id
        join public.agenda_items a on a.id = o.agenda_item_id
        where l.task_id = t.id and l.organization_id = m.organization_id and l.committee_id = m.committee_id
          and a.deleted_at is null and a.standard_key is null order by l.meeting_id limit 1;
      if item is null then
        insert into public.agenda_items(organization_id, committee_id, title, description, item_type, lifecycle_status, source, created_by)
        values(m.organization_id, m.committee_id, t.title, t.description, 'discussion', 'scheduled', 'meeting', auth.uid()) returning id into item;
      end if;
      select id into occurrence from public.agenda_item_occurrences where meeting_id = m.id and agenda_item_id = item and deleted_at is null;
      if occurrence is null then
        -- A soft-deleted occurrence still occupies the unique item/meeting key.
        select id into occurrence from public.agenda_item_occurrences where meeting_id = m.id and agenda_item_id = item;
        if occurrence is not null then
          raise exception 'Punktet ligger i papirkurven. Bed en administrator gendanne det, eller vælg et andet punkt.' using errcode = '22023';
        else
          insert into public.agenda_item_occurrences(organization_id, committee_id, meeting_id, agenda_item_id, position)
          select m.organization_id, m.committee_id, m.id, item, coalesce(max(position), -1) + 1
          from public.agenda_item_occurrences where meeting_id = m.id returning id into occurrence;
        end if;
      end if;
    end if;
    insert into public.meeting_task_links values(m.organization_id, m.committee_id, m.id, t.id, occurrence)
      on conflict (meeting_id, task_id) do update set occurrence_id = excluded.occurrence_id;
  else
    if mutation ? 'responsibleUserId' and mutation->>'responsibleUserId' is not null and not exists (
      select 1 from public.committee_members where organization_id = m.organization_id and committee_id = m.committee_id
        and user_id = (mutation->>'responsibleUserId')::uuid and status = 'active'
    ) then raise exception 'Ansvarlig skal være aktivt udvalgsmedlem.' using errcode = '22023'; end if;
    update public.tasks set
      status = case when mutation ? 'status' then (mutation->>'status')::public.task_status else status end,
      deadline = case when mutation ? 'deadline' then (mutation->>'deadline')::date else deadline end,
      responsible_user_id = case when mutation ? 'responsibleUserId' then (mutation->>'responsibleUserId')::uuid else responsible_user_id end,
      is_critical = case when mutation ? 'isCritical' then (mutation->>'isCritical')::boolean else is_critical end,
      completed_at = case when coalesce(mutation->>'status', status::text) = 'completed' then coalesce(completed_at, now()) else null end,
      updated_by = auth.uid(), updated_at = clock_timestamp()
      where id = t.id returning * into t;
    if note_text <> '' then
      insert into public.task_comments(task_id, organization_id, committee_id, body, created_by)
        values(t.id, m.organization_id, m.committee_id, note_text, auth.uid());
    end if;
    -- Preserve the existing Annual Wheel completion workflow, in this transaction.
    if t.status = 'completed' and t.annual_wheel_event_id is not null and t.annual_wheel_activation_year is not null then
      update public.annual_wheel_events set status = 'completed', updated_by = auth.uid()
        where id = t.annual_wheel_event_id and organization_id = m.organization_id and status <> 'cancelled'
          and not exists (select 1 from public.tasks sibling where sibling.annual_wheel_event_id = t.annual_wheel_event_id
            and sibling.annual_wheel_activation_year = t.annual_wheel_activation_year and sibling.status <> 'completed');
    end if;
  end if;
  insert into public.meeting_task_events(id, organization_id, committee_id, meeting_id, task_id, actor_id, action, note, before_state, after_state)
    values(request_id, m.organization_id, m.committee_id, m.id, t.id, auth.uid(), action_name, note_text, before_value, public.meeting_task_public_state(t));
end;
$$;
revoke all on function public.mutate_meeting_task_follow_up(uuid, uuid, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.mutate_meeting_task_follow_up(uuid, uuid, uuid, timestamptz, jsonb) to authenticated;

-- Explicit upgrade for existing active meetings, also used by meeting creation.
create function public.ensure_meeting_task_follow_up(target_meeting_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.meetings; item uuid; occurrence uuid;
begin
  select * into m from public.meetings where id = target_meeting_id and deleted_at is null for update;
  if m.id is null or auth.uid() is null or not public.can_manage_committee(m.committee_id) then
    raise exception 'Ingen adgang til mødet.' using errcode = '42501'; end if;
  if m.status not in ('draft', 'scheduled', 'in_progress') or exists
    (select 1 from public.meeting_minutes where meeting_id = m.id and status = 'approved') then
    raise exception 'Mødet er afsluttet eller referatet godkendt.' using errcode = '22023'; end if;
  select o.id into occurrence from public.agenda_item_occurrences o join public.agenda_items a on a.id = o.agenda_item_id
    where o.meeting_id = m.id and a.standard_key = 'task_follow_up';
  if occurrence is not null then
    if exists (select 1 from public.agenda_item_occurrences o join public.agenda_items a on a.id = o.agenda_item_id
      where o.id = occurrence and (o.deleted_at is not null or a.deleted_at is not null)) then
      raise exception 'Systempunktet ligger i papirkurven. Bed en administrator gendanne det.' using errcode = '22023';
    end if;
    return occurrence;
  end if;
  insert into public.agenda_items(organization_id, committee_id, title, item_type, lifecycle_status, source, standard_key, created_by)
    values(m.organization_id, m.committee_id, 'Opgaver & opfølgning', 'follow_up', 'scheduled', 'meeting', 'task_follow_up', auth.uid()) returning id into item;
  insert into public.agenda_item_occurrences(organization_id, committee_id, meeting_id, agenda_item_id, position)
    select m.organization_id, m.committee_id, m.id, item, coalesce(max(position), -1) + 1
    from public.agenda_item_occurrences where meeting_id = m.id returning id into occurrence;
  return occurrence;
end;
$$;
revoke all on function public.ensure_meeting_task_follow_up(uuid) from public, anon;
grant execute on function public.ensure_meeting_task_follow_up(uuid) to authenticated;

create or replace function public.create_meeting_with_standard_items(
  target_organization_id uuid,
  target_committee_id uuid,
  meeting_title text,
  meeting_description text,
  meeting_starts_at timestamptz,
  meeting_ends_at timestamptz default null,
  meeting_location text default null
)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_meeting public.meetings;
  agenda_approval_id uuid;
  previous_minutes_approval_id uuid;
  any_other_business_id uuid;
  task_follow_up_id uuid;
begin
  if not public.can_manage_committee(target_committee_id) then
    raise exception 'Kun udvalgets formand eller sekretær kan oprette møder.';
  end if;

  if not exists (
    select 1
    from public.committees c
    where c.id = target_committee_id
      and c.organization_id = target_organization_id
      and c.archived_at is null
  ) then
    raise exception 'Udvalget matcher ikke organisationen.';
  end if;

  insert into public.meetings (
    organization_id,
    committee_id,
    title,
    description,
    status,
    starts_at,
    ends_at,
    location,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    meeting_title,
    meeting_description,
    'scheduled',
    meeting_starts_at,
    meeting_ends_at,
    meeting_location,
    auth.uid()
  )
  returning * into created_meeting;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    title,
    item_type,
    lifecycle_status,
    source,
    standard_key,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    'Godkendelse af dagsorden',
    'decision',
    'scheduled',
    'meeting',
    'agenda_approval',
    auth.uid()
  )
  returning id into agenda_approval_id;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    title,
    item_type,
    lifecycle_status,
    source,
    standard_key,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    'Godkendelse af seneste referat',
    'decision',
    'scheduled',
    'meeting',
    'previous_minutes_approval',
    auth.uid()
  )
  returning id into previous_minutes_approval_id;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    title,
    item_type,
    lifecycle_status,
    source,
    standard_key,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    'Eventuelt',
    'information',
    'scheduled',
    'meeting',
    'any_other_business',
    auth.uid()
  )
  returning id into any_other_business_id;

  insert into public.agenda_items(organization_id, committee_id, title, item_type, lifecycle_status, source, standard_key, created_by)
  values(target_organization_id, target_committee_id, 'Opgaver & opfølgning', 'follow_up', 'scheduled', 'meeting', 'task_follow_up', auth.uid())
  returning id into task_follow_up_id;

  insert into public.agenda_item_occurrences (
    organization_id,
    committee_id,
    agenda_item_id,
    meeting_id,
    position
  )
  values
    (
      target_organization_id,
      target_committee_id,
      agenda_approval_id,
      created_meeting.id,
      0
    ),
    (
      target_organization_id,
      target_committee_id,
      previous_minutes_approval_id,
      created_meeting.id,
      1
    ),
    (
      target_organization_id,
      target_committee_id,
      task_follow_up_id,
      created_meeting.id,
      2
    ),
    (
      target_organization_id,
      target_committee_id,
      any_other_business_id,
      created_meeting.id,
      3
    );

  perform public.continue_agenda_items_on_meeting(created_meeting.id);

  return created_meeting;
end;
$$;

revoke all on function public.create_meeting_with_standard_items(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) from public, anon;

grant execute on function public.create_meeting_with_standard_items(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) to authenticated;
