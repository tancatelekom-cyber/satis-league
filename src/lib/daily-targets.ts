export const DAILY_TARGET_SHEET_ID = "1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA";
export const DAILY_TARGET_SHEET_GID = "1001769940";

export type DailyTargetEntryMode = "editable" | "summary";

export type DailyTargetDefinition = {
  branchName: string;
  mainCategory: string;
  subCategory: string;
  target: number | null;
  entryMode: DailyTargetEntryMode;
};

export type DailyTargetActualRecord = {
  store_id: string;
  main_category: string;
  sub_category: string;
  actual: number | string | null;
};

export type DailyTargetViewRow = DailyTargetDefinition & {
  actual: number;
  remaining: number | null;
  achieved: boolean | null;
  inputName: string | null;
};

export type DailyTargetGroup = {
  mainCategory: string;
  rows: DailyTargetViewRow[];
};

function buildSheetCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${DAILY_TARGET_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${DAILY_TARGET_SHEET_GID}`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (row.length || value) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeDailyTargetKey(value: string | null | undefined) {
  return normalizeText(value)
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I");
}

function parseOptionalNumber(value: string) {
  const text = normalizeText(value);
  if (!text) return null;

  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDailyTargetSheet(text: string): DailyTargetDefinition[] {
  const rows = parseCsv(text);

  return rows.slice(1).flatMap((values) => {
    const branchName = normalizeText(values[0]);
    const mainCategory = normalizeText(values[1]);
    const subCategory = normalizeText(values[2]);
    const flag = normalizeDailyTargetKey(values[4]);

    if (!branchName || !mainCategory || !subCategory || !["E", "H"].includes(flag)) {
      return [];
    }

    return [{
      branchName,
      mainCategory,
      subCategory,
      target: parseOptionalNumber(values[3] ?? ""),
      entryMode: flag === "H" ? "summary" as const : "editable" as const
    }];
  });
}

export async function fetchDailyTargetDefinitions() {
  const response = await fetch(buildSheetCsvUrl(), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaDailyTargets/1.0)"
    }
  });

  if (!response.ok) {
    throw new Error(`Günlük hedef Sheet'i okunamadı: ${response.status}`);
  }

  return parseDailyTargetSheet(await response.text());
}

export function getIstanbulDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatIstanbulDay(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function buildDailyTargetRowKey(mainCategory: string, subCategory: string) {
  return `${normalizeDailyTargetKey(mainCategory)}\u241f${normalizeDailyTargetKey(subCategory)}`;
}

export function buildDailyTargetInputName(mainCategory: string, subCategory: string) {
  return `actual:${encodeURIComponent(buildDailyTargetRowKey(mainCategory, subCategory))}`;
}

function toSafeActual(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function buildDailyTargetGroups(
  definitions: DailyTargetDefinition[],
  branchName: string,
  actualRecords: DailyTargetActualRecord[]
): DailyTargetGroup[] {
  const branchKey = normalizeDailyTargetKey(branchName);
  const branchRows = definitions.filter((row) => normalizeDailyTargetKey(row.branchName) === branchKey);
  const actualByRow = new Map(
    actualRecords.map((row) => [
      buildDailyTargetRowKey(row.main_category, row.sub_category),
      toSafeActual(row.actual)
    ])
  );
  const groups = new Map<string, DailyTargetGroup>();

  for (const definition of branchRows) {
    const mainKey = normalizeDailyTargetKey(definition.mainCategory);
    const editableRowsInGroup = branchRows.filter(
      (row) => row.entryMode === "editable" && normalizeDailyTargetKey(row.mainCategory) === mainKey
    );
    const actual = definition.entryMode === "summary"
      ? editableRowsInGroup.reduce(
          (sum, row) => sum + (actualByRow.get(buildDailyTargetRowKey(row.mainCategory, row.subCategory)) ?? 0),
          0
        )
      : actualByRow.get(buildDailyTargetRowKey(definition.mainCategory, definition.subCategory)) ?? 0;
    const remaining = definition.target === null ? null : Math.max(0, definition.target - actual);
    const achieved = definition.target === null ? null : actual >= definition.target;
    const viewRow: DailyTargetViewRow = {
      ...definition,
      actual,
      remaining,
      achieved,
      inputName: definition.entryMode === "editable"
        ? buildDailyTargetInputName(definition.mainCategory, definition.subCategory)
        : null
    };

    const group = groups.get(mainKey) ?? { mainCategory: definition.mainCategory, rows: [] };
    group.rows.push(viewRow);
    groups.set(mainKey, group);
  }

  return Array.from(groups.values());
}

export function buildCompanyDailyTargetGroups(storeGroups: DailyTargetGroup[][]): DailyTargetGroup[] {
  const companyGroups = new Map<string, DailyTargetGroup>();

  for (const groups of storeGroups) {
    for (const group of groups) {
      const mainKey = normalizeDailyTargetKey(group.mainCategory);
      const companyGroup = companyGroups.get(mainKey) ?? { mainCategory: group.mainCategory, rows: [] };

      for (const row of group.rows) {
        const rowKey = buildDailyTargetRowKey(row.mainCategory, row.subCategory);
        const existing = companyGroup.rows.find(
          (item) => buildDailyTargetRowKey(item.mainCategory, item.subCategory) === rowKey
        );

        if (!existing) {
          companyGroup.rows.push({ ...row, inputName: null });
          continue;
        }

        const target = existing.target === null && row.target === null
          ? null
          : (existing.target ?? 0) + (row.target ?? 0);
        const actual = existing.actual + row.actual;
        existing.target = target;
        existing.actual = actual;
        existing.remaining = target === null ? null : Math.max(0, target - actual);
        existing.achieved = target === null ? null : actual >= target;
      }

      companyGroups.set(mainKey, companyGroup);
    }
  }

  return Array.from(companyGroups.values());
}

export function summarizeDailyTargetGroups(groups: DailyTargetGroup[]) {
  const targetedRows = groups.flatMap((group) => group.rows).filter((row) => row.target !== null);
  const actualOnlyRows = groups.flatMap((group) => group.rows).filter((row) => row.target === null);
  const achievedRows = targetedRows.filter((row) => row.achieved).length;

  return {
    targetedCount: targetedRows.length,
    achievedCount: achievedRows,
    actualOnlyCount: actualOnlyRows.length,
    percent: targetedRows.length ? Math.round((achievedRows / targetedRows.length) * 100) : 0
  };
}
