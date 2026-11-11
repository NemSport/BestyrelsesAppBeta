import { formatDanishDate } from "@/lib/date-format";
import type { AgendaItem, MeetingWithAgendaPreview } from "@/types/domain";

type AgendaOption = Pick<AgendaItem, "id" | "title">;

export type AgendaMeetingOption = Pick<
  MeetingWithAgendaPreview,
  "id" | "title" | "starts_at"
> &
  Partial<Pick<MeetingWithAgendaPreview, "agenda_item_occurrences">>;

export function formatAgendaMeetingLabel(meeting: AgendaMeetingOption) {
  return `${meeting.title} · ${formatDanishDate(meeting.starts_at)}`;
}

export function agendaItemFitsMeeting(
  itemId: string,
  meeting: AgendaMeetingOption | undefined,
) {
  // Some contextual forms already receive only points from the selected meeting.
  return (
    !itemId ||
    !meeting?.agenda_item_occurrences ||
    meeting.agenda_item_occurrences.some(
      (occurrence) => occurrence.agenda_items?.id === itemId,
    )
  );
}

export function getAgendaItemOptions(
  items: AgendaOption[],
  meetings: AgendaMeetingOption[],
  meetingId: string,
  savedItemId?: string,
) {
  const meeting = meetings.find((option) => option.id === meetingId);
  if (meeting?.agenda_item_occurrences) {
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const options = [];
    for (const occurrence of meeting.agenda_item_occurrences) {
      const item = itemsById.get(occurrence.agenda_items?.id ?? "");
      if (!item) continue;
      options.push({
        id: item.id,
        label: `${occurrence.position + 1}. ${item.title}`,
      });
      itemsById.delete(item.id);
    }
    const savedItem = savedItemId ? itemsById.get(savedItemId) : undefined;
    if (savedItem) {
      options.push({
        id: savedItem.id,
        label: `${savedItem.title} · Gemt tilknytning`,
      });
    }
    return options;
  }

  const meetingLabelsByItem = new Map<string, string[]>();
  for (const option of meetings) {
    if (!option.agenda_item_occurrences?.length) continue;
    const label = formatAgendaMeetingLabel(option);
    const itemIds = new Set(
      option.agenda_item_occurrences.map(
        (occurrence) => occurrence.agenda_items?.id,
      ),
    );
    for (const itemId of itemIds) {
      if (!itemId) continue;
      const labels = meetingLabelsByItem.get(itemId) ?? [];
      labels.push(label);
      meetingLabelsByItem.set(itemId, labels);
    }
  }

  const hasCompleteMeetingAgendas = meetings.every(
    (option) => option.agenda_item_occurrences,
  );
  return items.map((item) => {
    const labels = meetingLabelsByItem.get(item.id);
    return {
      id: item.id,
      label: labels
        ? `${item.title} · ${labels.join(" / ")}`
        : hasCompleteMeetingAgendas
          ? `${item.title} · Uden møde`
          : item.title,
    };
  });
}
