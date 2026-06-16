import Link from "next/link";

import { StatusBadge } from "@/components/ui";
import {
  decisionStatusLabels,
  decisionStatusTones,
} from "@/lib/decisions";
import type { DecisionView } from "@/types/domain";

function formatDate(value: string | null) {
  if (!value) return "Ikke angivet";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

export function RelatedDecisions({
  decisions,
  organizationId,
  compact = false,
  history = false,
}: {
  decisions: DecisionView[];
  organizationId: string;
  compact?: boolean;
  history?: boolean;
}) {
  if (!decisions.length) {
    return compact ? (
      <p className="text-xs text-muted">Ingen registrerede beslutninger.</p>
    ) : null;
  }

  return (
    <div className="divide-y divide-line border-y border-line">
      {decisions.map((decision) => (
        <article className={compact ? "py-2.5" : "py-3"} key={decision.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <Link
                className="font-semibold text-brand hover:underline"
                href={`/organizations/${organizationId}/decisions#decision-${decision.id}`}
              >
                {decision.title}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {history ? `${formatDate(decision.decision_date)} · ` : ""}
                {decision.responsible?.full_name || "Ingen ansvarlig"} ·{" "}
                {decision.deadline
                  ? `Deadline ${formatDate(decision.deadline)}`
                  : "Ingen deadline"}
                {!compact && decision.agendaItem
                  ? ` · ${decision.agendaItem.title}`
                  : !compact && decision.agenda_item_id
                    ? " · Slettet dagsordenspunkt"
                    : ""}
              </p>
              {history ? (
                <p className="mt-1 text-xs text-muted">
                  {decision.category || "Uden kategori"}
                  {decision.meeting ? (
                    <>
                      {" · "}
                      <Link
                        className="hover:text-brand hover:underline"
                        href={`/organizations/${organizationId}/committees/${decision.committee_id}/meetings/${decision.meeting.id}`}
                      >
                        {decision.meeting.title}
                      </Link>
                    </>
                  ) : decision.meeting_id ? (
                    " · Slettet møde"
                  ) : null}
                </p>
              ) : decision.category ? (
                <p className="mt-1 text-xs font-medium text-secondary">
                  {decision.category}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {decision.archived_at ? <StatusBadge>Arkiveret</StatusBadge> : null}
              <StatusBadge tone={decisionStatusTones[decision.status]}>
                {decisionStatusLabels[decision.status]}
              </StatusBadge>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
