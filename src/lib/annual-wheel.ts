import type { Database } from "@/types/database";

export type AnnualWheelPriority =
  Database["public"]["Enums"]["annual_wheel_priority"];
export type AnnualWheelRecurrence =
  Database["public"]["Enums"]["annual_wheel_recurrence"];

export const annualWheelPriorityLabels: Record<AnnualWheelPriority, string> = {
  low: "Lav",
  medium: "Normal",
  high: "Høj",
  critical: "Kritisk",
};

export const annualWheelRecurrenceLabels: Record<
  AnnualWheelRecurrence,
  string
> = {
  none: "Gentages ikke",
  monthly: "Månedligt",
  quarterly: "Kvartalsvist",
  semiannual: "Halvårligt",
  annual: "Årligt",
  custom: "Brugerdefineret interval",
};

export function recurrenceMonths(
  recurrence: AnnualWheelRecurrence,
  interval: number,
) {
  if (recurrence === "monthly") return 1;
  if (recurrence === "quarterly") return 3;
  if (recurrence === "semiannual") return 6;
  if (recurrence === "annual") return 12;
  if (recurrence === "custom") return interval;
  return 0;
}

export function buildRRule(
  recurrence: AnnualWheelRecurrence,
  interval: number,
) {
  const months = recurrenceMonths(recurrence, interval);
  if (!months) return null;
  if (months % 12 === 0) {
    return `FREQ=YEARLY;INTERVAL=${months / 12}`;
  }
  return `FREQ=MONTHLY;INTERVAL=${months}`;
}

function dateOnly(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addMonths(date: Date, months: number) {
  const day = date.getUTCDate();
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export function buildAnnualWheelOccurrences(input: {
  startsOn: string;
  endsOn: string;
  recurrence: AnnualWheelRecurrence;
  recurrenceInterval: number;
  throughYear?: number;
}) {
  const starts = new Date(`${input.startsOn}T00:00:00Z`);
  const ends = new Date(`${input.endsOn}T00:00:00Z`);
  const duration = ends.getTime() - starts.getTime();
  const monthStep = recurrenceMonths(
    input.recurrence,
    input.recurrenceInterval,
  );
  const limitYear = input.throughYear ?? starts.getUTCFullYear() + 3;
  const occurrences: Array<{
    startsOn: string;
    endsOn: string;
    occurrenceIndex: number;
  }> = [];

  for (let index = 0; index < 60; index += 1) {
    const occurrenceStart =
      index === 0 ? starts : addMonths(starts, monthStep * index);
    if (occurrenceStart.getUTCFullYear() > limitYear) break;
    occurrences.push({
      startsOn: dateOnly(occurrenceStart),
      endsOn: dateOnly(new Date(occurrenceStart.getTime() + duration)),
      occurrenceIndex: index,
    });
    if (!monthStep) break;
  }
  return occurrences;
}

export function annualWheelDeadlineState(
  date: string,
  priority: AnnualWheelPriority = "medium",
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  const days = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "overdue" as const;
  if (priority === "critical" || days <= 7) return "critical" as const;
  if (days <= 30) return "upcoming" as const;
  return "future" as const;
}
