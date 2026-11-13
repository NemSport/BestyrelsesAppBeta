"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClassName } from "@/components/ui";
import type { BestieAgendaSuggestion } from "@/lib/bestie-agenda";
import { getTaskDetailPath } from "@/lib/task-register-state";

type Scope = { organizationId: string; committeeId: string; meetingId: string };

export function BestieAgendaSuggestions({
  organizationId,
  committeeId,
  meetingId,
  suggestions,
}: Scope & { suggestions: BestieAgendaSuggestion[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function request(suggestion?: BestieAgendaSuggestion) {
    setBusy(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/meetings/${meetingId}/bestie-agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId,
          action: suggestion ? "approve" : "suggest",
          suggestion: suggestion && {
            sourceKind: suggestion.sourceKind,
            sourceId: suggestion.sourceId,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.error);
      if (suggestion) {
        setNotice(`“${suggestion.title}” er tilføjet til dagsordenen.`);
      } else {
        if (!result.added)
          setNotice("Bestie fandt ingen nye forslag til dagsordenen.");
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Besties forslag kunne ikke behandles. Prøv igen.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel grid gap-3 p-4"
      aria-labelledby="bestie-agenda-heading"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="flex items-center gap-2 font-semibold"
          id="bestie-agenda-heading"
        >
          <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
          Besties dagsordensforslag
        </h2>
        <button
          className={buttonClassName({ variant: "secondary", size: "sm" })}
          disabled={busy}
          onClick={() => request()}
          type="button"
        >
          Få forslag fra Bestie
        </button>
      </div>
      {busy ? (
        <p className="text-sm text-muted" role="status">
          Bestie arbejder …
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-muted" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {suggestions.length ? (
        <ul className="divide-y divide-line">
          {suggestions.map((item) => (
            <li
              className="grid gap-2 py-3 first:pt-0 last:pb-0"
              key={`${item.sourceKind}:${item.sourceId}`}
            >
              <h3 className="font-medium">{item.title}</h3>
              {item.description ? (
                <p className="text-sm">{item.description}</p>
              ) : null}
              <p className="text-sm">
                <strong>Formål</strong> {item.objective}
              </p>
              <p className="text-sm text-muted">
                {item.sourceKind === "task" ? (
                  <>
                    Opgave ·{" "}
                    <Link
                      className="text-brand hover:underline"
                      href={`/organizations/${organizationId}${getTaskDetailPath(item.sourceId, committeeId)}`}
                    >
                      {item.sourceTitle}
                    </Link>
                  </>
                ) : (
                  <>Beslutning · {item.sourceTitle}</>
                )}
              </p>
              <button
                className={`${buttonClassName({ size: "sm" })} w-fit`}
                disabled={busy}
                onClick={() => request(item)}
                type="button"
              >
                Godkend og tilføj
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
