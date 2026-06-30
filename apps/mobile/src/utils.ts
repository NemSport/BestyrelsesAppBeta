import type { Meeting } from "./types";

export const agendaTypeLabels: Record<string, string> = {
  decision: "B",
  discussion: "D",
  follow_up: "F",
  information: "O",
};

export const taskStatusLabels: Record<string, string> = {
  not_started: "Ikke påbegyndt",
  in_progress: "I gang",
  waiting: "Afventer",
  completed: "Gennemført",
  cancelled: "Annulleret",
};

export const decisionStatusLabels: Record<string, string> = {
  not_started: "Ikke påbegyndt",
  in_progress: "I gang",
  waiting: "Afventer",
  completed: "Gennemført",
  cancelled: "Annulleret",
};

export function formatDateTime(value?: string | null) {
  if (!value) return "Ingen dato";
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
    timeZone: "Europe/Copenhagen",
  }).format(new Date(value));
}

function twoDigits(value: number) {
  return value.toString().padStart(2, "0");
}

export function formatMobileDateTimeInput(value: Date = new Date()) {
  return `${twoDigits(value.getDate())}.${twoDigits(
    value.getMonth() + 1,
  )}.${value.getFullYear()} Kl.: ${twoDigits(value.getHours())}:${twoDigits(
    value.getMinutes(),
  )}`;
}

export function parseMobileDateTimeInput(value: string) {
  const trimmed = value.trim();
  const danishMatch = trimmed.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:kl\.?:?)?\s*(\d{1,2})[:.](\d{2})$/i,
  );
  if (danishMatch) {
    const [, day, month, year, hour, minute] = danishMatch;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
    if (
      parsed.getFullYear() === Number(year) &&
      parsed.getMonth() === Number(month) - 1 &&
      parsed.getDate() === Number(day) &&
      parsed.getHours() === Number(hour) &&
      parsed.getMinutes() === Number(minute)
    ) {
      return parsed;
    }
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function sortedAgendaItems(meeting: Meeting) {
  return [...(meeting.agenda_item_occurrences ?? [])].sort(
    (left, right) => left.position - right.position,
  );
}

export function agendaLabel(itemType?: string | null) {
  return agendaTypeLabels[itemType ?? ""] ?? "O";
}

export function plainTextFromRichText(value?: string | null) {
  return (value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&aelig;/g, "æ")
    .replace(/&oslash;/g, "ø")
    .replace(/&aring;/g, "å")
    .replace(/&AElig;/g, "Æ")
    .replace(/&Oslash;/g, "Ø")
    .replace(/&Aring;/g, "Å")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
