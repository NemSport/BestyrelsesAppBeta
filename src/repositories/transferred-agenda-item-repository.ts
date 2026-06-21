import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { TransferredAgendaItem } from "@/types/domain";

export class TransferredAgendaItemRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listBySourceMeeting(meetingId: string) {
    const { data, error } = await this.db
      .from("transferred_agenda_items")
      .select("*")
      .eq("source_meeting_id", meetingId)
      .order("created_at");
    if (error) throw error;
    return data as TransferredAgendaItem[];
  }

  async listByTargetMeeting(meetingId: string) {
    const { data, error } = await this.db
      .from("transferred_agenda_items")
      .select("*")
      .eq("target_meeting_id", meetingId)
      .order("created_at");
    if (error) throw error;
    return data as TransferredAgendaItem[];
  }

  async listSourceMeetings(ids: string[]) {
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from("meetings")
      .select("id,title,starts_at")
      .in("id", ids);
    if (error) throw error;
    return data as Array<{ id: string; title: string; starts_at: string }>;
  }

  async listSourceAgendaItems(ids: string[]) {
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from("agenda_items")
      .select("id,title,item_type")
      .in("id", ids);
    if (error) throw error;
    return data as Array<{
      id: string;
      title: string;
      item_type: Database["public"]["Enums"]["agenda_item_type"];
    }>;
  }

  async listPendingBySourceMinutes(agendaItemMinutesId: string) {
    const { data, error } = await this.db
      .from("transferred_agenda_items")
      .select("*")
      .eq("source_agenda_item_minutes_id", agendaItemMinutesId)
      .eq("status", "pending");
    if (error) throw error;
    return data as TransferredAgendaItem[];
  }

  async findById(id: string) {
    const { data, error } = await this.db
      .from("transferred_agenda_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as TransferredAgendaItem | null;
  }

  async findBySourceRule(
    agendaItemMinutesId: string,
    sourceStatus: Database["public"]["Enums"]["agenda_item_minutes_status"],
    targetItemType: Database["public"]["Enums"]["agenda_item_type"],
  ) {
    const { data, error } = await this.db
      .from("transferred_agenda_items")
      .select("*")
      .eq("source_agenda_item_minutes_id", agendaItemMinutesId)
      .eq("source_status", sourceStatus)
      .eq("target_item_type", targetItemType)
      .maybeSingle();
    if (error) throw error;
    return data as TransferredAgendaItem | null;
  }

  async createIfMissing(input: TableInsert<"transferred_agenda_items">) {
    const { error } = await this.db
      .from("transferred_agenda_items")
      .upsert(input, {
        onConflict:
          "source_agenda_item_minutes_id,source_status,target_item_type",
        ignoreDuplicates: true,
      });
    if (error) throw error;
    return this.findBySourceRule(
      input.source_agenda_item_minutes_id,
      input.source_status,
      input.target_item_type,
    );
  }

  async deleteByIds(ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from("transferred_agenda_items")
      .delete()
      .in("id", ids);
    if (error) throw error;
  }

  async update(id: string, input: TableUpdate<"transferred_agenda_items">) {
    const { data, error } = await this.db
      .from("transferred_agenda_items")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as TransferredAgendaItem;
  }

  async schedule(id: string, meetingId: string | null) {
    const { data, error } = await this.db.rpc(
      "schedule_transferred_agenda_item",
      {
        target_transfer_id: id,
        requested_target_meeting_id: meetingId,
      },
    );
    if (error) throw error;
    return data as TransferredAgendaItem;
  }
}
