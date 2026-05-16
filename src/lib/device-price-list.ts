export type DevicePriceRow = {
  id: string;
  category: string;
  brand: string;
  productName: string;
  installmentCount: number;
  monthlyInstallment: number;
  contractCashPrice: number | null;
  totalPayable: number;
};

export type CashDepotRow = {
  id: string;
  category: string;
  subCategory: string;
  brand: string;
  model: string;
  color: string;
  salePrice: number;
  costPrice: number;
  bonus: number;
  note: string;
  serialNo: string;
};

const DEVICE_SHEET_ID = "1ya4e8B6MkdcL4CqPaMwwxIXVIPD9CEFjN9Jtlyf70hI";
const DEVICE_SHEET_NAME = "Sayfa1";
const CASH_DEPOT_SHEET_GID = "756236099";

// Prefer sheet name over gid to reduce mismatch issues when tabs are reordered/duplicated.
// gviz endpoint is also more reliable for public sheets on some deployments.
export const DEVICE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${DEVICE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
  DEVICE_SHEET_NAME
)}`;

export const CASH_DEPOT_SHEET_URL = `https://docs.google.com/spreadsheets/d/${DEVICE_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${CASH_DEPOT_SHEET_GID}`;

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

function parseLocalizedNumber(value: string) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();

  return normalized ? Number(normalized) : 0;
}

function normalizeText(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function fetchDevicePriceRowsFromSheet() {
  const response = await fetch(DEVICE_SHEET_URL, {
    cache: "no-store",
    headers: {
      // Helps some CDNs return the CSV instead of an HTML consent page.
      accept: "text/csv, text/plain, */*",
      // Some hosts return 401/403 unless a UA is present.
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Google Sheet okunamadi: ${response.status}`);
  }

  const csv = await response.text();
  const rows = parseCsv(csv);

  return rows
    .slice(1)
    .map((row, index): DevicePriceRow | null => {
      const category = normalizeText(row[0] ?? "");
      // Sheet mapping (0-indexed):
      // A: kategori, C: marka, E: urun adi, H: taksit sayisi, J: aylik taksit, N: pesin/kontrat tutari
      const brand = normalizeText(row[2] ?? "");
      const productName = normalizeText(row[4] ?? "");
      const installmentCount = Math.round(parseLocalizedNumber(row[7] ?? ""));
      const monthlyInstallment = parseLocalizedNumber(row[9] ?? "");
      const contractRaw = parseLocalizedNumber(row[13] ?? "");

      if (!category || !brand || !productName) {
        return null;
      }

      const hasInstallment = monthlyInstallment > 0 && installmentCount > 0;
      const contractCashPrice = hasInstallment ? null : contractRaw > 0 ? contractRaw : null;
      const totalPayable = hasInstallment ? installmentCount * monthlyInstallment : contractCashPrice ?? 0;

      return {
        id: `${index}-${category}-${brand}-${productName}`,
        category,
        brand,
        productName,
        installmentCount,
        monthlyInstallment,
        contractCashPrice,
        totalPayable
      };
    })
    .filter((row): row is DevicePriceRow => Boolean(row));
}

async function fetchCashDepotRowsFromSheet() {
  const response = await fetch(CASH_DEPOT_SHEET_URL, {
    cache: "no-store",
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Nakit Depo sheet okunamadi: ${response.status}`);
  }

  const csv = await response.text();
  const rows = parseCsv(csv);

  return rows
    .slice(1)
    .map((row, index): CashDepotRow | null => {
      const category = normalizeText(row[0] ?? "");
      const subCategory = normalizeText(row[1] ?? "");
      const brand = normalizeText(row[2] ?? "");
      const model = normalizeText(row[3] ?? "");
      const color = normalizeText(row[4] ?? "");
      const salePrice = parseLocalizedNumber(row[5] ?? "");
      const bonus = parseLocalizedNumber(row[6] ?? "");
      const note = normalizeText(row[7] ?? "");
      const serialNo = normalizeText(row[8] ?? "");
      const costPrice = parseLocalizedNumber(row[9] ?? "");

      if (!category || !subCategory || !brand || !model) {
        return null;
      }

      return {
        id: `${index}-${category}-${subCategory}-${brand}-${model}-${color || "renksiz"}`,
        category,
        subCategory,
        brand,
        model,
        color,
        salePrice,
        costPrice,
        bonus,
        note,
        serialNo
      };
    })
    .filter((row): row is CashDepotRow => Boolean(row));
}

export async function fetchDevicePriceRows() {
  return fetchDevicePriceRowsFromSheet();
}

export async function fetchCashDepotRows() {
  return fetchCashDepotRowsFromSheet();
}

export function buildDistinctOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
}
