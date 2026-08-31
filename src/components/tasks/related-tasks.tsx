"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import { AppIcon } from "@/components/icons/app-icon";
import {
  TaskDetailModal,
  type RelatedTaskMeeting,
} from "@/components/tasks/task-detail-modal";
import { StatusBadge } from "@/components/ui";
import {
  getTaskDeadlineState,
  taskStatusLabels,
  taskStatusTones,
} from "@/lib/tasks";
import type { TaskView } from "@/types/domain";

function formatDate(value: string | null) {
  if (!value) return "Ingen deadline";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function taskStatusIconName(status: TaskView["status"]) {
  if (status === "completed") return "taskCompleted" as const;
  if (status === "cancelled") return "taskCancelled" as const;
  if (status === "in_progress") return "progress" as const;
  return "pending" as const;
}

export type RelatedTaskOrigin = {
  meeting: RelatedTaskMeeting;
};

export function RelatedTasks({
  tasks: initialTasks,
  organizationId,
  compact = false,
  openInModal = false,
  canEdit = false,
  responsiblePeople = [],
  relatedMeeting,
  origins = {},
}: {
  tasks: TaskView[];
  organizationId: string;
  compact?: boolean;
  openInModal?: boolean;
  canEdit?: boolean;
  responsiblePeople?: Array<{ id: string; name: string }>;
  relatedMeeting?: RelatedTaskMeeting;
  origins?: Record<string, RelatedTaskOrigin>;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  useEffect(() => setTasks(initialTasks), [initialTasks]);

  if (!tasks.length) {
    return compact ? (
      <p className="text-xs text-muted">Ingen relaterede opgaver.</p>
    ) : null;
  }

  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;

  return (
    <>
      <div className="divide-y divide-line border-y border-line">
        {tasks.map((task) => {
          const deadlineState = getTaskDeadlineState(task);
          const responsibleName =
            task.responsible?.full_name || "Ingen ansvarlig";
          const rowContent = compact ? (
            <div
              className={clsx(
                "flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap",
                (task.status === "completed" || task.status === "cancelled") &&
                  "text-muted",
              )}
            >
              <AppIcon
                className={clsx(
                  "mt-0.5 shrink-0",
                  task.status === "completed"
                    ? "text-success"
                    : task.status === "in_progress"
                      ? "text-brand"
                      : "text-muted",
                )}
                name={taskStatusIconName(task.status)}
                size={17}
              />
              <div className="min-w-0 flex-[1_1_calc(100%-1.75rem)] sm:flex-1">
                <span
                  className={clsx(
                    "block break-words text-sm font-semibold leading-5",
                    task.status === "completed" || task.status === "cancelled"
                      ? "text-muted"
                      : "text-ink",
                  )}
                >
                  {task.title}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[0.7rem] text-muted">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[0.6rem] font-bold text-brand">
                    {task.responsible ? initials(responsibleName) : "–"}
                  </span>
                  <span className="min-w-0 break-words">{responsibleName}</span>
                </span>
              </div>
              <span className="ml-6 flex min-w-0 flex-wrap items-center gap-1 text-[0.7rem] sm:ml-0 sm:shrink-0 sm:flex-col sm:items-end">
                <span
                  className={clsx(
                    deadlineState === "overdue" && "font-semibold text-danger",
                    (deadlineState === "today" || deadlineState === "soon") &&
                      "font-semibold text-warning",
                    deadlineState === "closed" && "text-success",
                    (deadlineState === "none" ||
                      deadlineState === "upcoming") &&
                      "text-muted",
                  )}
                >
                  {task.deadline ? formatDate(task.deadline) : "Ingen deadline"}
                </span>
                {deadlineState === "overdue" ? (
                  <StatusBadge tone="danger">Overskredet</StatusBadge>
                ) : task.status !== "not_started" &&
                  task.status !== "completed" ? (
                  <StatusBadge tone={taskStatusTones[task.status]}>
                    {taskStatusLabels[task.status]}
                  </StatusBadge>
                ) : null}
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="block break-words font-semibold text-brand">
                  {task.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {responsibleName} ·{" "}
                  {task.deadline
                    ? `Deadline ${formatDate(task.deadline)}`
                    : "Ingen deadline"}
                </span>
                {origins[task.id] ? (
                  <span className="mt-0.5 block text-xs text-muted">
                    Oprettet på {origins[task.id].meeting.title}
                  </span>
                ) : null}
              </div>
              <span className="flex shrink-0 flex-wrap gap-1.5">
                {deadlineState === "overdue" ? (
                  <StatusBadge tone="danger">Overskredet</StatusBadge>
                ) : null}
                <StatusBadge tone={taskStatusTones[task.status]}>
                  {taskStatusLabels[task.status]}
                </StatusBadge>
              </span>
            </div>
          );

          return (
            <article className={compact ? "py-0.5" : "py-1.5"} key={task.id}>
              {openInModal ? (
                <button
                  className="flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-1.5 py-1.5 text-left transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  onClick={() => setActiveTaskId(task.id)}
                  type="button"
                >
                  {rowContent}
                </button>
              ) : (
                <Link
                  className="flex min-h-11 items-center rounded-[var(--radius-control)] px-2 py-2 transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  href={`/organizations/${organizationId}/tasks#task-${task.id}`}
                >
                  {rowContent}
                </Link>
              )}
            </article>
          );
        })}
      </div>

      {activeTask ? (
        <TaskDetailModal
          canEdit={canEdit}
          onClose={() => setActiveTaskId(null)}
          onUpdated={(updatedTask) =>
            setTasks((current) =>
              current.map((task) =>
                task.id === updatedTask.id ? updatedTask : task,
              ),
            )
          }
          open
          organizationId={organizationId}
          originMeeting={origins[activeTask.id]?.meeting}
          relatedMeeting={relatedMeeting}
          responsiblePeople={responsiblePeople}
          task={activeTask}
        />
      ) : null}
    </>
  );
}
