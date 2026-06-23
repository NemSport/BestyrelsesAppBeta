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
  annualWheelTaskActivationSchema,
  annualWheelEventUpdateSchema,
} from "@/lib/validation";
import { AppError } from "@/lib/errors";
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
            status: task.status,
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
            status: decision.status,
            href: `/organizations/${organizationId}/decisions#decision-${decision.id}`,
          })),
      ],
    };
  }

  async getPdfData(organizationId: string, eventId: string) {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireOrganizationMember(
      organizationId,
      user.id,
    );
    const [event, members] = await Promise.all([
      this.events.findViewById(organizationId, eventId),
      this.members.listMembers(organizationId),
    ]);
    if (!event) {
      throw new NotFoundError("Aktiviteten");
    }

    return {
      organization: context.organization,
      event,
      members,
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
    const created = await this.events.createMany(
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
        status: parsed.status,
        recurrence: parsed.recurrence,
        recurrence_interval: parsed.recurrenceInterval,
        recurrence_rule: rule,
        created_by: user.id,
        updated_by: user.id,
      })),
    );
    await Promise.all(
      created.map((event) =>
        Promise.all([
          this.saveTaskTemplates(
            event.id,
            parsed.organizationId,
            parsed.taskTemplates,
            user.id,
            false,
          ),
          this.saveKeyPeople(
            event.id,
            parsed.organizationId,
            parsed.keyPeople,
            user.id,
            false,
          ),
        ]),
      ),
    );
    return created;
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
    const updated = await this.events.update(parsed.eventId, {
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
      status: parsed.status,
      recurrence: parsed.recurrence,
      recurrence_interval: parsed.recurrenceInterval,
      recurrence_rule: buildRRule(
        parsed.recurrence,
        parsed.recurrenceInterval,
      ),
      is_exception: current.recurrence !== "none",
      updated_by: user.id,
    });
    await this.saveTaskTemplates(
      parsed.eventId,
      parsed.organizationId,
      parsed.taskTemplates,
      user.id,
      true,
    );
    await this.saveKeyPeople(
      parsed.eventId,
      parsed.organizationId,
      parsed.keyPeople,
      user.id,
      true,
    );
    return updated;
  }

  async activateTasks(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = annualWheelTaskActivationSchema.parse(input);
    const event = await this.requireEvent(
      parsed.organizationId,
      parsed.eventId,
    );
    await this.requireEditor(parsed.organizationId, event.committee_id, user.id);
    if (!event.committee_id) {
      throw new AppError(
        "Aktiviteten skal være tilknyttet et udvalg, før faste opgaver kan aktiveres som tasks.",
        422,
        "ANNUAL_WHEEL_COMMITTEE_REQUIRED",
      );
    }

    const templates = await this.events.findTaskTemplates(event.id);
    if (!templates.length) {
      throw new AppError(
        "Tilføj mindst én fast opgave, før du aktiverer årets opgaver.",
        422,
        "ANNUAL_WHEEL_TEMPLATES_REQUIRED",
      );
    }

    const existing = await this.events.findActivatedTasks(
      event.id,
      parsed.year,
    );
    const existingTemplateIds = new Set(
      existing
        .map((task) => task.annual_wheel_task_template_id)
        .filter(Boolean),
    );
    const existingTitles = new Set(
      existing.map((task) => task.title.trim().toLocaleLowerCase("da-DK")),
    );
    const tasksToCreate = templates
      .filter(
        (template) =>
          !existingTemplateIds.has(template.id) &&
          !existingTitles.has(template.title.trim().toLocaleLowerCase("da-DK")),
      )
      .map((template) => ({
        organization_id: parsed.organizationId,
        committee_id: event.committee_id!,
        annual_wheel_event_id: event.id,
        annual_wheel_task_template_id: template.id,
        annual_wheel_activation_year: parsed.year,
        role_profile_id: event.role_profile_id,
        title: template.title,
        description: template.description,
        status: "not_started" as const,
        responsible_user_id:
          template.suggested_responsible_user_id ??
          event.responsible_user_id ??
          null,
        deadline: this.templateDeadline(event, template),
        category: event.category,
        created_by: user.id,
        updated_by: user.id,
      }));

    const created = await this.events.createActivatedTasks(tasksToCreate);
    return {
      created,
      existing,
      skippedCount: existing.length,
    };
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

  private async saveTaskTemplates(
    eventId: string,
    organizationId: string,
    templates: Array<{
      title: string;
      description: string;
      suggestedResponsibleUserId?: string | null;
      deadlineAnchor: "start" | "end";
      deadlineOffsetDays?: number | null;
    }>,
    userId: string,
    replace: boolean,
  ) {
    const input = templates.map((template, index) => ({
      organization_id: organizationId,
      annual_wheel_event_id: eventId,
      title: template.title,
      description: template.description,
      suggested_responsible_user_id:
        template.suggestedResponsibleUserId ?? null,
      deadline_anchor: template.deadlineAnchor,
      deadline_offset_days: template.deadlineOffsetDays ?? null,
      sort_order: index,
      created_by: userId,
      updated_by: userId,
    }));
    return replace
      ? this.events.replaceTaskTemplates(eventId, input, userId)
      : this.events.createTaskTemplates(input);
  }

  private async saveKeyPeople(
    eventId: string,
    organizationId: string,
    keyPeople: Array<{
      userId?: string | null;
      name: string;
      roleTitle: string;
      phone?: string | null;
      email?: string | null;
    }>,
    userId: string,
    replace: boolean,
  ) {
    const input = keyPeople.map((person, index) => ({
      organization_id: organizationId,
      annual_wheel_event_id: eventId,
      user_id: person.userId ?? null,
      name: person.name,
      role_title: person.roleTitle,
      phone: person.phone ?? null,
      email: person.email ?? null,
      sort_order: index,
      created_by: userId,
      updated_by: userId,
    }));
    return replace
      ? this.events.replaceKeyPeople(eventId, input, userId)
      : this.events.createKeyPeople(input);
  }

  private templateDeadline(
    event: Awaited<ReturnType<AnnualWheelRepository["findById"]>>,
    template: Awaited<ReturnType<AnnualWheelRepository["findTaskTemplates"]>>[number],
  ) {
    if (!event || template.deadline_offset_days === null) return null;
    const anchor =
      template.deadline_anchor === "end" ? event.ends_on : event.starts_on;
    const date = new Date(`${anchor}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + template.deadline_offset_days);
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }
}
