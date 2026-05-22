export type AymadaStockCategory = "smartphone" | "tablet" | "iot";

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
    sampleRecords: XmlRecord[];
  };
};

type XmlRecord = Record<string, string>;

const DEFAULT_PRODUCT_SERVICE_URL = "https://portal.aymada.com/WebService/WSIntegrationProduct.asmx";

function requireConfig() {
  const firmApiCode = process.env.AYMADA_FIRM_API_CODE?.trim();
  const userName = process.env.AYMADA_USERNAME?.trim();
  const password = process.env.AYMADA_PASSWORD?.trim();
  const productServiceUrl =
    process.env.AYMADA_PRODUCT_SERVICE_URL?.trim() ||
    process.env.AYMADA_CUSTOM_PRODUCT_SERVICE_URL?.trim() ||
    DEFAULT_PRODUCT_SERVICE_URL;

  if (!firmApiCode || !userName || !password) {
    throw new Error(
      "Aymada API bilgileri tanimli degil. AYMADA_FIRM_API_CODE, AYMADA_USERNAME ve AYMADA_PASSWORD eklenmeli."
    );
  }

  return { firmApiCode, userName, password, productServiceUrl };
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

function compactText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

function recordFromBlock(block: string) {
  const tags = [
    "ProductCardID",
    "ProductCardCode",
    "ProductBarcode",
    "ProductCardName",
    "StockCount",
    "ProductTypeID",
    "ProductTypeName",
    "CategoryID",
    "CategoryName",
    "MainCategoryID",
    "MainCategoryName"
  ];
  const record: XmlRecord = {};

  for (const tag of tags) {
    const value = extractTag(block, tag);
    if (value) record[tag] = value;
  }

  return record;
}

function buildProductRecordList(xml: string) {
  const normalizedXml = normalizeTagNames(xml);
  const records = extractBlocks(normalizedXml, "IntegrationProducts").map(recordFromBlock);

  if (records.length > 0) return records;

  return extractBlocks(normalizedXml, "Table").map(recordFromBlock);
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

function buildGetProductsSoapBody(input: { firmApiCode: string; userName: string; password: string }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetProducts xmlns="http://tempuri.org/">
      <firmApiCode>${xmlEscape(input.firmApiCode)}</firmApiCode>
      <userName>${xmlEscape(input.userName)}</userName>
      <password>${xmlEscape(input.password)}</password>
    </GetProducts>
  </soap:Body>
</soap:Envelope>`;
}

async function postSoapGetProducts(input: {
  productServiceUrl: string;
  firmApiCode: string;
  userName: string;
  password: string;
}) {
  const response = await fetch(input.productServiceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://tempuri.org/GetProducts"
    },
    body: buildGetProductsSoapBody(input),
    cache: "no-store",
    next: { revalidate: 0 }
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Aymada stok servisi yanit vermedi: ${response.status}`);
  }

  const serviceError = getAymadaErrorMessage(text);
  if (serviceError) throw new Error(serviceError);

  return text;
}

async function postFormGetProducts(input: {
  productServiceUrl: string;
  firmApiCode: string;
  userName: string;
  password: string;
}) {
  const url = `${input.productServiceUrl.replace(/\/$/, "")}/GetProducts`;
  const body = new URLSearchParams({
    firmApiCode: input.firmApiCode,
    userName: input.userName,
    password: input.password
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
  if (serviceError) throw new Error(serviceError);

  return text;
}

async function getProductsHttp(input: {
  productServiceUrl: string;
  firmApiCode: string;
  userName: string;
  password: string;
}) {
  const url = new URL(`${input.productServiceUrl.replace(/\/$/, "")}/GetProducts`);
  url.searchParams.set("firmApiCode", input.firmApiCode);
  url.searchParams.set("userName", input.userName);
  url.searchParams.set("password", input.password);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    next: { revalidate: 0 }
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Aymada stok servisi yanit vermedi: ${response.status}`);
  }

  const serviceError = getAymadaErrorMessage(text);
  if (serviceError) throw new Error(serviceError);

  return text;
}

async function callGetProductsService() {
  const input = requireConfig();
  const attempts = [
    () => postSoapGetProducts(input),
    () => postFormGetProducts(input),
    () => getProductsHttp(input)
  ];
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Bilinmeyen hata");
    }
  }

  throw new Error(`Aymada GetProducts servisi okunamadi. Denenen yollar: ${errors.join(" | ")}`);
}

function detectCategory(record: XmlRecord): AymadaStockCategory | null {
  const text = compactText(
    [
      getFirst(record, ["CategoryName"]),
      getFirst(record, ["MainCategoryName"]),
      getFirst(record, ["ProductCardName"]),
      getFirst(record, ["ProductCardCode"])
    ].join(" ")
  );

  if (text.includes("SMARTPHONE") || text.includes("AKILLI TELEFON") || text.includes("TELEFON")) {
    return "smartphone";
  }
  if (text.includes("TABLET")) return "tablet";
  if (text.includes("IOT") || text.includes("I O T")) return "iot";

  return null;
}

function isDeviceRecord(record: XmlRecord) {
  const typeText = compactText(getFirst(record, ["ProductTypeName"]));
  if (!typeText) return true;
  return (
    typeText.includes("CIHAZ") ||
    typeText.includes("DEVICE") ||
    typeText.includes("SMARTPHONE") ||
    typeText.includes("TELEFON") ||
    typeText.includes("TABLET") ||
    typeText.includes("IOT")
  );
}

function toStockProduct(record: XmlRecord): AymadaStockProduct | null {
  const category = detectCategory(record);
  if (!category || !isDeviceRecord(record)) return null;

  const stockCount = parseNumber(getFirst(record, ["StockCount"]));
  if (stockCount <= 0) return null;

  return {
    productCardId: getFirst(record, ["ProductCardID"]),
    productCardCode: getFirst(record, ["ProductCardCode"]),
    productBarcode: getFirst(record, ["ProductBarcode"]),
    productCardName: getFirst(record, ["ProductCardName"]) || "Urun adi yok",
    productTypeName: getFirst(record, ["ProductTypeName"]) || "Cihaz",
    categoryName: getFirst(record, ["CategoryName"]),
    mainCategoryName: getFirst(record, ["MainCategoryName"]),
    category,
    stockCount
  };
}

export async function fetchAymadaBranchStocks(): Promise<AymadaStockResult> {
  const xml = await callGetProductsService();
  const records = buildProductRecordList(xml);
  const products = records
    .map(toStockProduct)
    .filter((product): product is AymadaStockProduct => Boolean(product))
    .sort(
      (a, b) =>
        b.stockCount - a.stockCount ||
        a.category.localeCompare(b.category, "tr") ||
        a.productCardName.localeCompare(b.productCardName, "tr")
    );

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

  const rows: AymadaBranchStock[] =
    totals.total > 0
      ? [
          {
            branchCode: "",
            branchName: "Genel stok",
            smartphone: totals.totalSmartphone,
            tablet: totals.totalTablet,
            iot: totals.totalIot,
            total: totals.total
          }
        ]
      : [];

  return {
    rows,
    products,
    ...totals,
    updatedAt: new Date().toISOString(),
    warning:
      records.length > 0 && products.length === 0
        ? "Aymada verisi okundu fakat cihaz/smartphone/tablet/iot eslesmesi bulunamadi. ProductTypeName, CategoryName ve MainCategoryName alanlari kontrol edilmeli."
        : "Aymada Custom API GetProducts servisi stok adetini genel toplam olarak veriyor; sube bilgisi bu serviste bulunmuyor.",
    debug:
      process.env.AYMADA_STOCK_DEBUG === "true"
        ? {
            recordCount: records.length,
            sampleRecords: records.slice(0, 5)
          }
        : undefined
  };
}
