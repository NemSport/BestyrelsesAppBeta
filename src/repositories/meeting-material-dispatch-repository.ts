import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert } from "@/types/database";

export class MeetingMaterialDispatchRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async create(input: TableInsert<"meeting_material_dispatches">) {
    const { data, error } = await this.db
      .from("meeting_material_dispatches")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async listByMeeting(meetingId: string) {
    const { data, error } = await this.db
      .from("meeting_material_dispatches")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("sent_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }

  async listProfiles(userIds: string[]) {
    if (!userIds.length) return [];
    const { data, error } = await this.db
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(userIds)]);
    if (error) throw error;
    return data;
  }
}
