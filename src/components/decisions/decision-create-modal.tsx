"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import {
  decisionStatusOptions,
  getDecisionCategorySuggestions,
  type DecisionStatus,
} from "@/lib/decisions";
import type { AgendaItem, DecisionView } from "@/types/domain";

export function DecisionCreateModal({
  organizationId,
  committeeId,
  meetingId,
  meetingDate,
  agendaItems,
  responsiblePeople,
  categorySource,
  triggerLabel = "Opret beslutning",
  trigger,
  initialAgendaItemId = "",
  initialTitle = "",
  initialDescription = "",
  initialCategory = "",
  initialResponsibleUserId = "",
  initialDeadline = "",
  sourceLabel,
  instanceId,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  meetingDate: string;
  agendaItems: Array<Pick<AgendaItem, "id" | "title">>;
  responsiblePeople: Array<{ id: string; name: string }>;
  categorySource: DecisionView[];
  triggerLabel?: string;
  trigger?: (open: () => void) => ReactNode;
  initialAgendaItemId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialCategory?: string;
  initialResponsibleUserId?: string;
  initialDeadline?: string;
  sourceLabel?: string;
  instanceId?: string;
}) {
  const router = useRouter();
  const formId = instanceId || initialAgendaItemId || meetingId;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [status, setStatus] = useState<DecisionStatus>("not_started");
  const [responsibleUserId, setResponsibleUserId] = useState(
    initialResponsibleUserId,
  );
  const [decisionDate, setDecisionDate] = useState(meetingDate.slice(0, 10));
  const [deadline, setDeadline] = useState(initialDeadline);
  const [category, setCategory] = useState(initialCategory);
  const [internalNote, setInternalNote] = useState("");
  const [agendaItemId, setAgendaItemId] = useState(initialAgendaItemId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const categorySuggestions = useMemo(
    () =>
      getDecisionCategorySuggestions(categorySource, committeeId, category),
    [category, categorySource, committeeId],
  );

  function showModal() {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setResponsibleUserId(initialResponsibleUserId);
    setDeadline(initialDeadline);
    setAgendaItemId(initialAgendaItemId);
    setDecisionDate(meetingDate.slice(0, 10));
    setStatus("not_started");
    setCategory(initialCategory);
    setInternalNote("");
    setError(null);
    setFieldErrors({});
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/decisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            meetingId,
            agendaItemId: agendaItemId || null,
            title,
            description,
            status,
            responsibleUserId: responsibleUserId || null,
            decisionDate,
            deadline: deadline || null,
            category: category || null,
            internalNote: internalNote || null,
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        fieldErrors?: Record<string, string[]>;
      };
      if (!response.ok) {
        setError(result.error || "Beslutningen kunne ikke gemmes.");
        setFieldErrors(
          Object.fromEntries(
            Object.entries(result.fieldErrors ?? {}).flatMap(([key, messages]) =>
              messages[0] ? [[key, messages[0]]] : [],
            ),
          ),
        );
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {trigger ? (
        trigger(showModal)
      ) : (
        <Button onClick={showModal} size="sm" variant="secondary">
          {triggerLabel}
        </Button>
      )}
      <Modal
        description={
          sourceLabel
            ? `Teksten er hentet fra ${sourceLabel} og kan tilrettes før gem.`
            : "Relationer og mødedato er udfyldt fra den aktuelle mødekontekst og kan justeres før gem."
        }
        maxWidth="3xl"
        onClose={() => setOpen(false)}
        open={open}
        title={
          sourceLabel
            ? "Opret beslutning fra referat"
            : initialAgendaItemId
            ? "Opret beslutning fra dette punkt"
            : "Opret beslutning"
        }
      >
        <form className="space-y-5" noValidate onSubmit={submit}>
          {error ? (
            <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm">
              <p className="font-semibold">{error}</p>
              {Object.values(fieldErrors).length ? (
                <ul className="mt-2 list-disc pl-5">
                  {[...new Set(Object.values(fieldErrors))].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`decision-title-${formId}`}>
                Titel
              </label>
              <Input
                id={`decision-title-${formId}`}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`decision-description-${formId}`}>
                Beskrivelse
              </label>
              <Textarea
                id={`decision-description-${formId}`}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </div>
            <div>
              <label className="label" htmlFor={`decision-status-${formId}`}>
                Status
              </label>
              <Select
                id={`decision-status-${formId}`}
                onChange={(event) => setStatus(event.target.value as DecisionStatus)}
                value={status}
              >
                {decisionStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor={`decision-date-${formId}`}>
                Beslutningsdato
              </label>
              <Input
                id={`decision-date-${formId}`}
                onChange={(event) => setDecisionDate(event.target.value)}
                type="date"
                value={decisionDate}
              />
            </div>
            <div>
              <label className="label" htmlFor={`decision-responsible-${formId}`}>
                Ansvarlig
              </label>
              <Select
                id={`decision-responsible-${formId}`}
                onChange={(event) => setResponsibleUserId(event.target.value)}
                value={responsibleUserId}
              >
                <option value="">Ingen ansvarlig</option>
                {responsiblePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor={`decision-deadline-${formId}`}>
                Deadline
              </label>
              <Input
                id={`decision-deadline-${formId}`}
                onChange={(event) => setDeadline(event.target.value)}
                type="date"
                value={deadline}
              />
            </div>
            <div>
              <label className="label" htmlFor={`decision-category-${formId}`}>
                Kategori
              </label>
              <Input
                autoComplete="off"
                id={`decision-category-${formId}`}
                list={`decision-categories-${formId}`}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Skriv eller vælg en tidligere kategori"
                value={category}
              />
              <datalist id={`decision-categories-${formId}`}>
                {categorySuggestions.map((suggestion) => (
                  <option
                    key={suggestion.toLocaleLowerCase("da-DK")}
                    value={suggestion}
                  />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor={`decision-agenda-${formId}`}>
                Relateret dagsordenspunkt
              </label>
              <Select
                id={`decision-agenda-${formId}`}
                onChange={(event) => setAgendaItemId(event.target.value)}
                value={agendaItemId}
              >
                <option value="">Intet dagsordenspunkt</option>
                {agendaItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`decision-note-${formId}`}>
                Intern note
              </label>
              <Textarea
                id={`decision-note-${formId}`}
                onChange={(event) => setInternalNote(event.target.value)}
                value={internalNote}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button
              disabled={saving}
              onClick={() => setOpen(false)}
              type="button"
              variant="secondary"
            >
              Annuller
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? "Gemmer..." : "Gem beslutning"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
