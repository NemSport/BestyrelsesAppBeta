import type { SupabaseClient } from "@supabase/supabase-js";

import {
  actionTypeValues,
  applyPersonalActionStates,
  deriveActiveActions,
  deriveStakeholderActions,
  sortActions,
  type ActionType,
} from "@/lib/actions";
import { AppError, NotFoundError } from "@/lib/errors";
import { stakeholderFollowUpDays } from "@/lib/stakeholders";
import { personalActionStateSchema } from "@/lib/validation";
import { ActionRepository } from "@/repositories/action-repository";
import { AnnualWheelRepository } from "@/repositories/annual-wheel-repository";
import { MeetingMinutesGovernanceRepository } from "@/repositories/meeting-minutes-governance-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { StakeholderRepository } from "@/repositories/stakeholder-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";
import type {
  ActionCenterData,
  ActionItem,
  ActionPersonalState,
  ApprovalActionSource,
  TaskView,
} from "@/types/domain";

export class ActionService {
  private readonly actions: ActionRepository;
  private readonly annualWheel: AnnualWheelRepository;
  private readonly approvals: MeetingMinutesGovernanceRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly tasks: TaskRepository;
  private readonly stakeholders: StakeholderRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.actions = new ActionRepository(db);
    this.annualWheel = new AnnualWheelRepository(db);
    this.approvals = new MeetingMinutesGovernanceRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.tasks = new TaskRepository(db);
    this.stakeholders = new StakeholderRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async getCenter(organizationId: string, now = new Date()): Promise<ActionCenterData> {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    const through = new Date(now);
    through.setDate(through.getDate() + 7);
    const throughDate = this.localDate(through);

    const [tasks, approvals, annualWheelEvents, states, members, stakeholderSources] =
      await Promise.all([
        this.tasks.listByOrganization(organizationId),
        this.approvals.listApprovalActionSources(organizationId, user.id),
        this.annualWheel.listActionCandidates(organizationId, throughDate),
        this.actions.listPersonalStates(organizationId, user.id),
        this.members.listMembers(organizationId),
        this.stakeholderActionSources(organizationId),
      ]);

    const editableCommitteeIds = (
      await Promise.all(
        members
          .flatMap((member) => member.committees.map((committee) => committee.id))
          .filter((id, index, ids) => ids.indexOf(id) === index)
          .map(async (committeeId) =>
            this.authorization
              .requireAgendaItemEditor(organizationId, committeeId, user.id)
              .then(() => committeeId)
              .catch(() => null),
          ),
      )
    ).filter((id): id is string => Boolean(id));
    const editableCommitteeIdSet = new Set(editableCommitteeIds);
    const safeTasks = tasks.map((task) =>
      editableCommitteeIdSet.has(task.committee_id)
        ? task
        : { ...task, internal_note: null },
    );

    const derived = sortActions([
      ...deriveActiveActions({ organizationId, userId: user.id, tasks: safeTasks, approvals, annualWheelEvents, now }),
      ...deriveStakeholderActions({ organizationId, userId: user.id, sources: stakeholderSources, now }),
    ]);
    const personalized = applyPersonalActionStates(derived, states, now);
    const activeTaskSourceIds = new Set(
      derived
        .filter((action) => action.sourceType === "task")
        .map((action) => action.sourceId),
    );
    const nextTaskRefreshAt = safeTasks
      .filter(
        (task) =>
          task.organization_id === organizationId &&
          task.responsible_user_id === user.id &&
          !task.archived_at &&
          task.status !== "completed" &&
          task.status !== "cancelled" &&
          task.reminder_at &&
          new Date(task.reminder_at).getTime() > now.getTime() &&
          !activeTaskSourceIds.has(task.id),
      )
      .map((task) => task.reminder_at!)
      .sort((left, right) => left.localeCompare(right))[0] ?? null;
    const stakeholderById = new Map(stakeholderSources.stakeholders.map((item) => [item.id, item]));
    const stakeholderRefreshBoundary = (value: string) => {
      const boundary = new Date(value);
      boundary.setDate(boundary.getDate() - stakeholderFollowUpDays);
      return boundary > now ? boundary.toISOString() : value;
    };
    const nextStakeholderRefreshAt = [
      ...stakeholderSources.stakeholders.flatMap((item) =>
        item.internal_owner_user_id === user.id && item.next_follow_up_at && new Date(item.next_follow_up_at) > now ? [stakeholderRefreshBoundary(item.next_follow_up_at)] : []),
      ...stakeholderSources.pipelineEntries.flatMap((entry) => {
        const ownerId = entry.internal_owner_user_id ?? stakeholderById.get(entry.stakeholder_id)?.internal_owner_user_id;
        return ownerId === user.id && !entry.closed_at && entry.next_follow_up_at && new Date(entry.next_follow_up_at) > now ? [stakeholderRefreshBoundary(entry.next_follow_up_at)] : [];
      }),
    ].sort()[0] ?? null;
    const nextRefreshAt = [nextTaskRefreshAt, nextStakeholderRefreshAt].filter((value): value is string => Boolean(value)).sort()[0] ?? null;
    const currentKeys = new Set(derived.map((action) => action.key));
    const completed = [
      ...personalized.filter((action) => action.state === "dismissed"),
      ...states.flatMap((state) => {
        if (currentKeys.has(state.action_key)) return [];
        const item = this.historicalItem(
          state,
          personalized,
          safeTasks,
          approvals,
        );
        return item ? [item] : [];
      }),
    ];

    const inbox = personalized.filter((action) => action.state === "inbox");
    const mine = personalized.filter((action) => action.state === "claimed");

    return {
      userId: user.id,
      inbox: sortActions(inbox),
      mine: sortActions(mine),
      completed: completed.sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
      ),
      activeCount: inbox.length + mine.length,
      delegationMembers: members,
      editableCommitteeIds,
      nextRefreshAt,
    };
  }

  private async stakeholderActionSources(organizationId: string) {
    const [stakeholders, contracts, pipelineEntries] = await Promise.all([
      this.stakeholders.listStakeholders(organizationId),
      this.stakeholders.listContracts(organizationId),
      this.stakeholders.listPipeline(organizationId),
    ]);
    return { stakeholders, contracts, pipelineEntries };
  }

  async updatePersonalState(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = personalActionStateSchema.parse(input);
    await this.authorization.requireOrganizationMember(parsed.organizationId, user.id);
    const center = await this.getCenter(parsed.organizationId);
    const action = [...center.inbox, ...center.mine].find(
      (candidate) =>
        candidate.key === parsed.actionKey &&
        candidate.type === parsed.actionType &&
        candidate.sourceType === parsed.sourceType &&
        candidate.sourceId === parsed.sourceId,
    );
    if (!action) throw new NotFoundError("Handlingen");
    if (
      parsed.operation === "snooze" &&
      parsed.snoozedUntil &&
      new Date(parsed.snoozedUntil).getTime() <= Date.now()
    ) {
      throw new AppError("Udskydelsen skal ligge i fremtiden.", 422);
    }

    return this.actions.upsertPersonalState({
      organization_id: parsed.organizationId,
      user_id: user.id,
      action_key: action.key,
      action_type: action.type,
      source_type: action.sourceType,
      source_id: action.sourceId,
      status:
        parsed.operation === "claim"
          ? "claimed"
          : parsed.operation === "snooze"
            ? "snoozed"
            : "dismissed",
      snoozed_until:
        parsed.operation === "snooze" ? parsed.snoozedUntil ?? null : null,
      dismissal_reason:
        parsed.operation === "dismiss" ? parsed.dismissalReason ?? null : null,
      last_seen_at: new Date().toISOString(),
      resolved_at: null,
    });
  }

  private historicalItem(
    state: ActionPersonalState,
    current: ActionItem[],
    tasks: TaskView[],
    approvals: ApprovalActionSource[],
  ): ActionItem | null {
    const type = actionTypeValues.includes(state.action_type as ActionType)
      ? (state.action_type as ActionType)
      : null;
    if (!type) return null;
    const currentSource = current.find(
      (item) => item.sourceType === state.source_type && item.sourceId === state.source_id,
    );
    if (currentSource) {
      return {
        ...currentSource,
        key: state.action_key,
        type,
        priority: "information",
        description:
          state.status === "dismissed"
            ? "Du markerede handlingen som ikke relevant."
            : "Det udløsende forhold har ændret sig og kræver ikke længere handling.",
        state: state.status === "dismissed" ? "dismissed" : "resolved",
        occurredAt: state.updated_at,
      };
    }
    if (state.source_type === "task") {
      const task = tasks.find((candidate) => candidate.id === state.source_id);
      if (!task) return null;
      const reminderKeyPrefix = `task_reminder:task:${task.id}:`;
      const reminderAt =
        type === "task_reminder" && state.action_key.startsWith(reminderKeyPrefix)
          ? state.action_key.slice(reminderKeyPrefix.length)
          : task.reminder_at;
      return {
        key: state.action_key,
        type,
        category: type === "task_reminder" ? "requires_action" : "deadline",
        priority: "information",
        audience: "personal",
        title: task.title,
        description:
          state.status === "dismissed"
            ? "Du markerede handlingen som ikke relevant."
            : "Den underliggende opgave er afsluttet eller har ændret sig.",
        context: task.committee?.name ?? "Opgave",
        href: `/tasks#task-${task.id}`,
        sourceType: "task",
        sourceId: task.id,
        responsibleUserId: task.responsible_user_id,
        deadline: task.deadline,
        daysUntil: null,
        occurredAt: state.updated_at,
        state: state.status === "dismissed" ? "dismissed" : "resolved",
        snoozedUntil: null,
        dismissalReason: state.dismissal_reason,
        reminderAt: type === "task_reminder" ? reminderAt : null,
        task,
      };
    }
    if (state.source_type === "meeting_minutes") {
      const source = approvals.find((candidate) => candidate.approvalId === state.source_id);
      if (!source) return null;
      return {
        key: state.action_key,
        type,
        category: "requires_action",
        priority: "information",
        audience: "personal",
        title: `Godkend referat: ${source.meetingTitle}`,
        description:
          state.status === "dismissed"
            ? "Du markerede handlingen som ikke relevant."
            : "Godkendelseshandlingen er afsluttet.",
        context: source.committeeName,
        href: `/committees/${source.committeeId}/meetings/${source.meetingId}#minutes-approval`,
        sourceType: "meeting_minutes",
        sourceId: source.approvalId,
        responsibleUserId: source.userId,
        deadline: source.approvalDeadline,
        daysUntil: null,
        occurredAt: state.updated_at,
        state: state.status === "dismissed" ? "dismissed" : "resolved",
        snoozedUntil: null,
        dismissalReason: state.dismissal_reason,
        meetingId: source.meetingId,
        committeeId: source.committeeId,
      };
    }
    return null;
  }

  private localDate(value: Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }
}
