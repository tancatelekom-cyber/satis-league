"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDailyTargetAccess } from "@/lib/auth/require-daily-target-access";
import {
  buildDailyTargetInputName,
  fetchDailyTargetDefinitions,
  getIstanbulDateKey,
  normalizeDailyTargetKey
} from "@/lib/daily-targets";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_PATH = "/gunluk-hedefler";

function redirectWithMessage(
  message: string,
  type: "success" | "error",
  storeId?: string
): never {
  const params = new URLSearchParams({ message, type });
  if (storeId) params.set("store", storeId);
  redirect(`${PAGE_PATH}?${params.toString()}`);
}

function parseActual(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

export type DailyTargetAutoSaveInput = {
  storeId: string;
  mainCategory: string;
  subCategory: string;
  actual: string;
};

export type DailyTargetAutoSaveResult = {
  ok: boolean;
  message: string;
};

export async function saveDailyTargetActualAction(
  input: DailyTargetAutoSaveInput
): Promise<DailyTargetAutoSaveResult> {
  const { profile } = await requireDailyTargetAccess();

  if (profile.role === "management") {
    return { ok: false, message: "Yönetici rolü yalnızca görüntüleme yapabilir." };
  }

  const requestedStoreId = String(input.storeId ?? "").trim();
  const storeId = profile.role === "manager" ? profile.store_id ?? "" : requestedStoreId;
  if (!storeId) {
    return { ok: false, message: "Satış girişi yapılacak şube bulunamadı." };
  }

  const actual = parseActual(String(input.actual ?? ""));
  if (actual === null) {
    return { ok: false, message: "Sıfır veya daha büyük geçerli bir değer girin." };
  }

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name, is_active")
    .eq("id", storeId)
    .eq("is_active", true)
    .single();

  if (!store || (profile.role === "manager" && store.id !== profile.store_id)) {
    return { ok: false, message: "Bu şube için satış girişi yetkiniz yok." };
  }

  let definitions: Awaited<ReturnType<typeof fetchDailyTargetDefinitions>>;
  try {
    definitions = await fetchDailyTargetDefinitions();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Günlük hedef Sheet'i okunamadı."
    };
  }

  const branchKey = normalizeDailyTargetKey(store.name);
  const mainCategoryKey = normalizeDailyTargetKey(input.mainCategory);
  const subCategoryKey = normalizeDailyTargetKey(input.subCategory);
  const definition = definitions.find(
    (row) => row.entryMode === "editable"
      && normalizeDailyTargetKey(row.branchName) === branchKey
      && normalizeDailyTargetKey(row.mainCategory) === mainCategoryKey
      && normalizeDailyTargetKey(row.subCategory) === subCategoryKey
  );

  if (!definition) {
    return { ok: false, message: "Bu kategori için giriş yetkisi bulunamadı." };
  }

  const entryDate = getIstanbulDateKey();
  const { error } = await admin.from("daily_target_entries").upsert({
    entry_date: entryDate,
    store_id: storeId,
    main_category: definition.mainCategory,
    sub_category: definition.subCategory,
    actual,
    entered_by: profile.id,
    updated_at: new Date().toISOString()
  }, { onConflict: "entry_date,store_id,main_category,sub_category" });

  if (error) {
    const setupHint = error.code === "42P01" || error.message.toLowerCase().includes("daily_target_entries")
      ? " Önce günlük hedefler Supabase SQL kodunu çalıştırın."
      : "";
    return { ok: false, message: `Kaydedilemedi: ${error.message}.${setupHint}` };
  }

  revalidatePath(PAGE_PATH);
  return { ok: true, message: "Kaydedildi" };
}

export async function saveDailyTargetActualsAction(formData: FormData) {
  const { profile } = await requireDailyTargetAccess();
  const requestedStoreId = String(formData.get("storeId") ?? "").trim();

  if (profile.role === "management") {
    redirectWithMessage("Yönetici rolü bu ekranda yalnızca görüntüleme yapabilir.", "error", requestedStoreId);
  }

  const storeId = profile.role === "manager" ? profile.store_id ?? "" : requestedStoreId;
  if (!storeId) {
    redirectWithMessage("Satış girişi yapılacak şube bulunamadı.", "error", requestedStoreId);
  }

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name, is_active")
    .eq("id", storeId)
    .eq("is_active", true)
    .single();

  if (!store || (profile.role === "manager" && store.id !== profile.store_id)) {
    redirectWithMessage("Bu şube için satış girişi yetkiniz yok.", "error", requestedStoreId);
  }

  let definitions: Awaited<ReturnType<typeof fetchDailyTargetDefinitions>>;
  try {
    definitions = await fetchDailyTargetDefinitions();
  } catch (error) {
    redirectWithMessage(
      error instanceof Error ? error.message : "Günlük hedef Sheet'i okunamadı.",
      "error",
      storeId
    );
  }

  const branchKey = normalizeDailyTargetKey(store.name);
  const editableRows = definitions.filter(
    (row) => row.entryMode === "editable" && normalizeDailyTargetKey(row.branchName) === branchKey
  );

  if (!editableRows.length) {
    redirectWithMessage(`${store.name} için Sheet üzerinde günlük hedef satırı bulunamadı.`, "error", storeId);
  }

  const entryDate = getIstanbulDateKey();
  const records = editableRows.map((row) => {
    const actual = parseActual(formData.get(buildDailyTargetInputName(row.mainCategory, row.subCategory)));
    return { row, actual };
  });
  const invalidRow = records.find((item) => item.actual === null);

  if (invalidRow) {
    redirectWithMessage(
      `${invalidRow.row.subCategory} için sıfır veya daha büyük geçerli bir gerçekleşen girin.`,
      "error",
      storeId
    );
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("daily_target_entries").upsert(
    records.map(({ row, actual }) => ({
      entry_date: entryDate,
      store_id: storeId,
      main_category: row.mainCategory,
      sub_category: row.subCategory,
      actual: actual ?? 0,
      entered_by: profile.id,
      updated_at: now
    })),
    { onConflict: "entry_date,store_id,main_category,sub_category" }
  );

  if (error) {
    const setupHint = error.code === "42P01" || error.message.toLowerCase().includes("daily_target_entries")
      ? " Önce günlük hedefler Supabase SQL kodunu çalıştırın."
      : "";
    redirectWithMessage(`Gerçekleşenler kaydedilemedi: ${error.message}.${setupHint}`, "error", storeId);
  }

  revalidatePath(PAGE_PATH);
  redirectWithMessage(`${store.name} günlük gerçekleşenleri kaydedildi.`, "success", storeId);
}
