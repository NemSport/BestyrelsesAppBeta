create table if not exists public.meeting_minutes_referent_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id)
);

create index if not exists meeting_minutes_referent_locks_user_idx
on public.meeting_minutes_referent_locks (user_id, expires_at);

drop trigger if exists meeting_minutes_referent_locks_set_updated_at
on public.meeting_minutes_referent_locks;
create trigger meeting_minutes_referent_locks_set_updated_at
before update on public.meeting_minutes_referent_locks
for each row execute function public.set_updated_at();

create or replace function public.validate_meeting_minutes_referent_lock_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_record record;
begin
  select organization_id, committee_id
  into meeting_record
  from public.meetings
  where id = new.meeting_id
    and deleted_at is null;

  if meeting_record is null then
    raise exception 'Meeting not found for referent lock';
  end if;

  if new.organization_id <> meeting_record.organization_id
     or new.committee_id <> meeting_record.committee_id then
    raise exception 'Referent lock scope does not match meeting scope';
  end if;

  if not exists (
    select 1
    from public.committee_members cm
    where cm.committee_id = new.committee_id
      and cm.user_id = new.user_id
      and cm.status = 'active'
  ) and not exists (
    select 1
    from public.organization_members om
    where om.organization_id = new.organization_id
      and om.user_id = new.user_id
      and om.status = 'active'
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'Referent must be an active member in scope';
  end if;

  return new;
end;
$$;

drop trigger if exists meeting_minutes_referent_locks_validate_scope
on public.meeting_minutes_referent_locks;
create trigger meeting_minutes_referent_locks_validate_scope
before insert or update on public.meeting_minutes_referent_locks
for each row execute function public.validate_meeting_minutes_referent_lock_scope();

alter table public.meeting_minutes_referent_locks enable row level security;

drop policy if exists meeting_minutes_referent_locks_select_member
on public.meeting_minutes_referent_locks;
create policy meeting_minutes_referent_locks_select_member
on public.meeting_minutes_referent_locks
for select
to authenticated
using (
  public.is_committee_member(committee_id)
  or public.is_organization_admin(organization_id)
);

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

  select organization_id, committee_id
  into meeting_record
  from public.meetings
  where id = target_meeting_id
    and deleted_at is null;

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

create or replace function public.heartbeat_meeting_minutes_referent(
  target_meeting_id uuid,
  lease_seconds integer default 90
)
returns public.meeting_minutes_referent_locks
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_lock public.meeting_minutes_referent_locks;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.meeting_minutes_referent_locks
  set expires_at = now() + make_interval(secs => greatest(30, least(lease_seconds, 600)))
  where meeting_id = target_meeting_id
    and user_id = auth.uid()
    and expires_at > now()
  returning * into updated_lock;

  if updated_lock is null then
    raise exception 'Referent lock is not active for current user';
  end if;

  return updated_lock;
end;
$$;

create or replace function public.release_meeting_minutes_referent(
  target_meeting_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_lock public.meeting_minutes_referent_locks;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into current_lock
  from public.meeting_minutes_referent_locks
  where meeting_id = target_meeting_id
  for update;

  if current_lock is null then
    return true;
  end if;

  if current_lock.user_id <> auth.uid()
     and not public.can_manage_committee(current_lock.committee_id) then
    raise exception 'Not authorized to release meeting minutes referent role';
  end if;

  delete from public.meeting_minutes_referent_locks
  where meeting_id = target_meeting_id;

  return true;
end;
$$;

revoke all on function public.claim_meeting_minutes_referent(uuid, integer)
from public, anon;
revoke all on function public.heartbeat_meeting_minutes_referent(uuid, integer)
from public, anon;
revoke all on function public.release_meeting_minutes_referent(uuid)
from public, anon;

grant execute on function public.claim_meeting_minutes_referent(uuid, integer)
to authenticated;
grant execute on function public.heartbeat_meeting_minutes_referent(uuid, integer)
to authenticated;
grant execute on function public.release_meeting_minutes_referent(uuid)
to authenticated;
