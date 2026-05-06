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

const DEVICE_SHEET_ID = "1ya4e8B6MkdcL4CqPaMwwxIXVIPD9CEFjN9Jtlyf70hI";
const DEVICE_SHEET_GID = "0";

export const DEVICE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${DEVICE_SHEET_ID}/export?format=csv&gid=${DEVICE_SHEET_GID}`;

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

export async function fetchDevicePriceRows() {
  const response = await fetch(DEVICE_SHEET_URL, {
    next: {
      // Google Sheet is public and updated occasionally; keep a 24h cache to reduce load.
      revalidate: 60 * 60 * 24
    },
    headers: {
      // Helps some CDNs return the CSV instead of an HTML consent page.
      accept: "text/csv, text/plain, */*"
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
      const brand = normalizeText(row[1] ?? "");
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

export function buildDistinctOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
}
