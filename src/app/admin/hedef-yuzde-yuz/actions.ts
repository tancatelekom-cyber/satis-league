"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_PATH = "/admin/hedef-yuzde-yuz";

function finish(message: string, type: "success" | "error" = "success", month = ""): never {
  redirect(`${REDIRECT_PATH}?${new URLSearchParams({ message, type, ...(month ? { month } : {}) })}`);
}

export async function saveGoalFullAchievementAction(formData: FormData) {
  const actor = await requireAdminAccess();
  const periodMonth = String(formData.get("periodMonth") ?? "").trim();
  let successMessage = "Ayarlar kaydedildi.";

  try {
    const storeCode = String(formData.get("storeCode") ?? "").trim();
    const categories = Array.from(
      new Set(formData.getAll("categories").map(String).map((value) => value.trim()).filter(Boolean))
    );

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth) || !storeCode) {
      throw new Error("Ay ve şube seçimi zorunludur.");
    }

    const admin = createAdminClient();
    const periodDate = `${periodMonth}-01`;
    const { error: deleteError } = await admin
      .from("goal_store_full_achievement_overrides")
      .delete()
      .eq("period_month", periodDate)
      .eq("store_code", storeCode);

    if (deleteError) throw new Error(`Eski ayarlar temizlenemedi: ${deleteError.message}`);

    if (categories.length) {
      const { error: insertError } = await admin.from("goal_store_full_achievement_overrides").insert(
        categories.map((categoryName) => ({
          period_month: periodDate,
          store_code: storeCode,
          category_name: categoryName,
          created_by: actor.profile.id,
          updated_at: new Date().toISOString()
        }))
      );
      if (insertError) throw new Error(`Ayarlar kaydedilemedi: ${insertError.message}`);
    }

    revalidatePath("/", "layout");
    revalidatePath("/hedef-gerceklesen");
    revalidatePath(REDIRECT_PATH);
    successMessage = categories.length ? "%100 sayılacak kategoriler kaydedildi." : "Şubenin %100 ayarları kaldırıldı.";
  } catch (error) {
    finish(error instanceof Error ? error.message : "Ayarlar kaydedilemedi.", "error", periodMonth);
  }

  finish(successMessage, "success", periodMonth);
}
