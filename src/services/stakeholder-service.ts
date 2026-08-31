import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorizationError, NotFoundError } from "@/lib/errors";
import { getStakeholderCapabilities } from "@/lib/stakeholder-capabilities";
import {
  activeContractFor,
  addDays,
  calculateStakeholderKpis,
  localDate,
  stakeholderContractExpiryDays,
  stakeholderFollowUpDays,
} from "@/lib/stakeholders";
import {
  stakeholderActivityInputSchema,
  stakeholderArchiveSchema,
  stakeholderContactArchiveSchema,
  stakeholderContactInputSchema,
  stakeholderContactUpdateSchema,
  stakeholderContractInputSchema,
  stakeholderDeliverableInputSchema,
  stakeholderInputSchema,
  stakeholderPipelineInputSchema,
  stakeholderPipelineUpdateSchema,
  stakeholderUpdateSchema,
} from "@/lib/validation";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { DocumentRepository } from "@/repositories/document-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { StakeholderRepository } from "@/repositories/stakeholder-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";
import type { DocumentListItem } from "@/types/documents";
import type {
  StakeholderCapabilities,
  StakeholderListItem,
  StakeholderWorkspaceData,
} from "@/types/stakeholders";

export class StakeholderService {
  private readonly repository: StakeholderRepository;
  private readonly committees: CommitteeRepository;
  private readonly documents: DocumentRepository;
  private readonly tasks: TaskRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.repository = new StakeholderRepository(db);
    this.committees = new CommitteeRepository(db);
    this.documents = new DocumentRepository(db);
    this.tasks = new TaskRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  private async context(organizationId: string) {
    const user = await this.auth.requireUser();
    const context = await this.authorization.requireOrganizationMember(
      organizationId,
      user.id,
    );
    return {
      user,
      context,
      capabilities: getStakeholderCapabilities(context.membership.role),
    };
  }

  private requireCapability(
    capabilities: StakeholderCapabilities,
    capability: keyof StakeholderCapabilities,
  ) {
    if (!capabilities[capability]) throw new AuthorizationError();
  }

  async getWorkspace(
    organizationId: string,
    now = new Date(),
  ): Promise<StakeholderWorkspaceData> {
    const { capabilities } = await this.context(organizationId);
    const [stakeholders, contacts, contracts, pipeline, members] =
      await Promise.all([
        this.repository.listStakeholders(organizationId),
        this.repository.listContacts(organizationId),
        this.repository.listContracts(organizationId),
        this.repository.listPipeline(organizationId),
        this.members.listMembers(organizationId),
      ]);
    const memberNames = new Map(
      members.map((member) => [
        member.user_id,
        member.full_name || member.email,
      ]),
    );
    const stakeholderMap = new Map(
      stakeholders.map((stakeholder) => [stakeholder.id, stakeholder]),
    );
    const throughFollowUp = addDays(now, stakeholderFollowUpDays).getTime();
    const throughExpiry = localDate(
      addDays(now, stakeholderContractExpiryDays),
    );
    const today = localDate(now);

    const items: StakeholderListItem[] = stakeholders.map((stakeholder) => {
      const activeContract = activeContractFor(contracts, stakeholder.id);
      const stakeholderPipeline =
        pipeline.find(
          (entry) =>
            entry.stakeholder_id === stakeholder.id && !entry.closed_at,
        ) ??
        pipeline.find((entry) => entry.stakeholder_id === stakeholder.id) ??
        null;
      const followUps = [
        stakeholder.next_follow_up_at,
        stakeholderPipeline?.next_follow_up_at,
      ]
        .filter((value): value is string => Boolean(value))
        .sort();
      const contractDates = activeContract
        ? [
            activeContract.notice_deadline,
            activeContract.renewal_deadline,
            activeContract.end_date,
          ]
            .filter((value): value is string => Boolean(value))
            .sort()
        : [];
      const nextActionAt = [...followUps, ...contractDates].sort()[0] ?? null;
      const followUpTime = followUps[0]
        ? new Date(followUps[0]).getTime()
        : null;
      const requiresFollowUp =
        followUpTime !== null && followUpTime <= throughFollowUp;
      const missingRequiredFollowUp = Boolean(
        stakeholderPipeline &&
        !stakeholderPipeline.closed_at &&
        !stakeholderPipeline.next_follow_up_at &&
        ["contacted", "dialogue", "proposal_sent"].includes(
          stakeholderPipeline.stage,
        ),
      );
      return {
        ...stakeholder,
        ownerName:
          memberNames.get(stakeholder.internal_owner_user_id ?? "") ?? null,
        primaryContact:
          contacts.find(
            (contact) =>
              contact.stakeholder_id === stakeholder.id && contact.is_primary,
          ) ??
          contacts.find(
            (contact) => contact.stakeholder_id === stakeholder.id,
          ) ??
          null,
        activeAnnualValue: contracts
          .filter(
            (contract) =>
              contract.stakeholder_id === stakeholder.id &&
              contract.status === "active" &&
              !contract.archived_at,
          )
          .reduce(
            (sum, contract) => sum + Number(contract.annual_value ?? 0),
            0,
          ),
        activeContract,
        pipelineEntry: stakeholderPipeline,
        nextActionAt,
        nextActionLabel:
          followUps[0] === nextActionAt
            ? stakeholderPipeline?.next_follow_up_note ||
              stakeholder.next_follow_up_note ||
              "Følg op"
            : activeContract?.notice_deadline === nextActionAt
              ? "Opsigelsesfrist"
              : activeContract?.renewal_deadline === nextActionAt
                ? "Fornyelsesfrist"
                : activeContract?.end_date === nextActionAt
                  ? "Kontrakt udløber"
                  : null,
        requiresFollowUp: requiresFollowUp || missingRequiredFollowUp,
        overdueFollowUp: followUpTime !== null && followUpTime < now.getTime(),
        expiringSoon: Boolean(
          activeContract?.end_date &&
          activeContract.end_date >= today &&
          activeContract.end_date <= throughExpiry,
        ),
      };
    });

    const boardPipeline = [
      ...new Map(
        [...pipeline]
          .sort((left, right) => {
            if (Boolean(left.closed_at) !== Boolean(right.closed_at))
              return left.closed_at ? 1 : -1;
            return right.updated_at.localeCompare(left.updated_at);
          })
          .map((entry) => [entry.stakeholder_id, entry]),
      ).values(),
    ];
    const upcomingActions = items
      .flatMap((item) =>
        item.nextActionAt
          ? [
              {
                id: item.id,
                title: `${item.nextActionLabel ?? "Næste handling"}: ${item.name}`,
                date: item.nextActionAt,
                overdue:
                  item.nextActionAt.length > 10
                    ? new Date(item.nextActionAt).getTime() < now.getTime()
                    : item.nextActionAt < today,
                href: `/organizations/${organizationId}/stakeholders/${item.id}`,
              },
            ]
          : [],
      )
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(0, 8);

    return {
      stakeholders: items,
      pipeline: boardPipeline.flatMap((entry) => {
        const stakeholder = stakeholderMap.get(entry.stakeholder_id);
        return stakeholder
          ? [
              {
                ...entry,
                stakeholder,
                ownerName:
                  memberNames.get(
                    entry.internal_owner_user_id ??
                      stakeholder.internal_owner_user_id ??
                      "",
                  ) ?? null,
              },
            ]
          : [];
      }),
      kpis: calculateStakeholderKpis({
        stakeholders,
        contracts,
        pipelineEntries: pipeline,
        items,
        now,
      }),
      members,
      capabilities,
      upcomingActions,
    };
  }

  async getProfile(organizationId: string, stakeholderId: string) {
    const { user, capabilities } = await this.context(organizationId);
    const workspace = await this.getWorkspace(organizationId);
    const stakeholder = workspace.stakeholders.find(
      (item) => item.id === stakeholderId,
    );
    if (!stakeholder) throw new NotFoundError("Interessenten");
    const [
      contacts,
      contracts,
      activities,
      pipelineEntries,
      tasks,
      organizationDocuments,
      organizationContracts,
      committees,
    ] = await Promise.all([
      this.repository.listContacts(organizationId, stakeholderId),
      this.repository.listContracts(organizationId, stakeholderId),
      this.repository.listActivities(organizationId, stakeholderId),
      this.repository.listPipeline(organizationId, stakeholderId),
      this.tasks.listByStakeholder(organizationId, stakeholderId),
      this.documents.listDocuments(organizationId),
      this.repository.listContracts(organizationId),
      this.committees.listByOrganization(organizationId),
    ]);
    const [deliverables, pipelineEvents, documentIds] = await Promise.all([
      this.repository.listDeliverables(
        organizationId,
        contracts.map((contract) => contract.id),
      ),
      this.repository.listPipelineEvents(
        organizationId,
        pipelineEntries.map((entry) => entry.id),
      ),
      this.repository.listDocumentRelations(
        organizationId,
        stakeholderId,
        contracts.map((contract) => contract.id),
      ),
    ]);
    const documents = await this.hydrateDocuments(organizationId, documentIds);
    const memberNames = new Map(
      workspace.members.map((member) => [
        member.user_id,
        member.full_name || member.email,
      ]),
    );
    const editableCommitteeIds = (
      await Promise.all(
        committees
          .map((committee) => committee.id)
          .map((committeeId) =>
            this.authorization
              .requireAgendaItemEditor(organizationId, committeeId, user.id)
              .then(() => committeeId)
              .catch(() => null),
          ),
      )
    ).filter((id): id is string => Boolean(id));
    return {
      stakeholder,
      contacts,
      contracts: contracts.map((contract) => ({
        ...contract,
        deliverables: deliverables.filter(
          (item) => item.contract_id === contract.id,
        ),
      })),
      activities: activities.map((activity) => ({
        ...activity,
        creatorName: memberNames.get(activity.created_by) ?? null,
      })),
      pipelineEntries,
      pipelineEvents,
      documents,
      availableDocuments: organizationDocuments
        .filter(
          (document) =>
            !documentIds.includes(document.id) &&
            (capabilities.archiveStakeholders ||
              document.uploaded_by === user.id),
        )
        .map((document) => ({ id: document.id, title: document.name })),
      tasks: tasks.map((task) =>
        editableCommitteeIds.includes(task.committee_id)
          ? task
          : { ...task, internal_note: null },
      ),
      taskCommittees: committees
        .filter((committee) => editableCommitteeIds.includes(committee.id))
        .map(({ id, name }) => ({ id, name })),
      taskStakeholders: workspace.stakeholders.map(({ id, name }) => ({
        id,
        name,
      })),
      taskStakeholderContracts: organizationContracts.map(
        ({ id, stakeholder_id, title }) => ({ id, stakeholder_id, title }),
      ),
      members: workspace.members,
      editableCommitteeIds,
      capabilities,
    };
  }

  private async hydrateDocuments(
    organizationId: string,
    ids: string[],
  ): Promise<DocumentListItem[]> {
    const documents = await this.repository.listDocumentsByIds(
      organizationId,
      ids,
    );
    if (!documents.length) return [];
    const [versions, relations, categories, committees, profiles] =
      await Promise.all([
        this.documents.listVersions(ids),
        this.documents.listRelations(ids),
        this.documents.listCategories(organizationId, true),
        this.documents.listCommittees(organizationId),
        this.documents.listProfiles(
          documents.map((document) => document.uploaded_by),
        ),
      ]);
    return documents.map((document) => ({
      ...document,
      categoryName:
        categories.find((category) => category.id === document.category_id)
          ?.name ?? null,
      committeeName:
        committees.find(
          (committee) => committee.id === document.primary_committee_id,
        )?.name ?? null,
      uploaderName:
        profiles.find((profile) => profile.id === document.uploaded_by)
          ?.full_name ?? "Ukendt bruger",
      relationCount: relations.filter(
        (relation) => relation.document_id === document.id,
      ).length,
      currentVersion:
        versions.find(
          (version) =>
            version.document_id === document.id &&
            version.version_number === document.current_version_number,
        ) ?? null,
    }));
  }

  private async requireStakeholder(
    organizationId: string,
    stakeholderId: string,
  ) {
    const stakeholder = await this.repository.findStakeholder(stakeholderId);
    if (
      !stakeholder ||
      stakeholder.organization_id !== organizationId ||
      stakeholder.archived_at
    )
      throw new NotFoundError("Interessenten");
    return stakeholder;
  }

  private requireActiveMember(
    members: Awaited<ReturnType<OrganizationMemberRepository["listMembers"]>>,
    userId?: string | null,
  ) {
    if (
      userId &&
      !members.some(
        (member) => member.user_id === userId && member.status === "active",
      )
    )
      throw new NotFoundError("Den interne ansvarlige");
  }

  async create(input: unknown) {
    const parsed = stakeholderInputSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "createStakeholders");
    const members = await this.members.listMembers(parsed.organizationId);
    this.requireActiveMember(members, parsed.internalOwnerUserId);
    const stakeholder = await this.repository.createStakeholder({
      organization_id: parsed.organizationId,
      name: parsed.name,
      stakeholder_type: parsed.stakeholderType,
      relationship_status: parsed.relationshipStatus,
      internal_owner_user_id: parsed.internalOwnerUserId ?? null,
      website: parsed.website || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      cvr_number: parsed.cvrNumber || null,
      address_line: parsed.addressLine || null,
      postal_code: parsed.postalCode || null,
      city: parsed.city || null,
      country: parsed.country || null,
      notes: parsed.notes || null,
      next_follow_up_at: parsed.nextFollowUpAt ?? null,
      next_follow_up_note: parsed.nextFollowUpNote || null,
      created_by: user.id,
      updated_by: user.id,
    });
    if (parsed.addToPipeline && parsed.stakeholderType === "sponsor") {
      await this.repository.createPipeline({
        organization_id: parsed.organizationId,
        stakeholder_id: stakeholder.id,
        stage: parsed.pipelineStage,
        internal_owner_user_id: parsed.internalOwnerUserId ?? null,
        closed_at: ["won", "lost"].includes(parsed.pipelineStage)
          ? new Date().toISOString()
          : null,
        lost_reason:
          parsed.pipelineStage === "lost" ? "Oprettet som tabt lead" : null,
        created_by: user.id,
        updated_by: user.id,
      });
    }
    return stakeholder;
  }

  async update(input: unknown) {
    const parsed = stakeholderUpdateSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "updateStakeholders");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    const members = await this.members.listMembers(parsed.organizationId);
    this.requireActiveMember(members, parsed.internalOwnerUserId);
    return this.repository.updateStakeholder(parsed.stakeholderId, {
      name: parsed.name,
      stakeholder_type: parsed.stakeholderType,
      relationship_status: parsed.relationshipStatus,
      internal_owner_user_id: parsed.internalOwnerUserId ?? null,
      website: parsed.website || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      cvr_number: parsed.cvrNumber || null,
      address_line: parsed.addressLine || null,
      postal_code: parsed.postalCode || null,
      city: parsed.city || null,
      country: parsed.country || null,
      notes: parsed.notes || null,
      next_follow_up_at: parsed.nextFollowUpAt ?? null,
      next_follow_up_note: parsed.nextFollowUpNote || null,
      updated_by: user.id,
    });
  }

  async archive(input: unknown) {
    const parsed = stakeholderArchiveSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "archiveStakeholders");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    return this.repository.updateStakeholder(parsed.stakeholderId, {
      archived_at: new Date().toISOString(),
      updated_by: user.id,
    });
  }

  async createContact(input: unknown) {
    const parsed = stakeholderContactInputSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "manageContacts");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    return this.repository.createContact({
      organization_id: parsed.organizationId,
      stakeholder_id: parsed.stakeholderId,
      name: parsed.name,
      job_title: parsed.jobTitle || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      is_primary: parsed.isPrimary,
      notes: parsed.notes || null,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  async archiveContact(input: unknown) {
    const parsed = stakeholderContactArchiveSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "manageContacts");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    const contact = await this.repository.findContact(parsed.contactId);
    if (
      !contact ||
      contact.organization_id !== parsed.organizationId ||
      contact.stakeholder_id !== parsed.stakeholderId
    )
      throw new NotFoundError("Kontaktpersonen");
    return this.repository.updateContact(parsed.contactId, {
      archived_at: new Date().toISOString(),
      is_primary: false,
      updated_by: user.id,
    });
  }

  async updateContact(input: unknown) {
    const parsed = stakeholderContactUpdateSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "manageContacts");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    const contact = await this.repository.findContact(parsed.contactId);
    if (
      !contact ||
      contact.organization_id !== parsed.organizationId ||
      contact.stakeholder_id !== parsed.stakeholderId
    )
      throw new NotFoundError("Kontaktpersonen");
    return this.repository.updateContact(parsed.contactId, {
      name: parsed.name,
      job_title: parsed.jobTitle || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      is_primary: parsed.isPrimary,
      notes: parsed.notes || null,
      updated_by: user.id,
    });
  }

  async createContract(input: unknown) {
    const parsed = stakeholderContractInputSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "manageContracts");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    return this.repository.createContract({
      organization_id: parsed.organizationId,
      stakeholder_id: parsed.stakeholderId,
      title: parsed.title,
      status: parsed.status,
      contract_value: parsed.contractValue ?? null,
      annual_value: parsed.annualValue ?? null,
      currency: parsed.currency,
      start_date: parsed.startDate,
      end_date: parsed.endDate ?? null,
      notice_deadline: parsed.noticeDeadline ?? null,
      renewal_deadline: parsed.renewalDeadline ?? null,
      auto_renew: parsed.autoRenew,
      notes: parsed.notes || null,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  async createDeliverable(input: unknown) {
    const parsed = stakeholderDeliverableInputSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "manageContracts");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    const contract = await this.repository.findContract(parsed.contractId);
    if (
      !contract ||
      contract.organization_id !== parsed.organizationId ||
      contract.stakeholder_id !== parsed.stakeholderId
    )
      throw new NotFoundError("Kontrakten");
    return this.repository.createDeliverable({
      organization_id: parsed.organizationId,
      contract_id: parsed.contractId,
      deliverable_type: parsed.deliverableType,
      title: parsed.title,
      description: parsed.description || null,
      quantity_details: parsed.quantityDetails || null,
      fulfillment_status: parsed.fulfillmentStatus,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  async createActivity(input: unknown) {
    const parsed = stakeholderActivityInputSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "addActivities");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    return this.repository.createActivity({
      organization_id: parsed.organizationId,
      stakeholder_id: parsed.stakeholderId,
      activity_type: parsed.activityType,
      activity_source: "manual",
      title: parsed.title,
      description: parsed.description || null,
      occurred_at: parsed.occurredAt,
      created_by: user.id,
      contact_id: parsed.contactId ?? null,
      contract_id: parsed.contractId ?? null,
    });
  }

  async createPipeline(input: unknown) {
    const parsed = stakeholderPipelineInputSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "managePipeline");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    const members = await this.members.listMembers(parsed.organizationId);
    this.requireActiveMember(members, parsed.internalOwnerUserId);
    return this.repository.createPipeline({
      organization_id: parsed.organizationId,
      stakeholder_id: parsed.stakeholderId,
      stage: parsed.stage,
      internal_owner_user_id: parsed.internalOwnerUserId ?? null,
      estimated_value: parsed.estimatedValue ?? null,
      currency: parsed.currency,
      next_follow_up_at: parsed.nextFollowUpAt ?? null,
      next_follow_up_note: parsed.nextFollowUpNote || null,
      closed_at: ["won", "lost"].includes(parsed.stage)
        ? new Date().toISOString()
        : null,
      lost_reason: parsed.stage === "lost" ? "Oprettet som tabt lead" : null,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  async updatePipeline(input: unknown) {
    const parsed = stakeholderPipelineUpdateSchema.parse(input);
    const { user, capabilities } = await this.context(parsed.organizationId);
    this.requireCapability(capabilities, "managePipeline");
    await this.requireStakeholder(parsed.organizationId, parsed.stakeholderId);
    const entry = await this.repository.findPipeline(parsed.pipelineEntryId);
    if (
      !entry ||
      entry.organization_id !== parsed.organizationId ||
      entry.stakeholder_id !== parsed.stakeholderId
    )
      throw new NotFoundError("Pipelinekortet");
    if (parsed.internalOwnerUserId !== undefined) {
      const members = await this.members.listMembers(parsed.organizationId);
      this.requireActiveMember(members, parsed.internalOwnerUserId);
    }
    if (parsed.stage)
      await this.repository.updatePipelineStage(
        parsed.organizationId,
        entry.id,
        parsed.stage,
        parsed.lostReason,
      );
    const hasDetails =
      parsed.internalOwnerUserId !== undefined ||
      parsed.estimatedValue !== undefined ||
      parsed.nextFollowUpAt !== undefined ||
      parsed.nextFollowUpNote !== undefined;
    return hasDetails
      ? this.repository.updatePipeline(entry.id, {
          internal_owner_user_id: parsed.internalOwnerUserId,
          estimated_value: parsed.estimatedValue,
          next_follow_up_at: parsed.nextFollowUpAt,
          next_follow_up_note: parsed.nextFollowUpNote || null,
          updated_by: user.id,
        })
      : this.repository.findPipeline(entry.id);
  }
}
