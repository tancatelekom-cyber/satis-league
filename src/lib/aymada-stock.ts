export type AymadaStockCategory = "smartphone" | "tablet" | "iot";

export type AymadaBranchStock = {
  branchCode: string;
  branchName: string;
  smartphone: number;
  tablet: number;
  iot: number;
  total: number;
};

export type AymadaStockResult = {
  rows: AymadaBranchStock[];
  totalSmartphone: number;
  totalTablet: number;
  totalIot: number;
  total: number;
  updatedAt: string;
  warning?: string;
};

type XmlRecord = Record<string, string>;

const DEFAULT_SERVICE_URL = "https://portal.aymada.com/WebService/WSAccountEntegration.asmx";

function requireConfig() {
  const firmApiCode = process.env.AYMADA_FIRM_API_CODE?.trim();
  const userName = process.env.AYMADA_USERNAME?.trim();
  const password = process.env.AYMADA_PASSWORD?.trim();
  const serviceUrl = process.env.AYMADA_SERVICE_URL?.trim() || DEFAULT_SERVICE_URL;

  if (!firmApiCode || !userName || !password) {
    throw new Error(
      "Aymada API bilgileri tanimli degil. AYMADA_FIRM_API_CODE, AYMADA_USERNAME ve AYMADA_PASSWORD eklenmeli."
    );
  }

  return { firmApiCode, userName, password, serviceUrl };
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function normalizeTagNames(xml: string) {
  return xml.replace(/(<\/?)[A-Za-z0-9_-]+:/g, "$1");
}

function extractTag(block: string, tagName: string) {
  const match = block.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function extractBlocks(xml: string, tagName: string) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "gi"))).map(
    (match) => match[1]
  );
}

function recordFromBlock(block: string, preferredTags: string[]) {
  const record: XmlRecord = {};

  for (const tag of preferredTags) {
    const value = extractTag(block, tag);
    if (value) record[tag] = value;
  }

  return record;
}

function compactText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getFirst(record: XmlRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value) return value;
  }
  return "";
}

function parseNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function detectCategory(record: XmlRecord): AymadaStockCategory | null {
  const text = compactText(
    [
      getFirst(record, ["CategoryName", "SubCategoryName", "MainCategoryName", "ProductCategoryName"]),
      getFirst(record, ["ProductCardName", "ProductName", "ProductCodeName", "ProductCode Name"])
    ].join(" ")
  );

  if (text.includes("SMARTPHONE") || text.includes("AKILLI TELEFON") || text.includes("TELEFON")) {
    return "smartphone";
  }
  if (text.includes("TABLET")) return "tablet";
  if (text.includes("IOT")) return "iot";

  return null;
}

function isDeviceRecord(record: XmlRecord) {
  const typeText = compactText(getFirst(record, ["ProductTypeName", "ProductCardTypeName", "ProductType", "TypeName"]));
  if (!typeText) return true;
  return typeText.includes("CIHAZ") || typeText.includes("DEVICE");
}

function getQuantity(record: XmlRecord) {
  const value = getFirst(record, [
    "ProductCount",
    "StockCount",
    "StockQuantity",
    "Quantity",
    "Unit",
    "Count",
    "MoveCount",
    "OrderCount"
  ]);

  if (value) return parseNumber(value);
  return getFirst(record, ["SerialNumber", "Barcode", "ProductCardCode", "ProductName", "ProductCardName"]) ? 1 : 0;
}

function buildRecordList(xml: string) {
  const normalizedXml = normalizeTagNames(xml);
  const commonTags = [
    "FirmCode",
    "FirmName",
    "BranchCode",
    "BranchName",
    "WarehouseCode",
    "WarehouseName",
    "ProductCardID",
    "ProductCardCode",
    "ProductCardName",
    "ProductName",
    "ProductCodeName",
    "ProductCode Name",
    "ProductType",
    "ProductTypeName",
    "ProductCardTypeName",
    "CategoryName",
    "SubCategoryName",
    "MainCategoryName",
    "ProductCategoryName",
    "ProductCount",
    "StockCount",
    "StockQuantity",
    "Quantity",
    "Unit",
    "Count",
    "SerialNumber",
    "Barcode"
  ];

  const records: XmlRecord[] = [];
  const inventoryBlocks = extractBlocks(normalizedXml, "WSInventoryControl");

  for (const inventoryBlock of inventoryBlocks) {
    const parent = recordFromBlock(inventoryBlock, commonTags);
    const detailBlocks = extractBlocks(inventoryBlock, "WSInventoryControlDetail");

    if (detailBlocks.length === 0) {
      records.push(parent);
      continue;
    }

    for (const detailBlock of detailBlocks) {
      records.push({ ...parent, ...recordFromBlock(detailBlock, commonTags) });
    }
  }

  if (records.length > 0) return records;

  for (const rowTag of [
    "WSInventoryControlDetail",
    "WSStock",
    "Stock",
    "StockItem",
    "ProductStock",
    "Inventory",
    "InventoryItem",
    "Table"
  ]) {
    for (const block of extractBlocks(normalizedXml, rowTag)) {
      records.push(recordFromBlock(block, commonTags));
    }
  }

  return records;
}

function formatSoapDate(date: Date) {
  return date.toISOString().slice(0, 19);
}

function getDateRange() {
  const now = new Date();
  const start = process.env.AYMADA_STOCK_START_DATE?.trim() || "2000-01-01T00:00:00";
  const end = process.env.AYMADA_STOCK_END_DATE?.trim() || formatSoapDate(now);
  const isComplete = process.env.AYMADA_STOCK_IS_COMPLETE?.trim() || "false";

  return { start, end, isComplete };
}

async function callInventoryService() {
  const { firmApiCode, userName, password, serviceUrl } = requireConfig();
  const { start, end, isComplete } = getDateRange();

  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetInventoryList xmlns="http://tempuri.org/">
      <FirmApiCode>${xmlEscape(firmApiCode)}</FirmApiCode>
      <UserName>${xmlEscape(userName)}</UserName>
      <Password>${xmlEscape(password)}</Password>
      <CLCardCode></CLCardCode>
      <StartDate>${xmlEscape(start)}</StartDate>
      <EndDate>${xmlEscape(end)}</EndDate>
      <IsComplete>${xmlEscape(isComplete)}</IsComplete>
    </GetInventoryList>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(serviceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://tempuri.org/GetInventoryList"
    },
    body,
    cache: "no-store",
    next: { revalidate: 0 }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Aymada stok servisi yanit vermedi: ${response.status}`);
  }

  const statusCode = extractTag(normalizeTagNames(text), "StatusCode");
  const statusMessage = extractTag(normalizeTagNames(text), "StatusMessage");
  if (statusCode && statusCode !== "0") {
    throw new Error(statusMessage || "Aymada stok servisi hata dondurdu.");
  }

  return text;
}

export async function fetchAymadaBranchStocks(): Promise<AymadaStockResult> {
  const xml = await callInventoryService();
  const records = buildRecordList(xml);
  const map = new Map<string, AymadaBranchStock>();
  let matchedRecords = 0;

  for (const record of records) {
    if (!isDeviceRecord(record)) continue;

    const category = detectCategory(record);
    if (!category) continue;

    const quantity = getQuantity(record);
    if (quantity <= 0) continue;

    matchedRecords += 1;

    const branchCode = getFirst(record, ["FirmCode", "BranchCode", "WarehouseCode"]);
    const branchName = getFirst(record, ["FirmName", "BranchName", "WarehouseName"]) || branchCode || "Sube belirtilmedi";
    const key = `${branchCode || branchName}`.trim();
    const row =
      map.get(key) ??
      ({
        branchCode,
        branchName,
        smartphone: 0,
        tablet: 0,
        iot: 0,
        total: 0
      } satisfies AymadaBranchStock);

    row[category] += quantity;
    row.total += quantity;
    map.set(key, row);
  }

  const rows = [...map.values()].sort((a, b) => b.total - a.total || a.branchName.localeCompare(b.branchName, "tr"));
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalSmartphone += row.smartphone;
      acc.totalTablet += row.tablet;
      acc.totalIot += row.iot;
      acc.total += row.total;
      return acc;
    },
    { totalSmartphone: 0, totalTablet: 0, totalIot: 0, total: 0 }
  );

  return {
    rows,
    ...totals,
    updatedAt: new Date().toISOString(),
    warning:
      records.length > 0 && matchedRecords === 0
        ? "Aymada verisi okundu fakat cihaz/smartphone/tablet/iot eslesmesi bulunamadi. API alan adlari kontrol edilmeli."
        : undefined
  };
}
