const GOAL_SHEET_ID = "1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA";
const UNREACHABLE_DOCUMENT_SHEET_GID = "502959000";
const MISSING_DOCUMENT_SHEET_GID = "2077377859";
const INACTIVE_EMPLOYEE_LABEL = "AKTIF CALISAN DEGIL";

export type DocumentIssueStatus = "Ulasmayan Evrak" | "Eksik Evrak";

export type DocumentIssueRow = {
  source: DocumentIssueStatus;
  personnelId: string;
  storeName: string;
  customerGsm: string;
  customerName: string;
  transactionType: string;
  documentDetail: string;
  activationDate: string;
  daysSinceActivation: number | null;
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

function normalizeProfileId(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function columnLetterToIndex(letter: string) {
  const normalized = normalizeText(letter).toUpperCase();
  let total = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    total = total * 26 + (normalized.charCodeAt(i) - 64);
  }

  return Math.max(0, total - 1);
}

function parseDateValue(value: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const parsed = new Date(year, month, day);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{5}(\.\d+)?$/.test(normalized)) {
    const excelSerial = Number(normalized);
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + excelSerial * 24 * 60 * 60 * 1000);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const directDate = new Date(normalized);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate;
  }

  return null;
}

function calculateDaysSinceActivation(value: string) {
  const activationDate = parseDateValue(value);

  if (!activationDate) {
    return null;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfActivation = new Date(activationDate);
  startOfActivation.setHours(0, 0, 0, 0);

  const diff = startOfToday.getTime() - startOfActivation.getTime();
  return diff >= 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

async function fetchCsvRows(gid: string, label: string) {
  const response = await fetch(buildSheetUrl(gid), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`${label} sayfasi okunamadi: ${response.status}`);
  }

  return parseCsv(await response.text());
}

async function fetchUnreachableDocumentRows() {
  const rows = await fetchCsvRows(UNREACHABLE_DOCUMENT_SHEET_GID, "Ulasmayan evrak");

  const customerGsmIndex = columnLetterToIndex("A");
  const customerNameIndex = columnLetterToIndex("G");
  const transactionTypeIndex = columnLetterToIndex("H");
  const activationDateIndex = columnLetterToIndex("O");
  const personnelIdIndex = columnLetterToIndex("AI");
  const storeIndex = columnLetterToIndex("AJ");

  return rows
    .slice(1)
    .map((row): DocumentIssueRow | null => {
      const personnelId = normalizeText(row[personnelIdIndex] ?? "");
      const storeName = normalizeText(row[storeIndex] ?? "");
      const customerGsm = normalizeText(row[customerGsmIndex] ?? "");
      const customerName = normalizeText(row[customerNameIndex] ?? "");
      const transactionType = normalizeText(row[transactionTypeIndex] ?? "");
      const activationDate = normalizeText(row[activationDateIndex] ?? "");

      if (!personnelId && !storeName && !customerGsm && !customerName && !transactionType) {
        return null;
      }

      return {
        source: "Ulasmayan Evrak",
        personnelId,
        storeName,
        customerGsm,
        customerName,
        transactionType,
        documentDetail: "-",
        activationDate,
        daysSinceActivation: calculateDaysSinceActivation(activationDate)
      };
    })
    .filter((row): row is DocumentIssueRow => Boolean(row));
}

async function fetchMissingDocumentRows() {
  const rows = await fetchCsvRows(MISSING_DOCUMENT_SHEET_GID, "Eksik evrak");

  const customerNameIndex = columnLetterToIndex("A");
  const customerGsmIndex = columnLetterToIndex("D");
  const documentDetailIndex = columnLetterToIndex("H");
  const transactionTypeIndex = columnLetterToIndex("I");
  const activationDateIndex = columnLetterToIndex("J");
  const personnelIdIndex = columnLetterToIndex("AC");
  const storeIndex = columnLetterToIndex("AD");

  return rows
    .slice(1)
    .map((row): DocumentIssueRow | null => {
      const personnelId = normalizeText(row[personnelIdIndex] ?? "");
      const storeName = normalizeText(row[storeIndex] ?? "");
      const customerGsm = normalizeText(row[customerGsmIndex] ?? "");
      const customerName = normalizeText(row[customerNameIndex] ?? "");
      const transactionType = normalizeText(row[transactionTypeIndex] ?? "");
      const documentDetail = normalizeText(row[documentDetailIndex] ?? "");
      const activationDate = normalizeText(row[activationDateIndex] ?? "");

      if (!personnelId && !storeName && !customerGsm && !customerName && !transactionType && !documentDetail) {
        return null;
      }

      return {
        source: "Eksik Evrak",
        personnelId,
        storeName,
        customerGsm,
        customerName,
        transactionType,
        documentDetail,
        activationDate,
        daysSinceActivation: calculateDaysSinceActivation(activationDate)
      };
    })
    .filter((row): row is DocumentIssueRow => Boolean(row));
}

export async function fetchDocumentIssueRows() {
  const [unreachableRows, missingRows] = await Promise.all([
    fetchUnreachableDocumentRows(),
    fetchMissingDocumentRows()
  ]);

  return [...unreachableRows, ...missingRows];
}

export type DocumentIssueProfileMapRow = {
  id: string;
  full_name: string;
  store: {
    name: string;
  } | null;
};

export function sameDocumentIssueStore(left: string, right: string) {
  return normalizeStoreKey(left) === normalizeStoreKey(right);
}

export function sameDocumentIssueProfileId(left: string, right: string) {
  return normalizeProfileId(left) === normalizeProfileId(right);
}

export function resolveDocumentIssueUserLabel(
  personnelId: string,
  profiles: DocumentIssueProfileMapRow[]
) {
  if (normalizeStoreKey(personnelId) === INACTIVE_EMPLOYEE_LABEL) {
    return INACTIVE_EMPLOYEE_LABEL;
  }

  const matched = profiles.find((profile) => sameDocumentIssueProfileId(profile.id, personnelId));
  return matched?.full_name?.trim() || personnelId || "-";
}

export function formatDocumentIssueDays(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  return `${value} gun`;
}

export function formatDocumentIssueDate(value: string) {
  return normalizeText(value) || "-";
}
