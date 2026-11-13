import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TableRow } from "@/types/database";

type ApplyReply = Database["public"]["Functions"]["bestie_apply_reply"]["Args"];

export class BestieRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async list(organizationId: string, userId: string) {
    const { data, error } = await this.db
      .from("bestie_threads")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }

  async find(organizationId: string, userId: string, threadId: string) {
    const { data, error } = await this.db
      .from("bestie_threads")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("id", threadId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async markRead(thread: TableRow<"bestie_threads">) {
    const { error } = await this.db
      .from("bestie_threads")
      .update({ last_read_at: new Date().toISOString() })
      .eq("id", thread.id)
      .eq("user_id", thread.user_id)
      .eq("updated_at", thread.updated_at);
    if (error) throw error;
  }

  async applyReply(input: ApplyReply) {
    const { data, error } = await this.db.rpc("bestie_apply_reply", input);
    if (error) throw error;
    return data;
  }
}
