import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
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

  const { data: actor } = await admin
    .from("profiles")
    .select("id, role, approval")
    .eq("id", user.id)
    .single();

  if (!actor || actor.approval !== "approved" || actor.role !== "admin") {
    return NextResponse.json({ message: "Bu islem icin admin yetkisi gerekir." }, { status: 403 });
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

  const [{ data: campaign }, { data: product }] = await Promise.all([
    admin
      .from("campaigns")
      .select("id, mode, scoring")
      .eq("id", campaignId)
      .single(),
    admin
      .from("campaign_products")
      .select("id, campaign_id, base_points")
      .eq("id", productId)
      .single()
  ]);

  if (!campaign || !product || product.campaign_id !== campaignId) {
    return NextResponse.json({ message: "Kampanya urunu bulunamadi." }, { status: 404 });
  }

  let finalTargetProfileId: string | null = null;
  let finalTargetStoreId: string | null = null;
  let multiplierStoreId: string | null = null;
  let profileMultiplierTargetId: string | null = null;

  if (campaign.mode === "employee") {
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
      targetProfile.role !== "employee" ||
      targetProfile.is_on_leave
    ) {
      return NextResponse.json({ message: "Secilen personel aktif ve onayli bir calisan olmali." }, { status: 400 });
    }

    finalTargetProfileId = targetProfile.id;
    multiplierStoreId = targetProfile.store_id;
    profileMultiplierTargetId = targetProfile.id;
  } else {
    if (!targetStoreId) {
      return NextResponse.json({ message: "Hedef magaza secilmedi." }, { status: 400 });
    }

    const { data: targetStore } = await admin
      .from("stores")
      .select("id, is_active")
      .eq("id", targetStoreId)
      .single();

    if (!targetStore || !targetStore.is_active) {
      return NextResponse.json({ message: "Secilen magaza aktif olmali." }, { status: 400 });
    }

    finalTargetStoreId = targetStore.id;
    multiplierStoreId = targetStore.id;
  }

  const [{ data: storeMultiplierRow }, { data: profileMultiplierRow }] = await Promise.all([
    multiplierStoreId
      ? admin
          .from("campaign_store_multipliers")
          .select("multiplier")
          .eq("campaign_id", campaignId)
          .eq("store_id", multiplierStoreId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    profileMultiplierTargetId
      ? admin
          .from("campaign_profile_multipliers")
          .select("multiplier")
          .eq("campaign_id", campaignId)
          .eq("profile_id", profileMultiplierTargetId)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const rawScore = campaign.scoring === "points" ? quantity * Number(product.base_points ?? 1) : quantity;
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
      const { error } = await admin
        .from("sales_entries")
        .delete()
        .in(
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
      await admin
        .from("sales_entries")
        .delete()
        .in(
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
  revalidatePath("/admin");
  revalidatePath("/admin/kampanyalar");
  revalidatePath("/kampanyalar");
  revalidatePath(`/kampanyalar/${campaignId}`);
  revalidatePath("/lig");
  revalidatePath("/magaza-vs-magaza");

  return NextResponse.json({ quantity, weightedScore });
}
