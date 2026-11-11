create or replace function public.list_my_organization_invitations()
returns table (
  invitation_id uuid,
  organization_name text,
  invited_role public.organization_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select oi.id, o.name, oi.role
  from auth.users recipient
  join public.organization_invitations oi on oi.email = lower(trim(recipient.email))
  join public.organizations o on o.id = oi.organization_id and o.deleted_at is null
  join public.organization_members inviter on inviter.organization_id = o.id
    and inviter.user_id = oi.invited_by
    and inviter.status = 'active'
    and inviter.role in ('owner', 'admin')
    and (oi.role <> 'owner' or inviter.role = 'owner')
  where recipient.id = auth.uid()
    and recipient.email_confirmed_at is not null
    and oi.status = 'pending'
    and oi.updated_at >= now() - interval '7 days'
    and not exists (
      select 1 from public.organization_members existing
      where existing.organization_id = o.id and existing.user_id = recipient.id
    )
  order by oi.updated_at desc, oi.id;
$$;

revoke all on function public.list_my_organization_invitations() from public, anon;
grant execute on function public.list_my_organization_invitations() to authenticated;
