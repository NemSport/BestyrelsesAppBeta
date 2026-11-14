alter table public.bestie_threads add column dismissed_at timestamptz;

create function public.bestie_reopen_on_new_message()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.dismissed_at := null;
  return new;
end;
$$;

create trigger bestie_reopen_on_new_message
before update of messages on public.bestie_threads
for each row when (old.dismissed_at is not null and old.messages is distinct from new.messages)
execute function public.bestie_reopen_on_new_message();
