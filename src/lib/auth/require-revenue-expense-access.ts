import { isRevenueExpenseEditor } from "@/lib/revenue-expense-permissions";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";

export async function requireRevenueExpenseAccess() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("role, approval").eq("id", user.id).single();
  if (error || !profile || profile.approval !== "approved") {
    throw new Error("Gelir-gider erişim yetkiniz yok.");
  }
  const access = await getResolvedFeatureAccessForProfile("gelir-gider", user.id, profile.role);
  if (!access.allowed) throw new Error("Gelir-gider erişim yetkiniz yok.");
  return { user, supabase };
}

export async function requireRevenueExpenseWriteAccess() {
  const context = await requireRevenueExpenseAccess();
  if (!isRevenueExpenseEditor(context.user.id)) throw new Error("Veri girişi yetkiniz yok.");
  return context;
}
