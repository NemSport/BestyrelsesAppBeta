create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.organization_role not null default 'member',
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_email_check check (
    email = lower(trim(email)) and position('@' in email) > 1
  )
);

create unique index organization_invitations_pending_email_idx
on public.organization_invitations (organization_id, email)
where status = 'pending';

create index organization_invitations_organization_idx
on public.organization_invitations (organization_id, created_at desc);

create trigger organization_invitations_set_updated_at
before update on public.organization_invitations
for each row execute function public.set_updated_at();

alter table public.organization_invitations enable row level security;

create policy organization_invitations_select_member
on public.organization_invitations
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists organization_members_manage_admin on public.organization_members;

create or replace function public.list_organization_members(
  target_organization_id uuid
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.organization_role,
  status public.membership_status,
  committees jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Du har ikke adgang til organisationens medlemmer.';
  end if;

  return query
  select
    om.user_id,
    nullif(trim(p.full_name), ''),
    coalesce(u.email, '')::text,
    om.role,
    om.status,
    coalesce(
      jsonb_agg(
        distinct jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'role', cm.role
        )
      ) filter (where c.id is not null),
      '[]'::jsonb
    )
  from public.organization_members om
  join public.profiles p on p.id = om.user_id
  join auth.users u on u.id = om.user_id
  left join public.committee_members cm
    on cm.organization_id = om.organization_id
    and cm.user_id = om.user_id
    and cm.status = 'active'
  left join public.committees c
    on c.id = cm.committee_id
    and c.archived_at is null
  where om.organization_id = target_organization_id
  group by om.user_id, p.full_name, u.email, om.role, om.status, om.created_at
  order by
    case om.role
      when 'owner' then 0
      when 'admin' then 1
      when 'member' then 2
      else 3
    end,
    coalesce(nullif(trim(p.full_name), ''), u.email);
end;
$$;

create or replace function public.invite_organization_member(
  target_organization_id uuid,
  invitation_email text,
  invitation_role public.organization_role
)
returns public.organization_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.organization_role;
  normalized_email text := lower(trim(invitation_email));
  created_invitation public.organization_invitations;
begin
  select role
  into actor_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = auth.uid()
    and status = 'active';

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Kun ejere og administratorer kan invitere medlemmer.';
  end if;

  if invitation_role = 'owner' and actor_role <> 'owner' then
    raise exception 'Kun en ejer kan invitere en ny ejer.';
  end if;

  if normalized_email = '' or position('@' in normalized_email) <= 1 then
    raise exception 'Indtast en gyldig e-mailadresse.';
  end if;

  if exists (
    select 1
    from auth.users u
    join public.organization_members om on om.user_id = u.id
    where om.organization_id = target_organization_id
      and lower(u.email) = normalized_email
  ) then
    raise exception 'Brugeren er allerede medlem af organisationen.';
  end if;

  if exists (
    select 1
    from public.organization_invitations oi
    where oi.organization_id = target_organization_id
      and oi.email = normalized_email
      and oi.status = 'pending'
  ) then
    raise exception 'Der findes allerede en afventende invitation til denne e-mail.';
  end if;

  insert into public.organization_invitations (
    organization_id,
    email,
    role,
    invited_by
  )
  values (
    target_organization_id,
    normalized_email,
    invitation_role,
    auth.uid()
  )
  returning * into created_invitation;

  return created_invitation;
end;
$$;

create or replace function public.update_organization_member_role(
  target_organization_id uuid,
  target_user_id uuid,
  new_role public.organization_role
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.organization_role;
  current_role public.organization_role;
  owner_count integer;
  updated_member public.organization_members;
begin
  select role
  into actor_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = auth.uid()
    and status = 'active';

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Kun ejere og administratorer kan ændre roller.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));

  select role
  into current_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id
  for update;

  if current_role is null then
    raise exception 'Medlemmet blev ikke fundet.';
  end if;

  if target_user_id = auth.uid() and actor_role <> 'owner' then
    raise exception 'Du kan ikke ændre din egen rolle.';
  end if;

  if (current_role = 'owner' or new_role = 'owner') and actor_role <> 'owner' then
    raise exception 'Kun en ejer kan tildele eller fjerne ejerrollen.';
  end if;

  if current_role = 'owner' and new_role <> 'owner' then
    select count(*)
    into owner_count
    from public.organization_members
    where organization_id = target_organization_id
      and role = 'owner'
      and status = 'active';

    if owner_count <= 1 then
      raise exception 'Den sidste ejer kan ikke få fjernet ejerrollen.';
    end if;
  end if;

  update public.organization_members
  set role = new_role
  where organization_id = target_organization_id
    and user_id = target_user_id
  returning * into updated_member;

  return updated_member;
end;
$$;

create or replace function public.remove_organization_member(
  target_organization_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.organization_role;
  target_role public.organization_role;
  owner_count integer;
begin
  select role
  into actor_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = auth.uid()
    and status = 'active';

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Kun ejere og administratorer kan fjerne medlemmer.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));

  select role
  into target_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id
  for update;

  if target_role is null then
    raise exception 'Medlemmet blev ikke fundet.';
  end if;

  if target_role = 'owner' and actor_role <> 'owner' then
    raise exception 'Kun en ejer kan fjerne en anden ejer.';
  end if;

  if target_role = 'owner' then
    select count(*)
    into owner_count
    from public.organization_members
    where organization_id = target_organization_id
      and role = 'owner'
      and status = 'active';

    if owner_count <= 1 then
      raise exception 'Den sidste ejer kan ikke fjernes.';
    end if;
  end if;

  delete from public.committee_members
  where organization_id = target_organization_id
    and user_id = target_user_id;

  delete from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id;
end;
$$;

revoke all on function public.list_organization_members(uuid) from public, anon;
revoke all on function public.invite_organization_member(
  uuid,
  text,
  public.organization_role
) from public, anon;
revoke all on function public.update_organization_member_role(
  uuid,
  uuid,
  public.organization_role
) from public, anon;
revoke all on function public.remove_organization_member(uuid, uuid) from public, anon;

grant execute on function public.list_organization_members(uuid) to authenticated;
grant execute on function public.invite_organization_member(
  uuid,
  text,
  public.organization_role
) to authenticated;
grant execute on function public.update_organization_member_role(
  uuid,
  uuid,
  public.organization_role
) to authenticated;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
