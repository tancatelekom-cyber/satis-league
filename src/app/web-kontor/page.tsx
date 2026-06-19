import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { requireUser } from "@/lib/auth/require-user";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import {
  fetchWebKontorSheetData,
  formatWebKontorRate,
  getWebKontorRateMultiplier,
  sameWebKontorStore,
  type WebKontorDailyRow,
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

type WebKontorReachedScale = "2. Barem" | "1. Barem" | "Bareme Ulasmadi";

type WebKontorBonusRow = {
  storeName: string;
  totalAmount: number;
  scaleOneTarget: number | null;
  scaleTwoTarget: number | null;
  highestReachedScale: WebKontorReachedScale;
  firstScaleDayCount: number;
  secondScaleDayCount: number;
  bonusAmount: number;
};

type WebKontorDayBonusRow = {
  dayLabel: string;
  amount: number;
  reachedScale: WebKontorReachedScale;
  rateValue: number;
  bonusAmount: number;
  companyTotal: number;
};

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

function buildBonusRow(
  summary: WebKontorStoreSummary,
  dailyRows: WebKontorDailyRow[],
  scaleRules: Awaited<ReturnType<typeof fetchWebKontorSheetData>>["scaleRules"],
  scaleOneRate: number,
  scaleTwoRate: number
): WebKontorBonusRow {
  const scaleRule = scaleRules.find((rule) => sameWebKontorStore(rule.storeName, summary.storeName)) ?? null;
  const scaleOneTarget = scaleRule?.scaleOneTarget ?? null;
  const scaleTwoTarget = scaleRule?.scaleTwoTarget ?? null;
  let firstScaleDayCount = 0;
  let secondScaleDayCount = 0;
  let highestReachedScale: WebKontorReachedScale = "Bareme Ulasmadi";

  const bonusAmount = dailyRows.reduce((sum, row) => {
    const amount = row.storeAmounts.find((item) => sameWebKontorStore(item.storeName, summary.storeName))?.amount ?? 0;
    let rateValue = 0;

    if (scaleTwoTarget !== null && amount >= scaleTwoTarget) {
      rateValue = scaleTwoRate;
      secondScaleDayCount += 1;
      highestReachedScale = "2. Barem";
    } else if (scaleOneTarget !== null && amount >= scaleOneTarget) {
      rateValue = scaleOneRate;
      firstScaleDayCount += 1;
      if (highestReachedScale !== "2. Barem") {
        highestReachedScale = "1. Barem";
      }
    }

    return sum + amount * getWebKontorRateMultiplier(rateValue);
  }, 0);

  return {
    storeName: summary.storeName,
    totalAmount: summary.totalAmount,
    scaleOneTarget,
    scaleTwoTarget,
    highestReachedScale,
    firstScaleDayCount,
    secondScaleDayCount,
    bonusAmount
  };
}

function buildSelectedDayRows(
  selectedStore: string,
  dailyRows: WebKontorDailyRow[],
  scaleOneTarget: number | null,
  scaleTwoTarget: number | null,
  scaleOneRate: number,
  scaleTwoRate: number
): WebKontorDayBonusRow[] {
  return dailyRows.map((row) => {
    const amount = row.storeAmounts.find((item) => sameWebKontorStore(item.storeName, selectedStore))?.amount ?? 0;
    let reachedScale: WebKontorReachedScale = "Bareme Ulasmadi";
    let rateValue = 0;

    if (scaleTwoTarget !== null && amount >= scaleTwoTarget) {
      reachedScale = "2. Barem";
      rateValue = scaleTwoRate;
    } else if (scaleOneTarget !== null && amount >= scaleOneTarget) {
      reachedScale = "1. Barem";
      rateValue = scaleOneRate;
    }

    return {
      dayLabel: row.dayLabel,
      amount,
      reachedScale,
      rateValue,
      bonusAmount: amount * getWebKontorRateMultiplier(rateValue),
      companyTotal: row.companyTotal ?? 0
    };
  });
}

function getScaleBadgeStyle(reachedScale: WebKontorReachedScale): CSSProperties {
  if (reachedScale === "2. Barem") {
    return {
      background: "linear-gradient(135deg, #67e8f9, #34d399)",
      color: "#047857",
      border: "1px solid rgba(4, 120, 87, 0.24)"
    };
  }

  if (reachedScale === "1. Barem") {
    return {
      background: "linear-gradient(135deg, #ffe083, #ffd166)",
      color: "#15803d",
      border: "1px solid rgba(21, 128, 61, 0.2)"
    };
  }

  return {
    background: "rgba(239, 68, 68, 0.1)",
    color: "#dc2626",
    border: "1px solid rgba(220, 38, 38, 0.2)"
  };
}

function getDailyRowTextStyle(reachedScale: WebKontorReachedScale): CSSProperties {
  if (reachedScale === "Bareme Ulasmadi") {
    return {
      color: "#dc2626",
      fontWeight: 900
    };
  }

  return {
    color: "#15803d",
    fontWeight: 900
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

  const resolvedFeatureAccess = await getResolvedFeatureAccessForProfile("web-kontor", user.id, safeProfile.role);
  const canOpenWebKontor = resolvedFeatureAccess.allowed;

  if (!canOpenWebKontor) {
    redirect("/");
  }

  const webKontorData = await fetchWebKontorSheetData();

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
      webKontorData.dailyRows,
      webKontorData.scaleRules,
      webKontorData.scaleOneRate,
      webKontorData.scaleTwoRate
    )
  );

  const selectedBonusRow = bonusRows.find((row) => sameWebKontorStore(row.storeName, selectedStore)) ?? bonusRows[0];
  const selectedDailyRows = buildSelectedDayRows(
    selectedStore,
    webKontorData.dailyRows,
    selectedBonusRow?.scaleOneTarget ?? null,
    selectedBonusRow?.scaleTwoTarget ?? null,
    webKontorData.scaleOneRate,
    webKontorData.scaleTwoRate
  );

  const summaryCardStyle: CSSProperties = {
    padding: "18px 20px",
    borderRadius: 24,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(4, 92, 96, 0.16)",
    boxShadow: "0 16px 28px rgba(8, 22, 40, 0.08)",
    display: "grid",
    gap: 6
  };

  const sectionHeadStyle: CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap"
  };

  const sectionTitleStyle: CSSProperties = {
    margin: 0,
    color: "#0b2143",
    fontSize: "1.95rem",
    fontWeight: 900,
    lineHeight: 1.05
  };

  const sectionMetaStyle: CSSProperties = {
    color: "#37516f",
    fontSize: "1rem",
    fontWeight: 700
  };

  return (
    <main>
      <h1 className="page-title">Web Kontor</h1>
      <p className="page-subtitle">
        Gunluk Web Kontor karlilik tutarlarini, bareme gore olusan prim skalasini ve gunluk kazanimi izleyin.
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
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{selectedBonusRow?.highestReachedScale ?? "-"}</strong>
            <span style={{ color: "#37516f" }}>
              1. barem gunu {formatNumber(selectedBonusRow?.firstScaleDayCount ?? 0)} | 2. barem gunu {formatNumber(selectedBonusRow?.secondScaleDayCount ?? 0)}.
            </span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Prim Kazanimi</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{formatCurrency(selectedBonusRow?.bonusAmount ?? 0)}</strong>
            <span style={{ color: "#37516f" }}>Gunluk gerceklesenler barem oranlariyla carpilarak toplanir.</span>
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
        <div className="goal-section-head web-kontor-section-head" style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>Prim Skala Tablosu</h2>
          <span style={sectionMetaStyle}>
            1. barem primi {formatWebKontorRate(webKontorData.scaleOneRate)} | 2. barem primi {formatWebKontorRate(webKontorData.scaleTwoRate)}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="goal-company-trend-table">
            <thead>
              <tr>
                <th>Sube</th>
                <th>Gerceklesen</th>
                <th>1. Barem</th>
                <th>2. Barem</th>
                <th>1. Barem Gun</th>
                <th>2. Barem Gun</th>
                <th>Ulasilan</th>
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
                    <td>{formatCurrency(row.scaleOneTarget)}</td>
                    <td>{formatCurrency(row.scaleTwoTarget)}</td>
                    <td>{formatNumber(row.firstScaleDayCount)}</td>
                    <td>{formatNumber(row.secondScaleDayCount)}</td>
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
                          ...getScaleBadgeStyle(row.highestReachedScale)
                        }}
                      >
                        {row.highestReachedScale}
                      </span>
                    </td>
                    <td>{formatCurrency(row.bonusAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head web-kontor-section-head" style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>{selectedStore} Gunluk Web Kontor Akisi</h2>
          <span style={sectionMetaStyle}>
            Firma toplam gerceklesen {formatCurrency(webKontorData.companyTotal)} | Prim toplami {formatCurrency(selectedBonusRow?.bonusAmount ?? 0)}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="goal-company-trend-table">
            <thead>
              <tr>
                <th>Gun</th>
                <th>{selectedStore}</th>
                <th>Barem</th>
                <th>Prim Orani</th>
                <th>Gunluk Prim</th>
                <th>Firma Toplami</th>
              </tr>
            </thead>
            <tbody>
              {selectedDailyRows.map((row) => (
                <tr key={`web-kontor-day-${row.dayLabel}`}>
                  <th>{row.dayLabel}</th>
                  <td style={getDailyRowTextStyle(row.reachedScale)}>{formatCurrency(row.amount)}</td>
                  <td>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 110,
                        padding: "8px 12px",
                        borderRadius: 999,
                        fontWeight: 900,
                        ...getScaleBadgeStyle(row.reachedScale)
                      }}
                    >
                      {row.reachedScale}
                    </span>
                  </td>
                  <td style={getDailyRowTextStyle(row.reachedScale)}>{formatWebKontorRate(row.rateValue)}</td>
                  <td style={getDailyRowTextStyle(row.reachedScale)}>{formatCurrency(row.bonusAmount)}</td>
                  <td style={getDailyRowTextStyle(row.reachedScale)}>{formatCurrency(row.companyTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
