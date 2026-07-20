import type { GoalDayStats, GoalStoreRow } from "@/lib/goal-actuals";

function normalizeKey(value: string) {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");
}

function isDashboardCategory(title: string) {
  const normalized = normalizeKey(title);
  return (
    normalized !== "TUM KATEGORILER" &&
    normalized !== "AKSESUAR CIRO" &&
    !normalized.includes("GIRIS SAY") &&
    !normalized.includes("WEB KONTOR")
  );
}

function aggregateCompanyRows(rows: GoalStoreRow[]) {
  const groups = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const key = `${row.mainCategory}__${row.subCategory}`;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  });

  return Array.from(groups.values()).map((group) => {
    const first = group[0];
    const actualValues = group.map((row) => row.actual);
    const targetValues = group.map((row) => row.target).filter((value): value is number => value !== null && value > 0);
    const aggregate = (values: number[]) =>
      first.companyMode === "average"
        ? values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0
        : values.reduce((sum, value) => sum + value, 0);

    return {
      ...first,
      storeCode: "Firma",
      target: targetValues.length ? aggregate(targetValues) : null,
      actual: aggregate(actualValues)
    };
  });
}

function calculateCategorySuccess(rows: GoalStoreRow[], dayStats: GoalDayStats) {
  const categoryGroups = new Map<string, GoalStoreRow[]>();

  rows
    .filter((row) => !row.separateInfo && isDashboardCategory(row.mainCategory))
    .forEach((row) => {
      const current = categoryGroups.get(row.mainCategory) ?? [];
      current.push(row);
      categoryGroups.set(row.mainCategory, current);
    });

  const percentages = Array.from(categoryGroups.values())
    .map((categoryRows) => {
      const target = categoryRows.reduce((sum, row) => sum + (row.target ?? 0), 0);
      if (target <= 0) return null;

      const actual = categoryRows.reduce((sum, row) => sum + row.actual, 0);
      const canProject = categoryRows.every((row) => row.includeProjection);
      const projected = canProject && dayStats.workedDays > 0
        ? Math.floor((actual / dayStats.workedDays) * dayStats.totalDays)
        : actual;
      return (projected / target) * 100;
    })
    .filter((value): value is number => value !== null);

  const successfulCount = percentages.filter((percent) => percent >= 100).length;
  return percentages.length > 0 ? (successfulCount / percentages.length) * 100 : 0;
}

export function calculateStoreDashboardSuccess(rows: GoalStoreRow[], dayStats: GoalDayStats, storeName: string) {
  const normalizedStore = normalizeKey(storeName);
  return calculateCategorySuccess(
    rows.filter((row) => normalizeKey(row.storeCode) === normalizedStore),
    dayStats
  );
}

export function calculateCompanyDashboardSuccess(rows: GoalStoreRow[], dayStats: GoalDayStats) {
  const dashboardRows = rows.filter((row) => !row.separateInfo && normalizeKey(row.mainCategory) !== "TUM KATEGORILER");
  return calculateCategorySuccess(aggregateCompanyRows(dashboardRows), dayStats);
}
