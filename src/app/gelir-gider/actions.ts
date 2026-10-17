"use server";
import { revalidatePath } from "next/cache";
import { requireRevenueExpenseWriteAccess } from "@/lib/auth/require-revenue-expense-access";
import { validateRevenueExpense } from "@/lib/revenue-expense-validation";

export async function autosaveRevenueExpense(form: FormData) {
  const { supabase } = await requireRevenueExpenseWriteAccess();
  try {
    const entry = validateRevenueExpense(form);
    const { data, error } = await supabase.rpc("save_revenue_expense_cell", {
      p_store: entry.store_name, p_kind: entry.kind, p_category: entry.category,
      p_year: entry.year, p_month: entry.month, p_amount: entry.amount,
      p_expected: String(form.get("updatedAt") ?? "") || null
    });
    if (error) return { ok: false as const, message: error.message.includes("REVENUE_CONFLICT") ? "Kayıt başka bir oturumda değişti. Sayfayı yenileyip tekrar girin." : "Kaydedilemedi. Bağlantıyı ve veri giriş yetkinizi kontrol edin." };
    revalidatePath("/gelir-gider");
    return { ok: true as const, message: "Kaydedildi", row: data as { id: string; updated_at: string; amount: number } };
  } catch (error) {return {ok:false as const, message:error instanceof Error ? error.message : "Kaydedilemedi."};}
}
