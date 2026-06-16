import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { DecisionView } from "@/types/domain";

export class DecisionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private readonly viewSelect =
    "*, committee:committees(id, name, deleted_at), meeting:meetings(id, title, starts_at, deleted_at), agendaItem:agenda_items(id, title, item_type, deleted_at), responsible:profiles!decisions_responsible_user_id_fkey(id, full_name)";

  async listByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("decisions")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .order("decision_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return this.activeRelations(data as unknown as DecisionViewWithTrash[]);
  }

  async listByMeeting(meetingId: string) {
    const { data, error } = await this.db
      .from("decisions")
      .select(this.viewSelect)
      .eq("meeting_id", meetingId)
      .is("archived_at", null)
      .order("decision_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return this.activeRelations(data as unknown as DecisionViewWithTrash[]);
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

  private activeRelations(decisions: DecisionViewWithTrash[]): DecisionView[] {
    return decisions.map((decision) => ({
      ...decision,
      committee: decision.committee?.deleted_at ? null : decision.committee,
      meeting: decision.meeting?.deleted_at ? null : decision.meeting,
      agendaItem: decision.agendaItem?.deleted_at ? null : decision.agendaItem,
    }));
  }
}

type DecisionViewWithTrash = DecisionView & {
  committee:
    | (NonNullable<DecisionView["committee"]> & { deleted_at?: string | null })
    | null;
  meeting:
    | (NonNullable<DecisionView["meeting"]> & { deleted_at?: string | null })
    | null;
  agendaItem:
    | (NonNullable<DecisionView["agendaItem"]> & {
        deleted_at?: string | null;
      })
    | null;
};
