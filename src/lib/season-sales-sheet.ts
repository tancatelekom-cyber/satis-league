"use server";

export type SeasonSalesSheetRow = {
  fullName: string;
  categoryName: string;
  profileId: string;
  seasonId: string;
  productId: string;
  month: string;
  value: number;
};

const SEASON_SALES_SHEET_ID = "1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA";
const SEASON_SALES_SHEET_GID = "683589524";

function buildSeasonSalesSheetUrl() {
  const params = new URLSearchParams();
  params.set("format", "csv");
  params.set("gid", SEASON_SALES_SHEET_GID);

  return `https://docs.google.com/spreadsheets/d/${SEASON_SALES_SHEET_ID}/export?${params.toString()}`;
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

function parseSheetValue(value: string) {
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
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

export async function fetchSeasonSalesSheetRows() {
  const response = await fetch(buildSeasonSalesSheetUrl(), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Sezon satis sheet'i okunamadi: ${response.status}`);
  }

  const rows = parseCsv(await response.text());

  return rows
    .slice(1)
    .map((row): SeasonSalesSheetRow | null => {
      const fullName = normalizeText(row[0] ?? "");
      const categoryName = normalizeText(row[1] ?? "");
      const profileId = normalizeText(row[2] ?? "");
      const seasonId = normalizeText(row[3] ?? "");
      const productId = normalizeText(row[4] ?? "");
      const month = normalizeText(row[5] ?? "");
      const value = parseSheetValue(row[6] ?? "");

      if (!profileId || !seasonId || !productId || !month) {
        return null;
      }

      return {
        fullName,
        categoryName,
        profileId,
        seasonId,
        productId,
        month,
        value
      };
    })
    .filter((row): row is SeasonSalesSheetRow => Boolean(row));
}
