create or replace function public.claim_meeting_minutes_referent(
  target_meeting_id uuid,
  lease_seconds integer default 90
)
returns table (
  id uuid,
  organization_id uuid,
  committee_id uuid,
  meeting_id uuid,
  user_id uuid,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  claimed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_record record;
  current_lock public.meeting_minutes_referent_locks;
  next_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.organization_id, m.committee_id
  into meeting_record
  from public.meetings m
  where m.id = target_meeting_id
    and m.deleted_at is null;

  if meeting_record is null then
    raise exception 'Meeting not found';
  end if;

  if not public.can_manage_committee(meeting_record.committee_id) then
    raise exception 'Not authorized to claim meeting minutes referent role';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('minutes-referent:' || target_meeting_id::text, 0));
  next_expires_at := now() + make_interval(secs => greatest(30, least(lease_seconds, 600)));

  select *
  into current_lock
  from public.meeting_minutes_referent_locks ml
  where ml.meeting_id = target_meeting_id
  for update;

  if current_lock is null then
    insert into public.meeting_minutes_referent_locks (
      organization_id,
      committee_id,
      meeting_id,
      user_id,
      expires_at
    )
    values (
      meeting_record.organization_id,
      meeting_record.committee_id,
      target_meeting_id,
      auth.uid(),
      next_expires_at
    )
    returning * into current_lock;

    return query select
      current_lock.id,
      current_lock.organization_id,
      current_lock.committee_id,
      current_lock.meeting_id,
      current_lock.user_id,
      current_lock.expires_at,
      current_lock.created_at,
      current_lock.updated_at,
      true;
    return;
  end if;

  if current_lock.user_id = auth.uid()
     or current_lock.expires_at <= now() then
    update public.meeting_minutes_referent_locks
    set user_id = auth.uid(),
        expires_at = next_expires_at
    where meeting_minutes_referent_locks.meeting_id = target_meeting_id
    returning * into current_lock;

    return query select
      current_lock.id,
      current_lock.organization_id,
      current_lock.committee_id,
      current_lock.meeting_id,
      current_lock.user_id,
      current_lock.expires_at,
      current_lock.created_at,
      current_lock.updated_at,
      true;
    return;
  end if;

  return query select
    current_lock.id,
    current_lock.organization_id,
    current_lock.committee_id,
    current_lock.meeting_id,
    current_lock.user_id,
    current_lock.expires_at,
    current_lock.created_at,
    current_lock.updated_at,
    false;
end;
$$;