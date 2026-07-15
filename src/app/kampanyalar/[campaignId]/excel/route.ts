import { NextResponse } from "next/server";
import { getCampaignDashboardData } from "@/lib/campaign/get-campaign-dashboard-data";
import { buildCsv } from "@/lib/export/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "kampanya";
}

function rewardLabel(
  campaign: {
    reward_first?: string | null;
    reward_second?: string | null;
    reward_third?: string | null;
  },
  index: number
) {
  if (index === 0) {
    return campaign.reward_first ?? "";
  }

  if (index === 1) {
    return campaign.reward_second ?? "";
  }

  if (index === 2) {
    return campaign.reward_third ?? "";
  }

  return "";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ campaignId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const dashboard = await getCampaignDashboardData(user.id);

  if (!dashboard || dashboard.profile.approval !== "approved") {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

  const { campaignId } = await context.params;
  const item =
    dashboard.activeLeaderboards.find((entry) => entry.campaign.id === campaignId) ??
    dashboard.finishedLeaderboards.find((entry) => entry.campaign.id === campaignId) ??
    null;

  if (!item) {
    return NextResponse.json({ error: "Kampanya bulunamadi." }, { status: 404 });
  }

  const view = new URL(request.url).searchParams.get("view");

  if (view === "products") {
    const admin = createAdminClient();
    const { data: salesEntries, error } = await admin
      .from("sales_entries")
      .select("product_id, target_profile_id, target_store_id, quantity")
      .eq("campaign_id", item.campaign.id);

    if (error) {
      return NextResponse.json({ error: "Urun satis ozeti olusturulamadi." }, { status: 500 });
    }

    const participantProductTotals = new Map<string, Map<string, number>>();

    ((salesEntries as Array<{
      product_id: string;
      target_profile_id: string | null;
      target_store_id: string | null;
      quantity: number;
    }> | null) ?? []).forEach((entry) => {
      const participantId =
        item.campaign.mode === "employee" ? entry.target_profile_id : entry.target_store_id;

      if (!participantId) {
        return;
      }

      const productTotals = participantProductTotals.get(participantId) ?? new Map<string, number>();
      productTotals.set(
        entry.product_id,
        Number(productTotals.get(entry.product_id) ?? 0) + Number(entry.quantity ?? 0)
      );
      participantProductTotals.set(participantId, productTotals);
    });

    const productRows = [
      [
        item.campaign.mode === "employee" ? "Calisan" : "Magaza",
        ...item.campaign.products.map((product) => product.name),
        "Toplam"
      ],
      ...item.leaderboard.map((participant) => {
        const values = item.campaign.products.map((product) =>
          Number(participantProductTotals.get(participant.id)?.get(product.id) ?? 0)
        );

        return [
          participant.label,
          ...values,
          values.reduce((sum, value) => sum + value, 0)
        ];
      })
    ];

    const csv = buildCsv(productRows);
    const fileName = `${safeFileName(item.campaign.name)}-urun-ozeti.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  }

  const rows = [
    ["Kampanya", item.campaign.name],
    ["Tur", item.campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"],
    ["Olcum", item.campaign.scoring === "points" ? "Puan" : "Adet"],
    ["Baslangic", item.campaign.start_at],
    ["Bitis", item.campaign.end_at],
    [],
    ["Sira", "Ad Soyad / Magaza", "Rozet", "Skor", "Odul"],
    ...item.leaderboard.map((row, index) => [
      index + 1,
      row.label,
      row.badge ?? "",
      Number(row.score.toFixed(0)),
      rewardLabel(item.campaign, index)
    ])
  ];

  const csv = buildCsv(rows);
  const fileName = `${safeFileName(item.campaign.name)}-siralama.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
