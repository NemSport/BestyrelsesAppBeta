create or replace function public.respond_to_meeting_minutes_approval(
  target_meeting_minutes_id uuid,
  response_status public.meeting_minute_approval_status,
  response_comment text default null
)
returns public.meeting_minute_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.meeting_minute_approvals;
begin
  if response_status not in ('approved', 'change_requested') then
    raise exception 'Godkendelsessvaret er ugyldigt.';
  end if;

  if response_status = 'change_requested'
    and nullif(btrim(coalesce(response_comment, '')), '') is null then
    raise exception 'Begrundelse for ændringer skal udfyldes.';
  end if;

  -- Serialize responses, manual approvals, expiry and new approval rounds per referat.
  perform 1 from public.meeting_minutes
  where id = target_meeting_minutes_id
  for update;

  if not public.can_approve_meeting_minutes(target_meeting_minutes_id) then
    raise exception 'Du har ikke adgang til at godkende dette referat.';
  end if;

  update public.meeting_minute_approvals
  set status = response_status,
      comment = case
        when response_status = 'change_requested' then btrim(response_comment)
        else null
      end,
      responded_at = now(),
      updated_by = auth.uid()
  where meeting_minutes_id = target_meeting_minutes_id
    and user_id = auth.uid()
    and (status <> 'approved' or updated_by = auth.uid())
  returning * into result;

  if result.id is null then
    raise exception 'Referatet er ikke sendt til dig til godkendelse.';
  end if;

  if response_status = 'change_requested' then
    update public.meeting_minutes
    set status = 'ready_for_approval',
        updated_by = auth.uid()
    where id = target_meeting_minutes_id;
  elsif not exists (
    select 1
    from public.meeting_minute_approvals
    where meeting_minutes_id = target_meeting_minutes_id
      and status <> 'approved'
  ) then
    update public.meeting_minutes
    set status = 'approved',
        updated_by = auth.uid()
    where id = target_meeting_minutes_id;
  end if;

  return result;
end;
$$;

create or replace function public.mark_missing_approval_responses(
  target_meeting_minutes_id uuid
)
returns setof public.meeting_minute_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutes_record public.meeting_minutes;
begin
  select *
  into minutes_record
  from public.meeting_minutes
  where id = target_meeting_minutes_id
  for update;

  if minutes_record.id is null then
    raise exception 'Referatet blev ikke fundet.';
  end if;

  if not public.can_manage_committee(minutes_record.committee_id) then
    raise exception 'Du har ikke adgang til at afslutte manglende svar.';
  end if;

  if minutes_record.approval_deadline is null
    or minutes_record.approval_deadline >= current_date then
    raise exception 'Godkendelsesfristen er ikke overskredet endnu.';
  end if;

  update public.meeting_minute_approvals
  set status = 'no_response',
      comment = 'Ingen respons inden frist',
      responded_at = now(),
      updated_by = auth.uid()
  where meeting_minutes_id = target_meeting_minutes_id
    and status = 'pending';

  if not exists (
    select 1
    from public.meeting_minute_approvals
    where meeting_minutes_id = target_meeting_minutes_id
      and status <> 'approved'
  ) then
    update public.meeting_minutes
    set status = 'approved',
        updated_by = auth.uid()
    where id = target_meeting_minutes_id;
  end if;

  return query
  select *
  from public.meeting_minute_approvals
  where meeting_minutes_id = target_meeting_minutes_id
  order by created_at;
end;
$$;

create function public.record_manual_meeting_minutes_approval(
  target_meeting_minutes_id uuid,
  target_approval_id uuid
)
returns public.meeting_minute_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  minutes_record public.meeting_minutes;
  result public.meeting_minute_approvals;
begin
  select mm.* into minutes_record
  from public.meeting_minutes mm
  join public.meetings m on m.id = mm.meeting_id
    and m.organization_id = mm.organization_id and m.committee_id = mm.committee_id
  join public.committees c on c.id = mm.committee_id and c.organization_id = mm.organization_id
  join public.organizations o on o.id = mm.organization_id
  where mm.id = target_meeting_minutes_id
    and m.deleted_at is null and m.status <> 'cancelled'
    and c.deleted_at is null and c.archived_at is null and o.deleted_at is null
  for update of mm;

  if actor is null or minutes_record.id is null
    or not public.can_manage_committee(minutes_record.committee_id) then
    raise exception 'Du har ikke adgang til at godkende på vegne af dette medlem.' using errcode = '42501';
  end if;

  select * into result
  from public.meeting_minute_approvals
  where meeting_minutes_id = minutes_record.id and id = target_approval_id;

  if result.user_id = actor then
    raise exception 'Godkend dit eget referat med dit personlige svar.' using errcode = '42501';
  end if;

  if result.status = 'approved' then
    return result;
  end if;

  if result.id is null
    or result.status not in ('pending', 'no_response')
    or (minutes_record.status <> 'ready_for_approval'
        and not (minutes_record.status = 'approved' and result.status = 'no_response')) then
    raise exception 'Der er ingen manglende godkendelse at registrere for medlemmet.' using errcode = '22023';
  end if;

  update public.meeting_minute_approvals
  set status = 'approved', comment = null, responded_at = now(), updated_by = actor
  where id = result.id
  returning * into result;

  if not exists (
    select 1
    from public.meeting_minute_approvals
    where meeting_minutes_id = minutes_record.id and status <> 'approved'
  ) then
    update public.meeting_minutes set status = 'approved', updated_by = actor
    where id = minutes_record.id and status <> 'approved';
  end if;

  return result;
end;
$$;

revoke all on function public.record_manual_meeting_minutes_approval(uuid, uuid) from public, anon;
grant execute on function public.record_manual_meeting_minutes_approval(uuid, uuid) to authenticated;
