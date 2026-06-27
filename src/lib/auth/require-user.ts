import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { APP_SESSION_COOKIE, isAppSessionActive } from "@/lib/auth/app-session";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const cookieStore = await cookies();
  const hasAppSession = isAppSessionActive(cookieStore.get(APP_SESSION_COOKIE)?.value);

  if (!hasAppSession) {
    redirect("/giris");
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  return user;
}
