"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSalesWindowOpen } from "@/lib/campaign-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function redirectWithMessage(message: string, type: "success" | "error" = "success") {
  const params = new URLSearchParams({ message, type });
  redirect(`/kampanyalar?${params.toString()}`);
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

  const [{ data: actor }, { data: campaign }, { data: product }] = await Promise.all([
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
      .single()
  ]);

  if (!actor || actor.approval !== "approved") {
    redirectWithMessage("Satis girmek icin onayli kullanici olmalisiniz.", "error");
  }

  if (!campaign || !product || product.campaign_id !== campaignId) {
    redirectWithMessage("Kampanya urunu bulunamadi.", "error");
  }

  const actorRow = actor!;
  const campaignRow = campaign!;
  const productRow = product!;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirectWithMessage("Miktar en az 1 olmali.", "error");
  }

  if (!isSalesWindowOpen(campaignRow.start_at, campaignRow.end_at)) {
    redirectWithMessage("Bu kampanya icin satis giris suresi doldu. Bitisten 10 dakika sonra kapanir.", "error");
  }

  let finalTargetProfileId: string | null = null;
  let finalTargetStoreId: string | null = null;

  if (campaignRow.mode === "employee") {
    if (actorRow.role === "manager" && targetProfileId) {
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("id, store_id, approval")
        .eq("id", targetProfileId)
        .single();

      if (!targetProfile || targetProfile.approval !== "approved" || targetProfile.store_id !== actorRow.store_id) {
        redirectWithMessage("Magaza muduru sadece kendi magazasindaki onayli personele giris yapabilir.", "error");
      }

      finalTargetProfileId = targetProfile!.id;
    } else {
      finalTargetProfileId = actorRow.id;
    }
  } else {
    finalTargetStoreId = targetStoreId || actorRow.store_id;

    if (!finalTargetStoreId) {
      redirectWithMessage("Magaza bazli kampanyada kullanicinin magazasi olmali.", "error");
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
    redirectWithMessage(`Satis kaydi eklenemedi: ${error.message}`, "error");
  }

  revalidatePath("/kampanyalar");
  revalidatePath("/bildirimler");
  revalidatePath("/lig");
  revalidatePath("/magaza-vs-magaza");

  const notifyProfileId = finalTargetProfileId ?? actorRow.id;
  await admin.from("notifications").insert({
    profile_id: notifyProfileId,
    title: "Yeni skor islendi",
    body: `${quantity} adet giris yapildi. Bu islem ${weightedScore.toFixed(0)} puan etkisi olusturdu.`,
    level: "success",
    link_path: "/kampanyalar"
  });

  redirectWithMessage("Satis kaydi basariyla eklendi.");
}
