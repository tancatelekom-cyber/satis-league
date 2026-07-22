import { NextResponse } from "next/server";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { buildOrganizationChartData } from "@/lib/admin/organization-chart";
import { createOrganizationPdf } from "@/lib/admin/organization-pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function hasAdminAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, approval")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin" && profile.approval === "approved";
}

export async function GET() {
  if (!(await hasAdminAccess())) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const dashboardData = await getAdminDashboardData();
  const chartData = buildOrganizationChartData(
    dashboardData.managedProfileRows,
    dashboardData.storeRows
  );
  const pdfBuffer = await createOrganizationPdf(chartData);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=organizasyon-semasi.pdf",
      "Cache-Control": "no-store"
    }
  });
}
