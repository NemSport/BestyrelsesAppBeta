export const config = {
  apiBaseUrl:
    process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
};

export function missingConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!config.supabaseAnonKey) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}
