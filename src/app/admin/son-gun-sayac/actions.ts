"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/admin/son-gun-sayac";

function go(message: string, type: "success" | "error" = "success"): never {
  redirect(`${PATH}?${new URLSearchParams({ message, type })}`);
}

export async function createLastDayCounterAction(formData: FormData) {
  const { profile } = await requireAdminAccess();
  const categoryName = String(formData.get("categoryName") ?? "").trim();
  const scope = String(formData.get("scope") ?? "") === "store" ? "store" : "company";
  const storeId = scope === "store" ? String(formData.get("storeId") ?? "").trim() : null;
  const remainingCount = Number(formData.get("remainingCount"));
  const showOnHome = formData.get("showOnHome") === "on";

  if (!categoryName) go("Kategori adı girin.", "error");
  if (scope === "store" && !storeId) go("Mağaza seçin.", "error");
  if (!Number.isInteger(remainingCount) || remainingCount < 0) go("Geçerli bir kalan sayı girin.", "error");

  const admin = createAdminClient();
  const { error } = await admin.from("last_day_counters").insert({
    category_name: categoryName,
    scope,
    store_id: storeId,
    remaining_count: remainingCount,
    show_on_home: showOnHome,
    completed_at: remainingCount === 0 ? new Date().toISOString() : null,
    created_by: profile.id
  });
  if (error) go(`Sayaç eklenemedi: ${error.message}`, "error");
  revalidatePath("/");
  revalidatePath(PATH);
  go("Son gün sayacı eklendi.");
}

export async function toggleLastDayCounterVisibilityAction(formData: FormData) {
  await requireAdminAccess();
  const counterId = String(formData.get("counterId") ?? "").trim();
  const showOnHome = formData.get("showOnHome") === "true";
  const admin = createAdminClient();
  const { error } = await admin
    .from("last_day_counters")
    .update({ show_on_home: showOnHome, updated_at: new Date().toISOString() })
    .eq("id", counterId);
  if (error) go(`Görünürlük değiştirilemedi: ${error.message}`, "error");
  revalidatePath("/");
  revalidatePath(PATH);
  go(showOnHome ? "Sayaç ana ekranda gösteriliyor." : "Sayaç ana ekrandan gizlendi.");
}

export async function decrementLastDayCounterAction(formData: FormData) {
  await requireAdminAccess();
  const counterId = String(formData.get("counterId") ?? "").trim();
  const decrementBy = Number(formData.get("decrementBy") ?? 1);
  if (!counterId || !Number.isInteger(decrementBy) || decrementBy < 1) go("Geçerli bir düşüm miktarı girin.", "error");

  const admin = createAdminClient();
  const { data: counter } = await admin
    .from("last_day_counters")
    .select("remaining_count")
    .eq("id", counterId)
    .single<{ remaining_count: number }>();
  if (!counter) go("Sayaç bulunamadı.", "error");

  const remainingCount = Math.max(0, counter.remaining_count - decrementBy);
  const { error } = await admin
    .from("last_day_counters")
    .update({
      remaining_count: remainingCount,
      completed_at: remainingCount === 0 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", counterId)
    .eq("remaining_count", counter.remaining_count);
  if (error) go(`Düşüm yapılamadı: ${error.message}`, "error");
  revalidatePath("/");
  revalidatePath(PATH);
  go(remainingCount === 0 ? "Sayaç tamamlandı." : `Kalan sayı ${remainingCount}.`);
}

export async function deleteLastDayCounterAction(formData: FormData) {
  await requireAdminAccess();
  const counterId = String(formData.get("counterId") ?? "").trim();
  const admin = createAdminClient();
  const { error } = await admin.from("last_day_counters").delete().eq("id", counterId);
  if (error) go(`Sayaç silinemedi: ${error.message}`, "error");
  revalidatePath("/");
  revalidatePath(PATH);
  go("Sayaç silindi.");
}
