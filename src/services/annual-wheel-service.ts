import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAnnualWheelOccurrences,
  buildRRule,
} from "@/lib/annual-wheel";
import { formatDanishDateKey } from "@/lib/date-format";
import { NotFoundError } from "@/lib/errors";
import {
  annualWheelEventDeleteSchema,
  annualWheelEventInputSchema,
  annualWheelEventUpdateSchema,
} from "@/lib/validation";
import { AnnualWheelRepository } from "@/repositories/annual-wheel-repository";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { DecisionRepository } from "@/repositories/decision-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class AnnualWheelService {
  private readonly events: AnnualWheelRepository;
  private readonly committees: CommitteeRepository;
  private readonly meetings: MeetingRepository;
  private readonly tasks: TaskRepository;
  private readonly decisions: DecisionRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.events = new AnnualWheelRepository(db);
    this.committees = new CommitteeRepository(db);
    this.meetings = new MeetingRepository(db);
    this.tasks = new TaskRepository(db);
    this.decisions = new DecisionRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async getOverview(organizationId: string, requestedYear?: number) {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireOrganizationMember(
      organizationId,
      user.id,
    );
    const year =
      requestedYear && requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : new Date().getFullYear();
    const [events, committees, meetings, tasks, decisions, members] =
      await Promise.all([
        this.events.listByOrganization(organizationId, year),
        this.committees.listByOrganization(organizationId),
        this.meetings.listByOrganization(organizationId),
        this.tasks.listByOrganization(organizationId),
        this.decisions.listByOrganization(organizationId),
        this.members.listMembers(organizationId),
      ]);

    const editableCommitteeIds = (
      await Promise.all(
        committees.map(async (committee) =>
          this.authorization
            .requireAgendaItemEditor(organizationId, committee.id, user.id)
            .then(() => committee.id)
            .catch(() => null),
        ),
      )
    ).filter((id): id is string => Boolean(id));
    const canEditOrganization = ["owner", "admin"].includes(
      context.membership.role,
    );
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    return {
      year,
      events,
      committees,
      members,
      editableCommitteeIds,
      canEditOrganization,
      calendarItems: [
        ...meetings
          .map((meeting) => ({
            meeting,
            localDate: formatDanishDateKey(meeting.starts_at),
          }))
          .filter(
            ({ localDate }) => localDate >= yearStart && localDate <= yearEnd,
          )
          .map(({ meeting, localDate }) => ({
            id: `meeting:${meeting.id}`,
            kind: "meeting" as const,
            title: meeting.title,
            date: localDate,
            committeeId: meeting.committee_id,
            responsibleUserId: null,
            priority: "medium" as const,
            href: `/organizations/${organizationId}/committees/${meeting.committee_id}/meetings/${meeting.id}`,
          })),
        ...tasks
          .filter(
            (task) =>
              task.deadline &&
              task.deadline >= yearStart &&
              task.deadline <= yearEnd &&
              !task.archived_at,
          )
          .map((task) => ({
            id: `task:${task.id}`,
            kind: "task" as const,
            title: task.title,
            date: task.deadline!,
            committeeId: task.committee_id,
            responsibleUserId: task.responsible_user_id,
            priority: "high" as const,
            href: `/organizations/${organizationId}/tasks#task-${task.id}`,
          })),
        ...decisions
          .filter(
            (decision) =>
              decision.deadline &&
              decision.deadline >= yearStart &&
              decision.deadline <= yearEnd &&
              !decision.archived_at,
          )
          .map((decision) => ({
            id: `decision:${decision.id}`,
            kind: "decision" as const,
            title: decision.title,
            date: decision.deadline!,
            committeeId: decision.committee_id,
            responsibleUserId: decision.responsible_user_id,
            priority: "high" as const,
            href: `/organizations/${organizationId}/decisions#decision-${decision.id}`,
          })),
      ],
    };
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = annualWheelEventInputSchema.parse(input);
    await this.requireEditor(
      parsed.organizationId,
      parsed.committeeId ?? null,
      user.id,
    );
    const seriesId = crypto.randomUUID();
    const occurrences = buildAnnualWheelOccurrences(parsed);
    const rule = buildRRule(parsed.recurrence, parsed.recurrenceInterval);
    return this.events.createMany(
      occurrences.map((occurrence) => ({
        organization_id: parsed.organizationId,
        committee_id: parsed.committeeId ?? null,
        meeting_id: parsed.meetingId ?? null,
        task_id: parsed.taskId ?? null,
        series_id: seriesId,
        occurrence_index: occurrence.occurrenceIndex,
        title: parsed.title,
        description: parsed.description,
        starts_on: occurrence.startsOn,
        ends_on: occurrence.endsOn,
        responsible_user_id: parsed.responsibleUserId ?? null,
        category: parsed.category ?? null,
        priority: parsed.priority,
        recurrence: parsed.recurrence,
        recurrence_interval: parsed.recurrenceInterval,
        recurrence_rule: rule,
        created_by: user.id,
        updated_by: user.id,
      })),
    );
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = annualWheelEventUpdateSchema.parse(input);
    const current = await this.requireEvent(
      parsed.organizationId,
      parsed.eventId,
    );
    await this.requireEditor(
      parsed.organizationId,
      current.committee_id,
      user.id,
    );
    await this.requireEditor(
      parsed.organizationId,
      parsed.committeeId ?? null,
      user.id,
    );
    return this.events.update(parsed.eventId, {
      committee_id: parsed.committeeId ?? null,
      meeting_id: parsed.meetingId ?? null,
      task_id: parsed.taskId ?? null,
      title: parsed.title,
      description: parsed.description,
      starts_on: parsed.startsOn,
      ends_on: parsed.endsOn,
      responsible_user_id: parsed.responsibleUserId ?? null,
      category: parsed.category ?? null,
      priority: parsed.priority,
      recurrence: parsed.recurrence,
      recurrence_interval: parsed.recurrenceInterval,
      recurrence_rule: buildRRule(
        parsed.recurrence,
        parsed.recurrenceInterval,
      ),
      is_exception: current.recurrence !== "none",
      updated_by: user.id,
    });
  }

  async remove(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = annualWheelEventDeleteSchema.parse(input);
    const current = await this.requireEvent(
      parsed.organizationId,
      parsed.eventId,
    );
    await this.requireEditor(
      parsed.organizationId,
      current.committee_id,
      user.id,
    );
    return this.events.update(parsed.eventId, {
      deleted_at: new Date().toISOString(),
      updated_by: user.id,
    });
  }

  private async requireEditor(
    organizationId: string,
    committeeId: string | null,
    userId: string,
  ) {
    return committeeId
      ? this.authorization.requireAgendaItemEditor(
          organizationId,
          committeeId,
          userId,
        )
      : this.authorization.requireOrganizationAdmin(organizationId, userId);
  }

  private async requireEvent(organizationId: string, eventId: string) {
    const event = await this.events.findById(eventId);
    if (!event || event.organization_id !== organizationId) {
      throw new NotFoundError("Aktiviteten");
    }
    return event;
  }
}
