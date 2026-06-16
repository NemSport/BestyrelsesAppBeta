import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableUpdate } from "@/types/database";
import type {
  AgendaItemMinutes,
  MeetingMinutes,
  TransferredAgendaItem,
} from "@/types/domain";

export class CommitteeRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("committees")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("name");
    if (error) throw error;
    return data;
  }

  async findById(committeeId: string) {
    const { data, error } = await this.db
      .from("committees")
      .select("*")
      .eq("id", committeeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findIncludingDeleted(committeeId: string) {
    const { data, error } = await this.db
      .from("committees")
      .select("*")
      .eq("id", committeeId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async softDelete(committeeId: string) {
    const { data, error } = await this.db.rpc("soft_delete_committee", {
      target_committee_id: committeeId,
    });
    if (error) throw error;
    return data;
  }

  async restore(committeeId: string) {
    const { data, error } = await this.db.rpc("restore_committee", {
      target_committee_id: committeeId,
    });
    if (error) throw error;
    return data;
  }

  async getMembership(committeeId: string, userId: string) {
    const { data, error } = await this.db
      .from("committee_members")
      .select("*")
      .eq("committee_id", committeeId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(organizationId: string, name: string, description: string) {
    const { data, error } = await this.db.rpc("create_committee_with_chair", {
      target_organization_id: organizationId,
      committee_name: name,
      committee_description: description,
    });
    if (error) throw error;
    return data;
  }

  async update(committeeId: string, input: TableUpdate<"committees">) {
    const { data, error } = await this.db
      .from("committees")
      .update(input)
      .eq("id", committeeId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listRecentMinutes(committeeId: string) {
    const { data, error } = await this.db
      .from("meeting_minutes")
      .select("*")
      .eq("committee_id", committeeId)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    return data as MeetingMinutes[];
  }

  async listAgendaItemMinutes(committeeId: string) {
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .select("*")
      .eq("committee_id", committeeId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data as AgendaItemMinutes[];
  }

  async listActiveTransfers(committeeId: string) {
    const { data, error } = await this.db
      .from("transferred_agenda_items")
      .select("*")
      .eq("committee_id", committeeId)
      .neq("status", "dismissed")
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return data as TransferredAgendaItem[];
  }
}
