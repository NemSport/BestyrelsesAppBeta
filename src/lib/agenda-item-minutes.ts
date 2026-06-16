import { richTextToPlainText } from "@/lib/rich-text";
import type { Database } from "@/types/database";

export type AgendaItemType =
  Database["public"]["Enums"]["agenda_item_type"];
export type AgendaItemMinutesStatus =
  Database["public"]["Enums"]["agenda_item_minutes_status"];

export type AgendaItemTransferRule = {
  sourceType: AgendaItemType;
  status: AgendaItemMinutesStatus;
  targetType: AgendaItemType;
  reason: Database["public"]["Enums"]["agenda_item_transfer_reason"];
};

export const agendaItemMinutesStatuses = [
  "not_started",
  "in_progress",
  "needs_decision",
  "needs_responsible",
  "completed",
  "information_oriented",
  "information_requires_follow_up",
  "information_revisit",
  "discussion_completed",
  "discussion_continue",
  "decision_approved",
  "decision_rejected",
  "decision_deferred",
  "decision_requires_follow_up",
  "follow_up_completed",
  "deadline_changed",
  "follow_up_continued",
] as const satisfies readonly AgendaItemMinutesStatus[];

export const agendaItemMinutesStatusOptions: Record<
  AgendaItemType,
  AgendaItemMinutesStatus[]
> = {
  information: [
    "not_started",
    "information_oriented",
    "information_requires_follow_up",
    "information_revisit",
    "completed",
  ],
  discussion: [
    "not_started",
    "in_progress",
    "discussion_completed",
    "discussion_continue",
    "needs_decision",
  ],
  decision: [
    "not_started",
    "needs_decision",
    "decision_approved",
    "decision_rejected",
    "decision_deferred",
    "decision_requires_follow_up",
  ],
  follow_up: [
    "not_started",
    "in_progress",
    "follow_up_completed",
    "deadline_changed",
    "follow_up_continued",
  ],
};

/**
 * Stable preparation contract for Codex 5.
 *
 * These rules only describe when a completed meeting may suggest carrying an
 * agenda item into the next meeting. They do not create, schedule, or mutate
 * agenda items. Codex 5 must still require an explicit user confirmation
 * before applying a suggestion.
 *
 * D + Fortsættes næste møde -> D
 * D + Kræver beslutning -> B
 * B + Kræver opfølgning -> F
 */
export const agendaItemTransferRules = [
  {
    sourceType: "discussion",
    status: "discussion_continue",
    targetType: "discussion",
    reason: "discussion_continue",
  },
  {
    sourceType: "discussion",
    status: "needs_decision",
    targetType: "decision",
    reason: "discussion_requires_decision",
  },
  {
    sourceType: "decision",
    status: "decision_requires_follow_up",
    targetType: "follow_up",
    reason: "decision_requires_follow_up",
  },
] as const satisfies readonly AgendaItemTransferRule[];

export function getAgendaItemTransferTarget(
  sourceType: AgendaItemType,
  status: AgendaItemMinutesStatus,
): AgendaItemType | null {
  return getAgendaItemTransferRule(sourceType, status)?.targetType ?? null;
}

export function getAgendaItemTransferRule(
  sourceType: AgendaItemType,
  status: AgendaItemMinutesStatus,
) {
  return (
    agendaItemTransferRules.find(
      (rule) => rule.sourceType === sourceType && rule.status === status,
    ) ?? null
  );
}

export function shouldSuggestAgendaItemTransfer(
  sourceType: AgendaItemType,
  status: AgendaItemMinutesStatus,
) {
  return getAgendaItemTransferTarget(sourceType, status) !== null;
}

const actionStatuses = new Set<AgendaItemMinutesStatus>([
  "information_requires_follow_up",
  "information_revisit",
  "discussion_continue",
  "decision_deferred",
  "decision_requires_follow_up",
  "deadline_changed",
  "follow_up_continued",
]);

const legacyStatusFallbacks: Record<
  AgendaItemType,
  Partial<Record<AgendaItemMinutesStatus, AgendaItemMinutesStatus>>
> = {
  information: {
    in_progress: "not_started",
    needs_decision: "information_requires_follow_up",
    needs_responsible: "information_requires_follow_up",
  },
  discussion: {
    needs_responsible: "in_progress",
    completed: "discussion_completed",
  },
  decision: {
    in_progress: "needs_decision",
    needs_responsible: "decision_requires_follow_up",
    completed: "decision_approved",
  },
  follow_up: {
    needs_decision: "in_progress",
    needs_responsible: "in_progress",
    completed: "follow_up_completed",
  },
};

export function normalizeAgendaItemMinutesStatus(
  itemType: AgendaItemType,
  status: AgendaItemMinutesStatus | null | undefined,
) {
  if (!status) return "not_started";
  if (agendaItemMinutesStatusOptions[itemType].includes(status)) return status;
  return legacyStatusFallbacks[itemType][status] ?? "not_started";
}

export function agendaItemMinutesNeedsAction(
  itemType: AgendaItemType,
  status: AgendaItemMinutesStatus,
  followUp: string,
) {
  return (
    agendaItemMinutesStatusOptions[itemType].includes(status) &&
    (actionStatuses.has(status) ||
      (itemType === "follow_up" && status === "in_progress") ||
      richTextToPlainText(followUp).length > 0)
  );
}
