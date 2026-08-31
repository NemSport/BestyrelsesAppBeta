import Link from "next/link";
import clsx from "clsx";

import { AppIcon } from "@/components/icons/app-icon";
import { buttonClassName } from "@/components/ui";
import { meetingStatusLabels } from "@/lib/localization";
import type { MeetingListFilters, MeetingListPeriod } from "@/lib/meeting-list";

function periodHref(
  resetHref: string,
  filters: MeetingListFilters,
  period: Extract<MeetingListPeriod, "upcoming" | "previous">,
) {
  const params = new URLSearchParams();
  params.set("period", period);
  if (filters.committeeId) params.set("committee", filters.committeeId);
  if (filters.status) params.set("status", filters.status);
  if (filters.date) params.set("date", filters.date);
  return `${resetHref}?${params.toString()}`;
}

export function MeetingListFilters({
  filters,
  resetHref,
  committees = [],
}: {
  filters: MeetingListFilters;
  resetHref: string;
  committees?: Array<{ id: string; name: string }>;
}) {
  const active = Boolean(filters.committeeId || filters.date || filters.status);
  const selectedPeriod =
    filters.period === "previous" ? "previous" : "upcoming";

  return (
    <section
      aria-labelledby="meeting-list-filter-heading"
      className="rounded-[var(--radius-panel)] border border-line bg-surface px-2 py-2 sm:px-2.5"
      id="meeting-filters"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
        <div
          aria-label="Mødeperiode"
          className="inline-flex w-fit shrink-0 rounded-[var(--radius-control)] bg-subtle p-0.5"
          role="group"
        >
          {(
            [
              ["upcoming", "Kommende"],
              ["previous", "Afholdte"],
            ] as const
          ).map(([period, label]) => (
            <Link
              aria-current={selectedPeriod === period ? "page" : undefined}
              className={clsx(
                "rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-semibold leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
                selectedPeriod === period
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:bg-surface hover:text-ink",
              )}
              href={periodHref(resetHref, filters, period)}
              key={period}
            >
              {label}
            </Link>
          ))}
        </div>
        <h2 className="sr-only" id="meeting-list-filter-heading">
          Filtrér møder
        </h2>
        <form
          className={clsx(
            "grid min-w-0 gap-1.5 sm:grid-cols-2 lg:flex-none",
            committees.length > 1
              ? "lg:grid-cols-[minmax(9rem,12rem)_minmax(8rem,10rem)_minmax(9rem,11rem)_auto_auto]"
              : "lg:grid-cols-[minmax(8rem,10rem)_minmax(9rem,11rem)_auto_auto]",
          )}
          method="get"
        >
          <input name="period" type="hidden" value={selectedPeriod} />
          {committees.length > 1 ? (
            <label className="grid min-w-0 gap-0.5 text-[0.6rem] font-medium uppercase tracking-[0.08em] text-muted/80">
              Udvalg
              <select
                className="field min-h-9 min-w-0 px-2.5 py-1 text-xs normal-case tracking-normal"
                defaultValue={filters.committeeId}
                name="committee"
              >
                <option value="">Alle udvalg</option>
                {committees.map((committee) => (
                  <option key={committee.id} value={committee.id}>
                    {committee.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid min-w-0 gap-0.5 text-[0.6rem] font-medium uppercase tracking-[0.08em] text-muted/80">
            Status
            <select
              className="field min-h-9 min-w-0 px-2.5 py-1 text-xs normal-case tracking-normal"
              defaultValue={filters.status}
              name="status"
            >
              <option value="">Alle statusser</option>
              {Object.entries(meetingStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-0.5 text-[0.6rem] font-medium uppercase tracking-[0.08em] text-muted/80">
            Dato
            <input
              className="field min-h-9 min-w-0 px-2.5 py-1 text-xs normal-case tracking-normal"
              defaultValue={filters.date}
              name="date"
              type="date"
            />
          </label>
          <div className="flex items-end">
            <button
              className={buttonClassName({
                className: "px-2.5 text-xs",
                size: "sm",
                variant: "secondary",
              })}
              type="submit"
            >
              <AppIcon aria-hidden="true" name="filter" size={14} />
              Anvend
            </button>
          </div>
          {active ? (
            <div className="flex items-end">
              <Link
                className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-2 text-xs font-semibold text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                href={`${resetHref}?period=${selectedPeriod}`}
              >
                <AppIcon aria-hidden="true" name="close" size={14} />
                Ryd filtre
              </Link>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
