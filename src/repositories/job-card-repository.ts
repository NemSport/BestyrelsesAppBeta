import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "@/lib/errors";
import type { Database, TableInsert, TableUpdate } from "@/types/database";

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

type RepositoryErrorContext = {
  operation: string;
  organizationId: string;
  roleProfileId: string;
  counts?: Record<string, number>;
};

function mapJobCardRelationError(error: unknown, operation: string) {
  const record = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  const message = record.message ?? "";

  if (record.code === "23505") {
    return new AppError(
      "Jobkortets relationer indeholder dubletter. Genåbn jobkortet, og prøv igen.",
      422,
      "JOB_CARD_RELATION_DUPLICATE",
    );
  }

  if (
    record.code === "23503" ||
    message.includes("Job card responsibility scope is invalid") ||
    message.includes("Job card committee scope is invalid") ||
    message.includes("Job card assignment scope is invalid") ||
    message.includes("Task template scope is invalid")
  ) {
    return new AppError(
      "En valgt rolleholder, udvalg eller ansvarsområde hører ikke til organisationen eller kan ikke tilknyttes.",
      422,
      "JOB_CARD_RELATION_SCOPE_INVALID",
    );
  }

  if (record.code === "42501" || message.toLowerCase().includes("permission")) {
    return new AppError(
      "Du har ikke rettigheder til at ændre jobkortets relationer.",
      403,
      "JOB_CARD_RELATION_FORBIDDEN",
    );
  }

  if (operation.includes("assignments")) {
    return new AppError(
      "Rolleholderne kunne ikke gemmes på jobkortet. Kontrollér at de valgte personer er aktive medlemmer af organisationen.",
      422,
      "JOB_CARD_ASSIGNMENTS_SAVE_FAILED",
    );
  }

  if (operation.includes("committees")) {
    return new AppError(
      "Udvalgene kunne ikke gemmes på jobkortet. Kontrollér at de valgte udvalg hører til organisationen.",
      422,
      "JOB_CARD_COMMITTEES_SAVE_FAILED",
    );
  }

  if (operation.includes("responsibility")) {
    return new AppError(
      "Ansvarsområderne kunne ikke gemmes på jobkortet. Kontrollér at de valgte ansvarsområder hører til organisationen.",
      422,
      "JOB_CARD_RESPONSIBILITIES_SAVE_FAILED",
    );
  }

  if (operation.includes("annual_wheel")) {
    return new AppError(
      "Årshjulsaktiviteterne kunne ikke gemmes på jobkortet. Kontrollér at de valgte aktiviteter hører til organisationen.",
      422,
      "JOB_CARD_ANNUAL_WHEEL_SAVE_FAILED",
    );
  }

  if (operation.includes("decisions")) {
    return new AppError(
      "Beslutningerne kunne ikke gemmes på jobkortet. Kontrollér at de valgte beslutninger hører til organisationen.",
      422,
      "JOB_CARD_DECISIONS_SAVE_FAILED",
    );
  }

  return new AppError(
    "Jobkortets relationer kunne ikke gemmes. Prøv igen, eller genåbn jobkortet.",
    500,
    "JOB_CARD_RELATIONS_SAVE_FAILED",
  );
}

export class JobCardRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private failRelationWrite(error: unknown, context: RepositoryErrorContext): never {
    const record = error as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    };
    console.error("[job-cards] Jobkort-relation kunne ikke gemmes", {
      operation: context.operation,
      organizationId: context.organizationId,
      roleProfileId: context.roleProfileId,
      counts: context.counts,
      code: record.code,
      message: record.message,
      details: record.details,
      hint: record.hint,
    });
    throw mapJobCardRelationError(error, context.operation);
  }

  async findOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listRoles(organizationId: string) {
    const { data, error } = await this.db
      .from("role_profiles")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("title");
    if (error) throw error;
    return data;
  }

  async findRole(roleProfileId: string) {
    const { data, error } = await this.db
      .from("role_profiles")
      .select("*")
      .eq("id", roleProfileId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listResponsibilityAreas(organizationId: string) {
    const { data, error } = await this.db
      .from("responsibility_areas")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("name");
    if (error) throw error;
    return data;
  }

  async listAllResponsibilityAreas(organizationId: string) {
    const { data, error } = await this.db
      .from("responsibility_areas")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name");
    if (error) throw error;
    return data;
  }

  async listRelations(organizationId: string) {
    const [
      areas,
      committees,
      assignments,
      templates,
      documents,
      guides,
      decisions,
    ] =
      await Promise.all([
        this.db.from("role_profile_responsibility_areas").select("*").eq("organization_id", organizationId),
        this.db.from("role_profile_committees").select("*").eq("organization_id", organizationId),
        this.db.from("role_profile_assignments").select("*").eq("organization_id", organizationId).is("ends_on", null),
        this.db.from("task_templates").select("*").eq("organization_id", organizationId).is("archived_at", null),
        this.db.from("role_documents").select("*").eq("organization_id", organizationId),
        this.db.from("onboarding_guides").select("*").eq("organization_id", organizationId),
        this.db.from("role_profile_decisions").select("*").eq("organization_id", organizationId),
      ]);
    const error = [
      areas,
      committees,
      assignments,
      templates,
      documents,
      guides,
      decisions,
    ].find((result) => result.error)?.error;
    if (error) throw error;
    return {
      areas: areas.data ?? [],
      committees: committees.data ?? [],
      assignments: assignments.data ?? [],
      templates: templates.data ?? [],
      documents: documents.data ?? [],
      guides: guides.data ?? [],
      decisions: decisions.data ?? [],
    };
  }

  async createRole(input: TableInsert<"role_profiles">) {
    const { data, error } = await this.db.from("role_profiles").insert(input).select().single();
    if (error) throw error;
    return data;
  }

  async updateRole(id: string, input: TableUpdate<"role_profiles">) {
    const { data, error } = await this.db.from("role_profiles").update(input).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  async replaceRelations(input: {
    organizationId: string;
    roleProfileId: string;
    responsibilityAreaIds: string[];
    committeeIds: string[];
    assignedUserIds: string[];
    annualWheelEventIds: string[];
    decisionIds: string[];
    documents: Array<{ title: string; url: string }>;
    taskTemplates: Array<{ committeeId: string; title: string; description: string; category?: string | null; defaultDeadlineDays: number | null }>;
    onboarding: { introduction: string; first30Days: string; practicalInformation: string };
    userId: string;
  }) {
    const id = input.roleProfileId;
    const responsibilityAreaIds = uniqueValues(input.responsibilityAreaIds);
    const committeeIds = uniqueValues(input.committeeIds);
    const assignedUserIds = uniqueValues(input.assignedUserIds);
    const annualWheelEventIds = uniqueValues(input.annualWheelEventIds);
    const decisionIds = uniqueValues(input.decisionIds);
    const counts = {
      responsibilityAreas: responsibilityAreaIds.length,
      committees: committeeIds.length,
      assignedUsers: assignedUserIds.length,
      annualWheelEvents: annualWheelEventIds.length,
      decisions: decisionIds.length,
      documents: input.documents.length,
      taskTemplates: input.taskTemplates.length,
    };
    const tables = ["role_documents", "task_templates"] as const;
    for (const table of tables) {
      const { error } = await this.db
        .from(table)
        .delete()
        .eq("organization_id", input.organizationId)
        .eq("role_profile_id", id);
      if (error) {
        this.failRelationWrite(error, {
          operation: `delete:${table}`,
          organizationId: input.organizationId,
          roleProfileId: id,
          counts,
        });
      }
    }
    const { data: activeAssignments, error: assignmentReadError } =
      await this.db
        .from("role_profile_assignments")
        .select("*")
        .eq("organization_id", input.organizationId)
        .eq("role_profile_id", id)
        .is("ends_on", null);
    if (assignmentReadError) {
      this.failRelationWrite(assignmentReadError, {
        operation: "read:role_profile_assignments",
        organizationId: input.organizationId,
        roleProfileId: id,
        counts,
      });
    }
    const selectedUsers = new Set(assignedUserIds);
    const existingUsers = new Set(
      (activeAssignments ?? []).map((assignment) => assignment.user_id),
    );
    const removedAssignmentIds = (activeAssignments ?? [])
      .filter((assignment) => !selectedUsers.has(assignment.user_id))
      .map((assignment) => assignment.id);
    const newAssignedUserIds = assignedUserIds.filter(
      (userId) => !existingUsers.has(userId),
    );
    const documents = input.documents.filter(
      (document) => hasText(document.title) || hasText(document.url),
    );
    const taskTemplates = input.taskTemplates.filter(
      (template) =>
        hasText(template.title) ||
        hasText(template.description) ||
        hasText(template.category) ||
        template.defaultDeadlineDays !== null,
    );

    await this.replaceResponsibilityAreaRelations({
      organizationId: input.organizationId,
      roleProfileId: id,
      responsibilityAreaIds,
      counts,
    });
    await this.replaceCommitteeRelations({
      organizationId: input.organizationId,
      roleProfileId: id,
      committeeIds,
      counts,
    });
    await this.replaceAnnualWheelRelations({
      organizationId: input.organizationId,
      roleProfileId: id,
      annualWheelEventIds,
      userId: input.userId,
      counts,
    });
    await this.replaceDecisionRelations({
      organizationId: input.organizationId,
      roleProfileId: id,
      decisionIds,
      userId: input.userId,
      counts,
    });

    const insertOperations = [
      newAssignedUserIds.length
        ? { operation: "insert:role_profile_assignments", query: this.db.from("role_profile_assignments").insert(newAssignedUserIds.map((userId) => ({ organization_id: input.organizationId, role_profile_id: id, user_id: userId, created_by: input.userId }))) }
        : null,
      documents.length
        ? { operation: "insert:role_documents", query: this.db.from("role_documents").insert(documents.map((document) => ({ ...document, organization_id: input.organizationId, role_profile_id: id, created_by: input.userId }))) }
        : null,
      taskTemplates.length
        ? { operation: "insert:task_templates", query: this.db.from("task_templates").insert(taskTemplates.map((template) => ({ organization_id: input.organizationId, role_profile_id: id, committee_id: template.committeeId, title: template.title, description: template.description, category: template.category ?? null, default_deadline_days: template.defaultDeadlineDays, created_by: input.userId }))) }
        : null,
    ].filter((operation): operation is NonNullable<typeof operation> =>
      Boolean(operation),
    );
    for (const insert of insertOperations) {
      const { error } = await insert.query;
      if (error) {
        this.failRelationWrite(error, {
          operation: insert.operation,
          organizationId: input.organizationId,
          roleProfileId: id,
          counts,
        });
      }
    }
    if (removedAssignmentIds.length) {
      const { error } = await this.db
        .from("role_profile_assignments")
        .update({ ends_on: new Date().toISOString().slice(0, 10) })
        .in("id", removedAssignmentIds);
      if (error) {
        this.failRelationWrite(error, {
          operation: "update:role_profile_assignments:end_removed",
          organizationId: input.organizationId,
          roleProfileId: id,
          counts,
        });
      }
    }
    const hasOnboarding =
      hasText(input.onboarding.introduction) ||
      hasText(input.onboarding.first30Days) ||
      hasText(input.onboarding.practicalInformation);
    if (!hasOnboarding) {
      const { error: deleteGuideError } = await this.db
        .from("onboarding_guides")
        .delete()
        .eq("organization_id", input.organizationId)
        .eq("role_profile_id", id);
      if (deleteGuideError) {
        this.failRelationWrite(deleteGuideError, {
          operation: "delete:onboarding_guides",
          organizationId: input.organizationId,
          roleProfileId: id,
          counts,
        });
      }
      return;
    }
    const { error: guideError } = await this.db.from("onboarding_guides").upsert({
      organization_id: input.organizationId,
      role_profile_id: id,
      introduction: input.onboarding.introduction,
      first_30_days: input.onboarding.first30Days,
      practical_information: input.onboarding.practicalInformation,
      created_by: input.userId,
      updated_by: input.userId,
    }, { onConflict: "role_profile_id" });
    if (guideError) {
      this.failRelationWrite(guideError, {
        operation: "upsert:onboarding_guides",
        organizationId: input.organizationId,
        roleProfileId: id,
        counts,
      });
    }
  }

  private async replaceResponsibilityAreaRelations(input: {
    organizationId: string;
    roleProfileId: string;
    responsibilityAreaIds: string[];
    counts: Record<string, number>;
  }) {
    if (input.responsibilityAreaIds.length) {
      const { error: upsertError } = await this.db
        .from("role_profile_responsibility_areas")
        .upsert(
          input.responsibilityAreaIds.map((responsibilityAreaId) => ({
            organization_id: input.organizationId,
            role_profile_id: input.roleProfileId,
            responsibility_area_id: responsibilityAreaId,
          })),
          {
            ignoreDuplicates: true,
            onConflict: "role_profile_id,responsibility_area_id",
          },
        );
      if (upsertError) {
        this.failRelationWrite(upsertError, {
          operation: "upsert:role_profile_responsibility_areas",
          organizationId: input.organizationId,
          roleProfileId: input.roleProfileId,
          counts: input.counts,
        });
      }
      const { error: deleteStaleError } = await this.db
        .from("role_profile_responsibility_areas")
        .delete()
        .eq("organization_id", input.organizationId)
        .eq("role_profile_id", input.roleProfileId)
        .not("responsibility_area_id", "in", `(${input.responsibilityAreaIds.join(",")})`);
      if (deleteStaleError) {
        this.failRelationWrite(deleteStaleError, {
          operation: "delete-stale:role_profile_responsibility_areas",
          organizationId: input.organizationId,
          roleProfileId: input.roleProfileId,
          counts: input.counts,
        });
      }
      return;
    }

    const { error } = await this.db
      .from("role_profile_responsibility_areas")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("role_profile_id", input.roleProfileId);
    if (error) {
      this.failRelationWrite(error, {
        operation: "delete-all:role_profile_responsibility_areas",
        organizationId: input.organizationId,
        roleProfileId: input.roleProfileId,
        counts: input.counts,
      });
    }
  }

  private async replaceCommitteeRelations(input: {
    organizationId: string;
    roleProfileId: string;
    committeeIds: string[];
    counts: Record<string, number>;
  }) {
    if (input.committeeIds.length) {
      const { error: upsertError } = await this.db
        .from("role_profile_committees")
        .upsert(
          input.committeeIds.map((committeeId) => ({
            organization_id: input.organizationId,
            role_profile_id: input.roleProfileId,
            committee_id: committeeId,
          })),
          {
            ignoreDuplicates: true,
            onConflict: "role_profile_id,committee_id",
          },
        );
      if (upsertError) {
        this.failRelationWrite(upsertError, {
          operation: "upsert:role_profile_committees",
          organizationId: input.organizationId,
          roleProfileId: input.roleProfileId,
          counts: input.counts,
        });
      }
      const { error: deleteStaleError } = await this.db
        .from("role_profile_committees")
        .delete()
        .eq("organization_id", input.organizationId)
        .eq("role_profile_id", input.roleProfileId)
        .not("committee_id", "in", `(${input.committeeIds.join(",")})`);
      if (deleteStaleError) {
        this.failRelationWrite(deleteStaleError, {
          operation: "delete-stale:role_profile_committees",
          organizationId: input.organizationId,
          roleProfileId: input.roleProfileId,
          counts: input.counts,
        });
      }
      return;
    }

    const { error } = await this.db
      .from("role_profile_committees")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("role_profile_id", input.roleProfileId);
    if (error) {
      this.failRelationWrite(error, {
        operation: "delete-all:role_profile_committees",
        organizationId: input.organizationId,
        roleProfileId: input.roleProfileId,
        counts: input.counts,
      });
    }
  }

  private async replaceAnnualWheelRelations(input: {
    organizationId: string;
    roleProfileId: string;
    annualWheelEventIds: string[];
    userId: string;
    counts: Record<string, number>;
  }) {
    let clearQuery = this.db
      .from("annual_wheel_events")
      .update({ role_profile_id: null, updated_by: input.userId })
      .eq("organization_id", input.organizationId)
      .eq("role_profile_id", input.roleProfileId);
    if (input.annualWheelEventIds.length) {
      clearQuery = clearQuery.not(
        "id",
        "in",
        `(${input.annualWheelEventIds.join(",")})`,
      );
    }
    const { error: clearError } = await clearQuery;
    if (clearError) {
      this.failRelationWrite(clearError, {
        operation: "update:annual_wheel_events:clear_role_profile",
        organizationId: input.organizationId,
        roleProfileId: input.roleProfileId,
        counts: input.counts,
      });
    }

    if (!input.annualWheelEventIds.length) return;
    const { error: assignError } = await this.db
      .from("annual_wheel_events")
      .update({
        role_profile_id: input.roleProfileId,
        updated_by: input.userId,
      })
      .eq("organization_id", input.organizationId)
      .in("id", input.annualWheelEventIds);
    if (assignError) {
      this.failRelationWrite(assignError, {
        operation: "update:annual_wheel_events:assign_role_profile",
        organizationId: input.organizationId,
        roleProfileId: input.roleProfileId,
        counts: input.counts,
      });
    }
  }

  private async replaceDecisionRelations(input: {
    organizationId: string;
    roleProfileId: string;
    decisionIds: string[];
    userId: string;
    counts: Record<string, number>;
  }) {
    if (input.decisionIds.length) {
      const { error: upsertError } = await this.db
        .from("role_profile_decisions")
        .upsert(
          input.decisionIds.map((decisionId) => ({
            organization_id: input.organizationId,
            role_profile_id: input.roleProfileId,
            decision_id: decisionId,
            created_by: input.userId,
          })),
          {
            ignoreDuplicates: true,
            onConflict: "role_profile_id,decision_id",
          },
        );
      if (upsertError) {
        this.failRelationWrite(upsertError, {
          operation: "upsert:role_profile_decisions",
          organizationId: input.organizationId,
          roleProfileId: input.roleProfileId,
          counts: input.counts,
        });
      }
      const { error: deleteStaleError } = await this.db
        .from("role_profile_decisions")
        .delete()
        .eq("organization_id", input.organizationId)
        .eq("role_profile_id", input.roleProfileId)
        .not("decision_id", "in", `(${input.decisionIds.join(",")})`);
      if (deleteStaleError) {
        this.failRelationWrite(deleteStaleError, {
          operation: "delete-stale:role_profile_decisions",
          organizationId: input.organizationId,
          roleProfileId: input.roleProfileId,
          counts: input.counts,
        });
      }
      return;
    }

    const { error } = await this.db
      .from("role_profile_decisions")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("role_profile_id", input.roleProfileId);
    if (error) {
      this.failRelationWrite(error, {
        operation: "delete-all:role_profile_decisions",
        organizationId: input.organizationId,
        roleProfileId: input.roleProfileId,
        counts: input.counts,
      });
    }
  }

  async createResponsibilityArea(input: TableInsert<"responsibility_areas">) {
    const { data, error } = await this.db.from("responsibility_areas").insert(input).select().single();
    if (error) throw error;
    return data;
  }

  async restoreResponsibilityArea(areaId: string, organizationId: string) {
    const { data, error } = await this.db
      .from("responsibility_areas")
      .update({ archived_at: null })
      .eq("id", areaId)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async findTemplate(templateId: string) {
    const { data, error } = await this.db.from("task_templates").select("*").eq("id", templateId).maybeSingle();
    if (error) throw error;
    return data;
  }
}
