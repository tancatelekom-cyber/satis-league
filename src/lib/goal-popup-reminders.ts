import {
  fetchGoalActualRows,
  fetchGoalDayStats,
  fetchGoalProductionRewardRows,
  fetchGoalStoreRows,
  type GoalActualRow,
  type GoalProductionRewardRow,
  type GoalStoreRow
} from "@/lib/goal-actuals";
import type { PopupAnnouncementRecord } from "@/lib/popup-announcements";
import type { UserRole } from "@/lib/types";

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

type EmployeeDailyNeedSummaryRow = {
  title: string;
  groupKey: string;
  level: number;
  referenceLabel: string;
  dailyRequired: number;
};

type StoreDailyNeedCell = {
  threshold: number;
  dailyRequired: number;
};

type StoreDailyNeedSummaryRow = {
  title: string;
  groupKey: string;
  level: number;
  hasChildren: boolean;
  cells: StoreDailyNeedCell[];
};

type ProductionRewardPlanRow = {
  points: number;
  isCurrentProjectedTier: boolean;
  dailyRequired: number;
};

type ProductionRewardPlan = {
  projectedPoints: number;
  rows: ProductionRewardPlanRow[];
};

function normalizeCategoryKey(value: string | null | undefined) {
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

function normalizeStoreKey(value: string | null | undefined) {
  return normalizeCategoryKey(value);
}

function normalizeProfileIdentity(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function formatNumber(value: number) {
  return value.toLocaleString("tr-TR");
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
  return isPercent ? formatPercent(value) : formatNumber(value ?? 0);
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isEntryCount(title: string | null | undefined) {
  return normalizeCategoryKey(title).includes("GIRIS SAY");
}

function isLivePrimeCategory(title: string | null | undefined) {
  return normalizeCategoryKey(title).includes("CANLI PRIM");
}

function isProductionPointCategory(title: string | null | undefined) {
  return normalizeCategoryKey(title).includes("URETIM PUAN");
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
        ...summary
      };
    });
}

function buildCompanyRows(rows: GoalStoreRow[]) {
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
    } satisfies GoalStoreRow;
  });
}

function buildCompanyCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number): GoalCategorySummary[] {
  return buildStoreCategorySummaries(buildCompanyRows(rows), workedDays, totalDays);
}

function buildMissingCategoryLabels(categories: GoalCategorySummary[]) {
  return categories
    .filter((category) => {
      if (!category.hasTarget) {
        return false;
      }

      const referencePercent =
        category.showProjection && category.projectedPercent !== null ? category.projectedPercent : category.actualPercent;

      return (referencePercent ?? 0) < 100;
    })
    .map((category) => category.title);
}

function buildSeparateInfoPopupLines(rows: GoalStoreRow[]) {
  return rows
    .filter((row) => row.separateInfo && row.target !== null && row.target > 0 && row.actual < row.target)
    .map((row) => ({
      title: row.subCategory || row.mainCategory,
      actualLabel: formatGoalValue(row.actual, Boolean(row.actualIsPercent))
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "tr"));
}

function buildNeedRows(
  summary: Pick<GoalMetricSummary, "hasTarget" | "target" | "actual">,
  remainingDays: number
) {
  if (!summary.hasTarget || !summary.target) {
    return [];
  }

  return [80, 90, 100, 110, 120].map((threshold) => {
    const targetValue = (summary.target ?? 0) * (threshold / 100);
    const remainingTotal = Math.max(targetValue - summary.actual, 0);
    const dailyRequired =
      remainingDays > 0 ? Math.ceil(remainingTotal / remainingDays) : remainingTotal > 0 ? Math.ceil(remainingTotal) : 0;

    return {
      threshold,
      dailyRequired
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

  const projectedPoints = summary.projectedActual ?? summary.actual;
  const projectedRewardRow = [...rewardRows].reverse().find((row) => projectedPoints >= row.points) ?? null;

  return {
    projectedPoints,
    rows: rewardRows.map((row) => {
      const remainingFromActual = Math.max(row.points - summary.actual, 0);

      return {
        points: row.points,
        isCurrentProjectedTier: Boolean(projectedRewardRow && projectedRewardRow.points === row.points),
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

function buildEmployeeDailyNeedReference(
  summary: GoalCategorySummary,
  rewardRows: GoalProductionRewardRow[],
  remainingDays: number
) {
  if (!isProductionPointCategory(summary.title)) {
    const needRows = buildNeedRows(summary, remainingDays);
    const needRow =
      needRows.find((row) => row.threshold === 100 && row.dailyRequired > 0) ??
      needRows.find((row) => row.threshold === 110 && row.dailyRequired > 0) ??
      needRows.find((row) => row.threshold === 120 && row.dailyRequired > 0) ??
      needRows.find((row) => row.threshold === 120) ??
      null;

    return {
      referenceLabel: needRow ? `%${needRow.threshold} Hedef` : "%100 Hedef",
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

  const firstScaleRow = rewardPlan.rows[0];
  const projectedScaleRow = rewardPlan.rows.find((row) => row.isCurrentProjectedTier) ?? null;
  const nextScaleRow = rewardPlan.rows.find((row) => row.points > rewardPlan.projectedPoints) ?? null;
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
          const needRows = buildNeedRows(child, remainingDays);
          const needRow =
            needRows.find((row) => row.threshold === 100 && row.dailyRequired > 0) ??
            needRows.find((row) => row.threshold === 110 && row.dailyRequired > 0) ??
            needRows.find((row) => row.threshold === 120 && row.dailyRequired > 0) ??
            needRows.find((row) => row.threshold === 120) ??
            null;

          return {
            title: child.title,
            groupKey: category.title,
            level: 1,
            referenceLabel: needRow ? `%${needRow.threshold} Hedef` : "%100 Hedef",
            dailyRequired: needRow?.dailyRequired ?? 0
          } satisfies EmployeeDailyNeedSummaryRow;
        });

      return [parentRow, ...childRows];
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

function buildEmployeeZeroActualItems(rows: GoalActualRow[]) {
  const seen = new Set<string>();

  return rows
    .filter((row) => !isEntryCount(row.mainCategory) && !isLivePrimeCategory(row.mainCategory) && row.actual === 0)
    .map((row) => row.subCategory || row.mainCategory)
    .filter((label) => {
      if (seen.has(label)) {
        return false;
      }

      seen.add(label);
      return true;
    });
}

function buildStoreZeroActualItems(rows: GoalStoreRow[]) {
  const seen = new Set<string>();

  return rows
    .filter((row) => !isEntryCount(row.mainCategory) && !isLivePrimeCategory(row.mainCategory) && row.actual === 0)
    .map((row) => row.subCategory || row.mainCategory)
    .filter((label) => {
      if (seen.has(label)) {
        return false;
      }

      seen.add(label);
      return true;
    });
}

function buildCompanyZeroActualItems(rows: GoalStoreRow[]) {
  const seen = new Set<string>();

  return buildCompanyRows(rows)
    .filter((row) => !isEntryCount(row.mainCategory) && !isLivePrimeCategory(row.mainCategory) && row.actual === 0)
    .map((row) => row.subCategory || row.mainCategory)
    .filter((label) => {
      if (seen.has(label)) {
        return false;
      }

      seen.add(label);
      return true;
    });
}

function buildPopupBody(
  fullName: string,
  needLines: string[],
  separateInfoLines: string[],
  missingLabels: string[],
  zeroActualLabels: string[]
) {
  const lines: string[] = [`Sayin ${fullName},`];

  if (needLines.length > 0) {
    lines.push("Gunluk Ihtiyaclar:");
    lines.push(...needLines.map((line) => `- ${line}`));
  }

  if (separateInfoLines.length > 0) {
    lines.push("Bilgilendirme Kalemleri:");
    lines.push(...separateInfoLines.map((line) => `- ${line}`));
  }

  if (missingLabels.length > 0) {
    lines.push("HEDEFE GITMEYEN KALEMLER:");
    lines.push(...missingLabels.map((label) => `- ${label}`));
  }

  if (zeroActualLabels.length > 0) {
    lines.push("Gercekleseni sifir olan kalemler:");
    lines.push(...zeroActualLabels.map((label) => `- ${label}`));
  }

  lines.push("Detay icin Hedef Gerceklesen menusunu kontrol ediniz.");

  return lines.join("\n");
}

function toStoreNeedLines(rows: StoreDailyNeedSummaryRow[]) {
  return rows
    .filter((row) => row.level === 0)
    .map((row) => {
      const selectedNeed =
        row.cells.find((cell) => cell.threshold === 100 && cell.dailyRequired > 0) ??
        row.cells.find((cell) => cell.threshold === 110 && cell.dailyRequired > 0) ??
        row.cells.find((cell) => cell.threshold === 120 && cell.dailyRequired > 0) ??
        row.cells.find((cell) => cell.threshold === 120) ??
        null;

      return {
        title: row.title,
        dailyRequired: selectedNeed?.dailyRequired ?? 0
      };
    })
    .sort((a, b) => b.dailyRequired - a.dailyRequired || a.title.localeCompare(b.title, "tr"));
}

function toEmployeeNeedLines(rows: EmployeeDailyNeedSummaryRow[]) {
  return rows
    .filter((row) => row.level === 0)
    .sort((a, b) => b.dailyRequired - a.dailyRequired || a.title.localeCompare(b.title, "tr"));
}

export async function buildGoalReminderPopup(args: {
  role: UserRole;
  fullName: string;
  personnelId: string;
  storeName?: string | null;
}): Promise<PopupAnnouncementRecord | null> {
  const [goalActualRows, goalStoreRows, dayStats, productionRewardRows] = await Promise.all([
    fetchGoalActualRows(),
    fetchGoalStoreRows(),
    fetchGoalDayStats(),
    fetchGoalProductionRewardRows().catch(() => [])
  ]);

  const remainingDays = dayStats.remainingDays;

  if (args.role === "employee") {
    const employeeRows = goalActualRows.filter(
      (row) =>
        normalizeProfileIdentity(row.personnelId) === normalizeProfileIdentity(args.personnelId) &&
        !isLivePrimeCategory(row.mainCategory)
    );

    if (!employeeRows.length) {
      return null;
    }

    const categorySummaries = buildCategorySummaries(employeeRows, dayStats.workedDays, dayStats.totalDays);
    const dailyNeedRows = toEmployeeNeedLines(
      buildEmployeeDailyNeedSummaryRows(categorySummaries, remainingDays, productionRewardRows)
    );
    const missingLabels = buildMissingCategoryLabels(categorySummaries);
    const zeroActualLabels = buildEmployeeZeroActualItems(employeeRows);

    if (!dailyNeedRows.length && !zeroActualLabels.length) {
      return null;
    }

    return {
      id: `goal-reminder-${args.role}-${args.personnelId}`,
      title: "Gunluk Ihtiyaclar",
      body: buildPopupBody(
        args.fullName,
        dailyNeedRows.map((row) => `${row.title}: ${row.dailyRequired > 0 ? formatNumber(row.dailyRequired) : "Tamamlandi"}`),
        [],
        missingLabels,
        zeroActualLabels
      ),
      link_url: "/hedef-gerceklesen",
      image_path: null,
      imageUrl: null,
      target_mode: "role",
      target_roles: ["employee"],
      target_profile_ids: [],
      show_from: new Date().toISOString(),
      show_until: new Date().toISOString(),
      is_active: true,
      created_at: new Date().toISOString()
    };
  }

  if (args.role === "manager") {
    const scopedStoreRows = goalStoreRows.filter(
      (row) => normalizeStoreKey(row.storeCode) === normalizeStoreKey(args.storeName) && !isLivePrimeCategory(row.mainCategory)
    );

    if (!scopedStoreRows.length) {
      return null;
    }

    const activeStoreRows = scopedStoreRows.filter((row) => !row.separateInfo);
    const separateInfoLines = buildSeparateInfoPopupLines(scopedStoreRows).map(
      (row) => `${row.title}: mevcut gerceklesen ${row.actualLabel}. Bu alani gelistirmen gerekli.`
    );
    const categorySummaries = buildStoreCategorySummaries(activeStoreRows, dayStats.workedDays, dayStats.totalDays);
    const dailyNeedRows = toStoreNeedLines(buildStoreDailyNeedSummaryRows(categorySummaries, remainingDays));
    const missingLabels = buildMissingCategoryLabels(categorySummaries);
    const zeroActualLabels = buildStoreZeroActualItems(activeStoreRows);

    if (!dailyNeedRows.length && !zeroActualLabels.length && !separateInfoLines.length) {
      return null;
    }

    return {
      id: `goal-reminder-${args.role}-${normalizeStoreKey(args.storeName)}`,
      title: "Gunluk Ihtiyaclar",
      body: buildPopupBody(
        args.fullName,
        dailyNeedRows.map((row) => `${row.title}: ${row.dailyRequired > 0 ? formatNumber(row.dailyRequired) : "Tamamlandi"}`),
        separateInfoLines,
        missingLabels,
        zeroActualLabels
      ),
      link_url: "/hedef-gerceklesen",
      image_path: null,
      imageUrl: null,
      target_mode: "role",
      target_roles: ["manager"],
      target_profile_ids: [],
      show_from: new Date().toISOString(),
      show_until: new Date().toISOString(),
      is_active: true,
      created_at: new Date().toISOString()
    };
  }

  const scopedCompanyRows = goalStoreRows.filter((row) => !isLivePrimeCategory(row.mainCategory));
  const companyRows = scopedCompanyRows.filter((row) => !row.separateInfo);
  const companySeparateInfoLines = buildSeparateInfoPopupLines(buildCompanyRows(scopedCompanyRows.filter((row) => row.separateInfo))).map(
    (row) => `${row.title}: mevcut gerceklesen ${row.actualLabel}. Bu alani gelistirmen gerekli.`
  );
  const companySummaries = buildCompanyCategorySummaries(companyRows, dayStats.workedDays, dayStats.totalDays);
  const dailyNeedRows = toStoreNeedLines(buildStoreDailyNeedSummaryRows(companySummaries, remainingDays));
  const missingLabels = buildMissingCategoryLabels(companySummaries);
  const zeroActualLabels = buildCompanyZeroActualItems(companyRows);

  if (!dailyNeedRows.length && !zeroActualLabels.length && !companySeparateInfoLines.length) {
    return null;
  }

  return {
    id: `goal-reminder-${args.role}-company`,
    title: "Gunluk Ihtiyaclar",
    body: buildPopupBody(
      args.fullName,
      dailyNeedRows.map((row) => `${row.title}: ${row.dailyRequired > 0 ? formatNumber(row.dailyRequired) : "Tamamlandi"}`),
      companySeparateInfoLines,
      missingLabels,
      zeroActualLabels
    ),
    link_url: "/hedef-gerceklesen",
    image_path: null,
    imageUrl: null,
    target_mode: "role",
    target_roles: args.role === "admin" ? ["admin"] : ["management"],
    target_profile_ids: [],
    show_from: new Date().toISOString(),
    show_until: new Date().toISOString(),
    is_active: true,
    created_at: new Date().toISOString()
  };
}
