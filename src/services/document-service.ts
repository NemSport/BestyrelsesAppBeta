import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError, AuthorizationError, NotFoundError } from "@/lib/errors";
import { getStakeholderCapabilities } from "@/lib/stakeholder-capabilities";
import { DocumentRepository, documentBucket } from "@/repositories/document-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database, TableInsert } from "@/types/database";
import type { DocumentDetail, DocumentListItem, DocumentPickerData, DocumentRegisterData, DocumentRelationType, MeetingDocumentContext } from "@/types/documents";

const maxFileSize = 25 * 1024 * 1024;
const unsafeExtension = /\.(?:html?|svg|js|mjs|exe|com|bat|cmd|ps1)$/i;
const unsafeMimeTypes = new Set(["text/html", "image/svg+xml", "application/javascript", "text/javascript", "application/x-msdownload"]);

function validateFile(file: File) {
  if (!file.name || file.size === 0) throw new AppError("Vælg en fil, der skal uploades.", 422, "EMPTY_FILE");
  if (file.size > maxFileSize) throw new AppError("Filen må højst fylde 25 MB.", 422, "FILE_TOO_LARGE");
  if (unsafeExtension.test(file.name) || unsafeMimeTypes.has(file.type)) throw new AppError("Denne filtype kan ikke uploades.", 422, "UNSAFE_FILE_TYPE");
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-160) || "dokument";
}

export class DocumentService {
  private readonly repository: DocumentRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.repository = new DocumentRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  private async context(organizationId: string) {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireOrganizationMember(organizationId, user.id);
    return { user, context, isAdmin: ["owner", "admin"].includes(context.membership.role) };
  }

  async getRegister(organizationId: string): Promise<DocumentRegisterData> {
    const { isAdmin } = await this.context(organizationId);
    const [documents, categories, committees] = await Promise.all([
      this.repository.listDocuments(organizationId),
      this.repository.listCategories(organizationId, isAdmin),
      this.repository.listCommittees(organizationId),
    ]);
    return { documents: await this.hydrate(documents), categories, committees, canManageCategories: isAdmin };
  }

  async getPickerData(organizationId: string): Promise<DocumentPickerData> {
    const register = await this.getRegister(organizationId);
    return {
      documents: register.documents.slice(0, 200),
      categories: register.categories.filter((category) => category.is_active),
    };
  }

  async getMeetingDocumentContext(input: {
    organizationId: string;
    committeeId: string;
    meetingId: string;
    agendaItemIds: string[];
  }): Promise<MeetingDocumentContext> {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      input.organizationId,
      input.committeeId,
      user.id,
    );
    const meeting = await this.repository.findRelationTarget(
      "meeting",
      input.meetingId,
    );
    if (
      !meeting?.active ||
      meeting.organizationId !== input.organizationId ||
      meeting.committeeId !== input.committeeId
    ) {
      throw new NotFoundError("Mødet");
    }

    const documents = await this.repository.listDocuments(input.organizationId);
    const hydrated = await this.hydrate(documents);
    const relations = await this.repository.listRelations(
      hydrated.map((document) => document.id),
    );
    const documentsById = new Map(
      hydrated.map((document) => [document.id, document]),
    );
    const agendaItemIds = new Set(input.agendaItemIds);
    const related = relations.flatMap((relation) => {
      const document = documentsById.get(relation.document_id);
      if (!document) return [];
      return [{
        relationId: relation.id,
        relationType: relation.relation_type,
        meetingId: relation.meeting_id,
        agendaItemId: relation.agenda_item_id,
        document,
      }];
    });

    return {
      meetingDocuments: related.filter(
        (item) =>
          item.relationType === "meeting" &&
          item.meetingId === input.meetingId,
      ),
      agendaItemDocuments: related.filter(
        (item) =>
          item.relationType === "agenda_item" &&
          Boolean(item.agendaItemId && agendaItemIds.has(item.agendaItemId)),
      ),
    };
  }

  async getDispatchDocuments(input: {
    organizationId: string;
    committeeId: string;
    meetingId: string;
    agendaItemIds: string[];
    documentIds: string[];
  }) {
    const selectedIds = [...new Set(input.documentIds)];
    if (!selectedIds.length) return [];
    const context = await this.getMeetingDocumentContext(input);
    const available = new Map(
      [...context.meetingDocuments, ...context.agendaItemDocuments].map(
        (item) => [item.document.id, item],
      ),
    );
    const selected = selectedIds.map((documentId) => available.get(documentId));
    if (selected.some((document) => !document)) {
      throw new AppError(
        "Et valgt bilag er ikke længere tilknyttet mødet eller et dagsordenspunkt.",
        422,
        "DISPATCH_DOCUMENT_NOT_AVAILABLE",
      );
    }
    const documents = selected.filter(
      (document): document is NonNullable<typeof document> => Boolean(document),
    );
    const totalSize = documents.reduce(
      (sum, document) => sum + (document.document.currentVersion?.file_size ?? 0),
      0,
    );
    if (totalSize > 18 * 1024 * 1024) {
      throw new AppError(
        "De valgte bilag fylder samlet for meget til én email. Vælg færre bilag.",
        422,
        "DISPATCH_ATTACHMENTS_TOO_LARGE",
      );
    }
    return Promise.all(
      documents.map(async (related) => {
        const version = related.document.currentVersion;
        if (!version) {
          throw new AppError(
            `Dokumentet “${related.document.name}” har ingen tilgængelig filversion.`,
            422,
            "DISPATCH_DOCUMENT_WITHOUT_VERSION",
          );
        }
        return {
          snapshot: {
            relationId: related.relationId,
            documentId: related.document.id,
            versionId: version.id,
            name: related.document.name,
            fileName: version.file_name,
            mimeType: version.mime_type,
          },
          bytes: await this.repository.download(
            version.storage_bucket,
            version.storage_path,
          ),
        };
      }),
    );
  }

  private async hydrate(documents: Awaited<ReturnType<DocumentRepository["listDocuments"]>>): Promise<DocumentListItem[]> {
    const ids = documents.map((document) => document.id);
    const [versions, relations, categories, committees, profiles] = await Promise.all([
      this.repository.listVersions(ids), this.repository.listRelations(ids),
      documents.length ? this.repository.listCategories(documents[0].organization_id, true) : [],
      documents.length ? this.repository.listCommittees(documents[0].organization_id) : [],
      this.repository.listProfiles(documents.map((document) => document.uploaded_by)),
    ]);
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const committeeNames = new Map(committees.map((committee) => [committee.id, committee.name]));
    const profileNames = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
    return documents.map((document) => ({
      ...document,
      categoryName: categoryNames.get(document.category_id ?? "") ?? null,
      committeeName: committeeNames.get(document.primary_committee_id ?? "") ?? null,
      uploaderName: profileNames.get(document.uploaded_by) ?? "Ukendt bruger",
      relationCount: relations.filter((relation) => relation.document_id === document.id).length,
      currentVersion: versions.find((version) => version.document_id === document.id && version.version_number === document.current_version_number) ?? null,
    }));
  }

  async getDetail(documentId: string): Promise<DocumentDetail> {
    const document = await this.repository.findDocument(documentId);
    if (!document) throw new NotFoundError("Dokumentet");
    const { user, isAdmin } = await this.context(document.organization_id);
    const [item] = await this.hydrate([document]);
    const [versions, rawRelations] = await Promise.all([this.repository.listVersions([documentId]), this.repository.listRelations([documentId])]);
    const profiles = await this.repository.listProfiles(versions.map((version) => version.uploaded_by));
    const profileNames = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
    return {
      ...item,
      versions: versions.map((version) => ({ ...version, uploaderName: profileNames.get(version.uploaded_by) ?? "Ukendt bruger" })),
      relations: await this.repository.relationLabels(rawRelations),
      canEdit: isAdmin || document.uploaded_by === user.id,
      canManageCategories: isAdmin,
    };
  }

  async upload(input: { organizationId: string; file: File; name: string; categoryId?: string | null; committeeId?: string | null; description?: string | null; relationType?: DocumentRelationType | null; relationId?: string | null }) {
    validateFile(input.file);
    const name = input.name.trim();
    if (!name) throw new AppError("Dokumentnavn er påkrævet.", 422);
    const { user, context } = await this.context(input.organizationId);
    if (
      ["stakeholder", "stakeholder_contract"].includes(input.relationType ?? "") &&
      !getStakeholderCapabilities(context.membership.role).updateStakeholders
    ) throw new AuthorizationError();
    if (input.committeeId) await this.authorization.requireCommitteeMember(input.organizationId, input.committeeId, user.id);
    const documentId = crypto.randomUUID();
    const path = `${input.organizationId}/documents/${documentId}/v1-${safeFileName(input.file.name)}`;
    let documentCreated = false;
    let uploaded = false;
    try {
      await this.repository.createDocument({ id: documentId, organization_id: input.organizationId, primary_committee_id: input.committeeId ?? null, category_id: input.categoryId ?? null, name, description: input.description?.trim() || null, current_version_number: 0, uploaded_by: user.id, created_by: user.id, updated_by: user.id });
      documentCreated = true;
      const relation = this.relationInsert(input.organizationId, documentId, user.id, input.relationType ?? (input.committeeId ? "committee" : "organization"), input.relationId ?? input.committeeId ?? null);
      await this.repository.createRelation(relation);
      await this.repository.upload(path, input.file); uploaded = true;
      await this.repository.createVersion({ organization_id: input.organizationId, document_id: documentId, version_number: 1, storage_bucket: documentBucket, storage_path: path, file_name: input.file.name, mime_type: input.file.type || "application/octet-stream", file_size: input.file.size, uploaded_by: user.id });
      return await this.repository.updateDocument(documentId, { current_version_number: 1, updated_by: user.id });
    } catch (error) {
      if (uploaded) await this.repository.removeUpload(documentBucket, path).catch(() => undefined);
      if (documentCreated) await this.repository.hardDeleteDocument(documentId).catch(() => undefined);
      throw error;
    }
  }

  async replace(documentId: string, file: File) {
    validateFile(file);
    const detail = await this.getDetail(documentId);
    if (!detail.canEdit) throw new AuthorizationError();
    const nextVersion = detail.current_version_number + 1;
    const path = `${detail.organization_id}/documents/${detail.id}/v${nextVersion}-${safeFileName(file.name)}`;
    await this.repository.upload(path, file);
    try {
      return await this.repository.addVersion(detail.id, { storagePath: path, fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size });
    } catch (error) {
      await this.repository.removeUpload(documentBucket, path).catch(() => undefined);
      throw error;
    }
  }

  async update(documentId: string, input: { name?: string; description?: string | null; categoryId?: string | null; committeeId?: string | null }) {
    const detail = await this.getDetail(documentId);
    if (!detail.canEdit) throw new AuthorizationError();
    const user = await this.auth.requireUser();
    if (input.committeeId) await this.authorization.requireCommitteeMember(detail.organization_id, input.committeeId, user.id);
    return this.repository.updateDocument(documentId, { name: input.name?.trim() || undefined, description: input.description?.trim() || null, category_id: input.categoryId, primary_committee_id: input.committeeId, updated_by: user.id });
  }

  async softDelete(documentId: string) {
    const detail = await this.getDetail(documentId);
    if (!detail.canEdit) throw new AuthorizationError();
    const user = await this.auth.requireUser();
    await this.repository.softDeleteDocument(documentId, user.id);
  }

  async getVersionDownload(documentId: string, versionId: string, download = false) {
    const detail = await this.getDetail(documentId);
    const version = detail.versions.find((candidate) => candidate.id === versionId);
    if (!version) throw new NotFoundError("Dokumentversionen");
    return { url: await this.repository.signedUrl(version.storage_bucket, version.storage_path, download ? version.file_name : undefined), fileName: version.file_name };
  }

  async createCategory(organizationId: string, name: string) {
    const { user } = await this.context(organizationId);
    await this.authorization.requireOrganizationAdmin(organizationId, user.id);
    if (!name.trim()) throw new AppError("Kategorinavn er påkrævet.", 422);
    return this.repository.createCategory({ organization_id: organizationId, name: name.trim(), created_by: user.id, updated_by: user.id });
  }
  async updateCategory(organizationId: string, categoryId: string, input: { name?: string; isActive?: boolean }) {
    const { user } = await this.context(organizationId);
    await this.authorization.requireOrganizationAdmin(organizationId, user.id);
    return this.repository.updateCategory(categoryId, { name: input.name?.trim(), is_active: input.isActive, updated_by: user.id });
  }

  async addRelation(documentId: string, relationType: DocumentRelationType, relationId: string | null) {
    const detail = await this.getDetail(documentId);
    if (!detail.canEdit) throw new AuthorizationError();
    const user = await this.auth.requireUser();
    const { context } = await this.context(detail.organization_id);
    if (
      ["stakeholder", "stakeholder_contract"].includes(relationType) &&
      !getStakeholderCapabilities(context.membership.role).updateStakeholders
    ) throw new AuthorizationError();
    return this.repository.createRelation(this.relationInsert(detail.organization_id, documentId, user.id, relationType, relationId));
  }
  async attachExisting(
    documentId: string,
    relationType: DocumentRelationType,
    relationId: string | null,
  ) {
    const document = await this.repository.findDocument(documentId);
    if (!document) throw new NotFoundError("Dokumentet");
    const { user, context } = await this.context(document.organization_id);

    if (relationType === "organization") {
      if (relationId) throw new AppError("Organisationsrelationen er ugyldig.", 422);
    } else {
      if (!relationId) {
        throw new AppError("Vælg det element, dokumentet skal relateres til.", 422);
      }
      const target = await this.repository.findRelationTarget(
        relationType,
        relationId,
      );
      if (
        !target?.active ||
        target.organizationId !== document.organization_id
      ) {
        throw new NotFoundError("Det relaterede element");
      }
      if (target.committeeId) {
        await this.authorization.requireAgendaItemEditor(
          document.organization_id,
          target.committeeId,
          user.id,
        );
      } else if (
        ["stakeholder", "stakeholder_contract"].includes(relationType) &&
        !getStakeholderCapabilities(context.membership.role).updateStakeholders
      ) {
        throw new AuthorizationError();
      } else if (relationType === "annual_wheel_event") {
        await this.authorization.requireOrganizationAdmin(
          document.organization_id,
          user.id,
        );
      }
    }

    return this.repository.attachExistingDocument(
      documentId,
      relationType,
      relationId,
    );
  }

  async detachExisting(documentId: string, relationId: string) {
    const [document, relation] = await Promise.all([
      this.repository.findDocument(documentId),
      this.repository.findRelation(relationId),
    ]);
    if (!document || !relation || relation.document_id !== document.id) {
      throw new NotFoundError("Dokumentrelationen");
    }
    const user = await this.auth.requireUser();
    if (relation.relation_type === "organization") {
      await this.authorization.requireOrganizationAdmin(
        document.organization_id,
        user.id,
      );
    } else {
      const relationIdByType = {
        committee: relation.committee_id,
        meeting: relation.meeting_id,
        agenda_item: relation.agenda_item_id,
        task: relation.task_id,
        annual_wheel_event: relation.annual_wheel_event_id,
        stakeholder: relation.stakeholder_id,
        stakeholder_contract: relation.stakeholder_contract_id,
        organization: null,
      } satisfies Record<DocumentRelationType, string | null>;
      const targetId = relationIdByType[relation.relation_type];
      if (!targetId) throw new NotFoundError("Det relaterede element");
      const target = await this.repository.findRelationTarget(
        relation.relation_type,
        targetId,
      );
      if (!target?.active || target.organizationId !== document.organization_id) {
        throw new NotFoundError("Det relaterede element");
      }
      if (target.committeeId) {
        await this.authorization.requireAgendaItemEditor(
          document.organization_id,
          target.committeeId,
          user.id,
        );
      } else if (["stakeholder", "stakeholder_contract"].includes(relation.relation_type)) {
        const { context } = await this.context(document.organization_id);
        if (!getStakeholderCapabilities(context.membership.role).updateStakeholders) {
          throw new AuthorizationError();
        }
      } else {
        await this.authorization.requireOrganizationAdmin(
          document.organization_id,
          user.id,
        );
      }
    }
    await this.repository.detachExistingDocument(relationId);
  }
  async removeRelation(documentId: string, relationId: string) {
    const detail = await this.getDetail(documentId);
    if (!detail.canEdit) throw new AuthorizationError();
    const relation = detail.relations.find((item) => item.id === relationId);
    if (!relation) throw new NotFoundError("Relationen");
    await this.repository.deleteRelation(relationId);
  }

  private relationInsert(organizationId: string, documentId: string, userId: string, type: DocumentRelationType, relationId: string | null): TableInsert<"document_relations"> {
    if (type !== "organization" && !relationId) throw new AppError("Vælg det element, dokumentet skal relateres til.", 422);
    return { organization_id: organizationId, document_id: documentId, relation_type: type, created_by: userId,
      committee_id: type === "committee" ? relationId : null, meeting_id: type === "meeting" ? relationId : null,
      agenda_item_id: type === "agenda_item" ? relationId : null, task_id: type === "task" ? relationId : null,
      annual_wheel_event_id: type === "annual_wheel_event" ? relationId : null,
      stakeholder_id: type === "stakeholder" ? relationId : null,
      stakeholder_contract_id: type === "stakeholder_contract" ? relationId : null };
  }
}
