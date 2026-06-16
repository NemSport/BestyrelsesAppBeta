create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_comments_task_created_idx
  on public.task_comments(task_id, created_at desc);
create index task_comments_organization_committee_idx
  on public.task_comments(organization_id, committee_id);

create or replace function public.validate_task_comment_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.tasks
    where id = new.task_id
      and organization_id = new.organization_id
      and committee_id = new.committee_id
  ) then
    raise exception 'Task comment scope is invalid';
  end if;

  new.body = btrim(new.body);
  new.created_by = auth.uid();
  return new;
end;
$$;

create trigger task_comments_validate_scope
before insert on public.task_comments
for each row execute function public.validate_task_comment_scope();

create trigger task_comments_set_updated_at
before update on public.task_comments
for each row execute function public.set_updated_at();

alter table public.task_comments enable row level security;

create policy task_comments_select_member on public.task_comments
for select to authenticated using (
  public.is_committee_member(committee_id)
  or public.is_organization_admin(organization_id)
);

create policy task_comments_insert_editor on public.task_comments
for insert to authenticated with check (
  public.can_edit_agenda_item(committee_id)
  and created_by = auth.uid()
);

revoke all on public.task_comments from anon;
grant select, insert on public.task_comments to authenticated;
