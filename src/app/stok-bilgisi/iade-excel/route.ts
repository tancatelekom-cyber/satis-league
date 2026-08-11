import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchStockManagementDashboard } from "@/lib/stock-management";

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Giriş yapılmadı." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("approval, role").eq("id", user.id).single();
  if (!profile || profile.approval !== "approved" || !["manager", "management", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  try {
    const dashboard = await fetchStockManagementDashboard();
    const branch = new URL(request.url).searchParams.get("branch")?.trim() ?? "";
    const units = dashboard.returnUnits.filter((unit) => !branch || unit.branchName === branch);
    const rows = [
      ["Ürün Adı", "Mağaza", "Seri Numarası", "Stok Yaşı (Gün)", "İade Durumu"],
      ...units.map((unit) => [unit.productName, unit.branchName, unit.serialNumber, unit.stockAge, unit.status])
    ];
    const csv = `\uFEFFsep=;\r\n${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const scope = branch ? branch.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ-]+/g, "-") : "firma-tumu";

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="iade-listesi-${scope}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "İade listesi oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
