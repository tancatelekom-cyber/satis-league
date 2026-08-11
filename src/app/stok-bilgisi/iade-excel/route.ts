import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchStockManagementDashboard, type StockReturnUnit } from "@/lib/stock-management";

function xml(value: string | number) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function worksheet(name: string, title: string, units: StockReturnUnit[]) {
  const headers = ["Ürün Adı", "Mağaza", "Seri Numarası", "Stok Yaşı (Gün)", "İade Durumu"];
  const headerCells = headers.map((value) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(value)}</Data></Cell>`).join("");
  const dataRows = units.map((unit) => `<Row>
    <Cell><Data ss:Type="String">${xml(unit.productName)}</Data></Cell>
    <Cell><Data ss:Type="String">${xml(unit.branchName)}</Data></Cell>
    <Cell ss:StyleID="Serial"><Data ss:Type="String">${xml(unit.serialNumber)}</Data></Cell>
    <Cell><Data ss:Type="Number">${unit.stockAge}</Data></Cell>
    <Cell><Data ss:Type="String">${xml(unit.status)}</Data></Cell>
  </Row>`).join("");

  return `<Worksheet ss:Name="${xml(name)}"><Table>
    <Column ss:Width="280"/><Column ss:Width="110"/><Column ss:Width="150"/><Column ss:Width="100"/><Column ss:Width="145"/>
    <Row ss:Height="28"><Cell ss:MergeAcross="4" ss:StyleID="Title"><Data ss:Type="String">${xml(title)}</Data></Cell></Row>
    <Row>${headerCells}</Row>${dataRows}
  </Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>2</SplitHorizontal><TopRowBottomPane>2</TopRowBottomPane></WorksheetOptions></Worksheet>`;
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
    const active = units.filter((unit) => unit.status === "İade alarmı");
    const expired = units.filter((unit) => unit.status === "İade süresi geçmiş");
    const workbook = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="Default"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
<Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14" ss:Color="#FFFFFF"/><Interior ss:Color="#166534" ss:Pattern="Solid"/></Style>
<Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#15803D" ss:Pattern="Solid"/></Style>
<Style ss:ID="Serial"><NumberFormat ss:Format="@"/></Style></Styles>
${worksheet("İade Alarmı", "İADE ALARMI LİSTESİ", active)}
${worksheet("Süresi Geçmiş", "İADE SÜRESİ GEÇMİŞ ÜRÜNLER", expired)}
</Workbook>`;
    const scope = branch ? branch.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ-]+/g, "-") : "firma-tumu";
    return new NextResponse(`\uFEFF${workbook}`, { headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="iade-listesi-${scope}-${new Date().toISOString().slice(0, 10)}.xls"`,
      "Cache-Control": "no-store"
    }});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "İade listesi oluşturulamadı." }, { status: 500 });
  }
}
