"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDateTimeToIso } from "@/lib/campaign-utils";

const allowedAdminRedirects = new Set([
  "/admin",
  "/admin/sezonlar",
  "/admin/sezon-satislari",
  "/admin/kampanyalar",
  "/admin/tarifeler",
  "/admin/magazalar",
  "/admin/onaylar",
  "/admin/siralama"
]);

function getRedirectTo(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/admin").trim();
  return allowedAdminRedirects.has(redirectTo) ? redirectTo : "/admin";
}

function redirectWithMessage(
  message: string,
  type: "success" | "error" = "success",
  redirectTo = "/admin",
  extraParams?: Record<string, string>
) {
  const params = new URLSearchParams({ message, type });
  if (extraParams) {
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
  }
  redirect(`${redirectTo}?${params.toString()}`);
}

function normalizeMonthInput(rawValue: string) {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return null;
}

function getMonthRange(monthDate: string) {
  const [year, month] = monthDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));

  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: next.toISOString().slice(0, 10),
    monthKey: monthDate.slice(0, 7)
  };
}

function parseProducts(rawProducts: string) {
  return rawProducts
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, points, unit] = line.split("|").map((part) => part.trim());

      return {
        name,
        base_points: Number(points || "1"),
        unit_label: unit || "adet",
        sort_order: index
      };
    })
    .filter((product) => product.name);
}

function parseSeasonProducts(rawProducts: string) {
  return rawProducts
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      const [name, maybeCategory, maybePoints, maybeUnit] = parts;
      const hasCategory = parts.length >= 4;
      const category = hasCategory ? maybeCategory : "Genel";
      const points = hasCategory ? maybePoints : maybeCategory;
      const unit = hasCategory ? maybeUnit : maybePoints;

      return {
        name,
        category_name: category || "Genel",
        base_points: Number(points || "1"),
        unit_label: unit || "adet",
        sort_order: index
      };
    })
    .filter((product) => product.name);
}

async function parseStoreMultipliers(rawMultipliers: string) {
  const rows = rawMultipliers
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [storeName, multiplier] = line.split("|").map((part) => part.trim());
      return {
        storeName,
        multiplier: Number(multiplier || "1")
      };
    })
    .filter((row) => row.storeName);

  if (rows.length === 0) {
    return [];
  }

  const supabase = createAdminClient();
  const { data: stores } = await supabase.from("stores").select("id, name");
  const storeRows = stores ?? [];

  return rows.map((row) => {
    const matchedStore = storeRows.find(
      (store) => store.name.toLocaleLowerCase("tr-TR") === row.storeName.toLocaleLowerCase("tr-TR")
    );

    if (!matchedStore) {
      throw new Error(`Magaza bulunamadi: ${row.storeName}`);
    }

    return {
      store_id: matchedStore.id,
      multiplier: Number.isFinite(row.multiplier) ? row.multiplier : 1
    };
  });
}

async function calculateEmployeeSeasonSale(input: {
  seasonId: string;
  productId: string;
  targetProfileId: string;
  quantity: number;
}) {
  const supabase = createAdminClient();
  const [{ data: season }, { data: product }, { data: targetProfile }] =
    await Promise.all([
      supabase.from("seasons").select("mode, scoring").eq("id", input.seasonId).single(),
      supabase
        .from("season_products")
        .select("id, name, base_points")
        .eq("id", input.productId)
        .eq("season_id", input.seasonId)
        .single(),
      supabase.from("profiles").select("id, store_id").eq("id", input.targetProfileId).single()
    ]);

  if (!season || season.mode !== "employee" || !product || !targetProfile) {
    throw new Error("Bu sezon icin calisan satis girisi uygun degil.");
  }

  const { data: storeMultiplierRow } = targetProfile.store_id
    ? await supabase
        .from("season_store_multipliers")
        .select("multiplier")
        .eq("season_id", input.seasonId)
        .eq("store_id", targetProfile.store_id)
        .maybeSingle()
    : { data: null };

  const rawScore =
    season.scoring === "points" ? input.quantity * Number(product.base_points ?? 1) : input.quantity;
  const weightedScore = rawScore * Number(storeMultiplierRow?.multiplier ?? 1);

  return {
    productId: product.id,
    productName: product.name,
    rawScore,
    weightedScore
  };
}

async function calculateStoreSeasonSale(input: {
  seasonId: string;
  productId: string;
  targetStoreId: string;
  quantity: number;
}) {
  const supabase = createAdminClient();
  const [{ data: season }, { data: product }, { data: storeMultiplierRow }] = await Promise.all([
    supabase.from("seasons").select("mode, scoring").eq("id", input.seasonId).single(),
    supabase
      .from("season_products")
      .select("id, name, base_points")
      .eq("id", input.productId)
      .eq("season_id", input.seasonId)
      .single(),
    supabase
      .from("season_store_multipliers")
      .select("multiplier")
      .eq("season_id", input.seasonId)
      .eq("store_id", input.targetStoreId)
      .maybeSingle()
  ]);

  if (!season || season.mode !== "store" || !product) {
    throw new Error("Bu sezon icin magaza satis girisi uygun degil.");
  }

  const rawScore =
    season.scoring === "points" ? input.quantity * Number(product.base_points ?? 1) : input.quantity;
  const weightedScore = rawScore * Number(storeMultiplierRow?.multiplier ?? 1);

  return {
    productId: product.id,
    productName: product.name,
    rawScore,
    weightedScore
  };
}

async function calculateCampaignSaleForEntry(input: {
  campaignId: string;
  productId: string;
  actorProfileId: string;
  targetProfileId: string | null;
  targetStoreId: string | null;
  quantity: number;
}) {
  const supabase = createAdminClient();
  const [{ data: campaign }, { data: product }, { data: actorProfile }] = await Promise.all([
    supabase.from("campaigns").select("mode, scoring").eq("id", input.campaignId).single(),
    supabase
      .from("campaign_products")
      .select("id, name, base_points")
      .eq("id", input.productId)
      .eq("campaign_id", input.campaignId)
      .single(),
    supabase.from("profiles").select("id, store_id").eq("id", input.actorProfileId).single()
  ]);

  if (!campaign || !product || !actorProfile) {
    throw new Error("Kampanya satis kaydi yeniden hesaplanamadi.");
  }

  const multiplierStoreId = actorProfile.store_id ?? input.targetStoreId;
  const profileMultiplierTarget = input.targetProfileId ?? input.actorProfileId;

  const [{ data: storeMultiplierRow }, { data: profileMultiplierRow }] = await Promise.all([
    multiplierStoreId
      ? supabase
          .from("campaign_store_multipliers")
          .select("multiplier")
          .eq("campaign_id", input.campaignId)
          .eq("store_id", multiplierStoreId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("campaign_profile_multipliers")
      .select("multiplier")
      .eq("campaign_id", input.campaignId)
      .eq("profile_id", profileMultiplierTarget)
      .maybeSingle()
  ]);

  const storeMultiplier = Number(storeMultiplierRow?.multiplier ?? 1);
  const profileMultiplier = Number(profileMultiplierRow?.multiplier ?? 1);
  const rawScore =
    campaign.scoring === "points" ? input.quantity * Number(product.base_points ?? 1) : input.quantity;
  const weightedScore = rawScore * storeMultiplier * profileMultiplier;

  return {
    rawScore,
    weightedScore
  };
}

function refreshCampaignPages() {
  revalidatePath("/admin");
  revalidatePath("/kampanyalar");
  revalidatePath("/bildirimler");
  revalidatePath("/lig");
  revalidatePath("/magaza-vs-magaza");
}

async function broadcastNotification(input: {
  title: string;
  body: string;
  linkPath?: string;
  level?: string;
  profileIds?: string[];
}) {
  const supabase = createAdminClient();
  const profileIds =
    input.profileIds ??
    (
      await supabase
        .from("profiles")
        .select("id")
        .eq("approval", "approved")
    ).data?.map((row) => row.id) ??
    [];

  if (profileIds.length === 0) {
    return;
  }

  await supabase.from("notifications").insert(
    profileIds.map((profileId) => ({
      profile_id: profileId,
      title: input.title,
      body: input.body,
      level: input.level ?? "info",
      link_path: input.linkPath ?? null
    }))
  );
}

export async function createStoreAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const baseMultiplierValue = String(formData.get("baseMultiplier") ?? "1").trim();
  const baseMultiplier = Number(baseMultiplierValue || "1");

  if (!name) {
    redirectWithMessage("Magaza adi bos olamaz.", "error", redirectTo);
  }

  const { error } = await supabase.from("stores").insert({
    name,
    city: city || null,
    base_multiplier: Number.isFinite(baseMultiplier) ? baseMultiplier : 1,
    is_active: true
  });

  if (error) {
    redirectWithMessage(`Magaza eklenemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/kayit");
  redirectWithMessage("Magaza basariyla eklendi.", "success", redirectTo);
}

export async function createSeasonAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const seasonProducts = parseSeasonProducts(String(formData.get("seasonProducts") ?? ""));
  const mode = String(formData.get("mode") ?? "employee");
  const scoring = String(formData.get("scoring") ?? "points");
  const rewardTitle = String(formData.get("rewardTitle") ?? "").trim();
  const rewardDetails = String(formData.get("rewardDetails") ?? "").trim();
  const rewardFirst = String(formData.get("rewardFirst") ?? "").trim();
  const rewardSecond = String(formData.get("rewardSecond") ?? "").trim();
  const rewardThird = String(formData.get("rewardThird") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "") === "on";
  let storeMultipliers: Array<{ store_id: string; multiplier: number }> = [];

  if (!name || !startDate || !endDate) {
    redirectWithMessage("Sezon icin ad, baslangic ve bitis tarihleri zorunlu.", "error", redirectTo);
  }

  if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
    redirectWithMessage("Sezon bitis tarihi baslangic tarihinden sonra olmali.", "error", redirectTo);
  }

  if (seasonProducts.length === 0) {
    redirectWithMessage("En az bir sezon urunu girmelisiniz.", "error", redirectTo);
  }

  try {
    storeMultipliers = await parseStoreMultipliers(
      String(formData.get("seasonStoreMultipliers") ?? "").trim()
    );
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Sezon magaza carpanlari okunamadi.", "error", redirectTo);
  }

  const { data: season, error } = await supabase
    .from("seasons")
    .insert({
      name,
      description: description || null,
      start_date: startDate,
      end_date: endDate,
      mode,
      scoring,
      season_products: seasonProducts.map((item) => item.name),
      reward_title: rewardTitle || null,
      reward_details: rewardDetails || null,
      reward_first: rewardFirst || null,
      reward_second: rewardSecond || null,
      reward_third: rewardThird || null,
      is_active: isActive
    })
    .select("id")
    .single();

  if (error || !season) {
    redirectWithMessage(`Sezon olusturulamadi: ${error?.message ?? "Bilinmeyen hata"}`, "error", redirectTo);
  }

  const seasonRow = season!;

  if (seasonProducts.length > 0) {
    const { error: productError } = await supabase.from("season_products").insert(
      seasonProducts.map((product) => ({
        ...product,
        season_id: seasonRow.id
      }))
    );

    if (productError) {
      redirectWithMessage(`Sezon urunleri eklenemedi: ${productError.message}`, "error", redirectTo);
    }
  }

  if (storeMultipliers.length > 0) {
    const { error: multiplierError } = await supabase.from("season_store_multipliers").insert(
      storeMultipliers.map((item) => ({
        ...item,
        season_id: seasonRow.id
      }))
    );

    if (multiplierError) {
      redirectWithMessage(`Sezon magaza carpanlari eklenemedi: ${multiplierError.message}`, "error", redirectTo);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon basariyla olusturuldu.", "success", redirectTo);
}

export async function updateSeasonAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const seasonProducts = parseSeasonProducts(String(formData.get("seasonProducts") ?? ""));
  const mode = String(formData.get("mode") ?? "employee");
  const scoring = String(formData.get("scoring") ?? "points");
  const rewardTitle = String(formData.get("rewardTitle") ?? "").trim();
  const rewardDetails = String(formData.get("rewardDetails") ?? "").trim();
  const rewardFirst = String(formData.get("rewardFirst") ?? "").trim();
  const rewardSecond = String(formData.get("rewardSecond") ?? "").trim();
  const rewardThird = String(formData.get("rewardThird") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "") === "on";
  let storeMultipliers: Array<{ store_id: string; multiplier: number }> = [];

  if (!seasonId || !name || !startDate || !endDate) {
    redirectWithMessage("Sezon guncelleme icin gerekli alanlar eksik.", "error", redirectTo);
  }

  if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
    redirectWithMessage("Sezon bitis tarihi baslangic tarihinden sonra olmali.", "error", redirectTo);
  }

  if (seasonProducts.length === 0) {
    redirectWithMessage("En az bir sezon urunu girmelisiniz.", "error", redirectTo);
  }

  try {
    storeMultipliers = await parseStoreMultipliers(
      String(formData.get("seasonStoreMultipliers") ?? "").trim()
    );
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Sezon magaza carpanlari okunamadi.", "error", redirectTo);
  }

  const { error } = await supabase
    .from("seasons")
    .update({
      name,
      description: description || null,
      start_date: startDate,
      end_date: endDate,
      mode,
      scoring,
      season_products: seasonProducts.map((item) => item.name),
      reward_title: rewardTitle || null,
      reward_details: rewardDetails || null,
      reward_first: rewardFirst || null,
      reward_second: rewardSecond || null,
      reward_third: rewardThird || null,
      is_active: isActive
    })
    .eq("id", seasonId);

  if (error) {
    redirectWithMessage(`Sezon guncellenemedi: ${error.message}`, "error", redirectTo);
  }

  await supabase.from("season_products").delete().eq("season_id", seasonId);
  await supabase.from("season_store_multipliers").delete().eq("season_id", seasonId);

  if (seasonProducts.length > 0) {
    const { error: productError } = await supabase.from("season_products").insert(
      seasonProducts.map((product) => ({
        ...product,
        season_id: seasonId
      }))
    );

    if (productError) {
      redirectWithMessage(`Sezon urunleri guncellenemedi: ${productError.message}`, "error", redirectTo);
    }
  }

  if (storeMultipliers.length > 0) {
    const { error: multiplierError } = await supabase.from("season_store_multipliers").insert(
      storeMultipliers.map((item) => ({
        ...item,
        season_id: seasonId
      }))
    );

    if (multiplierError) {
      redirectWithMessage(`Sezon magaza carpanlari guncellenemedi: ${multiplierError.message}`, "error", redirectTo);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon guncellendi.", "success", redirectTo);
}

export async function toggleSeasonStatusAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const currentValue = String(formData.get("isActive") ?? "false") === "true";

  if (!seasonId) {
    redirectWithMessage("Sezon secilemedi.", "error", redirectTo);
  }

  if (currentValue) {
    const { error } = await supabase.from("seasons").update({ is_active: false }).eq("id", seasonId);

    if (error) {
      redirectWithMessage(`Sezon pasife alinamadi: ${error.message}`, "error", redirectTo);
    }
  } else {
    const { error } = await supabase.from("seasons").update({ is_active: true }).eq("id", seasonId);

    if (error) {
      redirectWithMessage(`Sezon aktif yapilamadi: ${error.message}`, "error", redirectTo);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage(
    currentValue ? "Sezon pasife alindi." : "Sezon aktif yapildi. Diger sezonlar aktif kalabilir.",
    "success",
    redirectTo
  );
}

export async function deleteSeasonAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();

  const { error } = await supabase.from("seasons").delete().eq("id", seasonId);

  if (error) {
    redirectWithMessage(`Sezon silinemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon silindi.", "success", redirectTo);
}

export async function createSeasonEmployeeSaleAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const targetProfileId = String(formData.get("targetProfileId") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "1"));
  const entryDate = String(formData.get("entryDate") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!seasonId || !productId || !targetProfileId) {
    redirectWithMessage("Sezon satis girisi icin sezon, urun ve calisan secilmeli.", "error", redirectTo);
  }

  const [{ data: season }, { data: product }, { data: targetProfile }] =
    await Promise.all([
      supabase.from("seasons").select("mode, scoring").eq("id", seasonId).single(),
      supabase
        .from("season_products")
        .select("id, name, base_points")
        .eq("id", productId)
        .eq("season_id", seasonId)
        .single(),
      supabase.from("profiles").select("id, store_id").eq("id", targetProfileId).single()
    ]);

  if (!season || season.mode !== "employee" || !product || !targetProfile) {
    redirectWithMessage("Bu sezon icin calisan satis girisi uygun degil.", "error", redirectTo);
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirectWithMessage("Miktar en az 1 olmali.", "error", redirectTo);
  }

  if (!entryDate) {
    redirectWithMessage("Satis tarihi secmelisiniz.", "error", redirectTo);
  }

  const safeTargetProfile = targetProfile!;
  const sale = await calculateEmployeeSeasonSale({
    seasonId,
    productId,
    targetProfileId,
    quantity
  });

  const { error } = await supabase.from("season_sales_entries").insert({
    season_id: seasonId,
    product_id: sale.productId,
    product_name: sale.productName,
    entry_date: entryDate,
    target_profile_id: targetProfileId,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    raw_score: sale.rawScore,
    score: sale.weightedScore,
    note: note || null
  });

  if (error) {
    redirectWithMessage(`Sezon calisan satisi eklenemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon icin calisan satisi eklendi.", "success", redirectTo);
}

export async function createSeasonStoreSaleAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const targetStoreId = String(formData.get("targetStoreId") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "1"));
  const entryDate = String(formData.get("entryDate") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!seasonId || !productId || !targetStoreId) {
    redirectWithMessage("Sezon satis girisi icin sezon, urun ve magaza secilmeli.", "error", redirectTo);
  }

  const [{ data: season }, { data: product }, { data: storeMultiplierRow }] = await Promise.all([
    supabase.from("seasons").select("mode, scoring").eq("id", seasonId).single(),
    supabase
      .from("season_products")
      .select("id, name, base_points")
      .eq("id", productId)
      .eq("season_id", seasonId)
      .single(),
    supabase
      .from("season_store_multipliers")
      .select("multiplier")
      .eq("season_id", seasonId)
      .eq("store_id", targetStoreId)
      .maybeSingle()
  ]);

  if (!season || season.mode !== "store" || !product) {
    redirectWithMessage("Bu sezon icin magaza satis girisi uygun degil.", "error", redirectTo);
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirectWithMessage("Miktar en az 1 olmali.", "error", redirectTo);
  }

  if (!entryDate) {
    redirectWithMessage("Satis tarihi secmelisiniz.", "error", redirectTo);
  }

  const sale = await calculateStoreSeasonSale({
    seasonId,
    productId,
    targetStoreId,
    quantity
  });

  const { error } = await supabase.from("season_sales_entries").insert({
    season_id: seasonId,
    product_id: sale.productId,
    product_name: sale.productName,
    entry_date: entryDate,
    target_store_id: targetStoreId,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    raw_score: sale.rawScore,
    score: sale.weightedScore,
    note: note || null
  });

  if (error) {
    redirectWithMessage(`Sezon magaza satisi eklenemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon icin magaza satisi eklendi.", "success", redirectTo);
}

export async function updateSeasonSaleAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const saleId = String(formData.get("saleId") ?? "").trim();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const targetProfileId = String(formData.get("targetProfileId") ?? "").trim();
  const targetStoreId = String(formData.get("targetStoreId") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "1"));
  const rawEntryDate = String(formData.get("entryDate") ?? "").trim();
  const entryDate = normalizeMonthInput(rawEntryDate);
  const note = String(formData.get("note") ?? "").trim();

  if (!saleId || !seasonId || !productId || !entryDate || !Number.isFinite(quantity) || quantity <= 0) {
    redirectWithMessage("Sezon satis guncelleme alanlari eksik.", "error", redirectTo);
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("mode")
    .eq("id", seasonId)
    .single();

  if (!season) {
    redirectWithMessage("Sezon bulunamadi.", "error", redirectTo);
  }

  const safeSeason = season!;
  const sale =
    safeSeason.mode === "employee"
      ? await calculateEmployeeSeasonSale({
          seasonId,
          productId,
          targetProfileId,
          quantity
        })
      : await calculateStoreSeasonSale({
          seasonId,
          productId,
          targetStoreId,
          quantity
        });

  const payload =
    safeSeason.mode === "employee"
      ? {
          product_id: sale.productId,
          product_name: sale.productName,
          target_profile_id: targetProfileId,
          target_store_id: null,
          entry_date: entryDate,
          quantity,
          raw_score: sale.rawScore,
          score: sale.weightedScore,
          note: note || null
        }
      : {
          product_id: sale.productId,
          product_name: sale.productName,
          target_profile_id: null,
          target_store_id: targetStoreId,
          entry_date: entryDate,
          quantity,
          raw_score: sale.rawScore,
          score: sale.weightedScore,
          note: note || null
        };

  const { error } = await supabase
    .from("season_sales_entries")
    .update(payload)
    .eq("id", saleId)
    .eq("season_id", seasonId);

  if (error) {
    redirectWithMessage(`Sezon satisi guncellenemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon satisi guncellendi.", "success", redirectTo);
}

export async function deleteSeasonSaleAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const saleId = String(formData.get("saleId") ?? "").trim();

  if (!saleId) {
    redirectWithMessage("Silinecek sezon satisi secilemedi.", "error", redirectTo);
  }

  const { error } = await supabase.from("season_sales_entries").delete().eq("id", saleId);

  if (error) {
    redirectWithMessage(`Sezon satisi silinemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon satisi silindi.", "success", redirectTo);
}

export async function saveSeasonTableRowAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const rawEntryMonth = String(formData.get("entryMonth") ?? "").trim();
  const entryDate = normalizeMonthInput(rawEntryMonth);

  if (!seasonId || !targetId || !entryDate) {
    redirectWithMessage("Tablo satirini kaydetmek icin sezon, hedef ve ay zorunlu.", "error", redirectTo);
  }

  const { start: monthStart, endExclusive: nextMonthStart, monthKey } = getMonthRange(entryDate!);

  const [{ data: season }, { data: products }] = await Promise.all([
    supabase.from("seasons").select("mode").eq("id", seasonId).single(),
    supabase
      .from("season_products")
      .select("id")
      .eq("season_id", seasonId)
      .order("sort_order")
  ]);

  if (!season || !products) {
    redirectWithMessage("Sezon veya urunler bulunamadi.", "error", redirectTo, { entryMonth: monthKey });
  }

  const safeSeason = season!;
  const targetType = safeSeason.mode === "employee" ? "employee" : "store";
  const { data: existingEntries } = await supabase
    .from("season_sales_entries")
    .select("id, product_id")
    .eq("season_id", seasonId)
    .gte("entry_date", monthStart)
    .lt("entry_date", nextMonthStart)
    .eq(targetType === "employee" ? "target_profile_id" : "target_store_id", targetId);
  const matchingEntries = ((existingEntries as Array<{ id: string; product_id: string | null }> | null) ?? []).filter(
    (entry) => entry.product_id
  );

  for (const product of products as Array<{ id: string }>) {
    const quantity = Number(String(formData.get(`qty__${product.id}`) ?? "0").trim() || "0");
    const productEntries = matchingEntries.filter((entry) => entry.product_id === product.id);

    if (quantity > 0) {
      const sale =
        targetType === "employee"
          ? await calculateEmployeeSeasonSale({
              seasonId,
              productId: product.id,
              targetProfileId: targetId,
              quantity
            })
          : await calculateStoreSeasonSale({
              seasonId,
              productId: product.id,
              targetStoreId: targetId,
              quantity
            });

      const payload =
        targetType === "employee"
          ? {
              season_id: seasonId,
              product_id: sale.productId,
              product_name: sale.productName,
              entry_date: entryDate,
              target_profile_id: targetId,
              target_store_id: null,
              quantity,
              raw_score: sale.rawScore,
              score: sale.weightedScore,
              note: null
            }
          : {
              season_id: seasonId,
              product_id: sale.productId,
              product_name: sale.productName,
              entry_date: entryDate,
              target_profile_id: null,
              target_store_id: targetId,
              quantity,
              raw_score: sale.rawScore,
              score: sale.weightedScore,
              note: null
            };

      if (productEntries.length > 0) {
        const [firstEntry, ...extraEntries] = productEntries;
        const { error: updateError } = await supabase
          .from("season_sales_entries")
          .update(payload)
          .eq("id", firstEntry.id);

        if (updateError) {
          redirectWithMessage(`Satir guncellenemedi: ${updateError.message}`, "error", redirectTo, {
            entryMonth: monthKey
          });
        }

        if (extraEntries.length > 0) {
          await supabase
            .from("season_sales_entries")
            .delete()
            .in(
              "id",
              extraEntries.map((entry) => entry.id)
            );
        }
      } else {
        const { error: insertError } = await supabase.from("season_sales_entries").insert(payload);

        if (insertError) {
          redirectWithMessage(`Satir eklenemedi: ${insertError.message}`, "error", redirectTo, {
            entryMonth: monthKey
          });
        }
      }
    } else if (productEntries.length > 0) {
      const { error: deleteError } = await supabase
        .from("season_sales_entries")
        .delete()
        .in(
          "id",
          productEntries.map((entry) => entry.id)
        );

      if (deleteError) {
        redirectWithMessage(`Eski satirlar silinemedi: ${deleteError.message}`, "error", redirectTo, {
          entryMonth: monthKey
        });
      }
    }
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Aylik tablo satiri kaydedildi.", "success", redirectTo, { entryMonth: monthKey });
}

export async function saveSeasonTableAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const rawEntryMonth = String(formData.get("entryMonth") ?? "").trim();
  const entryDate = normalizeMonthInput(rawEntryMonth);

  if (!seasonId || !entryDate) {
    redirectWithMessage("Tabloyu kaydetmek icin sezon ve ay zorunlu.", "error", redirectTo);
  }

  const { start: monthStart, endExclusive: nextMonthStart, monthKey } = getMonthRange(entryDate!);
  const [{ data: season }, { data: products }] = await Promise.all([
    supabase.from("seasons").select("mode").eq("id", seasonId).single(),
    supabase.from("season_products").select("id").eq("season_id", seasonId).order("sort_order")
  ]);

  if (!season || !products) {
    redirectWithMessage("Sezon veya urunler bulunamadi.", "error", redirectTo, { entryMonth: monthKey });
  }

  const safeSeason = season!;
  const targetType = safeSeason.mode === "employee" ? "employee" : "store";
  const { data: existingEntries } = await supabase
    .from("season_sales_entries")
    .select("id, product_id, target_profile_id, target_store_id")
    .eq("season_id", seasonId)
    .gte("entry_date", monthStart)
    .lt("entry_date", nextMonthStart);

  const productIds = new Set((products as Array<{ id: string }>).map((product) => product.id));
  const targetIds = new Set<string>();

  Array.from(formData.keys()).forEach((key) => {
    const match = key.match(/^qty__(.+?)__(.+)$/);
    if (!match) {
      return;
    }

    const [, targetId, productId] = match;
    if (targetId && productIds.has(productId)) {
      targetIds.add(targetId);
    }
  });

  const matchingEntries =
    ((existingEntries as Array<{
      id: string;
      product_id: string | null;
      target_profile_id: string | null;
      target_store_id: string | null;
    }> | null) ?? []).filter((entry) => entry.product_id);

  for (const targetId of targetIds) {
    for (const product of products as Array<{ id: string }>) {
      const quantity = Number(String(formData.get(`qty__${targetId}__${product.id}`) ?? "0").trim() || "0");
      const productEntries = matchingEntries.filter((entry) => {
        const entryTargetId = targetType === "employee" ? entry.target_profile_id : entry.target_store_id;
        return entryTargetId === targetId && entry.product_id === product.id;
      });

      if (quantity > 0) {
        const sale =
          targetType === "employee"
            ? await calculateEmployeeSeasonSale({
                seasonId,
                productId: product.id,
                targetProfileId: targetId,
                quantity
              })
            : await calculateStoreSeasonSale({
                seasonId,
                productId: product.id,
                targetStoreId: targetId,
                quantity
              });

        const payload =
          targetType === "employee"
            ? {
                season_id: seasonId,
                product_id: sale.productId,
                product_name: sale.productName,
                entry_date: entryDate,
                target_profile_id: targetId,
                target_store_id: null,
                quantity,
                raw_score: sale.rawScore,
                score: sale.weightedScore,
                note: null
              }
            : {
                season_id: seasonId,
                product_id: sale.productId,
                product_name: sale.productName,
                entry_date: entryDate,
                target_profile_id: null,
                target_store_id: targetId,
                quantity,
                raw_score: sale.rawScore,
                score: sale.weightedScore,
                note: null
              };

        if (productEntries.length > 0) {
          const [firstEntry, ...extraEntries] = productEntries;
          const { error: updateError } = await supabase
            .from("season_sales_entries")
            .update(payload)
            .eq("id", firstEntry.id);

          if (updateError) {
            redirectWithMessage(`Tablo guncellenemedi: ${updateError.message}`, "error", redirectTo, {
              entryMonth: monthKey
            });
          }

          if (extraEntries.length > 0) {
            await supabase
              .from("season_sales_entries")
              .delete()
              .in(
                "id",
                extraEntries.map((entry) => entry.id)
              );
          }
        } else {
          const { error: insertError } = await supabase.from("season_sales_entries").insert(payload);

          if (insertError) {
            redirectWithMessage(`Tabloya eklenemedi: ${insertError.message}`, "error", redirectTo, {
              entryMonth: monthKey
            });
          }
        }
      } else if (productEntries.length > 0) {
        const { error: deleteError } = await supabase
          .from("season_sales_entries")
          .delete()
          .in(
            "id",
            productEntries.map((entry) => entry.id)
          );

        if (deleteError) {
          redirectWithMessage(`Eski ay verisi silinemedi: ${deleteError.message}`, "error", redirectTo, {
            entryMonth: monthKey
          });
        }
      }
    }
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Aylik sezon tablosu kaydedildi.", "success", redirectTo, { entryMonth: monthKey });
}

export async function updateStoreAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const baseMultiplier = Number(String(formData.get("baseMultiplier") ?? "1").trim());

  if (!id || !name) {
    redirectWithMessage("Magaza guncelleme icin gerekli alanlar eksik.", "error", redirectTo);
  }

  const { error } = await supabase
    .from("stores")
    .update({
      name,
      city: city || null,
      base_multiplier: Number.isFinite(baseMultiplier) ? baseMultiplier : 1
    })
    .eq("id", id);

  if (error) {
    redirectWithMessage(`Magaza guncellenemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/kayit");
  redirectWithMessage("Magaza bilgileri guncellendi.", "success", redirectTo);
}

export async function toggleStoreStatusAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const currentValue = String(formData.get("isActive") ?? "true") === "true";

  const { error } = await supabase
    .from("stores")
    .update({ is_active: !currentValue })
    .eq("id", id);

  if (error) {
    redirectWithMessage(`Magaza durumu degistirilemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/kayit");
  redirectWithMessage(currentValue ? "Magaza pasif yapildi." : "Magaza tekrar aktif edildi.", "success", redirectTo);
}

export async function updateApprovalAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const profileId = String(formData.get("profileId") ?? "");
  const approval = String(formData.get("approval") ?? "pending");

  const { error } = await supabase
    .from("profiles")
    .update({ approval })
    .eq("id", profileId);

  if (error) {
    redirectWithMessage(`Kullanici guncellenemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/admin");
  revalidatePath("/hesabim");
  revalidatePath("/bildirimler");

  await broadcastNotification({
    title: approval === "approved" ? "Hesabiniz aktif edildi" : "Kayit durumunuz guncellendi",
    body:
      approval === "approved"
        ? "Admin kaydinizi onayladi. Artik kampanyalara girip skor toplayabilirsiniz."
        : "Kayit talebiniz admin tarafinda reddedildi. Gerekirse yeni kayit acabilirsiniz.",
    linkPath: approval === "approved" ? "/kampanyalar" : "/hesabim",
    level: approval === "approved" ? "success" : "warning",
    profileIds: [profileId]
  });

  redirectWithMessage(
    approval === "approved" ? "Kullanici onaylandi." : "Kullanici reddedildi."
  , "success", redirectTo);
}

export async function createCampaignAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const mode = String(formData.get("mode") ?? "employee");
  const scoring = String(formData.get("scoring") ?? "points");
  const startAtInput = String(formData.get("startAt") ?? "").trim();
  const endAtInput = String(formData.get("endAt") ?? "").trim();
  const rewardTitle = String(formData.get("rewardTitle") ?? "").trim();
  const rewardDetails = String(formData.get("rewardDetails") ?? "").trim();
  const rewardFirst = String(formData.get("rewardFirst") ?? "").trim();
  const rewardSecond = String(formData.get("rewardSecond") ?? "").trim();
  const rewardThird = String(formData.get("rewardThird") ?? "").trim();
  const productsText = String(formData.get("products") ?? "").trim();
  const storeMultipliersText = String(formData.get("storeMultipliers") ?? "").trim();
  const products = parseProducts(productsText);
  const startAt = localDateTimeToIso(startAtInput);
  const endAt = localDateTimeToIso(endAtInput);
  const startDate = startAtInput.slice(0, 10);
  const endDate = endAtInput.slice(0, 10);
  let storeMultipliers: Array<{ store_id: string; multiplier: number }> = [];

  if (!name || !startAt || !endAt) {
    redirectWithMessage("Kampanya icin ad, baslangic ve bitis zamani zorunlu.", "error", redirectTo);
  }

  if (products.length === 0) {
    redirectWithMessage("En az bir kampanya urunu girmelisiniz.", "error", redirectTo);
  }

  if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
    redirectWithMessage("Bitis zamani baslangic zamanindan sonra olmali.", "error", redirectTo);
  }

  try {
    storeMultipliers = await parseStoreMultipliers(storeMultipliersText);
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Magaza carpanlari okunamadi.", "error", redirectTo);
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      name,
      description: description || null,
      mode,
      scoring,
      start_date: startDate,
      end_date: endDate,
      start_at: startAt,
      end_at: endAt,
      reward_title: rewardTitle || null,
      reward_details: rewardDetails || null,
      reward_first: rewardFirst || null,
      reward_second: rewardSecond || null,
      reward_third: rewardThird || null,
      is_active: true
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    redirectWithMessage(`Kampanya olusturulamadi: ${campaignError?.message ?? "Bilinmeyen hata"}`, "error", redirectTo);
    return;
  }

  const campaignId = campaign?.id;

  if (!campaignId) {
    redirectWithMessage("Kampanya kimligi alinamadi.", "error", redirectTo);
  }

  if (storeMultipliers.length > 0) {
    const { error: multiplierError } = await supabase
      .from("campaign_store_multipliers")
      .insert(
        storeMultipliers.map((item) => ({
          campaign_id: campaignId,
          ...item
        }))
      );

    if (multiplierError) {
      redirectWithMessage(`Magaza carpanlari eklenemedi: ${multiplierError.message}`, "error", redirectTo);
    }
  }

  const { error: productError } = await supabase.from("campaign_products").insert(
    products.map((product) => ({
      ...product,
      campaign_id: campaignId
    }))
  );

  if (productError) {
    redirectWithMessage(`Kampanya urunleri eklenemedi: ${productError.message}`, "error", redirectTo);
  }

  await broadcastNotification({
    title: `Yeni kampanya acildi: ${name}`,
    body: `${startAtInput} - ${endAtInput} arasinda yeni kampanya yayinda. Hedefi kacirmayin.`,
    linkPath: "/kampanyalar",
    level: "success"
  });

  refreshCampaignPages();
  redirectWithMessage("Kampanya ve urunleri basariyla olusturuldu.", "success", redirectTo);
}

export async function updateCampaignAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const campaignId = String(formData.get("campaignId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const mode = String(formData.get("mode") ?? "employee");
  const scoring = String(formData.get("scoring") ?? "points");
  const startAtInput = String(formData.get("startAt") ?? "").trim();
  const endAtInput = String(formData.get("endAt") ?? "").trim();
  const rewardTitle = String(formData.get("rewardTitle") ?? "").trim();
  const rewardDetails = String(formData.get("rewardDetails") ?? "").trim();
  const rewardFirst = String(formData.get("rewardFirst") ?? "").trim();
  const rewardSecond = String(formData.get("rewardSecond") ?? "").trim();
  const rewardThird = String(formData.get("rewardThird") ?? "").trim();
  const storeMultipliersText = String(formData.get("storeMultipliers") ?? "").trim();
  const startAt = localDateTimeToIso(startAtInput);
  const endAt = localDateTimeToIso(endAtInput);
  const startDate = startAtInput.slice(0, 10);
  const endDate = endAtInput.slice(0, 10);
  let storeMultipliers: Array<{ store_id: string; multiplier: number }> = [];

  if (!campaignId || !name || !startAt || !endAt) {
    redirectWithMessage("Kampanya guncelleme icin gerekli alanlar eksik.", "error", redirectTo);
  }

  if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
    redirectWithMessage("Bitis zamani baslangic zamanindan sonra olmali.", "error", redirectTo);
  }

  try {
    storeMultipliers = await parseStoreMultipliers(storeMultipliersText);
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Magaza carpanlari okunamadi.", "error", redirectTo);
  }

  const { error: campaignError } = await supabase
    .from("campaigns")
    .update({
      name,
      description: description || null,
      mode,
      scoring,
      start_date: startDate,
      end_date: endDate,
      start_at: startAt,
      end_at: endAt,
      reward_title: rewardTitle || null,
      reward_details: rewardDetails || null,
      reward_first: rewardFirst || null,
      reward_second: rewardSecond || null,
      reward_third: rewardThird || null
    })
    .eq("id", campaignId);

  if (campaignError) {
    redirectWithMessage(`Kampanya guncellenemedi: ${campaignError.message}`, "error", redirectTo);
  }

  const { error: clearMultiplierError } = await supabase
    .from("campaign_store_multipliers")
    .delete()
    .eq("campaign_id", campaignId);

  if (clearMultiplierError) {
    redirectWithMessage(`Eski magaza carpanlari silinemedi: ${clearMultiplierError.message}`, "error", redirectTo);
  }

  if (storeMultipliers.length > 0) {
    const { error: insertMultiplierError } = await supabase
      .from("campaign_store_multipliers")
      .insert(
        storeMultipliers.map((item) => ({
          campaign_id: campaignId,
          ...item
        }))
      );

    if (insertMultiplierError) {
      redirectWithMessage(`Yeni magaza carpanlari eklenemedi: ${insertMultiplierError.message}`, "error", redirectTo);
    }
  }

  await broadcastNotification({
    title: `Kampanya guncellendi: ${name}`,
    body: "Saat, odul veya carpan bilgileri yenilendi. Son durumu kontrol edin.",
    linkPath: "/kampanyalar",
    level: "info"
  });

  refreshCampaignPages();
  redirectWithMessage("Kampanya bilgileri guncellendi.", "success", redirectTo);
}

export async function endCampaignAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const campaignId = String(formData.get("campaignId") ?? "");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const endedAt = now.toISOString();

  const { error } = await supabase
    .from("campaigns")
    .update({
      is_active: false,
      end_date: today,
      end_at: endedAt
    })
    .eq("id", campaignId);

  if (error) {
    redirectWithMessage(`Kampanya sonlandirilamadi: ${error.message}`, "error", redirectTo);
  }

  await broadcastNotification({
    title: "Kampanya sonuclandi",
    body: "Bir kampanya sonlandirildi. Sonuclanan kampanyalar alanindan kazananlari kontrol edin.",
    linkPath: "/kampanyalar",
    level: "warning"
  });

  refreshCampaignPages();
  redirectWithMessage("Kampanya sonlandirildi.", "success", redirectTo);
}

export async function deleteCampaignAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const campaignId = String(formData.get("campaignId") ?? "");

  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);

  if (error) {
    redirectWithMessage(`Kampanya silinemedi: ${error.message}`, "error", redirectTo);
  }

  refreshCampaignPages();
  redirectWithMessage("Kampanya silindi.", "success", redirectTo);
}

export async function createCampaignSaleByAdminAction(formData: FormData) {
  const { profile } = await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "").trim());
  const targetProfileId = String(formData.get("targetProfileId") ?? "").trim();
  const targetStoreId = String(formData.get("targetStoreId") ?? "").trim();

  if (!campaignId || !productId || !Number.isFinite(quantity) || quantity === 0) {
    redirectWithMessage("Kampanya satisi icin urun ve sifirdan farkli miktar zorunlu.", "error", redirectTo);
  }

  const [{ data: campaign }, { data: product }] = await Promise.all([
    supabase.from("campaigns").select("id, mode, scoring").eq("id", campaignId).single(),
    supabase
      .from("campaign_products")
      .select("id, campaign_id, name, base_points, unit_label")
      .eq("id", productId)
      .single()
  ]);

  if (!campaign || !product || product.campaign_id !== campaignId) {
    redirectWithMessage("Kampanya veya kampanya urunu bulunamadi.", "error", redirectTo);
  }

  let finalTargetProfileId: string | null = null;
  let finalTargetStoreId: string | null = null;
  let multiplierStoreId: string | null = null;
  let profileMultiplierTargetId: string | null = null;

  if (campaign!.mode === "employee") {
    if (!targetProfileId) {
      redirectWithMessage("Calisan bazli kampanyada hedef personel secmelisiniz.", "error", redirectTo);
    }

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, store_id, approval, role, is_on_leave")
      .eq("id", targetProfileId)
      .single();

    if (
      !targetProfile ||
      targetProfile.approval !== "approved" ||
      targetProfile.role !== "employee" ||
      targetProfile.is_on_leave
    ) {
      redirectWithMessage("Secilen personel aktif ve onayli bir calisan olmali.", "error", redirectTo);
    }

    finalTargetProfileId = targetProfile!.id;
    multiplierStoreId = targetProfile!.store_id;
    profileMultiplierTargetId = targetProfile!.id;
  } else {
    if (!targetStoreId) {
      redirectWithMessage("Magaza bazli kampanyada hedef magaza secmelisiniz.", "error", redirectTo);
    }

    const { data: targetStore } = await supabase
      .from("stores")
      .select("id, is_active")
      .eq("id", targetStoreId)
      .single();

    if (!targetStore || !targetStore.is_active) {
      redirectWithMessage("Secilen magaza aktif olmali.", "error", redirectTo);
    }

    finalTargetStoreId = targetStore!.id;
    multiplierStoreId = targetStore!.id;
  }

  const [{ data: storeMultiplierRow }, { data: profileMultiplierRow }] = await Promise.all([
    multiplierStoreId
      ? supabase
          .from("campaign_store_multipliers")
          .select("multiplier")
          .eq("campaign_id", campaignId)
          .eq("store_id", multiplierStoreId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    profileMultiplierTargetId
      ? supabase
          .from("campaign_profile_multipliers")
          .select("multiplier")
          .eq("campaign_id", campaignId)
          .eq("profile_id", profileMultiplierTargetId)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const rawScore =
    campaign!.scoring === "points" ? quantity * Number(product!.base_points ?? 1) : quantity;
  const weightedScore =
    rawScore * Number(storeMultiplierRow?.multiplier ?? 1) * Number(profileMultiplierRow?.multiplier ?? 1);

  const { error } = await supabase.from("sales_entries").insert({
    campaign_id: campaignId,
    product_id: productId,
    actor_profile_id: profile.id,
    target_profile_id: finalTargetProfileId,
    target_store_id: finalTargetStoreId,
    quantity,
    raw_score: rawScore,
    weighted_score: weightedScore
  });

  if (error) {
    redirectWithMessage(`Kampanya satisi eklenemedi: ${error.message}`, "error", redirectTo);
  }

  refreshCampaignPages();
  redirectWithMessage("Kampanya satis kaydi eklendi.", "success", redirectTo);
}

export async function updateCampaignSaleAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const saleId = String(formData.get("saleId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "").trim());

  if (!saleId || !campaignId || !Number.isFinite(quantity)) {
    redirectWithMessage("Kampanya satisi guncellemek icin miktar zorunlu.", "error", redirectTo);
  }

  const { data: entry } = await supabase
    .from("sales_entries")
    .select("id, campaign_id, product_id, actor_profile_id, target_profile_id, target_store_id")
    .eq("id", saleId)
    .eq("campaign_id", campaignId)
    .single();

  if (!entry) {
    redirectWithMessage("Kampanya satis kaydi bulunamadi.", "error", redirectTo);
  }

  if (quantity === 0) {
    const { error: deleteError } = await supabase.from("sales_entries").delete().eq("id", saleId);

    if (deleteError) {
      redirectWithMessage(`Kampanya satisi silinemedi: ${deleteError.message}`, "error", redirectTo);
    }

    refreshCampaignPages();
    redirectWithMessage("Kampanya satis kaydi silindi.", "success", redirectTo);
  }

  let recalculated;

  try {
    recalculated = await calculateCampaignSaleForEntry({
      campaignId,
      productId: entry!.product_id,
      actorProfileId: entry!.actor_profile_id,
      targetProfileId: entry!.target_profile_id,
      targetStoreId: entry!.target_store_id,
      quantity
    });
  } catch (error) {
    redirectWithMessage(
      error instanceof Error ? error.message : "Kampanya satis puani hesaplanamadi.",
      "error",
      redirectTo
    );
  }

  const { error } = await supabase
    .from("sales_entries")
    .update({
      quantity,
      raw_score: recalculated!.rawScore,
      weighted_score: recalculated!.weightedScore
    })
    .eq("id", saleId);

  if (error) {
    redirectWithMessage(`Kampanya satisi guncellenemedi: ${error.message}`, "error", redirectTo);
  }

  refreshCampaignPages();
  redirectWithMessage("Kampanya satis kaydi guncellendi.", "success", redirectTo);
}

export async function deleteCampaignSaleAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const saleId = String(formData.get("saleId") ?? "").trim();

  if (!saleId) {
    redirectWithMessage("Silinecek kampanya satisi secilmedi.", "error", redirectTo);
  }

  const { error } = await supabase.from("sales_entries").delete().eq("id", saleId);

  if (error) {
    redirectWithMessage(`Kampanya satisi silinemedi: ${error.message}`, "error", redirectTo);
  }

  refreshCampaignPages();
  redirectWithMessage("Kampanya satis kaydi silindi.", "success", redirectTo);
}

function parseTariffPayload(formData: FormData) {
  return {
    provider: String(formData.get("provider") ?? "Turkcell").trim() || "Turkcell",
    source_url: String(formData.get("source_url") ?? "").trim() || null,
    name: String(formData.get("name") ?? "").trim(),
    category_name: String(formData.get("category_name") ?? "Genel").trim() || "Genel",
    line_type: String(formData.get("line_type") ?? "faturali").trim() || "faturali",
    data_gb: Number(String(formData.get("data_gb") ?? "0").trim() || "0"),
    minutes: Number(String(formData.get("minutes") ?? "0").trim() || "0"),
    sms: Number(String(formData.get("sms") ?? "0").trim() || "0"),
    price: Number(String(formData.get("price") ?? "0").trim() || "0"),
    details: String(formData.get("details") ?? "").trim() || null,
    is_online_only: String(formData.get("is_online_only") ?? "") === "on",
    is_digital_only: String(formData.get("is_digital_only") ?? "") === "on",
    is_active: String(formData.get("is_active") ?? "on") === "on",
    scraped_at: String(formData.get("scraped_at") ?? "").trim() || null
  };
}

export async function createTariffAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const payload = parseTariffPayload(formData);

  if (!payload.name) {
    redirectWithMessage("Tarife adi zorunlu.", "error", redirectTo);
  }

  const { error } = await supabase.from("tariffs").insert(payload);

  if (error) {
    redirectWithMessage(`Tarife eklenemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/tarifeler");
  revalidatePath("/admin/tarifeler");
  redirectWithMessage("Tarife eklendi.", "success", redirectTo);
}

export async function updateTariffAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const tariffId = String(formData.get("tariffId") ?? "").trim();
  const payload = parseTariffPayload(formData);

  if (!tariffId || !payload.name) {
    redirectWithMessage("Tarife guncellemek icin kayit ve ad zorunlu.", "error", redirectTo);
  }

  const { error } = await supabase
    .from("tariffs")
    .update({
      ...payload,
      updated_at: new Date().toISOString()
    })
    .eq("id", tariffId);

  if (error) {
    redirectWithMessage(`Tarife guncellenemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/tarifeler");
  revalidatePath("/admin/tarifeler");
  redirectWithMessage("Tarife guncellendi.", "success", redirectTo);
}

export async function deleteTariffAction(formData: FormData) {
  await requireAdminAccess();
  const redirectTo = getRedirectTo(formData);
  const supabase = createAdminClient();
  const tariffId = String(formData.get("tariffId") ?? "").trim();

  if (!tariffId) {
    redirectWithMessage("Silinecek tarife secilmedi.", "error", redirectTo);
  }

  const { error } = await supabase.from("tariffs").delete().eq("id", tariffId);

  if (error) {
    redirectWithMessage(`Tarife silinemedi: ${error.message}`, "error", redirectTo);
  }

  revalidatePath("/tarifeler");
  revalidatePath("/admin/tarifeler");
  redirectWithMessage("Tarife silindi.", "success", redirectTo);
}
