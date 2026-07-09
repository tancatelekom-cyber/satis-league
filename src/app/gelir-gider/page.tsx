import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { requireUser } from "@/lib/auth/require-user";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";
import {
  fetchRevenueExpensePassword,
  fetchRevenueExpenseRows,
  getRevenueExpenseMonthLabel,
  sameRevenueExpenseStore,
  type RevenueExpenseRow
} from "@/lib/revenue-expense";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { RevenueExpenseAccessWatcher } from "./access-watcher";
import { unlockRevenueExpensePage } from "./actions";
import { REVENUE_EXPENSE_ACCESS_COOKIE } from "./constants";

type PageProps = {
  searchParams?: Promise<{
    year?: string;
    month?: string;
    store?: string;
    hata?: string;
  }>;
};

type RevenueExpenseProfile = {
  id: string;
  role: UserRole;
  approval: string;
};

type MonthlySummaryRow = {
  periodKey: string;
  periodLabel: string;
  income: number;
  expense: number;
  net: number;
};

type CategorySummaryRow = {
  category: string;
  amount: number;
};

type CategoryPeriodSummaryRow = {
  category: string;
  months: MonthlySummaryRow[];
  total: number;
};

type StoreSummaryRow = {
  storeName: string;
  income: number;
  expense: number;
  net: number;
};

const ALL_FILTER_VALUE = "__all__";

function formatCurrency(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} TL`;
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

function formatChartValue(value: number) {
  return formatNumber(Math.round(value));
}

function buildRevenueExpenseHref(filters: {
  year?: string;
  month?: string;
  store?: string;
}) {
  const params = new URLSearchParams();

  if (filters.year && filters.year !== ALL_FILTER_VALUE) {
    params.set("year", filters.year);
  }

  if (filters.month && filters.month !== ALL_FILTER_VALUE) {
    params.set("month", filters.month);
  }

  if (filters.store && filters.store !== ALL_FILTER_VALUE) {
    params.set("store", filters.store);
  }

  const query = params.toString();
  return query ? `/gelir-gider?${query}` : "/gelir-gider";
}

function buildMonthlySummary(rows: RevenueExpenseRow[]) {
  const periodMap = new Map<string, MonthlySummaryRow>();

  for (const row of rows) {
    const existing = periodMap.get(row.periodKey) ?? {
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
      income: 0,
      expense: 0,
      net: 0
    };

    if (row.kind === "gelir") {
      existing.income += row.amount;
    } else {
      existing.expense += row.amount;
    }

    existing.net = existing.income - existing.expense;
    periodMap.set(row.periodKey, existing);
  }

  return Array.from(periodMap.values())
    .filter((row) => row.income > 0 || row.expense > 0)
    .sort((left, right) => left.periodKey.localeCompare(right.periodKey));
}

function buildCategorySummary(rows: RevenueExpenseRow[], kind: "gelir" | "gider") {
  const categoryMap = new Map<string, number>();

  for (const row of rows) {
    if (row.kind !== kind) {
      continue;
    }

    categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + row.amount);
  }

  return Array.from(categoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount
    }))
    .sort((left, right) => right.amount - left.amount || left.category.localeCompare(right.category, "tr"));
}

function buildCategoryPeriodSummaries(rows: RevenueExpenseRow[], kind: "gelir" | "gider") {
  const categoryMap = new Map<string, RevenueExpenseRow[]>();

  for (const row of rows) {
    if (row.kind !== kind) {
      continue;
    }

    const bucket = categoryMap.get(row.category) ?? [];
    bucket.push(row);
    categoryMap.set(row.category, bucket);
  }

  return Array.from(categoryMap.entries())
    .map(([category, categoryRows]) => {
      const months = buildMonthlySummary(categoryRows).filter((monthRow) =>
        kind === "gelir" ? monthRow.income > 0 : monthRow.expense > 0
      );
      const total = categoryRows.reduce((sum, row) => sum + row.amount, 0);

      return {
        category,
        months,
        total
      } satisfies CategoryPeriodSummaryRow;
    })
    .sort((left, right) => right.total - left.total || left.category.localeCompare(right.category, "tr"));
}

function buildStoreSummary(rows: RevenueExpenseRow[]) {
  const storeMap = new Map<string, StoreSummaryRow>();

  for (const row of rows) {
    const existing = storeMap.get(row.storeName) ?? {
      storeName: row.storeName,
      income: 0,
      expense: 0,
      net: 0
    };

    if (row.kind === "gelir") {
      existing.income += row.amount;
    } else {
      existing.expense += row.amount;
    }

    existing.net = existing.income - existing.expense;
    storeMap.set(row.storeName, existing);
  }

  return Array.from(storeMap.values()).sort(
    (left, right) => right.net - left.net || left.storeName.localeCompare(right.storeName, "tr")
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RevenueExpensePage({ searchParams }: PageProps) {
  await requireUser();

  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: profile } = await supabase.from("profiles").select("id, role, approval").eq("id", user.id).single();
  const safeProfile = (profile as RevenueExpenseProfile | null) ?? null;

  if (!safeProfile || safeProfile.approval !== "approved") {
    redirect("/hesabim");
  }

  const resolvedFeatureAccess = await getResolvedFeatureAccessForProfile("gelir-gider", user.id, safeProfile.role);
  if (!resolvedFeatureAccess.allowed) {
    redirect("/");
  }

  if (!["management", "admin"].includes(safeProfile.role)) {
    redirect("/");
  }

  const expectedPassword = await fetchRevenueExpensePassword();
  const cookieStore = await cookies();
  const storedPassword = cookieStore.get(REVENUE_EXPENSE_ACCESS_COOKIE)?.value?.trim() ?? "";
  const requiresPassword = Boolean(expectedPassword);
  const passwordError = String(params?.hata ?? "").trim() === "sifre";

  if (requiresPassword && storedPassword !== expectedPassword) {
    return (
      <main className="web-kontor-page">
        <h1 className="page-title">Gelir Gider Analizi</h1>
        <p className="page-subtitle">
          Bu sayfa icin Sheet uzerinde tanimli sifre gereklidir. Devam etmek icin gecerli sifreyi girin.
        </p>

        <section className="guide-card game-brief-card manager-prime-password-card">
          <form action={unlockRevenueExpensePage} className="admin-form manager-prime-password-form">
            <label className="field manager-prime-password-field">
              <span>Sayfa Sifresi</span>
              <input
                type="password"
                name="password"
                placeholder="Sifreyi girin"
                autoComplete="current-password"
                autoFocus
                required
              />
            </label>

            {passwordError ? <p className="manager-prime-password-error">Girilen sifre hatali. Lutfen tekrar deneyin.</p> : null}

            <button type="submit" className="button-primary manager-prime-password-button">
              Sayfayi Ac
            </button>
          </form>
        </section>
      </main>
    );
  }

  const rows = await fetchRevenueExpenseRows();
  const years = [...new Set(rows.map((row) => row.year))].sort((left, right) => right - left);
  const stores = [...new Set(rows.map((row) => row.storeName))].sort((left, right) => left.localeCompare(right, "tr"));

  const requestedYear = String(params?.year ?? ALL_FILTER_VALUE).trim() || ALL_FILTER_VALUE;
  const selectedYear =
    requestedYear === ALL_FILTER_VALUE || years.some((year) => String(year) === requestedYear) ? requestedYear : ALL_FILTER_VALUE;

  const requestedMonth = String(params?.month ?? ALL_FILTER_VALUE).trim() || ALL_FILTER_VALUE;
  const selectedMonth =
    requestedMonth === ALL_FILTER_VALUE || (Number(requestedMonth) >= 1 && Number(requestedMonth) <= 12)
      ? requestedMonth === ALL_FILTER_VALUE
        ? ALL_FILTER_VALUE
        : String(Number(requestedMonth))
      : ALL_FILTER_VALUE;

  const requestedStore = String(params?.store ?? ALL_FILTER_VALUE).trim() || ALL_FILTER_VALUE;
  const matchedStore = stores.find((storeName) => sameRevenueExpenseStore(storeName, requestedStore)) ?? null;
  const selectedStore = requestedStore === ALL_FILTER_VALUE ? ALL_FILTER_VALUE : matchedStore?.trim() || ALL_FILTER_VALUE;

  const monthScopedRows = rows.filter((row) => {
    if (selectedYear !== ALL_FILTER_VALUE && row.year !== Number(selectedYear)) {
      return false;
    }

    if (selectedStore !== ALL_FILTER_VALUE && !sameRevenueExpenseStore(row.storeName, selectedStore)) {
      return false;
    }

    return true;
  });

  const availableMonths = [...new Set(monthScopedRows.filter((row) => row.amount > 0).map((row) => row.month))].sort(
    (left, right) => left - right
  );

  const filteredRows = rows.filter((row) => {
    if (selectedYear !== ALL_FILTER_VALUE && row.year !== Number(selectedYear)) {
      return false;
    }

    if (selectedMonth !== ALL_FILTER_VALUE && row.month !== Number(selectedMonth)) {
      return false;
    }

    if (selectedStore !== ALL_FILTER_VALUE && !sameRevenueExpenseStore(row.storeName, selectedStore)) {
      return false;
    }

    return true;
  });

  const totalIncome = filteredRows.filter((row) => row.kind === "gelir").reduce((sum, row) => sum + row.amount, 0);
  const totalExpense = filteredRows.filter((row) => row.kind === "gider").reduce((sum, row) => sum + row.amount, 0);
  const totalNet = totalIncome - totalExpense;
  const monthlySummary = buildMonthlySummary(filteredRows);
  const incomeCategories = buildCategorySummary(filteredRows, "gelir");
  const expenseCategories = buildCategorySummary(filteredRows, "gider");
  const incomeCategoryPeriods = buildCategoryPeriodSummaries(filteredRows, "gelir");
  const expenseCategoryPeriods = buildCategoryPeriodSummaries(filteredRows, "gider");
  const storeSummary = buildStoreSummary(filteredRows);
  const activeStoreCount = new Set(filteredRows.map((row) => row.storeName)).size;
  const activeCategoryCount = new Set(filteredRows.map((row) => `${row.kind}:${row.category}`)).size;
  const selectedStoreLabel = selectedStore === ALL_FILTER_VALUE ? "Tum Magazalar" : selectedStore;
  const selectedPeriodLabel = (() => {
    if (selectedYear === ALL_FILTER_VALUE && selectedMonth === ALL_FILTER_VALUE) {
      return "Tum Donemler";
    }

    if (selectedYear !== ALL_FILTER_VALUE && selectedMonth === ALL_FILTER_VALUE) {
      return `${selectedYear} Tum Aylar`;
    }

    if (selectedYear === ALL_FILTER_VALUE && selectedMonth !== ALL_FILTER_VALUE) {
      return `${getRevenueExpenseMonthLabel(Number(selectedMonth))} Tum Yillar`;
    }

    return `${getRevenueExpenseMonthLabel(Number(selectedMonth))} ${selectedYear}`;
  })();

  const incomeValues = monthlySummary.map((item) => item.income);
  const expenseValues = monthlySummary.map((item) => item.expense);
  const netValues = monthlySummary.map((item) => Math.abs(item.net));
  const chartMax = Math.max(1, ...incomeValues, ...expenseValues, ...netValues);
  const chartGroups = monthlySummary.map((item) => ({
    periodKey: item.periodKey,
    periodLabel: item.periodLabel,
    bars: [
      {
        key: "income",
        label: "Gelir",
        value: item.income,
        color: "#22c55e",
        textColor: "#166534"
      },
      {
        key: "expense",
        label: "Gider",
        value: item.expense,
        color: "#ef4444",
        textColor: "#b91c1c"
      },
      {
        key: "net",
        label: "Net",
        value: item.net,
        renderValue: Math.abs(item.net),
        color: item.net >= 0 ? "#0b2143" : "#f97316",
        textColor: item.net >= 0 ? "#0b2143" : "#c2410c"
      }
    ]
  }));
  const chartAreaHeight = 250;

  const summaryCardStyle: CSSProperties = {
    padding: "18px 20px",
    borderRadius: 24,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(4, 92, 96, 0.16)",
    boxShadow: "0 16px 28px rgba(8, 22, 40, 0.08)",
    display: "grid",
    gap: 6
  };

  const sectionSubtitleStyle: CSSProperties = {
    color: "#4b647f"
  };

  return (
    <main className="web-kontor-page">
      <RevenueExpenseAccessWatcher />

      <h1 className="page-title">Gelir Gider Analizi</h1>
      <p className="page-subtitle" style={{ color: "#3d5875" }}>
        Firma gelirlerini, giderlerini ve net karlilik akisini ay ay takip edin. Donem filtrelerini degistirerek tum tablo ve grafikler aninda guncellenir.
      </p>

      <section className="guide-card game-brief-card" style={{ display: "grid", gap: 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14
          }}
        >
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Secili Magaza</span>
            <strong style={{ color: "#0b2143", fontSize: "1.6rem", lineHeight: 1.1 }}>{selectedStoreLabel}</strong>
            <span style={{ color: "#37516f" }}>Tek magazayi ya da tumunu ayrintili olarak inceleyin.</span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Secili Donem</span>
            <strong style={{ color: "#0b2143", fontSize: "1.6rem", lineHeight: 1.1 }}>{selectedPeriodLabel}</strong>
            <span style={{ color: "#37516f" }}>Grafik ve tum tablolar bu doneme gore hesaplanir.</span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Magaza Sayisi</span>
            <strong style={{ color: "#0b2143", fontSize: "1.6rem", lineHeight: 1 }}>{formatNumber(activeStoreCount)}</strong>
            <span style={{ color: "#37516f" }}>Secili gorunumde hesaplanan magaza adedi.</span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Kategori Sayisi</span>
            <strong style={{ color: "#0b2143", fontSize: "1.6rem", lineHeight: 1 }}>{formatNumber(activeCategoryCount)}</strong>
            <span style={{ color: "#37516f" }}>Gelir ve gider tarafinda bulunan aktif kategori sayisi.</span>
          </article>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Toplam Gelir</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{formatCurrency(totalIncome)}</strong>
            <span style={{ color: "#37516f" }}>Secili filtrede gelir tarafinin toplam tutari.</span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Toplam Gider</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>{formatCurrency(totalExpense)}</strong>
            <span style={{ color: "#37516f" }}>Secili filtrede gider tarafinin toplam tutari.</span>
          </article>
          <article style={summaryCardStyle}>
            <span style={{ color: "#56708c", fontWeight: 700 }}>Net Karlilik</span>
            <strong
              style={{
                color: totalNet >= 0 ? "#047857" : "#dc2626",
                fontSize: "2rem",
                lineHeight: 1
              }}
            >
              {formatCurrency(totalNet)}
            </strong>
            <span style={{ color: "#37516f" }}>Gelir eksi gider sonucu olusan net bakiye.</span>
          </article>
        </div>

        <div className="admin-form" style={{ display: "grid", gap: 14 }}>
          <div className="user-management-grid">
            <label className="field">
              <span>Magaza</span>
              <FilterSelectNav
                ariaLabel="Gelir gider magaza secimi"
                value={buildRevenueExpenseHref({ year: selectedYear, month: selectedMonth, store: selectedStore })}
                options={[
                  { label: "Tumu", value: buildRevenueExpenseHref({ year: selectedYear, month: selectedMonth, store: ALL_FILTER_VALUE }) },
                  ...stores.map((storeName) => ({
                    label: storeName,
                    value: buildRevenueExpenseHref({ year: selectedYear, month: selectedMonth, store: storeName })
                  }))
                ]}
              />
            </label>

            <label className="field">
              <span>Yil</span>
              <FilterSelectNav
                ariaLabel="Gelir gider yil secimi"
                value={buildRevenueExpenseHref({ year: selectedYear, month: selectedMonth, store: selectedStore })}
                options={[
                  { label: "Tumu", value: buildRevenueExpenseHref({ year: ALL_FILTER_VALUE, month: selectedMonth, store: selectedStore }) },
                  ...years.map((year) => ({
                    label: String(year),
                    value: buildRevenueExpenseHref({ year: String(year), month: selectedMonth, store: selectedStore })
                  }))
                ]}
              />
            </label>

            <label className="field">
              <span>Ay</span>
              <FilterSelectNav
                ariaLabel="Gelir gider ay secimi"
                value={buildRevenueExpenseHref({ year: selectedYear, month: selectedMonth, store: selectedStore })}
                options={[
                  { label: "Tumu", value: buildRevenueExpenseHref({ year: selectedYear, month: ALL_FILTER_VALUE, store: selectedStore }) },
                  ...availableMonths.map((month) => {
                    return {
                      label: getRevenueExpenseMonthLabel(month),
                      value: buildRevenueExpenseHref({ year: selectedYear, month: String(month), store: selectedStore })
                    };
                  })
                ]}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head web-kontor-section-head">
          <div>
            <h2 className="goal-panel-title">Aylik Gelir Gider Grafigi</h2>
            <p className="goal-panel-subtitle" style={sectionSubtitleStyle}>
              Gelir, gider ve net karlilik cizgileri secili doneme gore birlikte izlenir.
            </p>
          </div>
        </div>

        {monthlySummary.length ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <span className="status-chip approve" style={{ background: "rgba(34, 197, 94, 0.12)", color: "#15803d" }}>
                Gelir
              </span>
              <span className="status-chip" style={{ background: "rgba(239, 68, 68, 0.12)", color: "#dc2626" }}>
                Gider
              </span>
              <span className="status-chip" style={{ background: "rgba(11, 33, 67, 0.1)", color: "#0b2143" }}>
                Net Karlilik
              </span>
            </div>

            <div
              style={{
                overflowX: "auto",
                padding: "20px 16px 8px",
                borderRadius: 28,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(11,33,67,0.08)"
              }}
            >
              <div
                style={{
                  minWidth: Math.max(680, chartGroups.length * 122),
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 18
                }}
              >
                {chartGroups.map((group) => (
                  <div
                    key={`revenue-chart-group-${group.periodKey}`}
                    style={{
                      flex: "0 0 104px",
                      display: "grid",
                      gap: 10
                    }}
                  >
                    <div
                      style={{
                        height: chartAreaHeight,
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        gap: 8,
                        padding: "0 4px",
                        borderBottom: "2px solid rgba(11,33,67,0.12)"
                      }}
                    >
                      {group.bars.map((bar) => {
                        const magnitude = Math.abs(bar.renderValue ?? bar.value);
                        const heightPx = Math.max(22, (magnitude / chartMax) * chartAreaHeight);
                        const label = formatChartValue(bar.value);
                        return (
                          <div
                            key={`revenue-chart-bar-${group.periodKey}-${bar.key}`}
                            style={{
                              width: 26,
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "flex-end",
                              alignItems: "center",
                              gap: 6
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                lineHeight: 1.1,
                                fontWeight: 800,
                                color: bar.textColor,
                                writingMode: magnitude > chartMax * 0.5 ? "vertical-rl" : "horizontal-tb",
                                transform: magnitude > chartMax * 0.5 ? "rotate(180deg)" : "none",
                                whiteSpace: "nowrap"
                              }}
                            >
                              {label}
                            </span>
                            <div
                              title={`${group.periodLabel} - ${bar.label}: ${label}`}
                              style={{
                                width: "100%",
                                height: heightPx,
                                borderRadius: 10,
                                background: bar.color,
                                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)"
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                lineHeight: 1,
                                fontWeight: 700,
                                color: "#5b7089",
                                textAlign: "center"
                              }}
                            >
                              {bar.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ textAlign: "center", color: "#0b2143", fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>
                      {group.periodLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="campaign-summary-card">
            <strong>Secili filtrelerde gelir-gider verisi bulunamadi.</strong>
            <p>Yil, ay veya magaza secimini degistirerek kayitlari kontrol edin.</p>
          </div>
        )}
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head web-kontor-section-head">
          <div>
            <h2 className="goal-panel-title">Aylik Ozet Tablosu</h2>
            <p className="goal-panel-subtitle" style={sectionSubtitleStyle}>
              Her donemde toplam gelir, toplam gider ve net karlilik birlikte listelenir.
            </p>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="goal-company-trend-table web-kontor-trend-table">
            <thead>
              <tr>
                <th>Donem</th>
                <th>Gelir</th>
                <th>Gider</th>
                <th>Net Karlilik</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.map((row) => (
                <tr key={`revenue-period-${row.periodKey}`}>
                  <th>{row.periodLabel}</th>
                  <td style={{ color: "#15803d" }}>{formatCurrency(row.income)}</td>
                  <td style={{ color: "#dc2626" }}>{formatCurrency(row.expense)}</td>
                  <td style={{ color: row.net >= 0 ? "#15803d" : "#dc2626" }}>{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Genel Toplam</th>
                <td>{formatCurrency(totalIncome)}</td>
                <td>{formatCurrency(totalExpense)}</td>
                <td>{formatCurrency(totalNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head web-kontor-section-head">
          <div>
            <h2 className="goal-panel-title">Kategori Kirilimlari</h2>
            <p className="goal-panel-subtitle" style={sectionSubtitleStyle}>
              Bir kategoriye tiklayarak secili filtreye gore ay ay gelir veya gider dagilimini detayli gorun.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
          <section className="campaign-summary-card" style={{ padding: 18, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <strong style={{ color: "#166534", fontSize: "1.1rem" }}>Gelir Kategorileri</strong>
              <span className="status-chip approve" style={{ background: "rgba(34, 197, 94, 0.12)", color: "#15803d" }}>
                {formatNumber(incomeCategories.length)} kategori
              </span>
            </div>

            {incomeCategoryPeriods.length ? (
              incomeCategoryPeriods.map((row, index) => (
                <details
                  key={`income-category-detail-${row.category}`}
                  open={index === 0}
                  style={{
                    borderRadius: 20,
                    border: "1px solid rgba(22, 101, 52, 0.16)",
                    background: "rgba(255,255,255,0.88)",
                    overflow: "hidden"
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "16px 18px",
                      color: "#0b2143",
                      fontWeight: 800
                    }}
                  >
                    <span>{row.category}</span>
                    <span style={{ color: "#15803d" }}>{formatCurrency(row.total)}</span>
                  </summary>

                  <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
                    <p style={{ margin: 0, color: "#45607c", fontWeight: 700 }}>Ay ay gelir dagilimi</p>
                    {row.months.length ? (
                      <div>
                        <table
                          className="goal-company-trend-table web-kontor-trend-table"
                          style={{ width: "100%", minWidth: "unset", tableLayout: "fixed" }}
                        >
                          <thead>
                            <tr>
                              <th style={{ color: "#0b2143", fontWeight: 800, width: "58%" }}>Donem</th>
                              <th style={{ color: "#0b2143", fontWeight: 800, width: "42%", textAlign: "right" }}>Tutar</th>
                            </tr>
                          </thead>
                          <tbody>
                          {row.months.map((monthRow) => (
                            <tr key={`income-category-period-${row.category}-${monthRow.periodKey}`}>
                                <th style={{ color: "#0b2143", fontWeight: 700 }}>{monthRow.periodLabel}</th>
                                <td style={{ color: "#15803d", fontWeight: 700, textAlign: "right" }}>{formatCurrency(monthRow.income)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th style={{ color: "#0b2143", fontWeight: 800 }}>Toplam</th>
                              <td style={{ color: "#166534", fontWeight: 800, textAlign: "right" }}>{formatCurrency(row.total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: "#6b7f95" }}>Bu kategoride deger bulunan ay kaydi yok.</p>
                    )}
                  </div>
                </details>
              ))
            ) : (
              <p style={{ margin: 0, color: "#56708c" }}>Secili filtrelerde gelir kategorisi bulunamadi.</p>
            )}
          </section>

          <section className="campaign-summary-card" style={{ padding: 18, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <strong style={{ color: "#991b1b", fontSize: "1.1rem" }}>Gider Kategorileri</strong>
              <span className="status-chip" style={{ background: "rgba(239, 68, 68, 0.12)", color: "#dc2626" }}>
                {formatNumber(expenseCategories.length)} kategori
              </span>
            </div>

            {expenseCategoryPeriods.length ? (
              expenseCategoryPeriods.map((row, index) => (
                <details
                  key={`expense-category-detail-${row.category}`}
                  open={index === 0}
                  style={{
                    borderRadius: 20,
                    border: "1px solid rgba(153, 27, 27, 0.14)",
                    background: "rgba(255,255,255,0.88)",
                    overflow: "hidden"
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "16px 18px",
                      color: "#0b2143",
                      fontWeight: 800
                    }}
                  >
                    <span>{row.category}</span>
                    <span style={{ color: "#dc2626" }}>{formatCurrency(row.total)}</span>
                  </summary>

                  <div style={{ padding: "0 18px 18px", display: "grid", gap: 10 }}>
                    <p style={{ margin: 0, color: "#45607c", fontWeight: 700 }}>Ay ay gider dagilimi</p>
                    {row.months.length ? (
                      <div>
                        <table
                          className="goal-company-trend-table web-kontor-trend-table"
                          style={{ width: "100%", minWidth: "unset", tableLayout: "fixed" }}
                        >
                          <thead>
                            <tr>
                              <th style={{ color: "#0b2143", fontWeight: 800, width: "58%" }}>Donem</th>
                              <th style={{ color: "#0b2143", fontWeight: 800, width: "42%", textAlign: "right" }}>Tutar</th>
                            </tr>
                          </thead>
                          <tbody>
                          {row.months.map((monthRow) => (
                            <tr key={`expense-category-period-${row.category}-${monthRow.periodKey}`}>
                                <th style={{ color: "#0b2143", fontWeight: 700 }}>{monthRow.periodLabel}</th>
                                <td style={{ color: "#dc2626", fontWeight: 700, textAlign: "right" }}>{formatCurrency(monthRow.expense)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th style={{ color: "#0b2143", fontWeight: 800 }}>Toplam</th>
                              <td style={{ color: "#b91c1c", fontWeight: 800, textAlign: "right" }}>{formatCurrency(row.total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <p style={{ margin: 0, color: "#6b7f95" }}>Bu kategoride deger bulunan ay kaydi yok.</p>
                    )}
                  </div>
                </details>
              ))
            ) : (
              <p style={{ margin: 0, color: "#56708c" }}>Secili filtrelerde gider kategorisi bulunamadi.</p>
            )}
          </section>
        </div>
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head web-kontor-section-head">
          <div>
            <h2 className="goal-panel-title">Magaza Bazli Karlilik</h2>
            <p className="goal-panel-subtitle" style={sectionSubtitleStyle}>
              Secili donemde magazalarin gelir, gider ve net sonuc dagilimi tek tabloda izlenir.
            </p>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="goal-company-trend-table web-kontor-trend-table">
            <thead>
              <tr>
                <th>Magaza</th>
                <th>Gelir</th>
                <th>Gider</th>
                <th>Net Karlilik</th>
              </tr>
            </thead>
            <tbody>
              {storeSummary.map((row) => (
                <tr key={`store-summary-${row.storeName}`}>
                  <th>{row.storeName}</th>
                  <td style={{ color: "#15803d" }}>{formatCurrency(row.income)}</td>
                  <td style={{ color: "#dc2626" }}>{formatCurrency(row.expense)}</td>
                  <td style={{ color: row.net >= 0 ? "#15803d" : "#dc2626" }}>{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
