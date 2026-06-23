create table if not exists public.annual_wheel_key_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  annual_wheel_event_id uuid not null references public.annual_wheel_events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  role_title text not null,
  phone text,
  email text,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint annual_wheel_key_people_name_check check (length(trim(name)) > 0),
  constraint annual_wheel_key_people_role_title_check check (length(trim(role_title)) > 0),
  constraint annual_wheel_key_people_phone_check check (phone is null or length(trim(phone)) <= 80),
  constraint annual_wheel_key_people_email_check check (
    email is null
    or (
      email = lower(trim(email))
      and position('@' in email) > 1
      and length(email) <= 254
    )
  )
);

create index if not exists annual_wheel_key_people_event_idx
  on public.annual_wheel_key_people(annual_wheel_event_id, sort_order)
  where archived_at is null;

create index if not exists annual_wheel_key_people_organization_user_idx
  on public.annual_wheel_key_people(organization_id, user_id)
  where user_id is not null and archived_at is null;

create or replace function public.validate_annual_wheel_key_person_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.annual_wheel_events event
    where event.id = new.annual_wheel_event_id
      and event.organization_id = new.organization_id
  ) then
    raise exception 'Annual wheel key person activity scope is invalid';
  end if;

  if new.user_id is not null and not exists (
    select 1
    from public.organization_members member
    where member.organization_id = new.organization_id
      and member.user_id = new.user_id
      and member.status = 'active'
  ) then
    raise exception 'Annual wheel key person user scope is invalid';
  end if;

  new.name = trim(new.name);
  new.role_title = trim(new.role_title);
  new.phone = nullif(trim(coalesce(new.phone, '')), '');
  new.email = nullif(lower(trim(coalesce(new.email, ''))), '');

  return new;
end;
$$;

drop trigger if exists annual_wheel_key_people_validate_scope
  on public.annual_wheel_key_people;
create trigger annual_wheel_key_people_validate_scope
before insert or update on public.annual_wheel_key_people
for each row execute function public.validate_annual_wheel_key_person_scope();

drop trigger if exists annual_wheel_key_people_set_updated_at
  on public.annual_wheel_key_people;
create trigger annual_wheel_key_people_set_updated_at
before update on public.annual_wheel_key_people
for each row execute function public.set_updated_at();

alter table public.annual_wheel_key_people enable row level security;

drop policy if exists annual_wheel_key_people_select_member
  on public.annual_wheel_key_people;
create policy annual_wheel_key_people_select_member
on public.annual_wheel_key_people for select to authenticated using (
  public.is_organization_member(organization_id)
);

drop policy if exists annual_wheel_key_people_insert_editor
  on public.annual_wheel_key_people;
create policy annual_wheel_key_people_insert_editor
on public.annual_wheel_key_people for insert to authenticated with check (
  created_by = auth.uid()
  and updated_by = auth.uid()
  and exists (
    select 1
    from public.annual_wheel_events event
    where event.id = annual_wheel_event_id
      and event.organization_id = organization_id
      and (
        (event.committee_id is null and public.is_organization_admin(organization_id))
        or (event.committee_id is not null and public.can_edit_agenda_item(event.committee_id))
      )
  )
);

drop policy if exists annual_wheel_key_people_update_editor
  on public.annual_wheel_key_people;
create policy annual_wheel_key_people_update_editor
on public.annual_wheel_key_people for update to authenticated using (
  exists (
    select 1
    from public.annual_wheel_events event
    where event.id = annual_wheel_event_id
      and event.organization_id = organization_id
      and (
        (event.committee_id is null and public.is_organization_admin(organization_id))
        or (event.committee_id is not null and public.can_edit_agenda_item(event.committee_id))
      )
  )
)
with check (
  updated_by = auth.uid()
  and exists (
    select 1
    from public.annual_wheel_events event
    where event.id = annual_wheel_event_id
      and event.organization_id = organization_id
      and (
        (event.committee_id is null and public.is_organization_admin(organization_id))
        or (event.committee_id is not null and public.can_edit_agenda_item(event.committee_id))
      )
  )
);

revoke all on public.annual_wheel_key_people from anon;
grant select, insert, update on public.annual_wheel_key_people to authenticated;
