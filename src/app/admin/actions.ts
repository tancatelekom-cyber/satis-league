"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDateTimeToIso } from "@/lib/campaign-utils";

function redirectWithMessage(message: string, type: "success" | "error" = "success") {
  const params = new URLSearchParams({ message, type });
  redirect(`/admin?${params.toString()}`);
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

function refreshCampaignPages() {
  revalidatePath("/admin");
  revalidatePath("/kampanyalar");
  revalidatePath("/bildirimler");
  revalidatePath("/lig");
  revalidatePath("/magaza-vs-magaza");
}

async function setOnlyActiveSeason(supabase: ReturnType<typeof createAdminClient>, seasonId: string) {
  await supabase.from("seasons").update({ is_active: false }).neq("id", seasonId);
  await supabase.from("seasons").update({ is_active: true }).eq("id", seasonId);
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
  const supabase = createAdminClient();
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const baseMultiplierValue = String(formData.get("baseMultiplier") ?? "1").trim();
  const baseMultiplier = Number(baseMultiplierValue || "1");

  if (!name) {
    redirectWithMessage("Magaza adi bos olamaz.", "error");
  }

  const { error } = await supabase.from("stores").insert({
    name,
    city: city || null,
    base_multiplier: Number.isFinite(baseMultiplier) ? baseMultiplier : 1,
    is_active: true
  });

  if (error) {
    redirectWithMessage(`Magaza eklenemedi: ${error.message}`, "error");
  }

  revalidatePath("/admin");
  revalidatePath("/kayit");
  redirectWithMessage("Magaza basariyla eklendi.");
}

export async function createSeasonAction(formData: FormData) {
  await requireAdminAccess();
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
    redirectWithMessage("Sezon icin ad, baslangic ve bitis tarihleri zorunlu.", "error");
  }

  if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
    redirectWithMessage("Sezon bitis tarihi baslangic tarihinden sonra olmali.", "error");
  }

  if (seasonProducts.length === 0) {
    redirectWithMessage("En az bir sezon urunu girmelisiniz.", "error");
  }

  try {
    storeMultipliers = await parseStoreMultipliers(
      String(formData.get("seasonStoreMultipliers") ?? "").trim()
    );
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Sezon magaza carpanlari okunamadi.", "error");
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
    redirectWithMessage(`Sezon olusturulamadi: ${error?.message ?? "Bilinmeyen hata"}`, "error");
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
      redirectWithMessage(`Sezon urunleri eklenemedi: ${productError.message}`, "error");
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
      redirectWithMessage(`Sezon magaza carpanlari eklenemedi: ${multiplierError.message}`, "error");
    }
  }

  if (isActive) {
    await setOnlyActiveSeason(supabase, seasonRow.id);
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon basariyla olusturuldu.");
}

export async function updateSeasonAction(formData: FormData) {
  await requireAdminAccess();
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
    redirectWithMessage("Sezon guncelleme icin gerekli alanlar eksik.", "error");
  }

  if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
    redirectWithMessage("Sezon bitis tarihi baslangic tarihinden sonra olmali.", "error");
  }

  if (seasonProducts.length === 0) {
    redirectWithMessage("En az bir sezon urunu girmelisiniz.", "error");
  }

  try {
    storeMultipliers = await parseStoreMultipliers(
      String(formData.get("seasonStoreMultipliers") ?? "").trim()
    );
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Sezon magaza carpanlari okunamadi.", "error");
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
    redirectWithMessage(`Sezon guncellenemedi: ${error.message}`, "error");
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
      redirectWithMessage(`Sezon urunleri guncellenemedi: ${productError.message}`, "error");
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
      redirectWithMessage(`Sezon magaza carpanlari guncellenemedi: ${multiplierError.message}`, "error");
    }
  }

  if (isActive) {
    await setOnlyActiveSeason(supabase, seasonId);
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon guncellendi.");
}

export async function toggleSeasonStatusAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const currentValue = String(formData.get("isActive") ?? "false") === "true";

  if (!seasonId) {
    redirectWithMessage("Sezon secilemedi.", "error");
  }

  if (currentValue) {
    const { error } = await supabase.from("seasons").update({ is_active: false }).eq("id", seasonId);

    if (error) {
      redirectWithMessage(`Sezon pasife alinamadi: ${error.message}`, "error");
    }
  } else {
    await setOnlyActiveSeason(supabase, seasonId);
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage(currentValue ? "Sezon pasife alindi." : "Sezon aktif yapildi.");
}

export async function deleteSeasonAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();

  const { error } = await supabase.from("seasons").delete().eq("id", seasonId);

  if (error) {
    redirectWithMessage(`Sezon silinemedi: ${error.message}`, "error");
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon silindi.");
}

export async function createSeasonEmployeeSaleAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const targetProfileId = String(formData.get("targetProfileId") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "1"));
  const note = String(formData.get("note") ?? "").trim();

  if (!seasonId || !productId || !targetProfileId) {
    redirectWithMessage("Sezon satis girisi icin sezon, urun ve calisan secilmeli.", "error");
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
    redirectWithMessage("Bu sezon icin calisan satis girisi uygun degil.", "error");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirectWithMessage("Miktar en az 1 olmali.", "error");
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
    target_profile_id: targetProfileId,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    raw_score: sale.rawScore,
    score: sale.weightedScore,
    note: note || null
  });

  if (error) {
    redirectWithMessage(`Sezon calisan satisi eklenemedi: ${error.message}`, "error");
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon icin calisan satisi eklendi.");
}

export async function createSeasonStoreSaleAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const targetStoreId = String(formData.get("targetStoreId") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "1"));
  const note = String(formData.get("note") ?? "").trim();

  if (!seasonId || !productId || !targetStoreId) {
    redirectWithMessage("Sezon satis girisi icin sezon, urun ve magaza secilmeli.", "error");
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
    redirectWithMessage("Bu sezon icin magaza satis girisi uygun degil.", "error");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirectWithMessage("Miktar en az 1 olmali.", "error");
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
    target_store_id: targetStoreId,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    raw_score: sale.rawScore,
    score: sale.weightedScore,
    note: note || null
  });

  if (error) {
    redirectWithMessage(`Sezon magaza satisi eklenemedi: ${error.message}`, "error");
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon icin magaza satisi eklendi.");
}

export async function updateSeasonSaleAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const saleId = String(formData.get("saleId") ?? "").trim();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const targetProfileId = String(formData.get("targetProfileId") ?? "").trim();
  const targetStoreId = String(formData.get("targetStoreId") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "1"));
  const note = String(formData.get("note") ?? "").trim();

  if (!saleId || !seasonId || !productId || !Number.isFinite(quantity) || quantity <= 0) {
    redirectWithMessage("Sezon satis guncelleme alanlari eksik.", "error");
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("mode")
    .eq("id", seasonId)
    .single();

  if (!season) {
    redirectWithMessage("Sezon bulunamadi.", "error");
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
    redirectWithMessage(`Sezon satisi guncellenemedi: ${error.message}`, "error");
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon satisi guncellendi.");
}

export async function deleteSeasonSaleAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const saleId = String(formData.get("saleId") ?? "").trim();

  if (!saleId) {
    redirectWithMessage("Silinecek sezon satisi secilemedi.", "error");
  }

  const { error } = await supabase.from("season_sales_entries").delete().eq("id", saleId);

  if (error) {
    redirectWithMessage(`Sezon satisi silinemedi: ${error.message}`, "error");
  }

  revalidatePath("/admin");
  revalidatePath("/lig");
  redirectWithMessage("Sezon satisi silindi.");
}

export async function updateStoreAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const baseMultiplier = Number(String(formData.get("baseMultiplier") ?? "1").trim());

  if (!id || !name) {
    redirectWithMessage("Magaza guncelleme icin gerekli alanlar eksik.", "error");
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
    redirectWithMessage(`Magaza guncellenemedi: ${error.message}`, "error");
  }

  revalidatePath("/admin");
  revalidatePath("/kayit");
  redirectWithMessage("Magaza bilgileri guncellendi.");
}

export async function toggleStoreStatusAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const currentValue = String(formData.get("isActive") ?? "true") === "true";

  const { error } = await supabase
    .from("stores")
    .update({ is_active: !currentValue })
    .eq("id", id);

  if (error) {
    redirectWithMessage(`Magaza durumu degistirilemedi: ${error.message}`, "error");
  }

  revalidatePath("/admin");
  revalidatePath("/kayit");
  redirectWithMessage(currentValue ? "Magaza pasif yapildi." : "Magaza tekrar aktif edildi.");
}

export async function updateApprovalAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const profileId = String(formData.get("profileId") ?? "");
  const approval = String(formData.get("approval") ?? "pending");

  const { error } = await supabase
    .from("profiles")
    .update({ approval })
    .eq("id", profileId);

  if (error) {
    redirectWithMessage(`Kullanici guncellenemedi: ${error.message}`, "error");
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
  );
}

export async function createCampaignAction(formData: FormData) {
  await requireAdminAccess();
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
    redirectWithMessage("Kampanya icin ad, baslangic ve bitis zamani zorunlu.", "error");
  }

  if (products.length === 0) {
    redirectWithMessage("En az bir kampanya urunu girmelisiniz.", "error");
  }

  if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
    redirectWithMessage("Bitis zamani baslangic zamanindan sonra olmali.", "error");
  }

  try {
    storeMultipliers = await parseStoreMultipliers(storeMultipliersText);
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Magaza carpanlari okunamadi.", "error");
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
    redirectWithMessage(`Kampanya olusturulamadi: ${campaignError?.message ?? "Bilinmeyen hata"}`, "error");
    return;
  }

  const campaignId = campaign?.id;

  if (!campaignId) {
    redirectWithMessage("Kampanya kimligi alinamadi.", "error");
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
      redirectWithMessage(`Magaza carpanlari eklenemedi: ${multiplierError.message}`, "error");
    }
  }

  const { error: productError } = await supabase.from("campaign_products").insert(
    products.map((product) => ({
      ...product,
      campaign_id: campaignId
    }))
  );

  if (productError) {
    redirectWithMessage(`Kampanya urunleri eklenemedi: ${productError.message}`, "error");
  }

  await broadcastNotification({
    title: `Yeni kampanya acildi: ${name}`,
    body: `${startAtInput} - ${endAtInput} arasinda yeni kampanya yayinda. Hedefi kacirmayin.`,
    linkPath: "/kampanyalar",
    level: "success"
  });

  refreshCampaignPages();
  redirectWithMessage("Kampanya ve urunleri basariyla olusturuldu.");
}

export async function updateCampaignAction(formData: FormData) {
  await requireAdminAccess();
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
    redirectWithMessage("Kampanya guncelleme icin gerekli alanlar eksik.", "error");
  }

  if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
    redirectWithMessage("Bitis zamani baslangic zamanindan sonra olmali.", "error");
  }

  try {
    storeMultipliers = await parseStoreMultipliers(storeMultipliersText);
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Magaza carpanlari okunamadi.", "error");
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
    redirectWithMessage(`Kampanya guncellenemedi: ${campaignError.message}`, "error");
  }

  const { error: clearMultiplierError } = await supabase
    .from("campaign_store_multipliers")
    .delete()
    .eq("campaign_id", campaignId);

  if (clearMultiplierError) {
    redirectWithMessage(`Eski magaza carpanlari silinemedi: ${clearMultiplierError.message}`, "error");
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
      redirectWithMessage(`Yeni magaza carpanlari eklenemedi: ${insertMultiplierError.message}`, "error");
    }
  }

  await broadcastNotification({
    title: `Kampanya guncellendi: ${name}`,
    body: "Saat, odul veya carpan bilgileri yenilendi. Son durumu kontrol edin.",
    linkPath: "/kampanyalar",
    level: "info"
  });

  refreshCampaignPages();
  redirectWithMessage("Kampanya bilgileri guncellendi.");
}

export async function endCampaignAction(formData: FormData) {
  await requireAdminAccess();
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
    redirectWithMessage(`Kampanya sonlandirilamadi: ${error.message}`, "error");
  }

  await broadcastNotification({
    title: "Kampanya sonuclandi",
    body: "Bir kampanya sonlandirildi. Sonuclanan kampanyalar alanindan kazananlari kontrol edin.",
    linkPath: "/kampanyalar",
    level: "warning"
  });

  refreshCampaignPages();
  redirectWithMessage("Kampanya sonlandirildi.");
}

export async function deleteCampaignAction(formData: FormData) {
  await requireAdminAccess();
  const supabase = createAdminClient();
  const campaignId = String(formData.get("campaignId") ?? "");

  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);

  if (error) {
    redirectWithMessage(`Kampanya silinemedi: ${error.message}`, "error");
  }

  refreshCampaignPages();
  redirectWithMessage("Kampanya silindi.");
}
