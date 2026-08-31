import type { TaskFilters, TaskStatus } from "@/lib/tasks";

export type TaskRegisterView = "list" | "task";

export type TaskRegisterState = {
  filters: TaskFilters;
  view: TaskRegisterView;
};

export const emptyTaskFilters = (): TaskFilters => ({
  search: "",
  status: "",
  committeeId: "",
  responsibleUserId: "",
  category: "",
  deadline: "",
  mineOnly: true,
  showArchived: false,
});

const validStatuses = new Set<TaskStatus>([
  "not_started",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
]);
const validDeadlines = new Set<TaskFilters["deadline"]>([
  "",
  "overdue",
  "today",
  "soon",
  "none",
]);

export function parseTaskRegisterState(
  searchParams: Pick<URLSearchParams, "get">,
): TaskRegisterState {
  const rawStatus = searchParams.get("status") ?? "";
  const rawDeadline = searchParams.get("deadline") ?? "";

  return {
    view: searchParams.get("view") === "list" ? "list" : "task",
    filters: {
      search: searchParams.get("q") ?? "",
      status: validStatuses.has(rawStatus as TaskStatus) ? rawStatus : "",
      committeeId: searchParams.get("committee") ?? "",
      responsibleUserId: searchParams.get("responsible") ?? "",
      category: searchParams.get("category") ?? "",
      deadline: validDeadlines.has(rawDeadline as TaskFilters["deadline"])
        ? (rawDeadline as TaskFilters["deadline"])
        : "",
      mineOnly:
        searchParams.get("mine") === "1" || searchParams.get("scope") !== "all",
      showArchived: searchParams.get("archived") === "1",
    },
  };
}

export function taskRegisterSearchParams(
  current: URLSearchParams,
  state: TaskRegisterState,
) {
  const next = new URLSearchParams(current);
  for (const key of [
    "view",
    "q",
    "status",
    "committee",
    "responsible",
    "category",
    "deadline",
    "mine",
    "scope",
    "archived",
  ]) {
    next.delete(key);
  }

  if (state.view === "list") next.set("view", "list");
  if (state.filters.search.trim()) next.set("q", state.filters.search.trim());
  if (state.filters.status) next.set("status", state.filters.status);
  if (state.filters.committeeId) {
    next.set("committee", state.filters.committeeId);
  }
  if (state.filters.responsibleUserId) {
    next.set("responsible", state.filters.responsibleUserId);
  }
  if (state.filters.category) next.set("category", state.filters.category);
  if (state.filters.deadline) next.set("deadline", state.filters.deadline);
  if (!state.filters.mineOnly) next.set("scope", "all");
  if (state.filters.showArchived) next.set("archived", "1");

  return next;
}
