-- Issue #18: keep organization role and committee assignments in one
-- organization-scoped transaction with the same owner protections as the
-- existing role-only function.

create or replace function public.update_organization_member_access(
  target_organization_id uuid,
  target_user_id uuid,
  new_role public.organization_role,
  committee_assignments jsonb
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
    raise exception 'Kun ejere og administratorer kan ændre medlemsadgang.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_organization_id::text, 0)
  );

  select role
  into current_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id
    and status = 'active'
  for update;

  if current_role is null then
    raise exception 'Medlemmet blev ikke fundet.';
  end if;

  if target_user_id = auth.uid() and actor_role <> 'owner' then
    raise exception 'Du kan ikke ændre din egen rolle eller udvalgstilknytning.';
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

  if jsonb_typeof(coalesce(committee_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Udvalgstilknytningerne er ugyldige.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(committee_assignments, '[]'::jsonb))
      as assignments(assignment)
    where jsonb_typeof(assignment) <> 'object'
      or not (assignment ? 'committee_id')
      or not (assignment ? 'role')
      or assignment->>'role' not in ('chair', 'secretary', 'member', 'viewer')
  ) then
    raise exception 'Udvalgstilknytningerne er ugyldige.';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(coalesce(committee_assignments, '[]'::jsonb))
  ) <> (
    select count(distinct (assignment->>'committee_id')::uuid)
    from jsonb_array_elements(coalesce(committee_assignments, '[]'::jsonb))
      as assignments(assignment)
  ) then
    raise exception 'Det samme udvalg kan kun vælges én gang.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(committee_assignments, '[]'::jsonb))
      as assignment(committee_id uuid, role text)
    left join public.committees c
      on c.id = assignment.committee_id
      and c.organization_id = target_organization_id
      and c.archived_at is null
      and c.deleted_at is null
    where c.id is null
  ) then
    raise exception 'Et eller flere udvalg blev ikke fundet i organisationen.';
  end if;

  update public.organization_members
  set role = new_role
  where organization_id = target_organization_id
    and user_id = target_user_id
  returning * into updated_member;

  delete from public.committee_members as existing_membership
  where existing_membership.organization_id = target_organization_id
    and existing_membership.user_id = target_user_id
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(committee_assignments, '[]'::jsonb))
        as retained_assignment(committee_id uuid, role text)
      where retained_assignment.committee_id =
        existing_membership.committee_id
    );

  insert into public.committee_members (
    organization_id,
    committee_id,
    user_id,
    role
  )
  select
    target_organization_id,
    assignment.committee_id,
    target_user_id,
    assignment.role
  from jsonb_to_recordset(coalesce(committee_assignments, '[]'::jsonb))
    as assignment(
      committee_id uuid,
      role public.committee_role
    )
  on conflict (committee_id, user_id)
  do update
  set
    role = excluded.role,
    status = 'active';

  return updated_member;
end;
$$;

revoke all on function public.update_organization_member_access(
  uuid,
  uuid,
  public.organization_role,
  jsonb
) from public, anon;

grant execute on function public.update_organization_member_access(
  uuid,
  uuid,
  public.organization_role,
  jsonb
) to authenticated;

revoke execute on function public.update_organization_member_role(
  uuid,
  uuid,
  public.organization_role
) from authenticated;

-- Committee membership administration belongs to the organization-admin
-- contract. Chairs and secretaries retain their other committee-manager
-- capabilities, but can no longer bypass this contract with direct table
-- writes.
drop policy if exists committee_members_manage on public.committee_members;
drop policy if exists committee_members_manage_admin on public.committee_members;

create policy committee_members_manage_admin
on public.committee_members
for all
to authenticated
using (public.is_organization_admin(organization_id))
with check (
  public.is_organization_admin(organization_id)
  and public.is_organization_member(organization_id)
);
