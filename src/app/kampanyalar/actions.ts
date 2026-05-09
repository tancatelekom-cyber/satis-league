"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSalesWindowOpen } from "@/lib/campaign-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function getRedirectTo(formData: FormData, fieldName: "successRedirectTo" | "errorRedirectTo") {
  const value = String(formData.get(fieldName) ?? "").trim();

  if (!value.startsWith("/kampanyalar")) {
    return "/kampanyalar";
  }

  return value;
}

function redirectWithMessage(
  message: string,
  type: "success" | "error" = "success",
  redirectTo = "/kampanyalar",
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
  redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}${params.toString()}`);
}

export async function submitSaleEntryAction(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const campaignId = String(formData.get("campaignId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(String(formData.get("quantity") ?? "1"));
  const targetProfileId = String(formData.get("targetProfileId") ?? "");
  const targetStoreId = String(formData.get("targetStoreId") ?? "");
  const successRedirectTo = getRedirectTo(formData, "successRedirectTo");
  const errorRedirectTo = getRedirectTo(formData, "errorRedirectTo");

  const [{ data: actor }, { data: campaign }, { data: product }, { data: permissionRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role, approval, store_id")
      .eq("id", user.id)
      .single(),
    admin
      .from("campaigns")
      .select("id, mode, scoring, start_at, end_at")
      .eq("id", campaignId)
      .single(),
    admin
      .from("campaign_products")
      .select("id, campaign_id, base_points")
      .eq("id", productId)
      .single(),
    admin
      .from("campaign_entry_permissions")
      .select("profile_id")
      .eq("campaign_id", campaignId)
  ]);

  if (!actor || actor.approval !== "approved") {
    redirectWithMessage(
      "Satis girmek icin onayli kullanici olmalisiniz.",
      "error",
      errorRedirectTo
    );
  }

  if (!campaign || !product || product.campaign_id !== campaignId) {
    redirectWithMessage("Kampanya urunu bulunamadi.", "error", errorRedirectTo);
  }

  const actorRow = actor!;
  const campaignRow = campaign!;
  const productRow = product!;
  const allowedProfileIds = ((permissionRows as Array<{ profile_id: string }> | null) ?? []).map(
    (row) => row.profile_id
  );

  if (allowedProfileIds.length > 0 && !allowedProfileIds.includes(actorRow.id)) {
    redirectWithMessage(
      "Bu kampanyaya satis girme yetkiniz yok.",
      "error",
      errorRedirectTo
    );
  }

  if (!Number.isFinite(quantity) || quantity === 0) {
    redirectWithMessage(
      "Miktar 0 olamaz. Arttirmak icin arti, dusurmek icin eksi kullanin.",
      "error",
      errorRedirectTo
    );
  }

  if (!isSalesWindowOpen(campaignRow.start_at, campaignRow.end_at)) {
    redirectWithMessage(
      "Bu kampanya icin satis giris suresi doldu. Bitisten 10 dakika sonra kapanir.",
      "error",
      errorRedirectTo
    );
  }

  let finalTargetProfileId: string | null = null;
  let finalTargetStoreId: string | null = null;

  if (campaignRow.mode === "employee") {
    if (actorRow.role === "manager") {
      if (!targetProfileId) {
        redirectWithMessage(
          "Magaza muduru satis girerken bir calisan secmelidir.",
          "error",
          errorRedirectTo
        );
      }

      const { data: targetProfile } = await admin
        .from("profiles")
        .select("id, store_id, approval, role, is_on_leave")
        .eq("id", targetProfileId)
        .single();

      if (
        !targetProfile ||
        targetProfile.approval !== "approved" ||
        targetProfile.store_id !== actorRow.store_id ||
        targetProfile.role !== "employee" ||
        targetProfile.is_on_leave
      ) {
        redirectWithMessage(
          "Magaza muduru sadece kendi magazasindaki aktif calisana giris yapabilir.",
          "error",
          errorRedirectTo
        );
      }

      finalTargetProfileId = targetProfile!.id;
    } else {
      finalTargetProfileId = actorRow.id;
    }
  } else {
    finalTargetStoreId = targetStoreId || actorRow.store_id;

    if (!finalTargetStoreId) {
      redirectWithMessage(
        "Magaza bazli kampanyada kullanicinin magazasi olmali.",
        "error",
        errorRedirectTo
      );
    }
  }

  const { data: storeMultiplierRow } = await admin
    .from("campaign_store_multipliers")
    .select("multiplier")
    .eq("campaign_id", campaignId)
    .eq("store_id", actorRow.store_id ?? finalTargetStoreId)
    .maybeSingle();

  const profileMultiplierTarget = finalTargetProfileId ?? actorRow.id;
  const { data: profileMultiplierRow } = await admin
    .from("campaign_profile_multipliers")
    .select("multiplier")
    .eq("campaign_id", campaignId)
    .eq("profile_id", profileMultiplierTarget)
    .maybeSingle();

  const storeMultiplier = Number(storeMultiplierRow?.multiplier ?? 1);
  const profileMultiplier = Number(profileMultiplierRow?.multiplier ?? 1);
  const rawScore =
    campaignRow.scoring === "points" ? quantity * Number(productRow.base_points ?? 1) : quantity;
  const weightedScore = rawScore * storeMultiplier * profileMultiplier;

  const { error } = await admin.from("sales_entries").insert({
    campaign_id: campaignId,
    product_id: productId,
    actor_profile_id: actorRow.id,
    target_profile_id: finalTargetProfileId,
    target_store_id: finalTargetStoreId,
    quantity,
    raw_score: rawScore,
    weighted_score: weightedScore
  });

  if (error) {
    redirectWithMessage(`Satis kaydi eklenemedi: ${error.message}`, "error", errorRedirectTo);
  }

  revalidatePath("/kampanyalar");
  revalidatePath(`/kampanyalar/${campaignId}`);
  revalidatePath("/bildirimler");
  revalidatePath("/lig");
  revalidatePath("/magaza-vs-magaza");

  const notifyProfileId = finalTargetProfileId ?? actorRow.id;
  await admin.from("notifications").insert({
    profile_id: notifyProfileId,
    title: "Yeni skor islendi",
    body: `${quantity} adetlik islem yapildi. Bu islem ${weightedScore.toFixed(0)} puan etkisi olusturdu.`,
    level: "success",
    link_path: "/kampanyalar"
  });

  redirectWithMessage("Satis islemi basariyla kaydedildi.", "success", successRedirectTo, {
    sync: Date.now().toString()
  });
}
