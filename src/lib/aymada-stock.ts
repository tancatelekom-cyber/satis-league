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
  debug?: {
    recordCount: number;
    productCardLookups: number;
    sampleRecords: XmlRecord[];
  };
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
  return typeText.includes("CIHAZ") || typeText.includes("CİHAZ") || typeText.includes("DEVICE");
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
  const isComplete = process.env.AYMADA_STOCK_IS_COMPLETE?.trim() || "true";

  return { start, end, isComplete };
}

function buildSoapBody(input: {
  firmApiCode: string;
  userName: string;
  password: string;
  start: string;
  end: string;
  isComplete: string;
}) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetInventoryList xmlns="http://tempuri.org/">
      <FirmApiCode>${xmlEscape(input.firmApiCode)}</FirmApiCode>
      <UserName>${xmlEscape(input.userName)}</UserName>
      <Password>${xmlEscape(input.password)}</Password>
      <CLCardCode></CLCardCode>
      <StartDate>${xmlEscape(input.start)}</StartDate>
      <EndDate>${xmlEscape(input.end)}</EndDate>
      <IsComplete>${xmlEscape(input.isComplete)}</IsComplete>
    </GetInventoryList>
  </soap:Body>
</soap:Envelope>`;

  return body;
}

function buildProductCardSoapBody(input: {
  firmApiCode: string;
  userName: string;
  password: string;
  productCardId: string;
}) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetProductCard xmlns="http://tempuri.org/">
      <FirmApiCode>${xmlEscape(input.firmApiCode)}</FirmApiCode>
      <UserName>${xmlEscape(input.userName)}</UserName>
      <Password>${xmlEscape(input.password)}</Password>
      <ProductCardID>${xmlEscape(input.productCardId)}</ProductCardID>
    </GetProductCard>
  </soap:Body>
</soap:Envelope>`;
}

function getAymadaErrorMessage(text: string) {
  const normalized = normalizeTagNames(text);
  const statusCode = extractTag(normalized, "StatusCode");
  const statusMessage = extractTag(normalized, "StatusMessage");
  const fault = extractTag(normalized, "faultstring");
  const message = statusMessage || fault;

  if (statusCode && statusCode !== "0") {
    return message && message !== "ERROR" ? message : "Aymada servisi ERROR dondu.";
  }

  if (fault) return fault;

  return "";
}

async function postSoapInventory(input: {
  serviceUrl: string;
  firmApiCode: string;
  userName: string;
  password: string;
  start: string;
  end: string;
  isComplete: string;
}) {
  const body = buildSoapBody(input);

  const response = await fetch(input.serviceUrl, {
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

  const serviceError = getAymadaErrorMessage(text);
  if (serviceError) {
    throw new Error(serviceError);
  }

  return text;
}

async function postSoapProductCard(input: {
  serviceUrl: string;
  firmApiCode: string;
  userName: string;
  password: string;
  productCardId: string;
}) {
  const response = await fetch(input.serviceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://tempuri.org/GetProductCard"
    },
    body: buildProductCardSoapBody(input),
    cache: "no-store",
    next: { revalidate: 0 }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Aymada urun karti servisi yanit vermedi: ${response.status}`);
  }

  const serviceError = getAymadaErrorMessage(text);
  if (serviceError) {
    throw new Error(serviceError);
  }

  return text;
}

async function postFormProductCard(input: {
  serviceUrl: string;
  firmApiCode: string;
  userName: string;
  password: string;
  productCardId: string;
}) {
  const url = `${input.serviceUrl.replace(/\/$/, "")}/GetProductCard`;
  const body = new URLSearchParams({
    FirmApiCode: input.firmApiCode,
    UserName: input.userName,
    Password: input.password,
    ProductCardID: input.productCardId
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store",
    next: { revalidate: 0 }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Aymada urun karti servisi yanit vermedi: ${response.status}`);
  }

  const serviceError = getAymadaErrorMessage(text);
  if (serviceError) {
    throw new Error(serviceError);
  }

  return text;
}

async function postFormInventory(input: {
  serviceUrl: string;
  firmApiCode: string;
  userName: string;
  password: string;
  start: string;
  end: string;
  isComplete: string;
}) {
  const url = `${input.serviceUrl.replace(/\/$/, "")}/GetInventoryList`;
  const body = new URLSearchParams({
    FirmApiCode: input.firmApiCode,
    UserName: input.userName,
    Password: input.password,
    CLCardCode: "",
    StartDate: input.start,
    EndDate: input.end,
    IsComplete: input.isComplete
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store",
    next: { revalidate: 0 }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Aymada stok servisi yanit vermedi: ${response.status}`);
  }

  const serviceError = getAymadaErrorMessage(text);
  if (serviceError) {
    throw new Error(serviceError);
  }

  return text;
}

async function callInventoryService() {
  const { firmApiCode, userName, password, serviceUrl } = requireConfig();
  const { start, end, isComplete } = getDateRange();
  const preferredComplete = compactText(isComplete) === "FALSE" ? "false" : "true";
  const fallbackComplete = preferredComplete === "true" ? "false" : "true";
  const attempts = [
    { type: "soap", isComplete: preferredComplete },
    { type: "soap", isComplete: fallbackComplete },
    { type: "form", isComplete: preferredComplete },
    { type: "form", isComplete: fallbackComplete }
  ];
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const input = { serviceUrl, firmApiCode, userName, password, start, end, isComplete: attempt.isComplete };
      return attempt.type === "soap" ? await postSoapInventory(input) : await postFormInventory(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen hata";
      errors.push(`${attempt.type}/${attempt.isComplete}: ${message}`);
    }
  }

  throw new Error(`Aymada stok servisi okunamadi. Denenen yollar: ${errors.join(" | ")}`);
}

async function fetchProductCardDetail(productCardId: string) {
  const { firmApiCode, userName, password, serviceUrl } = requireConfig();
  const input = { serviceUrl, firmApiCode, userName, password, productCardId };
  const commonTags = [
    "ProductCardID",
    "ProductCardCode",
    "ProductCardName",
    "CategoryID",
    "CategoryName",
    "MainCategoryID",
    "MainCategoryName",
    "ProductTypeID",
    "ProductTypeName",
    "VATRatio",
    "UnitType",
    "SerialNoControl",
    "SerialNoKontrol"
  ];

  try {
    return recordFromBlock(normalizeTagNames(await postSoapProductCard(input)), commonTags);
  } catch {
    return recordFromBlock(normalizeTagNames(await postFormProductCard(input)), commonTags);
  }
}

export async function fetchAymadaBranchStocks(): Promise<AymadaStockResult> {
  const xml = await callInventoryService();
  const records = buildRecordList(xml);
  const productCardCache = new Map<string, XmlRecord | null>();
  const map = new Map<string, AymadaBranchStock>();
  let matchedRecords = 0;
  const sampleRecords: XmlRecord[] = [];

  for (const baseRecord of records) {
    let record = baseRecord;
    const productCardId = getFirst(baseRecord, ["ProductCardID"]);

    if (productCardId) {
      if (!productCardCache.has(productCardId)) {
        try {
          productCardCache.set(productCardId, await fetchProductCardDetail(productCardId));
        } catch {
          productCardCache.set(productCardId, null);
        }
      }

      record = { ...baseRecord, ...(productCardCache.get(productCardId) ?? {}) };
    }

    if (sampleRecords.length < 5) {
      sampleRecords.push(record);
    }

    const category = detectCategory(record);
    if (!category) continue;

    if (!isDeviceRecord(record)) continue;

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
        : undefined,
    debug:
      process.env.AYMADA_STOCK_DEBUG === "true"
        ? {
            recordCount: records.length,
            productCardLookups: productCardCache.size,
            sampleRecords
          }
        : undefined
  };
}
