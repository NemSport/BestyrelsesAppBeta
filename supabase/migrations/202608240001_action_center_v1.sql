create table public.action_user_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_key text not null,
  action_type text not null,
  source_type text not null,
  source_id uuid not null,
  status text not null,
  snoozed_until timestamptz,
  dismissal_reason text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_user_states_identity_unique
    unique (organization_id, user_id, action_key),
  constraint action_user_states_key_length
    check (char_length(action_key) between 3 and 300),
  constraint action_user_states_type_valid
    check (action_type in (
      'task_overdue', 'task_due_soon',
      'minutes_approval', 'annual_wheel_overdue', 'annual_wheel_due'
    )),
  constraint action_user_states_source_valid
    check (source_type in ('task', 'meeting_minutes', 'annual_wheel_event')),
  constraint action_user_states_status_valid
    check (status in ('claimed', 'snoozed', 'dismissed')),
  constraint action_user_states_snooze_valid
    check (
      (status = 'snoozed' and snoozed_until is not null)
      or (status <> 'snoozed' and snoozed_until is null)
    ),
  constraint action_user_states_dismissal_reason_length
    check (dismissal_reason is null or char_length(dismissal_reason) <= 240)
);

create index action_user_states_active_lookup_idx
on public.action_user_states (organization_id, user_id, status, snoozed_until);

create trigger action_user_states_set_updated_at
before update on public.action_user_states
for each row execute function public.set_updated_at();

create or replace function public.validate_action_user_state_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id <> auth.uid() then
    raise exception 'Handlingsstatus kan kun ændres af brugeren selv.';
  end if;

  if not public.is_organization_member(new.organization_id) then
    raise exception 'Brugeren er ikke aktivt medlem af organisationen.';
  end if;

  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.user_id <> old.user_id
    or new.action_key <> old.action_key
    or new.action_type <> old.action_type
    or new.source_type <> old.source_type
    or new.source_id <> old.source_id
  ) then
    raise exception 'Handlingens identitet kan ikke ændres.';
  end if;

  return new;
end;
$$;

create trigger action_user_states_validate_scope
before insert or update on public.action_user_states
for each row execute function public.validate_action_user_state_scope();

alter table public.action_user_states enable row level security;

create policy action_user_states_select_own
on public.action_user_states
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
);

create policy action_user_states_insert_own
on public.action_user_states
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
);

create policy action_user_states_update_own
on public.action_user_states
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
)
with check (
  user_id = auth.uid()
  and public.is_organization_member(organization_id)
);

revoke all on public.action_user_states from public, anon;
grant select, insert, update on public.action_user_states to authenticated;

comment on table public.action_user_states is
  'Personal workflow state for derived actions. Source records remain authoritative.';
