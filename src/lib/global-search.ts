import { getAgendaItemHref, getMeetingAgendaPointHref } from "@/lib/meeting-navigation";

export const globalSearchCategories = [
  "all",
  "meetings",
  "agenda_items",
  "minutes",
  "decisions",
  "tasks",
  "documents",
  "stakeholders",
  "annual_wheel",
] as const;

export const globalSearchQueryMaxLength = 120;

export type GlobalSearchCategory = (typeof globalSearchCategories)[number];
export type GlobalSearchResultType = Exclude<GlobalSearchCategory, "all">;

export type GlobalSearchResult = {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  description: string | null;
  context: string;
  date: string | null;
  href: string;
  updatedAt: string;
};

export type GlobalSearchGroup = {
  type: GlobalSearchResultType;
  label: string;
  results: GlobalSearchResult[];
};

export type GlobalSearchResponse = {
  query: string;
  groups: GlobalSearchGroup[];
};

export const globalSearchLabels: Record<GlobalSearchCategory, string> = {
  all: "Alle",
  meetings: "Møder",
  agenda_items: "Punkter",
  minutes: "Referater",
  decisions: "Beslutninger",
  tasks: "Opgaver",
  documents: "Dokumenter",
  stakeholders: "Interessenter",
  annual_wheel: "Årshjul",
};

export function normalizeGlobalSearchQuery(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, globalSearchQueryMaxLength);
}

export function toPostgrestSearchTerm(value: string) {
  return normalizeGlobalSearchQuery(value)
    .replace(/[,:%_*().'"<>;\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalized(value: string | null | undefined) {
  return normalizeGlobalSearchQuery(value ?? "").toLocaleLowerCase("da-DK");
}

function relevanceScore(result: GlobalSearchResult, query: string) {
  const needle = normalized(query);
  const title = normalized(result.title);
  const description = normalized(result.description);
  if (title === needle) return 400;
  if (title.startsWith(needle)) return 300;
  if (title.includes(needle)) return 200;
  if (description.includes(needle)) return 100;
  return 0;
}

export function rankGlobalSearchResults(
  results: GlobalSearchResult[],
  query: string,
  limit = 5,
) {
  return [...results]
    .sort((left, right) => {
      const score = relevanceScore(right, query) - relevanceScore(left, query);
      if (score) return score;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, limit);
}

export function deduplicateGlobalSearchResults(results: GlobalSearchResult[]) {
  return [
    ...new Map(
      results.map((result) => [`${result.type}:${result.id}`, result]),
    ).values(),
  ];
}

export function shouldApplyGlobalSearchResponse(
  responseSequence: number,
  currentSequence: number,
) {
  return responseSequence === currentSequence;
}

export function globalSearchHref(input:
  | {
      type: "meeting";
      organizationId: string;
      committeeId: string;
      meetingId: string;
    }
  | {
      type: "agenda_item";
      organizationId: string;
      committeeId: string;
      agendaItemId: string;
    }
  | {
      type: "meeting_minutes";
      organizationId: string;
      committeeId: string;
      meetingId: string;
    }
  | {
      type: "agenda_item_minutes";
      organizationId: string;
      committeeId: string;
      meetingId: string;
      occurrenceId: string | null;
    }
  | {
      type: "decision";
      organizationId: string;
      decisionId: string;
      committeeId: string;
      agendaItemId: string | null;
      meetingId: string | null;
    }
  | { type: "task"; organizationId: string; taskId: string }
  | { type: "document"; organizationId: string; documentId: string }
  | { type: "stakeholder"; organizationId: string; stakeholderId: string }
  | {
      type: "annual_wheel";
      organizationId: string;
      startsOn: string;
    }) {
  switch (input.type) {
    case "meeting":
      return getMeetingAgendaPointHref({
        organizationId: input.organizationId,
        committeeId: input.committeeId,
        meetingId: input.meetingId,
      });
    case "agenda_item":
      return getAgendaItemHref({
        organizationId: input.organizationId,
        committeeId: input.committeeId,
        agendaItemId: input.agendaItemId,
      });
    case "meeting_minutes":
      return `${getMeetingAgendaPointHref({
        organizationId: input.organizationId,
        committeeId: input.committeeId,
        meetingId: input.meetingId,
      })}#general-minutes-heading`;
    case "agenda_item_minutes":
      return input.occurrenceId
        ? getMeetingAgendaPointHref({
            organizationId: input.organizationId,
            committeeId: input.committeeId,
            meetingId: input.meetingId,
            occurrenceId: input.occurrenceId,
          })
        : `${getMeetingAgendaPointHref({
            organizationId: input.organizationId,
            committeeId: input.committeeId,
            meetingId: input.meetingId,
          })}#agenda-minutes-heading`;
    case "decision":
      if (input.agendaItemId) {
        return getAgendaItemHref({
          organizationId: input.organizationId,
          committeeId: input.committeeId,
          agendaItemId: input.agendaItemId,
        });
      }
      if (input.meetingId) {
        return getMeetingAgendaPointHref({
          organizationId: input.organizationId,
          committeeId: input.committeeId,
          meetingId: input.meetingId,
        });
      }
      return `/organizations/${input.organizationId}/decisions#decision-${input.decisionId}`;
    case "task":
      return `/organizations/${input.organizationId}/tasks?scope=all&editTask=${input.taskId}#task-${input.taskId}`;
    case "document":
      return `/organizations/${input.organizationId}/documents/${input.documentId}`;
    case "stakeholder":
      return `/organizations/${input.organizationId}/stakeholders/${input.stakeholderId}`;
    case "annual_wheel": {
      const date = new Date(`${input.startsOn}T12:00:00`);
      return `/organizations/${input.organizationId}/annual-wheel?year=${date.getFullYear()}&view=month&month=${date.getMonth() + 1}&kind=activity`;
    }
  }
}

export function highlightedSearchParts(value: string, query: string) {
  const needle = normalizeGlobalSearchQuery(query);
  if (!needle) return [{ text: value, match: false }];
  const lowerValue = value.toLocaleLowerCase("da-DK");
  const lowerNeedle = needle.toLocaleLowerCase("da-DK");
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  let index = lowerValue.indexOf(lowerNeedle);
  while (index >= 0) {
    if (index > cursor) parts.push({ text: value.slice(cursor, index), match: false });
    parts.push({ text: value.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
    index = lowerValue.indexOf(lowerNeedle, cursor);
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), match: false });
  return parts.length ? parts : [{ text: value, match: false }];
}
