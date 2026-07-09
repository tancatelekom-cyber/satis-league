export type RevenueExpenseKind = "gelir" | "gider";

export type RevenueExpenseRow = {
  storeName: string;
  kind: RevenueExpenseKind;
  category: string;
  year: number;
  month: number;
  monthLabel: string;
  periodKey: string;
  periodLabel: string;
  amount: number;
};

const GOAL_SHEET_ID = "1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA";
const REVENUE_EXPENSE_SHEET_GID = "452261502";

const MONTH_LABELS = [
  "",
  "Ocak",
  "Subat",
  "Mart",
  "Nisan",
  "Mayis",
  "Haziran",
  "Temmuz",
  "Agustos",
  "Eylul",
  "Ekim",
  "Kasim",
  "Aralik"
];

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

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
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
        index += 1;
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

function normalizeIdentifier(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/\u0130/g, "I")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function parseMonthNumber(value: string) {
  const numeric = parseLocalizedNumber(value);
  if (numeric >= 1 && numeric <= 12) {
    return numeric;
  }

  const normalized = normalizeIdentifier(value);
  const monthMap = new Map<string, number>([
    ["ocak", 1],
    ["subat", 2],
    ["mart", 3],
    ["nisan", 4],
    ["mayis", 5],
    ["haziran", 6],
    ["temmuz", 7],
    ["agustos", 8],
    ["eylul", 9],
    ["ekim", 10],
    ["kasim", 11],
    ["aralik", 12]
  ]);

  return monthMap.get(normalized) ?? 0;
}

function normalizeKind(value: string): RevenueExpenseKind | null {
  const normalized = normalizeIdentifier(value);
  if (normalized.includes("gelir")) {
    return "gelir";
  }

  if (normalized.includes("gider")) {
    return "gider";
  }

  return null;
}

async function fetchRevenueExpenseSheetRows() {
  const response = await fetch(buildSheetUrl(REVENUE_EXPENSE_SHEET_GID), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Gelir gider sayfasi okunamadi: ${response.status}`);
  }

  return parseCsv(await response.text());
}

export function getRevenueExpenseMonthLabel(month: number) {
  return MONTH_LABELS[month] ?? `${month}`;
}

export function sameRevenueExpenseStore(left: string, right: string) {
  return normalizeIdentifier(left) === normalizeIdentifier(right);
}

export async function fetchRevenueExpensePassword() {
  const rows = await fetchRevenueExpenseSheetRows();
  const firstRow = rows[0] ?? [];
  return normalizeText(firstRow[9] ?? "");
}

export async function fetchRevenueExpenseRows() {
  const rows = await fetchRevenueExpenseSheetRows();

  return rows
    .slice(1)
    .map((row): RevenueExpenseRow | null => {
      const storeName = normalizeText(row[0] ?? "");
      const kind = normalizeKind(row[1] ?? "");
      const category = normalizeText(row[2] ?? "");
      const year = parseLocalizedNumber(row[3] ?? "");
      const month = parseMonthNumber(row[4] ?? "");
      const amount = parseLocalizedNumber(row[5] ?? "");

      if (!storeName || !kind || !category || !year || !month) {
        return null;
      }

      const monthLabel = getRevenueExpenseMonthLabel(month);

      return {
        storeName,
        kind,
        category,
        year,
        month,
        monthLabel,
        periodKey: `${year}-${String(month).padStart(2, "0")}`,
        periodLabel: `${monthLabel} ${year}`,
        amount
      } satisfies RevenueExpenseRow;
    })
    .filter((row): row is RevenueExpenseRow => Boolean(row))
    .sort((left, right) => {
      if (left.year !== right.year) {
        return left.year - right.year;
      }

      if (left.month !== right.month) {
        return left.month - right.month;
      }

      return left.storeName.localeCompare(right.storeName, "tr");
    });
}
