import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { DocumentRelation } from "@/types/documents";

export const documentBucket = "organization-documents";

export class DocumentRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listDocuments(organizationId: string) {
    const { data, error } = await this.db
      .from("documents")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async listWorkspaceRecent(organizationId: string, committeeId: string) {
    const { data, error } = await this.db
      .from("documents")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("primary_committee_id", committeeId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    return data;
  }

  async findDocument(id: string) {
    const { data, error } = await this.db
      .from("documents")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findRelation(id: string) {
    const { data, error } = await this.db
      .from("document_relations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findRelationTarget(
    type: Database["public"]["Enums"]["document_relation_type"],
    id: string,
  ): Promise<{
    organizationId: string;
    committeeId: string | null;
    active: boolean;
  } | null> {
    if (type === "committee") {
      const { data, error } = await this.db
        .from("committees")
        .select("organization_id, deleted_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            organizationId: data.organization_id,
            committeeId: id,
            active: !data.deleted_at,
          }
        : null;
    }
    if (type === "meeting") {
      const { data, error } = await this.db
        .from("meetings")
        .select("organization_id, committee_id, deleted_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            organizationId: data.organization_id,
            committeeId: data.committee_id,
            active: !data.deleted_at,
          }
        : null;
    }
    if (type === "agenda_item") {
      const { data, error } = await this.db
        .from("agenda_items")
        .select("organization_id, committee_id, deleted_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            organizationId: data.organization_id,
            committeeId: data.committee_id,
            active: !data.deleted_at,
          }
        : null;
    }
    if (type === "task") {
      const { data, error } = await this.db
        .from("tasks")
        .select("organization_id, committee_id, archived_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            organizationId: data.organization_id,
            committeeId: data.committee_id,
            active: !data.archived_at,
          }
        : null;
    }
    if (type === "annual_wheel_event") {
      const { data, error } = await this.db
        .from("annual_wheel_events")
        .select("organization_id, committee_id, deleted_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            organizationId: data.organization_id,
            committeeId: data.committee_id,
            active: !data.deleted_at,
          }
        : null;
    }
    if (type === "stakeholder") {
      const { data, error } = await this.db
        .from("stakeholders")
        .select("organization_id, archived_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            organizationId: data.organization_id,
            committeeId: null,
            active: !data.archived_at,
          }
        : null;
    }
    if (type === "stakeholder_contract") {
      const { data, error } = await this.db
        .from("stakeholder_contracts")
        .select("organization_id, archived_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            organizationId: data.organization_id,
            committeeId: null,
            active: !data.archived_at,
          }
        : null;
    }
    return null;
  }

  async listCategories(organizationId: string, includeInactive = false) {
    let query = this.db
      .from("document_categories")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name");
    if (!includeInactive) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async listCommittees(organizationId: string) {
    const { data, error } = await this.db
      .from("committees")
      .select("id, name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("name");
    if (error) throw error;
    return data;
  }

  async listVersions(documentIds: string[]) {
    if (!documentIds.length) return [];
    const { data, error } = await this.db
      .from("document_versions")
      .select("*")
      .in("document_id", documentIds)
      .order("version_number", { ascending: false });
    if (error) throw error;
    return data;
  }

  async listRelations(documentIds: string[]) {
    if (!documentIds.length) return [];
    const { data, error } = await this.db
      .from("document_relations")
      .select("*")
      .in("document_id", documentIds)
      .order("created_at");
    if (error) throw error;
    return data;
  }

  async listProfiles(userIds: string[]) {
    if (!userIds.length) return [];
    const { data, error } = await this.db
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(userIds)]);
    if (error) throw error;
    return data;
  }

  async relationLabels(
    relations: Awaited<ReturnType<DocumentRepository["listRelations"]>>,
  ) {
    const ids = (key: keyof (typeof relations)[number]) =>
      relations.flatMap((row) => {
        const value = row[key];
        return typeof value === "string" ? [value] : [];
      });
    const [
      committees,
      meetings,
      agendaItems,
      tasks,
      events,
      stakeholders,
      contracts,
    ] = await Promise.all([
      this.lookup("committees", ids("committee_id")),
      this.lookup("meetings", ids("meeting_id"), "title"),
      this.lookup("agenda_items", ids("agenda_item_id"), "title"),
      this.lookup("tasks", ids("task_id"), "title"),
      this.lookup("annual_wheel_events", ids("annual_wheel_event_id"), "title"),
      this.lookup("stakeholders", ids("stakeholder_id")),
      this.lookup(
        "stakeholder_contracts",
        ids("stakeholder_contract_id"),
        "title",
      ),
    ]);
    const maps = [
      committees,
      meetings,
      agendaItems,
      tasks,
      events,
      stakeholders,
      contracts,
    ].map((rows) => new Map(rows.map((row) => [row.id, row.label])));
    return relations.map((row) => {
      const label =
        row.relation_type === "organization"
          ? "Organisationen"
          : row.relation_type === "committee"
            ? maps[0].get(row.committee_id ?? "")
            : row.relation_type === "meeting"
              ? maps[1].get(row.meeting_id ?? "")
              : row.relation_type === "agenda_item"
                ? maps[2].get(row.agenda_item_id ?? "")
                : row.relation_type === "task"
                  ? maps[3].get(row.task_id ?? "")
                  : row.relation_type === "annual_wheel_event"
                    ? maps[4].get(row.annual_wheel_event_id ?? "")
                    : row.relation_type === "stakeholder"
                      ? maps[5].get(row.stakeholder_id ?? "")
                      : maps[6].get(row.stakeholder_contract_id ?? "");
      return {
        ...row,
        label: label ?? "Relateret element",
      } satisfies DocumentRelation;
    });
  }

  private async lookup(
    table:
      | "committees"
      | "meetings"
      | "agenda_items"
      | "tasks"
      | "annual_wheel_events"
      | "stakeholders"
      | "stakeholder_contracts",
    ids: string[],
    label = "name",
  ) {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from(table)
      .select(`id, ${label}`)
      .in("id", [...new Set(ids)]);
    if (error) throw error;
    return (data as unknown as Array<Record<string, string>>).map((row) => ({
      id: row.id,
      label: row[label],
    }));
  }

  async createDocument(input: TableInsert<"documents">) {
    const { error } = await this.db.from("documents").insert(input);
    if (error) throw error;
  }
  async updateDocument(id: string, input: TableUpdate<"documents">) {
    const { data, error } = await this.db
      .from("documents")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async hardDeleteDocument(id: string) {
    const { error } = await this.db.from("documents").delete().eq("id", id);
    if (error) throw error;
  }
  async softDeleteDocument(id: string, userId: string) {
    const { error } = await this.db
      .from("documents")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        updated_by: userId,
      })
      .eq("id", id);
    if (error) throw error;
  }
  async createVersion(input: TableInsert<"document_versions">) {
    const { data, error } = await this.db
      .from("document_versions")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async addVersion(
    documentId: string,
    input: {
      storagePath: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    },
  ) {
    const { data, error } = await this.db.rpc("add_document_version", {
      target_document_id: documentId,
      target_storage_bucket: documentBucket,
      target_storage_path: input.storagePath,
      target_file_name: input.fileName,
      target_mime_type: input.mimeType,
      target_file_size: input.fileSize,
    });
    if (error) throw error;
    return data;
  }
  async createRelation(input: TableInsert<"document_relations">) {
    const { data, error } = await this.db
      .from("document_relations")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async attachExistingDocument(
    documentId: string,
    relationType: Database["public"]["Enums"]["document_relation_type"],
    relationId: string | null,
  ) {
    const { data, error } = await this.db.rpc("attach_existing_document", {
      target_document_id: documentId,
      target_relation_type: relationType,
      target_relation_id: relationId,
    });
    if (error) throw error;
    return data;
  }
  async detachExistingDocument(relationId: string) {
    const { data, error } = await this.db.rpc("detach_existing_document", {
      target_relation_id: relationId,
    });
    if (error) throw error;
    return data;
  }
  async deleteRelation(id: string) {
    const { error } = await this.db
      .from("document_relations")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
  async createCategory(input: TableInsert<"document_categories">) {
    const { data, error } = await this.db
      .from("document_categories")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async updateCategory(id: string, input: TableUpdate<"document_categories">) {
    const { data, error } = await this.db
      .from("document_categories")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async upload(path: string, file: File) {
    const { error } = await this.db.storage
      .from(documentBucket)
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (error) throw error;
  }
  async removeUpload(bucket: string, path: string) {
    const { error } = await this.db.storage.from(bucket).remove([path]);
    if (error) throw error;
  }
  async signedUrl(bucket: string, path: string, downloadName?: string) {
    const { data, error } = await this.db.storage
      .from(bucket)
      .createSignedUrl(
        path,
        60,
        downloadName ? { download: downloadName } : undefined,
      );
    if (error) throw error;
    return data.signedUrl;
  }
  async download(bucket: string, path: string) {
    const { data, error } = await this.db.storage.from(bucket).download(path);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }
}
