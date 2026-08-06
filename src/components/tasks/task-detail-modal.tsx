"use client";

import { useEffect, useState, type FormEvent } from "react";

import { TaskComments } from "@/components/tasks/task-comments";
import {
  Button,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import {
  taskStatusLabels,
  taskStatusOptions,
  taskStatusTones,
  type TaskStatus,
} from "@/lib/tasks";
import type { TaskView } from "@/types/domain";

type TaskModalDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  responsibleUserId: string;
  deadline: string;
  internalNote: string;
};

export type RelatedTaskMeeting = {
  id: string;
  title: string;
  startsAt: string;
};

function draftFromTask(task: TaskView): TaskModalDraft {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    responsibleUserId: task.responsible_user_id ?? "",
    deadline: task.deadline ?? "",
    internalNote: task.internal_note ?? "",
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(value.length === 10 ? `${value}T00:00:00` : value),
  );
}

export function TaskDetailModal({
  canEdit,
  onClose,
  onUpdated,
  open,
  organizationId,
  originMeeting,
  relatedMeeting,
  responsiblePeople,
  task,
}: {
  canEdit: boolean;
  onClose: () => void;
  onUpdated: (task: TaskView) => void;
  open: boolean;
  organizationId: string;
  originMeeting?: RelatedTaskMeeting;
  relatedMeeting?: RelatedTaskMeeting;
  responsiblePeople: Array<{ id: string; name: string }>;
  task: TaskView;
}) {
  const [draft, setDraft] = useState(() => draftFromTask(task));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromTask(task));
    setError(null);
    setMessage(null);
  }, [task]);

  function updateDraft<Key extends keyof TaskModalDraft>(
    key: Key,
    value: TaskModalDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    setMessage(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId: task.committee_id,
          meetingId: task.meeting_id,
          agendaItemId: task.agenda_item_id,
          decisionId: task.decision_id,
          title: draft.title,
          description: draft.description,
          status: draft.status,
          responsibleUserId: draft.responsibleUserId || null,
          deadline: draft.deadline || null,
          reminderAt: task.reminder_at,
          category: task.category,
          internalNote: draft.internalNote || null,
        }),
      });
      const result = (await response.json()) as Partial<TaskView> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Opgaven kunne ikke gemmes.");
      }
      const responsible = responsiblePeople.find(
        (person) => person.id === draft.responsibleUserId,
      );
      onUpdated({
        ...task,
        ...result,
        title: draft.title,
        description: draft.description,
        status: draft.status,
        responsible_user_id: draft.responsibleUserId || null,
        responsible: responsible
          ? { id: responsible.id, full_name: responsible.name }
          : null,
        deadline: draft.deadline || null,
      });
      setMessage("Opgaven er opdateret.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Opgaven kunne ikke gemmes.",
      );
    } finally {
      setSaving(false);
    }
  }

  const meetings = [
    task.meeting
      ? {
          id: task.meeting.id,
          title: task.meeting.title,
          startsAt: task.meeting.starts_at,
          label: "Oprettet på",
        }
      : originMeeting
        ? { ...originMeeting, label: "Oprettet på" }
        : null,
    relatedMeeting &&
    relatedMeeting.id !== (task.meeting?.id ?? originMeeting?.id)
      ? { ...relatedMeeting, label: "Vises også på" }
      : null,
  ].filter((meeting): meeting is RelatedTaskMeeting & { label: string } =>
    Boolean(meeting),
  );

  return (
    <Modal
      description="Opgavens oprindelige relationer bevares, også når den vises på et overført punkt."
      footer={
        canEdit ? (
          <div className="flex justify-end gap-2">
            <Button disabled={saving} onClick={onClose} variant="secondary">
              Luk
            </Button>
            <Button
              disabled={saving}
              form={`related-task-${task.id}`}
              type="submit"
            >
              {saving ? "Gemmer..." : "Gem opgave"}
            </Button>
          </div>
        ) : undefined
      }
      maxWidth="3xl"
      onClose={onClose}
      open={open}
      title={task.title}
    >
      <div className="space-y-5 overflow-x-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={taskStatusTones[draft.status]}>
            {taskStatusLabels[draft.status]}
          </StatusBadge>
          {!canEdit ? <StatusBadge>Kun læseadgang</StatusBadge> : null}
        </div>

        {error ? (
          <p
            className="alert-danger rounded-[var(--radius-control)] px-3 py-2 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {message ? (
          <p
            className="alert-success rounded-[var(--radius-control)] px-3 py-2 text-sm"
            role="status"
          >
            {message}
          </p>
        ) : null}

        <form
          className="space-y-4"
          id={`related-task-${task.id}`}
          onSubmit={save}
        >
          <div>
            <label className="label" htmlFor={`related-task-title-${task.id}`}>
              Titel
            </label>
            <Input
              disabled={!canEdit}
              id={`related-task-title-${task.id}`}
              maxLength={240}
              onChange={(event) => updateDraft("title", event.target.value)}
              required
              value={draft.title}
            />
          </div>
          <div>
            <label
              className="label"
              htmlFor={`related-task-description-${task.id}`}
            >
              Beskrivelse
            </label>
            <Textarea
              className="min-h-28"
              disabled={!canEdit}
              id={`related-task-description-${task.id}`}
              maxLength={20000}
              onChange={(event) =>
                updateDraft("description", event.target.value)
              }
              value={draft.description}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label
                className="label"
                htmlFor={`related-task-status-${task.id}`}
              >
                Status
              </label>
              <Select
                disabled={!canEdit}
                id={`related-task-status-${task.id}`}
                onChange={(event) =>
                  updateDraft("status", event.target.value as TaskStatus)
                }
                value={draft.status}
              >
                {taskStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label
                className="label"
                htmlFor={`related-task-responsible-${task.id}`}
              >
                Ansvarlig
              </label>
              <Select
                disabled={!canEdit}
                id={`related-task-responsible-${task.id}`}
                onChange={(event) =>
                  updateDraft("responsibleUserId", event.target.value)
                }
                value={draft.responsibleUserId}
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
              <label
                className="label"
                htmlFor={`related-task-deadline-${task.id}`}
              >
                Deadline
              </label>
              <Input
                disabled={!canEdit}
                id={`related-task-deadline-${task.id}`}
                onChange={(event) =>
                  updateDraft("deadline", event.target.value)
                }
                type="date"
                value={draft.deadline}
              />
            </div>
          </div>
          {canEdit ? (
            <div>
              <label className="label" htmlFor={`related-task-note-${task.id}`}>
                Intern opgavenote
              </label>
              <Textarea
                className="min-h-20"
                id={`related-task-note-${task.id}`}
                maxLength={10000}
                onChange={(event) =>
                  updateDraft("internalNote", event.target.value)
                }
                value={draft.internalNote}
              />
            </div>
          ) : null}
        </form>

        <section aria-labelledby={`related-task-relations-${task.id}`}>
          <h3
            className="text-sm font-semibold text-ink"
            id={`related-task-relations-${task.id}`}
          >
            Oprindelse og relationer
          </h3>
          <dl className="mt-2 grid gap-2 rounded-[var(--radius-control)] border border-line bg-subtle/30 p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Dagsordenspunkt
              </dt>
              <dd className="mt-1 break-words text-ink">
                {task.agendaItem?.title || "Intet dagsordenspunkt"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Beslutning
              </dt>
              <dd className="mt-1 break-words text-ink">
                {task.decision?.title || "Ingen beslutning"}
              </dd>
            </div>
            {meetings.map((meeting) => (
              <div key={`${meeting.label}-${meeting.id}`}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {meeting.label}
                </dt>
                <dd className="mt-1 break-words text-ink">
                  {meeting.title} · {formatDate(meeting.startsAt)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby={`related-task-history-${task.id}`}>
          <h3
            className="text-sm font-semibold text-ink"
            id={`related-task-history-${task.id}`}
          >
            Historik
          </h3>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <div>
              <dt className="inline font-semibold">Oprettet: </dt>
              <dd className="inline">{formatDate(task.created_at)}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Senest ændret: </dt>
              <dd className="inline">{formatDate(task.updated_at)}</dd>
            </div>
            {task.completed_at ? (
              <div>
                <dt className="inline font-semibold">Afsluttet: </dt>
                <dd className="inline">{formatDate(task.completed_at)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <TaskComments
          canComment={canEdit}
          organizationId={organizationId}
          taskId={task.id}
        />
      </div>
    </Modal>
  );
}
