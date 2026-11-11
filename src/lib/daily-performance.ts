import type { GoalActualRow } from "./goal-actuals";

export type DailyPerformanceRow = { store: string; category: string; subCategory: string; personnelId: string; name: string; days: (number | null)[]; monthlyTarget: number | null; leaveDays?: number[] };
export const performanceKey = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/İ/g, "I");
function csvRows(text: string) {
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(value); value = ""; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(value); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); } return rows;
}
export function parseDailyPerformance(text: string): DailyPerformanceRow[] {
  const [header = [], ...rows] = csvRows(text);
  const columns = header.slice(6, 37).map((label, index) => ({ index: index + 6, day: Number(label.trim()) })).filter(item => Number.isInteger(item.day) && item.day >= 1 && item.day <= 31);
  return rows.flatMap(row => {
    const [store, category, subCategory, personnelId, , name] = row.map(value => value.trim().replace(/\s+/g, " "));
    if (!store || !category || !personnelId || !name) return [];
    const days: (number | null)[] = Array(31).fill(null);
    for (const { index, day } of columns) {
      const raw = (row[index] ?? '').trim();
      const value = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
      days[day - 1] = raw && Number.isFinite(value) ? value : null;
    }
    return [{ store, category, subCategory, personnelId, name, days, monthlyTarget: null }];
  });
}
export function attachPerformanceTargets(rows: DailyPerformanceRow[], targets: GoalActualRow[]) {
  return rows.map(row => {
    const matches = targets.filter(target => target.personnelId === row.personnelId && performanceKey(target.storeName) === performanceKey(row.store) && performanceKey(target.mainCategory) === performanceKey(row.category) && performanceKey(target.subCategory) === performanceKey(row.subCategory));
    // SOL is labelled TOPLAM SOL in the personnel target sheet.
    const candidates = matches.length ? matches : performanceKey(row.subCategory) === 'SOL' ? targets.filter(target => target.personnelId === row.personnelId && performanceKey(target.storeName) === performanceKey(row.store) && performanceKey(target.mainCategory) === performanceKey(row.category) && performanceKey(target.subCategory) === 'TOPLAM SOL') : [];
    const monthlyTarget = candidates.length === 1 && (candidates[0].target ?? 0) > 0 ? candidates[0].target : null;
    return { ...row, monthlyTarget };
  });
}
export function remainingPerformanceWorkDays(daysInMonth: number, day: number, leaveDays: number[] = []) {
  const calendarDays = Math.max(0, daysInMonth - day + 1);
  const knownLeave = new Set(leaveDays.filter(value => value >= day && value <= daysInMonth)).size;
  return Math.max(0, calendarDays - Math.max(Math.floor(calendarDays / 7), knownLeave));
}

export function dailyPerformanceSeries(rows: DailyPerformanceRow[], daysInMonth: number, throughDay: number) {
  const completeTargets = rows.length > 0 && rows.every(row => row.monthlyTarget !== null && row.monthlyTarget > 0);
  const cumulative = rows.map(() => 0);
  let completeHistory = true;
  return Array.from({ length: Math.max(0, Math.min(daysInMonth, throughDay)) }, (_, index) => {
    const remainingDays = daysInMonth - index;
    // Determine the day's requirement before including that day's sales.
    const remainingTarget = completeTargets && completeHistory
      ? rows.reduce((sum, row, rowIndex) => sum + Math.max(0, row.monthlyTarget! - cumulative[rowIndex]), 0)
      : null;
    const workDays = rows.map(row => remainingPerformanceWorkDays(daysInMonth, index + 1, row.leaveDays));
    const onLeave = rows.length > 0 && rows.every(row => row.leaveDays?.includes(index + 1));
    const hasUnavailableWorkDays = rows.some((row, rowIndex) => workDays[rowIndex] === 0 && Math.max(0, (row.monthlyTarget ?? 0) - cumulative[rowIndex]) > 0);
    const dailyTarget = remainingTarget === null || hasUnavailableWorkDays ? null : rows.reduce((sum, row, rowIndex) => {
      if (row.leaveDays?.includes(index + 1) || workDays[rowIndex] === 0) return sum;
      return sum + Math.max(0, row.monthlyTarget! - cumulative[rowIndex]) / workDays[rowIndex];
    }, 0);
    const minWorkDays = workDays.length ? Math.min(...workDays) : 0;
    const maxWorkDays = workDays.length ? Math.max(...workDays) : 0;
    const remainingWorkDays = minWorkDays === maxWorkDays ? String(minWorkDays) : `${minWorkDays}–${maxWorkDays}`;
    const completeActual = rows.length > 0 && rows.every(row => row.days[index] != null);
    const actual = completeActual ? rows.reduce((sum, row) => sum + row.days[index]!, 0) : null;
    rows.forEach((row, rowIndex) => { if (row.days[index] != null) cumulative[rowIndex] += row.days[index]!; });
    if (!completeActual) completeHistory = false;
    return { day: index + 1, actual, target: dailyTarget, remainingTarget, remainingDays, remainingWorkDays, onLeave,
      targetMet: remainingTarget === 0,
      percent: actual !== null && dailyTarget !== null && dailyTarget > 0 ? actual / dailyTarget * 100 : null };
  });
}
export async function fetchDailyPerformance() {
  const response = await fetch('https://docs.google.com/spreadsheets/d/1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA/export?format=csv&gid=1697882201', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Günlük performans verisi okunamadı.');
  return parseDailyPerformance(await response.text());
}
