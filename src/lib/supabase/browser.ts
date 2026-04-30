import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

export function createClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createBrowserClient(env.url, env.anonKey);
}
