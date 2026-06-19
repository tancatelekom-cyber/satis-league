const GOAL_SHEET_ID = "1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA";
const WEB_KONTOR_DAILY_SHEET_GID = "1527950723";
const WEB_KONTOR_SCALE_SHEET_GID = "2009769454";

export type WebKontorDailyRow = {
  dayLabel: string;
  storeAmounts: Array<{
    storeName: string;
    amount: number;
  }>;
  companyTotal: number | null;
};

export type WebKontorStoreSummary = {
  storeName: string;
  totalAmount: number;
};

export type WebKontorScaleRule = {
  storeName: string;
  scaleOneTarget: number | null;
  scaleTwoTarget: number | null;
};

export type WebKontorSheetData = {
  storeNames: string[];
  dailyRows: WebKontorDailyRow[];
  storeSummaries: WebKontorStoreSummary[];
  companyTotal: number;
  scaleOneRate: number;
  scaleTwoRate: number;
  scaleRules: WebKontorScaleRule[];
};

function buildSheetUrl(gid: string) {
  const params = new URLSearchParams();
  params.set("format", "csv");
  params.set("gid", gid);
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

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeStoreKey(value: string | null | undefined) {
  return normalizeText(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/\u0130/g, "I")
    .replace(/\u011E/g, "G")
    .replace(/\u00DC/g, "U")
    .replace(/\u015E/g, "S")
    .replace(/\u00D6/g, "O")
    .replace(/\u00C7/g, "C");
}

function parseLocalizedNumber(value: string | number | null | undefined) {
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

function isNumericDayLabel(value: string) {
  return /^\d{1,2}$/.test(normalizeText(value));
}

function resolveCompanyColumnIndex(headerRow: string[]) {
  const explicitIndex = headerRow.findIndex((cell) => /firma|toplam/i.test(normalizeText(cell)));

  if (explicitIndex >= 0) {
    return explicitIndex;
  }

  if (headerRow.length > 5 && normalizeText(headerRow[5])) {
    return 5;
  }

  const lastNamedIndex = [...headerRow]
    .map((cell, index) => ({ cell: normalizeText(cell), index }))
    .filter((item) => item.index > 0 && item.cell)
    .at(-1);

  return lastNamedIndex?.index ?? -1;
}

async function fetchCsvRows(gid: string) {
  const response = await fetch(buildSheetUrl(gid), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Web Kontor sayfasi okunamadi: ${response.status}`);
  }

  return parseCsv(await response.text());
}

async function fetchWebKontorDailyRows() {
  const rows = await fetchCsvRows(WEB_KONTOR_DAILY_SHEET_GID);
  const headerRow = rows[0] ?? [];
  const companyColumnIndex = resolveCompanyColumnIndex(headerRow);

  const storeColumns = headerRow
    .map((cell, index) => ({
      index,
      storeName: normalizeText(cell)
    }))
    .filter((item) => item.index > 0 && item.index !== companyColumnIndex && item.storeName);

  const storeNames = storeColumns.map((item) => item.storeName);

  const dailyRows = rows
    .slice(1)
    .map((row): WebKontorDailyRow | null => {
      const dayLabel = normalizeText(row[0] ?? "");

      if (!dayLabel || !isNumericDayLabel(dayLabel)) {
        return null;
      }

      const storeAmounts = storeColumns.map((column) => ({
        storeName: column.storeName,
        amount: parseLocalizedNumber(row[column.index] ?? "")
      }));
      const companyTotal =
        companyColumnIndex >= 0 ? parseLocalizedNumber(row[companyColumnIndex] ?? "") : storeAmounts.reduce((sum, item) => sum + item.amount, 0);

      return {
        dayLabel,
        storeAmounts,
        companyTotal
      };
    })
    .filter((row): row is WebKontorDailyRow => Boolean(row));

  const storeSummaries = storeNames.map((storeName) => ({
    storeName,
    totalAmount: dailyRows.reduce((sum, row) => {
      const storeValue = row.storeAmounts.find((item) => normalizeStoreKey(item.storeName) === normalizeStoreKey(storeName));
      return sum + (storeValue?.amount ?? 0);
    }, 0)
  }));

  const companyTotal = dailyRows.reduce((sum, row) => sum + (row.companyTotal ?? 0), 0);

  return {
    storeNames,
    dailyRows,
    storeSummaries,
    companyTotal
  };
}

async function fetchWebKontorScaleRows() {
  const rows = await fetchCsvRows(WEB_KONTOR_SCALE_SHEET_GID);
  const scaleOneRate = parseLocalizedNumber(rows[1]?.[8] ?? "");
  const scaleTwoRate = parseLocalizedNumber(rows[1]?.[9] ?? "");

  const scaleRules = rows
    .slice(1)
    .map((row): WebKontorScaleRule | null => {
      const storeName = normalizeText(row[4] ?? "");
      const scaleOneTarget = parseLocalizedNumber(row[5] ?? "");
      const scaleTwoTarget = parseLocalizedNumber(row[6] ?? "");

      if (!storeName) {
        return null;
      }

      return {
        storeName,
        scaleOneTarget: scaleOneTarget > 0 ? scaleOneTarget : null,
        scaleTwoTarget: scaleTwoTarget > 0 ? scaleTwoTarget : null
      };
    })
    .filter((row): row is WebKontorScaleRule => Boolean(row));

  return {
    scaleOneRate,
    scaleTwoRate,
    scaleRules
  };
}

export async function fetchWebKontorSheetData(): Promise<WebKontorSheetData> {
  const [dailyData, scaleData] = await Promise.all([fetchWebKontorDailyRows(), fetchWebKontorScaleRows()]);

  return {
    storeNames: dailyData.storeNames,
    dailyRows: dailyData.dailyRows,
    storeSummaries: dailyData.storeSummaries,
    companyTotal: dailyData.companyTotal,
    scaleOneRate: scaleData.scaleOneRate,
    scaleTwoRate: scaleData.scaleTwoRate,
    scaleRules: scaleData.scaleRules
  };
}

export function sameWebKontorStore(left: string, right: string) {
  return normalizeStoreKey(left) === normalizeStoreKey(right);
}

export function getWebKontorRateMultiplier(rateValue: number) {
  if (!Number.isFinite(rateValue) || rateValue <= 0) {
    return 0;
  }

  return rateValue > 1 ? rateValue / 100 : rateValue;
}

export function formatWebKontorRate(rateValue: number) {
  if (!Number.isFinite(rateValue) || rateValue <= 0) {
    return "-";
  }

  const percentValue = rateValue > 1 ? rateValue : rateValue * 100;
  return `%${percentValue.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}
