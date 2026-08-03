import type {
  DecisionRegisterFilters,
  DecisionSort,
  DecisionStatus,
} from "@/lib/decisions";

const validStatuses = new Set<DecisionStatus>([
  "not_started",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
]);
const validSorts = new Set<DecisionSort>([
  "decision_date_desc",
  "decision_date_asc",
  "deadline_asc",
  "status",
]);

export const emptyDecisionFilters = (): DecisionRegisterFilters => ({
  search: "",
  status: "",
  committeeId: "",
  responsibleUserId: "",
  meetingId: "",
  category: "",
  decisionDateFrom: "",
  decisionDateTo: "",
  deadlineFrom: "",
  deadlineTo: "",
  showArchived: false,
  sort: "decision_date_desc",
});

export function parseDecisionRegisterState(
  searchParams: Pick<URLSearchParams, "get">,
): DecisionRegisterFilters {
  const rawStatus = searchParams.get("status") ?? "";
  const rawSort = searchParams.get("sort") ?? "";

  return {
    search: searchParams.get("q") ?? "",
    status: validStatuses.has(rawStatus as DecisionStatus) ? rawStatus : "",
    committeeId: searchParams.get("committee") ?? "",
    responsibleUserId: searchParams.get("responsible") ?? "",
    meetingId: searchParams.get("meeting") ?? "",
    category: searchParams.get("category") ?? "",
    decisionDateFrom: searchParams.get("decisionFrom") ?? "",
    decisionDateTo: searchParams.get("decisionTo") ?? "",
    deadlineFrom: searchParams.get("deadlineFrom") ?? "",
    deadlineTo: searchParams.get("deadlineTo") ?? "",
    showArchived: searchParams.get("archived") === "1",
    sort: validSorts.has(rawSort as DecisionSort)
      ? (rawSort as DecisionSort)
      : "decision_date_desc",
  };
}

export function decisionRegisterSearchParams(
  current: URLSearchParams,
  filters: DecisionRegisterFilters,
) {
  const next = new URLSearchParams(current);
  for (const key of [
    "q",
    "status",
    "committee",
    "responsible",
    "meeting",
    "category",
    "decisionFrom",
    "decisionTo",
    "deadlineFrom",
    "deadlineTo",
    "archived",
    "sort",
  ]) {
    next.delete(key);
  }

  if (filters.search.trim()) next.set("q", filters.search.trim());
  if (filters.status) next.set("status", filters.status);
  if (filters.committeeId) next.set("committee", filters.committeeId);
  if (filters.responsibleUserId) {
    next.set("responsible", filters.responsibleUserId);
  }
  if (filters.meetingId) next.set("meeting", filters.meetingId);
  if (filters.category) next.set("category", filters.category);
  if (filters.decisionDateFrom) {
    next.set("decisionFrom", filters.decisionDateFrom);
  }
  if (filters.decisionDateTo) next.set("decisionTo", filters.decisionDateTo);
  if (filters.deadlineFrom) next.set("deadlineFrom", filters.deadlineFrom);
  if (filters.deadlineTo) next.set("deadlineTo", filters.deadlineTo);
  if (filters.showArchived) next.set("archived", "1");
  if (filters.sort !== "decision_date_desc") next.set("sort", filters.sort);

  return next;
}
