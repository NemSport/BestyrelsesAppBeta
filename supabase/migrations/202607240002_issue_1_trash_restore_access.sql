-- Issue #1: organization trash restore is an owner/admin operation.
-- Committee managers retain their existing ability to move resources to
-- trash, but a direct table update or restore RPC cannot bypass the
-- organization-admin restore boundary.

create or replace function public.enforce_organization_admin_trash_restore()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  if old.deleted_at is not null and new.deleted_at is null then
    target_organization_id := case
      when tg_table_name = 'organizations'
        then (to_jsonb(new)->>'id')::uuid
      else (to_jsonb(new)->>'organization_id')::uuid
    end;

    if not public.is_organization_admin(target_organization_id) then
      raise exception 'Du har ikke adgang til at gendanne fra papirkurven.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists organizations_enforce_admin_trash_restore
on public.organizations;
create trigger organizations_enforce_admin_trash_restore
before update on public.organizations
for each row execute function public.enforce_organization_admin_trash_restore();

drop trigger if exists committees_enforce_admin_trash_restore
on public.committees;
create trigger committees_enforce_admin_trash_restore
before update on public.committees
for each row execute function public.enforce_organization_admin_trash_restore();

drop trigger if exists meetings_enforce_admin_trash_restore
on public.meetings;
create trigger meetings_enforce_admin_trash_restore
before update on public.meetings
for each row execute function public.enforce_organization_admin_trash_restore();

drop trigger if exists agenda_items_enforce_admin_trash_restore
on public.agenda_items;
create trigger agenda_items_enforce_admin_trash_restore
before update on public.agenda_items
for each row execute function public.enforce_organization_admin_trash_restore();

drop trigger if exists agenda_occurrences_enforce_admin_trash_restore
on public.agenda_item_occurrences;
create trigger agenda_occurrences_enforce_admin_trash_restore
before update on public.agenda_item_occurrences
for each row execute function public.enforce_organization_admin_trash_restore();

revoke all on function public.enforce_organization_admin_trash_restore()
from public, anon, authenticated;
