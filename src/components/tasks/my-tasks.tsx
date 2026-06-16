"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  EmptyState,
  Select,
  StatusBadge,
  type StatusTone,
} from "@/components/ui";
import {
  getMyOpenTasks,
  getTaskDeadlineState,
  sortTasksByDeadline,
  taskStatusLabels,
  taskStatusOptions,
  taskStatusTones,
  type TaskStatus,
} from "@/lib/tasks";
import type { MyTasksData, TaskView } from "@/types/domain";

function formatDate(value: string | null) {
  if (!value) return "Ingen deadline";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

export function MyTasks({
  data,
  organizationId,
  userId,
}: {
  data: MyTasksData;
  organizationId: string;
  userId: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(data.tasks);
  const [showClosed, setShowClosed] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openTasks = useMemo(
    () => getMyOpenTasks(tasks, userId),
    [tasks, userId],
  );
  const visibleTasks = useMemo(
    () =>
      showClosed
        ? sortTasksByDeadline(
            tasks.filter(
              (task) =>
                task.responsible_user_id === userId && !task.archived_at,
            ),
          )
        : openTasks,
    [openTasks, showClosed, tasks, userId],
  );
  const overdueCount = openTasks.filter(
    (task) => getTaskDeadlineState(task) === "overdue",
  ).length;
  const todayCount = openTasks.filter(
    (task) => getTaskDeadlineState(task) === "today",
  ).length;
  const soonCount = openTasks.filter(
    (task) => getTaskDeadlineState(task) === "soon",
  ).length;
  const waitingCount = openTasks.filter(
    (task) => task.status === "waiting",
  ).length;

  async function changeStatus(task: TaskView, status: TaskStatus) {
    if (status === task.status) return;
    setSavingId(task.id);
    setError(null);
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
          title: task.title,
          description: task.description,
          status,
          responsibleUserId: task.responsible_user_id,
          deadline: task.deadline,
          reminderAt: task.reminder_at,
          category: task.category,
          internalNote: task.internal_note,
        }),
      });
      const result = (await response.json()) as Partial<TaskView> & {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error || "Opgavens status kunne ikke ændres.");
        return;
      }
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, ...result } : item,
        ),
      );
      router.refresh();
    } catch {
      setError("Opgavens status kunne ikke ændres. Prøv igen.");
    } finally {
      setSavingId(null);
    }
  }

  async function completeTask(task: TaskView) {
    setSavingId(task.id);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "complete" }),
      });
      const result = (await response.json()) as Partial<TaskView> & {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error || "Opgaven kunne ikke markeres som gennemført.");
        return;
      }
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, ...result } : item,
        ),
      );
      router.refresh();
    } catch {
      setError("Opgaven kunne ikke markeres som gennemført. Prøv igen.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ["Åbne opgaver", openTasks.length, "neutral"],
            ["Overskredet", overdueCount, "danger"],
            ["Deadline i dag", todayCount, "warning"],
            ["Deadline snart", soonCount, "progress"],
            ["Afventer", waitingCount, "progress"],
          ] satisfies Array<[string, number, StatusTone]>
        ).map(([label, value, tone]) => (
          <div
            className="flex items-center justify-between rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3"
            key={label}
          >
            <span className="text-sm text-muted">{label}</span>
            <StatusBadge tone={tone}>{value}</StatusBadge>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            checked={showClosed}
            onChange={(event) => setShowClosed(event.target.checked)}
            type="checkbox"
          />
          Vis gennemførte og annullerede
        </label>
        <Link
          className="button-secondary"
          href={`/organizations/${organizationId}/tasks`}
        >
          Åbn Task View
        </Link>
      </div>

      {error ? (
        <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {visibleTasks.length ? (
        <div className="divide-y divide-line border-y border-line">
          {visibleTasks.map((task) => {
            const deadlineState = getTaskDeadlineState(task);
            const canEdit = data.editableCommitteeIds.includes(
              task.committee_id,
            );
            return (
              <article className="py-4" key={task.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{task.title}</h2>
                      <StatusBadge tone={taskStatusTones[task.status]}>
                        {taskStatusLabels[task.status]}
                      </StatusBadge>
                      {deadlineState === "overdue" ? (
                        <StatusBadge tone="danger">Overskredet</StatusBadge>
                      ) : null}
                      {deadlineState === "today" ? (
                        <StatusBadge tone="warning">I dag</StatusBadge>
                      ) : null}
                      {deadlineState === "soon" ? (
                        <StatusBadge tone="progress">Snart</StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {task.committee?.name ?? "Ukendt udvalg"} ·{" "}
                      {formatDate(task.deadline)}
                      {task.category ? ` · ${task.category}` : ""}
                    </p>
                    {task.reminder_at ? (
                      <p className="mt-1 text-xs text-muted">
                        Påmindelse{" "}
                        {new Intl.DateTimeFormat("da-DK", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(task.reminder_at))}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {task.meeting ? (
                        <Link
                          className="font-semibold text-brand hover:underline"
                          href={`/organizations/${organizationId}/committees/${task.committee_id}/meetings/${task.meeting.id}`}
                        >
                          Møde: {task.meeting.title}
                        </Link>
                      ) : null}
                      {task.agendaItem ? (
                        <Link
                          className="font-semibold text-brand hover:underline"
                          href={`/organizations/${organizationId}/committees/${task.committee_id}/agenda-items/${task.agendaItem.id}`}
                        >
                          Punkt: {task.agendaItem.title}
                        </Link>
                      ) : null}
                      {task.decision ? (
                        <Link
                          className="font-semibold text-brand hover:underline"
                          href={`/organizations/${organizationId}/decisions#decision-${task.decision.id}`}
                        >
                          Beslutning: {task.decision.title}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex min-w-48 flex-wrap items-end gap-2">
                    {canEdit ? (
                      <>
                        <div className="min-w-40 flex-1">
                          <label
                            className="mb-1 block text-xs font-semibold text-muted"
                            htmlFor={`my-task-status-${task.id}`}
                          >
                            Status
                          </label>
                          <Select
                            disabled={savingId === task.id}
                            id={`my-task-status-${task.id}`}
                            onChange={(event) =>
                              void changeStatus(
                                task,
                                event.target.value as TaskStatus,
                              )
                            }
                            value={task.status}
                          >
                            {taskStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        {task.status !== "completed" &&
                        task.status !== "cancelled" ? (
                          <Button
                            disabled={savingId === task.id}
                            onClick={() => void completeTask(task)}
                            size="sm"
                          >
                            Gennemført
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    <Link
                      className="button-secondary"
                      href={`/organizations/${organizationId}/tasks?editTask=${task.id}#task-${task.id}`}
                    >
                      Åbn/rediger
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          description={
            showClosed
              ? "Du har ingen opgaver i organisationen."
              : "Du har ingen åbne opgaver. Gennemførte opgaver kan vises ovenfor."
          }
          title="Ingen opgaver at vise"
        />
      )}
    </div>
  );
}
