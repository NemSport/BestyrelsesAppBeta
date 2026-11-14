create or replace function public.bestie_receive_task_status(
  token_hash text, sender text, inbound_id uuid, reply_text text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  conversation public.bestie_threads;
  task public.tasks;
begin
  if reply_text is null or char_length(btrim(reply_text)) not between 1 and 1500 then return null; end if;
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

  -- Reuse task-note authorization and auditing. Keep any pending push proposal.
  perform public.bestie_apply_reply(
    conversation.id, conversation.user_id, conversation.updated_at, task.updated_at, inbound_id,
    btrim(reply_text), 'Jeg har gemt dit mailsvar som statusnote på opgaven.',
    conversation.pending_action, btrim(reply_text), null, false, null, null
  );

  -- Reuse the unread push queue to acknowledge the saved mail reply.
  update public.bestie_threads set
    last_read_at = conversation.last_read_at, push_sent_at = null, push_claimed_at = null
  where id = conversation.id;

  return conversation.id;
end;
$$;
