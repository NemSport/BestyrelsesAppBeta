import Link from "next/link";

import { buttonClassName } from "@/components/ui";
import { meetingStatusLabels } from "@/lib/localization";
import type { MeetingListFilters } from "@/lib/meeting-list";

export function MeetingListFilters({
  filters,
  resetHref,
}: {
  filters: MeetingListFilters;
  resetHref: string;
}) {
  const active = Boolean(filters.date || filters.period || filters.status);

  return (
    <section
      aria-labelledby="meeting-list-filter-heading"
      className="border-y border-line bg-subtle/20 px-3 py-3 sm:px-4"
    >
      <div>
        <h2
          className="text-sm font-semibold text-ink"
          id="meeting-list-filter-heading"
        >
          Filtrér møder
        </h2>
        <p className="mt-1 text-sm text-muted">
          Afgræns listen efter periode, status eller en bestemt dato.
        </p>
      </div>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
        method="get"
      >
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Periode
          <select
            className="field min-h-11 px-3 py-2 text-sm"
            defaultValue={filters.period}
            name="period"
          >
            <option value="">Alle perioder</option>
            <option value="upcoming">Kommende og igangværende</option>
            <option value="previous">Afholdte</option>
            <option value="cancelled">Aflyste</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Status
          <select
            className="field min-h-11 px-3 py-2 text-sm"
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
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Dato
          <input
            className="field min-h-11 px-3 py-2 text-sm"
            defaultValue={filters.date}
            name="date"
            type="date"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button className={buttonClassName({ size: "sm" })} type="submit">
            Anvend filtre
          </button>
          {active ? (
            <Link
              className={buttonClassName({ size: "sm", variant: "ghost" })}
              href={resetHref}
            >
              Ryd filtre
            </Link>
          ) : null}
        </div>
      </form>
    </section>
  );
}
