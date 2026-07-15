import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";
import { buildCsv } from "@/lib/export/csv";
import { buildManagerPrimeSummary, fetchManagerPrimePassword } from "@/lib/manager-prime";
import { roleLabels } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { MANAGER_PRIME_ACCESS_COOKIE } from "../constants";

type ManagerProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  approval: string;
  store_id?: string | null;
  store: {
    name: string;
  } | null;
};

type ManagerStoreOption = {
  id: string;
  managerName: string;
  managerRole: UserRole;
  storeName: string;
};

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "magaza-muduru-primi"
  );
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })} TL`;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  })}`;
}

function toTextResponse(message: string, status = 400) {
  return new NextResponse(message, { status });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return toTextResponse("Oturum bulunamadi.", 401);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, approval, store_id, store:stores(name)")
    .eq("id", user.id)
    .single();

  const safeProfile = (profile as ManagerProfileRow | null) ?? null;
  if (!safeProfile || safeProfile.approval !== "approved") {
    return toTextResponse("Profil onayi bulunamadi.", 403);
  }

  const resolvedFeatureAccess = await getResolvedFeatureAccessForProfile("mudur-primi", user.id, safeProfile.role);
  if (!resolvedFeatureAccess.allowed || !["manager", "management", "admin"].includes(safeProfile.role)) {
    return toTextResponse("Bu alan icin yetkiniz yok.", 403);
  }

  const expectedPassword = await fetchManagerPrimePassword();
  const cookieStore = await cookies();
  const storedPassword = cookieStore.get(MANAGER_PRIME_ACCESS_COOKIE)?.value?.trim() ?? "";

  if (expectedPassword && storedPassword !== expectedPassword) {
    return toTextResponse("Sayfa sifresi gecersiz.", 403);
  }

  let storeProfilesData: ManagerProfileRow[] | null = null;

  if (safeProfile.role === "manager") {
    storeProfilesData = safeProfile.store?.name
      ? [
          {
            id: safeProfile.id,
            full_name: safeProfile.full_name,
            role: safeProfile.role,
            approval: safeProfile.approval,
            store_id: safeProfile.store_id ?? null,
            store: safeProfile.store
          }
        ]
      : [];
  } else {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, role, approval, store_id, store:stores(name)")
      .eq("approval", "approved")
      .not("store_id", "is", null)
      .in("role", ["employee", "manager"])
      .order("full_name", { ascending: true });

    storeProfilesData = (data as ManagerProfileRow[] | null) ?? [];
  }

  const storeProfiles = (storeProfilesData ?? []).filter((item) => item.full_name && item.store?.name);
  const managerStoreMap = new Map<string, ManagerStoreOption>();

  for (const item of storeProfiles) {
    const storeName = item.store?.name?.trim();
    if (!storeName) {
      continue;
    }

    const existing = managerStoreMap.get(storeName);
    const preferredRole = item.role === "manager";
    const currentIsManager = existing?.managerRole === "manager";

    if (!existing || (preferredRole && !currentIsManager)) {
      managerStoreMap.set(storeName, {
        id: item.id,
        managerName: item.full_name,
        managerRole: item.role,
        storeName
      });
    }
  }

  const allManagers = Array.from(managerStoreMap.values()).sort((left, right) =>
    left.storeName.localeCompare(right.storeName, "tr")
  );
  const ownStoreName = safeProfile.store?.name?.trim() ?? "";
  const visibleManagers =
    safeProfile.role === "manager" && ownStoreName
      ? allManagers.filter((item) => item.storeName === ownStoreName)
      : allManagers;

  if (!visibleManagers.length) {
    return toTextResponse("Gosterilecek magaza muduru kaydi bulunamadi.", 404);
  }

  const url = new URL(request.url);
  const requestedManagerId = url.searchParams.get("manager")?.trim() ?? "";
  const selectedManager = visibleManagers.find((item) => item.id === requestedManagerId) ?? visibleManagers[0];
  const summary = await buildManagerPrimeSummary(selectedManager.managerName, selectedManager.storeName);

  if (!summary) {
    return toTextResponse("Secili magaza icin prim ozeti olusturulamadi.", 404);
  }

  const rows: Array<Array<string | number>> = [
    ["Magaza Muduru Prim Hakedisi"],
    ["Magaza", summary.storeName],
    ["Magaza Muduru", selectedManager.managerName],
    ["Rol", roleLabels[selectedManager.managerRole]],
    ["Mevcut Prim", formatCurrency(summary.currentPrimeTotal)],
    ["Ay Sonu Prim Ongorusu", formatCurrency(summary.projectedPrimeTotal)],
    ["Rekontratlama Tempo", formatPercent(summary.metrics.recontract.actualTempo)],
    ["Ay Sonu Rekontratlama", formatPercent(summary.metrics.recontract.projectedTempo)],
    ["Rekontratlama Primi (%100 ve uzeri, adet basi 10 TL)", formatCurrency(summary.currentRecontractReward)],
    ["Ay Sonu Rekontratlama Primi", formatCurrency(summary.projectedRecontractReward)],
    ["Aksesuar Primi", formatCurrency(summary.currentAccessoryReward)],
    ["Ay Sonu Aksesuar", formatCurrency(summary.projectedAccessoryReward)],
    [],
    ["Prim Dagilim Detayi"],
    [
      "Kategori",
      "Su An Tempo",
      "Ay Sonu Tempo",
      "Su An Skala",
      "Ay Sonu Skala",
      "Su An Baz",
      "Ay Sonu Baz",
      "Su An Prim",
      "Ay Sonu Prim"
    ]
  ];

  summary.rows.forEach((row) => {
    const accessoryRow = row.key === "accessory";
    const recontractRow = row.key === "recontract";
    rows.push([
      row.label,
      formatPercent(row.actualTempo),
      formatPercent(row.projectedTempo),
      row.currentScaleLabel,
      row.projectedScaleLabel,
      accessoryRow
        ? formatPercent(row.currentBaseValue, 0)
        : recontractRow
          ? `${formatCurrency(row.currentBaseValue)}/adet`
          : formatCurrency(row.currentBaseValue),
      accessoryRow
        ? formatPercent(row.projectedBaseValue, 0)
        : recontractRow
          ? `${formatCurrency(row.projectedBaseValue)}/adet`
          : formatCurrency(row.projectedBaseValue),
      formatCurrency(row.currentReward),
      formatCurrency(row.projectedReward)
    ]);
  });

  rows.push([
    "Toplam",
    formatPercent(summary.metrics.recontract.actualTempo),
    formatPercent(summary.metrics.recontract.projectedTempo),
    "-",
    "-",
    formatCurrency(summary.currentNonAccessoryBaseTotal),
    formatCurrency(summary.projectedNonAccessoryBaseTotal),
    formatCurrency(summary.currentPrimeTotal),
    formatCurrency(summary.projectedPrimeTotal)
  ]);

  rows.push([], ["Kategori Tempo Ozetleri"], ["Kategori", "Hedef", "Gerceklesen", "Ay Sonu Ongorusu", "Su An Tempo", "Ay Sonu Tempo"]);
  Object.values(summary.metrics).forEach((metric) => {
    rows.push([
      metric.label,
      metric.target ? formatNumber(metric.target) : "-",
      formatNumber(metric.actual),
      formatNumber(metric.projected),
      formatPercent(metric.actualTempo),
      formatPercent(metric.projectedTempo)
    ]);
  });

  rows.push([], ["Ay Sonu Gelir Artis Firsatlari"]);
  if (summary.opportunities.length) {
    rows.push(["Kategori", "Sonraki Skala", "Tahmini Gelir Artisi", "Gunluk Ek Uretim", "Toplam Ek Ihtiyac"]);
    summary.opportunities.forEach((item) => {
      rows.push([
        item.label,
        item.nextScaleLabel,
        formatCurrency(item.estimatedIncrease),
        formatNumber(item.dailyRequired, 2),
        formatNumber(item.additionalRequiredTotal, 2)
      ]);
    });
  } else {
    rows.push(["Ek gelir firsati icin acik bir ust skala kalmadi."]);
  }

  const csv = buildCsv(rows);
  const fileName = safeFileName(`magaza-muduru-primi-${summary.storeName}-${selectedManager.managerName}`);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}.csv"`,
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}
