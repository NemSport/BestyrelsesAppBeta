"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";

import { RichTextContent } from "@/components/forms/rich-text-content";
import { AppIcon } from "@/components/icons/app-icon";
import { StatusBadge } from "@/components/ui";
import { decisionStatusLabels, decisionStatusTones } from "@/lib/decisions";
import {
  agendaItemHistoryChangedEvent,
  getInitialExpandedAgendaHistoryIds,
  type AgendaItemHistoryResult,
} from "@/lib/agenda-item-history";
import {
  agendaItemMinutesStatusLabels,
  agendaItemTransferReasonLabels,
  agendaItemTypeLabels,
  occurrenceStatusLabels,
} from "@/lib/localization";
import { getMeetingAgendaPointHref } from "@/lib/meeting-navigation";
import { isRichTextEmpty } from "@/lib/rich-text";
import { taskStatusLabels, taskStatusTones } from "@/lib/tasks";
import type { AgendaItemHistoryEntry } from "@/types/domain";

function formatHistoryDate(value: string | null) {
  if (!value) return "Dato ikke angivet";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value: string | null) {
  if (!value) return "Ingen deadline";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function isFutureTreatment(entry: AgendaItemHistoryEntry) {
  return Boolean(
    entry.meetingDate &&
      (entry.meetingStatus === "draft" || entry.meetingStatus === "scheduled") &&
      new Date(entry.meetingDate).getTime() > Date.now(),
  );
}

function TreatmentContent({ entry }: { entry: AgendaItemHistoryEntry }) {
  const hasBackground = !isRichTextEmpty(entry.background);
  const hasObjective = !isRichTextEmpty(entry.objective);
  const hasNotes = !isRichTextEmpty(entry.minutes?.notes);
  const hasDecisionNote = !isRichTextEmpty(entry.minutes?.decision);
  const hasFollowUp = !isRichTextEmpty(entry.minutes?.followUp);
  const hasOutcome = !isRichTextEmpty(entry.outcomeSummary);

  return (
    <div className="space-y-4 border-t border-line/70 px-3 pb-4 pt-3 sm:px-4">
      {hasBackground || hasObjective ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {hasBackground ? "Baggrund" : "Formål"}
          </h4>
          <RichTextContent
            className="mt-1.5 text-sm leading-6 text-ink"
            value={hasBackground ? entry.background : entry.objective}
          />
        </section>
      ) : null}

      {hasNotes || hasOutcome ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Referat / noter
          </h4>
          <RichTextContent
            className="mt-1.5 text-sm leading-6 text-ink"
            value={hasNotes ? entry.minutes?.notes : entry.outcomeSummary}
          />
        </section>
      ) : null}

      {entry.decisions.length > 0 || hasDecisionNote ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Beslutninger
          </h4>
          {hasDecisionNote ? (
            <RichTextContent
              className="mt-1.5 text-sm leading-6 text-ink"
              value={entry.minutes?.decision}
            />
          ) : null}
          {entry.decisions.length > 0 ? (
            <div className="mt-2 divide-y divide-line/70 border-y border-line/70">
              {entry.decisions.map((decision) => (
                <div
                  className="flex min-w-0 flex-wrap items-start gap-2 py-2 sm:flex-nowrap sm:justify-between"
                  key={decision.id}
                >
                  <span className="flex min-w-0 flex-1 items-start gap-2">
                    <AppIcon
                      className="mt-0.5 shrink-0 text-muted"
                      name="decisions"
                      size={15}
                    />
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-ink">
                        {decision.title}
                      </span>
                      {!isRichTextEmpty(decision.description) ? (
                        <RichTextContent
                          className="mt-0.5 text-xs leading-5 text-muted"
                          value={decision.description}
                        />
                      ) : null}
                    </span>
                  </span>
                  <span className="ml-6 flex shrink-0 items-center gap-1.5 text-xs text-muted sm:ml-0">
                    {formatShortDate(decision.decisionDate)}
                    <StatusBadge tone={decisionStatusTones[decision.status]}>
                      {decisionStatusLabels[decision.status]}
                    </StatusBadge>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {hasFollowUp || entry.transfer ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Opfølgning
          </h4>
          {hasFollowUp ? (
            <RichTextContent
              className="mt-1.5 text-sm leading-6 text-ink"
              value={entry.minutes?.followUp}
            />
          ) : null}
          {entry.transfer ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-progress">
              <AppIcon name="arrowRight" size={14} />
              {agendaItemTransferReasonLabels[entry.transfer.reason]}
            </p>
          ) : null}
        </section>
      ) : null}

      {entry.tasks.length > 0 ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Relaterede opgaver
          </h4>
          <div className="mt-1.5 divide-y divide-line/70 border-y border-line/70">
            {entry.tasks.map((task) => (
              <div
                className="flex min-w-0 flex-wrap items-start gap-2 py-2 sm:flex-nowrap sm:justify-between"
                key={task.id}
              >
                <span className="flex min-w-0 flex-1 items-start gap-2">
                  <AppIcon
                    className={clsx(
                      "mt-0.5 shrink-0",
                      task.status === "completed"
                        ? "text-success"
                        : task.status === "in_progress"
                          ? "text-brand"
                          : "text-muted",
                    )}
                    name={
                      task.status === "completed"
                        ? "taskCompleted"
                        : task.status === "cancelled"
                          ? "taskCancelled"
                          : task.status === "in_progress"
                            ? "progress"
                            : "pending"
                    }
                    size={16}
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-semibold text-ink">
                      {task.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {task.responsibleName || "Ingen ansvarlig"}
                      {task.deadline
                        ? ` · Deadline ${formatShortDate(task.deadline)}`
                        : ""}
                    </span>
                  </span>
                </span>
                <StatusBadge tone={taskStatusTones[task.status]}>
                  {taskStatusLabels[task.status]}
                </StatusBadge>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!hasBackground &&
      !hasObjective &&
      !hasNotes &&
      !hasOutcome &&
      !hasDecisionNote &&
      entry.decisions.length === 0 &&
      !hasFollowUp &&
      !entry.transfer &&
      entry.tasks.length === 0 ? (
        <p className="text-sm text-muted">
          Der er ikke registreret behandlingsindhold endnu.
        </p>
      ) : null}
    </div>
  );
}

export function AgendaItemHistoryInline({
  agendaItemId,
  committeeId,
  currentOccurrenceId,
  initialHistory,
  organizationId,
  presentation = "detail",
}: {
  agendaItemId: string;
  committeeId: string;
  currentOccurrenceId: string | null;
  initialHistory: AgendaItemHistoryResult;
  organizationId: string;
  presentation?: "detail" | "embedded";
}) {
  const [history, setHistory] = useState(initialHistory);
  const [expandedIds, setExpandedIds] = useState(() =>
    new Set(
      getInitialExpandedAgendaHistoryIds(
        initialHistory.entries,
        currentOccurrenceId,
      ),
    ),
  );

  useEffect(() => {
    setHistory(initialHistory);
    setExpandedIds(
      new Set(
        getInitialExpandedAgendaHistoryIds(
          initialHistory.entries,
          currentOccurrenceId,
        ),
      ),
    );
  }, [currentOccurrenceId, initialHistory]);

  useEffect(() => {
    function refreshHistory(event: Event) {
      const changedAgendaItemId = (event as CustomEvent<{ agendaItemId?: string }>)
        .detail?.agendaItemId;
      if (changedAgendaItemId && changedAgendaItemId !== agendaItemId) return;

      fetch(
        `/api/agenda-items/${agendaItemId}/history?organizationId=${organizationId}&committeeId=${committeeId}`,
      )
        .then(async (response) => {
          const result = (await response.json()) as AgendaItemHistoryResult;
          if (!response.ok || !Array.isArray(result.entries)) return;
          setHistory(result);
          setExpandedIds(
            new Set(
              getInitialExpandedAgendaHistoryIds(
                result.entries,
                currentOccurrenceId,
              ),
            ),
          );
        })
        .catch(() => undefined);
    }

    window.addEventListener(agendaItemHistoryChangedEvent, refreshHistory);
    return () =>
      window.removeEventListener(agendaItemHistoryChangedEvent, refreshHistory);
  }, [agendaItemId, committeeId, currentOccurrenceId, organizationId]);

  if (history.entries.length < 2) return null;

  return (
    <section
      aria-label={presentation === "embedded" ? "Sagens historik" : undefined}
      aria-labelledby={presentation === "detail" ? "agenda-history-heading" : undefined}
      className={presentation === "detail" ? "mt-8" : "mt-3"}
    >
      {presentation === "detail" ? <div>
        <p className="page-eyebrow">Sagens forløb</p>
        <h2 className="mt-1 text-xl font-semibold text-ink" id="agenda-history-heading">
          Historik
        </h2>
        <p className="mt-1 text-sm text-muted">
          {history.entries.length} behandlinger af denne sag
        </p>
      </div> : null}

      <ol
        className={clsx("relative", presentation === "detail" && "mt-4")}
        aria-label="Sagens behandlinger"
      >
        {history.entries.map((entry) => {
          const entryKey = entry.occurrenceId ?? entry.id;
          const panelId = `agenda-history-treatment-${entryKey}`;
          const isCurrent = entry.occurrenceId === currentOccurrenceId;
          const isFuture = !isCurrent && isFutureTreatment(entry);
          const expanded = expandedIds.has(entryKey);
          const statusLabel = entry.minutes
            ? agendaItemMinutesStatusLabels[entry.minutes.status]
            : occurrenceStatusLabels[entry.status as keyof typeof occurrenceStatusLabels];

          return (
            <li
              className="relative ml-3 border-l border-line pb-3 pl-5 last:border-l-transparent last:pb-0"
              key={entryKey}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  "absolute -left-[5px] top-4 size-2.5 rounded-full border-2 border-surface bg-muted",
                  isCurrent && "bg-brand ring-4 ring-brand-soft",
                  isFuture && "bg-surface ring-1 ring-line",
                )}
              />
              <article
                className={clsx(
                  "overflow-hidden rounded-[var(--radius-control)] border bg-surface",
                  isCurrent ? "border-brand/35" : "border-line/80",
                )}
              >
                <button
                  aria-controls={panelId}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Luk" : "Åbn"} behandling fra ${formatHistoryDate(entry.meetingDate)}`}
                  className="flex min-h-14 w-full min-w-0 items-start gap-3 px-3 py-3 text-left transition hover:bg-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset sm:px-4"
                  onClick={() =>
                    setExpandedIds((current) => {
                      const next = new Set(current);
                      if (next.has(entryKey)) next.delete(entryKey);
                      else next.add(entryKey);
                      return next;
                    })
                  }
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <time className="text-xs font-semibold text-muted">
                        {formatHistoryDate(entry.meetingDate)}
                      </time>
                      {isCurrent ? (
                        <StatusBadge tone="info">Aktuel behandling</StatusBadge>
                      ) : isFuture ? (
                        <StatusBadge tone="progress">Planlagt</StatusBadge>
                      ) : statusLabel ? (
                        <StatusBadge>{statusLabel}</StatusBadge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {entry.meetingTitle || "Ikke planlagt"}
                      {entry.agendaItemNumber
                        ? ` · Punkt ${entry.agendaItemNumber}`
                        : ""}
                    </span>
                    <span className="mt-1 block break-words text-sm font-semibold leading-5 text-ink">
                      <span className="mr-1 text-xs text-muted">
                        ({agendaItemTypeLabels[entry.type].short})
                      </span>
                      {entry.title}
                    </span>
                    {entry.decisions.length > 0 || entry.openTaskCount > 0 || entry.transfer ? (
                      <span className="mt-1.5 block text-xs text-muted">
                        {[
                          entry.decisions.length > 0
                            ? `${entry.decisions.length} ${entry.decisions.length === 1 ? "beslutning" : "beslutninger"}`
                            : null,
                          entry.openTaskCount > 0
                            ? `${entry.openTaskCount} åbne ${entry.openTaskCount === 1 ? "opgave" : "opgaver"}`
                            : null,
                          entry.transfer
                            ? agendaItemTransferReasonLabels[entry.transfer.reason]
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <AppIcon
                    className={clsx(
                      "mt-1 shrink-0 text-muted transition-transform",
                      expanded && "rotate-180",
                    )}
                    name="chevronDown"
                    size={16}
                  />
                </button>

                <div hidden={!expanded} id={panelId}>
                  <TreatmentContent entry={entry} />
                  {entry.meetingId && entry.occurrenceId ? (
                    <div className="border-t border-line/70 px-3 py-2 sm:px-4">
                      <Link
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-xs font-semibold text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        href={getMeetingAgendaPointHref({
                          organizationId,
                          committeeId,
                          meetingId: entry.meetingId,
                          occurrenceId: entry.occurrenceId,
                        })}
                      >
                        Åbn i mødet
                        <AppIcon name="arrowRight" size={14} />
                      </Link>
                    </div>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
