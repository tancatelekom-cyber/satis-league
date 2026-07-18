import { Fragment, type CSSProperties } from "react";
import { redirect } from "next/navigation";
import { CopyCoachingButton } from "@/components/evaluation/copy-coaching-button";
import { CompanyDailyNeedsTable } from "@/components/evaluation/company-daily-needs-table";
import { DashboardShareButton } from "@/components/evaluation/dashboard-share-button";
import { FormattedCoachingText } from "@/components/evaluation/formatted-coaching-text";
import { SpeakCoachingButton } from "@/components/evaluation/speak-coaching-button";
import { StoreDailyNeedsTable } from "@/components/evaluation/store-daily-needs-table";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { fetchDocumentIssueRows } from "@/lib/document-issues";
import {
  GoalActualRow,
  GoalProductPointRow,
  GoalProductionRewardRow,
  GoalStoreRow,
  fetchGoalActualRows,
  fetchGoalDayStats,
  fetchGoalLivePrimeSettings,
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
  totalPrimeCurrentReward: number;
  totalPrimeProjectedReward: number;
  productionPrimeCurrentReward: number;
  productionPrimeProjectedReward: number;
  livePrimeCurrentReward: number;
  livePrimeProjectedReward: number;
  accessoryPrimeCurrentReward: number;
  accessoryPrimeProjectedReward: number;
  monthlyDeductionCurrentAmount: number;
  monthlyDeductionProjectedAmount: number;
  monthlyNetCurrentReward: number;
  monthlyNetProjectedReward: number;
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
      children: Array<
        GoalMetricSummary & {
          title: string;
        }
      >;
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
  isBelowTarget: boolean;
  isCurrentProjectedTier: boolean;
  isReached: boolean;
  remainingFromActual: number;
  dailyRequired: number;
};

type ProductionRewardPlan = {
  targetPoints: number;
  projectedPoints: number;
  actualPoints: number;
  projectedReward: string | null;
  actualReward: string | null;
  nextReward: string | null;
  rows: ProductionRewardPlanRow[];
};

type StoreEmployeeProductionPlan = {
  employeeName: string;
  targetPoints: number;
  actualPoints: number;
  projectedPoints: number;
  projectedReward: string | null;
  rows: ProductionRewardPlanRow[];
};

type GoalLivePrimeSettings = {
  workedDays: number;
  totalDays: number;
  accessoryScaleRows: Array<{
    thresholdPercent: number;
    ratePercent: number;
  }>;
  monthlyPrimeDeductionRules: Array<{
    categoryTitle: string;
    minimumValue: number;
    deductionPercent: number;
  }>;
};

type EmployeePrimeForecast = {
  productionCurrentReward: number;
  productionProjectedReward: number;
  livePrimeCurrentReward: number;
  livePrimeProjectedReward: number;
  accessoryCurrentBase: number;
  accessoryProjectedBase: number;
  accessoryCurrentRate: number;
  accessoryProjectedRate: number;
  accessoryCurrentReward: number;
  accessoryProjectedReward: number;
  monthlyGrossCurrentReward: number;
  monthlyGrossProjectedReward: number;
  monthlyDeductionCurrentRate: number;
  monthlyDeductionProjectedRate: number;
  monthlyDeductionCurrentAmount: number;
  monthlyDeductionProjectedAmount: number;
  monthlyNetCurrentReward: number;
  monthlyNetProjectedReward: number;
  totalCurrentReward: number;
  totalProjectedReward: number;
  monthlyDeductionCurrentReasons: Array<string>;
  monthlyDeductionProjectedReasons: Array<string>;
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

type CompanyDailyNeedSummaryRow = {
  title: string;
  groupKey: string;
  rowKey: string;
  level: number;
  hasChildren: boolean;
  cells: GoalNeedRow[];
  stores: Array<{
    storeCode: string;
    cells: GoalNeedRow[];
  }>;
};

type StoreDailyNeedSummaryRow = {
  title: string;
  groupKey: string;
  level: number;
  hasChildren: boolean;
  cells: GoalNeedRow[];
};

type GoalSeparateInfoStoreDetail = {
  storeCode: string;
  target: number | null;
  actual: number;
  targetIsPercent: boolean;
  actualIsPercent: boolean;
  hasTarget: boolean;
  isBelowTarget: boolean;
  isAtOrAboveTarget: boolean;
};

type GoalSeparateInfoRow = {
  title: string;
  groupTitle: string;
  subCategoryTitle: string | null;
  target: number | null;
  actual: number;
  targetIsPercent: boolean;
  actualIsPercent: boolean;
  hasTarget: boolean;
  isBelowTarget: boolean;
  isAtOrAboveTarget: boolean;
  storeDetails: GoalSeparateInfoStoreDetail[];
};

type GoalSeparateInfoGroup = {
  title: string;
  hasChildren: boolean;
  rows: GoalSeparateInfoRow[];
};

type EmployeeDailyNeedSummaryRow = {
  title: string;
  groupKey: string;
  level: number;
  referenceLabel: string;
  dailyRequired: number;
};

type GoalView = "employee" | "store" | "company";
type GoalPanel = "detail" | "ranking" | "evaluation" | "dashboard";

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

function normalizeEmployeeIdentity(value: string | null | undefined) {
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

function normalizeProfileIdentity(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
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

function formatGoalValue(value: number | null | undefined, isPercent: boolean) {
  return isPercent ? formatPercent(value) : formatNumber(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} TL`;
}

function formatRewardValue(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return formatNumber(Number(normalized));
  }

  return value;
}

function parseRewardValueNumber(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const normalized = value.trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getProductionRewardStatus(row: ProductionRewardPlanRow) {
  if (row.isCurrentProjectedTier) {
    return { full: "Ay sonu ongorusu", short: "◎" };
  }

  if (row.isReached) {
    return { full: "Asildi", short: "✓" };
  }

  return { full: "Ust skala", short: "↑" };
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
    showProjection: true,
  totalPrimeCurrentReward: 0,
  totalPrimeProjectedReward: 0,
  productionPrimeCurrentReward: 0,
  productionPrimeProjectedReward: 0,
  livePrimeCurrentReward: 0,
  livePrimeProjectedReward: 0,
  accessoryPrimeCurrentReward: 0,
  accessoryPrimeProjectedReward: 0,
  monthlyDeductionCurrentAmount: 0,
  monthlyDeductionProjectedAmount: 0,
  monthlyNetCurrentReward: 0,
  monthlyNetProjectedReward: 0
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
  const targetPoints = summary.target ?? 0;
  const eligibleRewardRows = rewardRows.filter((row) => row.points >= targetPoints);
  const actualRewardRow = [...eligibleRewardRows].reverse().find((row) => actualPoints >= row.points) ?? null;
  const projectedRewardRow = [...eligibleRewardRows].reverse().find((row) => projectedPoints >= row.points) ?? null;
  const nextRewardRow = eligibleRewardRows.find((row) => row.points > projectedPoints) ?? null;

  return {
    targetPoints,
    actualPoints,
    projectedPoints,
    actualReward: actualRewardRow?.reward ?? null,
    projectedReward: projectedRewardRow?.reward ?? null,
    nextReward: nextRewardRow?.reward ?? null,
    rows: rewardRows.map((row) => {
      const remainingFromActual = Math.max(row.points - actualPoints, 0);

      return {
        points: row.points,
        reward: row.reward,
        isBelowTarget: row.points < targetPoints,
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

function buildStoreEmployeeProductionPlans(
  rows: GoalActualRow[],
  rewardRows: GoalProductionRewardRow[],
  workedDays: number,
  totalDays: number,
  remainingDays: number
) {
  if (!rewardRows.length) {
    return [] as StoreEmployeeProductionPlan[];
  }

  const employeeMap = new Map<string, GoalActualRow[]>();
  rows
    .filter((row) => isProductionPointCategory(row.mainCategory))
    .forEach((row) => {
      const current = employeeMap.get(row.employeeName) ?? [];
      current.push(row);
      employeeMap.set(row.employeeName, current);
    });

  return Array.from(employeeMap.entries())
    .map(([employeeName, employeeRows]) => {
      const summary = buildMetricSummary(employeeRows, workedDays, totalDays);
      const rewardPlan = buildProductionRewardPlan(
        {
          title: "URETIM PUANI",
          childCount: 0,
          children: [],
          ...summary
        },
        rewardRows,
        remainingDays
      );

      if (!rewardPlan) {
        return null;
      }

      return {
        employeeName,
        targetPoints: rewardPlan.targetPoints,
        actualPoints: rewardPlan.actualPoints,
        projectedPoints: rewardPlan.projectedPoints,
        projectedReward: rewardPlan.projectedReward,
        rows: rewardPlan.rows
      } satisfies StoreEmployeeProductionPlan;
    })
    .filter((row): row is StoreEmployeeProductionPlan => Boolean(row))
    .sort((a, b) => {
      if (b.actualPoints !== a.actualPoints) {
        return b.actualPoints - a.actualPoints;
      }

      return a.employeeName.localeCompare(b.employeeName, "tr");
    });
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

function buildCompanyDailyNeedSummaryRows(
  companyCategories: GoalCategorySummary[],
  storeRows: GoalStoreRow[],
  workedDays: number,
  totalDays: number,
  remainingDays: number
) {
  return companyCategories
    .filter((category) => category.hasTarget)
    .flatMap((category) => {
      const storeMap = new Map<string, GoalStoreRow[]>();

      storeRows
        .filter((row) => row.mainCategory === category.title)
        .forEach((row) => {
          const current = storeMap.get(row.storeCode) ?? [];
          current.push(row);
          storeMap.set(row.storeCode, current);
        });

      const stores = Array.from(storeMap.entries())
        .map(([storeCode, rows]) => {
          const summary = buildStoreMetricSummary(rows, workedDays, totalDays);
          return {
            storeCode,
            cells: buildNeedRows(summary, remainingDays)
          };
        })
        .sort((a, b) => a.storeCode.localeCompare(b.storeCode, "tr"));

      const parentRow = {
        title: category.title,
        groupKey: category.title,
        rowKey: category.title,
        level: 0,
        hasChildren: category.children.length > 0,
        cells: buildNeedRows(category, remainingDays),
        stores
      } satisfies CompanyDailyNeedSummaryRow;

      const childRows = category.children
        .filter((child) => child.hasTarget)
        .map((child) => {
          const childStoreMap = new Map<string, GoalStoreRow[]>();

          storeRows
            .filter((row) => row.mainCategory === category.title && row.subCategory === child.title)
            .forEach((row) => {
              const current = childStoreMap.get(row.storeCode) ?? [];
              current.push(row);
              childStoreMap.set(row.storeCode, current);
            });

          const childStores = Array.from(childStoreMap.entries())
            .map(([storeCode, rows]) => {
              const summary = buildStoreMetricSummary(rows, workedDays, totalDays);
              return {
                storeCode,
                cells: buildNeedRows(summary, remainingDays)
              };
            })
            .sort((a, b) => a.storeCode.localeCompare(b.storeCode, "tr"));

          return {
            title: child.title,
            groupKey: category.title,
            rowKey: `${category.title}::${child.title}`,
            level: 1,
            hasChildren: false,
            cells: buildNeedRows(child, remainingDays),
            stores: childStores
          } satisfies CompanyDailyNeedSummaryRow;
        });

      return [parentRow, ...childRows];
    });
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
        targetIsPercent: first.targetIsPercent ?? false,
        actualIsPercent: first.actualIsPercent ?? false,
        includeProjection: first.includeProjection,
        companyMode: first.companyMode,
        separateInfo: first.separateInfo
      };
  });
}

function buildSeparateInfoTitle(row: Pick<GoalStoreRow, "mainCategory" | "subCategory">) {
  return row.subCategory ? `${row.mainCategory} / ${row.subCategory}` : row.mainCategory;
}

function toSeparateInfoRow(
  row: Pick<GoalStoreRow, "mainCategory" | "subCategory" | "target" | "actual" | "targetIsPercent" | "actualIsPercent">,
  storeDetails: GoalSeparateInfoStoreDetail[] = []
): GoalSeparateInfoRow {
  const hasTarget = row.target !== null && row.target > 0;

  return {
    title: buildSeparateInfoTitle(row),
    groupTitle: row.mainCategory,
    subCategoryTitle: row.subCategory || null,
    target: hasTarget ? row.target : null,
    actual: row.actual,
    targetIsPercent: row.targetIsPercent ?? false,
    actualIsPercent: row.actualIsPercent ?? false,
    hasTarget,
    isBelowTarget: hasTarget ? row.actual < (row.target ?? 0) : false,
    isAtOrAboveTarget: hasTarget ? row.actual >= (row.target ?? 0) : false,
    storeDetails
  };
}

function buildSeparateInfoGroups(rows: GoalSeparateInfoRow[]) {
  const grouped = new Map<string, GoalSeparateInfoRow[]>();

  rows.forEach((row) => {
    const current = grouped.get(row.groupTitle) ?? [];
    current.push(row);
    grouped.set(row.groupTitle, current);
  });

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([title, groupRows]) => {
      const sortedRows = [...groupRows].sort((a, b) => {
        if (!a.subCategoryTitle && !b.subCategoryTitle) {
          return a.title.localeCompare(b.title, "tr");
        }

        if (!a.subCategoryTitle) {
          return -1;
        }

        if (!b.subCategoryTitle) {
          return 1;
        }

        return a.subCategoryTitle.localeCompare(b.subCategoryTitle, "tr");
      });

      const hasChildren = sortedRows.some((row) => Boolean(row.subCategoryTitle));
      const childRows = sortedRows.filter((row) => Boolean(row.subCategoryTitle));
      const mainRows = sortedRows.filter((row) => !row.subCategoryTitle);

      return {
        title,
        hasChildren,
        rows: hasChildren ? childRows : mainRows
      } satisfies GoalSeparateInfoGroup;
    });
}

function buildStoreSeparateInfoRows(rows: GoalStoreRow[]) {
  return rows
    .filter((row) => row.separateInfo)
    .map((row) => toSeparateInfoRow(row))
    .sort((a, b) => a.title.localeCompare(b.title, "tr"));
}

function buildCompanySeparateInfoRows(rows: GoalStoreRow[]) {
  const separateInfoRows = rows.filter((row) => row.separateInfo);

  return buildCompanyRows(separateInfoRows)
    .map((row) => {
      const storeDetails = separateInfoRows
        .filter((item) => item.mainCategory === row.mainCategory && item.subCategory === row.subCategory)
        .sort((a, b) => a.storeCode.localeCompare(b.storeCode, "tr"))
        .map((item) => {
          const hasTarget = item.target !== null && item.target > 0;

          return {
            storeCode: item.storeCode,
            target: hasTarget ? item.target : null,
            actual: item.actual,
            targetIsPercent: item.targetIsPercent ?? false,
            actualIsPercent: item.actualIsPercent ?? false,
            hasTarget,
            isBelowTarget: hasTarget ? item.actual < (item.target ?? 0) : false,
            isAtOrAboveTarget: hasTarget ? item.actual >= (item.target ?? 0) : false
          } satisfies GoalSeparateInfoStoreDetail;
        });

      return toSeparateInfoRow(row, storeDetails);
    })
    .sort((a, b) => a.title.localeCompare(b.title, "tr"));
}

function SeparateInfoTable({
  title,
  rows
}: {
  title: string;
  rows: GoalSeparateInfoRow[];
}) {
  if (!rows.length) {
    return null;
  }

  const hasAnyTarget = rows.some((row) => row.hasTarget);
  const groups = buildSeparateInfoGroups(rows);
  const columnCount = hasAnyTarget ? 3 : 2;
  const belowTargetRows = rows
    .filter((row) => row.hasTarget && row.isBelowTarget)
    .sort((a, b) => a.title.localeCompare(b.title, "tr"));
  const hasStoreBreakdown = rows.some((row) => row.storeDetails.length > 0);

  const renderStoreBreakdown = (row: GoalSeparateInfoRow, keyPrefix: string) => {
    if (!row.storeDetails.length) {
      return null;
    }

    return (
      <tr key={`${keyPrefix}-stores`}>
        <td colSpan={columnCount} className="goal-separate-info-store-cell">
          <details className="goal-separate-info-store-details">
            <summary className="goal-separate-info-store-summary">
              <span>Şube gerçekleşenlerini göster</span>
            </summary>

            <table className="goal-company-trend-table goal-separate-info-store-table">
              <thead>
                <tr>
                  <th>Şube</th>
                  {row.hasTarget ? <th>Hedef</th> : null}
                  <th>Gerçekleşen</th>
                </tr>
              </thead>
              <tbody>
                {row.storeDetails.map((store) => (
                  <tr key={`${keyPrefix}-${store.storeCode}`}>
                    <th>{store.storeCode}</th>
                    {row.hasTarget ? (
                      <>
                        <td>{formatGoalValue(store.target, store.targetIsPercent)}</td>
                        <td
                          className={
                            store.isAtOrAboveTarget
                              ? "goal-company-trend-good"
                              : store.isBelowTarget
                                ? "goal-company-trend-bad"
                                : ""
                          }
                        >
                          {formatGoalValue(store.actual, store.actualIsPercent)}
                        </td>
                      </>
                    ) : (
                      <td>{formatGoalValue(store.actual, store.actualIsPercent)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </td>
      </tr>
    );
  };

  const renderDataRow = (row: GoalSeparateInfoRow, keyPrefix: string, titleText: string) => (
    <>
      <tr key={keyPrefix}>
        <th>{titleText}</th>
        {row.hasTarget ? (
          <>
            <td>{formatGoalValue(row.target, row.targetIsPercent)}</td>
            <td
              className={
                row.isAtOrAboveTarget
                  ? "goal-company-trend-good"
                  : row.isBelowTarget
                    ? "goal-company-trend-bad"
                    : ""
              }
            >
              {formatGoalValue(row.actual, row.actualIsPercent)}
            </td>
          </>
        ) : (
          <td colSpan={hasAnyTarget ? 2 : 1}>{formatGoalValue(row.actual, row.actualIsPercent)}</td>
        )}
      </tr>
      {hasStoreBreakdown ? renderStoreBreakdown(row, keyPrefix) : null}
    </>
  );

  return (
    <div className="goal-company-trend-panel">
      <div className="goal-live-prime-head">
        <h3>{title}</h3>
      </div>

      {belowTargetRows.length ? (
        <div className="evaluation-zero-alert goal-separate-info-alert">
          <strong>Hedefin altinda kalan kalemler</strong>
          <div>
            {belowTargetRows.map((row) => (
              <span key={`separate-info-under-target-${row.title}`}>{row.subCategoryTitle ?? row.title}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="goal-company-trend-table-wrap">
        <table className="goal-company-trend-table goal-separate-info-table">
          <thead>
            <tr>
              <th>Kalem</th>
              <th>{hasAnyTarget ? "Hedef" : "Gerceklesen"}</th>
              {hasAnyTarget ? <th>Gerceklesen</th> : null}
            </tr>
            </thead>
            <tbody>
              {groups.map((group) =>
                group.hasChildren ? (
                  <tr key={`separate-info-group-${group.title}`}>
                    <td colSpan={columnCount} className="goal-separate-info-group-cell">
                      <details className="goal-separate-info-group-details">
                        <summary className="goal-separate-info-group-summary">
                          <span>{group.title}</span>
                          <span className="goal-separate-info-group-hint">Alt kategorileri goster</span>
                        </summary>

                        <table className="goal-company-trend-table goal-separate-info-nested-table">
                          <tbody>
                            {group.rows.map((row) => (
                              <Fragment key={`separate-info-${group.title}-${row.title}`}>
                                {renderDataRow(
                                  row,
                                  `separate-info-${group.title}-${row.title}`,
                                  row.subCategoryTitle ?? row.title
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    </td>
                  </tr>
                ) : (
                  group.rows.map((row) => (
                    <Fragment key={`separate-info-${row.title}`}>
                      {renderDataRow(row, `separate-info-${row.title}`, row.title)}
                    </Fragment>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
  );
}

function CompanyInformationCurrentTable({ rows }: { rows: GoalSeparateInfoRow[] }) {
  if (!rows.length) {
    return null;
  }

  return (
    <div className="goal-company-information-current-panel">
      <div className="goal-live-prime-head">
        <div>
          <h3>Bilgilendirme Kalemleri - Mevcut Durum</h3>
          <p>Ay sonu projeksiyonu kullanilmaz; mevcut hedef ve gerceklesen degerleri gosterilir.</p>
        </div>
      </div>

      <div className="goal-company-trend-table-wrap">
        <table className="goal-company-trend-table goal-company-information-current-table">
          <colgroup>
            <col className="goal-company-information-category-column" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Hedef</th>
              <th>Gerceklesen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`company-information-current-${row.title}`}>
                <td colSpan={3} className="goal-company-information-current-row-cell">
                  <details className="goal-company-information-current-details" name="company-information-current-accordion">
                    <summary className="goal-company-information-current-summary">
                      <strong>
                        <span className="goal-company-trend-arrow">v</span>
                        <span>{row.title}</span>
                      </strong>
                      <span>{row.hasTarget ? formatGoalValue(row.target, row.targetIsPercent) : "-"}</span>
                      <span>{formatGoalValue(row.actual, row.actualIsPercent)}</span>
                    </summary>

                    <div className="goal-company-information-store-wrap">
                      <table className="goal-company-trend-table goal-company-information-store-table">
                        <colgroup>
                          <col className="goal-company-information-category-column" />
                          <col />
                          <col />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Sube</th>
                            <th>Hedef</th>
                            <th>Gerceklesen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.storeDetails.map((store) => (
                            <tr key={`company-information-current-${row.title}-${store.storeCode}`}>
                              <th>{store.storeCode}</th>
                              <td>{store.hasTarget ? formatGoalValue(store.target, store.targetIsPercent) : "-"}</td>
                              <td
                                className={
                                  store.hasTarget
                                    ? store.isAtOrAboveTarget
                                      ? "goal-company-trend-good"
                                      : "goal-company-trend-bad"
                                    : ""
                                }
                              >
                                {formatGoalValue(store.actual, store.actualIsPercent)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
        .map(([storeCode, storeRows]) => {
          const storeChildMap = new Map<string, GoalStoreRow[]>();
          storeRows
            .filter((row) => Boolean(row.subCategory))
            .forEach((row) => {
              const current = storeChildMap.get(row.subCategory) ?? [];
              current.push(row);
              storeChildMap.set(row.subCategory, current);
            });

          const storeChildren = Array.from(storeChildMap.entries())
            .map(([subCategory, subCategoryRows]) => ({
              title: subCategory,
              ...buildStoreMetricSummary(subCategoryRows, workedDays, totalDays)
            }))
            .sort((a, b) => a.title.localeCompare(b.title, "tr", { sensitivity: "base" }));

          return {
            title: storeCode,
            children: storeChildren,
            ...buildStoreMetricSummary(storeRows, workedDays, totalDays)
          };
        })
        .sort((a, b) => a.title.localeCompare(b.title, "tr", { sensitivity: "base" }));

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

function buildNeedRows(
  summary: Pick<GoalMetricSummary, "hasTarget" | "target" | "actual">,
  remainingDays: number
): GoalNeedRow[] {
  if (!summary.hasTarget || !summary.target) {
    return [];
  }

  return [80, 90, 100, 110, 120].map((threshold) => {
    const targetValue = (summary.target ?? 0) * (threshold / 100);
    const remainingTotal = Math.max(targetValue - summary.actual, 0);
    const dailyRequired = remainingDays > 0 ? Math.ceil(remainingTotal / remainingDays) : remainingTotal > 0 ? Math.ceil(remainingTotal) : 0;

    return {
      threshold,
      dailyRequired
    };
  });
}

function buildStoreDailyNeedSummaryRows(categories: GoalCategorySummary[], remainingDays: number) {
  return categories
    .filter((category) => category.hasTarget)
    .flatMap((category) => {
      const parentRow = {
        title: category.title,
        groupKey: category.title,
        level: 0,
        hasChildren: category.children.some((child) => child.hasTarget),
        cells: buildNeedRows(category, remainingDays)
      } satisfies StoreDailyNeedSummaryRow;

      const childRows = category.children
        .filter((child) => child.hasTarget)
        .map((child) => ({
          title: child.title,
          groupKey: category.title,
          level: 1,
          hasChildren: false,
          cells: buildNeedRows(child, remainingDays)
        } satisfies StoreDailyNeedSummaryRow));

      return [parentRow, ...childRows];
    });
}

function buildEmployeeDailyNeedReference(
  summary: GoalCategorySummary,
  rewardRows: GoalProductionRewardRow[],
  remainingDays: number
) {
  if (!isProductionPointCategory(summary.title)) {
    const needRow = buildNeedRows(summary, remainingDays).find((row) => row.threshold === 100);
    return {
      referenceLabel: "%100 Hedef",
      dailyRequired: needRow?.dailyRequired ?? 0
    };
  }

  const rewardPlan = buildProductionRewardPlan(summary, rewardRows, remainingDays);
  if (!rewardPlan?.rows.length) {
    return {
      referenceLabel: "Ilk Skala",
      dailyRequired: 0
    };
  }

  const eligibleScaleRows = rewardPlan.rows.filter((row) => !row.isBelowTarget);
  const firstScaleRow = eligibleScaleRows[0];
  if (!firstScaleRow) {
    return {
      referenceLabel: "Hedef Skalasi",
      dailyRequired: 0
    };
  }

  const projectedScaleRow = eligibleScaleRows.find((row) => row.isCurrentProjectedTier) ?? null;
  const nextScaleRow = eligibleScaleRows.find((row) => row.points > rewardPlan.projectedPoints) ?? null;
  const targetRow = projectedScaleRow ? nextScaleRow ?? projectedScaleRow : firstScaleRow;

  return {
    referenceLabel: `${formatNumber(targetRow.points)} Puan`,
    dailyRequired: targetRow.dailyRequired
  };
}

function buildEmployeeDailyNeedSummaryRows(
  categories: GoalCategorySummary[],
  remainingDays: number,
  rewardRows: GoalProductionRewardRow[]
) {
  return categories
    .filter((category) => category.hasTarget)
    .flatMap((category) => {
      const parentNeed = buildEmployeeDailyNeedReference(category, rewardRows, remainingDays);
      const parentRow = {
        title: category.title,
        groupKey: category.title,
        level: 0,
        referenceLabel: parentNeed.referenceLabel,
        dailyRequired: parentNeed.dailyRequired
      } satisfies EmployeeDailyNeedSummaryRow;

      const childRows = category.children
        .filter((child) => child.hasTarget)
        .map((child) => {
          const needRow = buildNeedRows(child, remainingDays).find((row) => row.threshold === 100);

          return {
            title: child.title,
            groupKey: category.title,
            level: 1,
            referenceLabel: "%100 Hedef",
            dailyRequired: needRow?.dailyRequired ?? 0
          } satisfies EmployeeDailyNeedSummaryRow;
        });

      return [parentRow, ...childRows];
    });
}

function isSepeteTaksitCategory(title: string | null | undefined) {
  return normalizeCategoryKey(String(title ?? "")).includes("SEPETE TAKSIT");
}

function isSepeteTaksitHaricCategory(title: string | null | undefined) {
  return normalizeCategoryKey(String(title ?? "")).includes("SEPETE TAKSIT HARIC");
}

function isServiceFeeCategory(title: string | null | undefined) {
  const normalized = normalizeCategoryKey(String(title ?? ""));
  return normalized.includes("HIZMET") && normalized.includes("BEDEL");
}

function findLivePrimeAccessoryRate(
  scaleRows: GoalLivePrimeSettings["accessoryScaleRows"],
  tempoPercent: number | null | undefined
) {
  if (!scaleRows.length || tempoPercent === null || tempoPercent === undefined || Number.isNaN(tempoPercent)) {
    return 0;
  }

  return (
    [...scaleRows]
      .sort((left, right) => left.thresholdPercent - right.thresholdPercent)
      .filter((row) => tempoPercent >= row.thresholdPercent)
      .at(-1)?.ratePercent ?? 0
  );
}

function resolveAccessoryBase(
  category: GoalCategorySummary | undefined,
  valueKey: "actual" | "projectedActual"
) {
  if (!category) {
    return 0;
  }

  const sepeteTaksitHaricRow = category.children.find((child) => isSepeteTaksitHaricCategory(child.title));
  const serviceFeeRow = category.children.find((child) => isServiceFeeCategory(child.title));
  const serviceFeeValue = serviceFeeRow
    ? valueKey === "actual"
      ? serviceFeeRow.actual
      : (serviceFeeRow.projectedActual ?? serviceFeeRow.actual)
    : 0;

  if (sepeteTaksitHaricRow) {
    const sepeteTaksitHaricValue =
      valueKey === "actual"
        ? sepeteTaksitHaricRow.actual
        : (sepeteTaksitHaricRow.projectedActual ?? sepeteTaksitHaricRow.actual);
    return sepeteTaksitHaricValue + serviceFeeValue;
  }

  const totalValue = valueKey === "actual" ? category.actual : (category.projectedActual ?? category.actual);
  const sepeteTaksitTotal = category.children
    .filter((child) => isSepeteTaksitCategory(child.title))
    .reduce((sum, child) => sum + (valueKey === "actual" ? child.actual : (child.projectedActual ?? child.actual)), 0);
  const nonSepeteChildTotal = category.children
    .filter((child) => !isSepeteTaksitCategory(child.title))
    .reduce((sum, child) => sum + (valueKey === "actual" ? child.actual : (child.projectedActual ?? child.actual)), 0);

  const totalMinusSepeteTaksit = Math.max(totalValue - sepeteTaksitTotal, 0);

  if (totalMinusSepeteTaksit > 0 || sepeteTaksitTotal > 0) {
    return totalMinusSepeteTaksit;
  }

  return nonSepeteChildTotal > 0 ? nonSepeteChildTotal : totalValue;
}

function resolveMonthlyPrimeDeduction(
  categories: GoalCategorySummary[],
  rules: GoalLivePrimeSettings["monthlyPrimeDeductionRules"],
  valueKey: "actual" | "projectedActual"
) {
  const triggeredRules = rules
    .map((rule) => {
      const category = categories.find(
        (item) => normalizeCategoryKey(item.title) === normalizeCategoryKey(rule.categoryTitle)
      );

      if (!category) {
        return null;
      }

      const comparisonValue = valueKey === "actual" ? category.actual : (category.projectedActual ?? category.actual);

      if (comparisonValue >= rule.minimumValue) {
        return null;
      }

      return {
        ...rule,
        comparisonValue
      };
    })
    .filter(
      (
        row
      ): row is {
        categoryTitle: string;
        minimumValue: number;
        deductionPercent: number;
        comparisonValue: number;
      } => Boolean(row)
    );

  const totalRate = Math.min(
    triggeredRules.reduce((sum, rule) => sum + rule.deductionPercent, 0),
    100
  );

  return {
    totalRate,
    reasons: triggeredRules.map(
      (rule) =>
        `${rule.categoryTitle} ${formatNumber(rule.comparisonValue)} < alt limit ${formatNumber(rule.minimumValue)} (-%${formatNumber(
          rule.deductionPercent
        )})`
    )
  };
}

function buildEmployeePrimeForecast(
  employeeCategories: GoalCategorySummary[],
  employeeLivePrimeCategories: GoalCategorySummary[],
  productionRewardRows: GoalProductionRewardRow[],
  livePrimeSettings: GoalLivePrimeSettings
) {
  const productionCategory = employeeCategories.find((category) => isProductionPointCategory(category.title));
  const productionRewardPlan = productionCategory
    ? buildProductionRewardPlan(productionCategory, productionRewardRows, 0)
    : null;

  const productionCurrentReward = parseRewardValueNumber(productionRewardPlan?.actualReward ?? null);
  const productionProjectedReward = parseRewardValueNumber(productionRewardPlan?.projectedReward ?? null);

  const livePrimeCurrentReward = employeeLivePrimeCategories.reduce((sum, category) => sum + category.actual, 0);
  const livePrimeWorkedDays =
    livePrimeSettings.workedDays > 0 ? livePrimeSettings.workedDays : 0;
  const livePrimeTotalDays =
    livePrimeSettings.totalDays > 0 ? livePrimeSettings.totalDays : livePrimeWorkedDays;
  const livePrimeProjectedReward =
    livePrimeWorkedDays > 0
      ? Math.floor((livePrimeCurrentReward / livePrimeWorkedDays) * livePrimeTotalDays)
      : livePrimeCurrentReward;

  const accessoryCategory = employeeCategories.find(
    (category) => normalizeCategoryKey(category.title) === normalizeCategoryKey("AKSESUAR KARLILIK")
  );
  const accessoryCurrentBase = resolveAccessoryBase(accessoryCategory, "actual");
  const accessoryProjectedBase = resolveAccessoryBase(accessoryCategory, "projectedActual");
  const accessoryCurrentRate = findLivePrimeAccessoryRate(
    livePrimeSettings.accessoryScaleRows,
    accessoryCategory?.actualPercent ?? null
  );
  const accessoryProjectedRate = findLivePrimeAccessoryRate(
    livePrimeSettings.accessoryScaleRows,
    accessoryCategory?.projectedPercent ?? accessoryCategory?.actualPercent ?? null
  );
  const accessoryCurrentReward = accessoryCurrentBase * (accessoryCurrentRate / 100);
  const accessoryProjectedReward = accessoryProjectedBase * (accessoryProjectedRate / 100);
  const monthlyGrossCurrentReward = productionCurrentReward + accessoryCurrentReward;
  const monthlyGrossProjectedReward = productionProjectedReward + accessoryProjectedReward;
  const monthlyCurrentDeduction = resolveMonthlyPrimeDeduction(
    employeeCategories,
    livePrimeSettings.monthlyPrimeDeductionRules,
    "actual"
  );
  const monthlyProjectedDeduction = resolveMonthlyPrimeDeduction(
    employeeCategories,
    livePrimeSettings.monthlyPrimeDeductionRules,
    "projectedActual"
  );
  const monthlyDeductionCurrentAmount = productionCurrentReward * (monthlyCurrentDeduction.totalRate / 100);
  const monthlyDeductionProjectedAmount = productionProjectedReward * (monthlyProjectedDeduction.totalRate / 100);
  const monthlyNetCurrentReward = Math.max(monthlyGrossCurrentReward - monthlyDeductionCurrentAmount, 0);
  const monthlyNetProjectedReward = Math.max(monthlyGrossProjectedReward - monthlyDeductionProjectedAmount, 0);

  return {
    productionCurrentReward,
    productionProjectedReward,
    livePrimeCurrentReward,
    livePrimeProjectedReward,
    accessoryCurrentBase,
    accessoryProjectedBase,
    accessoryCurrentRate,
    accessoryProjectedRate,
    accessoryCurrentReward,
    accessoryProjectedReward,
    monthlyGrossCurrentReward,
    monthlyGrossProjectedReward,
    monthlyDeductionCurrentRate: monthlyCurrentDeduction.totalRate,
    monthlyDeductionProjectedRate: monthlyProjectedDeduction.totalRate,
    monthlyDeductionCurrentAmount,
    monthlyDeductionProjectedAmount,
    monthlyNetCurrentReward,
    monthlyNetProjectedReward,
    totalCurrentReward: monthlyNetCurrentReward + livePrimeCurrentReward,
    totalProjectedReward: monthlyNetProjectedReward + livePrimeProjectedReward,
    monthlyDeductionCurrentReasons: monthlyCurrentDeduction.reasons,
    monthlyDeductionProjectedReasons: monthlyProjectedDeduction.reasons
  } satisfies EmployeePrimeForecast;
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
                    <strong>{productionRewardPlan.nextReward ? formatRewardValue(productionRewardPlan.nextReward) : "Son skala"}</strong>
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
                      {productionRewardPlan.rows.filter((row) => !row.isBelowTarget).map((row) => (
                        <tr
                          key={`${category.title}-reward-${row.points}`}
                          className={row.isCurrentProjectedTier ? "goal-production-reward-row-active" : ""}
                        >
                          {(() => {
                            const status = getProductionRewardStatus(row);
                            return (
                              <>
                          <td>{formatNumber(row.points)}</td>
                          <td>{formatRewardValue(row.reward)}</td>
                          <td>
                            <span className="goal-production-reward-status">
                              <span className="goal-production-reward-status-full">{status.full}</span>
                              <span className="goal-production-reward-status-short" aria-hidden="true">
                                {status.short}
                              </span>
                            </span>
                          </td>
                          <td>{formatNumber(row.remainingFromActual)}</td>
                          <td>{formatNumber(row.dailyRequired)}</td>
                              </>
                            );
                          })()}
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

function EmployeeGoalCategoryTable({
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
  type EmployeeGoalTableMetric = GoalMetricSummary & { title: string };

  const renderMetricRow = (
    summary: EmployeeGoalTableMetric,
    options?: {
      child?: boolean;
      grandchild?: boolean;
      expandable?: boolean;
      open?: boolean;
      productionRewardPlan?: ReturnType<typeof buildProductionRewardPlan>;
    }
  ) => {
    const dailyNeedRow = buildNeedRows(summary, remainingDays).find((row) => row.threshold === 100);
    const dailyMinimum = summary.hasTarget ? dailyNeedRow?.dailyRequired ?? 0 : null;
    const hasExpandableBody = Boolean(options?.expandable);
    const projectedPercentClass =
      summary.hasTarget && summary.showProjection && summary.projectedPercent !== null
        ? summary.projectedPercent >= 100
          ? "goal-employee-table-value-good"
          : "goal-employee-table-value-bad"
        : "goal-employee-table-value-muted";

    const titleNode = hasExpandableBody ? (
      <span className="goal-employee-table-title-toggle">
        <span className="goal-company-trend-arrow">v</span>
        <span>{summary.title}</span>
      </span>
    ) : (
      <span className="goal-employee-table-title-label">{summary.title}</span>
    );

    return (
      <div
        className={`goal-employee-table-row${options?.child ? " goal-employee-table-row-child" : ""}${
          options?.grandchild ? " goal-employee-table-row-grandchild" : ""
        }`}
      >
        <div className="goal-employee-table-cell goal-employee-table-cell-title">{titleNode}</div>
        <div className="goal-employee-table-cell">{summary.hasTarget ? formatNumber(summary.target) : "-"}</div>
        <div className="goal-employee-table-cell">{formatNumber(summary.actual)}</div>
        <div className="goal-employee-table-cell">{summary.hasTarget ? formatNumber(summary.remaining) : "-"}</div>
        <div className="goal-employee-table-cell">
          {summary.hasTarget && summary.actualPercent !== null ? formatPercent(summary.actualPercent) : "-"}
        </div>
        <div className="goal-employee-table-cell">{summary.showProjection ? formatNumber(summary.projectedActual) : "-"}</div>
        <div className={`goal-employee-table-cell ${projectedPercentClass}`}>
          {summary.hasTarget && summary.showProjection && summary.projectedPercent !== null ? formatPercent(summary.projectedPercent) : "-"}
        </div>
        <div className="goal-employee-table-cell">{dailyMinimum !== null ? formatNumber(dailyMinimum) : "-"}</div>
      </div>
    );
  };

  return (
    <div className="goal-employee-table-shell">
      <div className="goal-employee-table-head">
        <div className="goal-employee-table-cell goal-employee-table-cell-title">Kategori</div>
        <div className="goal-employee-table-cell">Hedef</div>
        <div className="goal-employee-table-cell">Gerc.</div>
        <div className="goal-employee-table-cell">Kalan</div>
        <div className="goal-employee-table-cell">Anlik %</div>
        <div className="goal-employee-table-cell">Ay Sonu</div>
        <div className="goal-employee-table-cell">Ay Sonu %</div>
        <div className="goal-employee-table-cell">Gunluk Min</div>
      </div>

      <div className="goal-employee-table-body">
        {categories.map((category, index) => {
          const productionRewardPlan = buildProductionRewardPlan(category, productionRewardRows, remainingDays);
          const hasStoreDetails = Boolean(category.storeDetails?.length);
          const hasExpandableBody = category.childCount > 0 || hasStoreDetails || Boolean(productionRewardPlan);

          if (!hasExpandableBody) {
            return <div key={category.title}>{renderMetricRow(category)}</div>;
          }

          return (
            <details
              key={category.title}
              className="goal-employee-table-details"
              name="goal-category-accordion"
              open={index === 0}
            >
              <summary className="goal-employee-table-summary">
                {renderMetricRow(category, { expandable: true })}
              </summary>

              <div className="goal-employee-table-details-body">
                {productionRewardPlan ? (
                  <div className="goal-production-reward-panel goal-employee-production-reward-panel">
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
                        <strong>{productionRewardPlan.nextReward ? formatRewardValue(productionRewardPlan.nextReward) : "Son skala"}</strong>
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
                          {productionRewardPlan.rows.filter((row) => !row.isBelowTarget).map((row) => (
                            <tr
                              key={`${category.title}-reward-${row.points}`}
                              className={row.isCurrentProjectedTier ? "goal-production-reward-row-active" : ""}
                            >
                              {(() => {
                                const status = getProductionRewardStatus(row);
                                return (
                                  <>
                                    <td>{formatNumber(row.points)}</td>
                                    <td>{formatRewardValue(row.reward)}</td>
                                    <td>
                                      <span className="goal-production-reward-status">
                                        <span className="goal-production-reward-status-full">{status.full}</span>
                                        <span className="goal-production-reward-status-short" aria-hidden="true">
                                          {status.short}
                                        </span>
                                      </span>
                                    </td>
                                    <td>{formatNumber(row.remainingFromActual)}</td>
                                    <td>{formatNumber(row.dailyRequired)}</td>
                                  </>
                                );
                              })()}
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

                {category.children.length ? (
                  <div className="goal-employee-table-children">
                    {category.children.map((child) => (
                      <div key={`${category.title}-${child.title}`}>{renderMetricRow(child, { child: true })}</div>
                    ))}
                  </div>
                ) : null}

                {hasStoreDetails ? (
                  <div className="goal-company-category-store-details">
                    <div className="goal-company-category-store-title">Sube Gerceklesenleri</div>
                    <div className="goal-employee-table-children">
                      {category.storeDetails?.map((store) => (
                        store.children.length ? (
                          <details
                            key={`${category.title}-store-${store.title}`}
                            className="goal-company-store-detail"
                            name={`goal-store-accordion-${category.title}`}
                          >
                            <summary className="goal-employee-table-summary goal-company-store-detail-summary">
                              {renderMetricRow(store, { child: true, expandable: true })}
                            </summary>
                            <div className="goal-company-store-subcategory-list">
                              {store.children.map((child) => (
                                <div key={`${category.title}-${store.title}-${child.title}`}>
                                  {renderMetricRow(child, { child: true, grandchild: true })}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <div key={`${category.title}-store-${store.title}`}>
                            {renderMetricRow(store, { child: true })}
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeDailyNeedsTable({ rows }: { rows: EmployeeDailyNeedSummaryRow[] }) {
  return (
    <div className="goal-company-trend-table-wrap goal-employee-daily-needs-wrap">
      <table className="goal-company-trend-table goal-employee-daily-needs-table">
        <thead>
          <tr>
            <th>Kategori</th>
            <th>Referans</th>
            <th>Gunluk Ihtiyac</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`employee-daily-need-${row.groupKey}-${row.title}`} className={row.level > 0 ? "goal-company-trend-child-row" : ""}>
              <th>
                <span className={row.level > 0 ? "goal-company-trend-label goal-company-trend-label-child" : "goal-company-trend-label"}>
                  {row.title}
                </span>
              </th>
              <td>{row.referenceLabel}</td>
              <td className={row.dailyRequired <= 0 ? "goal-company-trend-good" : ""}>
                {row.dailyRequired <= 0 ? "Tamamlandi" : formatNumber(row.dailyRequired)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function StoreGoalDashboard({
  storeName,
  categories,
  dayStats,
  canShare
}: {
  storeName: string;
  categories: GoalCategorySummary[];
  dayStats: GoalDayStats;
  canShare: boolean;
}) {
  const dashboardSourceCategories = categories.filter(
    (category) =>
      normalizeCategoryKey(category.title) !== normalizeCategoryKey("AKSESUAR CIRO") &&
      !isEntryCount(category.title)
  );
  const targetedCategories = dashboardSourceCategories.filter((category) => category.hasTarget && (category.target ?? 0) > 0);
  const achievedCount = targetedCategories.filter((category) => (category.projectedPercent ?? category.actualPercent ?? 0) >= 100).length;
  const closeCount = targetedCategories.filter((category) => {
    const percent = category.projectedPercent ?? category.actualPercent ?? 0;
    return percent >= 80 && percent < 100;
  }).length;
  const riskCount = Math.max(0, targetedCategories.length - achievedCount - closeCount);
  const successPercent = targetedCategories.length > 0 ? (achievedCount / targetedCategories.length) * 100 : 0;
  const dashboardCategories = dashboardSourceCategories;
  const statusTotal = Math.max(1, targetedCategories.length);
  const achievedEnd = (achievedCount / statusTotal) * 100;
  const closeEnd = achievedEnd + (closeCount / statusTotal) * 100;
  const gaugePercent = Math.max(0, Math.min(100, successPercent));

  return (
    <section className="goal-store-dashboard">
      <div className="goal-dashboard-hero">
        <div>
          <span className="goal-dashboard-eyebrow">MAĞAZA PERFORMANS DASHBOARDU</span>
          <h2>{storeName || "Mağaza"}</h2>
          <p>Hedef, gerçekleşen ve ay sonu gidişatının tek sayfalık görsel analizi.</p>
        </div>
        <div className="goal-dashboard-period">
          <span>Çalışılan Gün</span>
          <strong>{formatNumber(dayStats.workedDays)} / {formatNumber(dayStats.totalDays)}</strong>
        </div>
      </div>

      {canShare ? (
        <DashboardShareButton
          title={`${storeName || "Mağaza"} Şube Dashboardu`}
          subtitle="Ay sonu hedef gidişatı ve kategori başarı oranları"
          items={[
            {
              label: "Başarı Oranı",
              percent: successPercent,
              detail: `${achievedCount}/${targetedCategories.length} hedefe giden kalem`
            },
            ...dashboardCategories.map((category) => ({
              label: category.title,
              percent: category.hasTarget ? category.projectedPercent ?? category.actualPercent ?? 0 : 0,
              detail: category.hasTarget
                ? `Şu an ${formatPercent(category.actualPercent ?? 0)}`
                : `Mevcut ${formatNumber(category.actual)}`
            }))
          ]}
        />
      ) : null}

      <div className="goal-dashboard-visual-grid">
        <article className="goal-dashboard-chart-card goal-dashboard-gauge-card">
          <div className="goal-dashboard-card-head">
            <h3>Başarı Oranı</h3>
            <span>Hedefe giden kalemlerin toplam kalemlere oranı</span>
          </div>
          <div className="goal-dashboard-gauge-wrap">
            <div
              className="goal-dashboard-gauge"
              style={{ background: `conic-gradient(#14b8a6 0% ${gaugePercent}%, #dbe7ef ${gaugePercent}% 100%)` }}
              role="img"
              aria-label={`Hedefe giden kalemlerin başarı oranı ${formatPercent(successPercent)}`}
            >
              <div>
                <strong>{formatPercent(successPercent)}</strong>
                <span>başarı</span>
              </div>
            </div>
          </div>
        </article>

        <article className="goal-dashboard-chart-card">
          <div className="goal-dashboard-card-head">
            <h3>Hedef Durumu Dağılımı</h3>
            <span>{targetedCategories.length} kategori</span>
          </div>
          <div className="goal-dashboard-status-layout">
            <div className="goal-dashboard-pie-stage-3d">
              <div
                className="goal-dashboard-status-pie"
                style={{
                  background: `conic-gradient(#22c55e 0% ${achievedEnd}%, #f59e0b ${achievedEnd}% ${closeEnd}%, #ef4444 ${closeEnd}% 100%)`
                }}
                role="img"
                aria-label={`Hedefte ${achievedCount}, hedefe yakın ${closeCount}, riskli ${riskCount} kategori`}
              />
            </div>
            <div className="goal-dashboard-status-legend">
              <div><i style={{ background: "#22c55e" }} /><span>Hedefte</span><strong>{achievedCount}</strong></div>
              <div><i style={{ background: "#f59e0b" }} /><span>Hedefe Yakın</span><strong>{closeCount}</strong></div>
              <div><i style={{ background: "#ef4444" }} /><span>Riskli</span><strong>{riskCount}</strong></div>
            </div>
          </div>
        </article>
      </div>

      <article className="goal-dashboard-chart-card goal-dashboard-category-card">
        <div className="goal-dashboard-card-head">
          <h3>Kategori Ay Sonu Pasta Özeti</h3>
          <span>Tüm kategorilerin ay sonu hedef gidişatı</span>
        </div>
        <div className="goal-dashboard-category-pies">
          {dashboardCategories.map((category) => {
            const actualPercent = category.actualPercent ?? 0;
            const projectedPercent = category.projectedPercent ?? actualPercent;
            const piePercent = category.hasTarget ? Math.max(0, Math.min(100, projectedPercent)) : 100;
            const color = !category.hasTarget
              ? "#38bdf8"
              : projectedPercent >= 100
                ? "#22c55e"
                : projectedPercent >= 80
                  ? "#f59e0b"
                  : "#ef4444";
            const displayValue = category.hasTarget ? formatPercent(projectedPercent) : formatNumber(category.actual);
            return (
              <div className="goal-dashboard-category-pie-card" key={`dashboard-category-${category.title}`}>
                <div
                  className="goal-dashboard-category-pie"
                  style={{ background: `conic-gradient(${color} 0% ${piePercent}%, #e2e8f0 ${piePercent}% 100%)` }}
                  role="img"
                  aria-label={
                    category.hasTarget
                      ? `${category.title} ay sonu hedef gidişatı ${formatPercent(projectedPercent)}`
                      : `${category.title} mevcut değeri ${formatNumber(category.actual)}`
                  }
                >
                  <div>{displayValue}</div>
                </div>
                <strong>{category.title}</strong>
                <span>{category.hasTarget ? `Şu an ${formatPercent(actualPercent)}` : "Hedef tanımlı değil"}</span>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function CompanyStoreSuccessDashboard({
  rows,
  dayStats,
  canShare
}: {
  rows: GoalStoreRow[];
  dayStats: GoalDayStats;
  canShare: boolean;
}) {
  const storeMap = new Map<string, GoalStoreRow[]>();
  rows.forEach((row) => {
    const current = storeMap.get(row.storeCode) ?? [];
    current.push(row);
    storeMap.set(row.storeCode, current);
  });

  const stores = Array.from(storeMap.entries())
    .map(([storeName, storeRows]) => {
      const categories = buildStoreCategorySummaries(storeRows, dayStats.workedDays, dayStats.totalDays).filter(
        (category) =>
          normalizeCategoryKey(category.title) !== normalizeCategoryKey("AKSESUAR CIRO") &&
          !isEntryCount(category.title) &&
          category.hasTarget &&
          (category.target ?? 0) > 0
      );
      const successfulCount = categories.filter(
        (category) => (category.projectedPercent ?? category.actualPercent ?? 0) >= 100
      ).length;
      return {
        storeName,
        successfulCount,
        totalCount: categories.length,
        successPercent: categories.length > 0 ? (successfulCount / categories.length) * 100 : 0
      };
    })
    .sort((left, right) => left.storeName.localeCompare(right.storeName, "tr"));
  const companyCategories = buildCompanyCategorySummaries(rows, dayStats.workedDays, dayStats.totalDays).filter(
    (category) =>
      normalizeCategoryKey(category.title) !== normalizeCategoryKey("AKSESUAR CIRO") &&
      !isEntryCount(category.title) &&
      category.hasTarget &&
      (category.target ?? 0) > 0
  );
  const companyAchievedCount = companyCategories.filter(
    (category) => (category.projectedPercent ?? category.actualPercent ?? 0) >= 100
  ).length;
  const companyCloseCount = companyCategories.filter((category) => {
    const percent = category.projectedPercent ?? category.actualPercent ?? 0;
    return percent >= 80 && percent < 100;
  }).length;
  const companyRiskCount = Math.max(0, companyCategories.length - companyAchievedCount - companyCloseCount);
  const companySuccessPercent = companyCategories.length > 0
    ? (companyAchievedCount / companyCategories.length) * 100
    : 0;
  const companyStatusTotal = Math.max(1, companyCategories.length);
  const companyAchievedEnd = (companyAchievedCount / companyStatusTotal) * 100;
  const companyCloseEnd = companyAchievedEnd + (companyCloseCount / companyStatusTotal) * 100;

  return (
    <section className="goal-store-dashboard goal-company-success-dashboard">
      <div className="goal-dashboard-hero">
        <div>
          <span className="goal-dashboard-eyebrow">FİRMA BAŞARI DASHBOARDU</span>
          <h2>Şubelerin Başarı Oranları</h2>
          <p>Grafiğe tıklayarak ilgili şubenin detaylı dashboardunu açabilirsiniz.</p>
        </div>
        <div className="goal-dashboard-period">
          <span>Şube Sayısı</span>
          <strong>{formatNumber(stores.length)}</strong>
        </div>
      </div>

      {canShare ? (
        <DashboardShareButton
          title="Firma Başarı Dashboardu"
          subtitle="Şubelerin ay sonu başarı oranları"
          detailColumns={2}
          items={[
            {
              label: "Firma Başarı Oranı",
              percent: companySuccessPercent,
              detail: `${companyAchievedCount}/${companyCategories.length} hedefe giden kalem`
            },
            ...stores.map((store) => ({
              label: store.storeName,
              percent: store.successPercent,
              detail: `${store.successfulCount}/${store.totalCount} hedefe giden kalem`
            }))
          ]}
        />
      ) : null}

      <div className="goal-dashboard-visual-grid">
        <article className="goal-dashboard-chart-card goal-dashboard-gauge-card">
          <div className="goal-dashboard-card-head">
            <h3>Firma Başarı Oranı</h3>
            <span>Hedefe giden kalemlerin toplam hedefli kalemlere oranı</span>
          </div>
          <div className="goal-dashboard-gauge-wrap">
            <div
              className="goal-dashboard-gauge"
              style={{ background: `conic-gradient(#14b8a6 0% ${companySuccessPercent}%, #dbe7ef ${companySuccessPercent}% 100%)` }}
              role="img"
              aria-label={`Firma başarı oranı ${formatPercent(companySuccessPercent)}`}
            >
              <div>
                <strong>{formatPercent(companySuccessPercent)}</strong>
                <span>başarı</span>
              </div>
            </div>
          </div>
        </article>

        <article className="goal-dashboard-chart-card goal-company-status-card">
          <div className="goal-dashboard-card-head">
            <h3>Firma Hedef Durumu Dağılımı</h3>
            <span>Ay sonu gidişatına göre {companyCategories.length} kategori</span>
          </div>
          <div className="goal-dashboard-status-layout">
            <div className="goal-dashboard-pie-stage-3d">
              <div
                className="goal-dashboard-status-pie"
                style={{
                  background: `conic-gradient(#22c55e 0% ${companyAchievedEnd}%, #f59e0b ${companyAchievedEnd}% ${companyCloseEnd}%, #ef4444 ${companyCloseEnd}% 100%)`
                }}
                role="img"
                aria-label={`Firma hedefte ${companyAchievedCount}, hedefe yakın ${companyCloseCount}, riskli ${companyRiskCount} kategori`}
              />
            </div>
            <div className="goal-dashboard-status-legend">
              <div><i style={{ background: "#22c55e" }} /><span>Hedefte</span><strong>{companyAchievedCount}</strong></div>
              <div><i style={{ background: "#f59e0b" }} /><span>Hedefe Yakın</span><strong>{companyCloseCount}</strong></div>
              <div><i style={{ background: "#ef4444" }} /><span>Riskli</span><strong>{companyRiskCount}</strong></div>
            </div>
          </div>
        </article>
      </div>

      <div className="goal-company-success-grid">
        {stores.map((store) => {
          const piePercent = Math.max(0, Math.min(100, store.successPercent));
          const color = store.successPercent >= 70 ? "#22c55e" : store.successPercent >= 40 ? "#f59e0b" : "#ef4444";
          return (
            <a
              className="goal-company-success-card"
              href={buildHref("store", { store: store.storeName, panel: "dashboard" })}
              key={`company-dashboard-${store.storeName}`}
            >
              <div className="goal-dashboard-card-head">
                <h3>{store.storeName}</h3>
                <span>{store.successfulCount}/{store.totalCount} kalem</span>
              </div>
              <div
                className="goal-company-success-pie"
                style={{ background: `conic-gradient(${color} 0% ${piePercent}%, #dce7ef ${piePercent}% 100%)` }}
                role="img"
                aria-label={`${store.storeName} başarı oranı ${formatPercent(store.successPercent)}`}
              >
                <div>
                  <strong>{formatPercent(store.successPercent)}</strong>
                  <span>başarı</span>
                </div>
              </div>
              <span className="goal-company-success-open">Şube dashboardunu aç →</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export default async function GoalActualPage({ searchParams }: GoalActualPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedView = String(params?.view ?? "").trim();
  const selectedEmployee = String(params?.employee ?? "").trim();
  const selectedStore = String(params?.store ?? "").trim();
  const selectedCategory = String(params?.category ?? "").trim();
  const selectedPanel = String(params?.panel ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("approval, role, full_name, store:stores(name)")
    .eq("id", user.id)
    .single();

  if (!profile || profile.approval !== "approved") {
    redirect("/hesabim");
  }

  const canViewAll = canViewAllGoalActual(profile.role);
  const isAdminViewer = profile.role === "admin";
  const canShareDashboard = profile.role === "admin" || profile.role === "management";
  const currentUserFullName = String((profile as { full_name?: string | null }).full_name ?? "").trim();
  const currentUserStore = (profile as { store?: Array<{ name: string }> | { name: string } | null }).store;
  const currentUserStoreName = Array.isArray(currentUserStore)
    ? (currentUserStore[0]?.name ?? "")
    : (currentUserStore?.name ?? "");
  const defaultView: GoalView =
    profile.role === "admin" || profile.role === "management"
      ? "company"
      : profile.role === "manager"
        ? "store"
        : "employee";
  const requestedView = selectedView || defaultView;
  const requestedPanel =
    selectedPanel || (profile.role === "admin" || profile.role === "management" || profile.role === "manager" ? "dashboard" : "detail");
  const effectiveView: GoalView = canViewAll
    ? requestedView === "store"
      ? "store"
      : requestedView === "company"
        ? "company"
        : "employee"
    : "employee";
  const effectivePanel: GoalPanel =
    effectiveView === "store" && requestedPanel === "dashboard"
      ? "dashboard"
      : effectiveView === "company" && requestedPanel === "dashboard"
        ? "dashboard"
      : effectiveView === "employee" && requestedPanel === "ranking"
        ? "ranking"
        : "detail";

  if (!canViewAll && requestedView !== "employee") {
    redirect(buildHref("employee", { employee: selectedEmployee, panel: effectivePanel }));
  }

  let employeeRows: GoalActualRow[] = [];
  let storeRows: GoalStoreRow[] = [];
  let productionRewardRows: GoalProductionRewardRow[] = [];
  let productPointRows: GoalProductPointRow[] = [];
  let documentIssueRows = await Promise.resolve([] as Awaited<ReturnType<typeof fetchDocumentIssueRows>>);
  let dayStats: GoalDayStats = EMPTY_DAY_STATS;
  let livePrimeSettings: GoalLivePrimeSettings = { workedDays: 0, totalDays: 0, accessoryScaleRows: [], monthlyPrimeDeductionRules: [] };
  let sheetError = "";

  try {
    [employeeRows, storeRows, dayStats, productionRewardRows, productPointRows, documentIssueRows, livePrimeSettings] = await Promise.all([
      fetchGoalActualRows(),
      fetchGoalStoreRows(),
      fetchGoalDayStats(),
      fetchGoalProductionRewardRows(),
      fetchGoalProductPointRows(),
      fetchDocumentIssueRows().catch(() => []),
      fetchGoalLivePrimeSettings().catch(() => ({ workedDays: 0, totalDays: 0, accessoryScaleRows: [], monthlyPrimeDeductionRules: [] }))
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheet verisi okunamadi.";
    sheetError = message;
  }

  const allFilteredEmployeeRows = employeeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));
  const employeeRowsByPersonnelId = employeeRows.filter((row) => row.personnelId && row.personnelId === user.id);
  const employeeRowsByName =
    currentUserFullName
      ? employeeRows.filter((row) => normalizeEmployeeIdentity(row.employeeName) === normalizeEmployeeIdentity(currentUserFullName))
      : [];
  const scopedEmployeeRows = canViewAll
    ? employeeRows
    : employeeRowsByPersonnelId.length
      ? employeeRowsByPersonnelId
      : employeeRowsByName;
  const filteredEmployeeRows = scopedEmployeeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));
  const allFilteredEmployeeCoreRows = allFilteredEmployeeRows.filter((row) => !isLivePrimeCategory(row.mainCategory));
  const filteredEmployeeCoreRows = filteredEmployeeRows.filter((row) => !isLivePrimeCategory(row.mainCategory));
  const filteredStoreRows = storeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory) && !row.separateInfo);
  const separateInfoStoreRows = storeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory) && row.separateInfo);

  const employeeNames = Array.from(new Set(filteredEmployeeRows.map((row) => row.employeeName))).sort((a, b) => a.localeCompare(b, "tr"));
  const employeeCategoryOptions = Array.from(new Set(allFilteredEmployeeCoreRows.map((row) => row.mainCategory))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
  const storeNames = Array.from(new Set(storeRows.map((row) => row.storeCode))).sort((a, b) => a.localeCompare(b, "tr"));
  const storeCategoryOptions = Array.from(new Set(filteredStoreRows.map((row) => row.mainCategory))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );

  const effectiveEmployee = employeeNames.includes(selectedEmployee) ? selectedEmployee : "";
  const managerDefaultStore = storeNames.find(
    (storeName) => normalizeStoreKey(storeName) === normalizeStoreKey(currentUserStoreName)
  );
  const effectiveStore = storeNames.includes(selectedStore)
    ? selectedStore
    : profile.role === "manager"
      ? managerDefaultStore ?? ""
      : "";
  const rankingCategoryPool = effectiveView === "store" ? storeCategoryOptions : employeeCategoryOptions;
  const defaultRankingCategory = rankingCategoryPool[0] ?? "";
  const effectiveCategory =
    effectivePanel === "ranking" && rankingCategoryPool.includes(selectedCategory) ? selectedCategory : defaultRankingCategory;

  const employeeRankingRows = effectiveCategory
    ? allFilteredEmployeeCoreRows.filter((row) => row.mainCategory === effectiveCategory)
    : allFilteredEmployeeCoreRows;
  const storeRankingRows = effectiveCategory
    ? filteredStoreRows.filter((row) => row.mainCategory === effectiveCategory)
    : filteredStoreRows;

  const employeeMap = new Map<string, GoalActualRow[]>();
  employeeRankingRows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  const employeePrimeCoreMap = new Map<string, GoalActualRow[]>();
  allFilteredEmployeeCoreRows.forEach((row) => {
    const current = employeePrimeCoreMap.get(row.employeeName) ?? [];
    current.push(row);
    employeePrimeCoreMap.set(row.employeeName, current);
  });

  const employeeLivePrimeMap = new Map<string, GoalActualRow[]>();
  allFilteredEmployeeRows
    .filter((row) => isLivePrimeCategory(row.mainCategory))
    .forEach((row) => {
      const current = employeeLivePrimeMap.get(row.employeeName) ?? [];
      current.push(row);
      employeeLivePrimeMap.set(row.employeeName, current);
    });

  const employeePrimeForecastMap = new Map<string, EmployeePrimeForecast>();
  Array.from(new Set([...employeePrimeCoreMap.keys(), ...employeeLivePrimeMap.keys()])).forEach((employeeName) => {
    const employeeCoreRows = employeePrimeCoreMap.get(employeeName) ?? [];
    const employeeLiveRows = employeeLivePrimeMap.get(employeeName) ?? [];

    if (!employeeCoreRows.length && !employeeLiveRows.length) {
      return;
    }

    const employeeCoreSummaries = buildCategorySummaries(employeeCoreRows, dayStats.workedDays, dayStats.totalDays);
    const employeeLiveSummaries = buildCategorySummaries(employeeLiveRows, dayStats.workedDays, dayStats.totalDays);
    const forecast = buildEmployeePrimeForecast(
      employeeCoreSummaries,
      employeeLiveSummaries,
      productionRewardRows,
      livePrimeSettings
    );

    employeePrimeForecastMap.set(employeeName, forecast);
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

  const employeePrimeRankingSummaries = Array.from(employeePrimeCoreMap.entries())
    .map(([employeeName, rows]) => {
      const summary = buildEmployeeSummary(rows, dayStats.workedDays, dayStats.totalDays);
      const forecast = employeePrimeForecastMap.get(employeeName);

      if (!forecast) {
        return summary;
      }

      return {
        ...summary,
        totalPrimeCurrentReward: forecast.totalCurrentReward,
        totalPrimeProjectedReward: forecast.totalProjectedReward,
        productionPrimeCurrentReward: forecast.productionCurrentReward,
        productionPrimeProjectedReward: forecast.productionProjectedReward,
        livePrimeCurrentReward: forecast.livePrimeCurrentReward,
        livePrimeProjectedReward: forecast.livePrimeProjectedReward,
        accessoryPrimeCurrentReward: forecast.accessoryCurrentReward,
        accessoryPrimeProjectedReward: forecast.accessoryProjectedReward
      } satisfies EmployeeSummary;
    })
    .sort(
      (a, b) =>
        b.totalPrimeProjectedReward - a.totalPrimeProjectedReward ||
        b.totalPrimeCurrentReward - a.totalPrimeCurrentReward ||
        b.projectedActual - a.projectedActual
    );

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

  const activeEmployeeName = effectiveEmployee || employeeNames[0] || employeeSummaries[0]?.name || "";
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
  const activeStoreSeparateInfoRows =
    activeStoreName ? separateInfoStoreRows.filter((row) => row.storeCode === activeStoreName) : [];
  const activeEmployeeStoreCode = resolveStoreCodeFromEmployeeRows(activeEmployeeRows, storeNames, currentUserStoreName);
  const employeeScopedStoreCode = activeEmployeeStoreCode || currentUserStoreName;
  const employeeCategorySummaries = buildCategorySummaries(activeEmployeeCoreRows, dayStats.workedDays, dayStats.totalDays);
  const employeeLivePrimeCategorySummaries = buildCategorySummaries(
    activeEmployeeRows.filter((row) => isLivePrimeCategory(row.mainCategory)),
    dayStats.workedDays,
    dayStats.totalDays
  );
  const employeeAccessoryCategory = employeeCategorySummaries.find(
    (category) => normalizeCategoryKey(category.title) === normalizeCategoryKey("AKSESUAR KARLILIK")
  );
    const employeePrimeForecast =
      effectiveView === "employee" && employeeCategorySummaries.length
        ? buildEmployeePrimeForecast(
            employeeCategorySummaries,
            employeeLivePrimeCategorySummaries,
            productionRewardRows,
            livePrimeSettings
          )
        : null;
    const employeePrimeSubtotalCurrent = employeePrimeForecast
      ? employeePrimeForecast.monthlyGrossCurrentReward
      : 0;
    const employeePrimeSubtotalProjected = employeePrimeForecast
      ? employeePrimeForecast.monthlyGrossProjectedReward
      : 0;
  const employeeStoreRows = employeeScopedStoreCode
    ? filteredStoreRows.filter((row) => normalizeStoreKey(row.storeCode) === normalizeStoreKey(employeeScopedStoreCode))
    : [];
  const employeeStoreCategorySummaries = buildStoreCategorySummaries(
    employeeStoreRows,
    dayStats.workedDays,
    dayStats.totalDays
  );
  const employeeStoreDailyNeedSummaryRows = buildStoreDailyNeedSummaryRows(
    employeeStoreCategorySummaries,
    dayStats.remainingDays
  );
  const employeeDailyNeedSummaryRows = buildEmployeeDailyNeedSummaryRows(
    employeeCategorySummaries,
    dayStats.remainingDays,
    productionRewardRows
  );
  const storeCategorySummaries = buildStoreCategorySummaries(activeStoreRows, dayStats.workedDays, dayStats.totalDays);
  const activeStoreEmployeeRows = activeStoreName
    ? filteredEmployeeCoreRows.filter((row) => normalizeStoreKey(row.storeName) === normalizeStoreKey(activeStoreName))
    : [];
  const storeEmployeeProductionPlans = buildStoreEmployeeProductionPlans(
    activeStoreEmployeeRows,
    productionRewardRows,
    dayStats.workedDays,
    dayStats.totalDays,
    dayStats.remainingDays
  );
  const companyEmployeeProductionPlans = buildStoreEmployeeProductionPlans(
    filteredEmployeeCoreRows,
    productionRewardRows,
    dayStats.workedDays,
    dayStats.totalDays,
    dayStats.remainingDays
  );
  const companyCategorySummaries = buildCompanyCategorySummaries(filteredStoreRows, dayStats.workedDays, dayStats.totalDays);
  const storeSeparateInfoRows = buildStoreSeparateInfoRows(activeStoreSeparateInfoRows);
  const companySeparateInfoRows = buildCompanySeparateInfoRows(separateInfoStoreRows);
  const storeDailyNeedSummaryRows = buildStoreDailyNeedSummaryRows(storeCategorySummaries, dayStats.remainingDays);
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
    effectiveView !== "employee" || Boolean(activeEmployeeStoreCode)
      ? buildCompanyCurrentSummaryRows(filteredStoreRows)
      : [];
  const companyDailyNeedSummaryRows =
    effectiveView === "company"
      ? buildCompanyDailyNeedSummaryRows(
          companyCategorySummaries,
          filteredStoreRows,
          dayStats.workedDays,
          dayStats.totalDays,
          dayStats.remainingDays
        )
      : [];
  const companyTrendStoreCodes =
    effectiveView !== "employee" || Boolean(activeEmployeeStoreCode)
      ? Array.from(
          new Set([
            ...companyTrendSummaryRows.flatMap((row) => row.stores.map((store) => store.storeCode)),
            ...companyCurrentSummaryRows.flatMap((row) => row.stores.map((store) => store.storeCode)),
            ...(effectiveView === "company"
              ? companySeparateInfoRows.flatMap((row) => row.storeDetails.map((store) => store.storeCode))
              : [])
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
  const activeEmployeePersonnelIds = Array.from(
    new Set(
      [
        user.id,
        ...activeEmployeeRows.map((row) => row.personnelId),
        ...activeEmployeeCoreRows.map((row) => row.personnelId)
      ]
        .map((value) => normalizeProfileIdentity(value))
        .filter(Boolean)
    )
  );
  const employeeDocumentIssueRows =
    effectiveView === "employee"
      ? documentIssueRows.filter((row) => activeEmployeePersonnelIds.includes(normalizeProfileIdentity(row.personnelId)))
      : [];
  const storeDocumentIssueRows =
    effectiveView === "store"
      ? documentIssueRows.filter((row) => normalizeStoreKey(row.storeName) === normalizeStoreKey(activeStoreName || currentUserStoreName))
      : [];
  const relevantDocumentIssueRows =
    effectiveView === "employee"
      ? employeeDocumentIssueRows
      : effectiveView === "store"
        ? storeDocumentIssueRows
        : effectiveView === "company"
          ? documentIssueRows
          : [];
  const relevantUnreachableDocumentCount = relevantDocumentIssueRows.filter((row) => row.source === "Ulasmayan Evrak").length;
  const relevantMissingDocumentCount = relevantDocumentIssueRows.filter((row) => row.source === "Eksik Evrak").length;
  const shouldShowDocumentIssueAlert =
    (effectiveView === "employee" || effectiveView === "store" || effectiveView === "company") &&
    relevantDocumentIssueRows.length > 0;

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

          {effectiveView === "company" ? (
            <section className="guide-card game-brief-card goal-filter-card">
              <div className="goal-mode-row">
                <a
                  className={`goal-mode-button ${effectivePanel === "detail" ? "goal-mode-button-active" : ""}`}
                  href={buildHref("company", { panel: "detail" })}
                >
                  Firma Hedef Gerçekleşen
                </a>
                <a
                  className={`goal-mode-button ${effectivePanel === "dashboard" ? "goal-mode-button-active" : ""}`}
                  href={buildHref("company", { panel: "dashboard" })}
                >
                  Dashboard
                </a>
              </div>
            </section>
          ) : null}

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

              {effectiveView === "store" ? (
                <div className="goal-mode-row">
                  <a
                    className={`goal-mode-button ${effectivePanel === "detail" ? "goal-mode-button-active" : ""}`}
                    href={buildHref("store", { store: activeStoreName, panel: "detail" })}
                  >
                    Hedef Gerçekleşen
                  </a>
                  <a
                    className={`goal-mode-button ${effectivePanel === "dashboard" ? "goal-mode-button-active" : ""}`}
                    href={buildHref("store", { store: activeStoreName, panel: "dashboard" })}
                  >
                    Dashboard
                  </a>
                </div>
              ) : (
                <div className="goal-mode-row">
                  <a
                    className={`goal-mode-button ${effectivePanel === "detail" ? "goal-mode-button-active" : ""}`}
                    href={buildHref("employee", { employee: activeEmployeeName, panel: "detail" })}
                  >
                    Hedef Gerceklesen
                  </a>
                  <a
                    className={`goal-mode-button ${effectivePanel === "ranking" ? "goal-mode-button-active" : ""}`}
                    href={buildHref("employee", { employee: activeEmployeeName, category: effectiveCategory, panel: "ranking" })}
                  >
                    Siralama
                  </a>
                </div>
              )}
            </section>
          ) : null}

          {effectivePanel === "dashboard" && effectiveView === "store" ? (
            <StoreGoalDashboard
              storeName={activeStoreName}
              categories={storeCategorySummaries}
              dayStats={dayStats}
              canShare={canShareDashboard}
            />
          ) : effectivePanel === "dashboard" && effectiveView === "company" ? (
            <CompanyStoreSuccessDashboard
              rows={filteredStoreRows}
              dayStats={dayStats}
              canShare={canShareDashboard}
            />
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

                {effectiveView === "employee" && isAdminViewer && employeePrimeRankingSummaries.length ? (
                  <details className="campaign-section-card goal-ranking-card goal-live-prime-ranking-card" open>
                    <summary className="goal-live-prime-ranking-summary">
                      <div className="goal-section-head">
                        <h2>Personel Prim Hakedişi Sıralaması</h2>
                        <span>Kategori kırılımlı toplam prim görünümü</span>
                      </div>
                      <span className="goal-live-prime-ranking-caret">v</span>
                    </summary>

                    <div className="goal-live-prime-ranking-export">
                      <a
                        className="button-secondary export-link-button"
                        href="/api/hedef-gerceklesen/personel-prim-hakedis-excel"
                      >
                        Excele Indir
                      </a>
                    </div>

                    <div className="goal-ranking-list goal-live-prime-ranking-list">
                      {employeePrimeRankingSummaries.map((summary, index) => (
                        <a
                          key={`employee-prime-${summary.name}`}
                          className={`goal-ranking-row goal-live-prime-ranking-row ${
                            summary.name === activeEmployeeName ? "goal-ranking-row-active" : ""
                          }`}
                          href={buildHref("employee", { employee: summary.name, panel: "detail" })}
                        >
                          <span className="goal-rank-badge">{index + 1}</span>
                          <div className="goal-ranking-main">
                            <strong>{summary.name}</strong>
                            <span>
                              {`Toplam prim ${formatCurrency(summary.totalPrimeCurrentReward)}${
                                summary.totalPrimeProjectedReward > 0
                                  ? ` | Ay sonu ${formatCurrency(summary.totalPrimeProjectedReward)}`
                                  : ""
                              }`}
                            </span>
                            <span>
                              {`Uretim ${formatCurrency(summary.productionPrimeCurrentReward)} | Canli ${formatCurrency(
                                summary.livePrimeCurrentReward
                              )} | Aksesuar ${formatCurrency(summary.accessoryPrimeCurrentReward)}`}
                            </span>
                          </div>
                          <strong className="goal-ranking-score">
                            {formatCurrency(summary.totalPrimeCurrentReward)}
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

                {effectiveView === "company" && visibleTrendStoreCodes.length && companyTrendSummaryRows.length ? (
                  <div className="goal-company-trend-panel">
                    <div className="goal-live-prime-head">
                      <h3>Ay Sonu Gidisat Ozeti</h3>
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
                            <th>Firma</th>
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
                              <td
                                className={`goal-company-trend-company ${
                                  row.companyProjectedPercent !== null && row.companyProjectedPercent >= 100
                                    ? "goal-company-trend-good"
                                    : ""
                                }`}
                              >
                                {formatPercent(row.companyProjectedPercent)}
                              </td>
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
                            </tr>
                          ))}

                          {companySeparateInfoRows.map((row) => (
                            <tr key={`information-row-${row.title}`}>
                              <th>
                                <span className="goal-company-trend-category-label">
                                  <span>{row.title}</span>
                                  <small>Mevcut</small>
                                </span>
                              </th>
                              {visibleTrendStoreCodes.map((storeCode) => {
                                const store = row.storeDetails.find((item) => item.storeCode === storeCode);
                                const stateClass = store?.hasTarget
                                  ? store.isAtOrAboveTarget
                                    ? "goal-company-trend-good"
                                    : "goal-company-trend-bad"
                                  : "";

                                return (
                                  <td
                                    key={`information-${row.title}-${storeCode}`}
                                    className={[
                                      storeCode === highlightedTrendStoreCode ? "goal-company-trend-selected" : "",
                                      stateClass
                                    ].filter(Boolean).join(" ")}
                                  >
                                    {store ? formatGoalValue(store.actual, store.actualIsPercent) : "-"}
                                  </td>
                                );
                              })}
                              <td
                                className={`goal-company-trend-company ${
                                  row.hasTarget
                                    ? row.isAtOrAboveTarget
                                      ? "goal-company-trend-good"
                                      : "goal-company-trend-bad"
                                    : ""
                                }`}
                              >
                                {formatGoalValue(row.actual, row.actualIsPercent)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {effectiveView === "company" ? (
                  companyCategorySummaries.length ? (
                    <>
                      <EmployeeGoalCategoryTable
                        categories={companyCategorySummaries}
                        remainingDays={dayStats.remainingDays}
                      />
                      <CompanyInformationCurrentTable rows={companySeparateInfoRows} />
                    </>
                  ) : (
                    <p className="subtle">Firma verisi bulunamadi.</p>
                  )
                ) : effectiveView === "store" ? (
                  storeCategorySummaries.length ? (
                    <EmployeeGoalCategoryTable
                      categories={storeCategorySummaries}
                      remainingDays={dayStats.remainingDays}
                    />
                  ) : (
                    <p className="subtle">Bu magaza icin kategori verisi bulunamadi.</p>
                  )
                ) : employeeCategorySummaries.length ? (
                  <>
                    <EmployeeGoalCategoryTable
                      categories={employeeCategorySummaries}
                      remainingDays={dayStats.remainingDays}
                      productionRewardRows={productionRewardRows}
                      productPointRows={productPointRows}
                    />

                    {employeeDailyNeedSummaryRows.length ? (
                      <div className="goal-company-trend-panel goal-employee-daily-needs-panel">
                        <div className="goal-live-prime-head">
                          <h3>Personel Gunluk Ihtiyaclari</h3>
                          <span>Hedefli kalemler icin bugunden ay sonuna gereken gunluk minimum tempo</span>
                        </div>
                        <EmployeeDailyNeedsTable rows={employeeDailyNeedSummaryRows} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="subtle">Bu filtreye uygun calisan verisi bulunamadi.</p>
                )}

                {effectiveView === "store" ? (
                  <div className="goal-company-trend-panel">
                    <div className="goal-live-prime-head">
                      <h3>Gunluk Ihtiyaclar</h3>
                      <span>Hedefli kalemler icin gunluk gereken adet / tutar</span>
                    </div>

                    {storeDailyNeedSummaryRows.length ? (
                      <StoreDailyNeedsTable rows={storeDailyNeedSummaryRows} />
                    ) : (
                      <p className="subtle">Bu magazada hedef tanimli kalem bulunamadi.</p>
                    )}
                  </div>
                ) : null}

                {effectiveView === "store" ? (
                  <SeparateInfoTable title="Bilgilendirme Kalemleri" rows={storeSeparateInfoRows} />
                ) : null}

                {effectiveView === "company" && visibleTrendStoreCodes.length && companyDailyNeedSummaryRows.length ? (
                  <div className="goal-company-trend-panel">
                    <div className="goal-live-prime-head">
                      <h3>Gunluk Ihtiyaclar</h3>
                    </div>

                    <CompanyDailyNeedsTable
                      rows={companyDailyNeedSummaryRows}
                      visibleTrendStoreCodes={visibleTrendStoreCodes}
                    />
                  </div>
                ) : null}

                {effectiveView === "company" && shouldShowDocumentIssueAlert ? (
                  <a href="/eksik-evrak" className="evaluation-zero-alert goal-document-issue-alert goal-document-issue-link">
                    <strong>Firma Geneli Evrak Uyarisi Var</strong>
                    <p>Firma geneli detay icin Eksik Evrak menusunden kontrol ediniz.</p>
                    <div>
                      {relevantUnreachableDocumentCount > 0 ? (
                        <span className="goal-document-issue-badge">Ulasmayan Evrak: {relevantUnreachableDocumentCount}</span>
                      ) : null}
                      {relevantMissingDocumentCount > 0 ? (
                        <span className="goal-document-issue-badge">Eksik Evrak: {relevantMissingDocumentCount}</span>
                      ) : null}
                    </div>
                  </a>
                ) : null}

                {effectiveView === "company" && detailZeroActualItems.length ? (
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

                {effectiveView === "store" && shouldShowDocumentIssueAlert ? (
                  <a href="/eksik-evrak" className="evaluation-zero-alert goal-document-issue-alert goal-document-issue-link">
                    <strong>Magazana Ait Evrak Uyarisi Var</strong>
                    <p>Detay icin Eksik Evrak menusunden kontrol ediniz.</p>
                    <div>
                      {relevantUnreachableDocumentCount > 0 ? (
                        <span className="goal-document-issue-badge">Ulasmayan Evrak: {relevantUnreachableDocumentCount}</span>
                      ) : null}
                      {relevantMissingDocumentCount > 0 ? (
                        <span className="goal-document-issue-badge">Eksik Evrak: {relevantMissingDocumentCount}</span>
                      ) : null}
                    </div>
                  </a>
                ) : null}

                {effectiveView === "store" && detailZeroActualItems.length ? (
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

                {detailCategorySummaries.length && effectiveView === "employee" ? (
                  <div className="evaluation-card">
                    <div className="evaluation-card-head">
                      <strong>{detailCardTitle}</strong>
                    </div>

                    <FormattedCoachingText text={detailCoachingText} />

                    {shouldShowDocumentIssueAlert ? (
                      <a href="/eksik-evrak" className="evaluation-zero-alert goal-document-issue-alert goal-document-issue-link">
                        <strong>Evrak Uyarin Var</strong>
                        <p>Detay icin Eksik Evrak menusunden kontrol ediniz.</p>
                        <div>
                          {relevantUnreachableDocumentCount > 0 ? (
                            <span className="goal-document-issue-badge">
                              Ulasmayan Evrak: {relevantUnreachableDocumentCount}
                            </span>
                          ) : null}
                          {relevantMissingDocumentCount > 0 ? (
                            <span className="goal-document-issue-badge">
                              Eksik Evrak: {relevantMissingDocumentCount}
                            </span>
                          ) : null}
                        </div>
                      </a>
                    ) : null}

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

                    <div className="evaluation-card-actions evaluation-card-actions-bottom">
                      <SpeakCoachingButton text={detailCoachingText} />
                      <CopyCoachingButton text={detailCoachingText} />
                    </div>
                  </div>
                ) : null}

                {visibleTrendStoreCodes.length && companyTrendSummaryRows.length && effectiveView === "employee" ? (
                  <div className="goal-company-trend-panel">
                    <div className="goal-live-prime-head">
                      <h3>Sube Ay Sonu Gidisat Ozeti</h3>
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
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </div>
                ) : null}

                {effectiveView === "company" && companyEmployeeProductionPlans.length ? (
                  <div className="goal-store-production-panel">
                    <div className="goal-live-prime-head">
                      <h3>Personel Uretim Puani Skala Ihtiyaclari</h3>
                    </div>

                    <div className="goal-store-production-table-wrap">
                      <table className="goal-store-production-table">
                        <thead>
                          <tr>
                            <th>Personel</th>
                            <th>Su Anki Puan</th>
                            <th>Ay Sonu Ongoru</th>
                            {productionRewardRows.map((rewardRow) => (
                              <th
                                className={
                                  companyEmployeeProductionPlans.every(
                                    (plan) => rewardRow.points < plan.targetPoints
                                  )
                                    ? "goal-store-production-head-below-target"
                                    : ""
                                }
                                key={`company-production-head-${rewardRow.points}`}
                              >
                                <span className="goal-store-production-head-points">{formatNumber(rewardRow.points)} Puan</span>
                                <span className="goal-store-production-head-reward">{rewardRow.reward}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {companyEmployeeProductionPlans.map((plan) => (
                            <tr key={`company-production-row-${plan.employeeName}`}>
                              <th>{plan.employeeName}</th>
                              <td>{formatNumber(plan.actualPoints)}</td>
                              <td>{formatNumber(plan.projectedPoints)}</td>
                              {plan.rows.map((row) => (
                                <td
                                  key={`company-production-cell-${plan.employeeName}-${row.points}`}
                                  className={
                                    row.isBelowTarget
                                      ? "goal-store-production-cell-below-target"
                                      : row.isCurrentProjectedTier
                                      ? "goal-store-production-cell-active"
                                      : row.isReached
                                        ? "goal-store-production-cell-complete"
                                        : ""
                                  }
                                >
                                  {row.isBelowTarget ? null : (
                                    <>
                                      <strong>{row.isReached ? "Tamam" : formatNumber(row.dailyRequired)}</strong>
                                      <span>{row.isCurrentProjectedTier ? "Ay sonu ongorusu" : row.isReached ? "Skala asildi" : "Gunluk ihtiyac"}</span>
                                    </>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {effectiveView === "company" && detailCategorySummaries.length ? (
                  <div className="evaluation-card">
                    <div className="evaluation-card-actions evaluation-card-actions-bottom">
                      <SpeakCoachingButton text={detailCoachingText} />
                    </div>
                  </div>
                ) : null}

                {effectiveView === "employee" ? (
                  <div className="goal-company-trend-panel">
                    <div className="goal-live-prime-head">
                      <h3>Sube Gunluk Ihtiyaclari</h3>
                      <span>Kendi subenin hedefli kalemler icin gunluk gereken adet / tutar</span>
                    </div>

                    {employeeStoreDailyNeedSummaryRows.length ? (
                      <StoreDailyNeedsTable rows={employeeStoreDailyNeedSummaryRows} />
                    ) : (
                      <p className="subtle">Bu sube icin hedef tanimli kalem bulunamadi.</p>
                    )}
                  </div>
                ) : null}

                {effectiveView === "employee" && employeePrimeForecast ? (
                  <div className="goal-company-trend-panel">
                    <div className="goal-live-prime-head">
                      <h3>Prim Ongoru</h3>
                      <span>Uretim puani, canli prim ve aksesuar karlilik bazli mevcut ve ay sonu prim tahmini</span>
                    </div>

                      <div className="goal-company-trend-table-wrap">
                        <table className="goal-company-trend-table goal-employee-prime-forecast-table">
                          <colgroup>
                            <col className="goal-employee-prime-forecast-col-label" />
                            <col className="goal-employee-prime-forecast-col-current" />
                            <col className="goal-employee-prime-forecast-col-projected" />
                            <col className="goal-employee-prime-forecast-col-note" />
                          </colgroup>
                          <thead>
                          <tr>
                            <th>Kalem</th>
                            <th>Mevcut</th>
                            <th>Ay Sonu Ongorusu</th>
                            <th>Aciklama</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <th>Uretim Puani Kazanimi</th>
                            <td>{formatCurrency(employeePrimeForecast.productionCurrentReward)}</td>
                            <td>{formatCurrency(employeePrimeForecast.productionProjectedReward)}</td>
                            <td>Mevcut skala ve ay sonu puan ongorusu esas alindi.</td>
                          </tr>
                          <tr>
                            <th>Aksesuar Karlilik Primi</th>
                            <td>{formatCurrency(employeePrimeForecast.accessoryCurrentReward)}</td>
                            <td>{formatCurrency(employeePrimeForecast.accessoryProjectedReward)}</td>
                            <td>
                              Tempo {formatPercent(employeeAccessoryCategory?.actualPercent ?? null)} /{" "}
                              {formatPercent(employeeAccessoryCategory?.projectedPercent ?? null)} ve sepete taksit haric baz{" "}
                              {formatCurrency(employeePrimeForecast.accessoryCurrentBase)} /{" "}
                              {formatCurrency(employeePrimeForecast.accessoryProjectedBase)} uzerinden %{
                                employeePrimeForecast.accessoryCurrentRate
                              } / %{employeePrimeForecast.accessoryProjectedRate}.
                            </td>
                          </tr>
                          <tr>
                            <th>Aylik Prim Ongorusu Toplami</th>
                            <td>{formatCurrency(employeePrimeSubtotalCurrent)}</td>
                            <td>{formatCurrency(employeePrimeSubtotalProjected)}</td>
                            <td>Uretim puani kazanimi + aksesuar karlilik primi brut toplami</td>
                          </tr>
                          <tr>
                            <th>Uretim Puani Kesintisi</th>
                            <td>{formatCurrency(employeePrimeForecast.monthlyDeductionCurrentAmount)}</td>
                            <td>{formatCurrency(employeePrimeForecast.monthlyDeductionProjectedAmount)}</td>
                            <td>
                              {employeePrimeForecast.monthlyDeductionCurrentRate > 0 ||
                              employeePrimeForecast.monthlyDeductionProjectedRate > 0
                                ? `Kesinti oranı mevcut %${formatNumber(employeePrimeForecast.monthlyDeductionCurrentRate)} | ay sonu %${formatNumber(
                                    employeePrimeForecast.monthlyDeductionProjectedRate
                                  )}. ${
                                    employeePrimeForecast.monthlyDeductionProjectedReasons.join(" | ") ||
                                    employeePrimeForecast.monthlyDeductionCurrentReasons.join(" | ")
                                  }`
                                : "Kesinti koşulu oluşmadı."}
                            </td>
                          </tr>
                          <tr>
                            <th>Aylik Prim Neti</th>
                            <td>{formatCurrency(employeePrimeForecast.monthlyNetCurrentReward)}</td>
                            <td>{formatCurrency(employeePrimeForecast.monthlyNetProjectedReward)}</td>
                            <td>Uretim puani kazanimi + aksesuar karlilik primi - sadece uretim puani kesintisi</td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="goal-employee-prime-forecast-live-prime-cell">
                              <details className="goal-employee-prime-forecast-live-prime-details">
                                <summary className="goal-employee-prime-forecast-live-prime-summary">
                                  <span className="goal-employee-prime-forecast-live-prime-title">Canli Prim</span>
                                  <span className="goal-employee-prime-forecast-live-prime-values">
                                    <span>{formatCurrency(employeePrimeForecast.livePrimeCurrentReward)}</span>
                                    <span>{formatCurrency(employeePrimeForecast.livePrimeProjectedReward)}</span>
                                  </span>
                                  <span className="goal-employee-prime-forecast-live-prime-action">
                                    <span>Kirilimi ac</span>
                                    <span className="goal-employee-prime-forecast-live-prime-caret">v</span>
                                  </span>
                                </summary>
                                <div className="goal-employee-prime-forecast-live-prime-meta">
                                  Canli prim sheetindeki calisilan gun {formatNumber(livePrimeSettings.workedDays)} / toplam gun{" "}
                                  {formatNumber(livePrimeSettings.totalDays)} temposuna gore hesaplandi.
                                </div>
                                {employeeLivePrimeCategorySummaries.length ? (
                                  <div className="goal-live-prime-panel goal-live-prime-panel-inline">
                                    <GoalActualOnlyCategoryCards categories={employeeLivePrimeCategorySummaries} />
                                  </div>
                                ) : null}
                              </details>
                            </td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr>
                            <th>Primler Toplami</th>
                            <td>{formatCurrency(employeePrimeForecast.totalCurrentReward)}</td>
                            <td>{formatCurrency(employeePrimeForecast.totalProjectedReward)}</td>
                            <td>Aylik prim neti + canli prim toplami</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : null}

                {effectiveView === "store" && storeEmployeeProductionPlans.length ? (
                  <div className="goal-store-production-panel">
                    <div className="goal-live-prime-head">
                      <h3>Personel Uretim Puani Skala Ihtiyaclari</h3>
                    </div>

                    <div className="goal-store-production-table-wrap">
                      <table className="goal-store-production-table">
                        <thead>
                          <tr>
                            <th>Personel</th>
                            <th>Su Anki Puan</th>
                            <th>Ay Sonu Ongoru</th>
                            {productionRewardRows.map((rewardRow) => (
                              <th
                                className={
                                  storeEmployeeProductionPlans.every(
                                    (plan) => rewardRow.points < plan.targetPoints
                                  )
                                    ? "goal-store-production-head-below-target"
                                    : ""
                                }
                                key={`store-production-head-${rewardRow.points}`}
                              >
                                <span className="goal-store-production-head-points">{formatNumber(rewardRow.points)} Puan</span>
                                <span className="goal-store-production-head-reward">{rewardRow.reward}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {storeEmployeeProductionPlans.map((plan) => (
                            <tr key={`store-production-row-${plan.employeeName}`}>
                              <th>{plan.employeeName}</th>
                              <td>{formatNumber(plan.actualPoints)}</td>
                              <td>{formatNumber(plan.projectedPoints)}</td>
                              {plan.rows.map((row) => (
                                <td
                                  key={`store-production-cell-${plan.employeeName}-${row.points}`}
                                  className={
                                    row.isBelowTarget
                                      ? "goal-store-production-cell-below-target"
                                      : row.isCurrentProjectedTier
                                      ? "goal-store-production-cell-active"
                                      : row.isReached
                                        ? "goal-store-production-cell-complete"
                                        : ""
                                  }
                                >
                                  {row.isBelowTarget ? null : (
                                    <>
                                      <strong>{row.isReached ? "Tamam" : formatNumber(row.dailyRequired)}</strong>
                                      <span>{row.isCurrentProjectedTier ? "Ay sonu ongorusu" : row.isReached ? "Skala asildi" : "Gunluk ihtiyac"}</span>
                                    </>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {effectiveView === "store" && detailCategorySummaries.length ? (
                  <div className="evaluation-card">
                    <div className="evaluation-card-actions evaluation-card-actions-bottom">
                      <SpeakCoachingButton text={detailCoachingText} />
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
