"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, EmptyState, StatusBadge } from "@/components/ui";
import { decisionStatusLabels, decisionStatusTones } from "@/lib/decisions";
import { taskStatusLabels, taskStatusTones } from "@/lib/tasks";
import type { Database } from "@/types/database";

type AssistantResult = {
  lastDiscussed: {
    meetingId: string;
    title: string;
    startsAt: string;
  } | null;
  recentMinutes: Array<{
    id: string;
    meetingId: string;
    title: string;
    startsAt: string;
    summary: string;
    href: string;
  }>;
  decisions: Array<{
    id: string;
    title: string;
    status: Database["public"]["Enums"]["decision_status"];
    decisionDate: string;
    href: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: Database["public"]["Enums"]["task_status"];
    responsible: string | null;
    deadline: string | null;
    href: string;
  }>;
  discussionSuggestions: Array<{
    text: string;
    reason: string;
    sourceIds: string[];
  }>;
  agendaSuggestions: Array<{
    title: string;
    rationale: string;
    sourceIds: string[];
  }>;
  sources: Array<{ id: string; label: string; href: string | null }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "long" }).format(
    new Date(value),
  );
}

export function AgendaItemAssistant({
  organizationId,
  committeeId,
  agendaItemId,
}: {
  organizationId: string;
  committeeId: string;
  agendaItemId: string;
}) {
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/agenda-items/${agendaItemId}/assistant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, committeeId }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | AssistantResult
        | { error?: string };
      if (!response.ok) {
        setError(
          "error" in payload && payload.error
            ? payload.error
            : "AI-assistenten kunne ikke forberede punktet.",
        );
        return;
      }
      setResult(payload as AssistantResult);
    } catch {
      setError("Forbindelsen til AI-assistenten mislykkedes. Prøv igen.");
    } finally {
      setLoading(false);
    }
  }

  const sourcesById = new Map(
    result?.sources.map((source) => [source.id, source]) ?? [],
  );

  return (
    <section className="mt-8 overflow-hidden rounded-[var(--radius-panel)] border border-brand/20 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-brand-soft px-4 py-4 sm:px-5">
        <div>
          <p className="page-eyebrow">AI-assistent</p>
          <h2 className="mt-1 text-lg font-semibold">
            Bestyrelseshukommelse og mødeforberedelse
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Samler tidligere behandling, beslutninger og åbne opgaver og
            foreslår, hvad udvalget bør drøfte.
          </p>
        </div>
        <Button disabled={loading} onClick={() => void prepare()}>
          {loading
            ? "Forbereder punktet..."
            : result
              ? "Opdater forberedelse"
              : "Forbered punktet med AI"}
        </Button>
      </div>

      <div className="p-4 sm:p-5">
        {error ? (
          <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm">
            {error}{" "}
            <button
              className="font-semibold underline"
              onClick={() => void prepare()}
              type="button"
            >
              Prøv igen
            </button>
          </div>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted" role="status">
            AI gennemgår den autoriserede historik. Der ændres ikke noget i
            organisationens data.
          </p>
        ) : null}
        {!loading && !result && !error ? (
          <p className="text-sm text-muted">
            Start assistenten for at samle punktets historik og få
            kildebaserede forslag til dagens drøftelse.
          </p>
        ) : null}
        {result ? (
          <div className="space-y-6">
            <div className="grid gap-5 md:grid-cols-3">
              <section>
                <h3 className="text-sm font-semibold">Sidst diskuteret</h3>
                {result.lastDiscussed ? (
                  <Link
                    className="mt-2 block text-sm font-semibold text-brand hover:underline"
                    href={`/organizations/${organizationId}/committees/${committeeId}/meetings/${result.lastDiscussed.meetingId}`}
                  >
                    {formatDate(result.lastDiscussed.startsAt)}
                    <span className="mt-1 block font-normal text-muted">
                      {result.lastDiscussed.title}
                    </span>
                  </Link>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Ingen tidligere behandling med referat.
                  </p>
                )}
                {result.recentMinutes.length ? (
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    <p className="text-xs font-semibold text-muted">
                      Relevante referater
                    </p>
                    {result.recentMinutes.map((minutes) => (
                      <Link
                        className="block rounded-[var(--radius-control)] px-2 py-1.5 text-sm hover:bg-subtle"
                        href={minutes.href}
                        key={minutes.id}
                      >
                        <span className="block font-medium">
                          {minutes.title}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDate(minutes.startsAt)} · {minutes.summary}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
              <section>
                <h3 className="text-sm font-semibold">Tidligere beslutninger</h3>
                {result.decisions.length ? (
                  <div className="mt-2 space-y-2">
                    {result.decisions.slice(0, 4).map((decision) => (
                      <Link
                        className="block text-sm hover:text-brand"
                        href={decision.href}
                        key={decision.id}
                      >
                        <span className="font-medium">{decision.title}</span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                          {formatDate(decision.decisionDate)}
                          <StatusBadge
                            tone={decisionStatusTones[decision.status]}
                          >
                            {decisionStatusLabels[decision.status]}
                          </StatusBadge>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Ingen tidligere beslutninger fundet.
                  </p>
                )}
              </section>
              <section>
                <h3 className="text-sm font-semibold">Åbne opgaver</h3>
                {result.tasks.length ? (
                  <div className="mt-2 space-y-2">
                    {result.tasks.slice(0, 5).map((task) => (
                      <Link
                        className="block text-sm hover:text-brand"
                        href={task.href}
                        key={task.id}
                      >
                        <span className="font-medium">{task.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                          {task.responsible || "Ingen ansvarlig"}
                          <StatusBadge tone={taskStatusTones[task.status]}>
                            {taskStatusLabels[task.status]}
                          </StatusBadge>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Ingen åbne opgaver er knyttet til punktet.
                  </p>
                )}
              </section>
            </div>

            <section className="border-t border-line pt-5">
              <h3 className="font-semibold">
                Forslag til dagens drøftelse
              </h3>
              {result.discussionSuggestions.length ? (
                <ol className="mt-3 space-y-3">
                  {result.discussionSuggestions.map((suggestion, index) => (
                    <li
                      className="rounded-[var(--radius-control)] bg-subtle/45 p-3"
                      key={`${suggestion.text}-${index}`}
                    >
                      <p className="font-medium">{suggestion.text}</p>
                      <p className="mt-1 text-sm text-muted">
                        {suggestion.reason}
                      </p>
                      <SourceLinks
                        sourceIds={suggestion.sourceIds}
                        sources={sourcesById}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  compact
                  title="Der er ikke nok historik til konkrete forslag endnu."
                />
              )}
            </section>

            {result.agendaSuggestions.length ? (
              <details className="group border-t border-line pt-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden">
                  Mulige kommende dagsordenspunkter
                </summary>
                <div className="mt-3 space-y-3">
                  {result.agendaSuggestions.map((suggestion) => (
                    <div key={suggestion.title}>
                      <p className="font-medium">{suggestion.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {suggestion.rationale}
                      </p>
                      <SourceLinks
                        sourceIds={suggestion.sourceIds}
                        sources={sourcesById}
                      />
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            <p className="border-t border-line pt-3 text-xs text-muted">
              AI-forslag er vejledende. Fakta ovenfor kommer fra de poster,
              du allerede har adgang til.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SourceLinks({
  sourceIds,
  sources,
}: {
  sourceIds: string[];
  sources: Map<
    string,
    { id: string; label: string; href: string | null }
  >;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {sourceIds.flatMap((sourceId) => {
        const source = sources.get(sourceId);
        if (!source) return [];
        return source.href ? (
          <Link
            className="text-xs font-medium text-brand hover:underline"
            href={source.href}
            key={source.id}
          >
            Kilde: {source.label}
          </Link>
        ) : (
          <span className="text-xs text-muted" key={source.id}>
            Kilde: {source.label}
          </span>
        );
      })}
    </div>
  );
}
