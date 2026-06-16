"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import {
  getTaskCategorySuggestions,
  taskStatusOptions,
  type TaskStatus,
} from "@/lib/tasks";
import type {
  AgendaItem,
  DecisionView,
  Meeting,
  TaskView,
} from "@/types/domain";

export function TaskCreateModal({
  organizationId,
  committeeId,
  meetings = [],
  agendaItems = [],
  decisions = [],
  responsiblePeople,
  categorySource,
  triggerLabel = "Opret opgave",
  trigger,
  initialMeetingId = "",
  initialAgendaItemId = "",
  initialDecisionId = "",
  initialTitle = "",
  initialDescription = "",
  initialResponsibleUserId = "",
  initialDeadline = "",
  initialCategory = "",
  sourceLabel,
  instanceId,
}: {
  organizationId: string;
  committeeId: string;
  meetings?: Array<Pick<Meeting, "id" | "title" | "starts_at">>;
  agendaItems?: Array<Pick<AgendaItem, "id" | "title">>;
  decisions?: Array<Pick<DecisionView, "id" | "title">>;
  responsiblePeople: Array<{ id: string; name: string }>;
  categorySource: TaskView[];
  triggerLabel?: string;
  trigger?: (open: () => void) => ReactNode;
  initialMeetingId?: string;
  initialAgendaItemId?: string;
  initialDecisionId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialResponsibleUserId?: string;
  initialDeadline?: string;
  initialCategory?: string;
  sourceLabel?: string;
  instanceId?: string;
}) {
  const router = useRouter();
  const formId =
    instanceId || initialDecisionId || initialAgendaItemId || initialMeetingId;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [status, setStatus] = useState<TaskStatus>("not_started");
  const [responsibleUserId, setResponsibleUserId] = useState(
    initialResponsibleUserId,
  );
  const [deadline, setDeadline] = useState(initialDeadline);
  const [reminderAt, setReminderAt] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [internalNote, setInternalNote] = useState("");
  const [meetingId, setMeetingId] = useState(initialMeetingId);
  const [agendaItemId, setAgendaItemId] = useState(initialAgendaItemId);
  const [decisionId, setDecisionId] = useState(initialDecisionId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const categorySuggestions = useMemo(
    () => getTaskCategorySuggestions(categorySource, committeeId, category),
    [category, categorySource, committeeId],
  );

  function showModal() {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setStatus("not_started");
    setResponsibleUserId(initialResponsibleUserId);
    setDeadline(initialDeadline);
    setReminderAt("");
    setCategory(initialCategory);
    setInternalNote("");
    setMeetingId(initialMeetingId);
    setAgendaItemId(initialAgendaItemId);
    setDecisionId(initialDecisionId);
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
        `/api/organizations/${organizationId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            meetingId: meetingId || null,
            agendaItemId: agendaItemId || null,
            decisionId: decisionId || null,
            title,
            description,
            status,
            responsibleUserId: responsibleUserId || null,
            deadline: deadline || null,
            reminderAt: reminderAt
              ? new Date(reminderAt).toISOString()
              : null,
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
        setError(result.error || "Opgaven kunne ikke gemmes.");
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
            ? `Opgaven er udfyldt fra ${sourceLabel} og kan tilrettes før gem.`
            : "Opgaven knyttes til den aktuelle kontekst og kan tilrettes før gem."
        }
        maxWidth="3xl"
        onClose={() => setOpen(false)}
        open={open}
        title={triggerLabel}
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
              <label className="label" htmlFor={`task-title-${formId}`}>
                Titel
              </label>
              <Input
                id={`task-title-${formId}`}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`task-description-${formId}`}>
                Beskrivelse
              </label>
              <Textarea
                id={`task-description-${formId}`}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </div>
            <div>
              <label className="label" htmlFor={`task-status-${formId}`}>
                Status
              </label>
              <Select
                id={`task-status-${formId}`}
                onChange={(event) => setStatus(event.target.value as TaskStatus)}
                value={status}
              >
                {taskStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor={`task-responsible-${formId}`}>
                Ansvarlig
              </label>
              <Select
                id={`task-responsible-${formId}`}
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
              <label className="label" htmlFor={`task-deadline-${formId}`}>
                Deadline
              </label>
              <Input
                id={`task-deadline-${formId}`}
                onChange={(event) => setDeadline(event.target.value)}
                type="date"
                value={deadline}
              />
            </div>
            <div>
              <label className="label" htmlFor={`task-category-${formId}`}>
                Kategori
              </label>
              <Input
                autoComplete="off"
                id={`task-category-${formId}`}
                list={`task-categories-${formId}`}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Skriv eller vælg en tidligere kategori"
                value={category}
              />
              <datalist id={`task-categories-${formId}`}>
                {categorySuggestions.map((suggestion) => (
                  <option
                    key={suggestion.toLocaleLowerCase("da-DK")}
                    value={suggestion}
                  />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor={`task-reminder-${formId}`}>
                Påmindelse
              </label>
              <Input
                id={`task-reminder-${formId}`}
                onChange={(event) => setReminderAt(event.target.value)}
                type="datetime-local"
                value={reminderAt}
              />
              <p className="mt-1 text-xs text-muted">
                Gemmes til senere email/notifikation. Der sendes ikke
                automatisk noget endnu.
              </p>
            </div>
            {meetings.length ? (
              <div>
                <label className="label" htmlFor={`task-meeting-${formId}`}>
                  Relateret møde
                </label>
                <Select
                  id={`task-meeting-${formId}`}
                  onChange={(event) => setMeetingId(event.target.value)}
                  value={meetingId}
                >
                  <option value="">Intet møde</option>
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {agendaItems.length ? (
              <div>
                <label className="label" htmlFor={`task-agenda-${formId}`}>
                  Relateret dagsordenspunkt
                </label>
                <Select
                  id={`task-agenda-${formId}`}
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
            ) : null}
            {decisions.length ? (
              <div>
                <label className="label" htmlFor={`task-decision-${formId}`}>
                  Relateret beslutning
                </label>
                <Select
                  id={`task-decision-${formId}`}
                  onChange={(event) => setDecisionId(event.target.value)}
                  value={decisionId}
                >
                  <option value="">Ingen beslutning</option>
                  {decisions.map((decision) => (
                    <option key={decision.id} value={decision.id}>
                      {decision.title}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`task-note-${formId}`}>
                Intern note
              </label>
              <Textarea
                id={`task-note-${formId}`}
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
              {saving ? "Gemmer..." : "Gem opgave"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
