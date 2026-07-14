import { NextResponse } from "next/server";
import { getDuelDashboardData } from "@/lib/duel/get-duel-dashboard-data";
import { buildCsv } from "@/lib/export/csv";
import { createClient } from "@/lib/supabase/server";

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "duello"
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ duelId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const dashboard = await getDuelDashboardData(user.id);

  if (!dashboard || dashboard.profile.approval !== "approved") {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

  const { duelId } = await context.params;
  const duel =
    dashboard.activeDuels.find((item) => item.id === duelId) ??
    dashboard.finishedDuels.find((item) => item.id === duelId) ??
    dashboard.plannedDuels.find((item) => item.id === duelId) ??
    null;

  if (!duel) {
    return NextResponse.json({ error: "Duello bulunamadi." }, { status: 404 });
  }

  const rows: Array<Array<string | number>> = [
    ["Duello", duel.name],
    ["Olcum", duel.scoring === "points" ? "Puan" : "Adet"],
    ["Baslangic", duel.start_at],
    ["Bitis", duel.end_at],
    [],
    ["Kisi / Grup", ...duel.productMatrix.map((product) => product.name), "Toplam"]
  ];

  duel.participants.forEach((participant, participantIndex) => {
    const productValues = duel.productMatrix.map((product) =>
      Number(product.participantCells[participantIndex] ?? 0)
    );
    rows.push([
      participant.label,
      ...productValues,
      productValues.reduce((sum, value) => sum + value, 0)
    ]);
  });

  const productTotals = duel.productMatrix.map((product) => Number(product.total ?? 0));
  rows.push([
    "Toplam",
    ...productTotals,
    productTotals.reduce((sum, value) => sum + value, 0)
  ]);

  const csv = buildCsv(rows);
  const fileName = `${safeFileName(duel.name)}-urun-ozetleri.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
