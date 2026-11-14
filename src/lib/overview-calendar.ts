import { formatDanishDateKey } from "@/lib/date-format";

export type CalendarEntry = {
  id: string;
  title: string;
  committee: string;
  committeeId: string;
  kind: "meeting" | "task" | "activity";
  start: string;
  end: string;
  time?: string;
  href: string;
};

export function overviewMonth(value: string | undefined, now = new Date()) {
  const today = formatDanishDateKey(now);
  const month =
    value && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)
      ? value
      : today.slice(0, 7);
  const first = new Date(`${month}-01T00:00:00Z`);
  const year = first.getUTCFullYear();
  const monthIndex = first.getUTCMonth();
  const dateAt = (offset: number, day: number) =>
    new Date(Date.UTC(year, monthIndex + offset, day));
  const key = (date: Date) => date.toISOString().slice(0, 10);
  return {
    today,
    first: key(first),
    last: key(dateAt(1, 0)),
    next: key(dateAt(1, 1)).slice(0, 7),
    previous: key(dateAt(-1, 1)).slice(0, 7),
    leading: (first.getUTCDay() + 6) % 7,
    days: dateAt(1, 0).getUTCDate(),
    // Fetch a UTC buffer around the month, then filter meetings by local date.
    queryStart: dateAt(0, 0).toISOString(),
    queryEnd: dateAt(1, 2).toISOString(),
  };
}
