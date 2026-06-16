import type { StatusTone } from "@/components/ui";
import type { Database } from "@/types/database";
import type { TaskView } from "@/types/domain";

export type TaskStatus = Database["public"]["Enums"]["task_status"];

export const taskStatusLabels: Record<TaskStatus, string> = {
  not_started: "Ikke påbegyndt",
  in_progress: "I gang",
  waiting: "Afventer",
  completed: "Gennemført",
  cancelled: "Annulleret",
};

export const taskStatusTones: Record<TaskStatus, StatusTone> = {
  not_started: "neutral",
  in_progress: "progress",
  waiting: "warning",
  completed: "success",
  cancelled: "danger",
};

export const taskStatusOptions = Object.entries(taskStatusLabels).map(
  ([value, label]) => ({ value: value as TaskStatus, label }),
);

export const taskBoardStatuses: TaskStatus[] = [
  "not_started",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
];

export type TaskFilters = {
  search: string;
  status: string;
  committeeId: string;
  responsibleUserId: string;
  category: string;
  showArchived: boolean;
};

export function normalizeTaskCategory(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("da-DK") ?? "";
}

export function getTaskCategorySuggestions(
  tasks: TaskView[],
  committeeId: string,
  query: string,
) {
  const needle = normalizeTaskCategory(query);
  const categories = new Map<string, string>();
  for (const task of tasks) {
    if (task.committee_id !== committeeId) continue;
    const value = task.category?.trim();
    const normalized = normalizeTaskCategory(value);
    if (
      value &&
      normalized &&
      (!needle || normalized.includes(needle)) &&
      !categories.has(normalized)
    ) {
      categories.set(normalized, value);
    }
  }
  return [...categories.values()]
    .sort((left, right) => left.localeCompare(right, "da-DK"))
    .slice(0, 8);
}

export function filterTasks(tasks: TaskView[], filters: TaskFilters) {
  const needle = filters.search.trim().toLocaleLowerCase("da-DK");
  const category = normalizeTaskCategory(filters.category);

  return tasks.filter((task) => {
    if (!filters.showArchived && task.archived_at) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.committeeId && task.committee_id !== filters.committeeId) {
      return false;
    }
    if (
      filters.responsibleUserId &&
      task.responsible_user_id !== filters.responsibleUserId
    ) {
      return false;
    }
    if (category && normalizeTaskCategory(task.category) !== category) {
      return false;
    }
    return (
      !needle ||
      `${task.title} ${task.description}`
        .toLocaleLowerCase("da-DK")
        .includes(needle)
    );
  });
}

export function sortTasksByDeadline(tasks: TaskView[]) {
  return [...tasks].sort((left, right) => {
      if (left.deadline && right.deadline) {
        const deadlineOrder = left.deadline.localeCompare(right.deadline);
        if (deadlineOrder !== 0) return deadlineOrder;
      } else if (left.deadline) {
        return -1;
      } else if (right.deadline) {
        return 1;
      }
      return right.created_at.localeCompare(left.created_at);
    });
}

export function getMyOpenTasks(tasks: TaskView[], userId: string) {
  return sortTasksByDeadline(
    tasks.filter(
      (task) =>
        task.responsible_user_id === userId &&
        !task.archived_at &&
        task.status !== "completed" &&
        task.status !== "cancelled",
    ),
  );
}

export function getTaskDeadlineState(
  task: Pick<TaskView, "deadline" | "status">,
  today = new Date(),
) {
  if (!task.deadline) return "none" as const;
  if (task.status === "completed" || task.status === "cancelled") {
    return "closed" as const;
  }
  const localDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  if (task.deadline < localDate) return "overdue" as const;
  if (task.deadline === localDate) return "today" as const;
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);
  const soonDate = [
    soon.getFullYear(),
    String(soon.getMonth() + 1).padStart(2, "0"),
    String(soon.getDate()).padStart(2, "0"),
  ].join("-");
  if (task.deadline <= soonDate) return "soon" as const;
  return "upcoming" as const;
}
