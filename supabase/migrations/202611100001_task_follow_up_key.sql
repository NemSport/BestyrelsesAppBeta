-- Commit the enum addition before using it in the following migration.
alter type public.standard_agenda_item_key add value if not exists 'task_follow_up';
