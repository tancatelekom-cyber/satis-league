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
  storeName?: string;
  dayLabel: string;
  amount: number;
  reachedScale: WebKontorReachedScale;
  rateValue: number;
  bonusAmount: number;
  companyTotal: number;
};

const COMPANY_STORE_VALUE = "__company__";
const COMPANY_STORE_LABEL = "FİRMA";

function buildStoreHref(store: string) {
  const params = new URLSearchParams();
  if (store) {
    params.set("store", store);
  }
  return `/web-kontor?${params.toString()}`;
}

function buildExcelHref(store: string) {
  const params = new URLSearchParams();
  if (store) {
    params.set("store", store);
  }
  return `/web-kontor/excel?${params.toString()}`;
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
      <main className="web-kontor-page">
        <h1 className="page-title">Web Kontor</h1>
        <p className="page-subtitle">Bu kullanici icin gosterilecek Web Kontor verisi bulunamadi.</p>
      </main>
    );
  }

  const requestedStore = String(params?.store ?? "").trim();
  const isCompanySelected = canViewAllStores && requestedStore === COMPANY_STORE_VALUE;
  const selectedStore = isCompanySelected
    ? COMPANY_STORE_LABEL
    : accessibleStoreNames.find((storeName) => sameWebKontorStore(storeName, requestedStore)) ?? accessibleStoreNames[0];

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

  const selectedBonusRow = isCompanySelected
    ? null
    : bonusRows.find((row) => sameWebKontorStore(row.storeName, selectedStore)) ?? bonusRows[0];
  const selectedDailyRows = isCompanySelected
    ? bonusRows.flatMap((bonusRow) =>
        buildSelectedDayRows(
          bonusRow.storeName,
          webKontorData.dailyRows,
          bonusRow.scaleOneTarget,
          bonusRow.scaleTwoTarget,
          webKontorData.scaleOneRate,
          webKontorData.scaleTwoRate
        ).map((row) => ({ ...row, storeName: bonusRow.storeName }))
      )
    : buildSelectedDayRows(
        selectedStore,
        webKontorData.dailyRows,
        selectedBonusRow?.scaleOneTarget ?? null,
        selectedBonusRow?.scaleTwoTarget ?? null,
        webKontorData.scaleOneRate,
        webKontorData.scaleTwoRate
      );
  const selectedTotalAmount = isCompanySelected
    ? bonusRows.reduce((sum, row) => sum + row.totalAmount, 0)
    : selectedBonusRow?.totalAmount ?? 0;
  const selectedBonusAmount = isCompanySelected
    ? bonusRows.reduce((sum, row) => sum + row.bonusAmount, 0)
    : selectedBonusRow?.bonusAmount ?? 0;
  const selectedFirstScaleDayCount = isCompanySelected
    ? bonusRows.reduce((sum, row) => sum + row.firstScaleDayCount, 0)
    : selectedBonusRow?.firstScaleDayCount ?? 0;
  const selectedSecondScaleDayCount = isCompanySelected
    ? bonusRows.reduce((sum, row) => sum + row.secondScaleDayCount, 0)
    : selectedBonusRow?.secondScaleDayCount ?? 0;
  const companyDailyRows = isCompanySelected
    ? webKontorData.dailyRows.map((dailyRow) => ({
        dayLabel: dailyRow.dayLabel,
        stores: bonusRows.map((bonusRow) => ({
          storeName: bonusRow.storeName,
          detail: selectedDailyRows.find(
            (row) => row.dayLabel === dailyRow.dayLabel && sameWebKontorStore(row.storeName ?? "", bonusRow.storeName)
          )
        }))
      }))
    : [];
  const companySuccessRateByStore = new Map(
    bonusRows.map((bonusRow) => {
      const successfulDayCount = selectedDailyRows.filter(
        (row) => sameWebKontorStore(row.storeName ?? "", bonusRow.storeName) && row.bonusAmount > 0
      ).length;
      const successRate = webKontorData.dailyRows.length > 0
        ? (successfulDayCount / webKontorData.dailyRows.length) * 100
        : 0;

      return [bonusRow.storeName, successRate];
    })
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
    <main className="web-kontor-page">
      <h1 className="page-title">Web Kontor</h1>
      <p className="page-subtitle">
        Gunluk Web Kontor karlilik tutarlarini, bareme gore olusan prim skalasini ve gunluk kazanimi izleyin.
      </p>

      <section className="guide-card game-brief-card" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>{isCompanySelected ? "Seçili Kapsam" : "Seçili Şube"}</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{selectedStore}</strong>
            <span style={{ color: "#37516f" }}>
              {isCompanySelected ? "Tüm şubelerin prim sonuçları birlikte gösteriliyor." : "Prim hesabı bu şube için detaylandırıldı."}
            </span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Gerceklesen Tutar</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{formatCurrency(selectedTotalAmount)}</strong>
            <span style={{ color: "#37516f" }}>Ayin su ana kadarki Web Kontor karlilik tutari.</span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Ulasilan Skala</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>
              {isCompanySelected ? "Şube Bazlı" : selectedBonusRow?.highestReachedScale ?? "-"}
            </strong>
            <span style={{ color: "#37516f" }}>
              1. barem günü {formatNumber(selectedFirstScaleDayCount)} | 2. barem günü {formatNumber(selectedSecondScaleDayCount)}.
            </span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Prim Kazanimi</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{formatCurrency(selectedBonusAmount)}</strong>
            <span style={{ color: "#37516f" }}>Gunluk gerceklesenler barem oranlariyla carpilarak toplanir.</span>
          </article>
        </div>

        {canViewAllStores ? (
          <div className="admin-form">
            <label className="field">
              <span>Detay Alınacak Şube / Firma</span>
              <FilterSelectNav
                ariaLabel="Web Kontor sube secimi"
                value={buildStoreHref(isCompanySelected ? COMPANY_STORE_VALUE : selectedStore)}
                options={[
                  { label: COMPANY_STORE_LABEL, value: buildStoreHref(COMPANY_STORE_VALUE) },
                  ...accessibleStoreNames.map((storeName) => ({
                    label: storeName,
                    value: buildStoreHref(storeName)
                  }))
                ]}
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
          <table className="goal-company-trend-table web-kontor-trend-table">
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
                const isSelected = !isCompanySelected && sameWebKontorStore(row.storeName, selectedStore);

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
                        className="web-kontor-scale-badge"
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
          <div style={{ display: "grid", gap: 8 }}>
            <h2 style={sectionTitleStyle}>{selectedStore} Günlük Web Kontör Akışı</h2>
            <span style={sectionMetaStyle}>
              Prim toplamı {formatCurrency(selectedBonusAmount)}
            </span>
          </div>
          <a
            className="button-secondary export-link-button"
            href={buildExcelHref(isCompanySelected ? COMPANY_STORE_VALUE : selectedStore)}
          >
            Excel'e İndir
          </a>
        </div>

        <div style={{ overflowX: "auto" }}>
          {isCompanySelected ? (
            <table
              className="goal-company-trend-table web-kontor-trend-table"
              style={{ minWidth: Math.max(900, bonusRows.length * 260 + 120), fontSize: "0.94rem" }}
            >
              <thead>
                <tr>
                  <th rowSpan={2} style={{ fontWeight: 600, padding: "12px 14px" }}>Gün</th>
                  {bonusRows.map((row) => (
                    <th
                      key={`company-store-head-${row.storeName}`}
                      colSpan={2}
                      style={{ textAlign: "center", fontWeight: 600, padding: "12px 14px", letterSpacing: "0.01em" }}
                    >
                      {row.storeName}
                    </th>
                  ))}
                </tr>
                <tr>
                  {bonusRows.flatMap((row) => [
                    <th key={`company-profit-head-${row.storeName}`} style={{ fontWeight: 500, padding: "10px 12px" }}>Kârlılık</th>,
                    <th key={`company-bonus-head-${row.storeName}`} style={{ fontWeight: 500, padding: "10px 12px" }}>Prim</th>
                  ])}
                </tr>
              </thead>
              <tbody>
                {companyDailyRows.map((row) => (
                  <tr key={`company-web-kontor-day-${row.dayLabel}`}>
                    <th style={{ fontWeight: 500, padding: "10px 14px" }}>{row.dayLabel}</th>
                    {row.stores.flatMap((store) => [
                      <td
                        key={`company-profit-${store.storeName}-${row.dayLabel}`}
                        style={{ ...getDailyRowTextStyle(store.detail?.reachedScale ?? "Bareme Ulasmadi"), fontWeight: 500, padding: "10px 12px" }}
                      >
                        {formatCurrency(store.detail?.amount ?? 0)}
                      </td>,
                      <td
                        key={`company-bonus-${store.storeName}-${row.dayLabel}`}
                        style={{ ...getDailyRowTextStyle(store.detail?.reachedScale ?? "Bareme Ulasmadi"), fontWeight: 500, padding: "10px 12px" }}
                      >
                        {formatCurrency(store.detail?.bonusAmount ?? 0)}
                      </td>
                    ])}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th style={{ fontWeight: 600, padding: "11px 14px" }}>Şube Toplamı</th>
                  {bonusRows.flatMap((row) => [
                    <td key={`company-profit-total-${row.storeName}`} style={{ fontWeight: 600, padding: "11px 12px" }}>{formatCurrency(row.totalAmount)}</td>,
                    <td key={`company-bonus-total-${row.storeName}`} style={{ fontWeight: 600, padding: "11px 12px" }}>{formatCurrency(row.bonusAmount)}</td>
                  ])}
                </tr>
                <tr>
                  <th style={{ fontWeight: 600, padding: "11px 14px" }}>Günlük Başarı %</th>
                  {bonusRows.map((row) => {
                    const successRate = companySuccessRateByStore.get(row.storeName) ?? 0;
                    const isSuccessful = successRate >= 70;

                    return (
                      <td
                        key={`company-success-rate-${row.storeName}`}
                        colSpan={2}
                        style={{
                          fontWeight: 600,
                          padding: "11px 12px",
                          textAlign: "center",
                          color: isSuccessful ? "#15803d" : "#dc2626",
                          background: isSuccessful ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.07)"
                        }}
                      >
                        {formatPercent(successRate)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="goal-company-trend-table web-kontor-trend-table">
              <thead>
                <tr>
                  <th>Gün</th>
                  <th>Gerçekleşen</th>
                  <th>Barem</th>
                  <th>Prim Oranı</th>
                  <th>Günlük Prim</th>
                </tr>
              </thead>
              <tbody>
                {selectedDailyRows.map((row) => (
                  <tr key={`web-kontor-day-${selectedStore}-${row.dayLabel}`}>
                    <th>{row.dayLabel}</th>
                    <td style={getDailyRowTextStyle(row.reachedScale)}>{formatCurrency(row.amount)}</td>
                    <td>
                      <span
                        className="web-kontor-scale-badge"
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
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Genel Toplam</th>
                  <td>{formatCurrency(selectedTotalAmount)}</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{formatCurrency(selectedBonusAmount)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
