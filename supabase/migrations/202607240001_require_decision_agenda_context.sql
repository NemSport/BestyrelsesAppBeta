create or replace function public.require_decision_agenda_context()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.agenda_item_id is null then
    raise exception 'Decision agenda item is required'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists decisions_require_agenda_context
  on public.decisions;

create trigger decisions_require_agenda_context
before insert on public.decisions
for each row execute function public.require_decision_agenda_context();
