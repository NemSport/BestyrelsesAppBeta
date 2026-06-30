alter type public.attendance_status add value if not exists 'excused';

create table if not exists public.meeting_external_attendees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  email text check (
    email is null
    or (
      char_length(email) <= 320
      and email like '%@%'
      and email not like '% %'
    )
  ),
  mobile text check (mobile is null or char_length(mobile) <= 50),
  role_note text check (role_note is null or char_length(role_note) <= 240),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_external_attendees_meeting_idx
on public.meeting_external_attendees (meeting_id, name);

create or replace function public.validate_meeting_external_attendee_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.meetings m
    where m.id = new.meeting_id
      and m.organization_id = new.organization_id
      and m.committee_id = new.committee_id
      and m.deleted_at is null
  ) then
    raise exception 'Meeting scope does not match external attendee scope';
  end if;

  return new;
end;
$$;

drop trigger if exists meeting_external_attendees_validate_scope
on public.meeting_external_attendees;
create trigger meeting_external_attendees_validate_scope
before insert or update on public.meeting_external_attendees
for each row execute function public.validate_meeting_external_attendee_scope();

drop trigger if exists meeting_external_attendees_set_updated_at
on public.meeting_external_attendees;
create trigger meeting_external_attendees_set_updated_at
before update on public.meeting_external_attendees
for each row execute function public.set_updated_at();

alter table public.meeting_external_attendees enable row level security;

drop policy if exists meeting_external_attendees_select_member
on public.meeting_external_attendees;
create policy meeting_external_attendees_select_member
on public.meeting_external_attendees
for select
to authenticated
using (public.is_committee_member(committee_id));

drop policy if exists meeting_external_attendees_manage_committee
on public.meeting_external_attendees;
create policy meeting_external_attendees_manage_committee
on public.meeting_external_attendees
for all
to authenticated
using (public.can_manage_committee(committee_id))
with check (
  public.can_manage_committee(committee_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

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
