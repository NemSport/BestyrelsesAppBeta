import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";

export class JobCardRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

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

  async listRelations(organizationId: string) {
    const [areas, committees, assignments, templates, documents, guides] =
      await Promise.all([
        this.db.from("role_profile_responsibility_areas").select("*").eq("organization_id", organizationId),
        this.db.from("role_profile_committees").select("*").eq("organization_id", organizationId),
        this.db.from("role_profile_assignments").select("*").eq("organization_id", organizationId).is("ends_on", null),
        this.db.from("task_templates").select("*").eq("organization_id", organizationId).is("archived_at", null),
        this.db.from("role_documents").select("*").eq("organization_id", organizationId),
        this.db.from("onboarding_guides").select("*").eq("organization_id", organizationId),
      ]);
    const error = [areas, committees, assignments, templates, documents, guides].find((result) => result.error)?.error;
    if (error) throw error;
    return {
      areas: areas.data ?? [],
      committees: committees.data ?? [],
      assignments: assignments.data ?? [],
      templates: templates.data ?? [],
      documents: documents.data ?? [],
      guides: guides.data ?? [],
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
    documents: Array<{ title: string; url: string }>;
    taskTemplates: Array<{ committeeId: string; title: string; description: string; category?: string | null; defaultDeadlineDays: number | null }>;
    onboarding: { introduction: string; first30Days: string; practicalInformation: string };
    userId: string;
  }) {
    const id = input.roleProfileId;
    const tables = [
      "role_profile_responsibility_areas",
      "role_profile_committees",
      "role_documents",
      "task_templates",
    ] as const;
    for (const table of tables) {
      const { error } = await this.db.from(table).delete().eq("role_profile_id", id);
      if (error) throw error;
    }
    const { data: activeAssignments, error: assignmentReadError } =
      await this.db
        .from("role_profile_assignments")
        .select("*")
        .eq("role_profile_id", id)
        .is("ends_on", null);
    if (assignmentReadError) throw assignmentReadError;
    const selectedUsers = new Set(input.assignedUserIds);
    const existingUsers = new Set(
      (activeAssignments ?? []).map((assignment) => assignment.user_id),
    );
    const removedAssignmentIds = (activeAssignments ?? [])
      .filter((assignment) => !selectedUsers.has(assignment.user_id))
      .map((assignment) => assignment.id);
    if (removedAssignmentIds.length) {
      const { error } = await this.db
        .from("role_profile_assignments")
        .update({ ends_on: new Date().toISOString().slice(0, 10) })
        .in("id", removedAssignmentIds);
      if (error) throw error;
    }
    const newAssignedUserIds = input.assignedUserIds.filter(
      (userId) => !existingUsers.has(userId),
    );
    const inserts = [
      input.responsibilityAreaIds.length
        ? this.db.from("role_profile_responsibility_areas").insert(input.responsibilityAreaIds.map((responsibilityAreaId) => ({ organization_id: input.organizationId, role_profile_id: id, responsibility_area_id: responsibilityAreaId })))
        : null,
      input.committeeIds.length
        ? this.db.from("role_profile_committees").insert(input.committeeIds.map((committeeId) => ({ organization_id: input.organizationId, role_profile_id: id, committee_id: committeeId })))
        : null,
      newAssignedUserIds.length
        ? this.db.from("role_profile_assignments").insert(newAssignedUserIds.map((userId) => ({ organization_id: input.organizationId, role_profile_id: id, user_id: userId, created_by: input.userId })))
        : null,
      input.documents.length
        ? this.db.from("role_documents").insert(input.documents.map((document) => ({ ...document, organization_id: input.organizationId, role_profile_id: id, created_by: input.userId })))
        : null,
      input.taskTemplates.length
        ? this.db.from("task_templates").insert(input.taskTemplates.map((template) => ({ organization_id: input.organizationId, role_profile_id: id, committee_id: template.committeeId, title: template.title, description: template.description, category: template.category ?? null, default_deadline_days: template.defaultDeadlineDays, created_by: input.userId })))
        : null,
    ].filter(Boolean);
    const results = await Promise.all(inserts);
    const relationError = results.find((result) => result?.error)?.error;
    if (relationError) throw relationError;
    const { error: guideError } = await this.db.from("onboarding_guides").upsert({
      organization_id: input.organizationId,
      role_profile_id: id,
      introduction: input.onboarding.introduction,
      first_30_days: input.onboarding.first30Days,
      practical_information: input.onboarding.practicalInformation,
      created_by: input.userId,
      updated_by: input.userId,
    }, { onConflict: "role_profile_id" });
    if (guideError) throw guideError;
  }

  async createResponsibilityArea(input: TableInsert<"responsibility_areas">) {
    const { data, error } = await this.db.from("responsibility_areas").insert(input).select().single();
    if (error) throw error;
    return data;
  }

  async findTemplate(templateId: string) {
    const { data, error } = await this.db.from("task_templates").select("*").eq("id", templateId).maybeSingle();
    if (error) throw error;
    return data;
  }
}
