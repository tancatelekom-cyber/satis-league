import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { CopyCoachingButton } from "@/components/evaluation/copy-coaching-button";
import { FormattedCoachingText } from "@/components/evaluation/formatted-coaching-text";
import { SpeakCoachingButton } from "@/components/evaluation/speak-coaching-button";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import {
  GoalActualRow,
  GoalProductPointRow,
  GoalProductionRewardRow,
  GoalStoreRow,
  fetchGoalActualRows,
  fetchGoalDayStats,
  fetchGoalProductPointRows,
  fetchGoalProductionRewardRows,
  fetchGoalStoreRows
} from "@/lib/goal-actuals";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/lib/types";

type GoalActualPageProps = {
  searchParams?: Promise<{
    category?: string;
    employee?: string;
    store?: string;
    panel?: string;
    view?: string;
  }>;
};

type EmployeeSummary = {
  name: string;
  totalTarget: number;
  totalActual: number;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number;
  projectedPercent: number | null;
  hasTarget: boolean;
  showProjection: boolean;
};

type GoalMetricSummary = {
  target: number | null;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
  hasTarget: boolean;
  showProjection: boolean;
};

type GoalCategorySummary = GoalMetricSummary & {
  title: string;
  childCount: number;
  children: Array<
    GoalMetricSummary & {
      title: string;
    }
  >;
  storeDetails?: Array<
    GoalMetricSummary & {
      title: string;
    }
  >;
};

type GoalDayStats = {
  workedDays: number;
  remainingDays: number;
  totalDays: number;
};

type GoalNeedRow = {
  threshold: number;
  dailyRequired: number;
};

type ProductionRewardPlanRow = {
  points: number;
  reward: string;
  isCurrentProjectedTier: boolean;
  isReached: boolean;
  remainingFromActual: number;
  dailyRequired: number;
};

type ProductionRewardPlan = {
  projectedPoints: number;
  actualPoints: number;
  projectedReward: string | null;
  nextReward: string | null;
  rows: ProductionRewardPlanRow[];
};

type CoachingMetric = {
  title: string;
  target: number | null;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
  hasTarget: boolean;
  showProjection: boolean;
};

type AverageGapNote = {
  title: string;
  actual: number;
  average: number;
  gap: number;
};

type ZeroActualItem = {
  key: string;
  label: string;
};

type StoreZeroActualGroup = {
  storeCode: string;
  items: string[];
};

type StoreLoginGapNote = {
  profileId: string;
  fullName: string;
  daysSinceLogin: number;
};

type CompanyLoginGapNote = StoreLoginGapNote & {
  storeName: string;
};

type TrendComparisonState = "up" | "down" | "equal" | null;

type CompanyTrendSummaryRow = {
  title: string;
  companyProjectedPercent: number | null;
  stores: Array<{
    storeCode: string;
    projectedPercent: number | null;
  }>;
};

type CompanyCurrentSummaryRow = {
  title: string;
  valueType: "percent" | "number";
  companyActual: number | null;
  stores: Array<{
    storeCode: string;
    actual: number | null;
  }>;
};

type GoalView = "employee" | "store" | "company";
type GoalPanel = "detail" | "ranking" | "needs" | "evaluation";

function normalizeStoreKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/\u0130/g, "I")
    .replace(/\u011E/g, "G")
    .replace(/\u00DC/g, "U")
    .replace(/\u015E/g, "S")
    .replace(/\u00D6/g, "O")
    .replace(/\u00C7/g, "C")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveStoreCodeFromEmployeeRows(employeeRows: GoalActualRow[], availableStoreCodes: string[], fallbackStoreCode = "") {
  const uniqueEmployeeStoreNames = Array.from(
    new Set(
      employeeRows
        .map((row) => row.storeName)
        .filter((value) => Boolean(String(value ?? "").trim()))
        .map((value) => String(value).trim())
    )
  );

  for (const employeeStoreName of uniqueEmployeeStoreNames) {
    const matchedStoreCode = availableStoreCodes.find(
      (storeCode) => normalizeStoreKey(storeCode) === normalizeStoreKey(employeeStoreName)
    );

    if (matchedStoreCode) {
      return matchedStoreCode;
    }
  }

  if (fallbackStoreCode) {
    const matchedFallbackStoreCode = availableStoreCodes.find(
      (storeCode) => normalizeStoreKey(storeCode) === normalizeStoreKey(fallbackStoreCode)
    );

    if (matchedFallbackStoreCode) {
      return matchedFallbackStoreCode;
    }
  }

  return "";
}

function calculateDaysSinceLogin(lastSignInAt: string) {
  const loginTime = new Date(lastSignInAt).getTime();

  if (!Number.isFinite(loginTime)) {
    return null;
  }

  const diffMs = Date.now() - loginTime;
  return diffMs >= 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
}

function getTrendComparisonState(storeValue: number | null | undefined, companyValue: number | null | undefined): TrendComparisonState {
  if (
    storeValue === null ||
    storeValue === undefined ||
    companyValue === null ||
    companyValue === undefined ||
    Number.isNaN(storeValue) ||
    Number.isNaN(companyValue)
  ) {
    return null;
  }

  const difference = storeValue - companyValue;

  if (Math.abs(difference) < 0.05) {
    return "equal";
  }

  return difference > 0 ? "up" : "down";
}

function isAggregateCategoryLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return normalized === "tum kategoriler" || normalized === "tüm kategoriler";
}

const EMPTY_DAY_STATS: GoalDayStats = {
  workedDays: 0,
  remainingDays: 0,
  totalDays: 0
};

const shellCardStyle: CSSProperties = {
  borderRadius: 28,
  border: "1px solid rgba(4, 92, 96, 0.2)",
  background: "linear-gradient(180deg, rgba(18, 96, 102, 0.96), rgba(26, 124, 128, 0.92))",
  boxShadow: "0 22px 40px rgba(8, 22, 40, 0.16)"
};

const blockCardStyle: CSSProperties = {
  ...shellCardStyle,
  padding: "22px 24px"
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  color: "#f8fbff",
  fontSize: "1.4rem",
  fontWeight: 900
};

const sectionSubtleStyle: CSSProperties = {
  color: "#edf6ff",
  fontSize: "0.96rem"
};

const controlShellStyle: CSSProperties = {
  display: "grid",
  gap: 20
};

const tabRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 14
};

const summaryStripStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 14
};

const summaryCardStyle: CSSProperties = {
  padding: "18px 20px",
  borderRadius: 22,
  background: "rgba(255, 255, 255, 0.92)",
  border: "1px solid rgba(4, 92, 96, 0.18)",
  boxShadow: "0 14px 26px rgba(8, 22, 40, 0.08)",
  display: "grid",
  gap: 6
};

const summaryLabelStyle: CSSProperties = {
  color: "#56708c",
  fontSize: "0.98rem",
  fontWeight: 700
};

const summaryValueStyle: CSSProperties = {
  color: "#0b2143",
  fontSize: "2rem",
  fontWeight: 900,
  lineHeight: 1
};

const filterCardStyle: CSSProperties = {
  ...blockCardStyle,
  display: "grid",
  gap: 18
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 18
};

const filterItemStyle: CSSProperties = {
  display: "grid",
  gap: 10
};

const filterLabelStyle: CSSProperties = {
  color: "#f8fbff",
  fontSize: "1.2rem",
  fontWeight: 900
};

const modeRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14
};

const panelSingleStyle: CSSProperties = {
  display: "grid"
};

const panelCardStyle: CSSProperties = {
  ...blockCardStyle,
  display: "grid",
  gap: 18
};

const sectionHeadWrapStyle: CSSProperties = {
  display: "grid",
  gap: 6
};

const rankingListStyle: CSSProperties = {
  display: "grid",
  gap: 14
};

function getRankingRowStyle(active: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "74px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 18,
    padding: "16px 18px",
    borderRadius: 22,
    textDecoration: "none",
    color: "#f8fbff",
    background: active ? "rgba(255, 255, 255, 0.16)" : "rgba(8, 28, 52, 0.16)",
    border: active ? "1px solid rgba(255, 209, 102, 0.38)" : "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: active ? "0 14px 26px rgba(8, 22, 40, 0.18)" : "none"
  };
}

const rankBadgeStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 56,
  minWidth: 56,
  height: 56,
  borderRadius: 18,
  background: "linear-gradient(135deg, #d7f7a7, #7ef1d3)",
  color: "#09111f",
  fontWeight: 900,
  fontSize: "1.5rem"
};

const rankingMainStyle: CSSProperties = {
  display: "grid",
  gap: 6
};

const rankingTitleStyle: CSSProperties = {
  color: "#f8fbff",
  fontSize: "1.25rem",
  fontWeight: 900,
  lineHeight: 1.1
};

const rankingMetaStyle: CSSProperties = {
  color: "#e2efff",
  fontSize: "0.98rem",
  fontWeight: 600
};

const rankingScoreStyle: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 18,
  background: "#ffd166",
  color: "#09111f",
  fontWeight: 900,
  fontSize: "1.18rem",
  whiteSpace: "nowrap"
};

function getTopTabStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 60,
    padding: "12px 18px",
    borderRadius: 999,
    textDecoration: "none",
    fontWeight: 900,
    fontSize: "1.05rem",
    border: active ? "1px solid rgba(255, 209, 102, 0.46)" : "1px solid rgba(4, 92, 96, 0.18)",
    background: active
      ? "linear-gradient(135deg, rgba(4, 92, 96, 0.96), rgba(16, 128, 130, 0.94))"
      : "rgba(255, 255, 255, 0.78)",
    color: active ? "#f8fbff" : "#163252",
    boxShadow: active ? "0 16px 28px rgba(4, 52, 56, 0.22)" : "0 12px 24px rgba(8, 22, 40, 0.08)"
  };
}

function getModeButtonStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 58,
    padding: "12px 16px",
    borderRadius: 20,
    textDecoration: "none",
    fontWeight: 900,
    fontSize: "1.02rem",
    border: active ? "1px solid rgba(255, 209, 102, 0.46)" : "1px solid rgba(4, 92, 96, 0.16)",
    background: active
      ? "linear-gradient(135deg, rgba(4, 92, 96, 0.96), rgba(16, 128, 130, 0.94))"
      : "rgba(255, 255, 255, 0.82)",
    color: active ? "#f8fbff" : "#163252",
    boxShadow: active ? "0 16px 28px rgba(4, 52, 56, 0.22)" : "0 14px 26px rgba(8, 22, 40, 0.08)"
  };
}

function getProjectedPercentPillClass(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }

  return value >= 100 ? "goal-status-pill-good" : "goal-status-pill-bad";
}

function getMetricPillStyle(kind: "default" | "status-good" | "status-bad" = "default"): CSSProperties {
  if (kind === "status-good") {
    return {
      padding: "12px 14px",
      borderRadius: 18,
      background: "#d7f7a7",
      color: "#09111f",
      border: "1px solid rgba(133, 185, 66, 0.35)"
    };
  }

  if (kind === "status-bad") {
    return {
      padding: "12px 14px",
      borderRadius: 18,
      background: "#d44a4a",
      color: "#ffffff",
      border: "1px solid rgba(122, 24, 24, 0.38)"
    };
  }

  return {
    padding: "12px 14px",
    borderRadius: 18,
    background: "#ffd166",
    color: "#09111f",
    border: "1px solid rgba(186, 141, 33, 0.28)"
  };
}

function buildHref(
  view: string,
  options?: {
    employee?: string;
    store?: string;
    category?: string;
    panel?: string;
  }
) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (options?.employee) params.set("employee", options.employee);
  if (options?.store) params.set("store", options.store);
  if (options?.category) params.set("category", options.category);
  if (options?.panel) params.set("panel", options.panel);
  return `/hedef-gerceklesen?${params.toString()}`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  });
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

function buildEmployeeSummary(rows: GoalActualRow[], workedDays: number, totalDays: number): EmployeeSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const projectedActual = workedDays > 0 ? Math.floor((totalActual / workedDays) * totalDays) : totalActual;
  const hasTarget = totalTarget > 0;

  return {
    name: rows[0]?.employeeName ?? "-",
    totalTarget,
    totalActual,
    actual: totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection: true
  };
}

function buildCategoryGroups(rows: GoalActualRow[]) {
  const map = new Map<
    string,
    {
      mainOnlyRows: GoalActualRow[];
      children: GoalActualRow[];
    }
  >();

  rows.forEach((row) => {
    const group = map.get(row.mainCategory) ?? { mainOnlyRows: [], children: [] };
    if (row.subCategory) {
      group.children.push(row);
    } else {
      group.mainOnlyRows.push(row);
    }
    map.set(row.mainCategory, group);
  });

  return Array.from(map.entries()).sort((a, b) => {
    const aIsProductionPoint = isProductionPointCategory(a[0]);
    const bIsProductionPoint = isProductionPointCategory(b[0]);

    if (aIsProductionPoint && !bIsProductionPoint) {
      return -1;
    }

    if (!aIsProductionPoint && bIsProductionPoint) {
      return 1;
    }

    return a[0].localeCompare(b[0], "tr");
  });
}

function buildMetricSummary(rows: GoalActualRow[], workedDays: number, totalDays: number): GoalMetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const projectedActual = workedDays > 0 ? Math.floor((totalActual / workedDays) * totalDays) : totalActual;
  const hasTarget = totalTarget > 0;

  return {
    target: hasTarget ? totalTarget : null,
    actual: totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection: true
  };
}

function buildStoreMetricSummary(rows: GoalStoreRow[], workedDays: number, totalDays: number): GoalMetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = totalTarget > 0;
  const showProjection = rows.every((row) => row.includeProjection);
  const projectedActual = showProjection
    ? workedDays > 0
      ? Math.floor((totalActual / workedDays) * totalDays)
      : totalActual
    : null;

  return {
    target: hasTarget ? totalTarget : null,
    actual: totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget && showProjection && projectedActual !== null ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection
  };
}

function buildCategorySummaries(rows: GoalActualRow[], workedDays: number, totalDays: number): GoalCategorySummary[] {
  return buildCategoryGroups(rows).map(([mainCategory, group]) => {
    const allRows = [...group.mainOnlyRows, ...group.children];
    const summary = buildMetricSummary(allRows, workedDays, totalDays);
    const children = group.children
      .map((row) => ({
        title: row.subCategory,
        ...buildMetricSummary([row], workedDays, totalDays)
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "tr"));

    return {
      title: mainCategory,
      childCount: children.length,
      children,
      ...summary
    };
  });
}

function buildStoreCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number): GoalCategorySummary[] {
  const map = new Map<
    string,
    {
      mainOnlyRows: GoalStoreRow[];
      children: GoalStoreRow[];
    }
  >();

  rows.forEach((row) => {
    const group = map.get(row.mainCategory) ?? { mainOnlyRows: [], children: [] };
    if (row.subCategory) {
      group.children.push(row);
    } else {
      group.mainOnlyRows.push(row);
    }
    map.set(row.mainCategory, group);
  });

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([mainCategory, group]) => {
      const allRows = [...group.mainOnlyRows, ...group.children];
      const summary = buildStoreMetricSummary(allRows, workedDays, totalDays);
      const children = group.children
        .map((row) => ({
          title: row.subCategory,
          ...buildStoreMetricSummary([row], workedDays, totalDays)
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "tr"));

      return {
        title: mainCategory,
        childCount: children.length,
        children,
        storeDetails: [],
        ...summary
      };
    });
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeCategoryKey(value: string) {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/\u0130/g, "I")
    .replace(/\u011E/g, "G")
    .replace(/\u00DC/g, "U")
    .replace(/\u015E/g, "S")
    .replace(/\u00D6/g, "O")
    .replace(/\u00C7/g, "C");
}

function isEntryCount(title: string) {
  return normalizeCategoryKey(title).includes("GIRIS SAY");
}

function isLivePrimeCategory(title: string | null | undefined) {
  const normalized = normalizeCategoryKey(String(title ?? ""));
  return normalized.includes("CANLI PRIM");
}

function isSatisfactionCategory(title: string | null | undefined) {
  return normalizeCategoryKey(String(title ?? "")).includes("MEMNUNIYET");
}

function isPinRateCategory(title: string | null | undefined) {
  const normalized = normalizeCategoryKey(String(title ?? ""));
  return normalized.includes("PIN ORAN");
}

function isProductionPointCategory(title: string | null | undefined) {
  const normalized = normalizeCategoryKey(String(title ?? ""));
  return normalized.includes("URETIM PUAN");
}

function buildProductionRewardPlan(
  summary: GoalCategorySummary,
  rewardRows: GoalProductionRewardRow[],
  remainingDays: number
): ProductionRewardPlan | null {
  if (!isProductionPointCategory(summary.title) || !rewardRows.length) {
    return null;
  }

  const actualPoints = summary.actual;
  const projectedPoints = summary.projectedActual ?? summary.actual;
  const projectedRewardRow = [...rewardRows].reverse().find((row) => projectedPoints >= row.points) ?? null;
  const nextRewardRow = rewardRows.find((row) => row.points > projectedPoints) ?? null;

  return {
    actualPoints,
    projectedPoints,
    projectedReward: projectedRewardRow?.reward ?? null,
    nextReward: nextRewardRow?.reward ?? null,
    rows: rewardRows.map((row) => {
      const remainingFromActual = Math.max(row.points - actualPoints, 0);

      return {
        points: row.points,
        reward: row.reward,
        isCurrentProjectedTier: Boolean(projectedRewardRow && projectedRewardRow.points === row.points),
        isReached: actualPoints >= row.points,
        remainingFromActual,
        dailyRequired:
          remainingFromActual > 0
            ? remainingDays > 0
              ? Math.ceil(remainingFromActual / remainingDays)
              : remainingFromActual
            : 0
      } satisfies ProductionRewardPlanRow;
    })
  };
}

function aggregateStoreActual(rows: GoalStoreRow[]) {
  if (!rows.length) {
    return null;
  }

  const actuals = rows.map((row) => row.actual);
  const aggregate =
    rows[0]?.companyMode === "average"
      ? average
      : (values: number[]) => values.reduce((sum, value) => sum + value, 0);

  return aggregate(actuals);
}

function buildEmployeeZeroActualItems(rows: GoalActualRow[]) {
  const seen = new Set<string>();

  return rows
    .filter((row) => !isEntryCount(row.mainCategory) && row.actual === 0)
    .map((row) => ({
      key: `${row.employeeName}-${row.mainCategory}-${row.subCategory || "main"}`,
      label: row.subCategory || row.mainCategory
    }))
    .filter((item) => {
      if (seen.has(item.label)) {
        return false;
      }

      seen.add(item.label);
      return true;
    });
}

function buildStoreZeroActualItems(rows: GoalStoreRow[]) {
  const seen = new Set<string>();

  return rows
    .filter((row) => !isEntryCount(row.mainCategory) && row.actual === 0)
    .map((row) => ({
      key: `${row.storeCode}-${row.mainCategory}-${row.subCategory || "main"}`,
      label: row.subCategory || row.mainCategory
    }))
    .filter((item) => {
      if (seen.has(item.label)) {
        return false;
      }

      seen.add(item.label);
      return true;
    });
}

function buildCompanyZeroActualItems(rows: GoalStoreRow[]) {
  const seen = new Set<string>();

  return buildCompanyRows(rows)
    .filter((row) => !isEntryCount(row.mainCategory) && row.actual === 0)
    .map((row) => ({
      key: `Firma-${row.mainCategory}-${row.subCategory || "main"}`,
      label: row.subCategory || row.mainCategory
    }))
    .filter((item) => {
      if (seen.has(item.label)) {
        return false;
      }

      seen.add(item.label);
      return true;
    });
}

function buildCompanyStoreZeroActualGroups(rows: GoalStoreRow[]) {
  const storeMap = new Map<string, Set<string>>();

  rows
    .filter((row) => !isEntryCount(row.mainCategory) && row.actual === 0)
    .forEach((row) => {
      const label = row.subCategory || row.mainCategory;
      const current = storeMap.get(row.storeCode) ?? new Set<string>();
      current.add(label);
      storeMap.set(row.storeCode, current);
    });

  return Array.from(storeMap.entries())
    .map(([storeCode, items]) => ({
      storeCode,
      items: Array.from(items).sort((a, b) => a.localeCompare(b, "tr"))
    }))
    .sort((a, b) => a.storeCode.localeCompare(b.storeCode, "tr"));
}

function buildCompanyTrendSummaryRows(
  companyCategories: GoalCategorySummary[],
  storeRows: GoalStoreRow[],
  workedDays: number,
  totalDays: number
) {
  return companyCategories
    .filter((category) => category.hasTarget && category.showProjection)
    .map((category) => {
      const storeMap = new Map<string, GoalStoreRow[]>();

      storeRows
        .filter((row) => row.mainCategory === category.title)
        .forEach((row) => {
          const current = storeMap.get(row.storeCode) ?? [];
          current.push(row);
          storeMap.set(row.storeCode, current);
        });

      const stores = Array.from(storeMap.entries())
        .map(([storeCode, rows]) => ({
          storeCode,
          projectedPercent: buildStoreMetricSummary(rows, workedDays, totalDays).projectedPercent
        }))
        .sort((a, b) => a.storeCode.localeCompare(b.storeCode, "tr"));

      return {
        title: category.title,
        companyProjectedPercent: category.projectedPercent,
        stores
      } satisfies CompanyTrendSummaryRow;
    })
    .sort((a, b) => a.title.localeCompare(b.title, "tr"));
}

function buildCompanyCurrentSummaryRows(rows: GoalStoreRow[]) {
  const companyRows = buildCompanyRows(rows);
  const definitions = [
    { title: "Memnuniyet", matcher: isSatisfactionCategory, valueType: "number" as const },
    { title: "Pin Orani", matcher: isPinRateCategory, valueType: "percent" as const },
    { title: "Giris Sayilari", matcher: isEntryCount, valueType: "number" as const }
  ];

  return definitions
    .map((definition) => {
      const matchingCompanyRows = companyRows.filter((row) => definition.matcher(row.mainCategory));

      if (!matchingCompanyRows.length) {
        return null;
      }

      const matchingStoreRows = rows.filter((row) => definition.matcher(row.mainCategory));
      const storeMap = new Map<string, GoalStoreRow[]>();

      matchingStoreRows.forEach((row) => {
        const current = storeMap.get(row.storeCode) ?? [];
        current.push(row);
        storeMap.set(row.storeCode, current);
      });

      return {
        title: definition.title,
        valueType: definition.valueType,
        companyActual: aggregateStoreActual(matchingCompanyRows),
        stores: Array.from(storeMap.entries())
          .map(([storeCode, storeRows]) => ({
            storeCode,
            actual: aggregateStoreActual(storeRows)
          }))
          .sort((a, b) => a.storeCode.localeCompare(b.storeCode, "tr"))
      } satisfies CompanyCurrentSummaryRow;
    })
    .filter((row): row is CompanyCurrentSummaryRow => Boolean(row));
}

function toCoachingMetric(summary: GoalCategorySummary): CoachingMetric {
  return {
    title: summary.title,
    target: summary.target,
    actual: summary.actual,
    actualPercent: summary.actualPercent,
    remaining: summary.remaining,
    projectedActual: summary.projectedActual,
    projectedPercent: summary.projectedPercent,
    hasTarget: summary.hasTarget,
    showProjection: summary.showProjection
  };
}

function buildEmployeeAverageGapNotes(metrics: CoachingMetric[], rows: GoalActualRow[]) {
  const notes: AverageGapNote[] = [];

  metrics.forEach((metric) => {
    const employeeTotals = new Map<string, number>();
    rows
      .filter((row) => row.mainCategory === metric.title)
      .forEach((row) => {
        employeeTotals.set(row.employeeName, (employeeTotals.get(row.employeeName) ?? 0) + row.actual);
      });

    const categoryAverage = average(Array.from(employeeTotals.values()).filter((value) => value > 0));

    if (categoryAverage > 0 && metric.actual < categoryAverage) {
      notes.push({
        title: metric.title,
        actual: metric.actual,
        average: categoryAverage,
        gap: categoryAverage - metric.actual
      });
    }
  });

  return notes.sort((a, b) => b.gap - a.gap);
}

function buildStoreAverageGapNotes(metrics: CoachingMetric[], rows: GoalStoreRow[]) {
  const notes: string[] = [];

  metrics.forEach((metric) => {
    const categoryRows = rows.filter((row) => row.mainCategory === metric.title);
    const categoryAverage = average(categoryRows.map((row) => row.actual).filter((value) => value > 0));

    if (categoryAverage > 0 && metric.actual < categoryAverage) {
      notes.push(`${metric.title}: firma ortalaması ${formatNumber(categoryAverage)}, mevcut ${formatNumber(metric.actual)}.`);
    }
  });

  return notes;
}

function buildGoalActualCoachingText(args: {
  view: GoalView;
  metrics: CoachingMetric[];
  employeeAverageNotes: AverageGapNote[];
  storeAverageNotes: string[];
  remainingDays: number;
}) {
  const criticalMetrics = args.metrics
    .filter((metric) => metric.hasTarget && !isEntryCount(metric.title) && (metric.projectedPercent ?? metric.actualPercent ?? 0) < 100)
    .sort((a, b) => (a.projectedPercent ?? a.actualPercent ?? 0) - (b.projectedPercent ?? b.actualPercent ?? 0));

  const focusItems = new Map<string, string>();

  criticalMetrics.forEach((metric) => {
    focusItems.set(
      metric.title,
      `- ${metric.title}: hedef temposunun altındasın. Ay sonu ${formatPercent(metric.projectedPercent ?? metric.actualPercent)} seviyesinde kalır.`
    );
  });

  if (args.view === "employee") {
    args.employeeAverageNotes.forEach((note) => {
      if (!focusItems.has(note.title)) {
        focusItems.set(
          note.title,
          `- ${note.title}: firma ortalamas\u0131 ${formatNumber(note.average)}, sende ${formatNumber(note.actual)}. Fark ${formatNumber(note.gap)}.`
        );
      }
    });
  }

  if (args.view === "store") {
    args.storeAverageNotes.forEach((note) => {
      const title = note.split(":")[0]?.trim() || note;
      if (!focusItems.has(title)) {
        focusItems.set(title, `- ${note}`);
      }
    });
  }

  const dailyLines = criticalMetrics.map((metric) => {
    const remaining = args.remainingDays > 0 && metric.remaining !== null ? Math.ceil(metric.remaining / args.remainingDays) : metric.remaining ?? 0;
    return `- ${metric.title}: ay sonu ${formatPercent(metric.projectedPercent ?? metric.actualPercent)} seviyesinde kal\u0131r. Hedefi kapatmak i\u00e7in kalan g\u00fcnlerde g\u00fcnl\u00fck en az ${formatNumber(remaining)} \u00fcretmen laz\u0131m.`;
  });

  const firstTitle =
    args.view === "company"
      ? "F\u0130RMANIN HEDEF\u0130N ALTINDA KALDI\u011eI KALEMLER:"
      : "HEDEF\u0130N VE F\u0130RMA ORTALAMASININ ALTINDA KALDI\u011eIN KALEMLER:";
  const secondTitle =
    args.view === "company"
      ? "G\u00dcNL\u00dcK M\u0130N\u0130MUM \u0130HT\u0130YA\u00c7LAR:"
      : "G\u00dcNL\u00dcK M\u0130N\u0130MUM \u0130HT\u0130YA\u00c7LARIN:";

  return [
    firstTitle,
    ...(focusItems.size ? Array.from(focusItems.values()) : ["- Belirgin bir kritik kalem g\u00f6r\u00fcnm\u00fcyor."]),
    "",
    secondTitle,
    ...(dailyLines.length
      ? dailyLines
      : ["- Bug\u00fcn i\u00e7in ek g\u00fcnl\u00fck minimum ihtiya\u00e7 g\u00f6r\u00fcnm\u00fcyor. Mevcut tempoyu koruyal\u0131m."])
  ].join("\n");
}

function buildCompanyRows(rows: GoalStoreRow[]): GoalStoreRow[] {
  const grouped = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const key = `${row.mainCategory}__${row.subCategory}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((group) => {
    const first = group[0];
    const actuals = group.map((row) => row.actual);
    const targets = group.map((row) => row.target).filter((value): value is number => value !== null && value > 0);
    const aggregate =
      first.companyMode === "average"
        ? average
        : (values: number[]) => values.reduce((sum, value) => sum + value, 0);

    return {
      storeCode: "Firma",
      mainCategory: first.mainCategory,
      subCategory: first.subCategory,
      target: targets.length ? aggregate(targets) : null,
      actual: aggregate(actuals),
      includeProjection: first.includeProjection,
      companyMode: first.companyMode
    };
  });
}

function buildCompanyCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number): GoalCategorySummary[] {
  const companyRows = buildCompanyRows(rows);
  const groupedRawRows = new Map<string, GoalStoreRow[]>();
  const groupedCompanyRows = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const current = groupedRawRows.get(row.mainCategory) ?? [];
    current.push(row);
    groupedRawRows.set(row.mainCategory, current);
  });

  companyRows.forEach((row) => {
    const current = groupedCompanyRows.get(row.mainCategory) ?? [];
    current.push(row);
    groupedCompanyRows.set(row.mainCategory, current);
  });

  return Array.from(groupedCompanyRows.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([mainCategory, companyCategoryRows]) => {
      const rawCategoryRows = groupedRawRows.get(mainCategory) ?? [];
      const mainOnlyRows = companyCategoryRows.filter((row) => !row.subCategory);
      const childRows = companyCategoryRows.filter((row) => Boolean(row.subCategory));
      const summary = buildStoreMetricSummary(companyCategoryRows, workedDays, totalDays);
      const children = childRows
        .map((row) => ({
          title: row.subCategory,
          ...buildStoreMetricSummary([row], workedDays, totalDays)
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "tr"));

      const storeMap = new Map<string, GoalStoreRow[]>();
      rawCategoryRows.forEach((row) => {
        const current = storeMap.get(row.storeCode) ?? [];
        current.push(row);
        storeMap.set(row.storeCode, current);
      });

      const storeDetails = Array.from(storeMap.entries())
        .map(([storeCode, storeRows]) => ({
          title: storeCode,
          ...buildStoreMetricSummary(storeRows, workedDays, totalDays)
        }))
        .sort((a, b) => {
          if (a.hasTarget && b.hasTarget && a.actualPercent !== null && b.actualPercent !== null) {
            return b.actualPercent - a.actualPercent || b.actual - a.actual;
          }
          return b.actual - a.actual;
        });

      return {
        title: mainCategory,
        childCount: children.length,
        children,
        storeDetails,
        ...buildStoreMetricSummary([...mainOnlyRows, ...childRows], workedDays, totalDays)
      };
    });
}

function canViewAllGoalActual(role: UserRole | string | null | undefined) {
  return role === "admin" || role === "management" || role === "manager";
}

function buildNeedRows(summary: GoalCategorySummary, remainingDays: number): GoalNeedRow[] {
  if (!summary.hasTarget || !summary.target) {
    return [];
  }

  return [90, 100, 110, 120].map((threshold) => {
    const targetValue = (summary.target ?? 0) * (threshold / 100);
    const remainingTotal = Math.max(targetValue - summary.actual, 0);
    const dailyRequired = remainingDays > 0 ? Math.ceil(remainingTotal / remainingDays) : remainingTotal > 0 ? Math.ceil(remainingTotal) : 0;

    return {
      threshold,
      dailyRequired
    };
  });
}

function GoalCategoryCards({
  categories,
  remainingDays = 0,
  productionRewardRows = [],
  productPointRows = []
}: {
  categories: GoalCategorySummary[];
  remainingDays?: number;
  productionRewardRows?: GoalProductionRewardRow[];
  productPointRows?: GoalProductPointRow[];
}) {
  return (
    <div className="goal-category-list">
      {categories.map((category, index) => {
        const productionRewardPlan = buildProductionRewardPlan(category, productionRewardRows, remainingDays);
        const hasExpandableBody =
          category.childCount > 0 || (category.storeDetails?.length ?? 0) > 0 || Boolean(productionRewardPlan);

        return (
          <details key={category.title} className="goal-category-card" open={index === 0}>
          <summary className="goal-category-summary">
            <div className="goal-category-title">
              <strong>{category.title}</strong>
              <span>{category.childCount > 0 ? `${category.childCount} alt kategori` : "Tek kalem kategori"}</span>
            </div>

            {hasExpandableBody ? <span className="goal-category-caret">v</span> : null}

            <div className="goal-category-metrics">
              {category.hasTarget ? (
                <span>
                  <small>Hedef</small>
                  <strong>{formatNumber(category.target)}</strong>
                </span>
              ) : null}
              <span>
                <small>Gerceklesen</small>
                <strong>{formatNumber(category.actual)}</strong>
              </span>
              {category.hasTarget ? (
                <span>
                  <small>Kalan</small>
                  <strong>{formatNumber(category.remaining)}</strong>
                </span>
              ) : null}
              {category.hasTarget && category.actualPercent !== null ? (
                <span>
                  <small>Anlik %</small>
                  <strong>{formatPercent(category.actualPercent)}</strong>
                </span>
              ) : null}
              {category.showProjection && category.projectedActual !== null ? (
                <span>
                  <small>Ay Sonu</small>
                  <strong>{formatNumber(category.projectedActual)}</strong>
                </span>
              ) : null}
              {category.hasTarget && category.showProjection && category.projectedPercent !== null ? (
                <span className={getProjectedPercentPillClass(category.projectedPercent)}>
                  <small>Ay Sonu %</small>
                  <strong>{formatPercent(category.projectedPercent)}</strong>
                </span>
              ) : null}
            </div>
          </summary>

          <div className="goal-category-body">
            {productionRewardPlan ? (
              <div className="goal-production-reward-panel">
                <div className="goal-production-reward-head">
                  <strong>Uretim Puani Kazanim Plani</strong>
                  <span>
                    Ay sonu gidisatina gore: <b>{productionRewardPlan.projectedReward ?? "Henuz kazanim seviyesine ulasmadi"}</b>
                  </span>
                </div>

                <div className="goal-production-reward-summary">
                  <span>
                    <small>Su anki puan</small>
                    <strong>{formatNumber(productionRewardPlan.actualPoints)}</strong>
                  </span>
                  <span>
                    <small>Ay sonu ongoru</small>
                    <strong>{formatNumber(productionRewardPlan.projectedPoints)}</strong>
                  </span>
                  <span>
                    <small>Siradaki kazanim</small>
                    <strong>{productionRewardPlan.nextReward ?? "Son skala"}</strong>
                  </span>
                </div>

                <div className="goal-production-reward-table-wrap">
                  <table className="goal-production-reward-table">
                    <thead>
                      <tr>
                        <th>Puan</th>
                        <th>Kazanim</th>
                        <th>Durum</th>
                        <th>Kalan Puan</th>
                        <th>Gunluk Gerekli</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productionRewardPlan.rows.map((row) => (
                        <tr
                          key={`${category.title}-reward-${row.points}`}
                          className={row.isCurrentProjectedTier ? "goal-production-reward-row-active" : ""}
                        >
                          <td>{formatNumber(row.points)}</td>
                          <td>{row.reward}</td>
                          <td>{row.isCurrentProjectedTier ? "Ay sonu ongorusu" : row.isReached ? "Asildi" : "Ust skala"}</td>
                          <td>{formatNumber(row.remainingFromActual)}</td>
                          <td>{formatNumber(row.dailyRequired)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {productPointRows.length ? (
                  <details className="goal-product-point-details">
                    <summary className="goal-product-point-summary">
                      <strong>Urun Puanlari</strong>
                      <span>Bilgilendirme tablosu</span>
                    </summary>

                    <div className="goal-product-point-table-wrap">
                      <table className="goal-product-point-table">
                        <thead>
                          <tr>
                            <th>Urun</th>
                            <th>Urun Puani</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productPointRows.map((row) => (
                            <tr key={`product-point-${row.product}`}>
                              <td>{row.product}</td>
                              <td>{formatNumber(row.points)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}

            {!category.hasTarget ? <div className="goal-category-topline"><span>Bu kategoride hedef tanimi yok.</span></div> : null}
            {category.hasTarget && !category.showProjection ? (
              <div className="goal-category-topline">
                <span>Bu kategoride ay sonu projeksiyonu hesaplanmiyor.</span>
              </div>
            ) : null}

            {category.children.length ? (
              <div className="goal-child-list">
                {category.children.map((child) => (
                  <div key={`${category.title}-${child.title}`} className="goal-child-card">
                    <div className="goal-child-head">
                      <strong>{child.title}</strong>
                      <span>{formatNumber(child.actual)}</span>
                    </div>
                    <div className="goal-child-meta">
                      {child.hasTarget ? <span>Hedef {formatNumber(child.target)}</span> : null}
                      <span>Gerceklesen {formatNumber(child.actual)}</span>
                      {child.hasTarget ? <span>Kalan {formatNumber(child.remaining)}</span> : null}
                      {child.hasTarget && child.actualPercent !== null ? <span>Anlik % {formatPercent(child.actualPercent)}</span> : null}
                      {child.showProjection && child.projectedActual !== null ? <span>Ay Sonu {formatNumber(child.projectedActual)}</span> : null}
                      {child.hasTarget && child.showProjection && child.projectedPercent !== null ? (
                        <span className={getProjectedPercentPillClass(child.projectedPercent)}>Ay Sonu % {formatPercent(child.projectedPercent)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {category.storeDetails && category.storeDetails.length ? (
              <div className="goal-store-detail-list">
                <strong className="goal-store-detail-title">Sube Detaylari</strong>
                <div className="goal-child-list">
                  {category.storeDetails.map((store) => (
                    <div key={`${category.title}-${store.title}`} className="goal-child-card">
                      <div className="goal-child-head">
                        <strong>{store.title}</strong>
                        <span>{formatNumber(store.actual)}</span>
                      </div>
                      <div className="goal-child-meta">
                        {store.hasTarget ? <span>Hedef {formatNumber(store.target)}</span> : null}
                        <span>Gerceklesen {formatNumber(store.actual)}</span>
                        {store.hasTarget ? <span>Kalan {formatNumber(store.remaining)}</span> : null}
                        {store.hasTarget && store.actualPercent !== null ? <span>Anlik % {formatPercent(store.actualPercent)}</span> : null}
                        {store.showProjection && store.projectedActual !== null ? <span>Ay Sonu {formatNumber(store.projectedActual)}</span> : null}
                        {store.hasTarget && store.showProjection && store.projectedPercent !== null ? (
                          <span className={getProjectedPercentPillClass(store.projectedPercent)}>Ay Sonu % {formatPercent(store.projectedPercent)}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          </details>
        );
      })}
    </div>
  );
}

function GoalActualOnlyCategoryCards({ categories }: { categories: GoalCategorySummary[] }) {
  return (
    <div className="goal-category-list">
      {categories.map((category) => (
        <details key={category.title} className="goal-category-card">
          <summary className="goal-category-summary">
            <div className="goal-category-title">
              <strong>{category.title}</strong>
              <span>{category.childCount > 0 ? `${category.childCount} alt kategori` : "Tek kalem kategori"}</span>
            </div>

            {category.childCount > 0 ? <span className="goal-category-caret">v</span> : null}

            <div className="goal-category-metrics">
              <span>
                <small>Gerceklesen</small>
                <strong>{formatNumber(category.actual)}</strong>
              </span>
            </div>
          </summary>

          {category.children.length ? (
            <div className="goal-category-body">
              <div className="goal-child-list">
                {category.children.map((child) => (
                  <div key={`${category.title}-${child.title}`} className="goal-child-card">
                    <div className="goal-child-head">
                      <strong>{child.title}</strong>
                      <span>{formatNumber(child.actual)}</span>
                    </div>
                    <div className="goal-child-meta">
                      <span>Gerceklesen {formatNumber(child.actual)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </details>
      ))}
    </div>
  );
}

export default async function GoalActualPage({ searchParams }: GoalActualPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedView = String(params?.view ?? "employee").trim();
  const selectedEmployee = String(params?.employee ?? "").trim();
  const selectedStore = String(params?.store ?? "").trim();
  const selectedCategory = String(params?.category ?? "").trim();
  const selectedPanel = String(params?.panel ?? "detail").trim();

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

  if (!profile || profile.approval !== "approved") {
    redirect("/hesabim");
  }

  const canViewAll = canViewAllGoalActual(profile.role);
  const currentUserStore = (profile as { store?: Array<{ name: string }> | { name: string } | null }).store;
  const currentUserStoreName = Array.isArray(currentUserStore)
    ? (currentUserStore[0]?.name ?? "")
    : (currentUserStore?.name ?? "");
  const effectiveView: GoalView = canViewAll
    ? selectedView === "store"
      ? "store"
      : selectedView === "company"
        ? "company"
        : "employee"
    : "employee";
  const effectivePanel =
    selectedPanel === "needs"
      ? "needs"
      : effectiveView === "employee" && selectedPanel === "ranking"
        ? "ranking"
        : "detail";

  if (!canViewAll && selectedView !== "employee") {
    redirect(buildHref("employee", { employee: selectedEmployee, panel: effectivePanel }));
  }

  let employeeRows: GoalActualRow[] = [];
  let storeRows: GoalStoreRow[] = [];
  let productionRewardRows: GoalProductionRewardRow[] = [];
  let productPointRows: GoalProductPointRow[] = [];
  let dayStats: GoalDayStats = EMPTY_DAY_STATS;
  let sheetError = "";

  try {
    [employeeRows, storeRows, dayStats, productionRewardRows, productPointRows] = await Promise.all([
      fetchGoalActualRows(),
      fetchGoalStoreRows(),
      fetchGoalDayStats(),
      fetchGoalProductionRewardRows(),
      fetchGoalProductPointRows()
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheet verisi okunamadi.";
    sheetError = message;
  }

  const filteredEmployeeRows = employeeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));
  const filteredEmployeeCoreRows = filteredEmployeeRows.filter((row) => !isLivePrimeCategory(row.mainCategory));
  const filteredStoreRows = storeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));

  const employeeNames = Array.from(new Set(filteredEmployeeRows.map((row) => row.employeeName))).sort((a, b) => a.localeCompare(b, "tr"));
  const employeeCategoryOptions = Array.from(new Set(filteredEmployeeCoreRows.map((row) => row.mainCategory))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
  const storeNames = Array.from(new Set(storeRows.map((row) => row.storeCode))).sort((a, b) => a.localeCompare(b, "tr"));
  const storeCategoryOptions = Array.from(new Set(filteredStoreRows.map((row) => row.mainCategory))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );

  const effectiveEmployee = employeeNames.includes(selectedEmployee) ? selectedEmployee : "";
  const effectiveStore = storeNames.includes(selectedStore) ? selectedStore : "";
  const rankingCategoryPool = effectiveView === "store" ? storeCategoryOptions : employeeCategoryOptions;
  const defaultRankingCategory = rankingCategoryPool[0] ?? "";
  const effectiveCategory =
    effectivePanel === "ranking" && rankingCategoryPool.includes(selectedCategory) ? selectedCategory : defaultRankingCategory;

  const employeeRankingRows = effectiveCategory
    ? filteredEmployeeCoreRows.filter((row) => row.mainCategory === effectiveCategory)
    : filteredEmployeeCoreRows;
  const storeRankingRows = effectiveCategory
    ? filteredStoreRows.filter((row) => row.mainCategory === effectiveCategory)
    : filteredStoreRows;

  const employeeMap = new Map<string, GoalActualRow[]>();
  employeeRankingRows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  const employeeSummaries = Array.from(employeeMap.entries())
    .map(([, rows]) => buildEmployeeSummary(rows, dayStats.workedDays, dayStats.totalDays))
    .sort((a, b) => {
      if (a.hasTarget && b.hasTarget) {
        return (b.projectedPercent ?? 0) - (a.projectedPercent ?? 0) || b.totalActual - a.totalActual;
      }

      if (a.hasTarget !== b.hasTarget) {
        return a.hasTarget ? -1 : 1;
      }

      return b.projectedActual - a.projectedActual || b.totalActual - a.totalActual;
    });

  const employeeLivePrimeMap = new Map<string, GoalActualRow[]>();
  filteredEmployeeRows
    .filter((row) => isLivePrimeCategory(row.mainCategory))
    .forEach((row) => {
      const current = employeeLivePrimeMap.get(row.employeeName) ?? [];
      current.push(row);
      employeeLivePrimeMap.set(row.employeeName, current);
    });

  const employeeLivePrimeRankingSummaries = Array.from(employeeLivePrimeMap.entries())
    .map(([, rows]) => buildEmployeeSummary(rows, dayStats.workedDays, dayStats.totalDays))
    .sort((a, b) => {
      if (a.hasTarget && b.hasTarget) {
        return (b.projectedPercent ?? 0) - (a.projectedPercent ?? 0) || b.totalActual - a.totalActual;
      }

      if (a.hasTarget !== b.hasTarget) {
        return a.hasTarget ? -1 : 1;
      }

      return b.projectedActual - a.projectedActual || b.totalActual - a.totalActual;
    });

  const storeMap = new Map<string, GoalStoreRow[]>();
  storeRankingRows.forEach((row) => {
    const current = storeMap.get(row.storeCode) ?? [];
    current.push(row);
    storeMap.set(row.storeCode, current);
  });

  const storeSummaries = Array.from(storeMap.entries())
    .map(([name, rows]) => ({
      name,
      ...buildStoreMetricSummary(rows, dayStats.workedDays, dayStats.totalDays)
    }))
    .sort((a, b) => {
      if (a.hasTarget && b.hasTarget && a.actualPercent !== null && b.actualPercent !== null) {
        return b.actualPercent - a.actualPercent || b.actual - a.actual;
      }

      if (a.hasTarget !== b.hasTarget) {
        return a.hasTarget ? -1 : 1;
      }

      return b.actual - a.actual;
    });

  const activeEmployeeName = effectiveEmployee || employeeSummaries[0]?.name || "";
  const activeStoreName = effectiveStore || storeSummaries[0]?.name || "";
  let storeLoginGapNotes: StoreLoginGapNote[] = [];
  let companyLoginGapNotes: CompanyLoginGapNote[] = [];

  if (effectiveView === "store" && activeStoreName) {
    try {
      const admin = createAdminClient();
      const { data: storeRecord } = await admin.from("stores").select("id").eq("name", activeStoreName).maybeSingle();

      if (storeRecord?.id) {
        const profilesResult = await admin
          .from("profiles")
          .select("id, full_name")
          .eq("store_id", storeRecord.id)
          .eq("approval", "approved")
          .in("role", ["employee", "manager"])
          .order("full_name", { ascending: true });

        const profiles = (profilesResult.data ?? []) as Array<{ id: string; full_name: string }>;

        if (profiles.length) {
          const authUsers: Array<{ id: string; last_sign_in_at?: string | null }> = [];
          let page = 1;
          const perPage = 1000;

          while (true) {
            const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

            if (error) {
              break;
            }

            const batch = data?.users ?? [];
            authUsers.push(...batch);

            if (batch.length < perPage) {
              break;
            }

            page += 1;
          }

          const authUserLastLoginMap = new Map(authUsers.map((entry) => [entry.id, entry.last_sign_in_at ?? null] as const));

          storeLoginGapNotes = profiles
            .map((person) => {
              const lastSignInAt = authUserLastLoginMap.get(person.id);

              if (!lastSignInAt) {
                return null;
              }

              const daysSinceLogin = calculateDaysSinceLogin(lastSignInAt);

              if (daysSinceLogin === null || daysSinceLogin < 2) {
                return null;
              }

              return {
                profileId: person.id,
                fullName: person.full_name,
                daysSinceLogin
              };
            })
            .filter((note): note is StoreLoginGapNote => Boolean(note))
            .sort((left, right) => right.daysSinceLogin - left.daysSinceLogin || left.fullName.localeCompare(right.fullName, "tr"));
        }
      }
    } catch {
      storeLoginGapNotes = [];
    }
  }

  if (effectiveView === "company") {
    try {
      const admin = createAdminClient();
      const profilesResult = await admin
        .from("profiles")
        .select("id, full_name, store:stores(name)")
        .eq("approval", "approved")
        .in("role", ["employee", "manager"])
        .order("full_name", { ascending: true });

      const profiles = (profilesResult.data ?? []) as Array<{
        id: string;
        full_name: string;
        store: Array<{ name: string }> | { name: string } | null;
      }>;

      if (profiles.length) {
        const authUsers: Array<{ id: string; last_sign_in_at?: string | null }> = [];
        let page = 1;
        const perPage = 1000;

        while (true) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

          if (error) {
            break;
          }

          const batch = data?.users ?? [];
          authUsers.push(...batch);

          if (batch.length < perPage) {
            break;
          }

          page += 1;
        }

        const authUserLastLoginMap = new Map(authUsers.map((entry) => [entry.id, entry.last_sign_in_at ?? null] as const));

        companyLoginGapNotes = profiles
          .map((person) => {
            const lastSignInAt = authUserLastLoginMap.get(person.id);

            if (!lastSignInAt) {
              return null;
            }

            const daysSinceLogin = calculateDaysSinceLogin(lastSignInAt);

            if (daysSinceLogin === null || daysSinceLogin < 2) {
              return null;
            }

            return {
              profileId: person.id,
              fullName: person.full_name,
              storeName: Array.isArray(person.store) ? (person.store[0]?.name ?? "-") : (person.store?.name ?? "-"),
              daysSinceLogin
            };
          })
          .filter((note): note is CompanyLoginGapNote => Boolean(note))
          .sort(
            (left, right) =>
              right.daysSinceLogin - left.daysSinceLogin ||
              left.storeName.localeCompare(right.storeName, "tr") ||
              left.fullName.localeCompare(right.fullName, "tr")
          );
      }
    } catch {
      companyLoginGapNotes = [];
    }
  }

  const activeEmployeeRows = activeEmployeeName
    ? filteredEmployeeRows.filter((row) => row.employeeName === activeEmployeeName)
    : [];
  const activeEmployeeCoreRows = activeEmployeeName
    ? filteredEmployeeCoreRows.filter((row) => row.employeeName === activeEmployeeName)
    : [];
  const activeStoreRows = activeStoreName ? filteredStoreRows.filter((row) => row.storeCode === activeStoreName) : [];
  const activeEmployeeStoreCode = resolveStoreCodeFromEmployeeRows(activeEmployeeRows, storeNames, currentUserStoreName);
  const employeeCategorySummaries = buildCategorySummaries(activeEmployeeCoreRows, dayStats.workedDays, dayStats.totalDays);
  const employeeLivePrimeCategorySummaries = buildCategorySummaries(
    activeEmployeeRows.filter((row) => isLivePrimeCategory(row.mainCategory)),
    dayStats.workedDays,
    dayStats.totalDays
  );
  const storeCategorySummaries = buildStoreCategorySummaries(activeStoreRows, dayStats.workedDays, dayStats.totalDays);
  const companyCategorySummaries = buildCompanyCategorySummaries(filteredStoreRows, dayStats.workedDays, dayStats.totalDays);
  const storeNeedSummaries = storeCategorySummaries
    .filter((category) => category.hasTarget)
    .map((category) => ({
      title: category.title,
      actual: category.actual,
      target: category.target ?? 0,
      needRows: buildNeedRows(category, dayStats.remainingDays)
    }));
  const detailCategorySummaries =
    effectiveView === "company"
      ? companyCategorySummaries
      : effectiveView === "store"
        ? storeCategorySummaries
        : employeeCategorySummaries;
  const detailCoachingMetrics = detailCategorySummaries.map(toCoachingMetric);
  const detailEmployeeAverageNotes =
    effectiveView === "employee" ? buildEmployeeAverageGapNotes(detailCoachingMetrics, filteredEmployeeCoreRows) : [];
  const detailStoreAverageNotes =
    effectiveView === "store" ? buildStoreAverageGapNotes(detailCoachingMetrics, filteredStoreRows) : [];
  const detailCoachingText = buildGoalActualCoachingText({
    view: effectiveView,
    metrics: detailCoachingMetrics,
    employeeAverageNotes: detailEmployeeAverageNotes,
    storeAverageNotes: detailStoreAverageNotes,
    remainingDays: dayStats.remainingDays
  });
  const detailZeroActualItems =
    effectiveView === "employee"
      ? buildEmployeeZeroActualItems(activeEmployeeCoreRows)
      : effectiveView === "store"
        ? buildStoreZeroActualItems(activeStoreRows)
        : buildCompanyZeroActualItems(filteredStoreRows);
  const companyStoreZeroActualGroups =
    effectiveView === "company" ? buildCompanyStoreZeroActualGroups(filteredStoreRows) : [];
  const companyTrendSummaryRows =
    effectiveView !== "employee" || Boolean(activeEmployeeStoreCode)
      ? buildCompanyTrendSummaryRows(
          companyCategorySummaries,
          filteredStoreRows,
          dayStats.workedDays,
          dayStats.totalDays
        )
      : [];
  const companyCurrentSummaryRows =
    effectiveView !== "employee" || Boolean(activeEmployeeStoreCode) ? buildCompanyCurrentSummaryRows(filteredStoreRows) : [];
  const companyTrendStoreCodes =
    effectiveView !== "employee" || Boolean(activeEmployeeStoreCode)
      ? Array.from(
          new Set([
            ...companyTrendSummaryRows.flatMap((row) => row.stores.map((store) => store.storeCode)),
            ...companyCurrentSummaryRows.flatMap((row) => row.stores.map((store) => store.storeCode))
          ])
        ).sort((a, b) => a.localeCompare(b, "tr"))
      : [];
  const resolvedEmployeeStoreCode =
    effectiveView === "employee" ? resolveStoreCodeFromEmployeeRows(activeEmployeeRows, companyTrendStoreCodes, activeEmployeeStoreCode) : "";
  const employeeTrendStoreCodes =
    effectiveView === "employee" && resolvedEmployeeStoreCode && companyTrendStoreCodes.includes(resolvedEmployeeStoreCode)
      ? [resolvedEmployeeStoreCode]
      : [];
  const storeTrendStoreCodes =
    effectiveView === "store" && activeStoreName && companyTrendStoreCodes.includes(activeStoreName) ? [activeStoreName] : [];
  const visibleTrendStoreCodes =
    effectiveView === "employee"
      ? employeeTrendStoreCodes
      : effectiveView === "store"
        ? storeTrendStoreCodes
        : companyTrendStoreCodes;
  const highlightedTrendStoreCode =
    effectiveView === "store" ? activeStoreName : effectiveView === "employee" ? resolvedEmployeeStoreCode : "";
  const detailCardTitle =
    effectiveView === "company" ? "FIRMA" : effectiveView === "store" ? activeStoreName || "MAGAZA" : activeEmployeeName || "CALISAN";

  const employeeOptions = employeeNames.length
    ? employeeNames.map((name) => ({
        value: buildHref("employee", { employee: name, panel: effectivePanel }),
        label: name
      }))
    : [{ value: buildHref("employee", { panel: effectivePanel }), label: "Calisan bulunamadi" }];

  const storeOptions = storeNames.length
    ? storeNames.map((name) => ({
        value: buildHref("store", { store: name, panel: effectivePanel }),
        label: name
      }))
    : [{ value: buildHref("store", { panel: effectivePanel }), label: "Magaza bulunamadi" }];

  const categoryOptions = rankingCategoryPool.map((category) => ({
    value:
      effectiveView === "store"
        ? buildHref("store", { store: activeStoreName, category, panel: effectivePanel })
        : buildHref("employee", { employee: activeEmployeeName, category, panel: effectivePanel }),
    label: category
  }));

  return (
      <main>
        <h1 className="page-title">Hedef Gerceklesen</h1>

        <section className="goal-control-shell">
        <div className="goal-tab-row">
          <a
            className={`goal-tab ${effectiveView === "employee" ? "goal-tab-active" : ""}`}
            href={buildHref("employee", { employee: effectiveEmployee, panel: effectivePanel })}
          >
            Calisan
          </a>
          {canViewAll ? (
            <>
              <a
                className={`goal-tab ${effectiveView === "store" ? "goal-tab-active" : ""}`}
                href={buildHref("store", { store: effectiveStore, panel: effectivePanel })}
              >
                Magaza
              </a>
              <a className={`goal-tab ${effectiveView === "company" ? "goal-tab-active" : ""}`} href={buildHref("company")}>
                Firma
              </a>
            </>
          ) : null}
        </div>

        {sheetError ? (
        <section className="guide-card goal-placeholder-card">
          <strong>Hedef Gerceklesen verisi su an acilamadi.</strong>
          <p className="subtle">{sheetError}</p>
          <p className="subtle">Google Sheet erisimi duzeldiginde sayfa otomatik olarak tekrar kullanilabilir olacak.</p>
        </section>
        ) : (
        <>
          <section className="goal-summary-strip">
            <article className="goal-summary-card">
              <span>Calisilan Gun</span>
              <strong>{formatNumber(dayStats.workedDays)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Kalan Gun</span>
              <strong>{formatNumber(dayStats.remainingDays)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Toplam Gun</span>
              <strong>{formatNumber(dayStats.totalDays)}</strong>
            </article>
          </section>

          {effectiveView !== "company" ? (
            <section className="guide-card game-brief-card goal-filter-card">
              <div className="league-filter-grid goal-filter-grid">
                {effectivePanel === "detail" || effectiveView === "store" ? (
                  <div className="league-filter-item league-filter-item-wide">
                    <span className="league-filter-label">{effectiveView === "store" ? "Magaza" : "Calisan"}</span>
                    <FilterSelectNav
                      ariaLabel={effectiveView === "store" ? "Magaza secimi" : "Calisan secimi"}
                      value={
                        effectiveView === "store"
                          ? buildHref("store", { store: activeStoreName, panel: effectivePanel })
                          : buildHref("employee", { employee: activeEmployeeName, panel: effectivePanel })
                      }
                      options={effectiveView === "store" ? storeOptions : employeeOptions}
                    />
                  </div>
                ) : (
                  <div className="league-filter-item league-filter-item-wide">
                    <span className="league-filter-label">Ana Kategori</span>
                    <FilterSelectNav
                      ariaLabel="Ana kategori secimi"
                      value={buildHref("employee", { employee: activeEmployeeName, category: effectiveCategory, panel: effectivePanel })}
                      options={categoryOptions}
                    />
                  </div>
                )}
              </div>

              <div className="goal-mode-row">
                <a
                  className={`goal-mode-button ${effectivePanel === "detail" ? "goal-mode-button-active" : ""}`}
                  href={
                    effectiveView === "store"
                      ? buildHref("store", { store: activeStoreName, panel: "detail" })
                      : buildHref("employee", { employee: activeEmployeeName, panel: "detail" })
                  }
                >
                  Hedef Gerceklesen
                </a>
                {effectiveView === "store" ? (
                  <a
                    className={`goal-mode-button ${effectivePanel === "needs" ? "goal-mode-button-active" : ""}`}
                    href={buildHref("store", { store: activeStoreName, panel: "needs" })}
                  >
                    Gunluk Ihtiyaclar
                  </a>
                ) : (
                  <a
                    className={`goal-mode-button ${effectivePanel === "ranking" ? "goal-mode-button-active" : ""}`}
                    href={buildHref("employee", { employee: activeEmployeeName, category: effectiveCategory, panel: "ranking" })}
                  >
                    Siralama
                  </a>
                )}
              </div>
            </section>
          ) : null}

          {effectiveView === "store" && effectivePanel === "needs" ? (
            <section className="goal-panel-single">
              <article className="campaign-section-card goal-detail-card">
                <div className="goal-section-head">
                  <h2>{activeStoreName || "Magaza Gunluk Ihtiyaclari"}</h2>
                  <span>Hedefli kalemler icin gunluk gereken adet / tutar</span>
                </div>

                {storeNeedSummaries.length ? (
                  <div className="goal-category-list">
                    {storeNeedSummaries.map((item) => (
                      <article key={item.title} className="goal-category-card goal-need-card">
                        <div className="goal-category-summary">
                          <div className="goal-category-title">
                            <strong>{item.title}</strong>
                            <span>
                              Gerceklesen {formatNumber(item.actual)} / Hedef {formatNumber(item.target)}
                            </span>
                          </div>
                        </div>
                        <div className="goal-category-body">
                            <div className="goal-need-grid">
                              {item.needRows.map((need) => (
                                <div key={`${item.title}-${need.threshold}`} className="goal-need-row">
                                  <div className="goal-need-cell">
                                    <small>Skala</small>
                                    <strong>%{need.threshold}</strong>
                                  </div>
                                  <div className="goal-need-cell goal-need-cell-value">
                                    <small>Deger</small>
                                    <strong>{formatNumber(need.dailyRequired)}</strong>
                                  </div>
                                </div>
                              ))}
                            </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="subtle">Bu magazada hedef tanimli kalem bulunamadi.</p>
                )}
              </article>
            </section>
          ) : effectivePanel === "ranking" && effectiveView !== "company" ? (
            <section className="goal-panel-single">
              <div className="goal-ranking-stack">
                <article className="campaign-section-card goal-ranking-card">
                  <div className="goal-section-head">
                    <h2>{effectiveView === "store" ? "Magaza Siralamasi" : "Firma Siralamasi"}</h2>
                    <span>{effectiveCategory || "Kategori yok"}</span>
                  </div>

                  <div className="goal-ranking-list">
                    {(effectiveView === "store" ? storeSummaries : employeeSummaries).length ? (
                      (effectiveView === "store" ? storeSummaries : employeeSummaries).map((summary, index) => (
                        <a
                          key={summary.name}
                          className={`goal-ranking-row ${
                            summary.name === (effectiveView === "store" ? activeStoreName : activeEmployeeName) ? "goal-ranking-row-active" : ""
                          }`}
                          href={
                            effectiveView === "store"
                              ? buildHref("store", { store: summary.name, panel: "detail" })
                              : buildHref("employee", { employee: summary.name, panel: "detail" })
                          }
                        >
                          <span className="goal-rank-badge">{index + 1}</span>
                          <div className="goal-ranking-main">
                            <strong>{summary.name}</strong>
                            <span>
                              {summary.hasTarget && summary.actualPercent !== null
                                ? `Gerceklesen ${formatPercent(summary.actualPercent)}${
                                    summary.showProjection && summary.projectedPercent !== null
                                      ? ` | Ay sonu ${formatPercent(summary.projectedPercent)}`
                                      : ""
                                  }`
                                : `Gerceklesen ${formatNumber(summary.actual)}${
                                    summary.showProjection && summary.projectedActual !== null
                                      ? ` | Ay sonu ${formatNumber(summary.projectedActual)}`
                                      : ""
                                  }`}
                            </span>
                          </div>
                          <strong className="goal-ranking-score">
                            {summary.hasTarget && summary.actualPercent !== null
                              ? formatPercent(summary.actualPercent)
                              : formatNumber(summary.actual)}
                          </strong>
                        </a>
                      ))
                    ) : (
                      <p className="subtle">Listelenecek veri bulunamadi.</p>
                    )}
                  </div>
                </article>

                {effectiveView === "employee" && employeeLivePrimeRankingSummaries.length ? (
                  <details className="campaign-section-card goal-ranking-card goal-live-prime-ranking-card">
                    <summary className="goal-live-prime-ranking-summary">
                      <div className="goal-section-head">
                        <h2>Canli Primler Siralamasi</h2>
                        <span>Ana siralama ve degerlendirmeden ayri gosterilir</span>
                      </div>
                      <span className="goal-live-prime-ranking-caret">v</span>
                    </summary>

                    <div className="goal-live-prime-ranking-export">
                      <a
                        className="button-secondary export-link-button"
                        href="/api/hedef-gerceklesen/canli-primler-excel"
                      >
                        Excele Indir
                      </a>
                    </div>

                    <div className="goal-ranking-list goal-live-prime-ranking-list">
                      {employeeLivePrimeRankingSummaries.map((summary, index) => (
                        <a
                          key={`live-prime-${summary.name}`}
                          className={`goal-ranking-row goal-live-prime-ranking-row ${
                            summary.name === activeEmployeeName ? "goal-ranking-row-active" : ""
                          }`}
                          href={buildHref("employee", { employee: summary.name, panel: "detail" })}
                        >
                          <span className="goal-rank-badge">{index + 1}</span>
                          <div className="goal-ranking-main">
                            <strong>{summary.name}</strong>
                            <span>{`Gerceklesen ${formatNumber(summary.actual)}`}</span>
                          </div>
                          <strong className="goal-ranking-score">
                            {formatNumber(summary.actual)}
                          </strong>
                        </a>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="goal-panel-single">
              <article className="campaign-section-card goal-detail-card">
                <div className="goal-section-head">
                  <h2>
                    {effectiveView === "company"
                      ? "Firma Hedef Gerceklesen"
                      : effectiveView === "store"
                        ? activeStoreName || "Magaza Detayi"
                        : activeEmployeeName || "Calisan Detayi"}
                  </h2>
                  <span>{effectiveView === "company" ? "Kategori bazli toplu ozet" : "Kategori bazli detay"}</span>
                </div>

                {effectiveView === "company" ? (
                  companyCategorySummaries.length ? (
                    <GoalCategoryCards categories={companyCategorySummaries} />
                  ) : (
                    <p className="subtle">Firma verisi bulunamadi.</p>
                  )
                ) : effectiveView === "store" ? (
                  storeCategorySummaries.length ? (
                    <GoalCategoryCards categories={storeCategorySummaries} />
                  ) : (
                    <p className="subtle">Bu magaza icin kategori verisi bulunamadi.</p>
                  )
                ) : employeeCategorySummaries.length ? (
                  <GoalCategoryCards
                    categories={employeeCategorySummaries}
                    remainingDays={dayStats.remainingDays}
                    productionRewardRows={productionRewardRows}
                    productPointRows={productPointRows}
                  />
                ) : (
                  <p className="subtle">Bu filtreye uygun calisan verisi bulunamadi.</p>
                )}

                {detailCategorySummaries.length ? (
                  <div className="evaluation-card">
                    <div className="evaluation-card-head">
                      <strong>{detailCardTitle}</strong>
                    </div>

                    <FormattedCoachingText text={detailCoachingText} />

                    {detailZeroActualItems.length ? (
                      <div className="evaluation-zero-alert">
                        <strong>Gozden kacirdigin kalemler</strong>
                        <p>Gercekleseni 0 olan bu kalemler bugun mutlaka kontrol edilmeli.</p>
                        <div>
                          {detailZeroActualItems.map((item) => (
                            <span key={item.key}>{item.label}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {effectiveView === "company" && companyStoreZeroActualGroups.length ? (
                      <div className="evaluation-zero-alert evaluation-zero-alert-stores">
                        <strong>Subelerin gozden kacirdigi kalemler</strong>
                        <p>Firma toplaminda sifir kalan kalemler sube bazinda asagida listelenir.</p>
                        <div className="evaluation-zero-store-list">
                          {companyStoreZeroActualGroups.map((group) => (
                            <div key={group.storeCode} className="evaluation-zero-store-card">
                              <strong>{group.storeCode}</strong>
                              <div>
                                {group.items.map((item) => (
                                  <span key={`${group.storeCode}-${item}`}>{item}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="evaluation-card-actions evaluation-card-actions-bottom">
                      <SpeakCoachingButton text={detailCoachingText} />
                      <CopyCoachingButton text={detailCoachingText} />
                    </div>
                  </div>
                ) : null}

                {effectiveView === "store" && storeLoginGapNotes.length ? (
                  <div className="evaluation-zero-alert evaluation-login-alert">
                    <strong>Portala giris yapmayan calisanlar</strong>
                    <div>
                      {storeLoginGapNotes.map((note) => (
                        <span key={note.profileId}>
                          {note.fullName} - {note.daysSinceLogin} gundur giris yapmamistir
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {effectiveView === "employee" && employeeLivePrimeCategorySummaries.length ? (
                  <div className="goal-live-prime-panel">
                    <div className="goal-live-prime-head">
                      <h3>Canli Primler</h3>
                    </div>
                    <GoalActualOnlyCategoryCards categories={employeeLivePrimeCategorySummaries} />
                  </div>
                ) : null}

                {visibleTrendStoreCodes.length && companyTrendSummaryRows.length ? (
                  <div className="goal-company-trend-panel">
                    <div className="goal-live-prime-head">
                      <h3>{effectiveView === "employee" ? "Sube Ay Sonu Gidisat Ozeti" : "Ay Sonu Gidisat Ozeti"}</h3>
                    </div>

                    <div className="goal-company-trend-table-wrap">
                      <table className="goal-company-trend-table">
                        <thead>
                          <tr>
                            <th>Kategori</th>
                            {visibleTrendStoreCodes.map((storeCode) => (
                              <th
                                key={`trend-head-${storeCode}`}
                                className={storeCode === highlightedTrendStoreCode ? "goal-company-trend-selected" : ""}
                              >
                                {storeCode}
                              </th>
                            ))}
                            {effectiveView !== "employee" ? <th>Firma</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {companyTrendSummaryRows.map((row) => (
                            <tr key={`trend-row-${row.title}`}>
                              <th>{row.title}</th>
                              {visibleTrendStoreCodes.map((storeCode) => {
                                const store = row.stores.find((item) => item.storeCode === storeCode);
                                const comparisonState =
                                  storeCode === highlightedTrendStoreCode && row.title !== "Giris Sayilari"
                                    ? getTrendComparisonState(store?.projectedPercent, row.companyProjectedPercent)
                                    : null;
                                const cellClasses = [
                                  storeCode === highlightedTrendStoreCode ? "goal-company-trend-selected" : "",
                                  store?.projectedPercent !== null &&
                                  store?.projectedPercent !== undefined &&
                                  store.projectedPercent >= 100
                                    ? "goal-company-trend-good"
                                    : ""
                                ]
                                  .filter(Boolean)
                                  .join(" ");

                                return (
                                  <td key={`trend-${row.title}-${storeCode}`} className={cellClasses}>
                                    <span className="goal-company-trend-value">
                                      <span>{formatPercent(store?.projectedPercent)}</span>
                                      {comparisonState ? (
                                        <span
                                          className={`goal-company-trend-indicator goal-company-trend-indicator-${comparisonState}`}
                                          aria-hidden="true"
                                        />
                                      ) : null}
                                    </span>
                                  </td>
                                );
                              })}
                              {effectiveView !== "employee" ? (
                                <td
                                  className={`goal-company-trend-company ${
                                    row.companyProjectedPercent !== null && row.companyProjectedPercent >= 100
                                      ? "goal-company-trend-good"
                                      : ""
                                  }`}
                                >
                                  {formatPercent(row.companyProjectedPercent)}
                                </td>
                              ) : null}
                            </tr>
                          ))}

                          {companyCurrentSummaryRows.map((row) => (
                            <tr key={`current-row-${row.title}`}>
                              <th>{row.title}</th>
                              {visibleTrendStoreCodes.map((storeCode) => {
                                const store = row.stores.find((item) => item.storeCode === storeCode);
                                const isGood =
                                  row.title === "Memnuniyet"
                                    ? (store?.actual ?? 0) >= 4.4
                                    : row.title === "Pin Orani"
                                      ? (store?.actual ?? 0) >= 70
                                      : true;
                                const comparisonState =
                                  storeCode === highlightedTrendStoreCode && row.title !== "Giris Sayilari"
                                    ? getTrendComparisonState(store?.actual, row.companyActual)
                                    : null;
                                const cellClasses = [
                                  storeCode === highlightedTrendStoreCode ? "goal-company-trend-selected" : "",
                                  isGood ? "goal-company-trend-good" : "goal-company-trend-bad"
                                ]
                                  .filter(Boolean)
                                  .join(" ");

                                return (
                                  <td key={`current-${row.title}-${storeCode}`} className={cellClasses}>
                                    <span className="goal-company-trend-value">
                                      <span>{row.valueType === "percent" ? formatPercent(store?.actual) : formatNumber(store?.actual)}</span>
                                      {comparisonState ? (
                                        <span
                                          className={`goal-company-trend-indicator goal-company-trend-indicator-${comparisonState}`}
                                          aria-hidden="true"
                                        />
                                      ) : null}
                                    </span>
                                  </td>
                                );
                              })}
                              {effectiveView !== "employee" ? (
                                <td
                                  className={`goal-company-trend-company ${
                                    row.title === "Memnuniyet"
                                      ? (row.companyActual ?? 0) >= 4.4
                                        ? "goal-company-trend-good"
                                        : "goal-company-trend-bad"
                                      : row.title === "Pin Orani"
                                        ? (row.companyActual ?? 0) >= 70
                                          ? "goal-company-trend-good"
                                          : "goal-company-trend-bad"
                                        : "goal-company-trend-good"
                                  }`}
                                >
                                  {row.valueType === "percent" ? formatPercent(row.companyActual) : formatNumber(row.companyActual)}
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {effectiveView === "store" ? (
                      <div className="goal-company-trend-legend">
                        <span>
                          <span className="goal-company-trend-indicator goal-company-trend-indicator-down" aria-hidden="true" />
                          Firma gerceklesen alti
                        </span>
                        <span>
                          <span className="goal-company-trend-indicator goal-company-trend-indicator-up" aria-hidden="true" />
                          Firma gerceklesen ustu
                        </span>
                        <span>
                          <span className="goal-company-trend-indicator goal-company-trend-indicator-equal" aria-hidden="true" />
                          Esit
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {effectiveView === "company" && companyLoginGapNotes.length ? (
                  <div className="evaluation-zero-alert evaluation-login-alert">
                    <strong>Firma geneli portala giris yapmayanlar</strong>
                    <div>
                      {companyLoginGapNotes.map((note) => (
                        <span key={note.profileId}>
                          {note.storeName} - {note.fullName} - {note.daysSinceLogin} gundur giris yapmamistir
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            </section>
          )}
        </>
      )}
      </section>
    </main>
  );
}
