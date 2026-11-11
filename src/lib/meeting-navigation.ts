export function getMeetingAgendaPointHref({
  organizationId,
  committeeId,
  meetingId,
  occurrenceId,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  occurrenceId?: string | null;
}) {
  const meetingHref = `/organizations/${organizationId}/committees/${committeeId}/meetings/${meetingId}`;
  return occurrenceId
    ? `${meetingHref}#agenda-point-${occurrenceId}`
    : meetingHref;
}

export function getAgendaItemHref({
  organizationId,
  committeeId,
  agendaItemId,
  occurrenceId,
}: {
  organizationId: string;
  committeeId: string;
  agendaItemId: string;
  occurrenceId?: string;
}) {
  const itemHref = `/organizations/${organizationId}/committees/${committeeId}/agenda-items/${agendaItemId}`;
  return occurrenceId
    ? `${itemHref}?${new URLSearchParams({ occurrence: occurrenceId })}`
    : itemHref;
}
