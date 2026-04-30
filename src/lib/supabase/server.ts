import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

export async function createClient() {
  const cookieStore = await cookies();
  type CookieInput = {
    name: string;
    value: string;
    options?: Parameters<typeof cookieStore.set>[2];
  };
  const env = getSupabasePublicEnv();

  if (!env) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieInput[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot mutate cookies directly.
            // Middleware handles session refresh writes for these requests.
          }
        }
      }
    }
  );
}
