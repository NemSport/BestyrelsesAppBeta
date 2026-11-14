create table public.bestie_status_requests (
  thread_id uuid primary key references public.bestie_threads(id) on delete cascade,
  reply_token_hash text not null unique,
  recipient_email text not null,
  expires_at timestamptz not null default now() + interval '14 days'
);

alter table public.bestie_status_requests enable row level security;
revoke all on public.bestie_status_requests from public, anon, authenticated;
grant select on public.bestie_status_requests to service_role;

create function public.bestie_request_task_status(
  target_org uuid, target_task uuid, actor uuid, request_key uuid, token_hash text
)
returns table (thread_id uuid, recipient_email text, task_title text)
language plpgsql security definer set search_path = ''
as $$
declare
  task public.tasks;
  conversation public.bestie_threads;
  recipient text;
  request_dedup text := concat('status-request:', request_key);
begin
  if not exists (
    select 1 from public.organization_members om
    join public.organizations o on o.id = om.organization_id and o.deleted_at is null
    where om.organization_id = target_org and om.user_id = actor
      and om.status = 'active' and om.role in ('owner', 'admin')
  ) then raise exception 'Administrator access required' using errcode = '42501'; end if;

  select * into task from public.tasks t where t.id = target_task and t.organization_id = target_org for update;
  if not found or task.responsible_user_id is null or task.archived_at is not null
    or task.status in ('completed', 'cancelled')
  then raise exception 'An open assigned task is required' using errcode = '22023'; end if;

  select lower(u.email) into recipient from auth.users u
  join public.organization_members om on om.user_id = u.id and om.organization_id = target_org and om.status = 'active'
  where u.id = task.responsible_user_id and u.email_confirmed_at is not null and u.email is not null
    and (om.role in ('owner','admin') or exists (
      select 1 from public.committee_members cm where cm.committee_id = task.committee_id
        and cm.user_id = u.id and cm.status = 'active' and cm.role in ('chair','secretary','member')
    ));
  if recipient is null then raise exception 'Recipient cannot update this task' using errcode = '22023'; end if;

  conversation.organization_id := target_org;
  conversation.committee_id := task.committee_id;
  conversation.user_id := task.responsible_user_id;
  conversation.task_id := task.id;
  if not public.bestie_target_is_accessible(conversation) then
    raise exception 'Recipient cannot access this task' using errcode = '42501';
  end if;

  insert into public.bestie_threads (organization_id, committee_id, user_id, task_id, title, dedup_key, messages)
  values (target_org, task.committee_id, task.responsible_user_id, task.id, 'Status på ' || task.title, request_dedup,
    jsonb_build_array(jsonb_build_object('role','bestie','body',
      format('Hej! En administrator har bedt om en status på “%s”. Hvordan går det?', task.title))))
  on conflict (dedup_key) do nothing;

  select * into conversation from public.bestie_threads b where b.dedup_key = request_dedup
    and b.organization_id = target_org and b.task_id = target_task and b.user_id = task.responsible_user_id;
  if not found then raise exception 'Request key conflicts' using errcode = '22023'; end if;

  insert into public.bestie_status_requests (thread_id, reply_token_hash, recipient_email)
  values (conversation.id, token_hash, recipient)
  on conflict do nothing;

  if not exists (select 1 from public.bestie_status_requests sr where sr.thread_id = conversation.id
      and sr.reply_token_hash = token_hash and sr.recipient_email = recipient and sr.expires_at > now())
  then raise exception 'Request is no longer valid' using errcode = '22023'; end if;

  return query select conversation.id, recipient, task.title;
end;
$$;

create function public.bestie_receive_task_status(
  token_hash text, sender text, inbound_id uuid, reply_text text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  conversation public.bestie_threads;
  task public.tasks;
  proposal jsonb;
begin
  if char_length(btrim(reply_text)) not between 1 and 1500 then return null; end if;
  select b.* into conversation from public.bestie_status_requests r
  join public.bestie_threads b on b.id = r.thread_id
  join auth.users u on u.id = b.user_id and u.email_confirmed_at is not null and lower(u.email) = r.recipient_email
  where r.reply_token_hash = token_hash and r.recipient_email = lower(sender) and r.expires_at > now()
  for update of b;

  if not found or not public.bestie_target_is_accessible(conversation) then return null; end if;
  if conversation.messages @> jsonb_build_array(jsonb_build_object('id', inbound_id::text)) then
    return null;
  end if;

  select * into task from public.tasks t where t.id = conversation.task_id
    and t.organization_id = conversation.organization_id and t.committee_id = conversation.committee_id
    and t.responsible_user_id = conversation.user_id and t.archived_at is null
    and t.status not in ('completed','cancelled');
  if not found then return null; end if;

  proposal := jsonb_build_object('complete', false, 'deadline', null, 'reminder', null,
    'taskVersion', task.updated_at, 'statusNote', btrim(reply_text));

  update public.bestie_threads b set
    messages = b.messages || jsonb_build_array(
      jsonb_build_object('id', inbound_id::text, 'role', 'user', 'body', btrim(reply_text)),
      jsonb_build_object('role', 'bestie', 'body', 'Jeg har modtaget dit mailsvar. Godkend forslaget her, hvis teksten skal gemmes som statusnote på opgaven.')
    ),
    pending_action = proposal,
    updated_at = now(),
    push_sent_at = null,
    push_claimed_at = null
  where b.id = conversation.id;

  return conversation.id;
end;
$$;

revoke all on function public.bestie_request_task_status(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.bestie_receive_task_status(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.bestie_request_task_status(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.bestie_receive_task_status(text, text, uuid, text) to service_role;

-- Claim one unread notification using the same lease as the scheduled job.
create function public.bestie_claim_thread_push(target_thread uuid)
returns setof public.bestie_threads
language sql security definer set search_path = ''
as $$
  update public.bestie_threads b set push_claimed_at = now()
  where b.id = target_thread and b.push_sent_at is null
    and (b.last_read_at is null or b.last_read_at < b.updated_at)
    and (b.push_claimed_at is null or b.push_claimed_at < now() - interval '15 minutes')
    and public.bestie_target_is_accessible(b)
    and exists (select 1 from public.bestie_push_subscriptions s where s.user_id = b.user_id)
  returning b.*;
$$;

revoke all on function public.bestie_claim_thread_push(uuid) from public, anon, authenticated;
grant execute on function public.bestie_claim_thread_push(uuid) to service_role;
