"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
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
          const rowContent = (
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="block break-words font-semibold text-brand">
                  {task.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {task.responsible?.full_name || "Ingen ansvarlig"} ·{" "}
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
            <article className={compact ? "py-1" : "py-1.5"} key={task.id}>
              {openInModal ? (
                <button
                  className="flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-2 py-2 text-left transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
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
