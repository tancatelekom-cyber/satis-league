import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

export type DailyTargetAccessProfile = {
  id: string;
  full_name: string;
  role: UserRole;
  approval: string;
  store_id: string | null;
};

export async function requireDailyTargetAccess() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, role, approval, store_id")
    .eq("id", user.id)
    .single();
  const safeProfile = profile as DailyTargetAccessProfile | null;

  if (
    !safeProfile ||
    safeProfile.approval !== "approved" ||
    !["manager", "management", "admin"].includes(safeProfile.role)
  ) {
    redirect("/");
  }

  return { user, profile: safeProfile };
}
