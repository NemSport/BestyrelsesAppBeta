"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import { AppIcon } from "@/components/icons/app-icon";
import { Button, Input, Modal, StatusBadge } from "@/components/ui";
import { agendaItemHistoryChangedEvent } from "@/lib/agenda-item-history";
import { agendaItemTypeLabels } from "@/lib/localization";
import type { AgendaItemHistoryLinkCandidate } from "@/types/domain";

type CandidateSearchResult = {
  currentThreadId: string;
  currentThreadMemberCount: number;
  canLink: boolean;
  candidates: AgendaItemHistoryLinkCandidate[];
};

function formatCandidateDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function AgendaItemHistoryLink({
  agendaItemId,
  committeeId,
  currentTitle,
  organizationId,
  triggerVariant = "menu",
}: {
  agendaItemId: string;
  committeeId: string;
  currentTitle: string;
  organizationId: string;
  triggerVariant?: "menu" | "compact";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CandidateSearchResult | null>(null);
  const [selected, setSelected] =
    useState<AgendaItemHistoryLinkCandidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open || selected) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setResult(null);
      setError(null);
      fetch(
        `/api/agenda-items/${agendaItemId}/history-link?organizationId=${organizationId}&committeeId=${committeeId}&query=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const body = (await response.json()) as
            | CandidateSearchResult
            | { error?: string };
          if (!response.ok || !("candidates" in body)) {
            throw new Error(
              "error" in body && body.error
                ? body.error
                : "Dagsordenspunkterne kunne ikke indlæses.",
            );
          }
          setResult(body);
        })
        .catch((caughtError: unknown) => {
          if (controller.signal.aborted) return;
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Dagsordenspunkterne kunne ikke indlæses.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [agendaItemId, committeeId, open, organizationId, query, selected]);

  function close() {
    if (linking) return;
    setOpen(false);
    setSelected(null);
    setError(null);
  }

  async function linkHistory() {
    if (!selected || !result?.currentThreadId) return;
    setLinking(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/agenda-items/${agendaItemId}/history-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            targetAgendaItemId: selected.agendaItemId,
            expectedSourceThreadId: result.currentThreadId,
          }),
        },
      );
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(
          body.error || "Dagsordenspunktet kunne ikke knyttes til historikken.",
        );
      }
      setOpen(false);
      setSelected(null);
      setSuccess(
        body.message || "Dagsordenspunktet er knyttet til historikken.",
      );
      window.dispatchEvent(
        new CustomEvent(agendaItemHistoryChangedEvent, {
          detail: { agendaItemId },
        }),
      );
      router.refresh();
      window.setTimeout(() => setSuccess(null), 5000);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Dagsordenspunktet kunne ikke knyttes til historikken.",
      );
    } finally {
      setLinking(false);
    }
  }

  return (
    <>
      <button
        className={clsx(
          "inline-flex items-center gap-2 rounded-[var(--radius-control)] text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          triggerVariant === "menu"
            ? "min-h-10 w-full px-3 py-2 text-left text-ink hover:bg-subtle"
            : "min-h-8 px-2 py-1 text-xs text-muted hover:bg-brand-soft hover:text-brand",
        )}
        onClick={() => {
          setOpen(true);
          setSuccess(null);
        }}
        type="button"
      >
        <AppIcon name="history" size={15} />
        Knyt til tidligere dagsordenspunkt
      </button>
      {success ? (
        <span
          aria-live="polite"
          className="block text-xs font-medium text-success"
          role="status"
        >
          {success}
        </span>
      ) : null}
      <Modal
        description="Vælg et tidligere dagsordenspunkt, som denne sag hører sammen med."
        eyebrow="Historik"
        footer={
          selected ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={linking} onClick={() => setSelected(null)} variant="secondary">
                Tilbage
              </Button>
              <Button
                aria-label={`Knyt ${currentTitle} til historikken ${selected.title}`}
                disabled={linking}
                onClick={() => void linkHistory()}
              >
                {linking ? "Knytter…" : "Knyt sammen"}
              </Button>
            </div>
          ) : undefined
        }
        maxWidth="2xl"
        onClose={close}
        open={open}
        title="Knyt til tidligere dagsordenspunkt"
      >
        {selected ? (
          <div>
            <h3 className="text-base font-semibold text-ink">Knyt til historik?</h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              <strong className="text-ink">“{currentTitle}”</strong> bliver
              knyttet til historikken for{" "}
              <strong className="text-ink">“{selected.title}”</strong>.
              Historikken vil derefter blive vist som ét samlet forløb.
            </p>
            <div className="mt-4 rounded-[var(--radius-control)] border border-line bg-subtle/60 p-3 text-sm">
              <p className="font-semibold text-ink">{selected.meetingTitle}</p>
              <p className="mt-1 text-xs text-muted">
                {formatCandidateDate(selected.meetingDate)} · Punkt{" "}
                {selected.agendaItemNumber ?? "–"} · {selected.historyCount}{" "}
                {selected.historyCount === 1 ? "behandling" : "behandlinger"}
              </p>
            </div>
            {error ? (
              <p className="alert-danger mt-4" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : result && !result.canLink ? (
          <div className="rounded-[var(--radius-control)] border border-warning/25 bg-warning-soft p-4">
            <h3 className="font-semibold text-ink">
              Dette dagsordenspunkt har allerede en historik
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sammenkædning af to eksisterende historikker understøttes ikke
              endnu.
            </p>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor={`history-link-search-${agendaItemId}`}>
              Søg efter titel eller møde
            </label>
            <Input
              autoComplete="off"
              id={`history-link-search-${agendaItemId}`}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søg efter titel eller møde…"
              value={query}
            />
            {error ? (
              <p className="alert-danger mt-3" role="alert">
                {error}
              </p>
            ) : null}
            <div
              aria-busy={loading}
              aria-label="Tidligere dagsordenspunkter"
              className="mt-4 divide-y divide-line border-y border-line"
            >
              {loading && !result ? (
                <p className="px-2 py-5 text-sm text-muted">
                  Indlæser dagsordenspunkter…
                </p>
              ) : result?.candidates.length ? (
                result.candidates.map((candidate) => (
                  <button
                    aria-label={`Vælg historikken ${candidate.title} fra ${formatCandidateDate(candidate.meetingDate)}`}
                    className="flex min-h-16 w-full items-start gap-3 px-2 py-3 text-left transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                    key={candidate.threadId}
                    onClick={() => {
                      setSelected(candidate);
                      setError(null);
                    }}
                    type="button"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-subtle px-1.5 py-0.5 text-[0.65rem] font-bold text-muted">
                      {agendaItemTypeLabels[candidate.itemType].short}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold text-ink">
                        {candidate.title}
                      </span>
                      <span className="mt-1 block break-words text-xs text-muted">
                        {formatCandidateDate(candidate.meetingDate)} ·{" "}
                        {candidate.meetingTitle} · Punkt{" "}
                        {candidate.agendaItemNumber ?? "–"}
                      </span>
                    </span>
                    <StatusBadge className="shrink-0">
                      {candidate.historyCount}{" "}
                      {candidate.historyCount === 1 ? "gang" : "gange"}
                    </StatusBadge>
                  </button>
                ))
              ) : !loading && result ? (
                <p className="px-2 py-5 text-sm text-muted">
                  Der blev ikke fundet tidligere dagsordenspunkter.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
