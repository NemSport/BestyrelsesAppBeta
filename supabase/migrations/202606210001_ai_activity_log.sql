do $$
begin
  create type public.ai_activity_status as enum (
    'generated',
    'applied',
    'dismissed',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

create table public.ai_activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid null references public.meetings(id) on delete set null,
  agenda_item_id uuid null references public.agenda_items(id) on delete set null,
  user_id uuid not null references public.profiles(id),
  field text not null check (char_length(btrim(field)) between 1 and 120),
  action_type text not null check (char_length(btrim(action_type)) between 1 and 120),
  original_text text null check (original_text is null or char_length(original_text) <= 20000),
  ai_suggestion text null check (ai_suggestion is null or char_length(ai_suggestion) <= 20000),
  status public.ai_activity_status not null default 'generated',
  provider text null check (provider is null or char_length(provider) <= 80),
  model text null check (model is null or char_length(model) <= 120),
  prompt_version text null check (prompt_version is null or char_length(prompt_version) <= 120),
  label text not null check (char_length(btrim(label)) between 1 and 160),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz null,
  dismissed_at timestamptz null
);

create index ai_activity_log_organization_created_idx
  on public.ai_activity_log(organization_id, created_at desc);
create index ai_activity_log_meeting_created_idx
  on public.ai_activity_log(meeting_id, created_at desc)
  where meeting_id is not null;
create index ai_activity_log_agenda_item_created_idx
  on public.ai_activity_log(agenda_item_id, created_at desc)
  where agenda_item_id is not null;
create index ai_activity_log_user_created_idx
  on public.ai_activity_log(user_id, created_at desc);
create index ai_activity_log_status_idx
  on public.ai_activity_log(status);

create or replace function public.validate_ai_activity_log_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meeting_committee_id uuid;
  agenda_committee_id uuid;
begin
  new.field = btrim(new.field);
  new.action_type = btrim(new.action_type);
  new.label = btrim(new.label);
  new.user_id = auth.uid();

  if new.meeting_id is not null then
    select committee_id
      into meeting_committee_id
    from public.meetings
    where id = new.meeting_id
      and organization_id = new.organization_id;

    if meeting_committee_id is null then
      raise exception 'AI activity meeting scope is invalid';
    end if;
  end if;

  if new.agenda_item_id is not null then
    select committee_id
      into agenda_committee_id
    from public.agenda_items
    where id = new.agenda_item_id
      and organization_id = new.organization_id;

    if agenda_committee_id is null then
      raise exception 'AI activity agenda item scope is invalid';
    end if;

    if meeting_committee_id is not null and agenda_committee_id <> meeting_committee_id then
      raise exception 'AI activity agenda item does not belong to the meeting committee';
    end if;
  end if;

  if new.status = 'applied' and new.applied_at is null then
    new.applied_at = now();
  elsif new.status <> 'applied' then
    new.applied_at = null;
  end if;

  if new.status = 'dismissed' and new.dismissed_at is null then
    new.dismissed_at = now();
  elsif new.status <> 'dismissed' then
    new.dismissed_at = null;
  end if;

  return new;
end;
$$;

create trigger ai_activity_log_validate_scope
before insert or update on public.ai_activity_log
for each row execute function public.validate_ai_activity_log_scope();

create trigger ai_activity_log_set_updated_at
before update on public.ai_activity_log
for each row execute function public.set_updated_at();

alter table public.ai_activity_log enable row level security;

create policy ai_activity_log_select_member on public.ai_activity_log
for select to authenticated using (
  public.is_organization_admin(organization_id)
  or exists (
    select 1
    from public.meetings m
    where m.id = meeting_id
      and m.organization_id = organization_id
      and public.is_committee_member(m.committee_id)
  )
  or exists (
    select 1
    from public.agenda_items ai
    where ai.id = agenda_item_id
      and ai.organization_id = organization_id
      and public.is_committee_member(ai.committee_id)
  )
);

create policy ai_activity_log_insert_editor on public.ai_activity_log
for insert to authenticated with check (
  user_id = auth.uid()
  and (
    public.is_organization_admin(organization_id)
    or exists (
      select 1
      from public.meetings m
      where m.id = meeting_id
        and m.organization_id = organization_id
        and public.can_edit_agenda_item(m.committee_id)
    )
    or exists (
      select 1
      from public.agenda_items ai
      where ai.id = agenda_item_id
        and ai.organization_id = organization_id
        and public.can_edit_agenda_item(ai.committee_id)
    )
  )
);

create policy ai_activity_log_update_owner on public.ai_activity_log
for update to authenticated using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

revoke all on public.ai_activity_log from anon;
grant select, insert, update on public.ai_activity_log to authenticated;
