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
  getTaskCategorySuggestions,
  taskStatusOptions,
  type TaskStatus,
} from "@/lib/tasks";
import { reconcileTaskStakeholderContract } from "@/lib/task-stakeholder-context";
import type {
  AgendaItem,
  DecisionView,
  Meeting,
  TaskStakeholderContractOption,
  TaskStakeholderOption,
  TaskView,
} from "@/types/domain";

export function TaskCreateModal({
  organizationId,
  committeeId,
  committeeOptions = [],
  meetings = [],
  agendaItems = [],
  decisions = [],
  stakeholders = [],
  stakeholderContracts = [],
  responsiblePeople,
  categorySource,
  triggerLabel = "Opret opgave",
  trigger,
  initialMeetingId = "",
  initialAgendaItemId = "",
  initialDecisionId = "",
  initialStakeholderId = "",
  initialStakeholderContractId = "",
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
  committeeOptions?: Array<{ id: string; name: string }>;
  meetings?: Array<Pick<Meeting, "id" | "title" | "starts_at">>;
  agendaItems?: Array<Pick<AgendaItem, "id" | "title">>;
  decisions?: Array<Pick<DecisionView, "id" | "title">>;
  responsiblePeople: Array<{
    id: string;
    name: string;
    committeeIds?: string[];
  }>;
  stakeholders?: TaskStakeholderOption[];
  stakeholderContracts?: TaskStakeholderContractOption[];
  categorySource: TaskView[];
  triggerLabel?: string;
  trigger?: (open: () => void) => ReactNode;
  initialMeetingId?: string;
  initialAgendaItemId?: string;
  initialDecisionId?: string;
  initialStakeholderId?: string;
  initialStakeholderContractId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialResponsibleUserId?: string;
  initialDeadline?: string;
  initialCategory?: string;
  sourceLabel?: string;
  instanceId?: string;
}) {
  const router = useRouter();
  const defaultCommitteeId = committeeId || committeeOptions[0]?.id || "";
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
  const [selectedCommitteeId, setSelectedCommitteeId] =
    useState(defaultCommitteeId);
  const [stakeholderId, setStakeholderId] = useState(initialStakeholderId);
  const [stakeholderContractId, setStakeholderContractId] = useState(
    initialStakeholderContractId,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mutation = useMutationFeedback();
  const dirty =
    title !== initialTitle ||
    description !== initialDescription ||
    status !== "not_started" ||
    responsibleUserId !== initialResponsibleUserId ||
    deadline !== initialDeadline ||
    reminderAt !== "" ||
    category !== initialCategory ||
    internalNote !== "" ||
    meetingId !== initialMeetingId ||
    agendaItemId !== initialAgendaItemId ||
    decisionId !== initialDecisionId ||
    selectedCommitteeId !== defaultCommitteeId ||
    stakeholderId !== initialStakeholderId ||
    stakeholderContractId !== initialStakeholderContractId;
  const confirmDiscard = useUnsavedChanges(open && dirty && !mutation.pending);

  const categorySuggestions = useMemo(
    () =>
      getTaskCategorySuggestions(categorySource, selectedCommitteeId, category),
    [category, categorySource, selectedCommitteeId],
  );

  const visibleResponsiblePeople = responsiblePeople.filter(
    (person) =>
      !person.committeeIds || person.committeeIds.includes(selectedCommitteeId),
  );
  const visibleContracts = stakeholderContracts.filter(
    (contract) => contract.stakeholder_id === stakeholderId,
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
    setSelectedCommitteeId(defaultCommitteeId);
    setStakeholderId(initialStakeholderId);
    setStakeholderContractId(initialStakeholderContractId);
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
    if (!mutation.begin("Opgaven gemmes...")) return;
    setFieldErrors({});
    try {
      const result = await readMutationResponse<{ message?: string }>(
        await fetch(`/api/organizations/${organizationId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId: selectedCommitteeId,
            meetingId: meetingId || null,
            agendaItemId: agendaItemId || null,
            decisionId: decisionId || null,
            stakeholderId: stakeholderId || null,
            stakeholderContractId: stakeholderContractId || null,
            title,
            description,
            status,
            responsibleUserId: responsibleUserId || null,
            deadline: deadline || null,
            reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
            category: category || null,
            internalNote: internalNote || null,
          }),
        }),
        "Opgaven kunne ikke gemmes. Kontrollér felterne, og prøv igen.",
      );
      mutation.succeed(result.message || "Opgaven er gemt.");
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
        "title",
        "description",
        "committeeId",
        "stakeholderId",
        "stakeholderContractId",
        "deadline",
        "reminderAt",
        "category",
        "internalNote",
      ]);
      focusInvalidField(field ? `task-${field}-${formId}` : null);
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
            ? `Opgaven er udfyldt fra ${sourceLabel} og kan tilrettes før gem.`
            : "Opgaven knyttes til den aktuelle kontekst og kan tilrettes før gem."
        }
        maxWidth="3xl"
        onClose={closeModal}
        open={open}
        title={triggerLabel}
      >
        <form className="space-y-5" noValidate onSubmit={submit}>
          <MutationFeedback feedback={mutation.feedback} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`task-title-${formId}`}>
                Titel
              </label>
              <Input
                aria-describedby={
                  fieldErrors.title ? `task-title-${formId}-error` : undefined
                }
                aria-invalid={Boolean(fieldErrors.title)}
                id={`task-title-${formId}`}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
              <FieldError
                id={`task-title-${formId}-error`}
                message={fieldErrors.title}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`task-description-${formId}`}>
                Beskrivelse
              </label>
              <Textarea
                aria-describedby={
                  fieldErrors.description
                    ? `task-description-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.description)}
                id={`task-description-${formId}`}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
              <FieldError
                id={`task-description-${formId}-error`}
                message={fieldErrors.description}
              />
            </div>
            <div>
              {committeeOptions.length ? (
                <>
                  <label className="label" htmlFor={`task-committee-${formId}`}>
                    Udvalg
                  </label>
                  <Select
                    aria-describedby={
                      fieldErrors.committeeId
                        ? `task-committee-${formId}-error`
                        : undefined
                    }
                    aria-invalid={Boolean(fieldErrors.committeeId)}
                    id={`task-committee-${formId}`}
                    onChange={(event) => {
                      setSelectedCommitteeId(event.target.value);
                      setResponsibleUserId("");
                      setMeetingId("");
                      setAgendaItemId("");
                      setDecisionId("");
                    }}
                    value={selectedCommitteeId}
                  >
                    <option value="">Vælg udvalg</option>
                    {committeeOptions.map((committee) => (
                      <option key={committee.id} value={committee.id}>
                        {committee.name}
                      </option>
                    ))}
                  </Select>
                  <FieldError
                    id={`task-committee-${formId}-error`}
                    message={fieldErrors.committeeId}
                  />
                </>
              ) : (
                <>
                  <label className="label" htmlFor={`task-status-${formId}`}>
                    Status
                  </label>
                  <Select
                    id={`task-status-${formId}`}
                    onChange={(event) =>
                      setStatus(event.target.value as TaskStatus)
                    }
                    value={status}
                  >
                    {taskStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </>
              )}
            </div>
            {committeeOptions.length ? (
              <div>
                <label className="label" htmlFor={`task-status-${formId}`}>
                  Status
                </label>
                <Select
                  id={`task-status-${formId}`}
                  onChange={(event) =>
                    setStatus(event.target.value as TaskStatus)
                  }
                  value={status}
                >
                  {taskStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
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
                {visibleResponsiblePeople.map((person) => (
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
                aria-describedby={
                  fieldErrors.deadline
                    ? `task-deadline-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.deadline)}
                id={`task-deadline-${formId}`}
                onChange={(event) => setDeadline(event.target.value)}
                type="date"
                value={deadline}
              />
              <FieldError
                id={`task-deadline-${formId}-error`}
                message={fieldErrors.deadline}
              />
            </div>
            <div>
              <label className="label" htmlFor={`task-category-${formId}`}>
                Kategori
              </label>
              <Input
                autoComplete="off"
                id={`task-category-${formId}`}
                aria-describedby={
                  fieldErrors.category
                    ? `task-category-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.category)}
                list={`task-categories-${formId}`}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Skriv eller vælg en tidligere kategori"
                value={category}
              />
              <FieldError
                id={`task-category-${formId}-error`}
                message={fieldErrors.category}
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
              <label className="label" htmlFor={`task-reminderAt-${formId}`}>
                Påmindelse
              </label>
              <Input
                aria-describedby={
                  fieldErrors.reminderAt
                    ? `task-reminderAt-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.reminderAt)}
                id={`task-reminderAt-${formId}`}
                onChange={(event) => setReminderAt(event.target.value)}
                type="datetime-local"
                value={reminderAt}
              />
              <FieldError
                id={`task-reminderAt-${formId}-error`}
                message={fieldErrors.reminderAt}
              />
              <p className="mt-1 text-xs text-muted">
                Vises som en handling på det valgte tidspunkt.
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
            {stakeholders.length ? (
              <div>
                <label className="label" htmlFor={`task-stakeholder-${formId}`}>
                  Interessent
                </label>
                <Select
                  aria-describedby={
                    fieldErrors.stakeholderId
                      ? `task-stakeholder-${formId}-error`
                      : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.stakeholderId)}
                  id={`task-stakeholder-${formId}`}
                  onChange={(event) => {
                    const nextStakeholderId = event.target.value;
                    setStakeholderId(nextStakeholderId);
                    setStakeholderContractId(
                      reconcileTaskStakeholderContract(
                        nextStakeholderId,
                        stakeholderContractId,
                        stakeholderContracts,
                      ),
                    );
                  }}
                  value={stakeholderId}
                >
                  <option value="">Ingen interessent</option>
                  {stakeholders.map((stakeholder) => (
                    <option key={stakeholder.id} value={stakeholder.id}>
                      {stakeholder.name}
                    </option>
                  ))}
                </Select>
                <FieldError
                  id={`task-stakeholder-${formId}-error`}
                  message={fieldErrors.stakeholderId}
                />
              </div>
            ) : null}
            {stakeholderId ? (
              <div>
                <label
                  className="label"
                  htmlFor={`task-stakeholder-contract-${formId}`}
                >
                  Kontrakt
                </label>
                <Select
                  aria-describedby={
                    fieldErrors.stakeholderContractId
                      ? `task-stakeholder-contract-${formId}-error`
                      : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.stakeholderContractId)}
                  id={`task-stakeholder-contract-${formId}`}
                  onChange={(event) =>
                    setStakeholderContractId(event.target.value)
                  }
                  value={stakeholderContractId}
                >
                  <option value="">Ingen kontrakt</option>
                  {visibleContracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.title}
                    </option>
                  ))}
                </Select>
                <FieldError
                  id={`task-stakeholder-contract-${formId}-error`}
                  message={fieldErrors.stakeholderContractId}
                />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`task-internalNote-${formId}`}>
                Intern note
              </label>
              <Textarea
                aria-describedby={
                  fieldErrors.internalNote
                    ? `task-internalNote-${formId}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.internalNote)}
                id={`task-internalNote-${formId}`}
                onChange={(event) => setInternalNote(event.target.value)}
                value={internalNote}
              />
              <FieldError
                id={`task-internalNote-${formId}-error`}
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
              {mutation.pending ? "Gemmer..." : "Gem opgave"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
