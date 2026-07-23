-- TEMPORARY: Remove this table and function after the external UX review.
create table public.ux_review_rate_limits (
  attempt_key text primary key check (attempt_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.ux_review_rate_limits enable row level security;

revoke all on table public.ux_review_rate_limits from public, anon, authenticated;
grant all on table public.ux_review_rate_limits to service_role;

create or replace function public.consume_ux_review_attempt(
  attempt_key text,
  max_attempts integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_attempt_count integer;
begin
  if attempt_key !~ '^[0-9a-f]{64}$'
    or max_attempts < 1
    or max_attempts > 1000
    or window_seconds < 60
    or window_seconds > 86400
  then
    return false;
  end if;

  insert into public.ux_review_rate_limits (
    attempt_key,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (attempt_key, now(), 1, now())
  on conflict (attempt_key) do update
  set
    window_started_at = case
      when ux_review_rate_limits.window_started_at
        <= now() - make_interval(secs => window_seconds)
      then now()
      else ux_review_rate_limits.window_started_at
    end,
    attempt_count = case
      when ux_review_rate_limits.window_started_at
        <= now() - make_interval(secs => window_seconds)
      then 1
      else ux_review_rate_limits.attempt_count + 1
    end,
    updated_at = now()
  returning attempt_count into current_attempt_count;

  return current_attempt_count <= max_attempts;
end;
$$;

revoke all on function public.consume_ux_review_attempt(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_ux_review_attempt(text, integer, integer)
to service_role;
