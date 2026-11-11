create or replace function public.resend_organization_invitation(
  target_organization_id uuid,
  target_invitation_id uuid
)
returns public.organization_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.organization_role;
  invitation public.organization_invitations;
begin
  select om.role into actor_role
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.organization_id = target_organization_id
    and om.user_id = auth.uid()
    and om.status = 'active'
    and o.deleted_at is null;

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Kun ejere og administratorer kan invitere medlemmer.';
  end if;

  update public.organization_invitations oi
  set invited_by = auth.uid(), updated_at = now()
  where oi.id = target_invitation_id
    and oi.organization_id = target_organization_id
    and oi.status = 'pending'
    and (oi.role <> 'owner' or actor_role = 'owner')
  returning oi.* into invitation;

  if not found then
    raise exception 'Invitationen kan ikke sendes igen.';
  end if;
  return invitation;
end;
$$;

create or replace function public.respond_to_organization_invitation(
  target_invitation_id uuid,
  accept_invitation boolean default false
)
returns table (
  organization_id uuid,
  organization_name text,
  invited_role public.organization_role,
  invitation_status public.invitation_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid := auth.uid();
  invitation public.organization_invitations;
  org_name text;
  membership_status public.membership_status;
begin
  select oi.* into invitation
  from public.organization_invitations oi
  join auth.users u on u.id = recipient_id
    and u.email_confirmed_at is not null
    and lower(trim(u.email)) = oi.email
  where oi.id = target_invitation_id
  for update of oi;

  if not found or invitation.status = 'revoked' then
    return;
  end if;

  select o.name into org_name
  from public.organizations o
  where o.id = invitation.organization_id and o.deleted_at is null;
  if not found then
    return;
  end if;

  if invitation.status = 'pending' then
    if invitation.updated_at < now() - interval '7 days' or not exists (
      select 1
      from public.organization_members inviter
      where inviter.organization_id = invitation.organization_id
        and inviter.user_id = invitation.invited_by
        and inviter.status = 'active'
        and inviter.role in ('owner', 'admin')
        and (invitation.role <> 'owner' or inviter.role = 'owner')
    ) then
      return;
    end if;

    if accept_invitation then
      insert into public.organization_members (organization_id, user_id, role)
      values (invitation.organization_id, recipient_id, invitation.role)
      on conflict on constraint organization_members_pkey do nothing;

      select om.status into membership_status
      from public.organization_members om
      where om.organization_id = invitation.organization_id and om.user_id = recipient_id;
      if membership_status is distinct from 'active' then
        return;
      end if;

      update public.organization_invitations oi
      set status = 'accepted'
      where oi.id = invitation.id;
      invitation.status := 'accepted';
    end if;
  elsif not exists (
    select 1 from public.organization_members om
    where om.organization_id = invitation.organization_id
      and om.user_id = recipient_id
      and om.status = 'active'
  ) then
    return;
  end if;

  return query select invitation.organization_id, org_name, invitation.role, invitation.status;
end;
$$;

revoke all on function public.resend_organization_invitation(uuid, uuid) from public;
revoke all on function public.respond_to_organization_invitation(uuid, boolean) from public;
grant execute on function public.resend_organization_invitation(uuid, uuid) to authenticated;
grant execute on function public.respond_to_organization_invitation(uuid, boolean) to authenticated;
