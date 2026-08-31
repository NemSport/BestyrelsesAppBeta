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
import { AnnualWheelRepository } from "@/repositories/annual-wheel-repository";
import { DocumentRepository } from "@/repositories/document-repository";
import type { Database } from "@/types/database";
import type {
  CommitteeOverview,
  CommitteeDirectoryEntry,
  CommitteeWorkspace,
  CommitteeWorkspaceActivity,
} from "@/types/domain";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export class CommitteeService {
  private readonly committees: CommitteeRepository;
  private readonly agendaItems: AgendaItemRepository;
  private readonly meetings: MeetingRepository;
  private readonly decisions: DecisionRepository;
  private readonly tasks: TaskRepository;
  private readonly organizationMembers: OrganizationMemberRepository;
  private readonly annualWheel: AnnualWheelRepository;
  private readonly documents: DocumentRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.committees = new CommitteeRepository(db);
    this.agendaItems = new AgendaItemRepository(db);
    this.meetings = new MeetingRepository(db);
    this.decisions = new DecisionRepository(db);
    this.tasks = new TaskRepository(db);
    this.organizationMembers = new OrganizationMemberRepository(db);
    this.annualWheel = new AnnualWheelRepository(db);
    this.documents = new DocumentRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async getWorkspace(
    organizationId: string,
    committeeId: string,
  ): Promise<CommitteeWorkspace> {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const [
      upcomingMeetings,
      recentMeetings,
      activeTasks,
      recentTasks,
      recentDecisions,
      upcomingActivities,
      recentDocuments,
      organizationMembers,
    ] = await Promise.all([
      this.meetings.listWorkspaceMeetings(
        organizationId,
        committeeId,
        now.toISOString(),
      ),
      this.meetings.listRecentWorkspaceMeetings(organizationId, committeeId),
      this.tasks.listWorkspaceOpen(organizationId, committeeId),
      this.tasks.listWorkspaceRecent(organizationId, committeeId),
      this.decisions.listWorkspaceRecent(organizationId, committeeId),
      this.annualWheel.listWorkspaceUpcoming(
        organizationId,
        committeeId,
        today,
      ),
      this.documents.listWorkspaceRecent(organizationId, committeeId),
      this.organizationMembers.listMembers(organizationId),
    ]);

    const [versions, uploaders] = await Promise.all([
      this.documents.listVersions(
        recentDocuments.map((document) => document.id),
      ),
      this.documents.listProfiles(
        recentDocuments.map((document) => document.uploaded_by),
      ),
    ]);
    const uploaderNames = new Map(
      uploaders.map((profile) => [profile.id, profile.full_name]),
    );
    const documentItems = recentDocuments.map((document) => {
      const version = versions.find(
        (candidate) =>
          candidate.document_id === document.id &&
          candidate.version_number === document.current_version_number,
      );
      return {
        id: document.id,
        name: document.name,
        updatedAt: document.updated_at,
        fileName: version?.file_name ?? null,
        mimeType: version?.mime_type ?? null,
        uploaderName:
          uploaderNames.get(document.uploaded_by) || "Ukendt bruger",
      };
    });
    const root = `/organizations/${organizationId}`;
    const activity: CommitteeWorkspaceActivity[] = [
      ...recentMeetings.map((meeting) => ({
        id: `meeting:${meeting.id}`,
        kind: "meeting" as const,
        title: meeting.title,
        detail:
          new Date(meeting.starts_at).getTime() < now.getTime()
            ? "Møde afholdt eller opdateret"
            : "Møde oprettet eller opdateret",
        occurredAt: meeting.updated_at,
        href: `${root}/committees/${committeeId}/meetings/${meeting.id}`,
      })),
      ...recentTasks.map((task) => ({
        id: `task:${task.id}`,
        kind: "task" as const,
        title: task.title,
        detail:
          task.status === "completed"
            ? "Opgave gennemført"
            : "Opgave opdateret",
        occurredAt: task.updated_at,
        href: `${root}/tasks?scope=all&committee=${committeeId}&editTask=${task.id}#task-${task.id}`,
      })),
      ...recentDecisions.map((decision) => ({
        id: `decision:${decision.id}`,
        kind: "decision" as const,
        title: decision.title,
        detail: "Beslutning registreret eller opdateret",
        occurredAt: decision.updated_at,
        href: `${root}/decisions#decision-${decision.id}`,
      })),
      ...documentItems.map((document) => ({
        id: `document:${document.id}`,
        kind: "document" as const,
        title: document.name,
        detail: "Dokument uploadet eller opdateret",
        occurredAt: document.updatedAt,
        href: `${root}/documents/${document.id}`,
      })),
      ...upcomingActivities.map((event) => ({
        id: `activity:${event.id}`,
        kind: "activity" as const,
        title: event.title,
        detail: "Aktivitet oprettet eller opdateret",
        occurredAt: event.updated_at,
        href: `${root}/committees/${committeeId}/annual-wheel?event=${event.id}`,
      })),
    ]
      .sort(
        (left, right) =>
          Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
      )
      .slice(0, 8);

    return {
      committee: context.committee,
      members: organizationMembers.flatMap((member) => {
        const membership = member.committees.find(
          (committee) => committee.id === committeeId,
        );
        return membership
          ? [
              {
                userId: member.user_id,
                name: member.full_name || member.email,
                email: member.email,
                role: membership.role,
              },
            ]
          : [];
      }),
      nextMeeting: upcomingMeetings[0] ?? null,
      activeTasks,
      upcomingActivities,
      recentDocuments: documentItems,
      recentActivity: activity,
    };
  }

  async list(organizationId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    return this.committees.listByOrganization(organizationId);
  }

  async listDirectory(
    organizationId: string,
  ): Promise<CommitteeDirectoryEntry[]> {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);

    const now = new Date();
    const nowIso = now.toISOString();
    const today = nowIso.slice(0, 10);
    const [committees, meetings, tasks, activities, organizationMembers] =
      await Promise.all([
        this.committees.listByOrganization(organizationId),
        this.meetings.listByOrganization(organizationId),
        this.tasks.listByOrganization(organizationId),
        this.annualWheel.listCommitteeDirectoryUpcoming(organizationId, today),
        this.organizationMembers.listMembers(organizationId),
      ]);

    return committees.map((committee) => {
      const upcomingMeetings = meetings
        .filter(
          (meeting) =>
            meeting.committee_id === committee.id &&
            meeting.status !== "cancelled" &&
            meeting.starts_at >= nowIso,
        )
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
      const activeTasks = tasks.filter(
        (task) =>
          task.committee_id === committee.id &&
          !task.archived_at &&
          task.status !== "completed" &&
          task.status !== "cancelled",
      );
      const nextActivity = activities.find(
        (activity) => activity.committee_id === committee.id,
      );

      return {
        committee,
        members: organizationMembers.flatMap((member) => {
          if (member.status !== "active") return [];
          const membership = member.committees.find(
            (candidate) => candidate.id === committee.id,
          );
          return membership
            ? [
                {
                  userId: member.user_id,
                  name: member.full_name || member.email,
                  email: member.email,
                  role: membership.role,
                },
              ]
            : [];
        }),
        activeTaskCount: activeTasks.length,
        overdueTaskCount: activeTasks.filter(
          (task) => task.deadline && task.deadline < today,
        ).length,
        upcomingMeetingCount: upcomingMeetings.length,
        nextMeeting: upcomingMeetings[0] ?? null,
        nextActivity: nextActivity
          ? {
              id: nextActivity.id,
              title: nextActivity.title,
              starts_on: nextActivity.starts_on,
              ends_on: nextActivity.ends_on,
            }
          : null,
      };
    });
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
