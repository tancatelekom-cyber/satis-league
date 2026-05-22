export type AymadaStockCategory = "smartphone" | "tablet" | "iot" | "other";

export type AymadaBranchStock = {
  branchCode: string;
  branchName: string;
  smartphone: number;
  tablet: number;
  iot: number;
  total: number;
};

export type AymadaStockProduct = {
  productCardId: string;
  productCardCode: string;
  productBarcode: string;
  productCardName: string;
  productTypeName: string;
  categoryName: string;
  mainCategoryName: string;
  branchName: string;
  category: AymadaStockCategory;
  stockCount: number;
};

export type AymadaStockResult = {
  rows: AymadaBranchStock[];
  products: AymadaStockProduct[];
  totalSmartphone: number;
  totalTablet: number;
  totalIot: number;
  total: number;
  updatedAt: string;
  warning?: string;
  debug?: {
    recordCount: number;
    sampleRecords: StockSheetRecord[];
  };
};

type StockSheetRecord = {
  branchName: string;
  productName: string;
  categoryName: string;
};

const STOCK_SHEET_ID = "1ya4e8B6MkdcL4CqPaMwwxIXVIPD9CEFjN9Jtlyf70hI";
const STOCK_SHEET_GID = "1234243583";

export const STOCK_SHEET_URL = `https://docs.google.com/spreadsheets/d/${STOCK_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${STOCK_SHEET_GID}`;

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

function compactText(value: string) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("tr-TR");
}

function detectCategory(categoryName: string, productName: string): AymadaStockCategory {
  const text = compactText(`${categoryName} ${productName}`);

  if (text.includes("SMARTPHONE") || text.includes("AKILLI TELEFON") || text.includes("TELEFON")) {
    return "smartphone";
  }

  if (text.includes("TABLET")) return "tablet";
  if (text.includes("IOT") || text.includes("I O T")) return "iot";

  return "other";
}

async function fetchStockSheetRecords() {
  const response = await fetch(STOCK_SHEET_URL, {
    cache: "no-store",
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaPlusStockBot/1.0; +https://vercel.app)"
    },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`Google Sheet stok listesi okunamadi: ${response.status}`);
  }

  const csv = await response.text();
  const rows = parseCsv(csv);

  return rows
    .slice(1)
    .map((row): StockSheetRecord | null => {
      const branchName = normalizeText(row[2] ?? "");
      const productName = normalizeText(row[8] ?? "");
      const categoryName = normalizeText(row[10] ?? "");

      if (!branchName || !productName || !categoryName) {
        return null;
      }

      return {
        branchName,
        productName,
        categoryName
      };
    })
    .filter((record): record is StockSheetRecord => Boolean(record));
}

export async function fetchAymadaBranchStocks(): Promise<AymadaStockResult> {
  const records = await fetchStockSheetRecords();
  const productMap = new Map<string, AymadaStockProduct>();
  const branchMap = new Map<string, AymadaBranchStock>();

  for (const record of records) {
    const category = detectCategory(record.categoryName, record.productName);
    const productKey = [record.branchName, record.categoryName, record.productName].join("||");
    const existingProduct = productMap.get(productKey);

    if (existingProduct) {
      existingProduct.stockCount += 1;
    } else {
      productMap.set(productKey, {
        productCardId: productKey,
        productCardCode: "",
        productBarcode: "",
        productCardName: record.productName,
        productTypeName: record.categoryName,
        categoryName: record.categoryName,
        mainCategoryName: record.categoryName,
        branchName: record.branchName,
        category,
        stockCount: 1
      });
    }

    const branch = branchMap.get(record.branchName) ?? {
      branchCode: "",
      branchName: record.branchName,
      smartphone: 0,
      tablet: 0,
      iot: 0,
      total: 0
    };

    if (category === "smartphone") branch.smartphone += 1;
    if (category === "tablet") branch.tablet += 1;
    if (category === "iot") branch.iot += 1;
    branch.total += 1;
    branchMap.set(record.branchName, branch);
  }

  const products = [...productMap.values()].sort(
    (a, b) =>
      a.branchName.localeCompare(b.branchName, "tr") ||
      a.categoryName.localeCompare(b.categoryName, "tr") ||
      b.stockCount - a.stockCount ||
      a.productCardName.localeCompare(b.productCardName, "tr")
  );

  const rows = [...branchMap.values()].sort((a, b) => b.total - a.total || a.branchName.localeCompare(b.branchName, "tr"));

  const totals = products.reduce(
    (acc, product) => {
      if (product.category === "smartphone") acc.totalSmartphone += product.stockCount;
      if (product.category === "tablet") acc.totalTablet += product.stockCount;
      if (product.category === "iot") acc.totalIot += product.stockCount;
      acc.total += product.stockCount;
      return acc;
    },
    { totalSmartphone: 0, totalTablet: 0, totalIot: 0, total: 0 }
  );

  return {
    rows,
    products,
    ...totals,
    updatedAt: new Date().toISOString(),
    warning: records.length === 0 ? "Google Sheet okundu fakat C, I ve K sutunlarinda stok kaydi bulunamadi." : undefined,
    debug:
      process.env.AYMADA_STOCK_DEBUG === "true"
        ? {
            recordCount: records.length,
            sampleRecords: records.slice(0, 5)
          }
        : undefined
  };
}
