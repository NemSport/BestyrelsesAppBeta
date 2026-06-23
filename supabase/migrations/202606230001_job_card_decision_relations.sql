create table if not exists public.role_profile_decisions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_profile_id uuid not null references public.role_profiles(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (role_profile_id, decision_id)
);

create index if not exists role_profile_decisions_organization_idx
  on public.role_profile_decisions(organization_id, role_profile_id);

create index if not exists role_profile_decisions_decision_idx
  on public.role_profile_decisions(decision_id);

create or replace function public.validate_role_profile_decision_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.role_profiles
    where id = new.role_profile_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Job card decision role profile scope is invalid';
  end if;

  if not exists (
    select 1
    from public.decisions
    where id = new.decision_id
      and organization_id = new.organization_id
  ) then
    raise exception 'Job card decision scope is invalid';
  end if;

  return new;
end;
$$;

drop trigger if exists role_profile_decisions_validate
  on public.role_profile_decisions;
create trigger role_profile_decisions_validate
before insert or update on public.role_profile_decisions
for each row execute function public.validate_role_profile_decision_scope();

alter table public.role_profile_decisions enable row level security;

drop policy if exists role_profile_decisions_read
  on public.role_profile_decisions;
create policy role_profile_decisions_read
on public.role_profile_decisions
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists role_profile_decisions_admin
  on public.role_profile_decisions;
create policy role_profile_decisions_admin
on public.role_profile_decisions
for all to authenticated
using (public.is_organization_admin(organization_id))
with check (
  public.is_organization_admin(organization_id)
  and created_by = auth.uid()
);

grant select, insert, update, delete
  on public.role_profile_decisions to authenticated;
revoke all on public.role_profile_decisions from anon;
