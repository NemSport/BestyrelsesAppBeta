create table public.organization_branding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  logo_url text null check (
    logo_url is null
    or logo_url ~* '^https://[^[:space:]<>"]{1,500}$'
    or logo_url ~ '^/[^/][^[:space:]<>"]{0,499}$'
  ),
  primary_color text null check (
    primary_color is null
    or primary_color ~* '^#[0-9a-f]{6}$'
  ),
  secondary_color text null check (
    secondary_color is null
    or secondary_color ~* '^#[0-9a-f]{6}$'
  ),
  accent_color text null check (
    accent_color is null
    or accent_color ~* '^#[0-9a-f]{6}$'
  ),
  font_family text null check (
    font_family is null
    or font_family in ('Inter', 'System', 'Arial', 'Roboto', 'Source Sans 3')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_branding_organization_idx
  on public.organization_branding(organization_id);

create trigger organization_branding_set_updated_at
before update on public.organization_branding
for each row execute function public.set_updated_at();

alter table public.organization_branding enable row level security;

create policy organization_branding_select_member on public.organization_branding
for select to authenticated using (
  public.is_organization_member(organization_id)
  or public.is_organization_admin(organization_id)
);

create policy organization_branding_insert_admin on public.organization_branding
for insert to authenticated with check (
  public.is_organization_admin(organization_id)
);

create policy organization_branding_update_admin on public.organization_branding
for update to authenticated using (
  public.is_organization_admin(organization_id)
)
with check (
  public.is_organization_admin(organization_id)
);

revoke all on public.organization_branding from anon;
grant select, insert, update on public.organization_branding to authenticated;
