import type { SupabaseClient } from "@supabase/supabase-js";

import { toSlug } from "@/lib/slug";
import {
  organizationInputSchema,
  organizationTrashActionSchema,
  organizationUpdateSchema,
} from "@/lib/validation";
import { AgendaItemRepository } from "@/repositories/agenda-item-repository";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { MeetingMinutesGovernanceRepository } from "@/repositories/meeting-minutes-governance-repository";
import { OrganizationRepository } from "@/repositories/organization-repository";
import { DecisionRepository } from "@/repositories/decision-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { sortTasksByDeadline } from "@/lib/tasks";
import type { Database } from "@/types/database";
import type { OrganizationOverview } from "@/types/domain";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export class OrganizationService {
  private readonly organizations: OrganizationRepository;
  private readonly committees: CommitteeRepository;
  private readonly meetings: MeetingRepository;
  private readonly meetingMinutesGovernance: MeetingMinutesGovernanceRepository;
  private readonly agendaItems: AgendaItemRepository;
  private readonly decisions: DecisionRepository;
  private readonly tasks: TaskRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.organizations = new OrganizationRepository(db);
    this.committees = new CommitteeRepository(db);
    this.meetings = new MeetingRepository(db);
    this.meetingMinutesGovernance = new MeetingMinutesGovernanceRepository(db);
    this.agendaItems = new AgendaItemRepository(db);
    this.decisions = new DecisionRepository(db);
    this.tasks = new TaskRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async listForCurrentUser() {
    const user = await this.auth.requireUser();
    return this.organizations.listForCurrentUser(user.id);
  }

  async create(input: unknown) {
    await this.auth.requireUser();
    const { name } = organizationInputSchema.parse(input);
    const slug = `${toSlug(name)}-${crypto.randomUUID().slice(0, 8)}`;
    return this.organizations.create(name, slug);
  }

  async getOverview(organizationId: string): Promise<OrganizationOverview> {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);

    const [
      committees,
      meetings,
      agendaItems,
      recentMinutes,
      agendaItemMinutes,
      transfers,
      decisions,
      tasks,
      myTasks,
      pendingMinutesApprovals,
    ] = await Promise.all([
      this.committees.listByOrganization(organizationId),
      this.meetings.listByOrganization(organizationId),
      this.agendaItems.listByOrganization(organizationId),
      this.organizations.listRecentMinutes(organizationId),
      this.organizations.listAgendaItemMinutes(organizationId),
      this.organizations.listActiveTransfers(organizationId),
      this.decisions.listByOrganization(organizationId),
      this.tasks.listByOrganization(organizationId),
      this.tasks.listByResponsible(organizationId, user.id),
      this.meetingMinutesGovernance.listPendingApprovalReminders(
        organizationId,
        user.id,
      ),
    ]);

    const now = Date.now();
    const committeesById = new Map(
      committees.map((committee) => [committee.id, committee]),
    );
    const meetingsById = new Map(
      meetings.map((meeting) => [meeting.id, meeting]),
    );
    const agendaItemsById = new Map(
      agendaItems.map((agendaItem) => [agendaItem.id, agendaItem]),
    );
    const upcomingMeetings = meetings
      .filter(
        (meeting) =>
          meeting.status !== "cancelled" &&
          new Date(meeting.starts_at).getTime() >= now,
      )
      .sort(
        (left, right) =>
          new Date(left.starts_at).getTime() -
          new Date(right.starts_at).getTime(),
      );
    const openFollowUpMinutes = agendaItemMinutes.filter((minutes) => {
      const agendaItem = agendaItemsById.get(minutes.agenda_item_id);
      return (
        agendaItem?.item_type === "follow_up" &&
        minutes.status !== "follow_up_completed"
      );
    });
    const decisionsRequiredMinutes = agendaItemMinutes.filter(
      (minutes) => minutes.status === "needs_decision",
    );
    const toActionItem = (
      minutes: (typeof agendaItemMinutes)[number],
      kind: "follow_up" | "decision",
    ): OrganizationOverview["actionItems"][number] | null => {
      const agendaItem = agendaItemsById.get(minutes.agenda_item_id);
      const meeting = meetingsById.get(minutes.meeting_id);
      const committee = committeesById.get(minutes.committee_id);
      if (!agendaItem || !meeting || !committee) return null;
      return {
        id: minutes.id,
        kind,
        agendaItemId: agendaItem.id,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        committeeId: committee.id,
        committeeName: committee.name,
        title: agendaItem.title,
        itemType: agendaItem.item_type,
        status: minutes.status,
      };
    };
    const actionItems = [
      ...openFollowUpMinutes.flatMap((minutes) => {
        const item = toActionItem(minutes, "follow_up");
        return item ? [item] : [];
      }),
      ...decisionsRequiredMinutes.flatMap((minutes) => {
        const item = toActionItem(minutes, "decision");
        return item ? [item] : [];
      }),
      ...transfers.flatMap((transfer) => {
        const agendaItem = agendaItemsById.get(transfer.source_agenda_item_id);
        const meeting = meetingsById.get(transfer.source_meeting_id);
        const committee = committeesById.get(transfer.committee_id);
        return agendaItem && meeting && committee
          ? [
              {
                id: transfer.id,
                kind: "transfer" as const,
                agendaItemId: agendaItem.id,
                meetingId: meeting.id,
                meetingTitle: meeting.title,
                committeeId: committee.id,
                committeeName: committee.name,
                title: agendaItem.title,
                itemType: transfer.target_item_type,
                status: transfer.status,
              },
            ]
          : [];
      }),
    ];
    const activeDecisions = decisions.filter(
      (decision) =>
        !decision.archived_at &&
        decision.status !== "completed" &&
        decision.status !== "cancelled",
    );
    const openTasks = sortTasksByDeadline(
      tasks.filter(
        (task) =>
          !task.archived_at &&
          task.status !== "completed" &&
          task.status !== "cancelled",
      ),
    );
    const myOpenTasks = sortTasksByDeadline(
      myTasks.filter(
        (task) =>
          !task.archived_at &&
          task.status !== "completed" &&
          task.status !== "cancelled",
      ),
    );

    const visibleRecentMinutes = recentMinutes.flatMap((minutes) => {
      const meeting = meetingsById.get(minutes.meeting_id);
      const committee = committeesById.get(minutes.committee_id);
      return meeting && committee
        ? [
            {
              id: minutes.id,
              meetingId: meeting.id,
              meetingTitle: meeting.title,
              meetingStartsAt: meeting.starts_at,
              committeeId: committee.id,
              committeeName: committee.name,
              status: minutes.status,
              updatedAt: minutes.updated_at,
            },
          ]
        : [];
    });

    return {
      committees: committees.map((committee) => {
        const committeeMeetings = upcomingMeetings.filter(
          (meeting) => meeting.committee_id === committee.id,
        );
        return {
          committee,
          nextMeeting: committeeMeetings[0] ?? null,
          upcomingMeetingCount: committeeMeetings.length,
          openFollowUpCount: openFollowUpMinutes.filter(
            (minutes) => minutes.committee_id === committee.id,
          ).length,
          openTaskCount: openTasks.filter(
            (task) => task.committee_id === committee.id,
          ).length,
          activeDecisionCount: activeDecisions.filter(
            (decision) => decision.committee_id === committee.id,
          ).length,
        };
      }),
      upcomingMeetings: upcomingMeetings.slice(0, 8).flatMap((meeting) => {
        const committee = committeesById.get(meeting.committee_id);
        return committee ? [{ ...meeting, committeeName: committee.name }] : [];
      }),
      recentMinutes: visibleRecentMinutes,
      pendingMinutesApprovals,
      actionItems: actionItems.slice(0, 12),
      activeDecisions: activeDecisions.slice(0, 5),
      openTasks: openTasks.slice(0, 5),
      myOpenTasks: myOpenTasks.slice(0, 5),
      metrics: {
        committeeCount: committees.length,
        upcomingMeetingCount: upcomingMeetings.length,
        recentMinutesCount: visibleRecentMinutes.length,
        openFollowUpCount: openFollowUpMinutes.length,
        decisionsRequiredCount: decisionsRequiredMinutes.length,
        activeDecisionCount: activeDecisions.length,
        openTaskCount: openTasks.length,
        myOpenTaskCount: myOpenTasks.length,
      },
    };
  }

  async listMeetings(organizationId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);

    const [committees, meetings] = await Promise.all([
      this.committees.listByOrganization(organizationId),
      this.meetings.listByOrganization(organizationId),
    ]);
    const committeesById = new Map(
      committees.map((committee) => [committee.id, committee]),
    );

    return meetings.flatMap((meeting) => {
      const committee = committeesById.get(meeting.committee_id);
      return committee ? [{ ...meeting, committeeName: committee.name }] : [];
    });
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = organizationUpdateSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    return this.organizations.update(parsed.organizationId, {
      name: parsed.name,
    });
  }

  async moveToTrash(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = organizationTrashActionSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    return this.organizations.softDelete(parsed.organizationId);
  }

  async restore(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = organizationTrashActionSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
      { includeDeleted: true },
    );
    return this.organizations.restore(parsed.organizationId);
  }
}
