import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type { AgendaItemMinutes, MeetingMinutes } from "@/types/domain";

export class MeetingMinutesRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findMeetingMinutes(meetingId: string) {
    const { data, error } = await this.db
      .from("meeting_minutes")
      .select("*")
      .eq("meeting_id", meetingId)
      .maybeSingle();
    if (error) throw error;
    return data as MeetingMinutes | null;
  }

  async listAgendaItemMinutes(meetingId: string) {
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at");
    if (error) throw error;
    return data as AgendaItemMinutes[];
  }

  async findAgendaItemMinutes(meetingId: string, agendaItemId: string) {
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .select("*")
      .eq("meeting_id", meetingId)
      .eq("agenda_item_id", agendaItemId)
      .maybeSingle();
    if (error) throw error;
    return data as AgendaItemMinutes | null;
  }

  async listByAgendaItem(agendaItemId: string) {
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .select("*, meetings(id, title, starts_at, deleted_at)")
      .eq("agenda_item_id", agendaItemId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as Array<
      AgendaItemMinutes & {
        meetings:
          | {
              id: string;
              title: string;
              starts_at: string;
              deleted_at?: string | null;
            }
          | null;
      }
    >)
      .filter((minutes) => !minutes.meetings?.deleted_at)
      .map((minutes) => ({
        ...minutes,
        meetings: minutes.meetings
          ? {
              id: minutes.meetings.id,
              title: minutes.meetings.title,
              starts_at: minutes.meetings.starts_at,
            }
          : null,
      }));
  }

  async createMeetingMinutes(input: TableInsert<"meeting_minutes">) {
    const { data, error } = await this.db
      .from("meeting_minutes")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateMeetingMinutes(
    meetingMinutesId: string,
    input: TableUpdate<"meeting_minutes">,
  ) {
    const { data, error } = await this.db
      .from("meeting_minutes")
      .update(input)
      .eq("id", meetingMinutesId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createAgendaItemMinutes(input: TableInsert<"agenda_item_minutes">) {
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateAgendaItemMinutes(
    agendaItemMinutesId: string,
    input: TableUpdate<"agenda_item_minutes">,
  ) {
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .update(input)
      .eq("id", agendaItemMinutesId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
