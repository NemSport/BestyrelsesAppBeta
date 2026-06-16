import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export class AuthRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getUser() {
    const { data, error } = await this.db.auth.getUser();
    if (error) {
      if (error.name === "AuthSessionMissingError") return null;
      throw error;
    }
    return data.user;
  }

  async getProfile(userId: string) {
    const { data, error } = await this.db
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
