import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import type { MeetingWithAgendaPreview } from "@/types/domain";

const previewLimit = 5;

export function MeetingAgendaPreview({
  occurrences,
}: {
  occurrences: MeetingWithAgendaPreview["agenda_item_occurrences"];
}) {
  const agendaItems = occurrences.flatMap((occurrence) =>
    occurrence.agenda_items
      ? [{ ...occurrence.agenda_items, position: occurrence.position }]
      : [],
  );
  const decisionCount = agendaItems.filter(
    (item) => item.item_type === "decision",
  ).length;
  const followUpCount = agendaItems.filter(
    (item) => item.item_type === "follow_up",
  ).length;
  const hiddenCount = Math.max(agendaItems.length - previewLimit, 0);

  return (
    <details className="group mt-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted [&::-webkit-details-marker]:hidden">
        <span>
          {agendaItems.length} {agendaItems.length === 1 ? "punkt" : "punkter"}
          {" · "}
          {decisionCount}{" "}
          {decisionCount === 1 ? "beslutning" : "beslutninger"}
          {" · "}
          {followUpCount}{" "}
          {followUpCount === 1 ? "opfølgning" : "opfølgninger"}
        </span>
        <span className="font-semibold text-brand group-open:hidden">
          Vis punkter
        </span>
        <span className="hidden font-semibold text-brand group-open:inline">
          Skjul punkter
        </span>
      </summary>

      <div className="mt-3 border-l border-line pl-3">
        {agendaItems.length > 0 ? (
          <ol className="space-y-1.5">
            {agendaItems.slice(0, previewLimit).map((item) => (
              <li
                className="grid grid-cols-[1.5rem_minmax(0,1fr)] text-sm leading-5"
                key={item.id}
              >
                <span className="text-muted">{item.position + 1}.</span>
                <AgendaItemDocumentTitle
                  className="min-w-0 truncate"
                  markerClassName="text-muted"
                  title={item.title}
                  type={item.item_type}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">
            Der er endnu ingen dagsordenspunkter.
          </p>
        )}
        {hiddenCount > 0 ? (
          <p className="mt-2 text-xs font-medium text-muted">
            + {hiddenCount} flere punkter
          </p>
        ) : null}
      </div>
    </details>
  );
}
