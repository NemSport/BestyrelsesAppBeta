import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert } from "@/types/database";

export class ActionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listPersonalStates(organizationId: string, userId: string) {
    const { data, error } = await this.db
      .from("action_user_states")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async upsertPersonalState(
    input: TableInsert<"action_user_states">,
  ) {
    const { data, error } = await this.db
      .from("action_user_states")
      .upsert(input, {
        onConflict: "organization_id,user_id,action_key",
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
