import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

type AdminAccessProfile = {
  id: string;
  role: string;
  approval: string;
};

export async function requireAdminAccess() {
  await requireUser();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, approval")
    .eq("id", user.id)
    .single();

  const safeProfile = profile as AdminAccessProfile | null;

  if (!safeProfile || safeProfile.approval !== "approved" || safeProfile.role !== "admin") {
    redirect("/hesabim");
  }

  return {
    user,
    profile: safeProfile
  };
}
