"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  FieldError,
  Input,
  Modal,
  MutationFeedback,
  Select,
  Textarea,
} from "@/components/ui";
import {
  focusInvalidField,
  useMutationFeedback,
  useUnsavedChanges,
} from "@/hooks/use-mutation-feedback";
import {
  firstFieldError,
  MutationRequestError,
  readMutationResponse,
} from "@/lib/mutation-feedback";
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
  meetingId?: string;
  meetingDate?: string;
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
  const initialDecisionDate =
    meetingDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const formId = instanceId || initialAgendaItemId || meetingId || committeeId;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [status, setStatus] = useState<DecisionStatus>("not_started");
  const [responsibleUserId, setResponsibleUserId] = useState(
    initialResponsibleUserId,
  );
  const [decisionDate, setDecisionDate] = useState(initialDecisionDate);
  const [deadline, setDeadline] = useState(initialDeadline);
  const [category, setCategory] = useState(initialCategory);
  const [internalNote, setInternalNote] = useState("");
  const [agendaItemId, setAgendaItemId] = useState(initialAgendaItemId);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mutation = useMutationFeedback();
  const dirty =
    title !== initialTitle ||
    description !== initialDescription ||
    status !== "not_started" ||
    responsibleUserId !== initialResponsibleUserId ||
    decisionDate !== initialDecisionDate ||
    deadline !== initialDeadline ||
    category !== initialCategory ||
    internalNote !== "" ||
    agendaItemId !== initialAgendaItemId;
  const confirmDiscard = useUnsavedChanges(open && dirty && !mutation.pending);

  const categorySuggestions = useMemo(
    () => getDecisionCategorySuggestions(categorySource, committeeId, category),
    [category, categorySource, committeeId],
  );

  function showModal() {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setResponsibleUserId(initialResponsibleUserId);
    setDeadline(initialDeadline);
    setAgendaItemId(initialAgendaItemId);
    setDecisionDate(initialDecisionDate);
    setStatus("not_started");
    setCategory(initialCategory);
    setInternalNote("");
    setFieldErrors({});
    mutation.reset();
    setOpen(true);
  }

  function closeModal() {
    if (mutation.pending || !confirmDiscard()) return;
    setOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agendaItemId) {
      const nextFieldErrors = {
        agendaItemId: "Vælg det dagsordenspunkt, beslutningen hører til.",
      };
      setFieldErrors(nextFieldErrors);
      mutation.fail(nextFieldErrors.agendaItemId);
      focusInvalidField(`decision-agenda-${formId}`);
      return;
    }
    if (!mutation.begin("Beslutningen gemmes...")) return;
    setFieldErrors({});
    try {
      const result = await readMutationResponse<{ message?: string }>(
        await fetch(`/api/organizations/${organizationId}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            meetingId: meetingId || null,
            agendaItemId,
            title,
            description,
            status,
            responsibleUserId: responsibleUserId || null,
            decisionDate,
            deadline: deadline || null,
            category: category || null,
            internalNote: internalNote || null,
          }),
        }),
        "Beslutningen kunne ikke gemmes. Kontrollér felterne, og prøv igen.",
      );
      mutation.succeed(result.message || "Beslutningen er gemt.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      const nextFieldErrors =
        caught instanceof MutationRequestError ? caught.fieldErrors : {};
      setFieldErrors(nextFieldErrors);
      mutation.fail(
        caught instanceof Error
          ? caught.message
          : "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
      const field = firstFieldError(nextFieldErrors, [
        "agendaItemId",
        "title",
        "description",
        "decisionDate",
        "deadline",
        "category",
        "internalNote",
      ]);
      focusInvalidField(
        field
          ? field === "agendaItemId"
            ? `decision-agenda-${formId}`
            : `decision-${field}-${formId}`
          : null,
      );
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
      {!open ? <MutationFeedback feedback={mutation.feedback} /> : null}
      <Modal
        description={
          sourceLabel
            ? `Teksten er hentet fra ${sourceLabel} og kan tilrettes før gem. Beslutningen gemmes i det valgte dagsordenspunkts historik.`
            : "Vælg det dagsordenspunkt, hvor beslutningen blev truffet. Beslutningen kan ikke oprettes uden denne relation."
        }
        maxWidth="3xl"
        onClose={closeModal}
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
          <MutationFeedback feedback={mutation.feedback} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`decision-title-${formId}`}>
                Titel
              </label>
              <Input
                aria-describedby={
                  fieldErrors.title
                    ? `decision-title-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.title)}
                id={`decision-title-${formId}`}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
              <FieldError
                id={`decision-title-${formId}-error`}
                message={fieldErrors.title}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="label"
                htmlFor={`decision-description-${formId}`}
              >
                Beskrivelse
              </label>
              <Textarea
                aria-describedby={
                  fieldErrors.description
                    ? `decision-description-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.description)}
                id={`decision-description-${formId}`}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
              <FieldError
                id={`decision-description-${formId}-error`}
                message={fieldErrors.description}
              />
            </div>
            <div>
              <label className="label" htmlFor={`decision-status-${formId}`}>
                Status
              </label>
              <Select
                id={`decision-status-${formId}`}
                onChange={(event) =>
                  setStatus(event.target.value as DecisionStatus)
                }
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
              <label
                className="label"
                htmlFor={`decision-decisionDate-${formId}`}
              >
                Beslutningsdato
              </label>
              <Input
                aria-describedby={
                  fieldErrors.decisionDate
                    ? `decision-decisionDate-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.decisionDate)}
                id={`decision-decisionDate-${formId}`}
                onChange={(event) => setDecisionDate(event.target.value)}
                type="date"
                value={decisionDate}
              />
              <FieldError
                id={`decision-decisionDate-${formId}-error`}
                message={fieldErrors.decisionDate}
              />
            </div>
            <div>
              <label
                className="label"
                htmlFor={`decision-responsible-${formId}`}
              >
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
                aria-describedby={
                  fieldErrors.deadline
                    ? `decision-deadline-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.deadline)}
                id={`decision-deadline-${formId}`}
                onChange={(event) => setDeadline(event.target.value)}
                type="date"
                value={deadline}
              />
              <FieldError
                id={`decision-deadline-${formId}-error`}
                message={fieldErrors.deadline}
              />
            </div>
            <div>
              <label className="label" htmlFor={`decision-category-${formId}`}>
                Kategori
              </label>
              <Input
                aria-describedby={
                  fieldErrors.category
                    ? `decision-category-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.category)}
                autoComplete="off"
                id={`decision-category-${formId}`}
                list={`decision-categories-${formId}`}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Skriv eller vælg en tidligere kategori"
                value={category}
              />
              <FieldError
                id={`decision-category-${formId}-error`}
                message={fieldErrors.category}
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
                aria-describedby={
                  fieldErrors.agendaItemId
                    ? `decision-agenda-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.agendaItemId)}
                id={`decision-agenda-${formId}`}
                onChange={(event) => setAgendaItemId(event.target.value)}
                value={agendaItemId}
              >
                <option value="">Vælg dagsordenspunkt</option>
                {agendaItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
              <FieldError
                id={`decision-agenda-${formId}-error`}
                message={fieldErrors.agendaItemId}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="label"
                htmlFor={`decision-internalNote-${formId}`}
              >
                Intern note
              </label>
              <Textarea
                aria-describedby={
                  fieldErrors.internalNote
                    ? `decision-internalNote-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.internalNote)}
                id={`decision-internalNote-${formId}`}
                onChange={(event) => setInternalNote(event.target.value)}
                value={internalNote}
              />
              <FieldError
                id={`decision-internalNote-${formId}-error`}
                message={fieldErrors.internalNote}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button
              disabled={mutation.pending}
              onClick={closeModal}
              type="button"
              variant="secondary"
            >
              Annuller
            </Button>
            <Button disabled={mutation.pending} type="submit">
              {mutation.pending ? "Gemmer..." : "Gem beslutning"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
