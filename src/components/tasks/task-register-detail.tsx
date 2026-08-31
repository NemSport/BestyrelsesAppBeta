"use client";

import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icon";
import { TaskComments } from "@/components/tasks/task-comments";
import { Button, Modal, StatusBadge } from "@/components/ui";
import {
  taskStatusLabels,
  taskStatusTones,
  type TaskStatus,
} from "@/lib/tasks";
import type { TaskView } from "@/types/domain";

function formatDate(value: string | null) {
  if (!value) return "Ingen deadline";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(value.length === 10 ? `${value}T00:00:00` : value),
  );
}

export function TaskRegisterDetail({
  actionPending,
  canEdit,
  onClose,
  onEdit,
  onStatusChange,
  organizationId,
  task,
}: {
  actionPending: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (status: TaskStatus) => void;
  organizationId: string;
  task: TaskView | null;
}) {
  if (!task) return null;

  const meetingHref = task.meeting
    ? `/organizations/${organizationId}/committees/${task.committee_id}/meetings/${task.meeting.id}`
    : null;
  const agendaHref = task.agendaItem
    ? `/organizations/${organizationId}/committees/${task.committee_id}/agenda-items/${task.agendaItem.id}`
    : null;
  const canComplete =
    canEdit && task.status !== "completed" && task.status !== "cancelled";
  const hasCanonicalOrigin = meetingHref || agendaHref || task.decision;
  const hasOrigin = Boolean(
    hasCanonicalOrigin || task.stakeholder || task.stakeholderContract,
  );

  return (
    <Modal
      description={task.committee?.name ?? "Slettet udvalg"}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {canEdit ? (
            <Button onClick={onEdit} variant="secondary">
              Rediger opgave
            </Button>
          ) : null}
          {canComplete ? (
            <Button
              disabled={actionPending}
              onClick={() => onStatusChange("completed")}
            >
              <AppIcon name="taskCompleted" size={16} />
              Markér som gennemført
            </Button>
          ) : null}
        </div>
      }
      maxWidth="lg"
      onClose={onClose}
      open
      placement="right"
      title={task.title}
    >
      <div className="space-y-5 overflow-x-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={taskStatusTones[task.status]}>
            {taskStatusLabels[task.status]}
          </StatusBadge>
          {!canEdit ? <StatusBadge>Skrivebeskyttet</StatusBadge> : null}
        </div>

        <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">Ansvarlig</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {task.responsible?.full_name || "Ingen ansvarlig"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Deadline</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {formatDate(task.deadline)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Udvalg</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {task.committee?.name ?? "Slettet udvalg"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Status</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {taskStatusLabels[task.status]}
            </dd>
          </div>
        </dl>

        {task.description ? (
          <section aria-labelledby={`task-description-${task.id}`}>
            <h3
              className="text-sm font-semibold text-ink"
              id={`task-description-${task.id}`}
            >
              Beskrivelse
            </h3>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted">
              {task.description}
            </p>
          </section>
        ) : null}

        {hasOrigin ? (
          <section
            aria-labelledby={`task-origin-${task.id}`}
            className="border-y border-line py-3"
          >
            <h3
              className="text-sm font-semibold text-ink"
              id={`task-origin-${task.id}`}
            >
              Oprindelse
            </h3>
            <div className="mt-2 space-y-1.5 text-sm">
              {meetingHref && task.meeting ? (
                <Link
                  className="flex items-start gap-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  href={meetingHref}
                >
                  <AppIcon
                    className="mt-0.5 shrink-0"
                    name="calendar"
                    size={15}
                  />
                  <span>
                    {task.meeting.title} · {formatDate(task.meeting.starts_at)}
                  </span>
                </Link>
              ) : null}
              {agendaHref && task.agendaItem ? (
                <Link
                  className="flex items-start gap-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  href={agendaHref}
                >
                  <AppIcon
                    className="mt-0.5 shrink-0"
                    name="agenda"
                    size={15}
                  />
                  <span>{task.agendaItem.title}</span>
                </Link>
              ) : null}
              {task.decision ? (
                <Link
                  className="flex items-start gap-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  href={`/organizations/${organizationId}/decisions#decision-${task.decision.id}`}
                >
                  <AppIcon
                    className="mt-0.5 shrink-0"
                    name="decisions"
                    size={15}
                  />
                  <span>{task.decision.title}</span>
                </Link>
              ) : null}
              {task.stakeholder ? (
                <Link
                  className="flex items-start gap-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  href={`/organizations/${organizationId}/stakeholders/${task.stakeholder.id}`}
                >
                  <AppIcon
                    className="mt-0.5 shrink-0"
                    name="stakeholders"
                    size={15}
                  />
                  <span>Interessent · {task.stakeholder.name}</span>
                </Link>
              ) : null}
              {task.stakeholderContract ? (
                <p className="flex items-start gap-2 text-muted">
                  <AppIcon
                    className="mt-0.5 shrink-0"
                    name="documents"
                    size={15}
                  />
                  <span>Kontrakt · {task.stakeholderContract.title}</span>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <TaskComments
          canComment={canEdit}
          organizationId={organizationId}
          taskId={task.id}
        />
      </div>
    </Modal>
  );
}
