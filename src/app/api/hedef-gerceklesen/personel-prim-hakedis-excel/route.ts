import { NextResponse } from "next/server";
import { buildCsv } from "@/lib/export/csv";
import {
  fetchGoalActualRows,
  fetchGoalDayStats,
  fetchGoalLivePrimeSettings,
  fetchGoalProductionRewardRows,
  type GoalActualRow,
  type GoalLivePrimeSettings,
  type GoalProductionRewardRow
} from "@/lib/goal-actuals";
import { createClient } from "@/lib/supabase/server";

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
  actualReward: string | null;
  nextReward: string | null;
  rows: ProductionRewardPlanRow[];
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
  monthlyDeductionCurrentDetails: Array<{
    categoryTitle: string;
    deductionPercent: number;
    deductionAmount: number;
    triggered: boolean;
  }>;
  monthlyDeductionProjectedDetails: Array<{
    categoryTitle: string;
    deductionPercent: number;
    deductionAmount: number;
    triggered: boolean;
  }>;
};

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "personel-prim-hakedis"
  );
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

function isAggregateCategoryLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return normalized === "tum kategoriler" || normalized === "tüm kategoriler";
}

function isLivePrimeCategory(title: string | null | undefined) {
  return normalizeCategoryKey(String(title ?? "")).includes("CANLI PRIM");
}

function isProductionPointCategory(title: string | null | undefined) {
  return normalizeCategoryKey(String(title ?? "")).includes("URETIM PUAN");
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

function parseRewardValueNumber(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const normalized = value.trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} TL`;
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
  const actualRewardRow = [...rewardRows].reverse().find((row) => actualPoints >= row.points) ?? null;
  const projectedRewardRow = [...rewardRows].reverse().find((row) => projectedPoints >= row.points) ?? null;
  const nextRewardRow = rewardRows.find((row) => row.points > projectedPoints) ?? null;

  return {
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
        isCurrentProjectedTier: Boolean(projectedRewardRow && projectedRewardRow.points === row.points),
        isReached: actualPoints >= row.points,
        remainingFromActual,
        dailyRequired:
          remainingFromActual > 0
            ? remainingDays > 0
              ? Math.ceil(remainingFromActual / remainingDays)
              : remainingFromActual
            : 0
      };
    })
  };
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

function resolveAccessoryBase(category: GoalCategorySummary | undefined, valueKey: "actual" | "projectedActual") {
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
  const details = rules.map((rule) => {
    const category = categories.find(
      (item) => normalizeCategoryKey(item.title) === normalizeCategoryKey(rule.categoryTitle)
    );

    if (!category) {
      return {
        categoryTitle: rule.categoryTitle,
        deductionPercent: rule.deductionPercent,
        triggered: false
      };
    }

    const comparisonValue = valueKey === "actual" ? category.actual : (category.projectedActual ?? category.actual);

    return {
      categoryTitle: rule.categoryTitle,
      deductionPercent: rule.deductionPercent,
      triggered: comparisonValue < rule.minimumValue
    };
  });

  const totalRate = Math.min(
    details.reduce((sum, detail) => (detail.triggered ? sum + detail.deductionPercent : sum), 0),
    100
  );

  return { totalRate, details };
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
  const livePrimeWorkedDays = livePrimeSettings.workedDays > 0 ? livePrimeSettings.workedDays : 0;
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
  const monthlyDeductionCurrentRate = monthlyCurrentDeduction.totalRate;
  const monthlyDeductionProjectedRate = monthlyProjectedDeduction.totalRate;
  const monthlyDeductionCurrentAmount = productionCurrentReward * (monthlyDeductionCurrentRate / 100);
  const monthlyDeductionProjectedAmount = productionProjectedReward * (monthlyDeductionProjectedRate / 100);
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
    monthlyDeductionCurrentRate,
    monthlyDeductionProjectedRate,
    monthlyDeductionCurrentAmount,
    monthlyDeductionProjectedAmount,
    monthlyNetCurrentReward,
    monthlyNetProjectedReward,
    totalCurrentReward: monthlyNetCurrentReward + livePrimeCurrentReward,
    totalProjectedReward: monthlyNetProjectedReward + livePrimeProjectedReward,
    monthlyDeductionCurrentDetails: monthlyCurrentDeduction.details.map((detail) => ({
      categoryTitle: detail.categoryTitle,
      deductionPercent: detail.deductionPercent,
      deductionAmount: detail.triggered ? productionCurrentReward * (detail.deductionPercent / 100) : 0,
      triggered: detail.triggered
    })),
    monthlyDeductionProjectedDetails: monthlyProjectedDeduction.details.map((detail) => ({
      categoryTitle: detail.categoryTitle,
      deductionPercent: detail.deductionPercent,
      deductionAmount: detail.triggered ? productionProjectedReward * (detail.deductionPercent / 100) : 0,
      triggered: detail.triggered
    }))
  } satisfies EmployeePrimeForecast;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("approval, role").eq("id", user.id).single();

  if (!profile || profile.approval !== "approved" || profile.role !== "admin") {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

  try {
    const [employeeRows, dayStats, productionRewardRows, livePrimeSettings] = await Promise.all([
      fetchGoalActualRows(),
      fetchGoalDayStats(),
      fetchGoalProductionRewardRows(),
      fetchGoalLivePrimeSettings()
    ]);

    const allFilteredEmployeeRows = employeeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));
    const allFilteredEmployeeCoreRows = allFilteredEmployeeRows.filter((row) => !isLivePrimeCategory(row.mainCategory));

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

    const rankingRows = Array.from(employeePrimeCoreMap.entries())
      .map(([employeeName, rows]) => {
        const coreSummaries = buildCategorySummaries(rows, dayStats.workedDays, dayStats.totalDays);
        const liveSummaries = buildCategorySummaries(
          employeeLivePrimeMap.get(employeeName) ?? [],
          dayStats.workedDays,
          dayStats.totalDays
        );
        const forecast = buildEmployeePrimeForecast(
          coreSummaries,
          liveSummaries,
          productionRewardRows,
          livePrimeSettings
        );

        return {
          employeeName,
          currentTotal: forecast.totalCurrentReward,
          projectedTotal: forecast.totalProjectedReward,
          productionCurrent: forecast.productionCurrentReward,
          productionProjected: forecast.productionProjectedReward,
          liveCurrent: forecast.livePrimeCurrentReward,
          liveProjected: forecast.livePrimeProjectedReward,
          accessoryCurrent: forecast.accessoryCurrentReward,
          accessoryProjected: forecast.accessoryProjectedReward,
          monthlyDeductionCurrentAmount: forecast.monthlyDeductionCurrentAmount,
          monthlyDeductionProjectedAmount: forecast.monthlyDeductionProjectedAmount,
          monthlyDeductionCurrentDetails: forecast.monthlyDeductionCurrentDetails,
          monthlyDeductionProjectedDetails: forecast.monthlyDeductionProjectedDetails
        };
      })
      .sort(
        (a, b) =>
          b.projectedTotal - a.projectedTotal ||
          b.currentTotal - a.currentTotal ||
          a.employeeName.localeCompare(b.employeeName, "tr")
      );

    const deductionCategoryTitles = Array.from(
      new Set(livePrimeSettings.monthlyPrimeDeductionRules.map((rule) => rule.categoryTitle.trim()).filter(Boolean))
    );

    const csv = buildCsv([
      [
        "Sira",
        "Calisan",
        "Toplam Prim",
        "Ay Sonu Toplam Prim",
        "Uretim Prim",
        "Ay Sonu Uretim Prim",
        "Canli Prim",
        "Ay Sonu Canli Prim",
        "Aksesuar Prim",
        "Ay Sonu Aksesuar Prim",
        "Toplam Kesinti",
        "Ay Sonu Toplam Kesinti",
        ...deductionCategoryTitles.flatMap((title) => [`${title} Kesinti`, `${title} Ay Sonu Kesinti`])
      ],
      ...rankingRows.map((row, index) => [
        String(index + 1),
        row.employeeName,
        formatCurrency(row.currentTotal),
        formatCurrency(row.projectedTotal),
        formatCurrency(row.productionCurrent),
        formatCurrency(row.productionProjected),
        formatCurrency(row.liveCurrent),
        formatCurrency(row.liveProjected),
        formatCurrency(row.accessoryCurrent),
        formatCurrency(row.accessoryProjected),
        formatCurrency(row.monthlyDeductionCurrentAmount),
        formatCurrency(row.monthlyDeductionProjectedAmount),
        ...deductionCategoryTitles.flatMap((title) => {
          const currentDetail = row.monthlyDeductionCurrentDetails.find(
            (detail) => normalizeCategoryKey(detail.categoryTitle) === normalizeCategoryKey(title)
          );
          const projectedDetail = row.monthlyDeductionProjectedDetails.find(
            (detail) => normalizeCategoryKey(detail.categoryTitle) === normalizeCategoryKey(title)
          );

          return [
            currentDetail?.triggered
              ? `%${currentDetail.deductionPercent} | ${formatCurrency(currentDetail.deductionAmount)}`
              : "-",
            projectedDetail?.triggered
              ? `%${projectedDetail.deductionPercent} | ${formatCurrency(projectedDetail.deductionAmount)}`
              : "-"
          ];
        })
      ])
    ]);

    const fileName = safeFileName(`personel-prim-hakedis-siralamasi-${new Date().toISOString().slice(0, 10)}`);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Personel prim hakediş exportu oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
