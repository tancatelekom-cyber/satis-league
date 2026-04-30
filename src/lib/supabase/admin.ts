import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "@/lib/supabase/config";

export function createAdminClient() {
  const env = getSupabaseAdminEnv();

  if (!env) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
