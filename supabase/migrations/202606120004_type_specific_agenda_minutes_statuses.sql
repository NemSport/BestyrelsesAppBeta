alter type public.agenda_item_minutes_status
add value if not exists 'information_oriented';

alter type public.agenda_item_minutes_status
add value if not exists 'information_requires_follow_up';

alter type public.agenda_item_minutes_status
add value if not exists 'information_revisit';

alter type public.agenda_item_minutes_status
add value if not exists 'discussion_completed';

alter type public.agenda_item_minutes_status
add value if not exists 'discussion_continue';

alter type public.agenda_item_minutes_status
add value if not exists 'decision_approved';

alter type public.agenda_item_minutes_status
add value if not exists 'decision_rejected';

alter type public.agenda_item_minutes_status
add value if not exists 'decision_deferred';

alter type public.agenda_item_minutes_status
add value if not exists 'decision_requires_follow_up';

alter type public.agenda_item_minutes_status
add value if not exists 'follow_up_completed';

alter type public.agenda_item_minutes_status
add value if not exists 'deadline_changed';

alter type public.agenda_item_minutes_status
add value if not exists 'follow_up_continued';
