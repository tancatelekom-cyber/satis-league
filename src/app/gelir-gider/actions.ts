"use server";
import { revalidatePath } from "next/cache";
import { requireRevenueExpenseAccess } from "@/lib/auth/require-revenue-expense-access";
import { validateRevenueExpense } from "@/lib/revenue-expense-validation";
import { fetchLegacyRevenueExpenseRows } from "@/lib/revenue-expense";

export async function saveRevenueExpense(form: FormData) {
  const { supabase, user } = await requireRevenueExpenseAccess();
  try {
    const entry = validateRevenueExpense(form);
    const id = String(form.get("id") ?? "");
    if (id) {
      const { data, error } = await supabase.from("revenue_expense_entries").update({ ...entry, updated_by: user.id })
        .eq("id", id).eq("updated_at", String(form.get("updatedAt") ?? "")).select("id");
      if (error) throw new Error("Kayıt güncellenemedi. Veritabanı bağlantısını ve yetkinizi kontrol edin.");
      if (!data?.length) throw new Error("Kayıt başka biri tarafından değiştirildi. Sayfayı yenileyin.");
    } else {
      const requestId = String(form.get("requestId") ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Formu yenileyip tekrar deneyin.");
      const { error } = await supabase.from("revenue_expense_entries").upsert({ ...entry, id: requestId, created_by: user.id, updated_by: user.id }, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error("Kayıt eklenemedi. Veritabanı bağlantısını ve yetkinizi kontrol edin.");
    }
    revalidatePath("/gelir-gider");
    return { ok: true, message: "Kayıt veritabanına kaydedildi." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "İşlem tamamlanamadı." }; }
}

export async function importRevenueExpense() {
  const { supabase } = await requireRevenueExpenseAccess();
  try {
    const rows = await fetchLegacyRevenueExpenseRows();
    if (!rows.length) throw new Error("Google Sheets içinde aktarılacak kayıt bulunamadı.");
    const { error } = await supabase.rpc("import_revenue_expense", { entries: rows.map(row => ({ store_name: row.storeName, kind: row.kind, category: row.category, year: row.year, month: row.month, amount: row.amount })) });
    if (error) throw new Error("Aktarım tamamlanamadı veya eski kayıtlar daha önce aktarıldı. Sayfayı yenileyin.");
    revalidatePath("/gelir-gider");
    return { ok: true, message: `${rows.length} eski kayıt veritabanına aktarıldı.` };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Aktarım başarısız." }; }
}
