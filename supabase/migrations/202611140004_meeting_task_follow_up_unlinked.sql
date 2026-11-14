create or replace function public.read_meeting_task_follow_up(target_meeting_id uuid)
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
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('task_id', linked.task_id, 'occurrence_id', linked.occurrence_id))
      from (
        select distinct on (candidates.task_id) candidates.task_id, candidates.occurrence_id
        from (
          select l.task_id, o.id as occurrence_id, 0 as priority
          from public.meeting_task_links l
          join public.agenda_item_occurrences o on o.id = l.occurrence_id and o.meeting_id = m.id
          join public.agenda_items a on a.id = o.agenda_item_id
          where l.meeting_id = m.id and o.deleted_at is null and a.deleted_at is null
            and a.standard_key is distinct from 'task_follow_up'
          union all
          select t.id, o.id, 1
          from public.tasks t
          join public.agenda_item_occurrences o on o.agenda_item_id = t.agenda_item_id and o.meeting_id = m.id
          join public.agenda_items a on a.id = o.agenda_item_id
          where t.organization_id = m.organization_id and t.committee_id = m.committee_id
            and t.archived_at is null and o.deleted_at is null and a.deleted_at is null
            and a.standard_key is distinct from 'task_follow_up'
          union all
          select t.id, o.id, 2
          from public.transferred_agenda_items transfer
          join public.tasks t on t.agenda_item_id = transfer.source_agenda_item_id
          join public.agenda_item_occurrences o on o.agenda_item_id = transfer.target_agenda_item_id and o.meeting_id = m.id
          join public.agenda_items a on a.id = o.agenda_item_id
          where transfer.target_meeting_id = m.id and transfer.status = 'scheduled'
            and transfer.organization_id = m.organization_id and transfer.committee_id = m.committee_id
            and t.organization_id = m.organization_id and t.committee_id = m.committee_id
            and t.archived_at is null and t.status not in ('completed', 'cancelled')
            and o.deleted_at is null and a.deleted_at is null and a.standard_key is distinct from 'task_follow_up'
        ) candidates
        order by candidates.task_id, candidates.priority, candidates.occurrence_id
      ) linked
    ), '[]'::jsonb),
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
