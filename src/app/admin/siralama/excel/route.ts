import { NextResponse } from "next/server";
import { buildRankingExportWorkbook } from "@/lib/admin/build-ranking-export";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminAccessProfile = {
  id: string;
  role: string;
  approval: string;
};

async function ensureAdminRequest() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, approval")
    .eq("id", user.id)
    .single();

  const safeProfile = profile as AdminAccessProfile | null;

  if (!safeProfile || safeProfile.approval !== "approved" || safeProfile.role !== "admin") {
    return null;
  }

  return safeProfile;
}

export async function GET() {
  const adminProfile = await ensureAdminRequest();

  if (!adminProfile) {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

  const workbookXml = await buildRankingExportWorkbook();
  const fileName = `tanca-super-lig-siralamalar-${new Date().toISOString().slice(0, 10)}.xls`;

  return new NextResponse(workbookXml, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
