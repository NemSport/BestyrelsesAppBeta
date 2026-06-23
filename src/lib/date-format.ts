export const DANISH_LOCALE = "da-DK";
export const DANISH_TIME_ZONE = "Europe/Copenhagen";

type DateInput = string | Date;

function toDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

export function formatDanishDate(
  value: DateInput,
  dateStyle: "short" | "medium" | "long" | "full" = "medium",
) {
  return new Intl.DateTimeFormat(DANISH_LOCALE, {
    dateStyle,
    timeZone: DANISH_TIME_ZONE,
  }).format(toDate(value));
}

export function formatDanishDateTime(
  value: DateInput,
  dateStyle: "short" | "medium" | "long" | "full" = "medium",
) {
  return new Intl.DateTimeFormat(DANISH_LOCALE, {
    dateStyle,
    timeStyle: "short",
    timeZone: DANISH_TIME_ZONE,
  }).format(toDate(value));
}

export function formatDanishTime(value: DateInput) {
  return new Intl.DateTimeFormat(DANISH_LOCALE, {
    timeStyle: "short",
    timeZone: DANISH_TIME_ZONE,
  }).format(toDate(value));
}

export function formatDanishDateKey(value: DateInput) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: DANISH_TIME_ZONE,
    year: "numeric",
  }).format(toDate(value));
}
