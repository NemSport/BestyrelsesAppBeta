alter table public.meeting_date_poll_voters
  add column option_comments jsonb not null default '{}'::jsonb
    check (jsonb_typeof(option_comments) = 'object');

create function public.submit_meeting_date_vote_with_comments(
  voter_token uuid, yes_options integer[], maybe_options integer[],
  no_options integer[], time_comments jsonb
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  submitted integer[] := yes_options || maybe_options || no_options;
  normalized jsonb;
begin
  if time_comments is null or jsonb_typeof(time_comments) <> 'object'
  then return false; end if;

  if exists (
    select 1 from jsonb_each(time_comments) entry
    where not coalesce(entry.key = any(array(select i::text from unnest(submitted) i)), false)
      or jsonb_typeof(entry.value) <> 'string'
      or char_length(entry.value #>> '{}') > 500
  ) then return false; end if;

  if not public.submit_meeting_date_vote_details(
    voter_token, yes_options, maybe_options, no_options,
    (select v.comment from public.meeting_date_poll_voters v where v.token = voter_token)
  ) then return false; end if;

  select coalesce(jsonb_object_agg(entry.key, btrim(entry.value)), '{}'::jsonb)
  into normalized
  from jsonb_each_text(time_comments) entry
  where btrim(entry.value) <> '';

  update public.meeting_date_poll_voters v
  set option_comments = (v.option_comments - array(
    select i::text from unnest(submitted) i where p.options[i] > now()
  )) || (
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    from jsonb_each(normalized) entry where p.options[entry.key::integer] > now()
  )
  from public.meeting_date_polls p
  where v.token = voter_token and p.id = v.poll_id;
  return true;
end $$;

revoke all on function public.submit_meeting_date_vote_with_comments(uuid,integer[],integer[],integer[],jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_meeting_date_vote_with_comments(uuid,integer[],integer[],integer[],jsonb)
  to service_role;
