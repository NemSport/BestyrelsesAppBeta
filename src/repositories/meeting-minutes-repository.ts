import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert, TableUpdate } from "@/types/database";
import type {
  AgendaItemMinutes,
  AgendaItemPrivateNote,
  MeetingMinutes,
} from "@/types/domain";

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

  async listPrivateAgendaItemNotes(meetingId: string, userId: string) {
    const { data, error } = await this.db
      .from("agenda_item_private_notes")
      .select("*")
      .eq("meeting_id", meetingId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data as AgendaItemPrivateNote[];
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

  async findPrivateAgendaItemNote(
    meetingId: string,
    agendaItemId: string,
    userId: string,
  ) {
    const { data, error } = await this.db
      .from("agenda_item_private_notes")
      .select("*")
      .eq("meeting_id", meetingId)
      .eq("agenda_item_id", agendaItemId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as AgendaItemPrivateNote | null;
  }

  async listByAgendaItem(agendaItemId: string) {
    const { data, error } = await this.db
      .from("agenda_item_minutes")
      .select("*, meetings(id, title, starts_at, deleted_at)")
      .eq("agenda_item_id", agendaItemId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (
      data as unknown as Array<
        AgendaItemMinutes & {
          meetings: {
            id: string;
            title: string;
            starts_at: string;
            deleted_at?: string | null;
          } | null;
        }
      >
    )
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
    expectedUpdatedAt?: string | null,
  ) {
    let query = this.db
      .from("meeting_minutes")
      .update(input)
      .eq("id", meetingMinutesId);
    if (expectedUpdatedAt) {
      query = query.eq("updated_at", expectedUpdatedAt);
    }
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return null;
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

  async createPrivateAgendaItemNote(
    input: TableInsert<"agenda_item_private_notes">,
  ) {
    const { data, error } = await this.db
      .from("agenda_item_private_notes")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateAgendaItemMinutes(
    agendaItemMinutesId: string,
    input: TableUpdate<"agenda_item_minutes">,
    expectedUpdatedAt?: string | null,
  ) {
    let query = this.db
      .from("agenda_item_minutes")
      .update(input)
      .eq("id", agendaItemMinutesId);
    if (expectedUpdatedAt) {
      query = query.eq("updated_at", expectedUpdatedAt);
    }
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data;
  }

  async updatePrivateAgendaItemNote(
    privateNoteId: string,
    input: TableUpdate<"agenda_item_private_notes">,
    expectedUpdatedAt?: string | null,
  ) {
    let query = this.db
      .from("agenda_item_private_notes")
      .update(input)
      .eq("id", privateNoteId);
    if (expectedUpdatedAt) {
      query = query.eq("updated_at", expectedUpdatedAt);
    }
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data;
  }
}
