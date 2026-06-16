create or replace function public.validate_agenda_item_minutes_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  agenda_type text;
  minute_status text := new.status::text;
  action_required boolean;
begin
  select ai.item_type::text
  into agenda_type
  from public.agenda_items ai
  where ai.id = new.agenda_item_id;

  if agenda_type is null then
    raise exception 'Dagsordenspunktet blev ikke fundet.';
  end if;

  if minute_status not in (
    'not_started',
    'in_progress',
    'needs_decision',
    'needs_responsible',
    'completed'
  ) and not (
    (agenda_type = 'information' and minute_status in (
      'information_oriented',
      'information_requires_follow_up',
      'information_revisit'
    ))
    or (agenda_type = 'discussion' and minute_status in (
      'discussion_completed',
      'discussion_continue'
    ))
    or (agenda_type = 'decision' and minute_status in (
      'decision_approved',
      'decision_rejected',
      'decision_deferred',
      'decision_requires_follow_up'
    ))
    or (agenda_type = 'follow_up' and minute_status in (
      'follow_up_completed',
      'deadline_changed',
      'follow_up_continued'
    ))
  ) then
    raise exception 'Status passer ikke til dagsordenspunktets type.';
  end if;

  action_required :=
    nullif(trim(new.follow_up), '') is not null
    or minute_status in (
      'information_requires_follow_up',
      'information_revisit',
      'discussion_continue',
      'needs_responsible',
      'decision_deferred',
      'decision_requires_follow_up',
      'deadline_changed',
      'follow_up_continued'
    )
    or (agenda_type = 'follow_up' and minute_status = 'in_progress');

  if action_required and new.responsible_user_id is null then
    raise exception 'Ansvarlig mangler for opfølgningspunktet.';
  end if;

  if action_required and new.deadline is null then
    raise exception 'Deadline mangler for opfølgningspunktet.';
  end if;

  return new;
end;
$$;

create trigger agenda_item_minutes_validate_workflow
before insert or update on public.agenda_item_minutes
for each row execute function public.validate_agenda_item_minutes_workflow();
