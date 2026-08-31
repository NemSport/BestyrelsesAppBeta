import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";

export class StakeholderRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listStakeholders(organizationId: string, includeArchived = false) {
    let query = this.db
      .from("stakeholders")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name");
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async findStakeholder(id: string) {
    const { data, error } = await this.db
      .from("stakeholders")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listContacts(organizationId: string, stakeholderId?: string) {
    let query = this.db
      .from("stakeholder_contacts")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("is_primary", { ascending: false })
      .order("name");
    if (stakeholderId) query = query.eq("stakeholder_id", stakeholderId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async findContact(id: string) {
    const { data, error } = await this.db
      .from("stakeholder_contacts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listContracts(organizationId: string, stakeholderId?: string) {
    let query = this.db
      .from("stakeholder_contracts")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("start_date", { ascending: false });
    if (stakeholderId) query = query.eq("stakeholder_id", stakeholderId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async findContract(id: string) {
    const { data, error } = await this.db
      .from("stakeholder_contracts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listDeliverables(organizationId: string, contractIds: string[]) {
    if (!contractIds.length) return [];
    const { data, error } = await this.db
      .from("stakeholder_contract_deliverables")
      .select("*")
      .eq("organization_id", organizationId)
      .in("contract_id", contractIds)
      .is("archived_at", null)
      .order("created_at");
    if (error) throw error;
    return data;
  }

  async listActivities(organizationId: string, stakeholderId: string) {
    const { data, error } = await this.db
      .from("stakeholder_activities")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("stakeholder_id", stakeholderId)
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  }

  async listPipeline(organizationId: string, stakeholderId?: string) {
    let query = this.db
      .from("stakeholder_pipeline_entries")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });
    if (stakeholderId) query = query.eq("stakeholder_id", stakeholderId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async findPipeline(id: string) {
    const { data, error } = await this.db
      .from("stakeholder_pipeline_entries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listPipelineEvents(organizationId: string, entryIds: string[]) {
    if (!entryIds.length) return [];
    const { data, error } = await this.db
      .from("stakeholder_pipeline_events")
      .select("*")
      .eq("organization_id", organizationId)
      .in("pipeline_entry_id", entryIds)
      .order("changed_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async listDocumentRelations(
    organizationId: string,
    stakeholderId: string,
    contractIds: string[],
  ) {
    const filters = [`stakeholder_id.eq.${stakeholderId}`];
    if (contractIds.length)
      filters.push(`stakeholder_contract_id.in.(${contractIds.join(",")})`);
    const { data, error } = await this.db
      .from("document_relations")
      .select("document_id")
      .eq("organization_id", organizationId)
      .or(filters.join(","));
    if (error) throw error;
    return [...new Set(data.map((item) => item.document_id))];
  }

  async listDocumentsByIds(organizationId: string, ids: string[]) {
    if (!ids.length) return [];
    const { data, error } = await this.db
      .from("documents")
      .select("*")
      .eq("organization_id", organizationId)
      .in("id", ids)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async createStakeholder(input: TableInsert<"stakeholders">) {
    const { data, error } = await this.db
      .from("stakeholders")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async updateStakeholder(id: string, input: TableUpdate<"stakeholders">) {
    const { data, error } = await this.db
      .from("stakeholders")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async createContact(input: TableInsert<"stakeholder_contacts">) {
    const { data, error } = await this.db
      .from("stakeholder_contacts")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async updateContact(id: string, input: TableUpdate<"stakeholder_contacts">) {
    const { data, error } = await this.db
      .from("stakeholder_contacts")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async createContract(input: TableInsert<"stakeholder_contracts">) {
    const { data, error } = await this.db
      .from("stakeholder_contracts")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async createDeliverable(
    input: TableInsert<"stakeholder_contract_deliverables">,
  ) {
    const { data, error } = await this.db
      .from("stakeholder_contract_deliverables")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async createActivity(input: TableInsert<"stakeholder_activities">) {
    const { data, error } = await this.db
      .from("stakeholder_activities")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async createPipeline(input: TableInsert<"stakeholder_pipeline_entries">) {
    const { data, error } = await this.db
      .from("stakeholder_pipeline_entries")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async updatePipeline(
    id: string,
    input: TableUpdate<"stakeholder_pipeline_entries">,
  ) {
    const { data, error } = await this.db
      .from("stakeholder_pipeline_entries")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async updatePipelineStage(
    organizationId: string,
    entryId: string,
    stage: Database["public"]["Enums"]["stakeholder_pipeline_stage"],
    lostReason?: string | null,
  ) {
    const { data, error } = await this.db.rpc(
      "update_stakeholder_pipeline_stage",
      {
        target_organization_id: organizationId,
        target_pipeline_entry_id: entryId,
        target_stage: stage,
        target_lost_reason: lostReason ?? null,
      },
    );
    if (error) throw error;
    return data;
  }
}
