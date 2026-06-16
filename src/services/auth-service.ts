import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthenticationError } from "@/lib/errors";
import { AuthRepository } from "@/repositories/auth-repository";
import type { Database } from "@/types/database";

export class AuthService {
  private readonly auth: AuthRepository;

  constructor(db: SupabaseClient<Database>) {
    this.auth = new AuthRepository(db);
  }

  async requireUser() {
    const user = await this.auth.getUser();
    if (!user) throw new AuthenticationError();
    return user;
  }

  async getAuthenticatedUser() {
    const user = await this.requireUser();
    return {
      user,
      profile: await this.auth.getProfile(user.id),
    };
  }
}