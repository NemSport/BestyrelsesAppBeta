alter table public.action_user_states
  drop constraint if exists action_user_states_type_valid;

alter table public.action_user_states
  add constraint action_user_states_type_valid
  check (action_type in (
    'task_overdue',
    'task_due_soon',
    'task_reminder',
    'minutes_approval',
    'annual_wheel_overdue',
    'annual_wheel_due'
  ));

comment on constraint action_user_states_type_valid
on public.action_user_states is
  'Allowed derived action reasons, including task reminders from tasks.reminder_at.';
