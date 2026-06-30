create or replace function public.send_meeting_minutes_for_approval(
  target_meeting_minutes_id uuid,
  target_deadline date
)
returns public.meeting_minutes
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.meeting_minutes;
  registered_internal_count integer := 0;
  recipient_count integer := 0;
begin
  select *
  into result
  from public.meeting_minutes
  where id = target_meeting_minutes_id;

  if result.id is null then
    raise exception 'Referatet blev ikke fundet.';
  end if;

  if not public.can_manage_committee(result.committee_id) then
    raise exception 'Du har ikke adgang til at sende referatet til godkendelse.';
  end if;

  if target_deadline < current_date then
    raise exception 'Godkendelsesfristen kan ikke ligge i fortiden.';
  end if;

  select count(*)
  into registered_internal_count
  from public.meeting_attendees ma
  where ma.organization_id = result.organization_id
    and ma.committee_id = result.committee_id
    and ma.meeting_id = result.meeting_id
    and ma.attendance_status::text in ('accepted', 'attended', 'absent', 'excused');

  if registered_internal_count > 0 then
    select count(*)
    into recipient_count
    from public.meeting_attendees ma
    join public.committee_members cm
      on cm.organization_id = ma.organization_id
      and cm.committee_id = ma.committee_id
      and cm.user_id = ma.user_id
    where ma.organization_id = result.organization_id
      and ma.committee_id = result.committee_id
      and ma.meeting_id = result.meeting_id
      and ma.attendance_status::text in ('accepted', 'attended')
      and cm.status = 'active'
      and cm.voting_rights
      and cm.role in ('chair', 'secretary', 'member');
  else
    select count(*)
    into recipient_count
    from public.committee_members cm
    where cm.organization_id = result.organization_id
      and cm.committee_id = result.committee_id
      and cm.status = 'active'
      and cm.voting_rights
      and cm.role in ('chair', 'secretary', 'member');
  end if;

  if recipient_count = 0 then
    if registered_internal_count > 0 then
      raise exception 'Ingen interne deltagere er markeret som til stede og kan modtage referatet til godkendelse.';
    end if;
    raise exception 'Udvalget har ingen aktive stemmeberettigede medlemmer.';
  end if;

  update public.meeting_minutes
  set status = 'ready_for_approval',
      approval_deadline = target_deadline,
      updated_by = auth.uid()
  where id = target_meeting_minutes_id
  returning * into result;

  delete from public.meeting_minute_approvals
  where meeting_minutes_id = target_meeting_minutes_id;

  if registered_internal_count > 0 then
    insert into public.meeting_minute_approvals (
      organization_id,
      committee_id,
      meeting_id,
      meeting_minutes_id,
      user_id,
      status,
      comment,
      responded_at,
      created_by,
      updated_by
    )
    select
      result.organization_id,
      result.committee_id,
      result.meeting_id,
      result.id,
      ma.user_id,
      'pending',
      null,
      null,
      auth.uid(),
      auth.uid()
    from public.meeting_attendees ma
    join public.committee_members cm
      on cm.organization_id = ma.organization_id
      and cm.committee_id = ma.committee_id
      and cm.user_id = ma.user_id
    where ma.organization_id = result.organization_id
      and ma.committee_id = result.committee_id
      and ma.meeting_id = result.meeting_id
      and ma.attendance_status::text in ('accepted', 'attended')
      and cm.status = 'active'
      and cm.voting_rights
      and cm.role in ('chair', 'secretary', 'member');
  else
    insert into public.meeting_minute_approvals (
      organization_id,
      committee_id,
      meeting_id,
      meeting_minutes_id,
      user_id,
      status,
      comment,
      responded_at,
      created_by,
      updated_by
    )
    select
      result.organization_id,
      result.committee_id,
      result.meeting_id,
      result.id,
      cm.user_id,
      'pending',
      null,
      null,
      auth.uid(),
      auth.uid()
    from public.committee_members cm
    where cm.organization_id = result.organization_id
      and cm.committee_id = result.committee_id
      and cm.status = 'active'
      and cm.voting_rights
      and cm.role in ('chair', 'secretary', 'member');
  end if;

  return result;
end;
$$;
