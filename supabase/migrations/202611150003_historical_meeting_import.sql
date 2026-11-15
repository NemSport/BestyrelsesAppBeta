alter table public.meetings add column historical_import_hash text
  check (historical_import_hash ~ '^[0-9a-f]{64}$');

create unique index meetings_historical_import_once
  on public.meetings (organization_id, committee_id, historical_import_hash)
  where historical_import_hash is not null and deleted_at is null;

create policy ai_activity_log_read_own_meeting_import on public.ai_activity_log
for select to authenticated using (
  field = 'historical_meeting_import' and user_id = auth.uid()
  and exists (
    select 1 from public.committees c where c.organization_id = ai_activity_log.organization_id
      and c.id::text = metadata->>'committeeId' and c.deleted_at is null and public.can_manage_committee(c.id)
  )
);
create policy ai_activity_log_insert_own_meeting_import on public.ai_activity_log
for insert to authenticated with check (
  field = 'historical_meeting_import' and user_id = auth.uid() and meeting_id is null and agenda_item_id is null
  and exists (
    select 1 from public.committees c where c.organization_id = ai_activity_log.organization_id
      and c.id::text = metadata->>'committeeId' and c.deleted_at is null and public.can_manage_committee(c.id)
  )
);

create function public.historical_meeting_import_markup(content text)
returns text language sql immutable strict security invoker set search_path = '' as $$
  select case when content = '' then '' else '<p>' ||
    replace(replace(replace(replace(content, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), chr(10), '<br>') || '</p>' end;
$$;
revoke all on function public.historical_meeting_import_markup(text) from public, anon;
grant execute on function public.historical_meeting_import_markup(text) to authenticated;

create function public.save_historical_meeting_import(
  target_organization uuid, target_committee uuid, target_analysis uuid, proposal jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  audit public.ai_activity_log%rowtype;
  meeting_day date := (proposal->>'date')::date;
  meeting_start timestamptz := (meeting_day + coalesce(nullif(proposal->>'time','')::time, time '12:00')) at time zone 'Europe/Copenhagen';
  meeting_id_new uuid;
  agenda_id_new uuid;
  occurrence_id_new uuid;
  point jsonb;
  entry jsonb;
  position_new integer := 0;
begin
  if actor is null or not public.can_manage_committee(target_committee)
    or not exists (
      select 1 from public.committees c join public.organizations o on o.id=c.organization_id
      where c.id=target_committee and c.organization_id=target_organization
        and c.deleted_at is null and c.archived_at is null and o.deleted_at is null
    )
  then raise exception 'Historical import requires a committee manager' using errcode='42501'; end if;

  select * into audit from public.ai_activity_log
  where id=target_analysis and organization_id=target_organization and user_id=actor
    and field='historical_meeting_import' and metadata->>'committeeId'=target_committee::text
  for update;
  if not found or audit.metadata->>'phase' is distinct from 'generated'
    or coalesce(audit.metadata->>'hash','') !~ '^[0-9a-f]{64}$'
  then raise exception 'Missing import preview' using errcode='P0002'; end if;
  if audit.status='applied' and audit.meeting_id is not null then return audit.meeting_id; end if;
  if audit.status<>'generated' then raise exception 'Invalid import preview' using errcode='P0002'; end if;
  if meeting_start is null or meeting_start>now()
  then raise exception 'Historical meeting must be in the past' using errcode='22007'; end if;
  if jsonb_typeof(proposal->'items') is distinct from 'array' or jsonb_array_length(proposal->'items')>20
  then raise exception 'Invalid agenda items' using errcode='22023'; end if;

  insert into public.meetings (organization_id,committee_id,title,starts_at,location,status,created_by,historical_import_hash)
  values(target_organization,target_committee,proposal->>'title',meeting_start,nullif(proposal->>'location',''),'completed',actor,audit.metadata->>'hash')
  returning id into meeting_id_new;

  insert into public.meeting_minutes (organization_id,committee_id,meeting_id,minutes_text,status,created_by,updated_by)
  values(target_organization,target_committee,meeting_id_new,
    public.historical_meeting_import_markup(coalesce(proposal->>'summary','')),'draft',actor,actor);

  for point in select value from jsonb_array_elements(proposal->'items') loop
    if jsonb_typeof(point->'decisions') is distinct from 'array' or jsonb_array_length(point->'decisions')>8
      or jsonb_typeof(point->'tasks') is distinct from 'array' or jsonb_array_length(point->'tasks')>8
    then raise exception 'Invalid decision or task list' using errcode='22023'; end if;

    insert into public.agenda_items (organization_id,committee_id,title,lifecycle_status,resolved_at,created_by)
    values(target_organization,target_committee,point->>'title','resolved',meeting_start,actor) returning id into agenda_id_new;
    insert into public.agenda_item_occurrences (organization_id,committee_id,meeting_id,agenda_item_id,position,meeting_status)
    values(target_organization,target_committee,meeting_id_new,agenda_id_new,position_new,'discussed') returning id into occurrence_id_new;
    position_new := position_new+1;

    insert into public.agenda_item_minutes (organization_id,committee_id,meeting_id,agenda_item_id,agenda_item_occurrence_id,notes,created_by,updated_by)
    values(target_organization,target_committee,meeting_id_new,agenda_id_new,occurrence_id_new,
      public.historical_meeting_import_markup(coalesce(point->>'notes','')),actor,actor);

    for entry in select value from jsonb_array_elements(point->'decisions') loop
      insert into public.decisions (organization_id,committee_id,meeting_id,agenda_item_id,title,description,decision_date,status,created_by,updated_by)
      values(target_organization,target_committee,meeting_id_new,agenda_id_new,entry->>'title',coalesce(entry->>'details',''),meeting_day,
        (case when (entry->>'completed')::boolean then 'completed' else 'not_started' end)::public.decision_status,actor,actor);
    end loop;
    for entry in select value from jsonb_array_elements(point->'tasks') loop
      insert into public.tasks (organization_id,committee_id,meeting_id,agenda_item_id,title,description,deadline,responsible_user_id,status,created_by,updated_by)
      values(target_organization,target_committee,meeting_id_new,agenda_id_new,entry->>'title',
        concat_ws(E'\n',nullif(entry->>'details',''),
          case when nullif(entry->>'namedOwner','') is not null then 'Ansvarlig ifølge kilden: '||(entry->>'namedOwner') end),
        nullif(entry->>'deadline','')::date,nullif(entry->>'responsibleUserId','')::uuid,
        (case when (entry->>'completed')::boolean then 'completed' else 'not_started' end)::public.task_status,actor,actor);
    end loop;
  end loop;
  update public.ai_activity_log set status='applied', meeting_id=meeting_id_new where id=audit.id;
  return meeting_id_new;
end;
$$;
revoke all on function public.save_historical_meeting_import(uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_historical_meeting_import(uuid,uuid,uuid,jsonb) to authenticated;
