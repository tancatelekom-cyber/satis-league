export type StockManagementRow = {
  branchName: string;
  productCode: string;
  productName: string;
  productShortName: string;
  brand: string;
  currentStock: number;
  sales30: number;
  grossNeed: number;
  transferIncoming: number;
  orderQuantity: number;
  turnoverRate: number;
  coverageDays: number | null;
  oldestStockAge: number;
  returnAlarmCount: number;
  expiredReturnCount: number;
};

export type StockTransferSuggestion = {
  productCode: string;
  productName: string;
  fromBranch: string;
  toBranch: string;
  quantity: number;
  receiverSales30: number;
};

export type StockReturnAlarm = {
  branchName: string;
  productCode: string;
  productName: string;
  brand: string;
  stockCount: number;
  oldestStockAge: number;
  thresholdDays: number;
  purchaseValue: number;
};

export type StockReturnUnit = {
  productName: string;
  branchName: string;
  serialNumber: string;
  stockAge: number;
  status: "İade alarmı" | "İade süresi geçmiş";
};

export type StockManagementDashboard = {
  rows: StockManagementRow[];
  transfers: StockTransferSuggestion[];
  returnAlarms: StockReturnAlarm[];
  expiredReturns: StockReturnAlarm[];
  returnUnits: StockReturnUnit[];
  branches: string[];
  updatedAt: string;
  totals: {
    currentStock: number;
    sales30: number;
    orderQuantity: number;
    transferQuantity: number;
    returnAlarmCount: number;
    expiredReturnCount: number;
    stockValue: number;
  };
};

type CsvRow = Record<string, string>;

type InventoryUnit = {
  branchName: string;
  productCode: string;
  productName: string;
  productShortName: string;
  brand: string;
  stockAge: number;
  purchasePrice: number;
  serialNumber: string;
};

const SHEET_ID = "1ya4e8B6MkdcL4CqPaMwwxIXVIPD9CEFjN9Jtlyf70hI";
const STOCK_GID = "1234243583";
const SALES_GID = "1351738878";
const DAY_MS = 24 * 60 * 60 * 1000;
const ORDER_COVERAGE_DAYS = 7;

function buildCsvUrl(gid: string) {
  // The generic /export endpoint may return 401 from serverless runtimes even
  // when the workbook can be read through Google Sheets' public query feed.
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
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

function normalizeKey(value: string | null | undefined) {
  return normalizeText(value)
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeProductShortName(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/ç/g, "c").replace(/Ç/g, "C")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/iphone/gi, "IPHONE");
}

function parseNumber(value: string) {
  const normalized = normalizeText(value).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: string) {
  const match = normalizeText(value).match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+.*)?$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toRecords(text: string): CsvRow[] {
  const rows = parseCsv(text);
  const headers = (rows[0] ?? []).map(normalizeText);
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, normalizeText(values[index] ?? "")]))
  );
}

function getField(row: CsvRow, names: string[]) {
  for (const name of names) {
    if (row[name]) return row[name];
  }
  return "";
}

function detectBrand(productName: string) {
  const normalized = normalizeKey(productName);
  if (normalized.includes("IPHONE") || normalized.includes("APPLE")) return "Apple iPhone";
  return normalizeText(productName).split(" ")[0] || "Diğer";
}

function getShortName(productName: string) {
  const words = normalizeText(productName).split(" ");
  return words.slice(0, Math.min(words.length, 6)).join(" ");
}

function isDeviceRow(row: CsvRow) {
  const type = normalizeKey(getField(row, ["Ürün Tipi", "Urun Tipi"]));
  const category = normalizeKey(getField(row, ["Kategori"]));
  return type.includes("CIHAZ") || category.includes("SMARTPHONE") || category.includes("TABLET") || category.includes("IOT");
}

async function fetchCsv(gid: string, label: string) {
  const response = await fetch(buildCsvUrl(gid), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaStockManagement/1.0)"
    }
  });
  if (!response.ok) throw new Error(`${label} okunamadı: ${response.status}`);
  return response.text();
}

export async function fetchStockManagementDashboard(now = new Date()): Promise<StockManagementDashboard> {
  const [stockText, salesText] = await Promise.all([
    fetchCsv(STOCK_GID, "Stok Sheet"),
    fetchCsv(SALES_GID, "Satış Sheet")
  ]);
  const stockRows = toRecords(stockText).filter(isDeviceRow);
  const salesRows = toRecords(salesText).filter(isDeviceRow);
  const inventory: InventoryUnit[] = [];

  stockRows.forEach((row) => {
    const branchName = getField(row, ["ŞUBE", "Şube Adı", "Sube Adi"]);
    const productCode = getField(row, ["Ürün Kodu", "Urun Kodu"]);
    const productName = getField(row, ["Ürün Adı", "Urun Adi"]);
    const productShortName = normalizeProductShortName(getField(row, ["ÜRÜN KISA AD", "Ürün Kısa Ad", "Urun Kisa Ad"]));
    const brand = getField(row, ["MARKA", "Marka"]) || detectBrand(productShortName || productName);
    const quantity = Math.max(1, Math.round(parseNumber(getField(row, ["Miktar"]))));
    if (!branchName || !productShortName) return;

    for (let itemIndex = 0; itemIndex < quantity; itemIndex += 1) {
      inventory.push({
        branchName,
        productCode: productCode || productShortName,
        productName: productName || productShortName,
        productShortName,
        brand,
        stockAge: Math.max(0, parseNumber(getField(row, ["Stok Yaşı (Gün)", "Stok Yasi (Gun)"]))),
        purchasePrice: parseNumber(getField(row, ["Alış Fiyatı (KDV Dahil)", "Alis Fiyati (KDV Dahil)"])),
        serialNumber: getField(row, ["Seri Numarası", "Seri Numarasi"])
      });
    }
  });

  const cutoff = new Date(now.getTime() - 30 * DAY_MS);
  const sales30Map = new Map<string, number>();
  const productNames = new Map<string, string>();
  salesRows.forEach((row) => {
    const saleDate = parseDate(getField(row, ["Fatura Tarihi"]));
    const branchName = getField(row, ["ŞUBE", "Şube Adı", "Sube Adi"]);
    const productCode = getField(row, ["Ürün Kodu", "Urun Kodu"]);
    const productName = getField(row, ["Ürün Adı", "Urun Adi"]);
    const productShortName = normalizeProductShortName(getField(row, ["ÜRÜN KISA AD", "Ürün Kısa Ad", "Urun Kisa Ad"]));
    if (!saleDate || saleDate < cutoff || saleDate > now || !branchName || !productShortName) return;
    const key = `${branchName}__${normalizeKey(productShortName)}`;
    const saleQuantity = Math.abs(parseNumber(getField(row, ["Miktar"])));
    sales30Map.set(key, (sales30Map.get(key) ?? 0) + saleQuantity);
    productNames.set(normalizeKey(productShortName), productName || productShortName);
  });

  const inventoryMap = new Map<string, InventoryUnit[]>();
  inventory.forEach((unit) => {
    const key = `${unit.branchName}__${normalizeKey(unit.productShortName)}`;
    const current = inventoryMap.get(key) ?? [];
    current.push(unit);
    inventoryMap.set(key, current);
    productNames.set(normalizeKey(unit.productShortName), unit.productName);
  });

  const allKeys = new Set([...inventoryMap.keys(), ...sales30Map.keys()]);
  const rows = Array.from(allKeys).map((key) => {
    const separator = key.indexOf("__");
    const branchName = key.slice(0, separator);
    const productKey = key.slice(separator + 2);
    const units = inventoryMap.get(key) ?? [];
    const productName = units[0]?.productName ?? productNames.get(productKey) ?? productKey;
    const productShortName = units[0]?.productShortName ?? productKey;
    const productCode = units[0]?.productCode ?? productKey;
    const currentStock = units.length;
    const sales30 = sales30Map.get(key) ?? 0;
    const dailySales = sales30 / 30;
    const rawBrand = units[0]?.brand || detectBrand(productShortName);
    const brand = normalizeKey(rawBrand).includes("IPHONE") || normalizeKey(rawBrand).includes("APPLE") ? "Apple iPhone" : rawBrand;
    const thresholdDays = brand === "Apple iPhone" ? 20 : 30;
    const ages = units.map((unit) => unit.stockAge);
    const returnAlarmCount = ages.filter((age) => age >= thresholdDays && age <= 60).length;
    const expiredReturnCount = ages.filter((age) => age > 60).length;

    return {
      branchName,
      productCode,
      productName,
      productShortName,
      brand,
      currentStock,
      sales30,
      grossNeed: Math.max(0, Math.ceil(dailySales * ORDER_COVERAGE_DAYS - currentStock)),
      transferIncoming: 0,
      orderQuantity: Math.max(0, Math.ceil(dailySales * ORDER_COVERAGE_DAYS - currentStock)),
      turnoverRate: sales30 / Math.max(currentStock, 1),
      coverageDays: dailySales > 0 ? currentStock / dailySales : null,
      oldestStockAge: ages.length ? Math.max(...ages) : 0,
      returnAlarmCount,
      expiredReturnCount
    } satisfies StockManagementRow;
  });

  const returnAlarms = rows
    .filter((row) => row.returnAlarmCount > 0)
    .map((row) => {
      const units = inventoryMap.get(`${row.branchName}__${normalizeKey(row.productShortName)}`) ?? [];
      const thresholdDays = row.brand === "Apple iPhone" ? 20 : 30;
      const alarmUnits = units.filter((unit) => unit.stockAge >= thresholdDays && unit.stockAge <= 60);
      return {
        branchName: row.branchName,
        productCode: row.productCode,
        productName: row.productName,
        brand: row.brand,
        stockCount: alarmUnits.length,
        oldestStockAge: row.oldestStockAge,
        thresholdDays,
        purchaseValue: alarmUnits.reduce((sum, unit) => sum + unit.purchasePrice, 0)
      } satisfies StockReturnAlarm;
    })
    .sort((a, b) => b.oldestStockAge - a.oldestStockAge || b.stockCount - a.stockCount);

  const expiredReturns = rows
    .filter((row) => row.expiredReturnCount > 0)
    .map((row) => {
      const units = inventoryMap.get(`${row.branchName}__${normalizeKey(row.productShortName)}`) ?? [];
      const expiredUnits = units.filter((unit) => unit.stockAge > 60);
      return {
        branchName: row.branchName,
        productCode: row.productCode,
        productName: row.productName,
        brand: row.brand,
        stockCount: expiredUnits.length,
        oldestStockAge: expiredUnits.length ? Math.max(...expiredUnits.map((unit) => unit.stockAge)) : 0,
        thresholdDays: 60,
        purchaseValue: expiredUnits.reduce((sum, unit) => sum + unit.purchasePrice, 0)
      } satisfies StockReturnAlarm;
    })
    .sort((a, b) => a.branchName.localeCompare(b.branchName, "tr") || b.stockCount - a.stockCount || b.oldestStockAge - a.oldestStockAge);

  const returnUnits: StockReturnUnit[] = inventory
    .filter((unit) => {
      const threshold = normalizeKey(unit.brand).includes("IPHONE") || normalizeKey(unit.brand).includes("APPLE") ? 20 : 30;
      return unit.stockAge >= threshold;
    })
    .map((unit): StockReturnUnit => ({
      productName: unit.productName,
      branchName: unit.branchName,
      serialNumber: unit.serialNumber,
      stockAge: unit.stockAge,
      status: unit.stockAge > 60 ? "İade süresi geçmiş" : "İade alarmı"
    }))
    .sort((a, b) => a.branchName.localeCompare(b.branchName, "tr") || b.stockAge - a.stockAge);

  const transfers: StockTransferSuggestion[] = [];
  const productShortNames = Array.from(new Set(rows.map((row) => normalizeKey(row.productShortName))));
  productShortNames.forEach((productKey) => {
    const productRows = rows.filter((row) => normalizeKey(row.productShortName) === productKey);
    const receivers = productRows
      .filter((row) => row.orderQuantity > 0)
      .map((row) => ({ row, need: row.orderQuantity }))
      .sort((a, b) => b.need - a.need);
    const senders = productRows
      .map((row) => ({
        row,
        available: Math.max(0, row.currentStock - Math.ceil((row.sales30 / 30) * ORDER_COVERAGE_DAYS))
      }))
      .filter((item) => item.available > 0)
      .sort((a, b) => b.available - a.available);

    receivers.forEach((receiver) => {
      for (const sender of senders) {
        if (receiver.need <= 0) break;
        if (sender.available <= 0 || sender.row.branchName === receiver.row.branchName) continue;
        const quantity = Math.min(receiver.need, sender.available);
        transfers.push({
          productCode: receiver.row.productCode,
          productName: receiver.row.productName,
          fromBranch: sender.row.branchName,
          toBranch: receiver.row.branchName,
          quantity,
          receiverSales30: receiver.row.sales30
        });
        receiver.row.transferIncoming += quantity;
        receiver.need -= quantity;
        sender.available -= quantity;
      }
      receiver.row.orderQuantity = receiver.need;
    });
  });

  rows.sort((a, b) => b.orderQuantity - a.orderQuantity || b.sales30 - a.sales30 || a.productName.localeCompare(b.productName, "tr"));

  const branches = Array.from(new Set(rows.map((row) => row.branchName))).sort((a, b) => a.localeCompare(b, "tr"));
  return {
    rows,
    transfers,
    returnAlarms,
    expiredReturns,
    returnUnits,
    branches,
    updatedAt: now.toISOString(),
    totals: {
      currentStock: inventory.length,
      sales30: Array.from(sales30Map.values()).reduce((sum, value) => sum + value, 0),
      orderQuantity: rows.reduce((sum, row) => sum + row.orderQuantity, 0),
      transferQuantity: transfers.reduce((sum, row) => sum + row.quantity, 0),
      returnAlarmCount: returnAlarms.reduce((sum, row) => sum + row.stockCount, 0),
      expiredReturnCount: expiredReturns.reduce((sum, row) => sum + row.stockCount, 0),
      stockValue: inventory.reduce((sum, unit) => sum + unit.purchasePrice, 0)
    }
  };
}
