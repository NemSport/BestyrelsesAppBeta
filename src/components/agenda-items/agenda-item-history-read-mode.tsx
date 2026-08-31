"use client";

import clsx from "clsx";
import { useState } from "react";

import { AgendaItemHistoryInline } from "@/components/agenda-items/agenda-item-history-inline";
import { AppIcon } from "@/components/icons/app-icon";
import type {
  AgendaItemHistoryMetadata,
  AgendaItemHistoryResult,
} from "@/lib/agenda-item-history";

export function AgendaItemHistoryReadMode({
  agendaItemId,
  committeeId,
  compact = false,
  currentOccurrenceId,
  metadata,
  organizationId,
}: {
  agendaItemId: string;
  committeeId: string;
  compact?: boolean;
  currentOccurrenceId: string;
  metadata: AgendaItemHistoryMetadata | null;
  organizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<AgendaItemHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  if (!metadata || metadata.historyCount < 2) return null;

  async function loadHistory() {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/agenda-items/${agendaItemId}/history?organizationId=${organizationId}&committeeId=${committeeId}`,
      );
      const result = (await response.json()) as AgendaItemHistoryResult;
      if (!response.ok || !Array.isArray(result.entries)) throw new Error();
      setHistory(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !history && !loading) void loadHistory();
  }

  const panelId = `read-mode-agenda-history-${currentOccurrenceId}`;

  return (
    <div
      className={clsx(
        compact ? "py-1" : "mt-5 border-t border-line/80 pt-3",
      )}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={`${open ? "Skjul" : "Vis"} historik med ${metadata.historyCount} behandlinger`}
        className="flex min-h-9 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-2 text-left text-sm font-semibold text-ink transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        onClick={toggle}
        type="button"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <AppIcon className="shrink-0 text-muted" name="history" size={15} />
          <span>Historik · {metadata.historyCount} behandlinger</span>
        </span>
        <AppIcon
          className={clsx(
            "shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
          name="chevronDown"
          size={16}
        />
      </button>

      <div hidden={!open} id={panelId}>
        {loading ? (
          <p className="px-2 py-3 text-sm text-muted" role="status">
            Indlæser historik…
          </p>
        ) : error ? (
          <div className="flex flex-wrap items-center gap-2 px-2 py-3 text-sm text-muted">
            <span>Historikken kunne ikke indlæses.</span>
            <button
              className="font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              onClick={() => void loadHistory()}
              type="button"
            >
              Prøv igen
            </button>
          </div>
        ) : history ? (
          <AgendaItemHistoryInline
            agendaItemId={agendaItemId}
            committeeId={committeeId}
            currentOccurrenceId={currentOccurrenceId}
            initialHistory={history}
            organizationId={organizationId}
            presentation="embedded"
          />
        ) : null}
      </div>
    </div>
  );
}
