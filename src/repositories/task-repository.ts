import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { TaskView } from "@/types/domain";

export class TaskRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private readonly viewSelect =
    "*, committee:committees(id, name), meeting:meetings(id, title, starts_at), agendaItem:agenda_items(id, title, item_type), decision:decisions(id, title), responsible:profiles!tasks_responsible_user_id_fkey(id, full_name)";

  async listByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TaskView[];
  }

  async listByResponsible(organizationId: string, userId: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .eq("responsible_user_id", userId)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TaskView[];
  }

  async listByMeeting(meetingId: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("meeting_id", meetingId)
      .is("archived_at", null)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TaskView[];
  }

  async listByAgendaItem(agendaItemId: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("agenda_item_id", agendaItemId)
      .is("archived_at", null)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TaskView[];
  }

  async listByDecision(decisionId: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("decision_id", decisionId)
      .is("archived_at", null)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TaskView[];
  }

  async listOpenDueSoon(
    organizationId: string,
    fromDate: string,
    throughDate: string,
  ) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .not("status", "in", "(completed,cancelled)")
      .gte("deadline", fromDate)
      .lte("deadline", throughDate)
      .order("deadline", { ascending: true });
    if (error) throw error;
    return data as unknown as TaskView[];
  }

  async listOpenOverdue(organizationId: string, beforeDate: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .not("status", "in", "(completed,cancelled)")
      .lt("deadline", beforeDate)
      .order("deadline", { ascending: true });
    if (error) throw error;
    return data as unknown as TaskView[];
  }

  async listRemindersDue(organizationId: string, throughTime: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .is("reminder_sent_at", null)
      .not("status", "in", "(completed,cancelled)")
      .lte("reminder_at", throughTime)
      .order("reminder_at", { ascending: true });
    if (error) throw error;
    return data as unknown as TaskView[];
  }

  async findById(taskId: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(input: TableInsert<"tasks">) {
    const { data, error } = await this.db
      .from("tasks")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(taskId: string, input: TableUpdate<"tasks">) {
    const { data, error } = await this.db
      .from("tasks")
      .update(input)
      .eq("id", taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
