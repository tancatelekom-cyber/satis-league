"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_PATH = "/admin/hedef-artisi";

function finish(message: string, type: "success" | "error" = "success", month = ""): never {
  redirect(`${REDIRECT_PATH}?${new URLSearchParams({ message, type, ...(month ? { month } : {}) })}`);
}

function parsePercent(value: FormDataEntryValue | undefined) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return 0;
  return Number(normalized);
}

export async function saveGoalTargetAdjustmentsAction(formData: FormData) {
  const actor = await requireAdminAccess();
  const periodMonth = String(formData.get("periodMonth") ?? "").trim();
  let successMessage = "Hedef artışları kaydedildi.";

  try {
    const storeCode = String(formData.get("storeCode") ?? "").trim();
    const categoryNames = formData.getAll("categoryName").map(String);
    const increaseValues = formData.getAll("increasePercent");

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth) || !storeCode) {
      throw new Error("Ay ve şube seçimi zorunludur.");
    }

    if (categoryNames.length !== increaseValues.length) {
      throw new Error("Kategori hedefleri eksik gönderildi. Sayfayı yenileyip tekrar deneyin.");
    }

    const adjustmentMap = new Map<string, number>();
    categoryNames.forEach((categoryName, index) => {
      const normalizedCategory = categoryName.trim();
      const increasePercent = parsePercent(increaseValues[index]);

      if (!normalizedCategory) {
        throw new Error("Kategori adı boş olamaz.");
      }
      if (!Number.isFinite(increasePercent) || increasePercent < 0 || increasePercent > 1000) {
        throw new Error(`${normalizedCategory} için artış oranı 0 ile 1000 arasında olmalıdır.`);
      }

      adjustmentMap.set(normalizedCategory, increasePercent);
    });

    const periodDate = `${periodMonth}-01`;
    const admin = createAdminClient();
    const { error: deleteError } = await admin
      .from("goal_store_target_adjustments")
      .delete()
      .eq("period_month", periodDate)
      .eq("store_code", storeCode);

    if (deleteError) throw new Error(`Eski hedef artışları temizlenemedi: ${deleteError.message}`);

    const rowsToInsert = Array.from(adjustmentMap.entries())
      .filter(([, increasePercent]) => increasePercent > 0)
      .map(([categoryName, increasePercent]) => ({
        period_month: periodDate,
        store_code: storeCode,
        category_name: categoryName,
        increase_percent: increasePercent,
        created_by: actor.profile.id,
        updated_at: new Date().toISOString()
      }));

    if (rowsToInsert.length) {
      const { error: insertError } = await admin.from("goal_store_target_adjustments").insert(rowsToInsert);
      if (insertError) throw new Error(`Hedef artışları kaydedilemedi: ${insertError.message}`);
    }

    revalidatePath("/", "layout");
    revalidatePath("/hedef-gerceklesen");
    revalidatePath(REDIRECT_PATH);
    successMessage = rowsToInsert.length
      ? `${storeCode} için ${rowsToInsert.length} kategori artışı kaydedildi.`
      : `${storeCode} için tüm hedef artışları kaldırıldı.`;
  } catch (error) {
    finish(error instanceof Error ? error.message : "Hedef artışları kaydedilemedi.", "error", periodMonth);
  }

  finish(successMessage, "success", periodMonth);
}
