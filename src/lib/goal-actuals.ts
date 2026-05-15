import { unstable_cache } from "next/cache";

export type GoalActualRow = {
  employeeName: string;
  mainCategory: string;
  subCategory: string;
  target: number | null;
  actual: number;
};

export type GoalStoreRow = {
  storeCode: string;
  mainCategory: string;
  subCategory: string;
  target: number | null;
  actual: number;
  includeProjection: boolean;
  companyMode: "sum" | "average";
};

export type GoalDayStats = {
  workedDays: number;
  remainingDays: number;
  totalDays: number;
};

const GOAL_SHEET_ID = "1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA";
const PRS_SHEET_NAME = "PRS";
const GN_SHEET_NAME = "GN";
const PRS_SHEET_GID = "0";
const GN_SHEET_GID = "2046012697";
const STORE_SHEET_GID = "650800232";

function buildSheetUrl(sheetName?: string, gid?: string) {
  const params = new URLSearchParams();
  params.set("format", "csv");
  if (sheetName) {
    params.set("sheet", sheetName);
  }
  if (gid) {
    params.set("gid", gid);
  }

  return `https://docs.google.com/spreadsheets/d/${GOAL_SHEET_ID}/export?${params.toString()}`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function normalizeText(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseLocalizedNumber(value: string) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchGoalActualRowsFromSheet() {
  const response = await fetch(buildSheetUrl(PRS_SHEET_NAME, PRS_SHEET_GID), {
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`PRS sayfasi okunamadi: ${response.status}`);
  }

  const rows = parseCsv(await response.text());

  return rows
    .slice(1)
    .map((row): GoalActualRow | null => {
      const employeeName = normalizeText(row[0] ?? "");
      const mainCategory = normalizeText(row[1] ?? "");
      const subCategory = normalizeText(row[2] ?? "");
      const targetRaw = normalizeText(row[3] ?? "");
      const actualRaw = normalizeText(row[4] ?? "");

      if (!employeeName) {
        return null;
      }

      const target = targetRaw ? parseLocalizedNumber(targetRaw) : null;
      const actual = parseLocalizedNumber(actualRaw);

      return {
        employeeName,
        mainCategory: mainCategory || "Genel",
        subCategory,
        target: target && target > 0 ? target : null,
        actual
      };
    })
    .filter((row): row is GoalActualRow => Boolean(row));
}

async function fetchGoalDayStatsFromSheet() {
  const response = await fetch(buildSheetUrl(GN_SHEET_NAME, GN_SHEET_GID), {
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`GN sayfasi okunamadi: ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  const statsRow = rows[1] ?? rows[0] ?? [];

  return {
    workedDays: parseLocalizedNumber(statsRow[0] ?? ""),
    remainingDays: parseLocalizedNumber(statsRow[1] ?? ""),
    totalDays: parseLocalizedNumber(statsRow[2] ?? "")
  } satisfies GoalDayStats;
}

async function fetchGoalStoreRowsFromSheet() {
  const response = await fetch(buildSheetUrl(undefined, STORE_SHEET_GID), {
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Magaza/Firma sayfasi okunamadi: ${response.status}`);
  }

  const rows = parseCsv(await response.text());

  return rows
    .slice(1)
    .map((row): GoalStoreRow | null => {
      const storeCode = normalizeText(row[0] ?? "");
      const mainCategory = normalizeText(row[1] ?? "");
      const subCategory = normalizeText(row[2] ?? "");
      const targetRaw = normalizeText(row[3] ?? "");
      const actualRaw = normalizeText(row[4] ?? "");
      const projectionFlag = normalizeText(row[5] ?? "").toUpperCase();
      const companyModeFlag = normalizeText(row[6] ?? "").toUpperCase();

      if (!storeCode) {
        return null;
      }

      const target = targetRaw ? parseLocalizedNumber(targetRaw) : null;
      const actual = parseLocalizedNumber(actualRaw);

      return {
        storeCode,
        mainCategory: mainCategory || "Genel",
        subCategory,
        target: target && target > 0 ? target : null,
        actual,
        includeProjection: projectionFlag === "E",
        companyMode: companyModeFlag === "H" ? "average" : "sum"
      };
    })
    .filter((row): row is GoalStoreRow => Boolean(row));
}

export const fetchGoalActualRows = unstable_cache(fetchGoalActualRowsFromSheet, ["goal-actual-rows"], {
  revalidate: 60 * 30
});

export const fetchGoalDayStats = unstable_cache(fetchGoalDayStatsFromSheet, ["goal-day-stats"], {
  revalidate: 60 * 30
});

export const fetchGoalStoreRows = unstable_cache(fetchGoalStoreRowsFromSheet, ["goal-store-rows"], {
  revalidate: 60 * 30
});
