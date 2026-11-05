-- Existing updated_by/responded_at retain actor identity. The server-authored
-- comment snapshots the actor's name and is also included in the minutes PDF.
create or replace function public.approve_meeting_minutes_on_behalf(
  target_meeting_minutes_id uuid,
  target_user_id uuid
)
returns public.meeting_minute_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutes public.meeting_minutes;
  result public.meeting_minute_approvals;
  actor_name text;
begin
  select * into minutes from public.meeting_minutes
  where id = target_meeting_minutes_id for update;
  if minutes.id is null or not public.is_organization_admin(minutes.organization_id) then
    raise exception 'Kun organisationens administratorer kan godkende på vegne af deltagere.' using errcode = '42501';
  end if;
  if minutes.status not in ('ready_for_approval', 'approved') then
    raise exception 'Referatet er ikke sendt til godkendelse.';
  end if;
  if not exists (select 1 from public.meetings m where m.id = minutes.meeting_id
    and m.organization_id = minutes.organization_id and m.committee_id = minutes.committee_id
    and m.deleted_at is null) then
    raise exception 'Mødet findes ikke.';
  end if;
  select * into result from public.meeting_minute_approvals
  where meeting_minutes_id = minutes.id and user_id = target_user_id
    and organization_id = minutes.organization_id and committee_id = minutes.committee_id
    and meeting_id = minutes.meeting_id for update;
  if result.id is null then
    raise exception 'Deltageren er ikke modtager i denne godkendelsesrunde.';
  end if;
  -- Retries must not overwrite the original approver or timestamp.
  if result.status = 'approved' then return result; end if;
  select coalesce(nullif(full_name, ''), email, auth.uid()::text) into actor_name
  from public.profiles where id = auth.uid();
  update public.meeting_minute_approvals
  set status = 'approved', responded_at = now(), updated_by = auth.uid(),
      comment = format('Godkendt af %s på vegne af deltageren.%s', actor_name,
        case when nullif(result.comment, '') is not null
          then E'\nTidligere kommentar: ' || result.comment else '' end)
  where id = result.id returning * into result;
  if not exists (select 1 from public.meeting_minute_approvals
    where meeting_minutes_id = minutes.id and status in ('pending', 'change_requested')) then
    update public.meeting_minutes set status = 'approved', updated_by = auth.uid()
    where id = minutes.id;
  end if;
  return result;
end;
$$;
revoke all on function public.approve_meeting_minutes_on_behalf(uuid, uuid) from public, anon;
grant execute on function public.approve_meeting_minutes_on_behalf(uuid, uuid) to authenticated;
