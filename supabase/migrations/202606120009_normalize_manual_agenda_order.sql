create or replace function public.create_agenda_item(
  target_organization_id uuid,
  target_committee_id uuid,
  agenda_title text,
  agenda_description text,
  agenda_objective text,
  agenda_type public.agenda_item_type,
  agenda_status public.agenda_item_status,
  agenda_target_date date default null,
  target_meeting_id uuid default null
)
returns public.agenda_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_agenda_item public.agenda_items;
  next_position integer;
begin
  if not public.can_edit_agenda_item(target_committee_id) then
    raise exception 'Du har ikke adgang til at oprette dagsordenspunkter.';
  end if;

  if not exists (
    select 1 from public.committees
    where id = target_committee_id
      and organization_id = target_organization_id
  ) then
    raise exception 'Udvalget matcher ikke organisationen.';
  end if;

  if target_meeting_id is not null
    and not public.can_manage_committee(target_committee_id)
  then
    raise exception 'Kun udvalgets ledelse kan planlægge et dagsordenspunkt.';
  end if;

  if target_meeting_id is not null and not exists (
    select 1 from public.meetings
    where id = target_meeting_id
      and organization_id = target_organization_id
      and committee_id = target_committee_id
  ) then
    raise exception 'Mødet matcher ikke organisationen og udvalget.';
  end if;

  insert into public.agenda_items (
    organization_id,
    committee_id,
    title,
    description,
    objective,
    item_type,
    lifecycle_status,
    target_date,
    source,
    created_by
  )
  values (
    target_organization_id,
    target_committee_id,
    agenda_title,
    agenda_description,
    agenda_objective,
    agenda_type,
    case when target_meeting_id is null then agenda_status else 'scheduled' end,
    agenda_target_date,
    case
      when target_meeting_id is null then 'manual'::public.agenda_item_source
      else 'meeting'::public.agenda_item_source
    end,
    auth.uid()
  )
  returning * into created_agenda_item;

  if target_meeting_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(target_meeting_id::text, 0));

    select coalesce(max(position), -1) + 1
    into next_position
    from public.agenda_item_occurrences
    where meeting_id = target_meeting_id;

    insert into public.agenda_item_occurrences (
      organization_id,
      committee_id,
      agenda_item_id,
      meeting_id,
      position
    )
    values (
      target_organization_id,
      target_committee_id,
      created_agenda_item.id,
      target_meeting_id,
      next_position
    );

    perform public.normalize_meeting_agenda_order(target_meeting_id);
  end if;

  return created_agenda_item;
end;
$$;
