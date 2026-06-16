import type { Database } from "@/types/database";

type AgendaItemType = Database["public"]["Enums"]["agenda_item_type"];
type MeetingStatus = Database["public"]["Enums"]["meeting_status"];
type OccurrenceStatus = Database["public"]["Enums"]["occurrence_status"];
type MeetingMinutesStatus =
  Database["public"]["Enums"]["meeting_minutes_status"];
type AgendaItemMinutesStatus =
  Database["public"]["Enums"]["agenda_item_minutes_status"];
type AgendaItemTransferReason =
  Database["public"]["Enums"]["agenda_item_transfer_reason"];
type TransferredAgendaItemStatus =
  Database["public"]["Enums"]["transferred_agenda_item_status"];
type MeetingMinuteApprovalStatus =
  Database["public"]["Enums"]["meeting_minute_approval_status"];

export const agendaItemTypeLabels: Record<
  AgendaItemType,
  { short: string; label: string }
> = {
  information: { short: "O", label: "Orientering" },
  discussion: { short: "D", label: "Drøftelse" },
  decision: { short: "B", label: "Beslutning" },
  follow_up: { short: "F", label: "Opfølgning" },
};

export const standardAgendaItemLabels = {
  agenda_approval: "Standardpunkt",
  previous_minutes_approval: "Standardpunkt",
  any_other_business: "Standardpunkt",
} as const;

export const meetingStatusLabels: Record<MeetingStatus, string> = {
  draft: "Kladde",
  scheduled: "Planlagt",
  in_progress: "I gang",
  completed: "Afsluttet",
  cancelled: "Aflyst",
};

export const meetingMinutesStatusLabels: Record<MeetingMinutesStatus, string> = {
  draft: "Kladde",
  ready_for_approval: "Klar til godkendelse",
  approved: "Godkendt",
};

export const meetingMinuteApprovalStatusLabels: Record<
  MeetingMinuteApprovalStatus,
  string
> = {
  pending: "Afventer",
  approved: "Godkendt",
  change_requested: "Ændringer ønskes",
  no_response: "Ingen respons",
};

export const agendaItemMinutesStatusLabels: Record<
  AgendaItemMinutesStatus,
  string
> = {
  not_started: "Ikke startet",
  in_progress: "I gang",
  needs_decision: "Mangler beslutning",
  needs_responsible: "Mangler ansvarlig",
  completed: "Færdig",
  information_oriented: "Orienteret",
  information_requires_follow_up: "Kræver opfølgning",
  information_revisit: "Tages op igen",
  discussion_completed: "Færdigdrøftet",
  discussion_continue: "Fortsættes næste møde",
  decision_approved: "Godkendt",
  decision_rejected: "Afvist",
  decision_deferred: "Udsat",
  decision_requires_follow_up: "Kræver opfølgning",
  follow_up_completed: "Afsluttet",
  deadline_changed: "Deadline ændret",
  follow_up_continued: "Videreføres",
};

export const agendaItemTransferReasonLabels: Record<
  AgendaItemTransferReason,
  string
> = {
  discussion_continue: "Fortsættes næste møde",
  discussion_requires_decision: "Kræver beslutning",
  decision_requires_follow_up: "Kræver opfølgning",
};

export const transferredAgendaItemStatusLabels: Record<
  TransferredAgendaItemStatus,
  string
> = {
  pending: "Afventer kommende møde",
  scheduled: "Planlagt på møde",
  dismissed: "Afvist",
};

export const occurrenceStatusLabels: Record<OccurrenceStatus, string> = {
  planned: "Planlagt",
  discussed: "Drøftet",
  deferred: "Udsat",
  decided: "Besluttet",
  skipped: "Sprunget over",
};

export const organizationRoleLabels = {
  owner: "Ejer",
  admin: "Administrator",
  member: "Medlem",
  viewer: "Observatør",
} as const;

export const membershipStatusLabels = {
  active: "Aktiv",
  suspended: "Suspenderet",
} as const;

export const invitationStatusLabels = {
  pending: "Afventer",
  accepted: "Accepteret",
  revoked: "Tilbagekaldt",
} as const;

export const committeeRoleLabels = {
  chair: "Formand",
  secretary: "Sekretær",
  member: "Medlem",
  viewer: "Observatør",
} as const;

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string, dateStyle: "medium" | "full" = "medium") {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle,
    timeStyle: "short",
  }).format(new Date(value));
}

export function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
