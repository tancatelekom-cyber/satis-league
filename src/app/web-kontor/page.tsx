import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { requireUser } from "@/lib/auth/require-user";
import { canRoleAccessFeature, getFeatureMenuPermissions, getFeaturePermissionByKey } from "@/lib/feature-menu-permissions";
import { fetchGoalDayStats, fetchGoalStoreRows, type GoalDayStats, type GoalStoreRow } from "@/lib/goal-actuals";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import {
  fetchWebKontorSheetData,
  formatWebKontorRate,
  getWebKontorRateMultiplier,
  sameWebKontorStore,
  type WebKontorScaleRule,
  type WebKontorStoreSummary
} from "@/lib/web-kontor";

type PageProps = {
  searchParams?: Promise<{
    store?: string;
  }>;
};

type WebKontorProfile = {
  role: UserRole;
  approval: string;
  store: {
    name: string;
  } | null;
};

type WebKontorProgress = {
  target: number | null;
  actual: number;
  actualPercent: number | null;
  projectedPercent: number | null;
};

type WebKontorBonusRow = {
  storeName: string;
  totalAmount: number;
  actualPercent: number | null;
  projectedPercent: number | null;
  scaleOneTarget: number | null;
  scaleTwoTarget: number | null;
  reachedScale: "Skala 2" | "Skala 1" | "Henuz Yok";
  rateValue: number;
  bonusAmount: number;
};

const EMPTY_DAYS: GoalDayStats = {
  workedDays: 0,
  remainingDays: 0,
  totalDays: 0
};

function normalizeCategoryKey(value: string) {
  return String(value ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/\u0130/g, "I")
    .replace(/\u011E/g, "G")
    .replace(/\u00DC/g, "U")
    .replace(/\u015E/g, "S")
    .replace(/\u00D6/g, "O")
    .replace(/\u00C7/g, "C");
}

function isWebKontorCategory(value: string) {
  return normalizeCategoryKey(value).includes("WEB KONTOR KARLILIK");
}

function buildStoreHref(store: string) {
  const params = new URLSearchParams();
  if (store) {
    params.set("store", store);
  }
  return `/web-kontor?${params.toString()}`;
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

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })}`;
}

function buildWebKontorProgress(rows: GoalStoreRow[], dayStats: GoalDayStats): WebKontorProgress {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = totalTarget > 0;
  const includeProjection = rows.length > 0 && rows.every((row) => row.includeProjection);
  const projectedActual = includeProjection && dayStats.workedDays > 0 ? Math.floor((actual / dayStats.workedDays) * dayStats.totalDays) : actual;

  return {
    target: hasTarget ? totalTarget : null,
    actual,
    actualPercent: hasTarget ? (actual / totalTarget) * 100 : null,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null
  };
}

function findScaleRule(scaleRules: WebKontorScaleRule[], storeName: string) {
  return scaleRules.find((rule) => sameWebKontorStore(rule.storeName, storeName)) ?? null;
}

function buildBonusRow(
  summary: WebKontorStoreSummary,
  scaleRules: WebKontorScaleRule[],
  storeProgressRows: GoalStoreRow[],
  dayStats: GoalDayStats,
  scaleOneRate: number,
  scaleTwoRate: number
): WebKontorBonusRow {
  const scaleRule = findScaleRule(scaleRules, summary.storeName);
  const progress = buildWebKontorProgress(storeProgressRows, dayStats);
  const scaleOneTarget = scaleRule?.scaleOneTarget ?? null;
  const scaleTwoTarget = scaleRule?.scaleTwoTarget ?? null;

  let reachedScale: WebKontorBonusRow["reachedScale"] = "Henuz Yok";
  let rateValue = 0;

  if (progress.actualPercent !== null && scaleTwoTarget !== null && progress.actualPercent >= scaleTwoTarget) {
    reachedScale = "Skala 2";
    rateValue = scaleTwoRate;
  } else if (progress.actualPercent !== null && scaleOneTarget !== null && progress.actualPercent >= scaleOneTarget) {
    reachedScale = "Skala 1";
    rateValue = scaleOneRate;
  }

  return {
    storeName: summary.storeName,
    totalAmount: summary.totalAmount,
    actualPercent: progress.actualPercent,
    projectedPercent: progress.projectedPercent,
    scaleOneTarget,
    scaleTwoTarget,
    reachedScale,
    rateValue,
    bonusAmount: summary.totalAmount * getWebKontorRateMultiplier(rateValue)
  };
}

function getScaleBadgeStyle(reachedScale: WebKontorBonusRow["reachedScale"]): CSSProperties {
  if (reachedScale === "Skala 2") {
    return {
      background: "linear-gradient(135deg, #67e8f9, #34d399)",
      color: "#082032"
    };
  }

  if (reachedScale === "Skala 1") {
    return {
      background: "linear-gradient(135deg, #ffe083, #ffd166)",
      color: "#082032"
    };
  }

  return {
    background: "rgba(255,255,255,0.14)",
    color: "#f8fbff"
  };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WebKontorPage({ searchParams }: PageProps) {
  await requireUser();

  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("approval, role, store:stores(name)")
    .eq("id", user.id)
    .single();

  const safeProfile = (profile as WebKontorProfile | null) ?? null;

  if (!safeProfile || safeProfile.approval !== "approved") {
    redirect("/hesabim");
  }

  const { permissions } = await getFeatureMenuPermissions();
  const canOpenWebKontor = canRoleAccessFeature(getFeaturePermissionByKey(permissions, "web-kontor"), safeProfile.role);

  if (!canOpenWebKontor) {
    redirect("/");
  }

  const [webKontorData, storeRows, dayStats] = await Promise.all([
    fetchWebKontorSheetData(),
    fetchGoalStoreRows().catch(() => [] as GoalStoreRow[]),
    fetchGoalDayStats().catch(() => EMPTY_DAYS)
  ]);

  const ownStoreName = safeProfile.store?.name?.trim() ?? "";
  const canViewAllStores = safeProfile.role === "admin" || safeProfile.role === "management";
  const accessibleStoreNames = canViewAllStores
    ? webKontorData.storeNames
    : webKontorData.storeNames.filter((storeName) => sameWebKontorStore(storeName, ownStoreName));

  if (!accessibleStoreNames.length) {
    return (
      <main>
        <h1 className="page-title">Web Kontor</h1>
        <p className="page-subtitle">Bu kullanici icin gosterilecek Web Kontor verisi bulunamadi.</p>
      </main>
    );
  }

  const requestedStore = String(params?.store ?? "").trim();
  const selectedStore = accessibleStoreNames.find((storeName) => sameWebKontorStore(storeName, requestedStore)) ?? accessibleStoreNames[0];

  const visibleStoreSummaries = webKontorData.storeSummaries
    .filter((summary) => accessibleStoreNames.some((storeName) => sameWebKontorStore(storeName, summary.storeName)))
    .sort((left, right) => left.storeName.localeCompare(right.storeName, "tr"));

  const bonusRows = visibleStoreSummaries.map((summary) =>
    buildBonusRow(
      summary,
      webKontorData.scaleRules,
      storeRows.filter((row) => sameWebKontorStore(row.storeCode, summary.storeName) && isWebKontorCategory(row.mainCategory)),
      dayStats,
      webKontorData.scaleOneRate,
      webKontorData.scaleTwoRate
    )
  );

  const selectedBonusRow = bonusRows.find((row) => sameWebKontorStore(row.storeName, selectedStore)) ?? bonusRows[0];
  const selectedDailyRows = webKontorData.dailyRows.map((row) => ({
    dayLabel: row.dayLabel,
    storeAmount: row.storeAmounts.find((item) => sameWebKontorStore(item.storeName, selectedStore))?.amount ?? 0,
    companyTotal: row.companyTotal ?? 0
  }));

  const summaryCardStyle: CSSProperties = {
    padding: "18px 20px",
    borderRadius: 24,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(4, 92, 96, 0.16)",
    boxShadow: "0 16px 28px rgba(8, 22, 40, 0.08)",
    display: "grid",
    gap: 6
  };

  return (
    <main>
      <h1 className="page-title">Web Kontor</h1>
      <p className="page-subtitle">
        Gunluk Web Kontor karlilik tutarlarini, hedefe gore ulasilan prim skalasini ve tahmini kazanim tablosunu izleyin.
      </p>

      <section className="guide-card game-brief-card" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Secili Sube</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{selectedStore}</strong>
            <span style={{ color: "#37516f" }}>Prim hesabi bu sube icin detaylandirildi.</span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Gerceklesen Tutar</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{formatCurrency(selectedBonusRow?.totalAmount ?? 0)}</strong>
            <span style={{ color: "#37516f" }}>Ayin su ana kadarki Web Kontor karlilik tutari.</span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Ulasilan Skala</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{selectedBonusRow?.reachedScale ?? "-"}</strong>
            <span style={{ color: "#37516f" }}>
              Hedef yuzdesine gore aktif prim orani {formatWebKontorRate(selectedBonusRow?.rateValue ?? 0)}.
            </span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Prim Kazanimi</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{formatCurrency(selectedBonusRow?.bonusAmount ?? 0)}</strong>
            <span style={{ color: "#37516f" }}>Gerceklesen tutar x aktif skala orani.</span>
          </article>
        </div>

        {canViewAllStores ? (
          <div className="admin-form">
            <label className="field">
              <span>Detay Alinacak Sube</span>
              <FilterSelectNav
                ariaLabel="Web Kontor sube secimi"
                value={buildStoreHref(selectedStore)}
                options={accessibleStoreNames.map((storeName) => ({
                  label: storeName,
                  value: buildStoreHref(storeName)
                }))}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head">
          <h2>Prim Skala Tablosu</h2>
          <span>
            1. skala payi {formatWebKontorRate(webKontorData.scaleOneRate)} | 2. skala payi {formatWebKontorRate(webKontorData.scaleTwoRate)}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="goal-company-trend-table">
            <thead>
              <tr>
                <th>Sube</th>
                <th>Gerceklesen</th>
                <th>Hedef %</th>
                <th>Ay Sonu %</th>
                <th>1. Skala</th>
                <th>2. Skala</th>
                <th>Ulasilan</th>
                <th>Prim Orani</th>
                <th>Prim Kazanimi</th>
              </tr>
            </thead>
            <tbody>
              {bonusRows.map((row) => {
                const isSelected = sameWebKontorStore(row.storeName, selectedStore);

                return (
                  <tr key={row.storeName}>
                    <th
                      style={
                        isSelected
                          ? {
                              background: "#ffd166",
                              color: "#082032"
                            }
                          : undefined
                      }
                    >
                      {row.storeName}
                    </th>
                    <td>{formatCurrency(row.totalAmount)}</td>
                    <td>{formatPercent(row.actualPercent)}</td>
                    <td>{formatPercent(row.projectedPercent)}</td>
                    <td>{formatPercent(row.scaleOneTarget)}</td>
                    <td>{formatPercent(row.scaleTwoTarget)}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 92,
                          padding: "8px 12px",
                          borderRadius: 999,
                          fontWeight: 900,
                          ...getScaleBadgeStyle(row.reachedScale)
                        }}
                      >
                        {row.reachedScale}
                      </span>
                    </td>
                    <td>{formatWebKontorRate(row.rateValue)}</td>
                    <td>{formatCurrency(row.bonusAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head">
          <h2>{selectedStore} Gunluk Web Kontor Akisi</h2>
          <span>
            Firma toplam gerceklesen {formatCurrency(webKontorData.companyTotal)} | Calisilan gun {formatNumber(dayStats.workedDays)}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="goal-company-trend-table">
            <thead>
              <tr>
                <th>Gun</th>
                <th>{selectedStore}</th>
                <th>Firma Toplami</th>
              </tr>
            </thead>
            <tbody>
              {selectedDailyRows.map((row) => (
                <tr key={`web-kontor-day-${row.dayLabel}`}>
                  <th>{row.dayLabel}</th>
                  <td>{formatCurrency(row.storeAmount)}</td>
                  <td>{formatCurrency(row.companyTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
