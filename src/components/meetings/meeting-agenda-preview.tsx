"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import { AppIcon } from "@/components/icons/app-icon";
import type { MeetingWithAgendaPreview } from "@/types/domain";

export const meetingAgendaPreviewLimit = 4;

export function MeetingAgendaPreview({
  occurrences,
  meetingHref,
  controls,
  integrated = false,
}: {
  occurrences: MeetingWithAgendaPreview["agenda_item_occurrences"];
  meetingHref: string;
  controls?: ReactNode;
  integrated?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const agendaItems = occurrences.flatMap((occurrence, index) =>
    occurrence.agenda_items
      ? [
          {
            ...occurrence.agenda_items,
            occurrenceId: occurrence.id,
            displayNumber: index + 1,
          },
        ]
      : [],
  );
  const hiddenCount = Math.max(
    agendaItems.length - meetingAgendaPreviewLimit,
    0,
  );

  const preview = (
    <div
      className={
        integrated
          ? "col-span-2 border-t border-line/70 pt-1.5 lg:col-span-4"
          : "px-1.5 pb-1 pt-1.5"
      }
      hidden={!expanded}
      id={panelId}
    >
      {integrated ? (
        <p className="px-1 pb-1 text-xs font-semibold text-ink">
          Dagsordenspunkter
          <span className="ml-1 font-normal text-muted">
            ({Math.min(agendaItems.length, meetingAgendaPreviewLimit)} af{" "}
            {agendaItems.length})
          </span>
        </p>
      ) : null}
      {agendaItems.length > 0 ? (
        <ol className="divide-y divide-line/60">
          {agendaItems.slice(0, meetingAgendaPreviewLimit).map((item) => (
            <li key={item.occurrenceId}>
              <Link
                className="grid min-h-8 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-1 rounded-[var(--radius-control)] px-1 py-1 text-xs leading-5 transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                href={`${meetingHref}#agenda-point-${item.occurrenceId}`}
              >
                <span className="text-muted">{item.displayNumber}.</span>
                <AgendaItemDocumentTitle
                  className="min-w-0 break-words"
                  markerClassName="text-muted/80"
                  title={item.title}
                  type={item.item_type}
                />
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-1 text-xs text-muted">
          Der er endnu ingen dagsordenspunkter.
        </p>
      )}
      {hiddenCount > 0 ? (
        <p className="mt-1 border-t border-line/60 px-1 pt-1.5 text-xs font-medium text-muted">
          + {hiddenCount} flere punkter
        </p>
      ) : null}
    </div>
  );

  if (integrated) {
    return (
      <div className="contents">
        <div className="flex items-center justify-end gap-0.5">
          {controls}
          <button
            aria-controls={panelId}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Skjul" : "Vis"} dagsorden for mødet`}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control)] text-muted transition hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => setExpanded((current) => !current)}
            title={expanded ? "Skjul dagsorden" : "Vis dagsorden"}
            type="button"
          >
            <AppIcon
              className={expanded ? "rotate-180 transition" : "transition"}
              name="chevronDown"
              size={16}
            />
          </button>
        </div>
        {preview}
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-line/70 pt-2">
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        className="flex min-h-9 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-1.5 text-left text-xs font-semibold text-muted transition hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span>
          Dagsordenspunkter
          <span className="ml-1 font-normal">({agendaItems.length})</span>
        </span>
        <span className="inline-flex items-center gap-1 text-brand">
          {expanded ? "Skjul preview" : "Vis preview"}
          <AppIcon
            className={expanded ? "rotate-180 transition" : "transition"}
            name="chevronDown"
            size={14}
          />
        </span>
      </button>

      {preview}
    </div>
  );
}
