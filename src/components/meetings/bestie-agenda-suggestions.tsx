"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Input, Textarea, buttonClassName } from "@/components/ui";
import {
  bestieAgendaContent,
  type BestieAgendaSuggestion,
} from "@/lib/bestie-agenda";
import { getTaskDetailPath } from "@/lib/task-register-state";

type ReviewRequest =
  | { action: "suggest" }
  | { action: "approve"; suggestion: BestieAgendaSuggestion }
  | { action: "dismiss"; suggestion: BestieAgendaSuggestion };

type Scope = { organizationId: string; committeeId: string; meetingId: string };

export function BestieAgendaSuggestions({
  organizationId,
  committeeId,
  meetingId,
  suggestions,
}: Scope & { suggestions: BestieAgendaSuggestion[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<BestieAgendaSuggestion | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function request(review: ReviewRequest) {
    const suggestion = review.action === "suggest" ? null : review.suggestion;
    const changes =
      review.action === "approve"
        ? bestieAgendaContent.safeParse(review.suggestion)
        : null;
    if (changes && !changes.success) {
      setError("Udfyld titel og formål, og kontrollér felternes længde.");
      return;
    }
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
          action: review.action,
          changes: changes?.data,
          suggestion: suggestion && {
            sourceKind: suggestion.sourceKind,
            sourceId: suggestion.sourceId,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? result.error);
      if (review.action === "approve") {
        setEditing(null);
        setNotice(`“${changes?.data.title}” er tilføjet til dagsordenen.`);
      } else if (review.action === "dismiss") {
        setNotice("Forslaget er afvist for dette møde.");
      } else if (!result.added) {
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
          disabled={busy || !!editing}
          onClick={() => request({ action: "suggest" })}
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
          {suggestions.map((item) => {
            const edited =
              editing?.sourceId === item.sourceId &&
              editing.sourceKind === item.sourceKind
                ? editing
                : null;
            return (
              <li
                className="grid gap-2 py-3 first:pt-0 last:pb-0"
                key={`${item.sourceKind}:${item.sourceId}`}
              >
                {edited ? (
                  <form
                    className="grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void request({ action: "approve", suggestion: edited });
                    }}
                  >
                    <label className="grid gap-1 text-sm">
                      Titel
                      <Input
                        required
                        maxLength={200}
                        value={edited.title}
                        onChange={(event) =>
                          setEditing({ ...edited, title: event.target.value })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Baggrund
                      <Textarea
                        maxLength={1000}
                        value={edited.description}
                        onChange={(event) =>
                          setEditing({
                            ...edited,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Formål
                      <Textarea
                        required
                        maxLength={400}
                        value={edited.objective}
                        onChange={(event) =>
                          setEditing({
                            ...edited,
                            objective: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" type="submit" disabled={busy}>
                        Godkend og tilføj
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setEditing(null);
                          setError("");
                        }}
                      >
                        Annuller
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h3 className="font-medium">{item.title}</h3>
                    {item.description ? (
                      <p className="text-sm">{item.description}</p>
                    ) : null}
                    <p className="text-sm">
                      <strong>Formål</strong> {item.objective}
                    </p>
                  </>
                )}
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
                {edited ? null : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !!editing}
                      onClick={() =>
                        request({ action: "approve", suggestion: item })
                      }
                    >
                      Godkend og tilføj
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !!editing}
                      onClick={() => {
                        setEditing(item);
                        setError("");
                        setNotice("");
                      }}
                    >
                      Ret
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || !!editing}
                      onClick={() =>
                        request({ action: "dismiss", suggestion: item })
                      }
                    >
                      Afvis
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
