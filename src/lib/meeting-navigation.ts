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
}: {
  organizationId: string;
  committeeId: string;
  agendaItemId: string;
}) {
  return `/organizations/${organizationId}/committees/${committeeId}/agenda-items/${agendaItemId}`;
}
