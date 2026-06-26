import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { AgendaItem, AgendaItemWithOccurrences } from "@/types/domain";

export class AgendaItemRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listByCommittee(committeeId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select(
        "*, agenda_item_occurrences(*, meetings(id, title, starts_at, status))",
      )
      .eq("committee_id", committeeId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as AgendaItemWithOccurrences[]).map(
      this.activeOccurrences,
    );
  }

  async listByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data as AgendaItem[];
  }

  async findWithHistory(agendaItemId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select(
        "*, agenda_item_occurrences(*, meetings(id, title, starts_at, status))",
      )
      .eq("id", agendaItemId)
      .is("deleted_at", null)
      .order("created_at", {
        referencedTable: "agenda_item_occurrences",
        ascending: false,
      })
      .maybeSingle();
    if (error) throw error;
    return data
      ? this.activeOccurrences(data as unknown as AgendaItemWithOccurrences)
      : null;
  }

  async findIncludingDeleted(agendaItemId: string) {
    const { data, error } = await this.db
      .from("agenda_items")
      .select("*")
      .eq("id", agendaItemId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(input: TableInsert<"agenda_items">) {
    const { data, error } = await this.db
      .from("agenda_items")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createWithOptionalMeeting(input: {
    organizationId: string;
    committeeId: string;
    title: string;
    description: string;
    objective: string;
    itemType: Database["public"]["Enums"]["agenda_item_type"];
    targetDate: string | null;
    meetingId: string | null;
  }) {
    const { data, error } = await this.db.rpc("create_agenda_item", {
      target_organization_id: input.organizationId,
      target_committee_id: input.committeeId,
      agenda_title: input.title,
      agenda_description: input.description,
      agenda_objective: input.objective,
      agenda_type: input.itemType,
      // Legacy database compatibility: lifecycle_status is no longer a user workflow.
      agenda_status: input.meetingId ? "scheduled" : "backlog",
      agenda_target_date: input.targetDate,
      target_meeting_id: input.meetingId,
    });
    if (error) throw error;
    return data;
  }

  async schedule(input: {
    organizationId: string;
    committeeId: string;
    agendaItemId: string;
    meetingId: string;
    durationMinutes: number | null;
  }) {
    const { data, error } = await this.db.rpc("schedule_agenda_item", {
      target_organization_id: input.organizationId,
      target_committee_id: input.committeeId,
      target_agenda_item_id: input.agendaItemId,
      target_meeting_id: input.meetingId,
      target_duration_minutes: input.durationMinutes,
    });
    if (error) throw error;
    return data;
  }

  async update(agendaItemId: string, input: TableUpdate<"agenda_items">) {
    const { data, error } = await this.db
      .from("agenda_items")
      .update(input)
      .eq("id", agendaItemId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async softDelete(agendaItemId: string) {
    const { data, error } = await this.db.rpc("soft_delete_agenda_item", {
      target_agenda_item_id: agendaItemId,
    });
    if (error) throw error;
    return data;
  }

  async restore(agendaItemId: string) {
    const { data, error } = await this.db.rpc("restore_agenda_item", {
      target_agenda_item_id: agendaItemId,
    });
    if (error) throw error;
    return data;
  }

  async softDeleteOccurrence(occurrenceId: string) {
    const { data, error } = await this.db.rpc(
      "soft_delete_agenda_item_occurrence",
      { target_occurrence_id: occurrenceId },
    );
    if (error) throw error;
    return data;
  }

  async restoreOccurrence(occurrenceId: string) {
    const { data, error } = await this.db.rpc(
      "restore_agenda_item_occurrence",
      { target_occurrence_id: occurrenceId },
    );
    if (error) throw error;
    return data;
  }

  async reorderOccurrence(occurrenceId: string, direction: "up" | "down") {
    const { data, error } = await this.db.rpc(
      "reorder_agenda_item_occurrence",
      {
        target_occurrence_id: occurrenceId,
        move_direction: direction,
      },
    );
    if (error) throw error;
    return data;
  }

  async reorderMeetingOccurrences(meetingId: string, occurrenceIds: string[]) {
    const { data, error } = await this.db.rpc(
      "reorder_agenda_item_occurrences",
      {
        target_meeting_id: meetingId,
        ordered_occurrence_ids: occurrenceIds,
      },
    );
    if (error) throw error;
    return data;
  }

  async findOccurrenceIncludingDeleted(occurrenceId: string) {
    const { data, error } = await this.db
      .from("agenda_item_occurrences")
      .select("*")
      .eq("id", occurrenceId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private activeOccurrences(item: AgendaItemWithOccurrences) {
    return {
      ...item,
      agenda_item_occurrences: item.agenda_item_occurrences.filter(
        (occurrence) => !occurrence.deleted_at,
      ),
    };
  }
}
