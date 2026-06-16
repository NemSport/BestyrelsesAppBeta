alter table public.organizations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists delete_expires_at timestamptz;

create index if not exists organizations_trash_idx
  on public.organizations(delete_expires_at)
  where deleted_at is not null;

drop trigger if exists organizations_validate_trash on public.organizations;
create trigger organizations_validate_trash before insert or update on public.organizations
for each row execute function public.validate_trash_metadata();

create or replace function public.soft_delete_organization(target_organization_id uuid)
returns public.organizations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marker timestamptz := now();
  result public.organizations;
begin
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Not authorized to delete organization';
  end if;

  update public.organizations
  set deleted_at = marker,
      deleted_by = auth.uid(),
      delete_expires_at = marker + interval '30 days'
  where id = target_organization_id
    and deleted_at is null
  returning * into result;

  if result.id is null then
    raise exception 'Organization not found or already deleted';
  end if;

  return result;
end;
$$;

create or replace function public.restore_organization(target_organization_id uuid)
returns public.organizations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.organizations;
begin
  if not public.is_organization_admin(target_organization_id) then
    raise exception 'Not authorized to restore organization';
  end if;

  update public.organizations
  set deleted_at = null,
      deleted_by = null,
      delete_expires_at = null
  where id = target_organization_id
    and deleted_at is not null
  returning * into result;

  if result.id is null then
    raise exception 'Organization is not in trash';
  end if;

  return result;
end;
$$;

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
for select to authenticated using (
  public.is_organization_member(id)
  and (
    deleted_at is null
    or public.is_organization_admin(id)
  )
);

revoke delete on public.organizations from authenticated;

revoke execute on function public.soft_delete_organization(uuid) from public, anon;
revoke execute on function public.restore_organization(uuid) from public, anon;

grant execute on function public.soft_delete_organization(uuid) to authenticated;
grant execute on function public.restore_organization(uuid) to authenticated;
