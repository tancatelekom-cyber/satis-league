import { NextResponse } from "next/server";
import { calculateCompanyDashboardSuccess, calculateStoreDashboardSuccess } from "@/lib/dashboard-success";
import { fetchGoalDayStats, fetchGoalStoreRows } from "@/lib/goal-actuals";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getStoreName(store: Array<{ name: string }> | { name: string } | null | undefined) {
  return Array.isArray(store) ? store[0]?.name ?? "" : store?.name ?? "";
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ visible: false }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, approval, store:stores(name)")
    .eq("id", user.id)
    .single();

  if (!profile || profile.approval !== "approved" || !["manager", "management", "admin"].includes(profile.role)) {
    return NextResponse.json({ visible: false });
  }

  try {
    const [rows, dayStats] = await Promise.all([fetchGoalStoreRows(), fetchGoalDayStats()]);

    if (profile.role === "manager") {
      const storeName = getStoreName(profile.store as Array<{ name: string }> | { name: string } | null);
      if (!storeName) return NextResponse.json({ visible: false });

      return NextResponse.json({
        visible: true,
        label: "Mağaza Başarı",
        percent: calculateStoreDashboardSuccess(rows, dayStats, storeName),
        href: `/hedef-gerceklesen?view=store&store=${encodeURIComponent(storeName)}&panel=dashboard`
      });
    }

    return NextResponse.json({
      visible: true,
      label: "Firma Başarı",
      percent: calculateCompanyDashboardSuccess(rows, dayStats),
      href: "/hedef-gerceklesen?view=company&panel=dashboard"
    });
  } catch {
    return NextResponse.json({ visible: false });
  }
}
