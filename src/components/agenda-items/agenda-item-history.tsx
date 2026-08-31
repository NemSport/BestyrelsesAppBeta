"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import { AppIcon } from "@/components/icons/app-icon";
import { Modal, StatusBadge } from "@/components/ui";
import {
  agendaItemTypeLabels,
  occurrenceStatusLabels,
} from "@/lib/localization";
import {
  agendaItemHistoryChangedEvent,
  type AgendaItemHistoryResult,
} from "@/lib/agenda-item-history";
import { getMeetingAgendaPointHref } from "@/lib/meeting-navigation";
import type { AgendaItemHistoryEntry } from "@/types/domain";

export { agendaItemHistoryChangedEvent };
export type { AgendaItemHistoryResult };

function formatHistoryDate(value: string | null) {
  if (!value) return "Dato ikke angivet";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function isFutureTreatment(entry: AgendaItemHistoryEntry) {
  return Boolean(
    entry.meetingDate && new Date(entry.meetingDate).getTime() > Date.now(),
  );
}

export function AgendaItemHistory({
  agendaItemId,
  committeeId,
  currentOccurrenceId = null,
  enabled = true,
  initialHistory = null,
  organizationId,
}: {
  agendaItemId: string;
  committeeId: string;
  currentOccurrenceId?: string | null;
  enabled?: boolean;
  initialHistory?: AgendaItemHistoryResult | null;
  organizationId: string;
}) {
  const [history, setHistory] = useState<AgendaItemHistoryResult | null>(
    initialHistory,
  );
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [shouldFetch, setShouldFetch] = useState(!initialHistory);

  useEffect(() => {
    function invalidateHistory(event: Event) {
      const changedAgendaItemId = (event as CustomEvent<{ agendaItemId?: string }>)
        .detail?.agendaItemId;
      if (changedAgendaItemId && changedAgendaItemId !== agendaItemId) return;
      setHistory(null);
      setError(null);
      setShouldFetch(true);
      setReloadKey((value) => value + 1);
    }

    window.addEventListener(agendaItemHistoryChangedEvent, invalidateHistory);
    return () =>
      window.removeEventListener(
        agendaItemHistoryChangedEvent,
        invalidateHistory,
      );
  }, [agendaItemId]);

  useEffect(() => {
    if (!enabled || !shouldFetch || history) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(
      `/api/agenda-items/${agendaItemId}/history?organizationId=${organizationId}&committeeId=${committeeId}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as
          | AgendaItemHistoryResult
          | { error?: string };
        if (!response.ok || !("entries" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Historikken kunne ikke indlÃ¦ses.",
          );
        }
        setHistory(body);
        setShouldFetch(false);
      })
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Historikken kunne ikke indlÃ¦ses.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    agendaItemId,
    committeeId,
    enabled,
    history,
    organizationId,
    reloadKey,
    shouldFetch,
  ]);

  if (!enabled) return null;
  if (error && !history) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-danger">
        Historikken kunne ikke indlÃ¦ses.
        <button
          className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          onClick={() => {
            setError(null);
            setShouldFetch(true);
            setReloadKey((value) => value + 1);
          }}
          type="button"
        >
          PrÃ¸v igen
        </button>
      </span>
    );
  }
  if (!history || history.entries.length < 2) return null;

  const currentEntry =
    history.entries.find(
      (entry) =>
        (currentOccurrenceId && entry.occurrenceId === currentOccurrenceId) ||
        (!currentOccurrenceId && entry.id === agendaItemId),
    ) ?? null;
  const currentTitle = currentEntry?.title ?? history.entries.at(-1)?.title;

  return (
    <>
      <button
        className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
        onClick={() => setOpen(true)}
        type="button"
      >
        <AppIcon name="history" size={15} />
        Se historik ({history.entries.length})
      </button>
      <Modal
        description={`${history.entries.length} behandlinger`}
        eyebrow="Historik"
        maxWidth="2xl"
        onClose={() => setOpen(false)}
        open={open}
        placement="right"
        title={currentTitle || "Dagsordenspunkt"}
      >
        <ol aria-label="Dagsordenspunktets behandlinger" className="relative">
          {history.entries.map((entry) => {
            const isCurrent = currentOccurrenceId
              ? entry.occurrenceId === currentOccurrenceId
              : entry.id === agendaItemId;
            const isFuture = !isCurrent && isFutureTreatment(entry);
            const treatmentHref = entry.meetingId
              ? getMeetingAgendaPointHref({
                  organizationId,
                  committeeId,
                  meetingId: entry.meetingId,
                  occurrenceId: entry.occurrenceId,
                })
              : null;

            return (
              <li
                className={clsx(
                  "relative ml-3 border-l border-line pb-6 pl-6 last:border-l-transparent last:pb-0",
                )}
                key={`${entry.id}:${entry.occurrenceId ?? "unscheduled"}`}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute -left-[5px] top-1 size-2.5 rounded-full border-2 border-surface bg-muted",
                    isCurrent && "bg-brand ring-4 ring-brand-soft",
                    isFuture && "bg-surface ring-1 ring-line",
                  )}
                />
                <article
                  className={clsx(
                    "rounded-[var(--radius-control)] border border-transparent px-3 py-2.5",
                    isCurrent && "border-brand/25 bg-brand-soft/45",
                    !isCurrent && "hover:bg-subtle/70",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <time className="text-xs font-semibold text-muted">
                      {formatHistoryDate(entry.meetingDate)}
                    </time>
                    {isCurrent ? (
                      <StatusBadge tone="info">Aktuel behandling</StatusBadge>
                    ) : isFuture ? (
                      <StatusBadge tone="progress">Planlagt</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {entry.meetingTitle || "Ikke planlagt"}
                    {entry.agendaItemNumber
                      ? ` Â· Punkt ${entry.agendaItemNumber}`
                      : ""}
                  </p>
                  <h3 className="mt-1.5 break-words text-sm font-semibold leading-5 text-ink">
                    <span className="mr-1 text-xs font-semibold text-muted">
                      ({agendaItemTypeLabels[entry.type].short})
                    </span>
                    {entry.title}
                  </h3>
                  {!isFuture && !isCurrent && entry.status in occurrenceStatusLabels ? (
                    <p className="mt-1 text-xs text-muted">
                      {occurrenceStatusLabels[
                        entry.status as keyof typeof occurrenceStatusLabels
                      ]}
                    </p>
                  ) : null}
                  {entry.decisions.length > 0 ? (
                    <div className="mt-3 border-l-2 border-brand/25 pl-3">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                        {entry.decisions.length === 1
                          ? "Beslutning"
                          : "Beslutninger"}
                      </p>
                      {entry.decisions.slice(0, 2).map((decision) => (
                        <p
                          className="mt-1 break-words text-xs leading-5 text-ink"
                          key={decision.id}
                        >
                          {decision.title}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {entry.openTaskCount > 0 ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
                      <AppIcon name="tasks" size={13} />
                      {entry.openTaskCount}{" "}
                      {entry.openTaskCount === 1 ? "Ã¥ben opgave" : "Ã¥bne opgaver"}
                    </p>
                  ) : null}
                  {!isCurrent && treatmentHref ? (
                    <Link
                      aria-label={`Se behandling fra ${formatHistoryDate(entry.meetingDate)}`}
                      className="mt-3 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      href={treatmentHref}
                    >
                      Se behandling
                      <AppIcon name="arrowRight" size={14} />
                    </Link>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      </Modal>
    </>
  );
}
