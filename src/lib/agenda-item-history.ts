import type { AgendaItemHistoryEntry } from "@/types/domain";

export type AgendaItemHistoryResult = {
  threadId: string;
  entries: AgendaItemHistoryEntry[];
};

export type AgendaItemHistoryMetadata = {
  agendaItemId: string;
  threadId: string;
  historyCount: number;
};

export const agendaItemHistoryChangedEvent = "agenda-item-history:changed";

export function getInitialExpandedAgendaHistoryIds(
  entries: AgendaItemHistoryEntry[],
  currentOccurrenceId: string | null,
) {
  if (entries.length <= 3) {
    return entries.map((entry) => entry.occurrenceId ?? entry.id);
  }
  const current =
    entries.find((entry) => entry.occurrenceId === currentOccurrenceId) ??
    entries.at(-1);
  return current ? [current.occurrenceId ?? current.id] : [];
}

export function sortAgendaItemHistory(
  entries: AgendaItemHistoryEntry[],
): AgendaItemHistoryEntry[] {
  return [...entries].sort((left, right) => {
    const dateOrder = (left.meetingDate ?? left.createdAt).localeCompare(
      right.meetingDate ?? right.createdAt,
    );
    if (dateOrder !== 0) return dateOrder;

    const positionOrder =
      (left.agendaItemNumber ?? Number.MAX_SAFE_INTEGER) -
      (right.agendaItemNumber ?? Number.MAX_SAFE_INTEGER);
    if (positionOrder !== 0) return positionOrder;

    return (left.occurrenceId ?? left.id).localeCompare(
      right.occurrenceId ?? right.id,
    );
  });
}
