import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { DecisionView } from "@/types/domain";

export class DecisionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("decisions")
      .select(
        "*, committee:committees(id, name), meeting:meetings(id, title, starts_at), agendaItem:agenda_items(id, title, item_type), responsible:profiles!decisions_responsible_user_id_fkey(id, full_name)",
      )
      .eq("organization_id", organizationId)
      .order("decision_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as DecisionView[];
  }

  async listByMeeting(meetingId: string) {
    const { data, error } = await this.db
      .from("decisions")
      .select(
        "*, committee:committees(id, name), meeting:meetings(id, title, starts_at), agendaItem:agenda_items(id, title, item_type), responsible:profiles!decisions_responsible_user_id_fkey(id, full_name)",
      )
      .eq("meeting_id", meetingId)
      .is("archived_at", null)
      .order("decision_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as DecisionView[];
  }

  async findById(decisionId: string) {
    const { data, error } = await this.db
      .from("decisions")
      .select("*")
      .eq("id", decisionId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(input: TableInsert<"decisions">) {
    const { data, error } = await this.db
      .from("decisions")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(decisionId: string, input: TableUpdate<"decisions">) {
    const { data, error } = await this.db
      .from("decisions")
      .update(input)
      .eq("id", decisionId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
