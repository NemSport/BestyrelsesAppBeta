"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import { DecisionDetailModal } from "@/components/decisions/decision-detail-modal";
import { AppIcon } from "@/components/icons/app-icon";
import { StatusBadge } from "@/components/ui";
import { decisionStatusLabels, decisionStatusTones } from "@/lib/decisions";
import type { DecisionView } from "@/types/domain";

function formatDate(value: string | null) {
  if (!value) return "Ikke angivet";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

export function RelatedDecisions({
  decisions: initialDecisions,
  organizationId,
  compact = false,
  history = false,
  canEdit = false,
  responsiblePeople = [],
}: {
  decisions: DecisionView[];
  organizationId: string;
  compact?: boolean;
  history?: boolean;
  canEdit?: boolean;
  responsiblePeople?: Array<{ id: string; name: string }>;
}) {
  const [decisions, setDecisions] = useState(initialDecisions);
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null);

  useEffect(() => setDecisions(initialDecisions), [initialDecisions]);

  if (!decisions.length) {
    return compact ? (
      <p className="text-xs text-muted">Ingen registrerede beslutninger.</p>
    ) : null;
  }

  const activeDecision =
    decisions.find((decision) => decision.id === activeDecisionId) ?? null;

  return (
    <>
      <div className="divide-y divide-line border-y border-line">
        {decisions.map((decision) =>
          compact ? (
            <article className="py-0.5" key={decision.id}>
              <button
                className={clsx(
                  "flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-1.5 py-1.5 text-left transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
                  (decision.status === "completed" || decision.archived_at) &&
                    "text-muted",
                )}
                onClick={() => setActiveDecisionId(decision.id)}
                type="button"
              >
                <span className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap">
                  <AppIcon
                    className={
                      decision.status === "completed"
                        ? "mt-0.5 shrink-0 text-success"
                        : "mt-0.5 shrink-0 text-muted"
                    }
                    name="decisions"
                    size={16}
                  />
                  <span className="min-w-0 flex-[1_1_calc(100%-1.75rem)] sm:flex-1">
                    <span
                      className={clsx(
                        "block break-words text-sm font-semibold leading-5",
                        decision.status === "completed" || decision.archived_at
                          ? "text-muted"
                          : "text-ink",
                      )}
                    >
                      {decision.title}
                    </span>
                    {decision.responsible?.full_name || decision.category ? (
                      <span className="mt-0.5 block break-words text-[0.7rem] leading-4 text-muted">
                        {decision.responsible?.full_name || "Ingen ansvarlig"}
                        {decision.category ? ` · ${decision.category}` : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="ml-6 flex min-w-0 flex-wrap items-center gap-1 text-[0.7rem] sm:ml-0 sm:shrink-0 sm:flex-col sm:items-end">
                    <span className="text-muted">
                      {formatDate(decision.decision_date)}
                    </span>
                    <StatusBadge tone={decisionStatusTones[decision.status]}>
                      {decisionStatusLabels[decision.status]}
                    </StatusBadge>
                  </span>
                </span>
              </button>
            </article>
          ) : (
            <article className="py-3" key={decision.id}>
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
                    {decision.responsible?.full_name ||
                      "Ingen ansvarlig"} ·{" "}
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
                  {decision.archived_at ? (
                    <StatusBadge>Arkiveret</StatusBadge>
                  ) : null}
                  <StatusBadge tone={decisionStatusTones[decision.status]}>
                    {decisionStatusLabels[decision.status]}
                  </StatusBadge>
                </div>
              </div>
            </article>
          ),
        )}
      </div>
      {activeDecision ? (
        <DecisionDetailModal
          canEdit={canEdit}
          decision={activeDecision}
          onClose={() => setActiveDecisionId(null)}
          onUpdated={(updatedDecision) =>
            setDecisions((current) =>
              current.map((decision) =>
                decision.id === updatedDecision.id ? updatedDecision : decision,
              ),
            )
          }
          open
          organizationId={organizationId}
          responsiblePeople={responsiblePeople}
        />
      ) : null}
    </>
  );
}
