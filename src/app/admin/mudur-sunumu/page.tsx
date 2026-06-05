import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { ManagerPresentation } from "@/components/admin/manager-presentation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { fetchGoalActualRows, fetchGoalDayStats, fetchGoalStoreRows, type GoalActualRow, type GoalDayStats, type GoalStoreRow } from "@/lib/goal-actuals";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type MetricSummary = {
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

type FocusItem = {
  owner: string;
  metric: string;
  actual: number;
  target: number | null;
  projectedPercent: number | null;
  remaining: number | null;
  dailyNeed: number;
  action: string;
  note: string;
};

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
};

type HealthSnapshot = {
  owner: string;
  averagePercent: number;
  belowTargetCount: number;
  primaryRisk: string;
  strongestMetric: string;
};

type PresentationCategoryTableRow = {
  label: string;
  target: number | null;
  actual: number;
  remaining: number | null;
  actualPercent: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
  dailyNeeds: Array<{
    threshold: number;
    dailyRequired: number;
  }>;
};

type PresentationCategoryTable = {
  audience: "store" | "employee";
  title: string;
  rows: PresentationCategoryTableRow[];
  totalRow: PresentationCategoryTableRow;
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

function isAggregateCategoryLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return normalized === "tum kategoriler" || normalized === "tüm kategoriler" || normalized === "tã¼m kategoriler";
}

function isEntryCount(title: string) {
  return normalizeCategoryKey(title).includes("GIRIS SAY");
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function buildEmployeeMetricSummary(rows: GoalActualRow[], workedDays: number, totalDays: number): MetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const projectedActual = workedDays > 0 ? Math.floor((actual / workedDays) * totalDays) : actual;
  const hasTarget = totalTarget > 0;

  return {
    title: rows[0]?.mainCategory ?? "Genel",
    target: hasTarget ? totalTarget : null,
    actual,
    actualPercent: hasTarget ? (actual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - actual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection: true
  };
}

function buildStoreMetricSummary(rows: GoalStoreRow[], workedDays: number, totalDays: number): MetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = totalTarget > 0;
  const showProjection = rows.every((row) => row.includeProjection);
  const projectedActual = showProjection
    ? workedDays > 0
      ? Math.floor((actual / workedDays) * totalDays)
      : actual
    : null;

  return {
    title: rows[0]?.mainCategory ?? "Genel",
    target: hasTarget ? totalTarget : null,
    actual,
    actualPercent: hasTarget ? (actual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - actual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget && projectedActual !== null ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection
  };
}

function buildEmployeeCategorySummaries(rows: GoalActualRow[], workedDays: number, totalDays: number) {
  const map = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = map.get(row.mainCategory) ?? [];
    current.push(row);
    map.set(row.mainCategory, current);
  });

  return Array.from(map.entries())
    .map(([title, categoryRows]) => ({ ...buildEmployeeMetricSummary(categoryRows, workedDays, totalDays), title }))
    .sort((left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0));
}

function buildStoreCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number) {
  const map = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const current = map.get(row.mainCategory) ?? [];
    current.push(row);
    map.set(row.mainCategory, current);
  });

  return Array.from(map.entries())
    .map(([title, categoryRows]) => ({ ...buildStoreMetricSummary(categoryRows, workedDays, totalDays), title }))
    .sort((left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0));
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
      includeProjection: first.includeProjection,
      companyMode: first.companyMode
    } satisfies GoalStoreRow;
  });
}

function buildCompanyCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number) {
  const companyRows = buildCompanyRows(rows);
  const map = new Map<string, GoalStoreRow[]>();

  companyRows.forEach((row) => {
    const current = map.get(row.mainCategory) ?? [];
    current.push(row);
    map.set(row.mainCategory, current);
  });

  return Array.from(map.entries())
    .map(([title, categoryRows]) => ({ ...buildStoreMetricSummary(categoryRows, workedDays, totalDays), title }))
    .sort((left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0));
}

function buildActionLabel(metricTitle: string, dailyNeed: number, ownerKind: "store" | "employee" | "company") {
  const normalized = normalizeCategoryKey(metricTitle);

  if (normalized.includes("AKTIVASYON")) {
    return `${ownerKind === "employee" ? "Gunluk aktivasyon hedefi" : "Vardiya bazli aktivasyon hedefi"} netlestirilsin, gunde en az ${formatNumber(dailyNeed)} aktivasyon icin anlik takip yapilsin.`;
  }

  if (normalized.includes("TERMINAL")) {
    return `Terminal teklifleri kasa akisi icine yerlestirilsin, gunde en az ${formatNumber(dailyNeed)} ek cikis zorlanmali.`;
  }

  if (normalized.includes("CIRO") || normalized.includes("KARLILIK")) {
    return `Sepet buyutme ve premium yonlendirme ile gunde en az ${formatNumber(dailyNeed)} ek uretim alinmali.`;
  }

  if (normalized.includes("AYIN URUN")) {
    return `Ayin urunu vitrin ve bire bir yonlendirme ile her gun en az ${formatNumber(dailyNeed)} adet desteklenmeli.`;
  }

  if (normalized.includes("REKONTRATLAMA")) {
    return `Rekontrat listesi vardiya basi paylasilsin, gunde en az ${formatNumber(dailyNeed)} kontrat kapatilmasi takip edilmeli.`;
  }

  return `Kalan gunlerde her gun en az ${formatNumber(dailyNeed)} ek uretim alinacak mikro hedef tanimlansin.`;
}

function toFocusItem(
  owner: string,
  metric: MetricSummary,
  remainingDays: number,
  ownerKind: "store" | "employee" | "company"
): FocusItem | null {
  if (!metric.hasTarget || isEntryCount(metric.title)) {
    return null;
  }

  const score = metric.projectedPercent ?? metric.actualPercent;
  if (score === null || score >= 100) {
    return null;
  }

  const dailyNeed = remainingDays > 0 && metric.remaining !== null ? Math.ceil(metric.remaining / remainingDays) : metric.remaining ?? 0;

  return {
    owner,
    metric: metric.title,
    actual: metric.actual,
    target: metric.target,
    projectedPercent: score,
    remaining: metric.remaining,
    dailyNeed,
    action: buildActionLabel(metric.title, dailyNeed, ownerKind),
    note: `Gerceklesen ${formatNumber(metric.actual)} / Hedef ${formatNumber(metric.target)} / Ay sonu ${formatPercent(score)}`
  };
}

function buildStoreFocusItems(rows: GoalStoreRow[], workedDays: number, totalDays: number, remainingDays: number) {
  const storeMap = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const current = storeMap.get(row.storeCode) ?? [];
    current.push(row);
    storeMap.set(row.storeCode, current);
  });

  return Array.from(storeMap.entries())
    .map(([storeCode, storeRows]) => {
      const criticalMetric = buildStoreCategorySummaries(storeRows, workedDays, totalDays)
        .map((metric) => toFocusItem(storeCode, metric, remainingDays, "store"))
        .find(Boolean);
      return criticalMetric ?? null;
    })
    .filter((item): item is FocusItem => Boolean(item))
    .sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0))
    .slice(0, 8);
}

function buildEmployeeFocusItems(rows: GoalActualRow[], workedDays: number, totalDays: number, remainingDays: number) {
  const employeeMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  return Array.from(employeeMap.entries())
    .map(([employeeName, employeeRows]) => {
      const criticalMetric = buildEmployeeCategorySummaries(employeeRows, workedDays, totalDays)
        .map((metric) => toFocusItem(employeeName, metric, remainingDays, "employee"))
        .find(Boolean);
      return criticalMetric ?? null;
    })
    .filter((item): item is FocusItem => Boolean(item))
    .sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0))
    .slice(0, 10);
}

function buildCompanyFocusItems(rows: GoalStoreRow[], workedDays: number, totalDays: number, remainingDays: number) {
  return buildCompanyCategorySummaries(rows, workedDays, totalDays)
    .map((metric) => toFocusItem("Firma", metric, remainingDays, "company"))
    .filter((item): item is FocusItem => Boolean(item))
    .sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0));
}

function buildZeroActualItems(rows: GoalStoreRow[]) {
  const seen = new Set<string>();

  return buildCompanyRows(rows)
    .filter((row) => !isEntryCount(row.mainCategory) && row.actual === 0)
    .map((row) => row.subCategory || row.mainCategory)
    .filter((label) => {
      if (seen.has(label)) {
        return false;
      }

      seen.add(label);
      return true;
    });
}

function buildSummaryCards(dayStats: GoalDayStats, storeFocusItems: FocusItem[], employeeFocusItems: FocusItem[], companyFocusItems: FocusItem[], zeroItems: string[]) {
  return [
    {
      label: "Calisilan Gun",
      value: formatNumber(dayStats.workedDays),
      detail: "Ay icinde gerceklesen calisma gunu."
    },
    {
      label: "Kalan Gun",
      value: formatNumber(dayStats.remainingDays),
      detail: "Mudur aksiyonlari icin kalan sure."
    },
    {
      label: "Riskli Magaza",
      value: formatNumber(storeFocusItems.length),
      detail: "Acil takip gerektiren magaza sayisi."
    },
    {
      label: "Riskli Calisan",
      value: formatNumber(employeeFocusItems.length),
      detail: "Hedef temposu kritik seviyede olan calisan."
    },
    {
      label: "Firma Kritik Kalem",
      value: formatNumber(companyFocusItems.length),
      detail: "Firma genelinde hedef altinda kalan ana kategori."
    },
    {
      label: "Sifir Gerceklesen",
      value: formatNumber(zeroItems.length),
      detail: "Firma genelinde hic hareket almayan kalem."
    }
  ] satisfies SummaryCard[];
}

function buildManagerActionLines(storeFocusItems: FocusItem[], employeeFocusItems: FocusItem[], companyFocusItems: FocusItem[], zeroItems: string[]) {
  const lines: string[] = [];

  companyFocusItems.slice(0, 3).forEach((item) => {
    lines.push(`${item.metric}: ${item.action}`);
  });

  storeFocusItems.slice(0, 3).forEach((item) => {
    lines.push(`${item.owner} / ${item.metric}: ${item.action}`);
  });

  employeeFocusItems.slice(0, 2).forEach((item) => {
    lines.push(`${item.owner} / ${item.metric}: bire bir takip yapilsin, gunde en az ${formatNumber(item.dailyNeed)} ek uretim istenmeli.`);
  });

  if (zeroItems.length) {
    lines.push(`Sifir gerceklesen kalemler: ${zeroItems.join(", ")}. Bu alanlar gun icinde kontrol listesine zorunlu yazilmali.`);
  }

  return lines;
}

function buildNeedTargets(target: number | null, actual: number, remainingDays: number) {
  if (!target) {
    return [90, 100, 110, 120].map((threshold) => ({
      threshold,
      dailyRequired: 0
    }));
  }

  return [90, 100, 110, 120].map((threshold) => {
    const thresholdTarget = target * (threshold / 100);
    const remainingTotal = Math.max(thresholdTarget - actual, 0);

    return {
      threshold,
      dailyRequired: remainingDays > 0 ? Math.ceil(remainingTotal / remainingDays) : Math.ceil(remainingTotal)
    };
  });
}

function buildStoreCategoryTables(rows: GoalStoreRow[], workedDays: number, totalDays: number, remainingDays: number) {
  const categoryMap = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const current = categoryMap.get(row.mainCategory) ?? [];
    current.push(row);
    categoryMap.set(row.mainCategory, current);
  });

  const companySummaries = buildCompanyCategorySummaries(rows, workedDays, totalDays);

  return Array.from(categoryMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "tr"))
    .map(([title, categoryRows]) => {
      const storeMap = new Map<string, GoalStoreRow[]>();

      categoryRows.forEach((row) => {
        const current = storeMap.get(row.storeCode) ?? [];
        current.push(row);
        storeMap.set(row.storeCode, current);
      });

      const rowsForTable = Array.from(storeMap.entries())
        .map(([label, storeRows]) => {
          const summary = buildStoreMetricSummary(storeRows, workedDays, totalDays);

          return {
            label,
            target: summary.target,
            actual: summary.actual,
            remaining: summary.remaining,
            actualPercent: summary.actualPercent,
            projectedActual: summary.projectedActual,
            projectedPercent: summary.projectedPercent,
            dailyNeeds: buildNeedTargets(summary.target, summary.actual, remainingDays)
          } satisfies PresentationCategoryTableRow;
        })
        .sort((left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0));

      const companySummary = companySummaries.find((item) => item.title === title);
      const totalRow = {
        label: "FIRMA",
        target: companySummary?.target ?? null,
        actual: companySummary?.actual ?? 0,
        remaining: companySummary?.remaining ?? null,
        actualPercent: companySummary?.actualPercent ?? null,
        projectedActual: companySummary?.projectedActual ?? null,
        projectedPercent: companySummary?.projectedPercent ?? null,
        dailyNeeds: buildNeedTargets(companySummary?.target ?? null, companySummary?.actual ?? 0, remainingDays)
      } satisfies PresentationCategoryTableRow;

      return {
        audience: "store",
        title,
        rows: rowsForTable,
        totalRow
      } satisfies PresentationCategoryTable;
    });
}

function buildEmployeeCategoryTables(rows: GoalActualRow[], workedDays: number, totalDays: number, remainingDays: number) {
  const categoryMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = categoryMap.get(row.mainCategory) ?? [];
    current.push(row);
    categoryMap.set(row.mainCategory, current);
  });

  return Array.from(categoryMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "tr"))
    .map(([title, categoryRows]) => {
      const employeeMap = new Map<string, GoalActualRow[]>();

      categoryRows.forEach((row) => {
        const current = employeeMap.get(row.employeeName) ?? [];
        current.push(row);
        employeeMap.set(row.employeeName, current);
      });

      const rowsForTable = Array.from(employeeMap.entries())
        .map(([label, employeeRows]) => {
          const summary = buildEmployeeMetricSummary(employeeRows, workedDays, totalDays);

          return {
            label,
            target: summary.target,
            actual: summary.actual,
            remaining: summary.remaining,
            actualPercent: summary.actualPercent,
            projectedActual: summary.projectedActual,
            projectedPercent: summary.projectedPercent,
            dailyNeeds: buildNeedTargets(summary.target, summary.actual, remainingDays)
          } satisfies PresentationCategoryTableRow;
        })
        .sort((left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0));

      const totalSummary = buildEmployeeMetricSummary(categoryRows, workedDays, totalDays);
      const totalRow = {
        label: "TOPLAM",
        target: totalSummary.target,
        actual: totalSummary.actual,
        remaining: totalSummary.remaining,
        actualPercent: totalSummary.actualPercent,
        projectedActual: totalSummary.projectedActual,
        projectedPercent: totalSummary.projectedPercent,
        dailyNeeds: buildNeedTargets(totalSummary.target, totalSummary.actual, remainingDays)
      } satisfies PresentationCategoryTableRow;

      return {
        audience: "employee",
        title,
        rows: rowsForTable,
        totalRow
      } satisfies PresentationCategoryTable;
    });
}

function buildStoreHealthSnapshots(rows: GoalStoreRow[], workedDays: number, totalDays: number) {
  const storeMap = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const current = storeMap.get(row.storeCode) ?? [];
    current.push(row);
    storeMap.set(row.storeCode, current);
  });

  return Array.from(storeMap.entries())
    .map(([owner, storeRows]) => {
      const metrics = buildStoreCategorySummaries(storeRows, workedDays, totalDays).filter((metric) => metric.hasTarget && !isEntryCount(metric.title));
      const scores = metrics.map((metric) => metric.projectedPercent ?? metric.actualPercent ?? 0).filter((value) => value > 0);
      const sortedMetrics = [...metrics].sort(
        (left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0)
      );
      const strongest = [...metrics].sort(
        (left, right) => (right.projectedPercent ?? right.actualPercent ?? 0) - (left.projectedPercent ?? left.actualPercent ?? 0)
      )[0];

      return {
        owner,
        averagePercent: average(scores),
        belowTargetCount: metrics.filter((metric) => (metric.projectedPercent ?? metric.actualPercent ?? 0) < 100).length,
        primaryRisk: sortedMetrics[0]?.title ?? "-",
        strongestMetric: strongest?.title ?? "-"
      } satisfies HealthSnapshot;
    })
    .filter((item) => item.averagePercent > 0);
}

function buildEmployeeHealthSnapshots(rows: GoalActualRow[], workedDays: number, totalDays: number) {
  const employeeMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  return Array.from(employeeMap.entries())
    .map(([owner, employeeRows]) => {
      const metrics = buildEmployeeCategorySummaries(employeeRows, workedDays, totalDays).filter((metric) => metric.hasTarget && !isEntryCount(metric.title));
      const scores = metrics.map((metric) => metric.projectedPercent ?? metric.actualPercent ?? 0).filter((value) => value > 0);
      const sortedMetrics = [...metrics].sort(
        (left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0)
      );
      const strongest = [...metrics].sort(
        (left, right) => (right.projectedPercent ?? right.actualPercent ?? 0) - (left.projectedPercent ?? left.actualPercent ?? 0)
      )[0];

      return {
        owner,
        averagePercent: average(scores),
        belowTargetCount: metrics.filter((metric) => (metric.projectedPercent ?? metric.actualPercent ?? 0) < 100).length,
        primaryRisk: sortedMetrics[0]?.title ?? "-",
        strongestMetric: strongest?.title ?? "-"
      } satisfies HealthSnapshot;
    })
    .filter((item) => item.averagePercent > 0);
}

export default async function ManagerBriefingPage() {
  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  let employeeRows: GoalActualRow[] = [];
  let storeRows: GoalStoreRow[] = [];
  let dayStats: GoalDayStats = EMPTY_DAYS;
  let errorMessage = "";

  try {
    [employeeRows, storeRows, dayStats] = await Promise.all([fetchGoalActualRows(), fetchGoalStoreRows(), fetchGoalDayStats()]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Hedef gerceklesen verisi okunamadi.";
  }

  const filteredEmployeeRows = employeeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));
  const filteredStoreRows = storeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));
  const storeFocusItems = buildStoreFocusItems(filteredStoreRows, dayStats.workedDays, dayStats.totalDays, dayStats.remainingDays);
  const employeeFocusItems = buildEmployeeFocusItems(filteredEmployeeRows, dayStats.workedDays, dayStats.totalDays, dayStats.remainingDays);
  const companyFocusItems = buildCompanyFocusItems(filteredStoreRows, dayStats.workedDays, dayStats.totalDays, dayStats.remainingDays);
  const zeroItems = buildZeroActualItems(filteredStoreRows);
  const summaryCards = buildSummaryCards(dayStats, storeFocusItems, employeeFocusItems, companyFocusItems, zeroItems);
  const actionLines = buildManagerActionLines(storeFocusItems, employeeFocusItems, companyFocusItems, zeroItems);
  const storeHealthSnapshots = buildStoreHealthSnapshots(filteredStoreRows, dayStats.workedDays, dayStats.totalDays);
  const employeeHealthSnapshots = buildEmployeeHealthSnapshots(filteredEmployeeRows, dayStats.workedDays, dayStats.totalDays);
  const topStores = [...storeHealthSnapshots].sort((left, right) => right.averagePercent - left.averagePercent).slice(0, 4);
  const riskStores = [...storeHealthSnapshots].sort((left, right) => left.averagePercent - right.averagePercent).slice(0, 4);
  const topEmployees = [...employeeHealthSnapshots].sort((left, right) => right.averagePercent - left.averagePercent).slice(0, 4);
  const riskEmployees = [...employeeHealthSnapshots].sort((left, right) => left.averagePercent - right.averagePercent).slice(0, 4);
  const storeCategoryTables = buildStoreCategoryTables(filteredStoreRows, dayStats.workedDays, dayStats.totalDays, dayStats.remainingDays);
  const employeeCategoryTables = buildEmployeeCategoryTables(
    filteredEmployeeRows,
    dayStats.workedDays,
    dayStats.totalDays,
    dayStats.remainingDays
  );
  const strongestCompanyMetric =
    buildCompanyCategorySummaries(filteredStoreRows, dayStats.workedDays, dayStats.totalDays)
      .filter((metric) => metric.hasTarget && !isEntryCount(metric.title))
      .sort((left, right) => (right.projectedPercent ?? right.actualPercent ?? 0) - (left.projectedPercent ?? left.actualPercent ?? 0))[0] ?? null;
  const generatedAt = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
  const companyNarrative = companyFocusItems.length
    ? `Firma genelinde ${companyFocusItems.length} ana kategori hedef temposunun altinda. En iyi korunan alan ${
        strongestCompanyMetric?.title ?? "belirsiz"
      }, en kritik alan ise ${companyFocusItems[0]?.metric ?? "belirsiz"}.`
    : "Firma genelinde belirgin hedef riski gorunmuyor. Mevcut tempo korunursa hedef kapanisi destekleniyor.";

  return (
    <main>
      {errorMessage ? <div className="message-box error-box">{errorMessage}</div> : null}

      <ManagerPresentation
        actionLines={actionLines}
        companyFocusItems={companyFocusItems}
        companyNarrative={companyNarrative}
        employeeFocusItems={employeeFocusItems}
        generatedAt={generatedAt}
        riskEmployees={riskEmployees}
        riskStores={riskStores}
        storeFocusItems={storeFocusItems}
        summaryCards={summaryCards}
        topEmployees={topEmployees}
        topStores={topStores}
        storeCategoryTables={storeCategoryTables}
        employeeCategoryTables={employeeCategoryTables}
        zeroItems={zeroItems}
      />
    </main>
  );
}
