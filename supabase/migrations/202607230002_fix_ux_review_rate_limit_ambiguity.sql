-- Fix the temporary UX review rate limiter without changing its RPC signature.
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
  if $1 !~ '^[0-9a-f]{64}$'
    or $2 < 1
    or $2 > 1000
    or $3 < 60
    or $3 > 86400
  then
    return false;
  end if;

  insert into public.ux_review_rate_limits as rate_limit (
    attempt_key,
    window_started_at,
    attempt_count,
    updated_at
  )
  values ($1, now(), 1, now())
  on conflict on constraint ux_review_rate_limits_pkey do update
  set
    window_started_at = case
      when rate_limit.window_started_at
        <= now() - make_interval(secs => $3)
      then now()
      else rate_limit.window_started_at
    end,
    attempt_count = case
      when rate_limit.window_started_at
        <= now() - make_interval(secs => $3)
      then 1
      else rate_limit.attempt_count + 1
    end,
    updated_at = now()
  returning rate_limit.attempt_count into current_attempt_count;

  return current_attempt_count <= $2;
end;
$$;

revoke all on function public.consume_ux_review_attempt(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_ux_review_attempt(text, integer, integer)
to service_role;
