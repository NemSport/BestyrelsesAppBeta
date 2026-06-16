"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Button,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import type {
  AiTaskSuggestion,
  AiTaskSuggestionRequestSource,
} from "@/lib/ai-task-suggestions";
import { getTaskCategorySuggestions } from "@/lib/tasks";
import type { Database } from "@/types/database";
import type { DecisionView, TaskView } from "@/types/domain";

type MinutesStatus = Database["public"]["Enums"]["meeting_minutes_status"];

type ReviewSuggestion = AiTaskSuggestion & {
  id: string;
  approved: boolean;
  responsibleUserId: string;
  deadline: string;
  category: string;
  decisionId: string;
  creationStatus: "idle" | "created" | "failed";
  creationError: string | null;
  duplicateWarning: string | null;
};

type SuggestionResponse = {
  suggestions?: AiTaskSuggestion[];
  error?: string;
};

const confidenceLabels = {
  low: "Lav sikkerhed",
  medium: "Middel sikkerhed",
  high: "Høj sikkerhed",
} as const;

const confidenceTones = {
  low: "warning",
  medium: "info",
  high: "success",
} as const;

function normalizePersonName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("da-DK")
    .replace(/\s+/g, " ");
}

function normalizeTaskTitle(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("da-DK")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

function titlesAreVerySimilar(left: string, right: string) {
  const normalizedLeft = normalizeTaskTitle(left);
  const normalizedRight = normalizeTaskTitle(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  return (
    Math.min(normalizedLeft.length, normalizedRight.length) >= 12 &&
    (normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft))
  );
}

function findDuplicateWarning(
  title: string,
  existingTasks: TaskView[],
  sessionTitles: string[],
) {
  const existing = existingTasks.find((task) =>
    titlesAreVerySimilar(title, task.title),
  );
  if (existing) {
    return `En lignende opgave findes allerede i denne kontekst: “${existing.title}”.`;
  }
  if (sessionTitles.some((candidate) => titlesAreVerySimilar(title, candidate))) {
    return "Et lignende forslag findes allerede i denne gennemgang.";
  }
  return null;
}

function findSuggestedResponsible(
  suggestedName: string | null,
  responsiblePeople: Array<{ id: string; name: string }>,
) {
  if (!suggestedName) return "";
  const needle = normalizePersonName(suggestedName);
  const exact = responsiblePeople.find(
    (person) => normalizePersonName(person.name) === needle,
  );
  if (exact) return exact.id;

  const possibleMatches = responsiblePeople.filter((person) => {
    const candidate = normalizePersonName(person.name);
    return (
      candidate.startsWith(`${needle} `) ||
      needle.startsWith(`${candidate} `)
    );
  });
  return possibleMatches.length === 1 ? possibleMatches[0].id : "";
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as SuggestionResponse;
  } catch {
    return {};
  }
}

export function AiTaskReviewModal({
  organizationId,
  committeeId,
  meetingId,
  agendaItemId = null,
  source,
  sourceLabel,
  responsiblePeople,
  categorySource,
  decisions,
  existingTasks,
  minutesStatus,
  triggerLabel = "Foreslå opgaver fra referat",
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  agendaItemId?: string | null;
  source: AiTaskSuggestionRequestSource;
  sourceLabel: string;
  responsiblePeople: Array<{ id: string; name: string }>;
  categorySource: TaskView[];
  decisions: DecisionView[];
  existingTasks: TaskView[];
  minutesStatus: MinutesStatus;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const instanceId = useId().replace(/:/g, "");
  const analysisRequestId = useRef(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const approvedSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.approved && suggestion.creationStatus !== "created",
  );
  const createdCount = suggestions.filter(
    (suggestion) => suggestion.creationStatus === "created",
  ).length;

  function closeModal() {
    if (creating) return;
    analysisRequestId.current += 1;
    setLoading(false);
    setOpen(false);
    setSuggestions([]);
    setError(null);
    setMessage(null);
  }

  async function analyzeMinutes() {
    const requestId = analysisRequestId.current + 1;
    analysisRequestId.current = requestId;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/meetings/${meetingId}/task-suggestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            source,
            agendaItemId,
          }),
        },
      );
      const result = await readJson(response);
      if (analysisRequestId.current !== requestId) return;
      if (!response.ok) {
        setError(
          result.error ||
            "AI-forslagene kunne ikke hentes. Prøv igen om et øjeblik.",
        );
        return;
      }

      const nextSuggestions = result.suggestions ?? [];
      const sessionTitles: string[] = [];
      setSuggestions(
        nextSuggestions.map((suggestion, index) => {
          const duplicateWarning = findDuplicateWarning(
            suggestion.title,
            existingTasks,
            sessionTitles,
          );
          sessionTitles.push(suggestion.title);
          return {
          ...suggestion,
          id: `${instanceId}-${index}`,
          approved: !duplicateWarning,
          responsibleUserId:
            suggestion.suggestedResponsibleUserId ||
            findSuggestedResponsible(
              suggestion.suggestedResponsibleName,
              responsiblePeople,
            ),
          deadline: suggestion.suggestedDeadline ?? "",
          category: "",
          decisionId: suggestion.suggestedDecisionId ?? "",
          creationStatus: "idle",
          creationError: null,
          duplicateWarning,
          };
        }),
      );
      if (nextSuggestions.length === 0) {
        setMessage(
          "AI fandt ingen konkrete, uafsluttede opgaver i dette referat.",
        );
      }
    } catch {
      if (analysisRequestId.current !== requestId) return;
      setError(
        "Forbindelsen til AI-tjenesten mislykkedes. Kontrollér forbindelsen, og prøv igen.",
      );
    } finally {
      if (analysisRequestId.current === requestId) setLoading(false);
    }
  }

  function showModal() {
    setOpen(true);
    setSuggestions([]);
    setError(null);
    setMessage(null);
    void analyzeMinutes();
  }

  function updateSuggestion(
    id: string,
    patch: Partial<ReviewSuggestion>,
  ) {
    setSuggestions((current) =>
      current.map((suggestion) =>
        suggestion.id === id
          ? (() => {
              const next = { ...suggestion, ...patch };
              if (patch.title !== undefined) {
                next.duplicateWarning = findDuplicateWarning(
                  patch.title,
                  existingTasks,
                  current
                    .filter((candidate) => candidate.id !== id)
                    .map((candidate) => candidate.title),
                );
              }
              if (
                patch.creationStatus === undefined &&
                suggestion.creationStatus === "failed"
              ) {
                next.creationStatus = "idle";
              }
              if (patch.creationError === undefined) {
                next.creationError = null;
              }
              return next;
            })()
          : suggestion,
      ),
    );
  }

  async function createApprovedTasks() {
    if (approvedSuggestions.length === 0) {
      setError("Vælg mindst ét forslag, der skal oprettes som opgave.");
      return;
    }
    if (approvedSuggestions.some((suggestion) => !suggestion.title.trim())) {
      setError("Titel skal udfyldes på alle godkendte forslag.");
      return;
    }

    setCreating(true);
    setError(null);
    setMessage(null);
    let successes = 0;
    let failures = 0;

    for (const suggestion of approvedSuggestions) {
      try {
        const response = await fetch(
          `/api/organizations/${organizationId}/tasks`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId,
              committeeId,
              meetingId,
              agendaItemId:
                suggestion.source === "agenda_item_minutes"
                  ? suggestion.sourceAgendaItemId
                  : null,
              decisionId: suggestion.decisionId || null,
              title: suggestion.title.trim(),
              description: suggestion.description.trim(),
              status: "not_started",
              responsibleUserId: suggestion.responsibleUserId || null,
              deadline: suggestion.deadline || null,
              reminderAt: null,
              category: suggestion.category.trim() || null,
              internalNote: null,
            }),
          },
        );
        const result = await readJson(response);
        if (!response.ok) {
          failures += 1;
          updateSuggestion(suggestion.id, {
            creationStatus: "failed",
            creationError: result.error || "Opgaven kunne ikke oprettes.",
          });
          continue;
        }
        successes += 1;
        updateSuggestion(suggestion.id, {
          creationStatus: "created",
          creationError: null,
        });
      } catch {
        failures += 1;
        updateSuggestion(suggestion.id, {
          creationStatus: "failed",
          creationError: "Forbindelsen til serveren mislykkedes.",
        });
      }
    }

    if (successes > 0) router.refresh();
    if (failures === 0) {
      setMessage(
        `${successes} ${
          successes === 1 ? "opgave er" : "opgaver er"
        } oprettet og vises nu i Task View.`,
      );
    } else {
      setError(
        `${successes} blev oprettet, mens ${failures} ikke kunne oprettes. Ret fejlene og prøv igen.`,
      );
    }
    setCreating(false);
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button
          disabled={minutesStatus === "draft"}
          onClick={showModal}
          size="sm"
          title={
            minutesStatus === "draft"
              ? "Markér referatet som klar til godkendelse, før AI-forslag startes."
              : undefined
          }
          variant="secondary"
        >
          {triggerLabel}
        </Button>
        {minutesStatus === "draft" ? (
          <span className="max-w-64 text-right text-xs text-muted">
            Tilgængelig når referatet er klar til godkendelse.
          </span>
        ) : null}
      </div>
      <Modal
        description={`Gennemgå forslag fra ${sourceLabel}. Intet oprettes, før du vælger “Opret godkendte opgaver”.`}
        maxWidth="3xl"
        onClose={closeModal}
        open={open}
        title="Gennemgå AI-forslag"
      >
        <div className="space-y-5">
          {error ? (
            <div
              className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm"
              role="alert"
            >
              {error}
            </div>
          ) : null}
          {message ? (
            <div
              className={`rounded-[var(--radius-control)] px-4 py-3 text-sm ${
                suggestions.length === 0
                  ? "border border-line bg-subtle/45 text-foreground"
                  : "alert-success"
              }`}
              role="status"
            >
              {message}
              {createdCount > 0 ? (
                <Link
                  className="ml-2 font-semibold text-brand hover:underline"
                  href={`/organizations/${organizationId}/tasks`}
                >
                  Åbn Task View
                </Link>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-[var(--radius-panel)] border border-line bg-subtle/40 px-4 py-8 text-center">
              <p className="font-semibold">
                {source === "whole_meeting"
                  ? "AI analyserer hele referatet..."
                  : "AI analyserer referatet..."}
              </p>
              <p className="mt-1 text-sm text-muted">
                Der oprettes ingen opgaver under analysen.
              </p>
            </div>
          ) : null}

          {!loading && suggestions.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {suggestions.length} forslag fundet ·{" "}
                  {approvedSuggestions.length} valgt til oprettelse
                </p>
                <Button
                  onClick={() =>
                    setSuggestions((current) =>
                      current.map((suggestion) =>
                        suggestion.creationStatus === "created"
                          ? suggestion
                          : { ...suggestion, approved: true },
                      ),
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  Godkend alle
                </Button>
              </div>

              <div className="space-y-4">
                {suggestions.map((suggestion, index) => (
                  <SuggestionEditor
                    categorySource={categorySource}
                    committeeId={committeeId}
                    organizationId={organizationId}
                    index={index}
                    key={suggestion.id}
                    onChange={(patch) => updateSuggestion(suggestion.id, patch)}
                    decisions={decisions}
                    responsiblePeople={responsiblePeople}
                    suggestion={suggestion}
                  />
                ))}
              </div>
            </>
          ) : null}

          {!loading && suggestions.length === 0 && !message && !error ? (
            <p className="text-sm text-muted">
              Der er endnu ingen forslag at gennemgå.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-muted">
              AI-forslag er vejledende og skal gennemgås. Intet oprettes uden
              dit eksplicitte valg.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={loading || creating}
                onClick={closeModal}
                variant="secondary"
              >
                {createdCount > 0 ? "Luk" : "Annuller"}
              </Button>
              {suggestions.length > 0 ? (
                <Button
                  disabled={creating || approvedSuggestions.length === 0}
                  onClick={() => void createApprovedTasks()}
                >
                  {creating ? "Opretter..." : "Opret godkendte opgaver"}
                </Button>
              ) : (
                <Button
                  disabled={loading}
                  onClick={() => void analyzeMinutes()}
                  variant="secondary"
                >
                  Prøv igen
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

function SuggestionEditor({
  suggestion,
  index,
  responsiblePeople,
  categorySource,
  decisions,
  committeeId,
  organizationId,
  onChange,
}: {
  suggestion: ReviewSuggestion;
  index: number;
  responsiblePeople: Array<{ id: string; name: string }>;
  categorySource: TaskView[];
  decisions: DecisionView[];
  committeeId: string;
  organizationId: string;
  onChange: (patch: Partial<ReviewSuggestion>) => void;
}) {
  const categorySuggestions = useMemo(
    () =>
      getTaskCategorySuggestions(
        categorySource,
        committeeId,
        suggestion.category,
      ),
    [categorySource, committeeId, suggestion.category],
  );
  const disabled = suggestion.creationStatus === "created";
  const fieldId = suggestion.id.replace(/[^a-zA-Z0-9-_]/g, "");
  const availableDecisions = decisions.filter(
    (decision) =>
      decision.status !== "cancelled" &&
      (!suggestion.sourceAgendaItemId ||
        decision.agenda_item_id === suggestion.sourceAgendaItemId),
  );

  return (
    <section
      className={`rounded-[var(--radius-panel)] border p-4 sm:p-5 ${
        suggestion.approved
          ? "border-line bg-surface"
          : "border-line bg-subtle/45 opacity-75"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="page-eyebrow">Forslag {index + 1}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge tone={confidenceTones[suggestion.confidence]}>
              {confidenceLabels[suggestion.confidence]}
            </StatusBadge>
            <Link
              className="text-xs font-medium text-brand hover:underline"
              href={`/organizations/${organizationId}/committees/${committeeId}/meetings/${suggestion.sourceMeetingId}`}
            >
              Møde: {suggestion.sourceMeetingTitle}
            </Link>
            {suggestion.sourceAgendaItemId ? (
              <Link
                className="text-xs font-medium text-brand hover:underline"
                href={`/organizations/${organizationId}/committees/${committeeId}/agenda-items/${suggestion.sourceAgendaItemId}`}
              >
                Punkt: {suggestion.sourceTitle || "Ukendt punkt"}
              </Link>
            ) : (
              <span className="text-xs text-muted">Kilde: Generelt referat</span>
            )}
          </div>
        </div>
        {disabled ? (
          <StatusBadge tone="success">Oprettet</StatusBadge>
        ) : (
          <Button
            onClick={() => onChange({ approved: !suggestion.approved })}
            size="sm"
            variant={suggestion.approved ? "secondary" : "ghost"}
          >
            {suggestion.approved ? "Godkendt" : "Afvist"}
          </Button>
        )}
      </div>

      <fieldset
        className="mt-4 grid gap-4 sm:grid-cols-2"
        disabled={disabled || !suggestion.approved}
      >
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`ai-title-${fieldId}`}>
            Titel
          </label>
          <Input
            id={`ai-title-${fieldId}`}
            onChange={(event) => onChange({ title: event.target.value })}
            value={suggestion.title}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`ai-description-${fieldId}`}>
            Beskrivelse
          </label>
          <Textarea
            className="min-h-20"
            id={`ai-description-${fieldId}`}
            onChange={(event) => onChange({ description: event.target.value })}
            value={suggestion.description}
          />
        </div>
        <div>
          <label className="label" htmlFor={`ai-responsible-${fieldId}`}>
            Foreslået ansvarlig
          </label>
          <Select
            id={`ai-responsible-${fieldId}`}
            onChange={(event) =>
              onChange({ responsibleUserId: event.target.value })
            }
            value={suggestion.responsibleUserId}
          >
            <option value="">Tilknyt ansvarlig</option>
            {responsiblePeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={confidenceTones[suggestion.responsibleConfidence]}
            >
              {confidenceLabels[suggestion.responsibleConfidence]}
            </StatusBadge>
            <p className="text-xs text-muted">
              {suggestion.responsibleReason}
            </p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`ai-deadline-${fieldId}`}>
            Foreslået deadline
          </label>
          <Input
            id={`ai-deadline-${fieldId}`}
            onChange={(event) => onChange({ deadline: event.target.value })}
            type="date"
            value={suggestion.deadline}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge tone={confidenceTones[suggestion.deadlineConfidence]}>
              {confidenceLabels[suggestion.deadlineConfidence]}
            </StatusBadge>
            <p className="text-xs text-muted">{suggestion.deadlineReason}</p>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`ai-decision-${fieldId}`}>
            Relateret beslutning
          </label>
          <Select
            id={`ai-decision-${fieldId}`}
            onChange={(event) => onChange({ decisionId: event.target.value })}
            value={suggestion.decisionId}
          >
            <option value="">Ingen beslutning</option>
            {availableDecisions.map((decision) => (
              <option key={decision.id} value={decision.id}>
                {decision.title}
              </option>
            ))}
          </Select>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge tone={confidenceTones[suggestion.decisionConfidence]}>
              {confidenceLabels[suggestion.decisionConfidence]}
            </StatusBadge>
            <p className="text-xs text-muted">{suggestion.decisionReason}</p>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`ai-category-${fieldId}`}>
            Kategori
          </label>
          <Input
            autoComplete="off"
            id={`ai-category-${fieldId}`}
            list={`ai-categories-${fieldId}`}
            onChange={(event) => onChange({ category: event.target.value })}
            placeholder="Skriv eller vælg en tidligere kategori"
            value={suggestion.category}
          />
          <datalist id={`ai-categories-${fieldId}`}>
            {categorySuggestions.map((category) => (
              <option
                key={category.toLocaleLowerCase("da-DK")}
                value={category}
              />
            ))}
          </datalist>
        </div>
      </fieldset>

      {suggestion.creationError ? (
        <p className="mt-3 text-sm font-medium text-danger" role="alert">
          {suggestion.creationError}
        </p>
      ) : null}
      {suggestion.duplicateWarning ? (
        <p
          className="mt-3 rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-strong"
          role="status"
        >
          {suggestion.duplicateWarning} Kontrollér forslaget, før du vælger det.
        </p>
      ) : null}
    </section>
  );
}
