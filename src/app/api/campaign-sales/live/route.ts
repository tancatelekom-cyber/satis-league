import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isSalesWindowOpen } from "@/lib/campaign-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Oturum bulunamadi." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        campaignId?: string;
        productId?: string;
        quantity?: number;
        targetProfileId?: string | null;
        targetStoreId?: string | null;
      }
    | null;

  const campaignId = String(body?.campaignId ?? "").trim();
  const productId = String(body?.productId ?? "").trim();
  const quantity = Number(body?.quantity ?? 0);
  const targetProfileId = String(body?.targetProfileId ?? "").trim();
  const targetStoreId = String(body?.targetStoreId ?? "").trim();

  if (!campaignId || !productId || !Number.isFinite(quantity) || quantity < 0) {
    return NextResponse.json({ message: "Eksik veya gecersiz veri gonderildi." }, { status: 400 });
  }

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
    return NextResponse.json({ message: "Satis girmek icin onayli kullanici olmalisiniz." }, { status: 403 });
  }

  if (!campaign || !product || product.campaign_id !== campaignId) {
    return NextResponse.json({ message: "Kampanya urunu bulunamadi." }, { status: 404 });
  }

  if (!isSalesWindowOpen(campaign.start_at, campaign.end_at)) {
    return NextResponse.json({ message: "Bu kampanyanin satis giris penceresi kapandi." }, { status: 400 });
  }

  const allowedProfileIds = ((permissionRows as Array<{ profile_id: string }> | null) ?? []).map(
    (row) => row.profile_id
  );

  if (allowedProfileIds.length > 0 && !allowedProfileIds.includes(actor.id)) {
    return NextResponse.json({ message: "Bu kampanyaya satis girme yetkiniz yok." }, { status: 403 });
  }

  let finalTargetProfileId: string | null = null;
  let finalTargetStoreId: string | null = null;

  if (campaign.mode === "employee") {
    if (actor.role === "manager") {
      if (!targetProfileId) {
        return NextResponse.json({ message: "Hedef personel secilmedi." }, { status: 400 });
      }

      const { data: targetProfile } = await admin
        .from("profiles")
        .select("id, store_id, approval, role, is_on_leave")
        .eq("id", targetProfileId)
        .single();

      if (
        !targetProfile ||
        targetProfile.approval !== "approved" ||
        targetProfile.store_id !== actor.store_id ||
        targetProfile.role !== "employee" ||
        targetProfile.is_on_leave
      ) {
        return NextResponse.json(
          { message: "Magaza muduru sadece kendi magazasindaki aktif calisana giris yapabilir." },
          { status: 403 }
        );
      }

      finalTargetProfileId = targetProfile.id;
    } else {
      finalTargetProfileId = actor.id;
    }
  } else {
    finalTargetStoreId = targetStoreId || actor.store_id;

    if (!finalTargetStoreId) {
      return NextResponse.json({ message: "Magaza bazli kampanyada magaza bulunamadi." }, { status: 400 });
    }
  }

  const multiplierStoreId = actor.store_id ?? finalTargetStoreId;
  const profileMultiplierTarget = finalTargetProfileId ?? actor.id;
  const [{ data: storeMultiplierRow }, { data: profileMultiplierRow }] = await Promise.all([
    admin
      .from("campaign_store_multipliers")
      .select("multiplier")
      .eq("campaign_id", campaignId)
      .eq("store_id", multiplierStoreId)
      .maybeSingle(),
    admin
      .from("campaign_profile_multipliers")
      .select("multiplier")
      .eq("campaign_id", campaignId)
      .eq("profile_id", profileMultiplierTarget)
      .maybeSingle()
  ]);

  const rawScore =
    campaign.scoring === "points" ? quantity * Number(product.base_points ?? 1) : quantity;
  const weightedScore =
    rawScore * Number(storeMultiplierRow?.multiplier ?? 1) * Number(profileMultiplierRow?.multiplier ?? 1);

  let existingQuery = admin
    .from("sales_entries")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("product_id", productId);

  existingQuery =
    campaign.mode === "employee"
      ? existingQuery.eq("target_profile_id", finalTargetProfileId)
      : existingQuery.eq("target_store_id", finalTargetStoreId);

  const { data: existingRows, error: existingError } = await existingQuery;

  if (existingError) {
    return NextResponse.json({ message: existingError.message }, { status: 500 });
  }

  const rows = (existingRows as Array<{ id: string }> | null) ?? [];

  if (quantity === 0) {
    if (rows.length > 0) {
      const { error } = await admin.from("sales_entries").delete().in(
        "id",
        rows.map((row) => row.id)
      );

      if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
      }
    }
  } else if (rows.length > 0) {
    const [firstRow, ...extraRows] = rows;
    const { error: updateError } = await admin
      .from("sales_entries")
      .update({
        actor_profile_id: actor.id,
        target_profile_id: finalTargetProfileId,
        target_store_id: finalTargetStoreId,
        quantity,
        raw_score: rawScore,
        weighted_score: weightedScore
      })
      .eq("id", firstRow.id);

    if (updateError) {
      return NextResponse.json({ message: updateError.message }, { status: 500 });
    }

    if (extraRows.length > 0) {
      await admin.from("sales_entries").delete().in(
        "id",
        extraRows.map((row) => row.id)
      );
    }
  } else {
    const { error: insertError } = await admin.from("sales_entries").insert({
      campaign_id: campaignId,
      product_id: productId,
      actor_profile_id: actor.id,
      target_profile_id: finalTargetProfileId,
      target_store_id: finalTargetStoreId,
      quantity,
      raw_score: rawScore,
      weighted_score: weightedScore
    });

    if (insertError) {
      return NextResponse.json({ message: insertError.message }, { status: 500 });
    }
  }

  revalidatePath("/");
  revalidatePath("/kampanyalar");
  revalidatePath(`/kampanyalar/${campaignId}`);
  revalidatePath("/lig");
  revalidatePath("/magaza-vs-magaza");

  return NextResponse.json({
    quantity,
    weightedScore
  });
}
