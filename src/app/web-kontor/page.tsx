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
    startDay?: string;
    endDay?: string;
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
const COMPANY_PROFIT_COLORS = ["#14b8a6", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#22c55e", "#f97316", "#06b6d4"];

function buildStoreHref(store: string) {
  const params = new URLSearchParams();
  if (store) {
    params.set("store", store);
  }
  return `/web-kontor?${params.toString()}`;
}

function buildExcelHref(store: string, startDay = "", endDay = "") {
  const params = new URLSearchParams();
  if (store) {
    params.set("store", store);
  }
  if (startDay) {
    params.set("startDay", startDay);
  }
  if (endDay) {
    params.set("endDay", endDay);
  }
  return `/web-kontor/excel?${params.toString()}`;
}

function buildCompanyRangeHref(startDay = "", endDay = "") {
  const params = new URLSearchParams({ store: COMPANY_STORE_VALUE });
  if (startDay) {
    params.set("startDay", startDay);
  }
  if (endDay) {
    params.set("endDay", endDay);
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
      <main className="web-kontor-page">
        <h1 className="page-title">Web Kontor</h1>
        <p className="page-subtitle">Bu kullanici icin gosterilecek Web Kontor verisi bulunamadi.</p>
      </main>
    );
  }

  const requestedStore = String(params?.store ?? "").trim();
  const isCompanySelected = canViewAllStores && (!requestedStore || requestedStore === COMPANY_STORE_VALUE);
  const dayLabels = webKontorData.dailyRows.map((row) => row.dayLabel);
  const requestedStartDay = dayLabels.includes(String(params?.startDay ?? "")) ? String(params?.startDay) : "";
  const requestedEndDay = dayLabels.includes(String(params?.endDay ?? "")) ? String(params?.endDay) : "";
  const requestedStartIndex = requestedStartDay ? dayLabels.indexOf(requestedStartDay) : 0;
  const requestedEndIndex = requestedEndDay ? dayLabels.indexOf(requestedEndDay) : Math.max(0, dayLabels.length - 1);
  const rangeStartIndex = Math.min(requestedStartIndex, requestedEndIndex);
  const rangeEndIndex = Math.max(requestedStartIndex, requestedEndIndex);
  const visibleCompanyDailySourceRows = isCompanySelected
    ? webKontorData.dailyRows.filter((_, index) => index >= rangeStartIndex && index <= rangeEndIndex)
    : webKontorData.dailyRows;
  const selectedStore = isCompanySelected
    ? COMPANY_STORE_LABEL
    : accessibleStoreNames.find((storeName) => sameWebKontorStore(storeName, requestedStore)) ?? accessibleStoreNames[0];

  const visibleStoreSummaries = webKontorData.storeSummaries
    .filter((summary) => accessibleStoreNames.some((storeName) => sameWebKontorStore(storeName, summary.storeName)))
    .sort((left, right) => left.storeName.localeCompare(right.storeName, "tr"));

  const bonusRows = visibleStoreSummaries.map((summary) => {
    const scopedSummary = isCompanySelected
      ? {
          ...summary,
          totalAmount: visibleCompanyDailySourceRows.reduce((sum, dailyRow) => {
            const storeAmount = dailyRow.storeAmounts.find((item) => sameWebKontorStore(item.storeName, summary.storeName));
            return sum + (storeAmount?.amount ?? 0);
          }, 0)
        }
      : summary;

    return buildBonusRow(
      scopedSummary,
      isCompanySelected ? visibleCompanyDailySourceRows : webKontorData.dailyRows,
      webKontorData.scaleRules,
      webKontorData.scaleOneRate,
      webKontorData.scaleTwoRate
    );
  });

  const selectedBonusRow = isCompanySelected
    ? null
    : bonusRows.find((row) => sameWebKontorStore(row.storeName, selectedStore)) ?? bonusRows[0];
  const selectedDailyRows = isCompanySelected
    ? bonusRows.flatMap((bonusRow) =>
        buildSelectedDayRows(
          bonusRow.storeName,
          visibleCompanyDailySourceRows,
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
    ? visibleCompanyDailySourceRows.map((dailyRow) => ({
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
      const successRate = visibleCompanyDailySourceRows.length > 0
        ? (successfulDayCount / visibleCompanyDailySourceRows.length) * 100
        : 0;

      return [bonusRow.storeName, successRate];
    })
  );
  const selectedStoreSuccessRate = !isCompanySelected && webKontorData.dailyRows.length > 0
    ? (selectedDailyRows.filter((row) => row.bonusAmount > 0).length / webKontorData.dailyRows.length) * 100
    : 0;
  const companyRangeTotalsByStore = new Map(
    bonusRows.map((bonusRow) => {
      const rows = selectedDailyRows.filter((row) => sameWebKontorStore(row.storeName ?? "", bonusRow.storeName));
      return [
        bonusRow.storeName,
        {
          amount: rows.reduce((sum, row) => sum + row.amount, 0),
          bonus: rows.reduce((sum, row) => sum + row.bonusAmount, 0)
        }
      ];
    })
  );
  const companyProfitTotal = bonusRows.reduce(
    (sum, row) => sum + Math.max(0, companyRangeTotalsByStore.get(row.storeName)?.amount ?? 0),
    0
  );
  const companyProfitShareRows = bonusRows.map((row, index) => {
    const amount = Math.max(0, companyRangeTotalsByStore.get(row.storeName)?.amount ?? 0);
    return {
      storeName: row.storeName,
      amount,
      share: companyProfitTotal > 0 ? (amount / companyProfitTotal) * 100 : 0,
      color: COMPANY_PROFIT_COLORS[index % COMPANY_PROFIT_COLORS.length]
    };
  });
  let companyProfitPieCursor = 0;
  const companyProfitPieGradient = companyProfitShareRows
    .map((row) => {
      const start = companyProfitPieCursor;
      companyProfitPieCursor += row.share;
      return `${row.color} ${start}% ${companyProfitPieCursor}%`;
    })
    .join(", ");
  const companyDistributedBonusTotal = bonusRows.reduce(
    (sum, row) => sum + Math.max(0, companyRangeTotalsByStore.get(row.storeName)?.bonus ?? 0),
    0
  );
  const companyBonusShare = companyProfitTotal > 0
    ? Math.min(100, (companyDistributedBonusTotal / companyProfitTotal) * 100)
    : 0;
  const companyRemainingProfit = Math.max(0, companyProfitTotal - companyDistributedBonusTotal);
  const companyRemainingProfitShare = Math.max(0, 100 - companyBonusShare);
  const companyBonusShareRows = bonusRows.map((row, index) => {
    const amount = Math.max(0, companyRangeTotalsByStore.get(row.storeName)?.bonus ?? 0);
    return {
      storeName: row.storeName,
      amount,
      share: companyDistributedBonusTotal > 0 ? (amount / companyDistributedBonusTotal) * 100 : 0,
      color: COMPANY_PROFIT_COLORS[index % COMPANY_PROFIT_COLORS.length]
    };
  });
  let companyBonusPieCursor = 0;
  const companyBonusPieGradient = companyBonusShareRows
    .map((row) => {
      const start = companyBonusPieCursor;
      companyBonusPieCursor += row.share;
      return `${row.color} ${start}% ${companyBonusPieCursor}%`;
    })
    .join(", ");

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
            {isCompanySelected ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(145px, 210px))",
                  gap: 10,
                  alignItems: "end",
                  marginTop: 10
                }}
              >
                <label className="field" style={{ gap: 5 }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Başlangıç Günü</span>
                  <FilterSelectNav
                    ariaLabel="Firma başlangıç günü"
                    value={buildCompanyRangeHref(requestedStartDay, requestedEndDay)}
                    options={[
                      { label: "İlk Gün (Tümü)", value: buildCompanyRangeHref("", requestedEndDay) },
                      ...dayLabels.map((dayLabel) => ({
                        label: dayLabel,
                        value: buildCompanyRangeHref(dayLabel, requestedEndDay)
                      }))
                    ]}
                  />
                </label>
                <label className="field" style={{ gap: 5 }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Bitiş Günü</span>
                  <FilterSelectNav
                    ariaLabel="Firma bitiş günü"
                    value={buildCompanyRangeHref(requestedStartDay, requestedEndDay)}
                    options={[
                      { label: "Son Gün (Tümü)", value: buildCompanyRangeHref(requestedStartDay, "") },
                      ...dayLabels.map((dayLabel) => ({
                        label: dayLabel,
                        value: buildCompanyRangeHref(requestedStartDay, dayLabel)
                      }))
                    ]}
                  />
                </label>
              </div>
            ) : null}
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
            href={buildExcelHref(
              isCompanySelected ? COMPANY_STORE_VALUE : selectedStore,
              isCompanySelected ? requestedStartDay : "",
              isCompanySelected ? requestedEndDay : ""
            )}
          >
            Excel'e İndir
          </a>
        </div>

        <div className={isCompanySelected ? "web-kontor-company-table-scroll" : undefined} style={{ overflowX: "auto" }}>
          {isCompanySelected ? (
            <table
              className="goal-company-trend-table web-kontor-trend-table web-kontor-company-daily-table"
              style={{ minWidth: Math.max(900, bonusRows.length * 260 + 120), fontSize: "0.94rem" }}
            >
              <thead>
                <tr>
                  <th className="web-kontor-sticky-day-column" rowSpan={2} style={{ fontWeight: 600, padding: "12px 14px" }}>Gün</th>
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
                    <th className="web-kontor-sticky-day-column" style={{ fontWeight: 500, padding: "10px 14px" }}>{row.dayLabel}</th>
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
                  <th className="web-kontor-sticky-day-column" style={{ fontWeight: 600, padding: "11px 14px" }}>Şube Toplamı</th>
                  {bonusRows.flatMap((row) => {
                    const totals = companyRangeTotalsByStore.get(row.storeName);
                    return [
                      <td key={`company-profit-total-${row.storeName}`} style={{ fontWeight: 600, padding: "11px 12px" }}>{formatCurrency(totals?.amount ?? 0)}</td>,
                      <td key={`company-bonus-total-${row.storeName}`} style={{ fontWeight: 600, padding: "11px 12px" }}>{formatCurrency(totals?.bonus ?? 0)}</td>
                    ];
                  })}
                </tr>
                <tr>
                  <th
                    className="web-kontor-sticky-day-column"
                    title="Çalışılan toplam gün içinde prim aldığınız günlerin oranını göstermektedir."
                    style={{ fontWeight: 600, padding: "11px 14px", cursor: "help" }}
                  >
                    Günlük Başarı %
                  </th>
                  {bonusRows.map((row) => {
                    const successRate = companySuccessRateByStore.get(row.storeName) ?? 0;
                    const isSuccessful = successRate >= 70;

                    return (
                      <td
                        key={`company-success-rate-${row.storeName}`}
                        colSpan={2}
                        className={successRate < 20 ? "web-kontor-success-critical" : undefined}
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
            <table className="goal-company-trend-table web-kontor-trend-table" style={{ fontSize: "0.94rem" }}>
              <thead>
                <tr>
                  <th style={{ fontWeight: 600, padding: "11px 14px" }}>Gün</th>
                  <th style={{ fontWeight: 500, padding: "11px 12px" }}>Gerçekleşen</th>
                  <th style={{ fontWeight: 500, padding: "11px 12px" }}>Barem</th>
                  <th style={{ fontWeight: 500, padding: "11px 12px" }}>Prim Oranı</th>
                  <th style={{ fontWeight: 500, padding: "11px 12px" }}>Günlük Prim</th>
                </tr>
              </thead>
              <tbody>
                {selectedDailyRows.map((row) => (
                  <tr key={`web-kontor-day-${selectedStore}-${row.dayLabel}`}>
                    <th style={{ fontWeight: 500, padding: "10px 14px" }}>{row.dayLabel}</th>
                    <td style={{ ...getDailyRowTextStyle(row.reachedScale), fontWeight: 500, padding: "10px 12px" }}>{formatCurrency(row.amount)}</td>
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
                    <td style={{ ...getDailyRowTextStyle(row.reachedScale), fontWeight: 500, padding: "10px 12px" }}>{formatWebKontorRate(row.rateValue)}</td>
                    <td style={{ ...getDailyRowTextStyle(row.reachedScale), fontWeight: 500, padding: "10px 12px" }}>{formatCurrency(row.bonusAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th style={{ fontWeight: 600, padding: "11px 14px" }}>Genel Toplam</th>
                  <td style={{ fontWeight: 500, padding: "11px 12px" }}>{formatCurrency(selectedTotalAmount)}</td>
                  <td style={{ fontWeight: 500, padding: "11px 12px" }}>-</td>
                  <td style={{ fontWeight: 500, padding: "11px 12px" }}>-</td>
                  <td style={{ fontWeight: 500, padding: "11px 12px" }}>{formatCurrency(selectedBonusAmount)}</td>
                </tr>
                <tr>
                  <th
                    title="Çalışılan toplam gün içinde prim aldığınız günlerin oranını göstermektedir."
                    style={{ cursor: "help", fontWeight: 600, padding: "11px 14px" }}
                  >
                    Günlük Başarı %
                  </th>
                  <td
                    colSpan={4}
                    className={selectedStoreSuccessRate < 20 ? "web-kontor-success-critical" : undefined}
                    style={{
                      textAlign: "center",
                      fontWeight: 500,
                      padding: "11px 12px",
                      color: selectedStoreSuccessRate >= 70 ? "#15803d" : "#dc2626",
                      background: selectedStoreSuccessRate >= 70 ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.07)"
                    }}
                  >
                    {formatPercent(selectedStoreSuccessRate)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      {isCompanySelected ? (
        <section className="campaign-section-card web-kontor-profit-share-card">
          <div className="goal-section-head web-kontor-section-head" style={sectionHeadStyle}>
            <div style={{ display: "grid", gap: 7 }}>
              <h2 style={sectionTitleStyle}>Şubelerin Kârlılık Payları</h2>
              <span style={sectionMetaStyle}>Seçilen gün aralığındaki firma kârlılık toplamı: {formatCurrency(companyProfitTotal)}</span>
            </div>
          </div>

          {companyProfitTotal > 0 ? (
            <div className="web-kontor-profit-share-layout">
              <div className="web-kontor-pie-stage">
                <div
                  className="web-kontor-pie-3d"
                  style={{ background: `conic-gradient(${companyProfitPieGradient})` }}
                  role="img"
                  aria-label="Şubelerin firma kârlılığı içindeki paylarını gösteren pasta grafik"
                />
              </div>
              <div className="web-kontor-profit-legend">
                {companyProfitShareRows.map((row) => (
                  <div className="web-kontor-profit-legend-row" key={`profit-share-${row.storeName}`}>
                    <span className="web-kontor-profit-swatch" style={{ background: row.color }} aria-hidden="true" />
                    <span className="web-kontor-profit-store">{row.storeName}</span>
                    <span>{formatCurrency(row.amount)}</span>
                    <strong>{formatPercent(row.share)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty-state">Seçilen gün aralığında pasta grafikte gösterilecek kârlılık bulunamadı.</p>
          )}
        </section>
      ) : null}

      {isCompanySelected ? (
        <section className="campaign-section-card web-kontor-profit-share-card">
          <div className="goal-section-head web-kontor-section-head" style={sectionHeadStyle}>
            <div style={{ display: "grid", gap: 7 }}>
              <h2 style={sectionTitleStyle}>Firma Toplam Kârlılık ve Dağıtılan Prim</h2>
              <span style={sectionMetaStyle}>
                Seçilen gün aralığında toplam kârlılığın prim olarak dağıtılan payı gösterilir.
              </span>
            </div>
          </div>

          {companyProfitTotal > 0 ? (
            <div className="web-kontor-profit-share-layout">
              <div className="web-kontor-pie-stage">
                <div
                  className="web-kontor-pie-3d"
                  style={{
                    background: `conic-gradient(#ef4444 0% ${companyBonusShare}%, #14b8a6 ${companyBonusShare}% 100%)`
                  }}
                  role="img"
                  aria-label="Firma toplam kârlılığı içinde dağıtılan prim ve kalan kârlılık paylarını gösteren pasta grafik"
                />
              </div>
              <div className="web-kontor-profit-legend">
                <div className="web-kontor-profit-legend-row">
                  <span className="web-kontor-profit-swatch" style={{ background: "#0b2143" }} aria-hidden="true" />
                  <span className="web-kontor-profit-store">Firma Toplam Kârlılık</span>
                  <span>{formatCurrency(companyProfitTotal)}</span>
                  <strong>%100</strong>
                </div>
                <div className="web-kontor-profit-legend-row">
                  <span className="web-kontor-profit-swatch" style={{ background: "#ef4444" }} aria-hidden="true" />
                  <span className="web-kontor-profit-store">Dağıtılan Prim</span>
                  <span>{formatCurrency(companyDistributedBonusTotal)}</span>
                  <strong>{formatPercent(companyBonusShare)}</strong>
                </div>
                <div className="web-kontor-profit-legend-row">
                  <span className="web-kontor-profit-swatch" style={{ background: "#14b8a6" }} aria-hidden="true" />
                  <span className="web-kontor-profit-store">Prim Sonrası Kalan Kârlılık</span>
                  <span>{formatCurrency(companyRemainingProfit)}</span>
                  <strong>{formatPercent(companyRemainingProfitShare)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <p className="empty-state">Seçilen gün aralığında pasta grafikte gösterilecek firma kârlılığı bulunamadı.</p>
          )}
        </section>
      ) : null}

      {isCompanySelected ? (
        <section className="campaign-section-card web-kontor-profit-share-card">
          <div className="goal-section-head web-kontor-section-head" style={sectionHeadStyle}>
            <div style={{ display: "grid", gap: 7 }}>
              <h2 style={sectionTitleStyle}>Şubelerin Prim Dağılımı</h2>
              <span style={sectionMetaStyle}>
                Seçilen gün aralığında dağıtılan toplam prim: {formatCurrency(companyDistributedBonusTotal)}
              </span>
            </div>
          </div>

          {companyDistributedBonusTotal > 0 ? (
            <div className="web-kontor-profit-share-layout">
              <div className="web-kontor-pie-stage">
                <div
                  className="web-kontor-pie-3d"
                  style={{ background: `conic-gradient(${companyBonusPieGradient})` }}
                  role="img"
                  aria-label="Dağıtılan toplam primin şubelere göre paylarını gösteren pasta grafik"
                />
              </div>
              <div className="web-kontor-profit-legend">
                {companyBonusShareRows.map((row) => (
                  <div className="web-kontor-profit-legend-row" key={`bonus-share-${row.storeName}`}>
                    <span className="web-kontor-profit-swatch" style={{ background: row.color }} aria-hidden="true" />
                    <span className="web-kontor-profit-store">{row.storeName}</span>
                    <span>{formatCurrency(row.amount)}</span>
                    <strong>{formatPercent(row.share)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty-state">Seçilen gün aralığında şubelere dağıtılmış prim bulunamadı.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
