alter table public.tasks
  add column reminder_at timestamptz,
  add column reminder_sent_at timestamptz,
  add column last_notified_at timestamptz;

create index tasks_open_deadline_follow_up_idx
  on public.tasks(organization_id, deadline)
  where archived_at is null
    and deadline is not null
    and status not in ('completed', 'cancelled');

create index tasks_due_reminder_idx
  on public.tasks(organization_id, reminder_at)
  where archived_at is null
    and reminder_at is not null
    and reminder_sent_at is null
    and status not in ('completed', 'cancelled');
