import type { SupabaseClient } from "@supabase/supabase-js";

import {
  committeeInputSchema,
  committeeTrashActionSchema,
  committeeUpdateSchema,
} from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";
import { AgendaItemRepository } from "@/repositories/agenda-item-repository";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { DecisionRepository } from "@/repositories/decision-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import type { Database } from "@/types/database";
import type { CommitteeOverview } from "@/types/domain";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export class CommitteeService {
  private readonly committees: CommitteeRepository;
  private readonly agendaItems: AgendaItemRepository;
  private readonly meetings: MeetingRepository;
  private readonly decisions: DecisionRepository;
  private readonly tasks: TaskRepository;
  private readonly organizationMembers: OrganizationMemberRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.committees = new CommitteeRepository(db);
    this.agendaItems = new AgendaItemRepository(db);
    this.meetings = new MeetingRepository(db);
    this.decisions = new DecisionRepository(db);
    this.tasks = new TaskRepository(db);
    this.organizationMembers = new OrganizationMemberRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async list(organizationId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    return this.committees.listByOrganization(organizationId);
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = committeeInputSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    return this.committees.create(
      parsed.organizationId,
      parsed.name,
      parsed.description,
    );
  }

  async getOverview(
    organizationId: string,
    committeeId: string,
  ): Promise<CommitteeOverview> {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );

    const [
      meetings,
      agendaItems,
      recentMinutes,
      agendaItemMinutes,
      transfers,
      organizationMembers,
      responsibleTasks,
      decisions,
    ] = await Promise.all([
      this.meetings.listByCommittee(committeeId),
      this.agendaItems.listByCommittee(committeeId),
      this.committees.listRecentMinutes(committeeId),
      this.committees.listAgendaItemMinutes(committeeId),
      this.committees.listActiveTransfers(committeeId),
      this.organizationMembers.listMembers(organizationId),
      this.tasks.listByResponsible(organizationId, user.id),
      this.decisions.listByCommittee(organizationId, committeeId),
    ]);

    const meetingsById = new Map(
      meetings.map((meeting) => [meeting.id, meeting]),
    );
    const agendaItemsById = new Map(
      agendaItems.map((agendaItem) => [agendaItem.id, agendaItem]),
    );
    const toActionItem = (
      minutes: (typeof agendaItemMinutes)[number],
    ): CommitteeOverview["openFollowUps"][number] | null => {
      const agendaItem = agendaItemsById.get(minutes.agenda_item_id);
      const meeting = meetingsById.get(minutes.meeting_id);
      if (!agendaItem || !meeting) return null;
      return {
        id: minutes.id,
        agendaItemId: agendaItem.id,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        meetingStartsAt: meeting.starts_at,
        title: agendaItem.title,
        itemType: agendaItem.item_type,
        status: minutes.status,
      };
    };

    return {
      meetings,
      recentMinutes: recentMinutes.flatMap((minutes) => {
        const meeting = meetingsById.get(minutes.meeting_id);
        return meeting
          ? [
              {
                id: minutes.id,
                meetingId: meeting.id,
                meetingTitle: meeting.title,
                meetingStartsAt: meeting.starts_at,
                status: minutes.status,
                updatedAt: minutes.updated_at,
              },
            ]
          : [];
      }),
      openFollowUps: agendaItemMinutes.flatMap((minutes) => {
        const item = toActionItem(minutes);
        return item &&
          item.itemType === "follow_up" &&
          item.status !== "follow_up_completed"
          ? [item]
          : [];
      }),
      decisionsRequired: agendaItemMinutes.flatMap((minutes) => {
        const item = toActionItem(minutes);
        return item?.status === "needs_decision" ? [item] : [];
      }),
      transfers: transfers.flatMap((transfer) => {
        const agendaItem = agendaItemsById.get(transfer.source_agenda_item_id);
        const meeting = meetingsById.get(transfer.source_meeting_id);
        return agendaItem && meeting
          ? [
              {
                id: transfer.id,
                agendaItemId: agendaItem.id,
                meetingId: meeting.id,
                meetingTitle: meeting.title,
                title: agendaItem.title,
                itemType: transfer.target_item_type,
                status: transfer.status,
              },
            ]
          : [];
      }),
      members: organizationMembers.flatMap((member) => {
        const committeeMembership = member.committees.find(
          (committee) => committee.id === committeeId,
        );
        return committeeMembership
          ? [
              {
                userId: member.user_id,
                name: member.full_name || member.email,
                email: member.email,
                role: committeeMembership.role,
              },
            ]
          : [];
      }),
      myOpenTasks: responsibleTasks
        .filter(
          (task) =>
            task.committee_id === committeeId &&
            !task.archived_at &&
            task.status !== "completed" &&
            task.status !== "cancelled",
        )
        .slice(0, 5),
      activeDecisions: decisions
        .filter(
          (decision) =>
            !decision.archived_at &&
            decision.status !== "completed" &&
            decision.status !== "cancelled",
        )
        .slice(0, 5),
    };
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = committeeUpdateSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    const committee = await this.committees.findById(parsed.committeeId);
    if (!committee || committee.organization_id !== parsed.organizationId) {
      throw new NotFoundError("Udvalget");
    }
    return this.committees.update(parsed.committeeId, {
      name: parsed.name,
      description: parsed.description,
    });
  }

  async moveToTrash(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = committeeTrashActionSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    const committee = await this.committees.findById(parsed.committeeId);
    if (!committee || committee.organization_id !== parsed.organizationId) {
      throw new NotFoundError("Udvalget");
    }
    return this.committees.softDelete(parsed.committeeId);
  }

  async restore(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = committeeTrashActionSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    const committee = await this.committees.findIncludingDeleted(
      parsed.committeeId,
    );
    if (
      !committee ||
      committee.organization_id !== parsed.organizationId ||
      !committee.deleted_at
    ) {
      throw new NotFoundError("Udvalget i papirkurven");
    }
    return this.committees.restore(parsed.committeeId);
  }
}
