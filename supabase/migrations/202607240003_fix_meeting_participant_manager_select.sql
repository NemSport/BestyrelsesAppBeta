drop policy if exists meeting_attendees_select_member
on public.meeting_attendees;
create policy meeting_attendees_select_member
on public.meeting_attendees
for select
to authenticated
using (
  public.is_committee_member(committee_id)
  or public.can_manage_committee(committee_id)
);

drop policy if exists meeting_external_attendees_select_member
on public.meeting_external_attendees;
create policy meeting_external_attendees_select_member
on public.meeting_external_attendees
for select
to authenticated
using (
  public.is_committee_member(committee_id)
  or public.can_manage_committee(committee_id)
);
