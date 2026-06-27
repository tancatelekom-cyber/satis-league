import { redirect } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { fetchGoalActualRows, fetchGoalDayStats, fetchGoalProductionRewardRows, GoalActualRow } from "@/lib/goal-actuals";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type PageProps = {
  searchParams?: Promise<{
    employee?: string;
  }>;
};

type EmployeeProfileOption = {
  id: string;
  fullName: string;
  storeName: string;
};

type MetricSummary = {
  title: string;
  target: number | null;
  actual: number;
  remaining: number | null;
  actualPercent: number | null;
  projectedActual: number;
  projectedPercent: number | null;
  hasTarget: boolean;
};

type CompanyMetricBenchmark = {
  title: string;
  employeeCount: number;
  averageActualPercent: number | null;
  averageProjectedPercent: number | null;
};

type StoreMetricBenchmark = {
  title: string;
  employeeCount: number;
  averageActualPercent: number | null;
  averageProjectedPercent: number | null;
};

type AnalysisMetric = MetricSummary & {
  companyAverageActualPercent: number | null;
  companyAverageProjectedPercent: number | null;
  storeAverageActualPercent: number | null;
  storeAverageProjectedPercent: number | null;
  actualGap: number | null;
  projectedGap: number | null;
  storeActualGap: number | null;
  storeProjectedGap: number | null;
  status: "good" | "watch" | "critical" | "neutral";
  dailyNeed: number;
};

type RewardForecast = {
  actualPoints: number;
  projectedPoints: number;
  currentReward: string | null;
  projectedReward: string | null;
  nextReward: string | null;
};

type ComparisonBucketItem = {
  title: string;
  actualPercent: number | null;
  gap: number | null;
};

type BranchImpactDirection = "lift" | "drag" | "balance";

function buildHref(employeeId: string) {
  const params = new URLSearchParams();
  if (employeeId) {
    params.set("employee", employeeId);
  }

  return `/admin/calisan-analiz?${params.toString()}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeIdentity(value: string | null | undefined) {
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

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
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

function formatSignedPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
}

function clampValue(value: number | null | undefined, max = 140) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(value, max));
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isAggregateCategoryLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return normalized === "tum kategoriler" || normalized === "tüm kategoriler";
}

function isLivePrimeCategory(value: string | null | undefined) {
  const normalized = normalizeIdentity(value);
  return normalized.includes("CANLI PRIM");
}

function isUsableSubCategory(row: GoalActualRow) {
  const subCategory = normalizeText(row.subCategory);

  if (!subCategory || isAggregateCategoryLabel(subCategory) || isLivePrimeCategory(subCategory)) {
    return false;
  }

  return normalizeIdentity(subCategory) !== normalizeIdentity(row.mainCategory);
}

function buildMetricSummary(title: string, rows: GoalActualRow[], workedDays: number, totalDays: number): MetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = totalTarget > 0;
  const projectedActual = workedDays > 0 ? Math.floor((totalActual / workedDays) * totalDays) : totalActual;

  return {
    title,
    target: hasTarget ? totalTarget : null,
    actual: totalActual,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget
  };
}

function buildEmployeeMetricSummaries(
  rows: GoalActualRow[],
  workedDays: number,
  totalDays: number,
  labelResolver: (row: GoalActualRow) => string | null
) {
  const categoryMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const label = labelResolver(row);
    if (!label) {
      return;
    }

    const current = categoryMap.get(label) ?? [];
    current.push(row);
    categoryMap.set(label, current);
  });

  return Array.from(categoryMap.entries())
    .map(([title, categoryRows]) => buildMetricSummary(title, categoryRows, workedDays, totalDays))
    .sort((left, right) => left.title.localeCompare(right.title, "tr"));
}

function buildCompanyBenchmarks(
  rows: GoalActualRow[],
  workedDays: number,
  totalDays: number,
  labelResolver: (row: GoalActualRow) => string | null
) {
  const categoryEmployeeMap = new Map<string, Map<string, GoalActualRow[]>>();

  rows.forEach((row) => {
    const categoryKey = labelResolver(row);
    if (!categoryKey) {
      return;
    }

    const employeeKey = row.personnelId || normalizeIdentity(row.employeeName);
    const byEmployee = categoryEmployeeMap.get(categoryKey) ?? new Map<string, GoalActualRow[]>();
    const currentRows = byEmployee.get(employeeKey) ?? [];
    currentRows.push(row);
    byEmployee.set(employeeKey, currentRows);
    categoryEmployeeMap.set(categoryKey, byEmployee);
  });

  return new Map<string, CompanyMetricBenchmark>(
    Array.from(categoryEmployeeMap.entries()).map(([title, byEmployee]) => {
      const summaries = Array.from(byEmployee.values())
        .map((employeeRows) => buildMetricSummary(title, employeeRows, workedDays, totalDays))
        .filter((summary) => summary.hasTarget && summary.actual > 0);

      return [
        title,
        {
          title,
          employeeCount: summaries.length,
          averageActualPercent: average(summaries.map((summary) => summary.actualPercent ?? 0).filter((value) => value > 0)),
          averageProjectedPercent: average(summaries.map((summary) => summary.projectedPercent ?? 0).filter((value) => value > 0))
        }
      ] satisfies [string, CompanyMetricBenchmark];
    })
  );
}

function buildStoreBenchmarks(
  rows: GoalActualRow[],
  storeName: string,
  workedDays: number,
  totalDays: number,
  labelResolver: (row: GoalActualRow) => string | null
) {
  const normalizedStoreName = normalizeIdentity(storeName);
  const storeRows = rows.filter((row) => normalizeIdentity(row.storeName) === normalizedStoreName);
  const categoryEmployeeMap = new Map<string, Map<string, GoalActualRow[]>>();

  storeRows.forEach((row) => {
    const categoryKey = labelResolver(row);
    if (!categoryKey) {
      return;
    }

    const employeeKey = row.personnelId || normalizeIdentity(row.employeeName);
    const byEmployee = categoryEmployeeMap.get(categoryKey) ?? new Map<string, GoalActualRow[]>();
    const currentRows = byEmployee.get(employeeKey) ?? [];
    currentRows.push(row);
    byEmployee.set(employeeKey, currentRows);
    categoryEmployeeMap.set(categoryKey, byEmployee);
  });

  return new Map<string, StoreMetricBenchmark>(
    Array.from(categoryEmployeeMap.entries()).map(([title, byEmployee]) => {
      const summaries = Array.from(byEmployee.values())
        .map((employeeRows) => buildMetricSummary(title, employeeRows, workedDays, totalDays))
        .filter((summary) => summary.hasTarget && summary.actual > 0);

      return [
        title,
        {
          title,
          employeeCount: summaries.length,
          averageActualPercent: average(summaries.map((summary) => summary.actualPercent ?? 0).filter((value) => value > 0)),
          averageProjectedPercent: average(summaries.map((summary) => summary.projectedPercent ?? 0).filter((value) => value > 0))
        }
      ] satisfies [string, StoreMetricBenchmark];
    })
  );
}

function buildRewardForecast(metrics: MetricSummary[], rewardRows: Array<{ points: number; reward: string }>, workedDays: number, totalDays: number): RewardForecast | null {
  const productionMetric = metrics.find((metric) => normalizeIdentity(metric.title) === "URETIM PUAN");

  if (!productionMetric || !rewardRows.length) {
    return null;
  }

  const actualPoints = productionMetric.actual;
  const projectedPoints = workedDays > 0 ? Math.floor((actualPoints / workedDays) * totalDays) : actualPoints;
  const currentReward = [...rewardRows].reverse().find((row) => actualPoints >= row.points)?.reward ?? null;
  const projectedReward = [...rewardRows].reverse().find((row) => projectedPoints >= row.points)?.reward ?? null;
  const nextReward = rewardRows.find((row) => row.points > actualPoints)?.reward ?? null;

  return {
    actualPoints,
    projectedPoints,
    currentReward,
    projectedReward,
    nextReward
  };
}

function statusFromMetric(metric: AnalysisMetric) {
  if (!metric.hasTarget || metric.actualPercent === null) {
    return "neutral";
  }

  if ((metric.actualGap ?? 0) <= -15 || metric.actualPercent < 70) {
    return "critical";
  }

  if ((metric.actualGap ?? 0) < 0 || metric.actualPercent < 100) {
    return "watch";
  }

  return "good";
}

function buildInsightSummary(metrics: AnalysisMetric[], rewardForecast: RewardForecast | null) {
  const targetMetrics = metrics.filter((metric) => metric.hasTarget && metric.actualPercent !== null);
  const currentAverage = average(targetMetrics.map((metric) => metric.actualPercent ?? 0));
  const projectedAverage = average(targetMetrics.map((metric) => metric.projectedPercent ?? 0));
  const strongCount = targetMetrics.filter((metric) => (metric.actualGap ?? 0) > 0).length;
  const weakCount = targetMetrics.filter((metric) => (metric.actualGap ?? 0) < 0).length;
  const bestMetric = [...targetMetrics].sort((left, right) => (right.actualGap ?? -999) - (left.actualGap ?? -999) || (right.actualPercent ?? 0) - (left.actualPercent ?? 0))[0] ?? null;
  const worstMetric = [...targetMetrics].sort((left, right) => (left.actualGap ?? 999) - (right.actualGap ?? 999) || (left.actualPercent ?? 999) - (right.actualPercent ?? 999))[0] ?? null;

  const summaryText = [
    currentAverage !== null
      ? `Genel tempo ${formatPercent(currentAverage)} seviyesinde.`
      : "Genel tempo icin yeterli hedefli kategori bulunmuyor.",
    bestMetric ? `En guclu alan ${bestMetric.title}; firma ortalamasina gore ${formatPercent(bestMetric.actualGap)} onde.` : null,
    worstMetric ? `En kritik alan ${worstMetric.title}; firma ortalamasina gore ${formatPercent(Math.abs(worstMetric.actualGap ?? 0))} geride.` : null,
    rewardForecast?.projectedReward ? `Uretim puaninda ay sonu ongorusu ${rewardForecast.projectedReward}.` : null
  ]
    .filter(Boolean)
    .join(" ");

  return {
    currentAverage,
    projectedAverage,
    strongCount,
    weakCount,
    bestMetric,
    worstMetric,
    summaryText
  };
}

function getBranchImpact(metric: AnalysisMetric): BranchImpactDirection {
  if (!metric.hasTarget || metric.actualPercent === null) {
    return "balance";
  }

  if ((metric.actualGap ?? 0) >= 8 && (metric.projectedGap ?? metric.actualGap ?? 0) >= 0) {
    return "lift";
  }

  if ((metric.actualGap ?? 0) <= -8 || metric.actualPercent < 75) {
    return "drag";
  }

  return "balance";
}

function getBranchImpactLabel(direction: BranchImpactDirection) {
  if (direction === "lift") {
    return "Subeyi yukari tasiyor";
  }

  if (direction === "drag") {
    return "Subeyi geri cekiyor";
  }

  return "Sube temposunu dengede tutuyor";
}

function buildPriorityScore(metric: AnalysisMetric, remainingDays: number) {
  const gapPenalty = Math.max(0, -(metric.actualGap ?? 0)) * 2.4;
  const targetPenalty = metric.actualPercent !== null ? Math.max(0, 100 - metric.actualPercent) * 0.65 : 0;
  const needPenalty = remainingDays > 0 ? metric.dailyNeed * 4 : metric.dailyNeed * 2;
  return Math.round(gapPenalty + targetPenalty + needPenalty);
}

function buildMergedMetrics(
  summaries: MetricSummary[],
  companyBenchmarks: Map<string, CompanyMetricBenchmark>,
  storeBenchmarks: Map<string, StoreMetricBenchmark>,
  remainingDays: number
) {
  return summaries
    .map((metric) => {
      const benchmark = companyBenchmarks.get(metric.title) ?? null;
      const storeBenchmark = storeBenchmarks.get(metric.title) ?? null;
      const dailyNeed = remainingDays > 0 && metric.remaining !== null ? Math.ceil(metric.remaining / remainingDays) : 0;
      const merged: AnalysisMetric = {
        ...metric,
        companyAverageActualPercent: benchmark?.averageActualPercent ?? null,
        companyAverageProjectedPercent: benchmark?.averageProjectedPercent ?? null,
        storeAverageActualPercent: storeBenchmark?.averageActualPercent ?? null,
        storeAverageProjectedPercent: storeBenchmark?.averageProjectedPercent ?? null,
        actualGap:
          metric.actualPercent !== null && (benchmark?.averageActualPercent ?? null) !== null
            ? metric.actualPercent - (benchmark?.averageActualPercent ?? 0)
            : null,
        projectedGap:
          metric.projectedPercent !== null && (benchmark?.averageProjectedPercent ?? null) !== null
            ? metric.projectedPercent - (benchmark?.averageProjectedPercent ?? 0)
            : null,
        storeActualGap:
          metric.actualPercent !== null && (storeBenchmark?.averageActualPercent ?? null) !== null
            ? metric.actualPercent - (storeBenchmark?.averageActualPercent ?? 0)
            : null,
        storeProjectedGap:
          metric.projectedPercent !== null && (storeBenchmark?.averageProjectedPercent ?? null) !== null
            ? metric.projectedPercent - (storeBenchmark?.averageProjectedPercent ?? 0)
            : null,
        status: "neutral",
        dailyNeed
      };

      return {
        ...merged,
        status: statusFromMetric(merged)
      } satisfies AnalysisMetric;
    })
    .sort((left, right) => {
      if (left.hasTarget && right.hasTarget) {
        return (right.actualPercent ?? 0) - (left.actualPercent ?? 0);
      }

      if (left.hasTarget !== right.hasTarget) {
        return left.hasTarget ? -1 : 1;
      }

      return right.actual - left.actual;
    });
}

export default async function EmployeeAnalysisPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedEmployeeId = String(params?.employee ?? "").trim();

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const admin = createAdminClient();
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, full_name, role, approval, is_on_leave, store:stores(name)")
    .eq("approval", "approved")
    .eq("role", "employee")
    .order("full_name", { ascending: true });

  const employeeProfiles = ((profileRows ?? []) as Array<{
    id: string;
    full_name: string;
    role: string;
    approval: string;
    is_on_leave: boolean | null;
    store: Array<{ name: string }> | { name: string } | null;
  }>)
    .filter((profile) => !profile.is_on_leave)
    .map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      storeName: Array.isArray(profile.store) ? (profile.store[0]?.name ?? "-") : (profile.store?.name ?? "-")
    }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "tr")) satisfies EmployeeProfileOption[];

  if (!employeeProfiles.length) {
    return (
      <main>
        <h1 className="page-title">Calisan Analizi</h1>
        <p className="page-subtitle">Analiz icin uygun aktif calisan bulunamadi.</p>
        <AdminSectionNav currentPath="/admin/calisan-analiz" />
      </main>
    );
  }

  const selectedProfile = employeeProfiles.find((profile) => profile.id === selectedEmployeeId) ?? employeeProfiles[0];

  let goalRows: GoalActualRow[] = [];
  let workedDays = 0;
  let totalDays = 0;
  let remainingDays = 0;
  let rewardRows: Array<{ points: number; reward: string }> = [];
  let sheetError = "";

  try {
    const [employeeRows, dayStats, productionRewardRows] = await Promise.all([
      fetchGoalActualRows(),
      fetchGoalDayStats(),
      fetchGoalProductionRewardRows()
    ]);

    goalRows = employeeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory) && !isLivePrimeCategory(row.mainCategory));
    workedDays = dayStats.workedDays;
    totalDays = dayStats.totalDays;
    remainingDays = dayStats.remainingDays;
    rewardRows = productionRewardRows;
  } catch (error) {
    sheetError = error instanceof Error ? error.message : "Hedef gerceklesen verisi su an okunamadi.";
  }

  const employeeRowsById = goalRows.filter((row) => row.personnelId && row.personnelId === selectedProfile.id);
  const employeeRowsByName = goalRows.filter(
    (row) => normalizeIdentity(row.employeeName) === normalizeIdentity(selectedProfile.fullName)
  );
  const selectedRows = employeeRowsById.length ? employeeRowsById : employeeRowsByName;
  const categorySummaries = buildEmployeeMetricSummaries(selectedRows, workedDays, totalDays, (row) => row.mainCategory);
  const companyBenchmarks = buildCompanyBenchmarks(goalRows, workedDays, totalDays, (row) => row.mainCategory);
  const storeBenchmarks = buildStoreBenchmarks(goalRows, selectedProfile.storeName, workedDays, totalDays, (row) => row.mainCategory);
  const mergedMetrics = buildMergedMetrics(categorySummaries, companyBenchmarks, storeBenchmarks, remainingDays);
  const subCategorySummaries = buildEmployeeMetricSummaries(
    selectedRows.filter(isUsableSubCategory),
    workedDays,
    totalDays,
    (row) => (isUsableSubCategory(row) ? `${row.mainCategory} / ${normalizeText(row.subCategory)}` : null)
  );
  const companySubBenchmarks = buildCompanyBenchmarks(
    goalRows.filter(isUsableSubCategory),
    workedDays,
    totalDays,
    (row) => (isUsableSubCategory(row) ? `${row.mainCategory} / ${normalizeText(row.subCategory)}` : null)
  );
  const storeSubBenchmarks = buildStoreBenchmarks(
    goalRows.filter(isUsableSubCategory),
    selectedProfile.storeName,
    workedDays,
    totalDays,
    (row) => (isUsableSubCategory(row) ? `${row.mainCategory} / ${normalizeText(row.subCategory)}` : null)
  );
  const mergedSubMetrics = buildMergedMetrics(subCategorySummaries, companySubBenchmarks, storeSubBenchmarks, remainingDays);
  const targetMetrics = mergedMetrics.filter((metric) => metric.hasTarget);
  const targetSubMetrics = mergedSubMetrics.filter((metric) => metric.hasTarget);
  const statusTotals = {
    good: targetMetrics.filter((metric) => metric.status === "good").length,
    watch: targetMetrics.filter((metric) => metric.status === "watch").length,
    critical: targetMetrics.filter((metric) => metric.status === "critical").length
  };
  const branchImpactMetrics = [...targetMetrics]
    .sort(
      (left, right) =>
        Math.abs(right.actualGap ?? 0) - Math.abs(left.actualGap ?? 0) ||
        Math.abs(right.projectedGap ?? 0) - Math.abs(left.projectedGap ?? 0)
    )
    .slice(0, 6);
  const criticalPriorities = [...targetMetrics]
    .map((metric) => ({
      metric,
      score: buildPriorityScore(metric, remainingDays)
    }))
    .sort((left, right) => right.score - left.score || (left.metric.actualPercent ?? 999) - (right.metric.actualPercent ?? 999))
    .slice(0, 3);
  const ringTotal = Math.max(targetMetrics.length, 1);
  const ringGood = Math.round((statusTotals.good / ringTotal) * 100);
  const ringWatch = Math.round((statusTotals.watch / ringTotal) * 100);
  const ringCritical = Math.max(0, 100 - ringGood - ringWatch);
  const ringBackground = `conic-gradient(#22c55e 0 ${ringGood}%, #f59e0b ${ringGood}% ${ringGood + ringWatch}%, #ef4444 ${ringGood + ringWatch}% 100%)`;
  const strengths = [...mergedMetrics]
    .filter(
      (metric) =>
        metric.hasTarget &&
        (metric.actualPercent ?? 0) >= 100 &&
        (metric.actualGap ?? 0) > 0 &&
        ((metric.storeActualGap ?? 0) > 0 || metric.storeAverageActualPercent === null)
    )
    .sort(
      (left, right) =>
        ((right.actualGap ?? -999) + (right.storeActualGap ?? 0)) - ((left.actualGap ?? -999) + (left.storeActualGap ?? 0)) ||
        (right.actualPercent ?? 0) - (left.actualPercent ?? 0)
    )
    .slice(0, 4);
  const strengthTitles = new Set(strengths.map((metric) => metric.title));
  const developmentAreas = [...mergedMetrics]
    .filter(
      (metric) =>
        metric.hasTarget &&
        !strengthTitles.has(metric.title) &&
        (
          (metric.actualGap ?? 0) < 0 ||
          (metric.storeActualGap ?? 0) < 0 ||
          (metric.actualPercent ?? 0) < 100 ||
          metric.status === "critical" ||
          metric.status === "watch"
        )
    )
    .sort(
      (left, right) =>
        ((left.actualGap ?? 999) + (left.storeActualGap ?? 0)) - ((right.actualGap ?? 999) + (right.storeActualGap ?? 0)) ||
        (left.actualPercent ?? 999) - (right.actualPercent ?? 999)
    )
    .slice(0, 4);
  const subStrengths = [...mergedSubMetrics]
    .filter(
      (metric) =>
        metric.hasTarget &&
        (metric.actualPercent ?? 0) >= 100 &&
        (metric.actualGap ?? 0) > 0 &&
        ((metric.storeActualGap ?? 0) > 0 || metric.storeAverageActualPercent === null)
    )
    .sort(
      (left, right) =>
        ((right.actualGap ?? -999) + (right.storeActualGap ?? 0)) - ((left.actualGap ?? -999) + (left.storeActualGap ?? 0)) ||
        (right.actualPercent ?? 0) - (left.actualPercent ?? 0)
    )
    .slice(0, 6);
  const subStrengthTitles = new Set(subStrengths.map((metric) => metric.title));
  const subDevelopmentAreas = [...mergedSubMetrics]
    .filter(
      (metric) =>
        metric.hasTarget &&
        !subStrengthTitles.has(metric.title) &&
        (
          (metric.actualGap ?? 0) < 0 ||
          (metric.storeActualGap ?? 0) < 0 ||
          (metric.actualPercent ?? 0) < 100 ||
          metric.status === "critical" ||
          metric.status === "watch"
        )
    )
    .sort(
      (left, right) =>
        ((left.actualGap ?? 999) + (left.storeActualGap ?? 0)) - ((right.actualGap ?? 999) + (right.storeActualGap ?? 0)) ||
        (left.actualPercent ?? 999) - (right.actualPercent ?? 999)
    )
    .slice(0, 6);
  const rewardForecast = buildRewardForecast(categorySummaries, rewardRows, workedDays, totalDays);
  const insight = buildInsightSummary(mergedMetrics, rewardForecast);
  const aboveStoreMetrics: ComparisonBucketItem[] = targetMetrics
    .filter((metric) => (metric.storeActualGap ?? 0) > 0)
    .sort((left, right) => (right.storeActualGap ?? 0) - (left.storeActualGap ?? 0))
    .map((metric) => ({
      title: metric.title,
      actualPercent: metric.actualPercent,
      gap: metric.storeActualGap
    }));
  const aboveCompanyMetrics: ComparisonBucketItem[] = targetMetrics
    .filter((metric) => (metric.actualGap ?? 0) > 0)
    .sort((left, right) => (right.actualGap ?? 0) - (left.actualGap ?? 0))
    .map((metric) => ({
      title: metric.title,
      actualPercent: metric.actualPercent,
      gap: metric.actualGap
    }));
  const belowStoreMetrics: ComparisonBucketItem[] = targetMetrics
    .filter((metric) => (metric.storeActualGap ?? 0) < 0)
    .sort((left, right) => (left.storeActualGap ?? 0) - (right.storeActualGap ?? 0))
    .map((metric) => ({
      title: metric.title,
      actualPercent: metric.actualPercent,
      gap: metric.storeActualGap
    }));
  const belowCompanyMetrics: ComparisonBucketItem[] = targetMetrics
    .filter((metric) => (metric.actualGap ?? 0) < 0)
    .sort((left, right) => (left.actualGap ?? 0) - (right.actualGap ?? 0))
    .map((metric) => ({
      title: metric.title,
      actualPercent: metric.actualPercent,
      gap: metric.actualGap
    }));

  const employeeOptions = employeeProfiles.map((profile) => ({
    label: `${profile.fullName} | ${profile.storeName}`,
    value: buildHref(profile.id)
  }));

  return (
    <main>
      <h1 className="page-title">Calisan Analizi</h1>
      <p className="page-subtitle">
        Tek bir calisani secip hedef gerceklesenini, firma ortalamasina gore durumunu ve odak aksiyonlarini net olarak inceleyin.
      </p>

      <AdminSectionNav currentPath="/admin/calisan-analiz" />

      <section className="admin-card employee-analysis-filter-card">
        <div className="employee-analysis-filter-grid">
          <label className="field">
            <span>Calisan Sec</span>
            <FilterSelectNav
              ariaLabel="Calisan secimi"
              value={buildHref(selectedProfile.id)}
              options={employeeOptions}
            />
          </label>
          <div className="employee-analysis-picked-card">
            <span>Secili Profil</span>
            <strong>{selectedProfile.fullName}</strong>
            <p>{selectedProfile.storeName}</p>
          </div>
        </div>
      </section>

      {sheetError ? (
        <section className="admin-card">
          <h3>Veri okunamadi</h3>
          <p>{sheetError}</p>
        </section>
      ) : !selectedRows.length ? (
        <section className="admin-card">
          <h3>Calisan verisi bulunamadi</h3>
          <p>Secilen kullanici icin sheet tarafinda personel id veya isim eslesmesi bulunmuyor.</p>
        </section>
      ) : (
        <section className="admin-stack employee-analysis-stack">
          <section className="employee-analysis-summary-grid">
            <article className="goal-summary-card">
              <span>Calisilan Gun</span>
              <strong>{formatNumber(workedDays)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Kalan Gun</span>
              <strong>{formatNumber(remainingDays)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Mevcut Ortalama</span>
              <strong>{formatPercent(insight.currentAverage)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Ay Sonu Ortalama</span>
              <strong>{formatPercent(insight.projectedAverage)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Firma Ort. Ustu</span>
              <strong>{formatNumber(insight.strongCount)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Gelisim Alani</span>
              <strong>{formatNumber(insight.weakCount)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Subeyi Tasiyan</span>
              <strong>{formatNumber(statusTotals.good)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Subeyi Geri Ceken</span>
              <strong>{formatNumber(statusTotals.critical)}</strong>
            </article>
          </section>

          <article className="evaluation-card evaluation-card-wide employee-analysis-hero">
            <div className="evaluation-card-head">
              <strong>{selectedProfile.fullName}</strong>
              <span>{selectedProfile.storeName}</span>
            </div>
            <div className="employee-analysis-hero-summary-grid">
              <article className="employee-analysis-hero-summary-item">
                <span>Genel Tempo</span>
                <strong>{formatPercent(insight.currentAverage)}</strong>
                <p>{insight.summaryText}</p>
              </article>
              {insight.bestMetric ? (
                <article className="employee-analysis-hero-summary-item employee-analysis-hero-summary-item-good">
                  <span>En Guclu Alan</span>
                  <strong>{insight.bestMetric.title}</strong>
                  <p>Firma farki {formatSignedPercent(insight.bestMetric.actualGap)}</p>
                </article>
              ) : null}
              {insight.worstMetric ? (
                <article className="employee-analysis-hero-summary-item employee-analysis-hero-summary-item-critical">
                  <span>En Kritik Alan</span>
                  <strong>{insight.worstMetric.title}</strong>
                  <p>Firma farki {formatSignedPercent(insight.worstMetric.actualGap)}</p>
                </article>
              ) : null}
            </div>

            <div className="employee-analysis-hero-chips">
              {insight.bestMetric ? (
                <span className="executive-chip">En iyi alan: {insight.bestMetric.title}</span>
              ) : null}
              {insight.worstMetric ? (
                <span className="executive-chip executive-chip-alert">En kritik alan: {insight.worstMetric.title}</span>
              ) : null}
              {rewardForecast?.projectedReward ? (
                <span className="executive-chip">Ay sonu kazanim: {rewardForecast.projectedReward}</span>
              ) : null}
            </div>
          </article>

          <section className="employee-analysis-two-column">
            <article className="admin-card">
              <h3>Iyi Yonler</h3>
              <div className="employee-analysis-metric-list">
                {strengths.length ? (
                  strengths.map((metric) => (
                    <div key={`strength-${metric.title}`} className="employee-analysis-metric-card employee-analysis-metric-card-good">
                      <div className="employee-analysis-metric-head">
                        <strong>{metric.title}</strong>
                        <span>{formatPercent(metric.actualPercent)}</span>
                      </div>
                      <p>
                        Firma ortalamasi {formatPercent(metric.companyAverageActualPercent)}, sube ortalamasi {formatPercent(metric.storeAverageActualPercent)} seviyesinde.
                        Bu calisan firma tarafinda {formatSignedPercent(metric.actualGap)}, sube tarafinda {formatSignedPercent(metric.storeActualGap)} onde gorunuyor.
                      </p>
                    </div>
                  ))
                ) : (
                  <p>Belirgin bir guclu alan bulunamadi.</p>
                )}
              </div>
            </article>

            <article className="admin-card">
              <h3>Gelismesi Gereken Alanlar</h3>
              <div className="employee-analysis-metric-list">
                {developmentAreas.length ? (
                  developmentAreas.map((metric) => (
                    <div key={`risk-${metric.title}`} className="employee-analysis-metric-card employee-analysis-metric-card-critical">
                      <div className="employee-analysis-metric-head">
                        <strong>{metric.title}</strong>
                        <span>{formatPercent(metric.actualPercent)}</span>
                      </div>
                      <p>
                        Firma ortalamasi {formatPercent(metric.companyAverageActualPercent)}, sube ortalamasi {formatPercent(metric.storeAverageActualPercent)} seviyesinde.
                        Firma farki {formatSignedPercent(metric.actualGap)}, sube farki {formatSignedPercent(metric.storeActualGap)}.
                        Kalan gunlerde gunluk en az {formatNumber(metric.dailyNeed)} uretim gerekli.
                      </p>
                    </div>
                  ))
                ) : (
                  <p>Gelisim gerektiren kritik alan gorunmuyor.</p>
                )}
              </div>
            </article>
          </section>

          {rewardForecast ? (
            <article className="admin-card">
              <h3>Uretim Puani ve Kazanim Ongorusu</h3>
              <div className="employee-analysis-summary-grid">
                <article className="goal-summary-card">
                  <span>Su Anki Puan</span>
                  <strong>{formatNumber(rewardForecast.actualPoints)}</strong>
                </article>
                <article className="goal-summary-card">
                  <span>Ay Sonu Puan</span>
                  <strong>{formatNumber(rewardForecast.projectedPoints)}</strong>
                </article>
                <article className="goal-summary-card">
                  <span>Mevcut Kazanim</span>
                  <strong>{rewardForecast.currentReward ?? "-"}</strong>
                </article>
                <article className="goal-summary-card">
                  <span>Ay Sonu Ongorusu</span>
                  <strong>{rewardForecast.projectedReward ?? "-"}</strong>
                </article>
                <article className="goal-summary-card">
                  <span>Siradaki Basamak</span>
                  <strong>{rewardForecast.nextReward ?? "Son skala"}</strong>
                </article>
              </div>
            </article>
          ) : null}

          <section className="employee-analysis-two-column">
            <article className="admin-card">
              <h3>Performans Dagilimi</h3>
              <p className="employee-analysis-section-copy">
                Yesil alanlar subeyi yukari tasiyan, sari alanlar takip edilmesi gereken, kirmizi alanlar ise hizli mudahale isteyen kategorileri gosterir.
              </p>

              <div className="employee-analysis-radar-card">
                <div className="employee-analysis-radar-visual" style={{ background: ringBackground }}>
                  <div className="employee-analysis-radar-core">
                    <strong>{formatNumber(targetMetrics.length)}</strong>
                    <span>hedefli kategori</span>
                  </div>
                </div>

                <div className="employee-analysis-radar-legend">
                  <div className="employee-analysis-radar-legend-item">
                    <i className="employee-analysis-radar-dot employee-analysis-radar-dot-good" />
                    <span>Subeyi tasiyan</span>
                    <strong>{formatNumber(statusTotals.good)}</strong>
                  </div>
                  <div className="employee-analysis-radar-legend-item">
                    <i className="employee-analysis-radar-dot employee-analysis-radar-dot-watch" />
                    <span>Yakindan takip</span>
                    <strong>{formatNumber(statusTotals.watch)}</strong>
                  </div>
                  <div className="employee-analysis-radar-legend-item">
                    <i className="employee-analysis-radar-dot employee-analysis-radar-dot-critical" />
                    <span>Subeyi geri ceken</span>
                    <strong>{formatNumber(statusTotals.critical)}</strong>
                  </div>
                </div>
              </div>
            </article>

            <article className="admin-card">
              <h3>Oncelik Skoru</h3>
              <p className="employee-analysis-section-copy">
                Ilk 3 kritik alan, fark buyuklugu, mevcut tempo ve gunluk ihtiyac birlikte degerlendirilerek puanlandi.
              </p>

              <div className="employee-analysis-priority-list">
                {criticalPriorities.map(({ metric, score }, index) => (
                  <div key={`priority-${metric.title}`} className="employee-analysis-priority-card">
                    <div className="employee-analysis-priority-rank">{index + 1}</div>
                    <div className="employee-analysis-priority-copy">
                      <strong>{metric.title}</strong>
                      <p>
                        Mevcut tempo {formatPercent(metric.actualPercent)}. Firma farki {formatSignedPercent(metric.actualGap)}.
                        Gunluk ihtiyac {formatNumber(metric.dailyNeed)}.
                      </p>
                    </div>
                    <div className="employee-analysis-priority-score">
                      <span>Skor</span>
                      <strong>{formatNumber(score)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <article className="admin-card">
            <h3>Grafik Detay Panosu</h3>
            <p className="employee-analysis-section-copy">
              Her kategori icin mevcut tempo, ay sonu ongorusu, firma ortalamasi ve kalan gun ihtiyaci ayni kartta ozetlenir.
            </p>

            <div className="employee-analysis-spotlight-grid">
              {targetMetrics.map((metric) => {
                const branchImpact = getBranchImpact(metric);

                return (
                  <div key={`spotlight-${metric.title}`} className="employee-analysis-spotlight-card">
                    <div className="employee-analysis-spotlight-head">
                      <strong>{metric.title}</strong>
                      <span className={`employee-analysis-impact-badge employee-analysis-impact-badge-${branchImpact}`}>
                        {getBranchImpactLabel(branchImpact)}
                      </span>
                    </div>

                    <div className="employee-analysis-spotlight-stats">
                      <div>
                        <span>Mevcut</span>
                        <strong>{formatPercent(metric.actualPercent)}</strong>
                      </div>
                      <div>
                        <span>Ay sonu</span>
                        <strong>{formatPercent(metric.projectedPercent)}</strong>
                      </div>
                      <div>
                        <span>Firma</span>
                        <strong>{formatPercent(metric.companyAverageActualPercent)}</strong>
                      </div>
                      <div>
                        <span>Gunluk ihtiyac</span>
                        <strong>{formatNumber(metric.dailyNeed)}</strong>
                      </div>
                    </div>

                    <div className="employee-analysis-spotlight-bars">
                      <div className="employee-analysis-spotlight-bar-row">
                        <span>Tempo</span>
                        <div className="employee-analysis-bar-track">
                          <i className="employee-analysis-bar-fill employee-analysis-bar-fill-employee" style={{ width: `${clampValue(metric.actualPercent)}%` }} />
                        </div>
                      </div>
                      <div className="employee-analysis-spotlight-bar-row">
                        <span>Ay sonu</span>
                        <div className="employee-analysis-bar-track">
                          <i className="employee-analysis-bar-fill employee-analysis-bar-fill-projected" style={{ width: `${clampValue(metric.projectedPercent)}%` }} />
                        </div>
                      </div>
                      <div className="employee-analysis-spotlight-bar-row">
                        <span>Firma</span>
                        <div className="employee-analysis-bar-track">
                          <i className="employee-analysis-bar-fill employee-analysis-bar-fill-company" style={{ width: `${clampValue(metric.companyAverageActualPercent)}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="employee-analysis-spotlight-footer">
                      <span>Mevcut fark: {formatSignedPercent(metric.actualGap)}</span>
                      <span>Ay sonu fark: {formatSignedPercent(metric.projectedGap)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="admin-card">
            <h3>Sube Etki Analizi</h3>
            <p className="employee-analysis-section-copy">
              Hangi kalemlerin secili calisanin subesini yukari tasidigi, dengeledigi veya geri cektigi bu alanda net olarak gorulur.
            </p>

            <div className="employee-analysis-impact-grid">
              {branchImpactMetrics.map((metric) => {
                const branchImpact = getBranchImpact(metric);

                return (
                  <div
                    key={`impact-${metric.title}`}
                    className={`employee-analysis-impact-card employee-analysis-impact-card-${branchImpact}`}
                  >
                    <div className="employee-analysis-impact-head">
                      <strong>{metric.title}</strong>
                      <span className={`employee-analysis-impact-badge employee-analysis-impact-badge-${branchImpact}`}>
                        {getBranchImpactLabel(branchImpact)}
                      </span>
                    </div>

                    <p>
                      {branchImpact === "lift"
                        ? `${selectedProfile.storeName} icinde bu kategori subeyi destekliyor. Firma ortalamasina gore ${formatSignedPercent(metric.actualGap)} fark ile onde.`
                        : branchImpact === "drag"
                          ? `${selectedProfile.storeName} icinde bu kategori subeyi geri cekiyor. Firma ortalamasina gore ${formatSignedPercent(metric.actualGap)} fark ile geride ve gunluk ${formatNumber(metric.dailyNeed)} ek uretim gerekli.`
                          : `${selectedProfile.storeName} icinde bu kategori sube temposunu dengede tutuyor. Kisa takip ile kolayca yukari tasinabilir.`}
                    </p>

                    <div className="employee-analysis-impact-meta">
                      <span>Mevcut: {formatPercent(metric.actualPercent)}</span>
                      <span>Firma: {formatPercent(metric.companyAverageActualPercent)}</span>
                      <span>Ay sonu: {formatPercent(metric.projectedPercent)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="admin-card">
            <h3>Kategori Bazli Karsilastirma</h3>
            <p className="employee-analysis-section-copy">
              Calisanin mevcut hedef temposu ile firma ortalamasi ayni satirda gosterilir. Cizgiler ne kadar uzunsa kategori o kadar gucludur.
            </p>

            <div className="employee-analysis-chart-list">
              {mergedMetrics.filter((metric) => metric.hasTarget).map((metric) => {
                const employeeWidth = Math.max(0, Math.min(metric.actualPercent ?? 0, 140));
                const companyWidth = Math.max(0, Math.min(metric.companyAverageActualPercent ?? 0, 140));

                return (
                  <div key={`chart-${metric.title}`} className="employee-analysis-chart-card">
                    <div className="employee-analysis-chart-head">
                      <strong>{metric.title}</strong>
                      <span className={`employee-analysis-status employee-analysis-status-${metric.status}`}>
                        {metric.status === "good"
                          ? "Guclu"
                          : metric.status === "critical"
                            ? "Kritik"
                            : metric.status === "watch"
                              ? "Takip"
                              : "Not"}
                      </span>
                    </div>

                    <div className="employee-analysis-bar-group">
                      <div className="employee-analysis-bar-row">
                        <span>Calisan</span>
                        <div className="employee-analysis-bar-track">
                          <i className="employee-analysis-bar-fill employee-analysis-bar-fill-employee" style={{ width: `${employeeWidth}%` }} />
                        </div>
                        <strong>{formatPercent(metric.actualPercent)}</strong>
                      </div>

                      <div className="employee-analysis-bar-row">
                        <span>Firma Ort.</span>
                        <div className="employee-analysis-bar-track">
                          <i className="employee-analysis-bar-fill employee-analysis-bar-fill-company" style={{ width: `${companyWidth}%` }} />
                        </div>
                        <strong>{formatPercent(metric.companyAverageActualPercent)}</strong>
                      </div>
                    </div>

                    <div className="employee-analysis-chart-meta">
                      <span>Ay sonu: {formatPercent(metric.projectedPercent)}</span>
                      <span>Firma ay sonu: {formatPercent(metric.companyAverageProjectedPercent)}</span>
                      <span>Fark: {formatSignedPercent(metric.actualGap)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="admin-card">
            <h3>Ortalama Karsilastirma Matrisi</h3>
            <p className="employee-analysis-section-copy">
              Kategoriler, secili calisanin sube ve firma ortalamasina gore ayri kutularda listelenir. Böylece hangi alanlarin yukari tasidigi ve hangilerinin geri kaldigi tek bakista gorulur.
            </p>

            <div className="employee-analysis-comparison-grid">
              <section className="employee-analysis-comparison-card employee-analysis-comparison-card-good">
                <div className="employee-analysis-comparison-head">
                  <strong>Sube Ortalamasinin Ustunde Olan Kategoriler</strong>
                  <span>{formatNumber(aboveStoreMetrics.length)}</span>
                </div>
                <div className="employee-analysis-comparison-list">
                  {aboveStoreMetrics.length ? (
                    aboveStoreMetrics.map((metric) => (
                      <div key={`above-store-${metric.title}`} className="employee-analysis-comparison-item">
                        <strong>{metric.title}</strong>
                        <span>Tempo {formatPercent(metric.actualPercent)} | Sube farki {formatSignedPercent(metric.gap)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="employee-analysis-comparison-empty">Sube ortalamasinin uzerinde kategori yok.</p>
                  )}
                </div>
              </section>

              <section className="employee-analysis-comparison-card employee-analysis-comparison-card-good">
                <div className="employee-analysis-comparison-head">
                  <strong>Firma Ortalamasinin Ustunde Olan Kategoriler</strong>
                  <span>{formatNumber(aboveCompanyMetrics.length)}</span>
                </div>
                <div className="employee-analysis-comparison-list">
                  {aboveCompanyMetrics.length ? (
                    aboveCompanyMetrics.map((metric) => (
                      <div key={`above-company-${metric.title}`} className="employee-analysis-comparison-item">
                        <strong>{metric.title}</strong>
                        <span>Tempo {formatPercent(metric.actualPercent)} | Firma farki {formatSignedPercent(metric.gap)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="employee-analysis-comparison-empty">Firma ortalamasinin uzerinde kategori yok.</p>
                  )}
                </div>
              </section>

              <section className="employee-analysis-comparison-card employee-analysis-comparison-card-critical">
                <div className="employee-analysis-comparison-head">
                  <strong>Sube Ortalamasinin Altinda Olan Kategoriler</strong>
                  <span>{formatNumber(belowStoreMetrics.length)}</span>
                </div>
                <div className="employee-analysis-comparison-list">
                  {belowStoreMetrics.length ? (
                    belowStoreMetrics.map((metric) => (
                      <div key={`below-store-${metric.title}`} className="employee-analysis-comparison-item">
                        <strong>{metric.title}</strong>
                        <span>Tempo {formatPercent(metric.actualPercent)} | Sube farki {formatSignedPercent(metric.gap)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="employee-analysis-comparison-empty">Sube ortalamasinin altinda kategori yok.</p>
                  )}
                </div>
              </section>

              <section className="employee-analysis-comparison-card employee-analysis-comparison-card-critical">
                <div className="employee-analysis-comparison-head">
                  <strong>Firma Ortalamasinin Altinda Olan Kategoriler</strong>
                  <span>{formatNumber(belowCompanyMetrics.length)}</span>
                </div>
                <div className="employee-analysis-comparison-list">
                  {belowCompanyMetrics.length ? (
                    belowCompanyMetrics.map((metric) => (
                      <div key={`below-company-${metric.title}`} className="employee-analysis-comparison-item">
                        <strong>{metric.title}</strong>
                        <span>Tempo {formatPercent(metric.actualPercent)} | Firma farki {formatSignedPercent(metric.gap)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="employee-analysis-comparison-empty">Firma ortalamasinin altinda kategori yok.</p>
                  )}
                </div>
              </section>
            </div>
          </article>

          {targetSubMetrics.length ? (
            <article className="admin-card">
              <h3>Alt Kategori Analizi</h3>
              <p className="employee-analysis-section-copy">
                Ana kategorilerin alt kirilimlari da firma ve sube ortalamasiyla birlikte analiz edilir. Boylece hangi alt basligin calisani yukari tasidigi veya geri cektigi net gorulur.
              </p>

              <section className="employee-analysis-two-column">
                <article>
                  <h4 className="employee-analysis-subtitle">Guclu Alt Kategoriler</h4>
                  <div className="employee-analysis-metric-list">
                    {subStrengths.length ? (
                      subStrengths.map((metric) => (
                        <div key={`sub-strength-${metric.title}`} className="employee-analysis-metric-card employee-analysis-metric-card-good">
                          <div className="employee-analysis-metric-head">
                            <strong>{metric.title}</strong>
                            <span>{formatPercent(metric.actualPercent)}</span>
                          </div>
                          <p>
                            Firma ortalamasi {formatPercent(metric.companyAverageActualPercent)}, sube ortalamasi {formatPercent(metric.storeAverageActualPercent)}.
                            Firma farki {formatSignedPercent(metric.actualGap)}, sube farki {formatSignedPercent(metric.storeActualGap)}.
                          </p>
                        </div>
                      ))
                    ) : (
                      <p>Belirgin guclu alt kategori bulunamadi.</p>
                    )}
                  </div>
                </article>

                <article>
                  <h4 className="employee-analysis-subtitle">Gelismesi Gereken Alt Kategoriler</h4>
                  <div className="employee-analysis-metric-list">
                    {subDevelopmentAreas.length ? (
                      subDevelopmentAreas.map((metric) => (
                        <div key={`sub-risk-${metric.title}`} className="employee-analysis-metric-card employee-analysis-metric-card-critical">
                          <div className="employee-analysis-metric-head">
                            <strong>{metric.title}</strong>
                            <span>{formatPercent(metric.actualPercent)}</span>
                          </div>
                          <p>
                            Firma ortalamasi {formatPercent(metric.companyAverageActualPercent)}, sube ortalamasi {formatPercent(metric.storeAverageActualPercent)}.
                            Firma farki {formatSignedPercent(metric.actualGap)}, sube farki {formatSignedPercent(metric.storeActualGap)}.
                            Gunluk ihtiyac {formatNumber(metric.dailyNeed)}.
                          </p>
                        </div>
                      ))
                    ) : (
                      <p>Gelisim gerektiren alt kategori bulunamadi.</p>
                    )}
                  </div>
                </article>
              </section>
            </article>
          ) : null}

          <article className="admin-card">
            <h3>Nokta Atisi Ozet</h3>
            <div className="employee-analysis-actions">
              {developmentAreas.map((metric) => (
                <div key={`action-${metric.title}`} className="employee-analysis-action-item">
                  <strong>{metric.title}</strong>
                  <p>
                    Bugun bu alanda tempo dusuk. Bu kategori {selectedProfile.storeName} subesini geri cekiyor.
                    Firma ortalamasina yaklasmak ve subeyi yukari tasimak icin once {metric.title.toLocaleLowerCase("tr-TR")} kaleminde gunluk en az{" "}
                    {formatNumber(metric.dailyNeed)} ek uretim hedeflenmeli.
                  </p>
                </div>
              ))}
            </div>
          </article>

        </section>
      )}
    </main>
  );
}
