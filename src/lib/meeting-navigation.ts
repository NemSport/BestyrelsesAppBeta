export function withMeetingReturnTo(href: string, returnTo: string) {
  const [path, hash] = href.split("#", 2);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${new URLSearchParams({ returnTo })}${hash ? `#${hash}` : ""}`;
}

export function getMeetingReturnLink(
  organizationId: string,
  committeeId: string,
  returnTo: string | string[] | undefined,
) {
  const organizationRoot = `/organizations/${organizationId}`;
  const committeeRoot = `${organizationRoot}/committees/${committeeId}`;
  const fallback = {
    href: `${committeeRoot}/meetings`,
    label: "Tilbage til møder",
  };
  if (typeof returnTo !== "string") return fallback;

  const pathname = returnTo.split(/[?#]/, 1)[0];
  if (pathname === organizationRoot) {
    return { href: returnTo, label: "Tilbage til Overblik" };
  }
  if (pathname === committeeRoot) {
    return { href: returnTo, label: "Tilbage til udvalgets overblik" };
  }
  if (pathname === `${organizationRoot}/meetings` || pathname === fallback.href) {
    return { href: returnTo, label: fallback.label };
  }
  if (
    pathname === `${organizationRoot}/annual-wheel` ||
    pathname === `${committeeRoot}/annual-wheel`
  ) {
    return { href: returnTo, label: "Tilbage til Årshjul" };
  }
  return fallback;
}

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
