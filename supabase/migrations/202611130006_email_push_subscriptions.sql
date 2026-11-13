create function public.email_push_subscriptions(recipient_emails text[])
returns table (email text, user_id uuid, endpoint text, keys jsonb)
language sql stable security definer set search_path = ''
as $$
  select lower(u.email), s.user_id, s.endpoint, s.keys
  from auth.users u
  join public.bestie_push_subscriptions s on s.user_id = u.id
  where u.email_confirmed_at is not null
    and lower(u.email) = any(recipient_emails);
$$;

revoke all on function public.email_push_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.email_push_subscriptions(text[]) to service_role;
