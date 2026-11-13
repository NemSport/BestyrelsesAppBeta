alter table public.meeting_date_poll_voters
  add column maybe_choices integer[] not null default '{}',
  add column comment text check (char_length(comment) <= 500);

create function public.submit_meeting_date_vote_details(
  voter_token uuid, yes_options integer[], maybe_options integer[], no_options integer[],
  voter_comment text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  poll public.meeting_date_polls;
  submitted integer[] := yes_options || maybe_options || no_options;
  open_count integer;
begin
  select p.* into poll from public.meeting_date_poll_voters v
  join public.meeting_date_polls p on p.id = v.poll_id
  join public.committees c on c.id = p.committee_id
  join public.organizations o on o.id = p.organization_id
  where v.token = voter_token and c.deleted_at is null and c.archived_at is null and o.deleted_at is null
  for update of p;
  if not found or poll.meeting_id is not null or yes_options is null
    or maybe_options is null or no_options is null or char_length(voter_comment) > 500
  then return false; end if;

  select count(*) into open_count from unnest(poll.options) option_at where option_at > now();
  if open_count = 0 or exists (select 1 from unnest(submitted) i
      where i is null or i < 1 or i > cardinality(poll.options))
    or (select count(distinct i) from unnest(submitted) i) <> cardinality(submitted)
    or (select count(*) from unnest(submitted) i where poll.options[i] > now()) <> open_count
  then return false; end if;

  update public.meeting_date_poll_voters v
  set choices = array(select i from unnest(coalesce(v.choices, '{}')) i where poll.options[i] <= now())
        || array(select i from unnest(yes_options) i where poll.options[i] > now()),
      maybe_choices = array(select i from unnest(v.maybe_choices) i where poll.options[i] <= now())
        || array(select i from unnest(maybe_options) i where poll.options[i] > now()),
      comment = nullif(btrim(voter_comment), '')
  where v.token = voter_token;
  return true;
end $$;

revoke all on function public.submit_meeting_date_vote_details(uuid,integer[],integer[],integer[],text)
  from public, anon, authenticated;
grant execute on function public.submit_meeting_date_vote_details(uuid,integer[],integer[],integer[],text)
  to service_role;
