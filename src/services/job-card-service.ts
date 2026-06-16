import type { SupabaseClient } from "@supabase/supabase-js";

import { NotFoundError } from "@/lib/errors";
import {
  jobCardArchiveSchema,
  jobCardInputSchema,
  jobCardUpdateSchema,
  responsibilityAreaInputSchema,
  taskTemplateInstantiateSchema,
} from "@/lib/validation";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { DecisionRepository } from "@/repositories/decision-repository";
import { JobCardRepository } from "@/repositories/job-card-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";
import type { JobCardOverview, RoleProfileView } from "@/types/domain";

export class JobCardService {
  private readonly jobCards: JobCardRepository;
  private readonly committees: CommitteeRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly tasks: TaskRepository;
  private readonly decisions: DecisionRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.jobCards = new JobCardRepository(db);
    this.committees = new CommitteeRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.tasks = new TaskRepository(db);
    this.decisions = new DecisionRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async getOverview(organizationId: string): Promise<JobCardOverview> {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireOrganizationMember(
      organizationId,
      user.id,
    );
    const [roles, areas, relations, committees, members, tasks, decisions, annualWheel] =
      await Promise.all([
        this.jobCards.listRoles(organizationId),
        this.jobCards.listResponsibilityAreas(organizationId),
        this.jobCards.listRelations(organizationId),
        this.committees.listByOrganization(organizationId),
        this.members.listMembers(organizationId),
        this.tasks.listByOrganization(organizationId),
        this.decisions.listByOrganization(organizationId),
        this.db
          .from("annual_wheel_events")
          .select("*, committee:committees(id, name), meeting:meetings(id, title, starts_at), task:tasks(id, title, status), responsible:profiles!annual_wheel_events_responsible_user_id_fkey(id, full_name)")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .not("role_profile_id", "is", null)
          .order("starts_on"),
      ]);
    if (annualWheel.error) throw annualWheel.error;
    const memberMap = new Map(members.map((member) => [member.user_id, member]));
    const committeeMap = new Map(committees.map((committee) => [committee.id, committee]));
    const areaMap = new Map(areas.map((area) => [area.id, area]));

    const roleViews: RoleProfileView[] = roles.map((role) => {
      const roleCommitteeIds = relations.committees
        .filter((relation) => relation.role_profile_id === role.id)
        .map((relation) => relation.committee_id);
      return {
        ...role,
        responsibilityAreas: relations.areas
          .filter((relation) => relation.role_profile_id === role.id)
          .flatMap((relation) => {
            const area = areaMap.get(relation.responsibility_area_id);
            return area ? [area] : [];
          }),
        committees: roleCommitteeIds.flatMap((committeeId) => {
          const committee = committeeMap.get(committeeId);
          return committee ? [committee] : [];
        }),
        assignments: relations.assignments
          .filter((assignment) => assignment.role_profile_id === role.id)
          .flatMap((assignment) => {
            const member = memberMap.get(assignment.user_id);
            return member
              ? [{
                  id: assignment.id,
                  userId: member.user_id,
                  name: member.full_name || member.email,
                  email: member.email,
                  startsOn: assignment.starts_on,
                }]
              : [];
          }),
        taskTemplates: relations.templates.filter(
          (template) => template.role_profile_id === role.id,
        ),
        documents: relations.documents.filter(
          (document) => document.role_profile_id === role.id,
        ),
        onboardingGuide:
          relations.guides.find((guide) => guide.role_profile_id === role.id) ??
          null,
        relatedTasks: tasks.filter(
          (task) =>
            task.role_profile_id === role.id ||
            (task.responsible_user_id &&
              relations.assignments.some(
                (assignment) =>
                  assignment.role_profile_id === role.id &&
                  assignment.user_id === task.responsible_user_id,
              )),
        ),
        annualWheelEvents: ((annualWheel.data ?? []) as unknown as RoleProfileView["annualWheelEvents"]).filter(
          (event) => event.role_profile_id === role.id,
        ),
        decisions: decisions.filter(
          (decision) =>
            roleCommitteeIds.includes(decision.committee_id) &&
            !decision.archived_at,
        ).slice(0, 10),
      };
    });
    return {
      currentUserId: user.id,
      roles: roleViews,
      responsibilityAreas: areas,
      committees,
      members,
      canManage: ["owner", "admin"].includes(context.membership.role),
    };
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = jobCardInputSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    const role = await this.jobCards.createRole({
      organization_id: parsed.organizationId,
      title: parsed.title,
      purpose: parsed.purpose,
      description: parsed.description,
      responsibilities: parsed.responsibilities,
      exclusions: parsed.exclusions,
      competencies: parsed.competencies,
      collaboration: parsed.collaboration,
      meeting_expectations: parsed.meetingExpectations,
      contact_people: parsed.contactPeople,
      created_by: user.id,
      updated_by: user.id,
    });
    await this.jobCards.replaceRelations({
      ...parsed,
      roleProfileId: role.id,
      userId: user.id,
    });
    return role;
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = jobCardUpdateSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    await this.requireRole(parsed.organizationId, parsed.roleProfileId);
    const role = await this.jobCards.updateRole(parsed.roleProfileId, {
      title: parsed.title,
      purpose: parsed.purpose,
      description: parsed.description,
      responsibilities: parsed.responsibilities,
      exclusions: parsed.exclusions,
      competencies: parsed.competencies,
      collaboration: parsed.collaboration,
      meeting_expectations: parsed.meetingExpectations,
      contact_people: parsed.contactPeople,
      updated_by: user.id,
    });
    await this.jobCards.replaceRelations({
      ...parsed,
      userId: user.id,
    });
    return role;
  }

  async archive(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = jobCardArchiveSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    await this.requireRole(parsed.organizationId, parsed.roleProfileId);
    return this.jobCards.updateRole(parsed.roleProfileId, {
      archived_at: new Date().toISOString(),
      updated_by: user.id,
    });
  }

  async createResponsibilityArea(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = responsibilityAreaInputSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    return this.jobCards.createResponsibilityArea({
      organization_id: parsed.organizationId,
      name: parsed.name,
      description: parsed.description,
      created_by: user.id,
    });
  }

  async instantiateTaskTemplate(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = taskTemplateInstantiateSchema.parse(input);
    const template = await this.jobCards.findTemplate(parsed.taskTemplateId);
    if (!template || template.organization_id !== parsed.organizationId) {
      throw new NotFoundError("Opgaveskabelonen");
    }
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      template.committee_id,
      user.id,
    );
    const relations = await this.jobCards.listRelations(parsed.organizationId);
    const assignedUserId =
      relations.assignments.find(
        (assignment) => assignment.role_profile_id === template.role_profile_id,
      )?.user_id ?? null;
    const responsibleUserId =
      assignedUserId &&
      (await this.committees.getMembership(
        template.committee_id,
        assignedUserId,
      ))
        ? assignedUserId
        : null;
    const deadline = template.default_deadline_days === null
      ? null
      : new Date(Date.now() + template.default_deadline_days * 86400000)
          .toISOString()
          .slice(0, 10);
    return this.tasks.create({
      organization_id: parsed.organizationId,
      committee_id: template.committee_id,
      role_profile_id: template.role_profile_id,
      task_template_id: template.id,
      title: template.title,
      description: template.description,
      status: "not_started",
      responsible_user_id: responsibleUserId,
      deadline,
      category: template.category,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  private async requireRole(organizationId: string, roleProfileId: string) {
    const role = await this.jobCards.findRole(roleProfileId);
    if (!role || role.organization_id !== organizationId) {
      throw new NotFoundError("Jobkortet");
    }
    return role;
  }
}
