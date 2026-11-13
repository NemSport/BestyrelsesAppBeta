create table public.meeting_date_polls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  committee_id uuid not null references public.committees on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  options timestamptz[] not null check (cardinality(options) between 2 and 12),
  created_at timestamptz not null default now(),
  meeting_id uuid references public.meetings on delete cascade,
  selected_at timestamptz,
  check ((meeting_id is null) = (selected_at is null)),
  check (selected_at is null or selected_at = any(options))
);
create index meeting_date_polls_committee on public.meeting_date_polls (committee_id, created_at desc);

create table public.meeting_date_poll_voters (
  token uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.meeting_date_polls on delete cascade,
  email text not null,
  choices integer[],
  unique (poll_id, email)
);

create table public.meeting_invitation_responses (
  token uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings on delete cascade,
  starts_at timestamptz not null,
  email text not null,
  name text not null,
  sent_at timestamptz,
  response text check (response in ('accepted', 'declined')),
  unique (meeting_id, starts_at, email)
);

alter table public.meeting_date_polls enable row level security;
alter table public.meeting_date_poll_voters enable row level security;
alter table public.meeting_invitation_responses enable row level security;
revoke all on public.meeting_date_polls, public.meeting_date_poll_voters,
  public.meeting_invitation_responses from anon, authenticated;
grant all on public.meeting_date_polls, public.meeting_date_poll_voters,
  public.meeting_invitation_responses to service_role;

create function public.create_meeting_date_poll(
  target_organization uuid, target_committee uuid, poll_title text,
  poll_options timestamptz[], voter_emails text[]
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare poll_id uuid;
begin
  if not coalesce((public.is_organization_member(target_organization)
    and (public.is_organization_admin(target_organization) or public.can_manage_committee(target_committee))
    and exists (select 1 from public.committees c join public.organizations o on o.id = c.organization_id
      where c.id = target_committee and o.id = target_organization and o.deleted_at is null
        and c.deleted_at is null and c.archived_at is null)), false) then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;
  if not coalesce(cardinality(voter_emails) between 1 and 50, false)
    or not coalesce(cardinality(poll_options) between 2 and 12, false)
    or exists (select 1 from unnest(poll_options) option_at where option_at is null or option_at <= now())
    or cardinality(poll_options) <> (select count(distinct option_at) from unnest(poll_options) option_at)
    or exists (select 1 from unnest(voter_emails) email
      where email is null or length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Invalid poll choices or recipients' using errcode = '22023';
  end if;
  insert into public.meeting_date_polls(organization_id, committee_id, title, options)
  values (target_organization, target_committee, poll_title, poll_options)
  returning id into poll_id;
  insert into public.meeting_date_poll_voters(poll_id, email)
  select poll_id, lower(email) from unnest(voter_emails) email
  on conflict do nothing;
  return poll_id;
end $$;

create function public.submit_meeting_date_vote(voter_token uuid, selected_options integer[])
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare poll public.meeting_date_polls;
begin
  select p.* into poll from public.meeting_date_poll_voters v
  join public.meeting_date_polls p on p.id = v.poll_id
  join public.committees c on c.id = p.committee_id
  join public.organizations o on o.id = p.organization_id
  where v.token = voter_token and c.deleted_at is null and c.archived_at is null and o.deleted_at is null
  for update of p;
  if not found or poll.meeting_id is not null or selected_options is null
    or not exists (select 1 from unnest(poll.options) option_at where option_at > now())
    or exists (select 1 from unnest(selected_options) i
      where i is null or i < 1 or i > cardinality(poll.options) or poll.options[i] <= now())
  then return false; end if;
  update public.meeting_date_poll_voters
  set choices = array(select distinct i from unnest(selected_options) i order by i)
  where token = voter_token;
  return true;
end $$;

create function public.finalize_meeting_date_poll(
  target_organization uuid, target_committee uuid, target_poll uuid, option_index integer
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare poll public.meeting_date_polls;
declare chosen timestamptz;
declare new_meeting uuid;
begin
  if not coalesce((public.is_organization_member(target_organization)
    and (public.is_organization_admin(target_organization) or public.can_manage_committee(target_committee))
    and exists (select 1 from public.committees c join public.organizations o on o.id = c.organization_id
      where c.id = target_committee and o.id = target_organization and o.deleted_at is null
        and c.deleted_at is null and c.archived_at is null)), false) then
    raise exception 'Poll unavailable' using errcode = '42501';
  end if;
  select * into poll from public.meeting_date_polls
  where id = target_poll and organization_id = target_organization and committee_id = target_committee for update;
  if not found then raise exception 'Poll unavailable' using errcode = '42501'; end if;
  if poll.meeting_id is not null then return poll.meeting_id; end if;
  chosen := poll.options[option_index];
  if chosen is null or chosen <= now() then
    raise exception 'Invalid meeting time' using errcode = '22023';
  end if;
  select id into new_meeting from public.create_meeting_with_standard_items(
    target_organization, target_committee, poll.title, '', chosen, null, null
  );
  insert into public.meeting_attendees(organization_id, committee_id, meeting_id, user_id)
  select distinct target_organization, target_committee, new_meeting, cm.user_id
  from public.meeting_date_poll_voters v
  join auth.users u on lower(u.email) = v.email and u.email_confirmed_at is not null
  join public.organization_members om on om.user_id = u.id and om.organization_id = target_organization and om.status = 'active'
  join public.committee_members cm on cm.user_id = u.id and cm.committee_id = target_committee and cm.status = 'active'
  where v.poll_id = poll.id;
  insert into public.meeting_external_attendees(organization_id, committee_id, meeting_id, name, email, created_by, updated_by)
  select target_organization, target_committee, new_meeting, left(v.email,160), v.email, auth.uid(), auth.uid()
  from public.meeting_date_poll_voters v
  where v.poll_id = poll.id and not exists (
    select 1 from public.meeting_attendees ma join auth.users u on u.id = ma.user_id
    where ma.meeting_id = new_meeting and lower(u.email) = v.email
  );
  update public.meeting_date_polls set selected_at = chosen, meeting_id = new_meeting where id = target_poll;
  return new_meeting;
end $$;

create function public.submit_meeting_invitation_response(invitation_token uuid, answer text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if answer is null or answer not in ('accepted', 'declined') then return false; end if;
  perform 1 from public.meeting_invitation_responses r
  join public.meetings m on m.id = r.meeting_id and m.starts_at = r.starts_at
  join public.committees c on c.id = m.committee_id
  join public.organizations o on o.id = m.organization_id
  where r.token = invitation_token and m.status in ('draft','scheduled') and m.starts_at > now()
    and m.deleted_at is null and c.deleted_at is null and c.archived_at is null and o.deleted_at is null
  for update of m;
  if not found then return false; end if;
  update public.meeting_invitation_responses set response = answer where token = invitation_token;
  return true;
end $$;

revoke all on function public.create_meeting_date_poll(uuid,uuid,text,timestamptz[],text[]),
  public.finalize_meeting_date_poll(uuid,uuid,uuid,integer),
  public.submit_meeting_date_vote(uuid,integer[]),
  public.submit_meeting_invitation_response(uuid,text) from public, anon, authenticated;
grant execute on function public.create_meeting_date_poll(uuid,uuid,text,timestamptz[],text[]),
  public.finalize_meeting_date_poll(uuid,uuid,uuid,integer) to authenticated;
grant execute on function public.submit_meeting_date_vote(uuid,integer[]),
  public.submit_meeting_invitation_response(uuid,text) to service_role;
