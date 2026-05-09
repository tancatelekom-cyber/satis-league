import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const cookieStore = await cookies();
  const hasAppSession = cookieStore.get("tanca_session")?.value === "active";

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
