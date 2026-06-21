insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'organization-logos',
  'organization-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_organization_logo_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
begin
  path_parts := string_to_array(object_name, '/');
  return array_length(path_parts, 1) = 3
    and path_parts[2] = 'logo'
    and public.is_organization_admin(path_parts[1]::uuid);
exception when others then
  return false;
end;
$$;

create or replace function public.can_read_organization_logo_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
begin
  path_parts := string_to_array(object_name, '/');
  return array_length(path_parts, 1) = 3
    and path_parts[2] = 'logo'
    and public.is_organization_member(path_parts[1]::uuid);
exception when others then
  return false;
end;
$$;

drop policy if exists organization_logos_select_member on storage.objects;
drop policy if exists organization_logos_insert_admin on storage.objects;
drop policy if exists organization_logos_update_admin on storage.objects;
drop policy if exists organization_logos_delete_admin on storage.objects;

create policy organization_logos_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'organization-logos'
  and public.can_read_organization_logo_path(name)
);

create policy organization_logos_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-logos'
  and public.can_manage_organization_logo_path(name)
);

create policy organization_logos_update_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-logos'
  and public.can_manage_organization_logo_path(name)
)
with check (
  bucket_id = 'organization-logos'
  and public.can_manage_organization_logo_path(name)
);

create policy organization_logos_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-logos'
  and public.can_manage_organization_logo_path(name)
);

revoke all on function public.can_manage_organization_logo_path(text) from public, anon;
revoke all on function public.can_read_organization_logo_path(text) from public, anon;
grant execute on function public.can_manage_organization_logo_path(text) to authenticated;
grant execute on function public.can_read_organization_logo_path(text) to authenticated;
