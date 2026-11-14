"use client";

import Link from "next/link";
import { useState } from "react";

import { AppIcon } from "@/components/icons/app-icon";
import { formatDanishDate } from "@/lib/date-format";
import type { CalendarEntry, overviewMonth } from "@/lib/overview-calendar";

const labels = {
  meeting: "Møde",
  task: "Opgavefrist",
  activity: "Årshjul",
} as const;
const dots = {
  meeting: "bg-blue-700",
  task: "bg-amber-600",
  activity: "bg-emerald-700",
} as const;
const kinds = ["meeting", "task", "activity"] as const;
const weekdays = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

export function OverviewCalendar({
  month,
  entries,
  root,
  actionView,
}: {
  month: ReturnType<typeof overviewMonth>;
  entries: CalendarEntry[];
  root: string;
  actionView: string;
}) {
  const currentMonth = month.first.slice(0, 7);
  const days = Array.from({ length: month.days }, (_, index) => {
    const date = `${currentMonth}-${String(index + 1).padStart(2, "0")}`;
    const items = entries.filter(
      ({ start, end }) => start <= date && date <= end,
    );
    return { date, items };
  });
  const [selected, setSelected] = useState(
    month.today.startsWith(currentMonth)
      ? month.today
      : (days.find(({ items }) => items.length)?.date ?? month.first),
  );
  const selectedItems = days.find(({ date }) => date === selected)?.items ?? [];
  const title = new Intl.DateTimeFormat("da-DK", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month.first));
  const monthLink = (value: string) =>
    `${root}?handlinger=${actionView}&maaned=${value}#maanedskalender`;

  return (
    <section
      className="panel p-3 sm:p-4"
      id="maanedskalender"
      aria-labelledby="overview-calendar-heading"
    >
      <h2 className="mb-2 text-sm font-semibold" id="overview-calendar-heading">
        Månedskalender
      </h2>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] sm:gap-5">
        <div className="min-w-0">
          <div className="flex items-center justify-between">
            <Link
              aria-label="Forrige måned"
              href={monthLink(month.previous)}
              className="grid size-11 place-items-center rounded-lg text-brand hover:bg-subtle"
            >
              <AppIcon name="arrowLeft" size={16} />
            </Link>
            <p className="text-sm font-semibold capitalize">{title}</p>
            <Link
              aria-label="Næste måned"
              href={monthLink(month.next)}
              className="grid size-11 place-items-center rounded-lg text-brand hover:bg-subtle"
            >
              <AppIcon name="arrowRight" size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-7 text-center">
            {weekdays.map((day) => (
              <span key={day} className="py-1 text-xs text-muted">
                {day}
              </span>
            ))}
            {Array.from({ length: month.leading }, (_, index) => (
              <span key={index} />
            ))}
            {days.map(({ date, items }, index) => (
              <button
                type="button"
                key={date}
                aria-label={`${formatDanishDate(date, "full")}, ${items.length} ${items.length === 1 ? "punkt" : "punkter"}`}
                aria-current={date === month.today ? "date" : undefined}
                aria-pressed={date === selected}
                onClick={() => setSelected(date)}
                className={`flex min-h-9 flex-col items-center justify-center gap-0.5 rounded-md text-xs tabular-nums ${date === selected ? "bg-brand-soft font-bold text-brand" : "hover:bg-subtle"} ${date === month.today ? "underline underline-offset-2" : ""}`}
              >
                {index + 1}
                <span className="flex h-1.5 gap-0.5" aria-hidden>
                  {kinds
                    .filter((kind) => items.some((item) => item.kind === kind))
                    .map((kind) => (
                      <span
                        key={kind}
                        className={`size-1.5 rounded-full ${dots[kind]}`}
                      />
                    ))}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {kinds.map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1">
                <span
                  className={`size-1.5 rounded-full ${dots[kind]}`}
                  aria-hidden
                />
                {labels[kind]}
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-0 border-t border-line pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-1">
          <h3 className="text-sm font-semibold capitalize" aria-live="polite">
            {formatDanishDate(selected, "full")}
          </h3>
          {selectedItems.length ? (
            <ul className="mt-1 max-h-52 divide-y divide-line overflow-y-auto">
              {selectedItems.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={item.href}
                    className="block min-h-11 py-1.5 text-sm hover:underline"
                  >
                    <span className="block break-words font-semibold text-brand">
                      {item.title}
                    </span>
                    <span className="block text-xs text-muted">
                      {labels[item.kind]} · {item.committee}
                      {item.time ? ` · kl. ${item.time}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted">Ingen punkter på dagen.</p>
          )}
        </div>
      </div>
    </section>
  );
}
