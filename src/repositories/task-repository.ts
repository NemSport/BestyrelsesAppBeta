import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { TaskView } from "@/types/domain";

export class TaskRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private readonly viewSelect =
    "*, committee:committees(id, name, deleted_at), meeting:meetings(id, title, starts_at, deleted_at), agendaItem:agenda_items(id, title, item_type, deleted_at), decision:decisions(id, title), responsible:profiles!tasks_responsible_user_id_fkey(id, full_name)";

  async listByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("tasks")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return this.activeRelations(data as unknown as TaskViewWithTrash[]);
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
    return this.activeRelations(data as unknown as TaskViewWithTrash[]);
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
    return this.activeRelations(data as unknown as TaskViewWithTrash[]);
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
    return this.activeRelations(data as unknown as TaskViewWithTrash[]);
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
    return this.activeRelations(data as unknown as TaskViewWithTrash[]);
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
    return this.activeRelations(data as unknown as TaskViewWithTrash[]);
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
    return this.activeRelations(data as unknown as TaskViewWithTrash[]);
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
    return this.activeRelations(data as unknown as TaskViewWithTrash[]);
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

  private activeRelations(tasks: TaskViewWithTrash[]): TaskView[] {
    return tasks.map((task) => ({
      ...task,
      committee: task.committee?.deleted_at ? null : task.committee,
      meeting: task.meeting?.deleted_at ? null : task.meeting,
      agendaItem: task.agendaItem?.deleted_at ? null : task.agendaItem,
    }));
  }
}

type TaskViewWithTrash = TaskView & {
  committee:
    | (NonNullable<TaskView["committee"]> & { deleted_at?: string | null })
    | null;
  meeting:
    | (NonNullable<TaskView["meeting"]> & { deleted_at?: string | null })
    | null;
  agendaItem:
    | (NonNullable<TaskView["agendaItem"]> & { deleted_at?: string | null })
    | null;
};
