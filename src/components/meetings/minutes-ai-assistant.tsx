"use client";

import { useState } from "react";

import { RichTextContent } from "@/components/forms/rich-text-content";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  aiMinutesAssistantActionLabels,
  type AiMinutesAssistantAction,
  type AiMinutesAssistantField,
  type AiMinutesAssistantSource,
} from "@/lib/ai-minutes-assistant";

const actions = Object.entries(aiMinutesAssistantActionLabels) as Array<
  [AiMinutesAssistantAction, string]
>;

type AiMinutesAssistantResult = {
  action: AiMinutesAssistantAction;
  originalHtml: string;
  originalText: string;
  suggestionHtml: string;
  suggestionText: string;
  summary: string;
  model: string;
  promptVersion: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
};

export function MinutesAiAssistant({
  agendaItemId,
  committeeId,
  disabled = false,
  field,
  meetingId,
  onApply,
  organizationId,
  source,
  value,
}: {
  agendaItemId?: string | null;
  committeeId: string;
  disabled?: boolean;
  field: AiMinutesAssistantField;
  meetingId: string;
  onApply: (value: string) => void;
  organizationId: string;
  source: AiMinutesAssistantSource;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] =
    useState<AiMinutesAssistantAction>("fix_language");
  const [loadingAction, setLoadingAction] =
    useState<AiMinutesAssistantAction | null>(null);
  const [result, setResult] = useState<AiMinutesAssistantResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function requestSuggestion(action: AiMinutesAssistantAction) {
    setSelectedAction(action);
    setLoadingAction(action);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch(
        `/api/meetings/${meetingId}/minutes/ai-assist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            source,
            agendaItemId: source === "agenda_item_minutes" ? agendaItemId : null,
            field,
            action,
            text: value,
          }),
        },
      );
      const payload = (await response.json()) as
        | AiMinutesAssistantResult
        | { error?: string };
      if (!response.ok) {
        const errorPayload = payload as { error?: string };
        setError(
          errorPayload.error ||
            "AI kunne ikke omskrive teksten lige nu. Prøv igen.",
        );
        return;
      }
      setResult(payload as AiMinutesAssistantResult);
      setOpen(true);
    } catch {
      setError("AI kunne ikke omskrive teksten lige nu. Prøv igen.");
    } finally {
      setLoadingAction(null);
    }
  }

  function closeReview() {
    setOpen(false);
    setCopied(false);
  }

  function applySuggestion() {
    if (!result) return;
    onApply(result.suggestionHtml);
    closeReview();
  }

  async function copySuggestion() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.suggestionText);
      setCopied(true);
    } catch {
      setError("Forslaget kunne ikke kopieres automatisk.");
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <details className="group relative">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/55 hover:bg-mist/65 hover:text-ink [&::-webkit-details-marker]:hidden">
          AI-hjælp
          <span
            aria-hidden="true"
            className="text-[0.65rem] transition group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="absolute left-0 z-30 mt-1.5 w-64 max-w-[calc(100vw-2rem)] border border-line bg-surface p-1.5 shadow-dialog">
          {actions.map(([action, label]) => (
            <button
              className="block w-full px-2.5 py-2 text-left text-xs font-medium text-ink transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-55"
              disabled={disabled || loadingAction !== null}
              key={action}
              onClick={() => void requestSuggestion(action)}
              type="button"
            >
              {loadingAction === action ? "AI arbejder..." : label}
            </button>
          ))}
        </div>
      </details>
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Modal
        description="Gennemgå forslaget, før du anvender det. Original tekst ændres ikke automatisk."
        eyebrow="AI-forslag"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              AI-output er et forslag, ikke et autoritativt referat.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={copySuggestion} size="sm" variant="secondary">
                {copied ? "Kopieret" : "Kopiér forslag"}
              </Button>
              <Button onClick={closeReview} size="sm" variant="secondary">
                Afvis
              </Button>
              <Button onClick={applySuggestion} size="sm">
                Anvend forslag
              </Button>
            </div>
          </div>
        }
        maxWidth="3xl"
        onClose={closeReview}
        open={open}
        title={aiMinutesAssistantActionLabels[selectedAction]}
      >
        {result ? (
          <div className="space-y-4">
            <div className="border-l-2 border-brand bg-brand-soft/35 px-3 py-2 text-sm text-ink">
              {result.summary}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="min-w-0">
                <p className="minutes-document-label">Original tekst</p>
                <div className="mt-2 max-h-[45vh] overflow-y-auto border border-line bg-subtle/35 p-3">
                  <RichTextContent
                    emptyText="Ingen tekst"
                    value={result.originalHtml}
                  />
                </div>
              </section>
              <section className="min-w-0">
                <p className="minutes-document-label">AI-forslag</p>
                <div className="mt-2 max-h-[45vh] overflow-y-auto border border-line bg-surface p-3">
                  <RichTextContent value={result.suggestionHtml} />
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
