import type { SupabaseClient } from "@supabase/supabase-js";

import { NotFoundError } from "@/lib/errors";
import {
  taskActionSchema,
  taskInputSchema,
  taskUpdateSchema,
} from "@/lib/validation";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { AgendaItemRepository } from "@/repositories/agenda-item-repository";
import { DecisionRepository } from "@/repositories/decision-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class TaskService {
  private readonly tasks: TaskRepository;
  private readonly committees: CommitteeRepository;
  private readonly meetings: MeetingRepository;
  private readonly agendaItems: AgendaItemRepository;
  private readonly decisions: DecisionRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.tasks = new TaskRepository(db);
    this.committees = new CommitteeRepository(db);
    this.meetings = new MeetingRepository(db);
    this.agendaItems = new AgendaItemRepository(db);
    this.decisions = new DecisionRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async getRegister(organizationId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    const [tasks, committees, meetings, agendaItems, decisions, members] =
      await Promise.all([
      this.tasks.listByOrganization(organizationId),
      this.committees.listByOrganization(organizationId),
      this.meetings.listByOrganization(organizationId),
      this.agendaItems.listByOrganization(organizationId),
      this.decisions.listByOrganization(organizationId),
      this.members.listMembers(organizationId),
      ]);
    const editableCommitteeIds = (
      await Promise.all(
        committees.map(async (committee) => {
          try {
            await this.authorization.requireAgendaItemEditor(
              organizationId,
              committee.id,
              user.id,
            );
            return committee.id;
          } catch {
            return null;
          }
        }),
      )
    ).filter((id): id is string => Boolean(id));
    const editableCommitteeIdSet = new Set(editableCommitteeIds);

    return {
      tasks: tasks.map((task) =>
        editableCommitteeIdSet.has(task.committee_id)
          ? task
          : { ...task, internal_note: null },
      ),
      committees,
      meetings,
      agendaItems,
      decisions,
      members,
      editableCommitteeIds,
    };
  }

  async getMyTasks(organizationId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    const [tasks, committees] = await Promise.all([
      this.tasks.listByResponsible(organizationId, user.id),
      this.committees.listByOrganization(organizationId),
    ]);
    const editableCommitteeIds = (
      await Promise.all(
        committees.map(async (committee) => {
          try {
            await this.authorization.requireAgendaItemEditor(
              organizationId,
              committee.id,
              user.id,
            );
            return committee.id;
          } catch {
            return null;
          }
        }),
      )
    ).filter((id): id is string => Boolean(id));
    const editableCommitteeIdSet = new Set(editableCommitteeIds);
    return {
      userId: user.id,
      tasks: tasks.map((task) =>
        editableCommitteeIdSet.has(task.committee_id)
          ? task
          : { ...task, internal_note: null },
      ),
      editableCommitteeIds,
    };
  }

  async getMeetingContext(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const meeting = await this.meetings.findWithAgenda(meetingId);
    if (
      !meeting ||
      meeting.organization_id !== organizationId ||
      meeting.committee_id !== committeeId
    ) {
      throw new NotFoundError("Mødet");
    }
    const [tasks, categorySource, members] = await Promise.all([
      this.tasks.listByMeeting(meetingId),
      this.tasks.listByOrganization(organizationId),
      this.members.listMembers(organizationId),
    ]);
    return this.contextResult(
      organizationId,
      committeeId,
      user.id,
      tasks,
      categorySource,
      members,
    );
  }

  async getAgendaItemContext(
    organizationId: string,
    committeeId: string,
    agendaItemId: string,
  ) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const item = await this.agendaItems.findWithHistory(agendaItemId);
    if (
      !item ||
      item.organization_id !== organizationId ||
      item.committee_id !== committeeId
    ) {
      throw new NotFoundError("Dagsordenspunktet");
    }
    const [tasks, categorySource, members] = await Promise.all([
      this.tasks.listByAgendaItem(agendaItemId),
      this.tasks.listByOrganization(organizationId),
      this.members.listMembers(organizationId),
    ]);
    return this.contextResult(
      organizationId,
      committeeId,
      user.id,
      tasks,
      categorySource,
      members,
    );
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = taskInputSchema.parse(input);
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    await this.requireResponsibleMember(
      parsed.committeeId,
      parsed.responsibleUserId,
    );
    await this.requireValidReferences(parsed);
    return this.tasks.create({
      organization_id: parsed.organizationId,
      committee_id: parsed.committeeId,
      meeting_id: parsed.meetingId ?? null,
      agenda_item_id: parsed.agendaItemId ?? null,
      decision_id: parsed.decisionId ?? null,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      responsible_user_id: parsed.responsibleUserId ?? null,
      deadline: parsed.deadline ?? null,
      reminder_at: parsed.reminderAt ?? null,
      category: parsed.category ?? null,
      internal_note: parsed.internalNote ?? null,
      created_by: user.id,
      updated_by: user.id,
      completed_at:
        parsed.status === "completed" ? new Date().toISOString() : null,
    });
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = taskUpdateSchema.parse(input);
    const task = await this.requireTask(parsed.organizationId, parsed.taskId);
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    if (task.committee_id !== parsed.committeeId) {
      await this.authorization.requireAgendaItemEditor(
        parsed.organizationId,
        task.committee_id,
        user.id,
      );
    }
    await this.requireResponsibleMember(
      parsed.committeeId,
      parsed.responsibleUserId,
    );
    await this.requireValidReferences(parsed);
    return this.tasks.update(parsed.taskId, {
      committee_id: parsed.committeeId,
      meeting_id: parsed.meetingId ?? null,
      agenda_item_id: parsed.agendaItemId ?? null,
      decision_id: parsed.decisionId ?? null,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      responsible_user_id: parsed.responsibleUserId ?? null,
      deadline: parsed.deadline ?? null,
      reminder_at: parsed.reminderAt ?? null,
      reminder_sent_at:
        (parsed.reminderAt ?? null) === task.reminder_at
          ? task.reminder_sent_at
          : null,
      category: parsed.category ?? null,
      internal_note: parsed.internalNote ?? null,
      updated_by: user.id,
      completed_at:
        parsed.status === "completed" ? task.completed_at ?? new Date().toISOString() : null,
    });
  }

  async performAction(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = taskActionSchema.parse(input);
    const task = await this.requireTask(parsed.organizationId, parsed.taskId);
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      task.committee_id,
      user.id,
    );
    if (parsed.action === "archive") {
      return this.tasks.update(parsed.taskId, {
        archived_at: new Date().toISOString(),
        updated_by: user.id,
      });
    }
    return this.tasks.update(parsed.taskId, {
      status: "completed",
      completed_at: task.completed_at ?? new Date().toISOString(),
      updated_by: user.id,
    });
  }

  async getFollowUpCandidates(
    organizationId: string,
    now = new Date(),
    dueSoonDays = 7,
  ) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    const today = this.localDate(now);
    const throughDate = new Date(now);
    throughDate.setDate(throughDate.getDate() + dueSoonDays);

    const [dueSoon, overdue, remindersDue] = await Promise.all([
      this.tasks.listOpenDueSoon(
        organizationId,
        today,
        this.localDate(throughDate),
      ),
      this.tasks.listOpenOverdue(organizationId, today),
      this.tasks.listRemindersDue(organizationId, now.toISOString()),
    ]);

    return { dueSoon, overdue, remindersDue };
  }

  private async requireTask(organizationId: string, taskId: string) {
    const task = await this.tasks.findById(taskId);
    if (!task || task.organization_id !== organizationId) {
      throw new NotFoundError("Opgaven");
    }
    return task;
  }

  private localDate(value: Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  private async requireResponsibleMember(
    committeeId: string,
    responsibleUserId?: string | null,
  ) {
    if (!responsibleUserId) return;
    const membership = await this.committees.getMembership(
      committeeId,
      responsibleUserId,
    );
    if (!membership) throw new NotFoundError("Den ansvarlige");
  }

  private async requireValidReferences(input: {
    organizationId: string;
    committeeId: string;
    meetingId?: string | null;
    agendaItemId?: string | null;
    decisionId?: string | null;
  }) {
    const [meeting, agendaItem, decision] = await Promise.all([
      input.meetingId
        ? this.meetings.findWithAgenda(input.meetingId)
        : Promise.resolve(null),
      input.agendaItemId
        ? this.agendaItems.findWithHistory(input.agendaItemId)
        : Promise.resolve(null),
      input.decisionId
        ? this.decisions.findById(input.decisionId)
        : Promise.resolve(null),
    ]);
    if (
      input.meetingId &&
      (!meeting ||
        meeting.organization_id !== input.organizationId ||
        meeting.committee_id !== input.committeeId)
    ) {
      throw new NotFoundError("Det valgte møde");
    }
    if (
      input.agendaItemId &&
      (!agendaItem ||
        agendaItem.organization_id !== input.organizationId ||
        agendaItem.committee_id !== input.committeeId)
    ) {
      throw new NotFoundError("Det valgte dagsordenspunkt");
    }
    if (
      input.decisionId &&
      (!decision ||
        decision.organization_id !== input.organizationId ||
        decision.committee_id !== input.committeeId)
    ) {
      throw new NotFoundError("Den valgte beslutning");
    }
  }

  private async contextResult(
    organizationId: string,
    committeeId: string,
    userId: string,
    tasks: Awaited<ReturnType<TaskRepository["listByOrganization"]>>,
    categorySource: Awaited<ReturnType<TaskRepository["listByOrganization"]>>,
    members: Awaited<ReturnType<OrganizationMemberRepository["listMembers"]>>,
  ) {
    const canEdit = await this.authorization
      .requireAgendaItemEditor(organizationId, committeeId, userId)
      .then(() => true)
      .catch(() => false);
    return {
      tasks: tasks.map((task) =>
        canEdit ? task : { ...task, internal_note: null },
      ),
      categorySource: categorySource
        .filter((task) => task.committee_id === committeeId)
        .map((task) => ({ ...task, internal_note: null })),
      responsiblePeople: members
        .filter(
          (member) =>
            member.status === "active" &&
            member.committees.some((committee) => committee.id === committeeId),
        )
        .map((member) => ({
          id: member.user_id,
          name: member.full_name || member.email,
        })),
      canEdit,
    };
  }
}
