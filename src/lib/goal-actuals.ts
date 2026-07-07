export type GoalActualRow = {
  personnelId: string;
  employeeName: string;
  storeName: string;
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
  targetIsPercent?: boolean;
  actualIsPercent?: boolean;
  includeProjection: boolean;
  companyMode: "sum" | "average";
  separateInfo: boolean;
};

export type GoalDayStats = {
  workedDays: number;
  remainingDays: number;
  totalDays: number;
};

export type GoalProductionRewardRow = {
  points: number;
  reward: string;
};

export type GoalProductPointRow = {
  product: string;
  points: number;
};

export type GoalLivePrimeAccessoryScaleRow = {
  thresholdPercent: number;
  ratePercent: number;
};

export type GoalMonthlyPrimeDeductionRule = {
  categoryTitle: string;
  minimumValue: number;
  deductionPercent: number;
};

export type GoalLivePrimeSettings = {
  workedDays: number;
  totalDays: number;
  accessoryScaleRows: GoalLivePrimeAccessoryScaleRow[];
  monthlyPrimeDeductionRules: GoalMonthlyPrimeDeductionRule[];
};

const GOAL_SHEET_ID = "1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA";
const PRS_SHEET_NAME = "PRS";
const GN_SHEET_NAME = "GN";
const PRS_SHEET_GID = "0";
const GN_SHEET_GID = "2046012697";
const STORE_SHEET_GID = "650800232";
const PRODUCTION_REWARD_SHEET_GID = "2009769454";
const PRODUCT_POINT_SHEET_GID = "1779133571";
const LIVE_PRIME_SETTINGS_SHEET_GID = "206171589";

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
    cache: "no-store",
    next: { revalidate: 0 },
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
      const storeName = normalizeText(row[5] ?? "");
      const personnelId = normalizeText(row[6] ?? "");

      if (!employeeName) {
        return null;
      }

      const target = targetRaw ? parseLocalizedNumber(targetRaw) : null;
      const actual = parseLocalizedNumber(actualRaw);

      return {
        personnelId,
        employeeName,
        storeName,
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
    cache: "no-store",
    next: { revalidate: 0 },
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
    cache: "no-store",
    next: { revalidate: 0 },
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
      const separateInfoFlag = normalizeText(row[7] ?? "").toUpperCase();
      const targetIsPercent = targetRaw.includes("%");
      const actualIsPercent = actualRaw.includes("%");

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
        targetIsPercent,
        actualIsPercent,
        includeProjection: projectionFlag === "E",
        companyMode: companyModeFlag === "H" ? "average" : "sum",
        separateInfo: separateInfoFlag === "E"
      };
    })
    .filter((row): row is GoalStoreRow => Boolean(row));
}

async function fetchGoalProductionRewardRowsFromSheet() {
  const response = await fetch(buildSheetUrl(undefined, PRODUCTION_REWARD_SHEET_GID), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Uretim puani kazanım sayfasi okunamadi: ${response.status}`);
  }

  const rows = parseCsv(await response.text());

  return rows
    .slice(1)
    .map((row): GoalProductionRewardRow | null => {
      const points = parseLocalizedNumber(normalizeText(row[0] ?? ""));
      const reward = normalizeText(row[1] ?? "");

      if (!points || !reward) {
        return null;
      }

      return {
        points,
        reward
      };
    })
    .filter((row): row is GoalProductionRewardRow => Boolean(row))
    .sort((left, right) => left.points - right.points);
}

async function fetchGoalProductPointRowsFromSheet() {
  const response = await fetch(buildSheetUrl(undefined, PRODUCT_POINT_SHEET_GID), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Urun puani sayfasi okunamadi: ${response.status}`);
  }

  const rows = parseCsv(await response.text());

  return rows
    .slice(1)
    .map((row): GoalProductPointRow | null => {
      const product = normalizeText(row[0] ?? "");
      const points = parseLocalizedNumber(normalizeText(row[1] ?? ""));

      if (!product || !points) {
        return null;
      }

      return {
        product,
        points
      };
    })
    .filter((row): row is GoalProductPointRow => Boolean(row))
    .sort((left, right) => right.points - left.points || left.product.localeCompare(right.product, "tr"));
}

async function fetchGoalLivePrimeSettingsFromSheet() {
  const response = await fetch(buildSheetUrl(undefined, LIVE_PRIME_SETTINGS_SHEET_GID), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Canli prim ayarlari sayfasi okunamadi: ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  const statsRow = rows[1] ?? rows[0] ?? [];
  const accessoryScaleRows = rows
    .slice(1)
    .map((row): GoalLivePrimeAccessoryScaleRow | null => {
      const thresholdPercent = parseLocalizedNumber(normalizeText(row[0] ?? ""));
      const ratePercent = parseLocalizedNumber(normalizeText(row[1] ?? ""));

      if (!thresholdPercent || !ratePercent) {
        return null;
      }

      return {
        thresholdPercent,
        ratePercent
      };
    })
    .filter((row): row is GoalLivePrimeAccessoryScaleRow => Boolean(row))
    .sort((left, right) => left.thresholdPercent - right.thresholdPercent);
  const monthlyPrimeDeductionRules = rows
    .slice(1)
    .map((row): GoalMonthlyPrimeDeductionRule | null => {
      const categoryTitle = normalizeText(row[9] ?? "");
      const minimumValue = parseLocalizedNumber(normalizeText(row[10] ?? ""));
      const deductionPercent = parseLocalizedNumber(normalizeText(row[11] ?? ""));

      if (!categoryTitle || !minimumValue || !deductionPercent) {
        return null;
      }

      return {
        categoryTitle,
        minimumValue,
        deductionPercent
      };
    })
    .filter((row): row is GoalMonthlyPrimeDeductionRule => Boolean(row));

  return {
    workedDays: parseLocalizedNumber(statsRow[5] ?? ""),
    totalDays: parseLocalizedNumber(statsRow[6] ?? ""),
    accessoryScaleRows,
    monthlyPrimeDeductionRules
  } satisfies GoalLivePrimeSettings;
}

export const fetchGoalActualRows = fetchGoalActualRowsFromSheet;

export const fetchGoalDayStats = fetchGoalDayStatsFromSheet;

export const fetchGoalStoreRows = fetchGoalStoreRowsFromSheet;

export const fetchGoalProductionRewardRows = fetchGoalProductionRewardRowsFromSheet;

export const fetchGoalProductPointRows = fetchGoalProductPointRowsFromSheet;

export const fetchGoalLivePrimeSettings = fetchGoalLivePrimeSettingsFromSheet;
