import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/server-env";
import type { Database } from "@/types/database";

export function createAdminClient() {
  const serverEnv = getServerEnv();
  return createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
