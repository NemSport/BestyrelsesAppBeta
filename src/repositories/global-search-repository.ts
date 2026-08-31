import type { SupabaseClient } from "@supabase/supabase-js";

import { toPostgrestSearchTerm } from "@/lib/global-search";
import type { Database } from "@/types/database";

const candidateLimit = 24;

export class GlobalSearchRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private pattern(query: string) {
    return `%${toPostgrestSearchTerm(query)}%`;
  }

  async committees(organizationId: string) {
    const { data, error } = await this.db
      .from("committees")
      .select("id,name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .is("deleted_at", null);
    if (error) throw error;
    return data;
  }

  async meetings(organizationId: string, query: string) {
    const { data, error } = await this.db
      .from("meetings")
      .select("id,committee_id,title,description,starts_at,updated_at,committee:committees(id,name)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`title.ilike.${this.pattern(query)},description.ilike.${this.pattern(query)}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async meetingsInCommittees(organizationId: string, committeeIds: string[]) {
    if (!committeeIds.length) return [];
    const { data, error } = await this.db
      .from("meetings")
      .select("id,committee_id,title,description,starts_at,updated_at,committee:committees(id,name)")
      .eq("organization_id", organizationId)
      .in("committee_id", committeeIds)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async agendaItems(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("agenda_items")
      .select("id,committee_id,title,description,objective,updated_at,committee:committees(id,name)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`title.ilike.${pattern},description.ilike.${pattern},objective.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async agendaItemOccurrences(agendaItemIds: string[]) {
    if (!agendaItemIds.length) return [];
    const { data, error } = await this.db
      .from("agenda_item_occurrences")
      .select("id,agenda_item_id,created_at,meeting:meetings(id,title,starts_at)")
      .in("agenda_item_id", [...new Set(agendaItemIds)])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(candidateLimit * 3);
    if (error) throw error;
    return data;
  }

  async meetingMinutes(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("meeting_minutes")
      .select("id,committee_id,meeting_id,minutes_text,decisions,updated_at,meeting:meetings(id,title,starts_at),committee:committees(id,name)")
      .eq("organization_id", organizationId)
      .eq("status", "approved")
      .or(`minutes_text.ilike.${pattern},decisions.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async agendaItemMinutes(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .select("id,committee_id,meeting_id,agenda_item_id,agenda_item_occurrence_id,notes,decision,follow_up,updated_at,meeting:meetings(id,title,starts_at),agendaItem:agenda_items(id,title),committee:committees(id,name)")
      .eq("organization_id", organizationId)
      .or(`notes.ilike.${pattern},decision.ilike.${pattern},follow_up.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async approvedMeetingIds(meetingIds: string[]) {
    if (!meetingIds.length) return new Set<string>();
    const { data, error } = await this.db
      .from("meeting_minutes")
      .select("meeting_id")
      .in("meeting_id", [...new Set(meetingIds)])
      .eq("status", "approved");
    if (error) throw error;
    return new Set(data.map((row) => row.meeting_id));
  }

  async decisions(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("decisions")
      .select("id,committee_id,meeting_id,agenda_item_id,title,description,decision_date,updated_at,committee:committees(id,name),meeting:meetings(id,title,starts_at),agendaItem:agenda_items(id,title)")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async tasks(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("tasks")
      .select("id,committee_id,title,description,deadline,status,updated_at,committee:committees(id,name),responsible:profiles!tasks_responsible_user_id_fkey(id,full_name)")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async documents(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("documents")
      .select("id,name,description,updated_at,category:document_categories(id,name),primaryCommittee:committees!documents_primary_committee_id_fkey(id,name)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async stakeholders(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("stakeholders")
      .select("id,name,stakeholder_type,relationship_status,notes,cvr_number,email,updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .or(`name.ilike.${pattern},notes.ilike.${pattern},cvr_number.ilike.${pattern},email.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async stakeholderContacts(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("stakeholder_contacts")
      .select("id,name,email,updated_at,stakeholder:stakeholders(id,name,stakeholder_type,relationship_status,updated_at,archived_at)")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .or(`name.ilike.${pattern},email.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async stakeholderContracts(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("stakeholder_contracts")
      .select("id,title,annual_value,currency,updated_at,stakeholder:stakeholders(id,name,stakeholder_type,relationship_status,updated_at,archived_at)")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .ilike("title", pattern)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }

  async annualWheel(organizationId: string, query: string) {
    const pattern = this.pattern(query);
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .select("id,title,description,starts_on,updated_at,committee:committees(id,name)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(candidateLimit);
    if (error) throw error;
    return data;
  }
}
