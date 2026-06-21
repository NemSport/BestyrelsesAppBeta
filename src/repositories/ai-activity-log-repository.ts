import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert } from "@/types/database";

export class AiActivityLogRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async create(input: TableInsert<"ai_activity_log">) {
    const { data, error } = await this.db
      .from("ai_activity_log")
      .insert(input)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async updateStatus(
    activityId: string,
    userId: string,
    status: "applied" | "dismissed",
  ) {
    const update =
      status === "applied"
        ? { status, applied_at: new Date().toISOString() }
        : { status, dismissed_at: new Date().toISOString() };
    const { data, error } = await this.db
      .from("ai_activity_log")
      .update(update)
      .eq("id", activityId)
      .eq("user_id", userId)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
}
