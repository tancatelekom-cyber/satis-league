import type { GoalActualRow, GoalStoreRow } from "./goal-actuals";

export function parseGoalPeriod(value: string): string | null {
  const text = value.trim().toLocaleLowerCase("tr-TR");
  let match = text.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:[ T].*)?$/);
  let year = match?.[1];
  let month = match?.[2];
  if (!match) {
    match = text.match(/^(?:\d{1,2}[-/.])?(\d{1,2})[-/.](\d{4})$/);
    year = match?.[2];
    month = match?.[1];
  }
  if (!year) {
    const months = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
    const named = text.match(/^(\p{L}+)\s+(\d{4})$/u);
    if (named) { year = named[2]; month = String(months.indexOf(named[1]) + 1); }
  }
  return year && month && Number(month) >= 1 && Number(month) <= 12
    ? `${year}-${month.padStart(2, "0")}` : null;
}

export function goalPeriodMatches(period: string | null | undefined, selection: string) {
  return Boolean(period && (selection.length === 4 ? period.startsWith(`${selection}-`) : period === selection));
}

export function resolveGoalReportPeriod(requested: string, current: string, available: string[]) {
  if (/^(\d{4}|\d{4}-(0[1-9]|1[0-2]))$/.test(requested)) return requested;
  const months = [...new Set(available)].sort().reverse();
  return months.includes(current) ? current : months.find(month => month <= current) ?? months[0] ?? current;
}

export function goalPeriodLabel(period: string) {
  if (period.length === 4) return `${period} · Yıllık`;
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));
}

export function aggregateGoalPersonnelYear(rows: GoalActualRow[]) {
  const groups = new Map<string, GoalActualRow>();
  for (const row of rows) {
    const key = JSON.stringify([row.personnelId || row.employeeName, row.storeName, row.mainCategory, row.subCategory]);
    const previous = groups.get(key);
    groups.set(key, previous ? { ...previous, target: previous.target === null && row.target === null ? null : (previous.target ?? 0) + (row.target ?? 0), actual: previous.actual + row.actual } : { ...row });
  }
  return [...groups.values()];
}

export function aggregateGoalStoreYear(rows: GoalStoreRow[]) {
  const groups = new Map<string, GoalStoreRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.storeCode, row.mainCategory, row.subCategory, row.separateInfo]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((items): GoalStoreRow => {
    const first = items[0];
    const targets = items.filter(row => row.target !== null);
    const average = first.companyMode === "average";
    const actualDivisor = first.actualIsPercent || average ? items.length : 1;
    const achievement = (scope: "store" | "company") => items.reduce((sum, row) => {
      const applies = row.actualCap && row.actualCap > 0 && row.actualCapScope && (scope === "company" || row.actualCapScope === "store-and-company");
      const cap = applies ? row.actualCapIsPercent ? (row.target ?? 0) * row.actualCap! / 100 : row.actualCap! : 0;
      return sum + (cap > 0 ? Math.min(row.actual, cap) : row.actual);
    }, 0) / actualDivisor;
    return {
      ...first,
      annualAchievementActual: { store: achievement("store"), company: achievement("company") },
      target: targets.length ? targets.reduce((sum, row) => sum + (row.target ?? 0), 0) / (first.targetIsPercent || average ? targets.length : 1) : null,
      actual: items.reduce((sum, row) => sum + row.actual, 0) / (first.actualIsPercent || average ? items.length : 1),
      actualCap: first.actualCapIsPercent ? first.actualCap : items.some(row => row.actualCap) ? items.reduce((sum, row) => sum + (row.actualCap ?? 0), 0) : null,
      includeProjection: false,
      fullAchievementOverride: items.every(row => row.fullAchievementOverride)
    };
  });
}
