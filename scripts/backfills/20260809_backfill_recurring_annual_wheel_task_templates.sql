begin;

set local transaction isolation level serializable;

-- Prevent concurrent template writes while the zero-count guards and copies run.
lock table public.annual_wheel_task_templates in share row exclusive mode;

do $backfill$
declare
  expected record;
  active_source_count integer;
  active_target_count integer;
  inserted_count integer;
  total_inserted integer := 0;
begin
  -- Lock the two sources and four explicitly approved targets in a stable order.
  perform 1
  from public.annual_wheel_events
  where id in (
    '0e8daa40-3b98-4220-ac0c-bd5f3b08d66a'::uuid,
    '73547de5-a478-4bd2-b0ae-de34bccae08e'::uuid,
    '3e925f44-e82c-4159-ab4e-54a176fbc2e0'::uuid,
    '4ae13a27-5a69-4ffd-8f81-1e7f852990a8'::uuid,
    '36ffa7d9-e61b-4d3a-a415-695a2ab0f844'::uuid,
    '1888861d-3a9f-4756-990c-82be3f4007aa'::uuid
  )
  order by id
  for update;

  if not found then
    raise exception 'Annual Wheel backfill aborted: expected events are missing';
  end if;

  for expected in
    select *
    from (
      values
        ('0e8daa40-3b98-4220-ac0c-bd5f3b08d66a'::uuid, '73547de5-a478-4bd2-b0ae-de34bccae08e'::uuid, '7e79c243-75fa-4549-810d-fe632aa32c65'::uuid, 1, 2, 'e6ecd5dd-163c-4947-833e-0b2f7c86ff0c'::uuid, 'caf2f55b-f24f-41fa-bc18-8b0781f2e8ef'::uuid, 8),
        ('0e8daa40-3b98-4220-ac0c-bd5f3b08d66a'::uuid, '3e925f44-e82c-4159-ab4e-54a176fbc2e0'::uuid, '7e79c243-75fa-4549-810d-fe632aa32c65'::uuid, 1, 3, 'e6ecd5dd-163c-4947-833e-0b2f7c86ff0c'::uuid, 'caf2f55b-f24f-41fa-bc18-8b0781f2e8ef'::uuid, 8),
        ('4ae13a27-5a69-4ffd-8f81-1e7f852990a8'::uuid, '36ffa7d9-e61b-4d3a-a415-695a2ab0f844'::uuid, 'b2c1387b-b6f0-45df-a44d-b8681750c4dd'::uuid, 0, 2, 'e6ecd5dd-163c-4947-833e-0b2f7c86ff0c'::uuid, 'ad801205-d0e7-43c2-a904-5e0f7285f4b2'::uuid, 7),
        ('4ae13a27-5a69-4ffd-8f81-1e7f852990a8'::uuid, '1888861d-3a9f-4756-990c-82be3f4007aa'::uuid, 'b2c1387b-b6f0-45df-a44d-b8681750c4dd'::uuid, 0, 3, 'e6ecd5dd-163c-4947-833e-0b2f7c86ff0c'::uuid, 'ad801205-d0e7-43c2-a904-5e0f7285f4b2'::uuid, 7)
    ) as approved(source_event_id, target_event_id, series_id, source_occurrence_index, target_occurrence_index, organization_id, committee_id, expected_template_count)
  loop
    if not exists (
      select 1
      from public.annual_wheel_events source_event
      where source_event.id = expected.source_event_id
        and source_event.series_id = expected.series_id
        and source_event.occurrence_index = expected.source_occurrence_index
        and source_event.organization_id = expected.organization_id
        and source_event.committee_id is not distinct from expected.committee_id
        and source_event.deleted_at is null
    ) then
      raise exception 'Annual Wheel backfill aborted: source % scope or occurrence does not match', expected.source_event_id;
    end if;

    if not exists (
      select 1
      from public.annual_wheel_events target_event
      where target_event.id = expected.target_event_id
        and target_event.series_id = expected.series_id
        and target_event.occurrence_index = expected.target_occurrence_index
        and target_event.organization_id = expected.organization_id
        and target_event.committee_id is not distinct from expected.committee_id
        and target_event.deleted_at is null
    ) then
      raise exception 'Annual Wheel backfill aborted: target % scope or occurrence does not match', expected.target_event_id;
    end if;

    select count(*) into active_source_count
    from public.annual_wheel_task_templates source_template
    where source_template.annual_wheel_event_id = expected.source_event_id
      and source_template.organization_id = expected.organization_id
      and source_template.archived_at is null;

    if active_source_count <> expected.expected_template_count then
      raise exception 'Annual Wheel backfill aborted: source % has % active templates, expected %', expected.source_event_id, active_source_count, expected.expected_template_count;
    end if;

    select count(*) into active_target_count
    from public.annual_wheel_task_templates target_template
    where target_template.annual_wheel_event_id = expected.target_event_id
      and target_template.archived_at is null;

    if active_target_count = 0 then
      insert into public.annual_wheel_task_templates (
        id,
        organization_id,
        annual_wheel_event_id,
        title,
        description,
        suggested_responsible_user_id,
        deadline_anchor,
        deadline_offset_days,
        sort_order,
        created_by,
        updated_by
      )
      select
        gen_random_uuid(),
        expected.organization_id,
        expected.target_event_id,
        source_template.title,
        source_template.description,
        source_template.suggested_responsible_user_id,
        source_template.deadline_anchor,
        source_template.deadline_offset_days,
        source_template.sort_order,
        source_template.created_by,
        source_template.updated_by
      from public.annual_wheel_task_templates source_template
      where source_template.annual_wheel_event_id = expected.source_event_id
        and source_template.organization_id = expected.organization_id
        and source_template.archived_at is null
      order by source_template.sort_order, source_template.id;

      get diagnostics inserted_count = row_count;

      if inserted_count <> expected.expected_template_count then
        raise exception 'Annual Wheel backfill aborted: target % received % templates, expected %', expected.target_event_id, inserted_count, expected.expected_template_count;
      end if;

      total_inserted := total_inserted + inserted_count;
    elsif active_target_count = expected.expected_template_count
      and not exists (
        (
          select title, description, suggested_responsible_user_id, deadline_anchor, deadline_offset_days, sort_order
          from public.annual_wheel_task_templates
          where annual_wheel_event_id = expected.source_event_id
            and organization_id = expected.organization_id
            and archived_at is null
          except all
          select title, description, suggested_responsible_user_id, deadline_anchor, deadline_offset_days, sort_order
          from public.annual_wheel_task_templates
          where annual_wheel_event_id = expected.target_event_id
            and organization_id = expected.organization_id
            and archived_at is null
        )
        union all
        (
          select title, description, suggested_responsible_user_id, deadline_anchor, deadline_offset_days, sort_order
          from public.annual_wheel_task_templates
          where annual_wheel_event_id = expected.target_event_id
            and organization_id = expected.organization_id
            and archived_at is null
          except all
          select title, description, suggested_responsible_user_id, deadline_anchor, deadline_offset_days, sort_order
          from public.annual_wheel_task_templates
          where annual_wheel_event_id = expected.source_event_id
            and organization_id = expected.organization_id
            and archived_at is null
        )
      ) then
      null;
    else
      raise exception 'Annual Wheel backfill aborted: target % has % active templates and is not an exact copy', expected.target_event_id, active_target_count;
    end if;
  end loop;

  raise notice 'Annual Wheel fixed-template backfill inserted % rows', total_inserted;
end;
$backfill$;

commit;
