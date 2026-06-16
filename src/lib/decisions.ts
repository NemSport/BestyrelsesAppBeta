import type { Database } from "@/types/database";
import type { StatusTone } from "@/components/ui";
import type { DecisionView } from "@/types/domain";

export type DecisionStatus = Database["public"]["Enums"]["decision_status"];

export const decisionStatusLabels: Record<DecisionStatus, string> = {
  not_started: "Ikke påbegyndt",
  in_progress: "I gang",
  waiting: "Afventer",
  completed: "Gennemført",
  cancelled: "Annulleret",
};

export const decisionStatusTones: Record<DecisionStatus, StatusTone> = {
  not_started: "neutral",
  in_progress: "progress",
  waiting: "warning",
  completed: "success",
  cancelled: "danger",
};

export const decisionStatusOptions = Object.entries(decisionStatusLabels).map(
  ([value, label]) => ({ value: value as DecisionStatus, label }),
);

export type DecisionSort =
  | "decision_date_desc"
  | "decision_date_asc"
  | "deadline_asc"
  | "status";

export type DecisionRegisterFilters = {
  search: string;
  status: string;
  committeeId: string;
  responsibleUserId: string;
  meetingId: string;
  category: string;
  decisionDateFrom: string;
  decisionDateTo: string;
  deadlineFrom: string;
  deadlineTo: string;
  showArchived: boolean;
  sort: DecisionSort;
};

const decisionStatusOrder: Record<DecisionStatus, number> = {
  in_progress: 0,
  waiting: 1,
  not_started: 2,
  completed: 3,
  cancelled: 4,
};

export function normalizeDecisionCategory(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("da-DK") ?? "";
}

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDecisionDeadlineState(
  decision: Pick<DecisionView, "deadline" | "status">,
  today = getLocalIsoDate(),
) {
  if (!decision.deadline) return "none" as const;
  if (decision.status === "completed" || decision.status === "cancelled") {
    return "closed" as const;
  }
  if (decision.deadline < today) return "overdue" as const;
  if (decision.deadline === today) return "today" as const;
  return "upcoming" as const;
}

export function filterAndSortDecisions(
  decisions: DecisionView[],
  filters: DecisionRegisterFilters,
) {
  const needle = filters.search.trim().toLocaleLowerCase("da-DK");
  const category = normalizeDecisionCategory(filters.category);

  return decisions
    .filter((decision) => {
      if (!filters.showArchived && decision.archived_at) return false;
      if (filters.status && decision.status !== filters.status) return false;
      if (
        filters.committeeId &&
        decision.committee_id !== filters.committeeId
      ) {
        return false;
      }
      if (
        filters.responsibleUserId &&
        decision.responsible_user_id !== filters.responsibleUserId
      ) {
        return false;
      }
      if (filters.meetingId && decision.meeting_id !== filters.meetingId) {
        return false;
      }
      if (category && normalizeDecisionCategory(decision.category) !== category) {
        return false;
      }
      if (
        filters.decisionDateFrom &&
        decision.decision_date < filters.decisionDateFrom
      ) {
        return false;
      }
      if (
        filters.decisionDateTo &&
        decision.decision_date > filters.decisionDateTo
      ) {
        return false;
      }
      if (
        filters.deadlineFrom &&
        (!decision.deadline || decision.deadline < filters.deadlineFrom)
      ) {
        return false;
      }
      if (
        filters.deadlineTo &&
        (!decision.deadline || decision.deadline > filters.deadlineTo)
      ) {
        return false;
      }
      if (
        needle &&
        !`${decision.title} ${decision.description}`
          .toLocaleLowerCase("da-DK")
          .includes(needle)
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      if (filters.sort === "decision_date_asc") {
        return (
          left.decision_date.localeCompare(right.decision_date) ||
          left.created_at.localeCompare(right.created_at)
        );
      }
      if (filters.sort === "deadline_asc") {
        if (!left.deadline && !right.deadline) {
          return right.decision_date.localeCompare(left.decision_date);
        }
        if (!left.deadline) return 1;
        if (!right.deadline) return -1;
        return (
          left.deadline.localeCompare(right.deadline) ||
          right.decision_date.localeCompare(left.decision_date)
        );
      }
      if (filters.sort === "status") {
        return (
          decisionStatusOrder[left.status] -
            decisionStatusOrder[right.status] ||
          right.decision_date.localeCompare(left.decision_date)
        );
      }
      return (
        right.decision_date.localeCompare(left.decision_date) ||
        right.created_at.localeCompare(left.created_at)
      );
    });
}

export function getDecisionCategorySuggestions(
  decisions: DecisionView[],
  committeeId: string,
  query: string,
) {
  if (!committeeId) return [];

  const normalizedQuery = query.trim().toLocaleLowerCase("da-DK");
  const categories = new Map<string, string>();

  for (const decision of decisions) {
    const category = decision.category?.trim();
    if (!category || decision.committee_id !== committeeId) continue;

    const normalizedCategory = normalizeDecisionCategory(category);
    if (
      normalizedQuery &&
      !normalizedCategory.includes(normalizedQuery)
    ) {
      continue;
    }
    if (!categories.has(normalizedCategory)) {
      categories.set(normalizedCategory, category);
    }
  }

  return [...categories.values()].sort((left, right) =>
    left.localeCompare(right, "da-DK"),
  );
}

export function getDecisionHistoryForAgendaItem(
  decisions: DecisionView[],
  committeeId: string,
  agendaItemId: string,
  beforeDate?: string,
) {
  const directCategories = new Map<string, string>();
  for (const decision of decisions) {
    if (
      decision.committee_id !== committeeId ||
      decision.agenda_item_id !== agendaItemId
    ) {
      continue;
    }
    const category = decision.category?.trim();
    const normalized = normalizeDecisionCategory(category);
    if (category && normalized && !directCategories.has(normalized)) {
      directCategories.set(normalized, category);
    }
  }

  if (!directCategories.size) {
    return { categories: [], decisions: [] };
  }

  const before = beforeDate?.slice(0, 10);
  return {
    categories: [...directCategories.values()],
    decisions: decisions.filter((decision) => {
      const category = normalizeDecisionCategory(decision.category);
      return (
        decision.committee_id === committeeId &&
        directCategories.has(category) &&
        (!before || decision.decision_date < before)
      );
    }),
  };
}
