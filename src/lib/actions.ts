import type {
  ActionItem,
  ActionPersonalState,
  AnnualWheelEventView,
  ApprovalActionSource,
  TaskView,
} from "@/types/domain";
import type {
  StakeholderActionSource,
  StakeholderContract,
} from "@/types/stakeholders";
import {
  addDays,
  localDate as stakeholderLocalDate,
  stakeholderActionDays,
  stakeholderFollowUpDays,
} from "@/lib/stakeholders";

export const actionTypeValues = [
  "task_overdue",
  "task_due_soon",
  "task_reminder",
  "stakeholder_follow_up",
  "stakeholder_contract_notice",
  "stakeholder_contract_renewal",
  "stakeholder_contract_end",
  "stakeholder_pipeline_follow_up",
  "minutes_approval",
  "annual_wheel_overdue",
  "annual_wheel_due",
] as const;

export type ActionType = (typeof actionTypeValues)[number];
export type ActionPriority = "critical" | "soon" | "follow_up" | "information";

const DAY_MS = 86_400_000;

function localDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function daysFromToday(date: string, now: Date) {
  const today = new Date(`${localDate(now)}T00:00:00`);
  return Math.round(
    (new Date(`${date}T00:00:00`).getTime() - today.getTime()) / DAY_MS,
  );
}

export function actionKey(
  type: ActionType,
  sourceType: ActionItem["sourceType"],
  sourceId: string,
  variant?: string | null,
) {
  return [type, sourceType, sourceId, variant].filter(Boolean).join(":");
}

function taskAction(task: TaskView, now: Date): ActionItem | null {
  const daysUntil = task.deadline ? daysFromToday(task.deadline, now) : null;
  const reminderReached = Boolean(
    task.reminder_at && new Date(task.reminder_at).getTime() <= now.getTime(),
  );
  const type: ActionType | null =
    daysUntil !== null && daysUntil < 0
      ? "task_overdue"
      : daysUntil !== null && daysUntil <= 7
        ? "task_due_soon"
        : reminderReached
          ? "task_reminder"
          : null;
  if (!type) return null;
  const priority: ActionPriority =
    type === "task_overdue"
      ? "critical"
      : type === "task_due_soon"
        ? "soon"
        : "follow_up";
  const description =
    type === "task_overdue"
      ? `Deadline er overskredet med ${Math.abs(daysUntil ?? 0)} ${Math.abs(daysUntil ?? 0) === 1 ? "dag" : "dage"}.`
      : type === "task_due_soon"
        ? daysUntil === 0
          ? "Opgaven har deadline i dag."
          : `Opgaven har deadline om ${daysUntil} ${daysUntil === 1 ? "dag" : "dage"}.`
        : "Du bad om at blive mindet om denne opgave.";

  return {
    key: actionKey(
      type,
      "task",
      task.id,
      type === "task_reminder" ? task.reminder_at : null,
    ),
    type,
    category: type === "task_reminder" ? "requires_action" : "deadline",
    priority,
    audience: "personal",
    title: task.title,
    description,
    context: task.committee?.name ?? "Opgave",
    href: `/tasks#task-${task.id}`,
    sourceType: "task",
    sourceId: task.id,
    responsibleUserId: task.responsible_user_id,
    deadline: task.deadline,
    daysUntil,
    occurredAt: task.updated_at,
    state: "inbox",
    snoozedUntil: null,
    dismissalReason: null,
    reminderAt: type === "task_reminder" ? task.reminder_at : null,
    task,
  };
}

function approvalAction(source: ApprovalActionSource, now: Date): ActionItem {
  return {
    key: actionKey("minutes_approval", "meeting_minutes", source.approvalId),
    type: "minutes_approval",
    category: "requires_action",
    priority: "critical",
    audience: "personal",
    title: `Godkend referat: ${source.meetingTitle}`,
    description:
      source.approvalStatus === "change_requested"
        ? "Dine ønskede ændringer er registreret, og referatet afventer fortsat din stillingtagen."
        : "Referatet afventer din godkendelse.",
    context: source.committeeName,
    href: `/committees/${source.committeeId}/meetings/${source.meetingId}#minutes-approval`,
    sourceType: "meeting_minutes",
    sourceId: source.approvalId,
    responsibleUserId: source.userId,
    deadline: source.approvalDeadline,
    daysUntil: source.approvalDeadline
      ? daysFromToday(source.approvalDeadline, now)
      : null,
    occurredAt: source.updatedAt,
    state: "inbox",
    snoozedUntil: null,
    dismissalReason: null,
    meetingId: source.meetingId,
    committeeId: source.committeeId,
  };
}

function annualWheelAction(event: AnnualWheelEventView, now: Date): ActionItem {
  const endDays = daysFromToday(event.ends_on, now);
  const startDays = daysFromToday(event.starts_on, now);
  const overdue = endDays < 0;
  const approachingStart = !overdue && startDays >= 0 && startDays <= 7;
  const daysUntil = overdue ? endDays : approachingStart ? startDays : endDays;
  const triggerDate =
    overdue || !approachingStart ? event.ends_on : event.starts_on;
  const type: ActionType = overdue
    ? "annual_wheel_overdue"
    : "annual_wheel_due";
  return {
    key: actionKey(type, "annual_wheel_event", event.id),
    type,
    category: "deadline",
    priority: overdue ? "critical" : "soon",
    audience: "personal",
    title: event.title,
    description: overdue
      ? `Årshjulsaktiviteten er overskredet med ${Math.abs(daysUntil)} ${Math.abs(daysUntil) === 1 ? "dag" : "dage"}.`
      : daysUntil === 0
        ? approachingStart
          ? "Årshjulsaktiviteten starter i dag."
          : "Årshjulsaktiviteten slutter i dag."
        : `Årshjulsaktiviteten ${approachingStart ? "starter" : "slutter"} om ${daysUntil} ${daysUntil === 1 ? "dag" : "dage"}.`,
    context: event.committee?.name ?? "Organisationens årshjul",
    href: "/annual-wheel",
    sourceType: "annual_wheel_event",
    sourceId: event.id,
    responsibleUserId: event.responsible_user_id,
    deadline: triggerDate,
    daysUntil,
    occurredAt: event.updated_at,
    state: "inbox",
    snoozedUntil: null,
    dismissalReason: null,
  };
}

const priorityRank: Record<ActionPriority, number> = {
  critical: 0,
  soon: 1,
  follow_up: 2,
  information: 3,
};

export function sortActions(actions: ActionItem[]) {
  return [...actions].sort(
    (left, right) =>
      priorityRank[left.priority] - priorityRank[right.priority] ||
      (left.deadline ?? "9999-12-31").localeCompare(
        right.deadline ?? "9999-12-31",
      ) ||
      left.title.localeCompare(right.title, "da-DK"),
  );
}

export function deriveActiveActions(input: {
  organizationId: string;
  userId: string;
  tasks: TaskView[];
  approvals: ApprovalActionSource[];
  annualWheelEvents: AnnualWheelEventView[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const through = new Date(now);
  through.setDate(through.getDate() + 7);
  const throughDate = localDate(through);
  const today = localDate(now);

  const actions = [
    ...input.tasks
      .filter(
        (task) =>
          task.organization_id === input.organizationId &&
          task.responsible_user_id === input.userId &&
          !task.archived_at &&
          task.status !== "completed" &&
          task.status !== "cancelled",
      )
      .flatMap((task) => {
        const action = taskAction(task, now);
        return action ? [action] : [];
      }),
    ...input.approvals
      .filter(
        (source) =>
          source.organizationId === input.organizationId &&
          source.userId === input.userId &&
          source.minutesStatus === "ready_for_approval" &&
          ["pending", "change_requested"].includes(source.approvalStatus),
      )
      .map((source) => approvalAction(source, now)),
    ...input.annualWheelEvents
      .filter(
        (event) =>
          event.organization_id === input.organizationId &&
          event.responsible_user_id === input.userId &&
          !event.deleted_at &&
          event.status !== "completed" &&
          event.status !== "cancelled" &&
          (event.ends_on < today ||
            (event.starts_on >= today && event.starts_on <= throughDate) ||
            (event.ends_on >= today && event.ends_on <= throughDate)),
      )
      .map((event) => annualWheelAction(event, now)),
  ];
  return sortActions([
    ...new Map(actions.map((action) => [action.key, action])).values(),
  ]);
}

function timestampDays(value: string, now: Date) {
  return daysFromToday(value.slice(0, 10), now);
}

function stakeholderFollowUpAction(input: {
  organizationId: string;
  stakeholderId: string;
  stakeholderName: string;
  ownerId: string;
  sourceType: "stakeholder" | "stakeholder_pipeline";
  sourceId: string;
  followUpAt: string;
  note: string | null;
  updatedAt: string;
  now: Date;
}): ActionItem {
  const overdue = new Date(input.followUpAt).getTime() < input.now.getTime();
  const type: ActionType =
    input.sourceType === "stakeholder"
      ? "stakeholder_follow_up"
      : "stakeholder_pipeline_follow_up";
  return {
    key: actionKey(type, input.sourceType, input.sourceId, input.followUpAt),
    type,
    category: "requires_action",
    priority: overdue ? "critical" : "follow_up",
    audience: "personal",
    title: `Følg op på ${input.stakeholderName}`,
    description: input.note || "Relationen har en planlagt opfølgning.",
    context: "Interessenter & Relationer",
    href: `/organizations/${input.organizationId}/stakeholders/${input.stakeholderId}`,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    responsibleUserId: input.ownerId,
    deadline: input.followUpAt,
    daysUntil: timestampDays(input.followUpAt, input.now),
    occurredAt: input.updatedAt,
    state: "inbox",
    snoozedUntil: null,
    dismissalReason: null,
    followUpAt: input.followUpAt,
    stakeholderId: input.stakeholderId,
  };
}

function contractAction(
  contract: StakeholderContract,
  stakeholderName: string,
  ownerId: string,
  organizationId: string,
  now: Date,
): ActionItem | null {
  const today = stakeholderLocalDate(now);
  const through = stakeholderLocalDate(addDays(now, stakeholderActionDays));
  const candidates: Array<{
    type:
      | "stakeholder_contract_notice"
      | "stakeholder_contract_renewal"
      | "stakeholder_contract_end";
    date: string;
    label: string;
  }> = [
    {
      type: "stakeholder_contract_notice" as const,
      date: contract.notice_deadline,
      label: "Opsigelsesfrist",
    },
    {
      type: "stakeholder_contract_renewal" as const,
      date: contract.renewal_deadline,
      label: "Fornyelsesfrist",
    },
    {
      type: "stakeholder_contract_end" as const,
      date: contract.end_date,
      label: "Kontrakt udløber",
    },
  ].flatMap((candidate) =>
    candidate.date && candidate.date <= through
      ? [{ ...candidate, date: candidate.date }]
      : [],
  );
  candidates.sort((left, right) => {
    const leftOverdue = left.date < today ? 0 : 1;
    const rightOverdue = right.date < today ? 0 : 1;
    const reasonRank = {
      stakeholder_contract_notice: 0,
      stakeholder_contract_renewal: 1,
      stakeholder_contract_end: 2,
    } as const;
    return (
      leftOverdue - rightOverdue ||
      reasonRank[left.type] - reasonRank[right.type] ||
      left.date.localeCompare(right.date)
    );
  });
  const candidate = candidates[0];
  if (!candidate) return null;
  const daysUntil = daysFromToday(candidate.date, now);
  return {
    key: actionKey(
      candidate.type,
      "stakeholder_contract",
      contract.id,
      candidate.date,
    ),
    type: candidate.type,
    category: "deadline",
    priority: daysUntil < 0 ? "critical" : "soon",
    audience: "personal",
    title: `${candidate.label}: ${stakeholderName}`,
    description:
      daysUntil < 0
        ? `Fristen er overskredet med ${Math.abs(daysUntil)} ${Math.abs(daysUntil) === 1 ? "dag" : "dage"}.`
        : daysUntil === 0
          ? "Fristen er i dag."
          : `Fristen er om ${daysUntil} ${daysUntil === 1 ? "dag" : "dage"}.`,
    context: contract.title,
    href: `/organizations/${organizationId}/stakeholders/${contract.stakeholder_id}`,
    sourceType: "stakeholder_contract",
    sourceId: contract.id,
    responsibleUserId: ownerId,
    deadline: candidate.date,
    daysUntil,
    occurredAt: contract.updated_at,
    state: "inbox",
    snoozedUntil: null,
    dismissalReason: null,
    stakeholderId: contract.stakeholder_id,
  };
}

export function deriveStakeholderActions(input: {
  organizationId: string;
  userId: string;
  sources: StakeholderActionSource;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const throughFollowUp = addDays(now, stakeholderFollowUpDays).getTime();
  const stakeholders = new Map(
    input.sources.stakeholders
      .filter(
        (item) =>
          item.organization_id === input.organizationId && !item.archived_at,
      )
      .map((item) => [item.id, item]),
  );
  const pipelineActions = input.sources.pipelineEntries.flatMap((entry) => {
    const stakeholder = stakeholders.get(entry.stakeholder_id);
    const ownerId =
      entry.internal_owner_user_id ?? stakeholder?.internal_owner_user_id;
    if (
      !stakeholder ||
      entry.closed_at ||
      !entry.next_follow_up_at ||
      ownerId !== input.userId ||
      new Date(entry.next_follow_up_at).getTime() > throughFollowUp
    )
      return [];
    return [
      stakeholderFollowUpAction({
        organizationId: input.organizationId,
        stakeholderId: stakeholder.id,
        stakeholderName: stakeholder.name,
        ownerId,
        sourceType: "stakeholder_pipeline",
        sourceId: entry.id,
        followUpAt: entry.next_follow_up_at,
        note: entry.next_follow_up_note,
        updatedAt: entry.updated_at,
        now,
      }),
    ];
  });
  const pipelineStakeholderIds = new Set(
    pipelineActions.map((action) => action.stakeholderId),
  );
  const stakeholderActions = [...stakeholders.values()].flatMap(
    (stakeholder) => {
      if (
        !stakeholder.internal_owner_user_id ||
        stakeholder.internal_owner_user_id !== input.userId ||
        !stakeholder.next_follow_up_at ||
        pipelineStakeholderIds.has(stakeholder.id) ||
        new Date(stakeholder.next_follow_up_at).getTime() > throughFollowUp
      )
        return [];
      return [
        stakeholderFollowUpAction({
          organizationId: input.organizationId,
          stakeholderId: stakeholder.id,
          stakeholderName: stakeholder.name,
          ownerId: stakeholder.internal_owner_user_id,
          sourceType: "stakeholder",
          sourceId: stakeholder.id,
          followUpAt: stakeholder.next_follow_up_at,
          note: stakeholder.next_follow_up_note,
          updatedAt: stakeholder.updated_at,
          now,
        }),
      ];
    },
  );
  const contractActions = input.sources.contracts.flatMap((contract) => {
    const stakeholder = stakeholders.get(contract.stakeholder_id);
    if (
      !stakeholder?.internal_owner_user_id ||
      stakeholder.internal_owner_user_id !== input.userId ||
      contract.organization_id !== input.organizationId ||
      contract.status !== "active" ||
      contract.archived_at
    )
      return [];
    const action = contractAction(
      contract,
      stakeholder.name,
      stakeholder.internal_owner_user_id,
      input.organizationId,
      now,
    );
    return action ? [action] : [];
  });
  return sortActions([
    ...contractActions,
    ...pipelineActions,
    ...stakeholderActions,
  ]);
}

export function applyPersonalActionStates(
  actions: ActionItem[],
  states: ActionPersonalState[],
  now = new Date(),
) {
  const statesByKey = new Map(states.map((state) => [state.action_key, state]));
  return actions.map((action) => {
    const personal = statesByKey.get(action.key);
    if (!personal) return action;
    const snoozed =
      personal.status === "snoozed" &&
      personal.snoozed_until &&
      new Date(personal.snoozed_until).getTime() > now.getTime();
    return {
      ...action,
      state: snoozed
        ? ("snoozed" as const)
        : personal.status === "claimed"
          ? ("claimed" as const)
          : personal.status === "dismissed"
            ? ("dismissed" as const)
            : ("inbox" as const),
      snoozedUntil: personal.snoozed_until,
      dismissalReason: personal.dismissal_reason,
    };
  });
}
