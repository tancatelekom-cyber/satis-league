import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isSalesWindowOpen } from "@/lib/campaign-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type DuelLivePayload = {
  duelId?: string;
  productId?: string;
  participantId?: string;
  quantity?: number;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Oturum bulunamadi." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as DuelLivePayload | null;
  const duelId = String(body?.duelId ?? "").trim();
  const productId = String(body?.productId ?? "").trim();
  const participantId = String(body?.participantId ?? "").trim();
  const quantity = Number(body?.quantity ?? 0);

  if (!duelId || !productId || !participantId || !Number.isFinite(quantity) || quantity < 0) {
    return NextResponse.json({ message: "Eksik veya gecersiz veri gonderildi." }, { status: 400 });
  }

  const [
    { data: actor },
    { data: duel },
    { data: product },
    { data: permissions },
    { data: participant },
    { data: participantMembers }
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role, approval, store_id")
      .eq("id", user.id)
      .single(),
    admin
      .from("duels")
      .select("id, scoring, start_at, end_at, is_active")
      .eq("id", duelId)
      .single(),
    admin
      .from("duel_products")
      .select("id, duel_id, base_points")
      .eq("id", productId)
      .single(),
    admin
      .from("duel_entry_permissions")
      .select("profile_id")
      .eq("duel_id", duelId),
    admin
      .from("duel_participants")
      .select("id, duel_id, participant_mode, profile_id")
      .eq("id", participantId)
      .single(),
    admin
      .from("duel_participant_members")
      .select(
        `
          profile_id,
          profile:profiles(store_id)
        `
      )
      .eq("duel_participant_id", participantId)
  ]);

  if (!actor || actor.approval !== "approved") {
    return NextResponse.json({ message: "Satis girmek icin onayli kullanici olmalisiniz." }, { status: 403 });
  }

  if (!duel || !duel.is_active || !isSalesWindowOpen(duel.start_at, duel.end_at)) {
    return NextResponse.json({ message: "Bu duello icin giris penceresi kapandi." }, { status: 400 });
  }

  if (!product || product.duel_id !== duelId) {
    return NextResponse.json({ message: "Duello urunu bulunamadi." }, { status: 404 });
  }

  if (!participant || participant.duel_id !== duelId) {
    return NextResponse.json({ message: "Duello katilimcisi bulunamadi." }, { status: 404 });
  }

  const allowedProfileIds = ((permissions as Array<{ profile_id: string }> | null) ?? []).map(
    (row) => row.profile_id
  );

  if (allowedProfileIds.length > 0 && !allowedProfileIds.includes(actor.id)) {
    return NextResponse.json({ message: "Bu duelloya giris yapma yetkiniz yok." }, { status: 403 });
  }

  const memberRows =
    ((participantMembers as Array<{
      profile_id: string;
      profile: { store_id: string | null } | null;
    }> | null) ?? []);
  const derivedStoreId =
    actor.store_id ??
    memberRows.find((member) => member.profile?.store_id)?.profile?.store_id ??
    null;

  const { data: multiplierRow } = derivedStoreId
    ? await admin
        .from("duel_store_multipliers")
        .select("multiplier")
        .eq("duel_id", duelId)
        .eq("store_id", derivedStoreId)
        .maybeSingle()
    : { data: null };

  const rawScore = duel.scoring === "points" ? quantity * Number(product.base_points ?? 1) : quantity;
  const weightedScore = rawScore * Number(multiplierRow?.multiplier ?? 1);

  const { data: existingRows, error: existingError } = await admin
    .from("duel_entries")
    .select("id")
    .eq("duel_id", duelId)
    .eq("participant_id", participantId)
    .eq("product_id", productId);

  if (existingError) {
    return NextResponse.json({ message: existingError.message }, { status: 500 });
  }

  const rows = (existingRows as Array<{ id: string }> | null) ?? [];

  if (quantity === 0) {
    if (rows.length > 0) {
      const { error } = await admin.from("duel_entries").delete().in(
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
      .from("duel_entries")
      .update({
        actor_profile_id: actor.id,
        quantity,
        raw_score: rawScore,
        weighted_score: weightedScore
      })
      .eq("id", firstRow.id);

    if (updateError) {
      return NextResponse.json({ message: updateError.message }, { status: 500 });
    }

    if (extraRows.length > 0) {
      await admin.from("duel_entries").delete().in(
        "id",
        extraRows.map((row) => row.id)
      );
    }
  } else {
    const { error: insertError } = await admin.from("duel_entries").insert({
      duel_id: duelId,
      participant_id: participantId,
      product_id: productId,
      actor_profile_id: actor.id,
      quantity,
      raw_score: rawScore,
      weighted_score: weightedScore
    });

    if (insertError) {
      return NextResponse.json({ message: insertError.message }, { status: 500 });
    }
  }

  revalidatePath("/kampanyalar");
  revalidatePath(`/kampanyalar/duello/${duelId}`);

  return NextResponse.json({
    quantity,
    weightedScore
  });
}
