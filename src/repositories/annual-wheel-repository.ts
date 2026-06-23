import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { AnnualWheelEventView } from "@/types/domain";

export class AnnualWheelRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private readonly viewSelect =
    "*, committee:committees(id, name, deleted_at), meeting:meetings(id, title, starts_at, deleted_at), task:tasks!annual_wheel_events_task_id_fkey(id, title, status), responsible:profiles!annual_wheel_events_responsible_user_id_fkey(id, full_name)";

  async listByOrganization(organizationId: string, year: number) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .lte("starts_on", to)
      .gte("ends_on", from)
      .order("starts_on");
    if (error) throw error;
    const events = this.activeRelations(
      data as unknown as AnnualWheelEventViewWithTrash[],
    );
    return this.withWorkItems(organizationId, events);
  }

  async findById(eventId: string) {
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findViewById(organizationId: string, eventId: string) {
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .select(this.viewSelect)
      .eq("organization_id", organizationId)
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const [event] = this.activeRelations([
      data as unknown as AnnualWheelEventViewWithTrash,
    ]);
    const [eventWithWorkItems] = await this.withWorkItems(organizationId, [
      event,
    ]);
    return eventWithWorkItems ?? null;
  }

  async createMany(input: TableInsert<"annual_wheel_events">[]) {
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .insert(input)
      .select();
    if (error) throw error;
    return data;
  }

  async createTaskTemplates(
    input: TableInsert<"annual_wheel_task_templates">[],
  ) {
    if (!input.length) return [];
    const { data, error } = await this.db
      .from("annual_wheel_task_templates")
      .insert(input)
      .select();
    if (error) throw error;
    return data;
  }

  async createKeyPeople(input: TableInsert<"annual_wheel_key_people">[]) {
    if (!input.length) return [];
    const { data, error } = await this.db
      .from("annual_wheel_key_people")
      .insert(input)
      .select();
    if (error) throw error;
    return data;
  }

  async replaceTaskTemplates(
    eventId: string,
    input: TableInsert<"annual_wheel_task_templates">[],
    userId: string,
  ) {
    const { error: archiveError } = await this.db
      .from("annual_wheel_task_templates")
      .update({
        archived_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("annual_wheel_event_id", eventId)
      .is("archived_at", null);
    if (archiveError) throw archiveError;
    return this.createTaskTemplates(input);
  }

  async replaceKeyPeople(
    eventId: string,
    input: TableInsert<"annual_wheel_key_people">[],
    userId: string,
  ) {
    const { error: archiveError } = await this.db
      .from("annual_wheel_key_people")
      .update({
        archived_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("annual_wheel_event_id", eventId)
      .is("archived_at", null);
    if (archiveError) throw archiveError;
    return this.createKeyPeople(input);
  }

  async findTaskTemplates(eventId: string) {
    const { data, error } = await this.db
      .from("annual_wheel_task_templates")
      .select("*")
      .eq("annual_wheel_event_id", eventId)
      .is("archived_at", null)
      .order("sort_order");
    if (error) throw error;
    return data;
  }

  async findActivatedTasks(eventId: string, activationYear?: number) {
    let query = this.db
      .from("tasks")
      .select(
        "id,title,status,deadline,responsible_user_id,annual_wheel_event_id,annual_wheel_activation_year,annual_wheel_task_template_id,archived_at",
      )
      .eq("annual_wheel_event_id", eventId)
      .is("archived_at", null)
      .order("deadline", { ascending: true, nullsFirst: false });
    if (activationYear) {
      query = query.eq("annual_wheel_activation_year", activationYear);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async createActivatedTasks(input: TableInsert<"tasks">[]) {
    if (!input.length) return [];
    const { data, error } = await this.db.from("tasks").insert(input).select();
    if (error) throw error;
    return data;
  }

  async completeIfAllActivatedTasksDone(
    eventId: string,
    activationYear: number,
    userId: string,
  ) {
    const event = await this.findById(eventId);
    if (!event || event.status === "cancelled") return null;
    const tasks = await this.findActivatedTasks(eventId, activationYear);
    if (
      !tasks.length ||
      tasks.some((task) => task.status !== "completed")
    ) {
      return null;
    }
    return this.update(eventId, {
      status: "completed",
      updated_by: userId,
    });
  }

  async update(
    eventId: string,
    input: TableUpdate<"annual_wheel_events">,
  ) {
    const { data, error } = await this.db
      .from("annual_wheel_events")
      .update(input)
      .eq("id", eventId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  private activeRelations(events: AnnualWheelEventViewWithTrash[]) {
    return events.map((event) => ({
      ...event,
      committee: event.committee?.deleted_at ? null : event.committee,
      meeting: event.meeting?.deleted_at ? null : event.meeting,
      taskTemplates: event.taskTemplates ?? [],
      keyPeople: event.keyPeople ?? [],
      activatedTasks: event.activatedTasks ?? [],
    }));
  }

  private async withWorkItems(
    organizationId: string,
    events: AnnualWheelEventView[],
  ) {
    if (!events.length) return events;
    const eventIds = events.map((event) => event.id);
    const [templatesResult, keyPeopleResult, tasksResult] = await Promise.all([
      this.db
        .from("annual_wheel_task_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .in("annual_wheel_event_id", eventIds)
        .is("archived_at", null)
        .order("sort_order"),
      this.db
        .from("annual_wheel_key_people")
        .select("*")
        .eq("organization_id", organizationId)
        .in("annual_wheel_event_id", eventIds)
        .is("archived_at", null)
        .order("sort_order"),
      this.db
        .from("tasks")
        .select(
          "id,title,status,deadline,responsible_user_id,annual_wheel_event_id,annual_wheel_activation_year,annual_wheel_task_template_id,archived_at",
        )
        .eq("organization_id", organizationId)
        .in("annual_wheel_event_id", eventIds)
        .is("archived_at", null)
        .order("deadline", { ascending: true, nullsFirst: false }),
    ]);
    if (templatesResult.error) throw templatesResult.error;
    if (keyPeopleResult.error) throw keyPeopleResult.error;
    if (tasksResult.error) throw tasksResult.error;

    return events.map((event) => ({
      ...event,
      taskTemplates: (templatesResult.data ?? []).filter(
        (template) => template.annual_wheel_event_id === event.id,
      ),
      keyPeople: (keyPeopleResult.data ?? []).filter(
        (person) => person.annual_wheel_event_id === event.id,
      ),
      activatedTasks: (tasksResult.data ?? []).filter(
        (task) => task.annual_wheel_event_id === event.id,
      ),
    }));
  }
}

type AnnualWheelEventViewWithTrash = AnnualWheelEventView & {
  committee:
    | (NonNullable<AnnualWheelEventView["committee"]> & {
        deleted_at?: string | null;
      })
    | null;
  meeting:
    | (NonNullable<AnnualWheelEventView["meeting"]> & {
        deleted_at?: string | null;
      })
    | null;
};
