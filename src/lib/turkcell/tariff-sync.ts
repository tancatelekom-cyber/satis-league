import { createAdminClient } from "@/lib/supabase/admin";
import { TariffRecord } from "@/lib/types";

const TURKCELL_TARIFF_URL = "https://www.turkcell.com.tr/paket-ve-tarifeler/faturali-hat";
const TURKCELL_NEW_MEMBER_URL = "https://www.turkcell.com.tr/trc/turkcellli-olmak/paket-secimi";
const TURKCELL_EXTRA_TARIFF_URLS = [
  "https://www.turkcell.com.tr/paket-ve-tarifeler/yeni-musteri-paketleri/emek-5-gb",
  "https://www.turkcell.com.tr/paket-ve-tarifeler/yeni-musteri-paketleri/emek-10-gb",
  "https://www.turkcell.com.tr/paket-ve-tarifeler/yeni-musteri-paketleri/emek-20-gb",
  "https://www.turkcell.com.tr/paket-ve-tarifeler/yeni-musteri-paketleri/emek-30-gb",
  "https://www.turkcell.com.tr/paket-ve-tarifeler/yeni-musteri-paketleri/5g-emekli-5-gb",
  "https://www.turkcell.com.tr/paket-ve-tarifeler/yeni-musteri-paketleri/5g-emekli-20-gb",
  "https://www.turkcell.com.tr/kampanyalar/mobil-hat-data-hatti-kampanyalari/yeni-turkcell-musterisi/5g-emekli-10-gb",
  "https://www.turkcell.com.tr/kampanyalar/mobil-hat-data-hatti-kampanyalari/yeni-turkcell-musterisi/5g-emekli-30-gb"
];

type TurkcellBenefit = {
  value?: string | number | null;
  unitValue?: string | null;
  type?: string | null;
};

type TurkcellPackage = {
  id?: string;
  title?: string;
  shortDescription?: string | null;
  endpoint?: string | null;
  fullUrl?: string | null;
  paymentType?: string | null;
  benefits?: TurkcellBenefit[] | null;
  selectedTags?: Array<{ title?: string | null }> | null;
  price?: {
    amount?: string | number | null;
    amountDouble?: number | null;
    onlineExclusive?: boolean | null;
  } | null;
  cpcmTariffOfferId?: string | null;
  tab?: string | null;
};

type TurkcellPackageSource = {
  package: TurkcellPackage;
  sourceUrl: string;
};

type TariffUpsertPayload = Omit<
  TariffRecord,
  "id" | "created_at" | "updated_at"
> & { updated_at?: string };

function normalizeText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string) {
  return normalizeText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  let normalized = String(value ?? "").replace(/\s+/g, "").trim();

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else {
    normalized = normalized.replace(",", ".");
  }

  normalized = normalized.replace(/[^\d.]/g, "");

  return normalized ? Number(normalized) : 0;
}

function collectPackageArrays(value: unknown, collected: TurkcellPackage[][] = []) {
  if (!value || typeof value !== "object") {
    return collected;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPackageArrays(item, collected));
    return collected;
  }

  const record = value as Record<string, unknown>;

  if (
    Array.isArray(record.packages) &&
    record.packages.every((item) => item && typeof item === "object")
  ) {
    collected.push(record.packages as TurkcellPackage[]);
  }

  Object.values(record).forEach((item) => collectPackageArrays(item, collected));
  return collected;
}

function isPackageCandidate(value: unknown): value is TurkcellPackage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.title === "string" &&
    typeof record.paymentType === "string" &&
    "price" in record &&
    ("cpcmTariffOfferId" in record || "benefits" in record)
  );
}

function collectPackageObjects(value: unknown, collected: TurkcellPackage[] = []) {
  if (!value || typeof value !== "object") {
    return collected;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPackageObjects(item, collected));
    return collected;
  }

  if (isPackageCandidate(value)) {
    collected.push(value);
  }

  Object.values(value as Record<string, unknown>).forEach((item) => collectPackageObjects(item, collected));
  return collected;
}

function isDigitalOnly(pkg: TurkcellPackage) {
  const selectedTagText = (pkg.selectedTags ?? [])
    .map((tag) => normalizeText(tag?.title ?? ""))
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  const text = `${pkg.title ?? ""} ${pkg.shortDescription ?? ""} ${selectedTagText}`.toLocaleLowerCase("tr-TR");

  return /online.?a ozel|online ozel|online.?ozel|dijital.?e ozel|dijital ozel|dijital.?ozel|sadece dijital|sadece online|web.?e ozel|uygulama.?ya ozel/.test(
    text
  );
}

function isYapbozPackage(pkg: TurkcellPackage) {
  const selectedTagText = (pkg.selectedTags ?? [])
    .map((tag) => normalizeText(tag?.title ?? ""))
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  const text = `${pkg.title ?? ""} ${pkg.shortDescription ?? ""} ${selectedTagText} ${pkg.tab ?? ""} ${pkg.endpoint ?? ""} ${pkg.fullUrl ?? ""}`.toLocaleLowerCase(
    "tr-TR"
  );

  return /yapboz|paketini sen olustur|paketini sen oluştur/.test(text);
}

function isCorePostpaidTariff(pkg: TurkcellPackage) {
  const title = (pkg.title ?? "").toLocaleLowerCase("tr-TR");
  const paymentType = String(pkg.paymentType ?? "").toUpperCase();
  const isYapboz = isYapbozPackage(pkg);

  if (!isYapboz && paymentType !== "POSTPAID") {
    return false;
  }

  if (isYapboz && paymentType === "PREPAID") {
    return false;
  }

  if (!pkg.cpcmTariffOfferId && !isYapboz) {
    return false;
  }

  if (pkg.price?.onlineExclusive && !isYapboz) {
    return false;
  }

  if (isDigitalOnly(pkg) && !isYapboz) {
    return false;
  }

  if (/superbox|mobil wifi|hotspot|gezgin|oyna|izle/.test(title)) {
    return false;
  }

  if (
    /(ek paket|günlük|haftalık|sms paketi|dakika paketi|internet paketi|akıllı fatura tl paketi)/.test(
      title
    )
  ) {
    return false;
  }

  return true;
}

function inferCategoryName(name: string, selectedTags?: Array<{ title?: string | null }> | null) {
  const lower = name.toLocaleLowerCase("tr-TR");

  if (lower.includes("yapboz")) return "Yapboz";
  if (lower.includes("emekli")) return "Emekli";
  if (/\bemek\b/.test(lower)) return "Emek";

  const selectedTag = selectedTags?.find((tag) => tag?.title)?.title?.trim();
  if (selectedTag) {
    const normalizedTag = normalizeText(selectedTag).toLocaleLowerCase("tr-TR");
    if (/ilk turkcell|yeni turkcell/.test(normalizedTag)) {
      return normalizeText(name);
    }
    return normalizeText(selectedTag);
  }

  if (lower.includes("platinum+ black")) return "Platinum+ Black";
  if (lower.includes("platinum+")) return "Platinum+";
  if (lower.includes("platinum prestij")) return "Platinum Prestij";
  if (lower.includes("prestij")) return "Prestij";
  if (lower.includes("star+")) return "Star+";
  if (lower.includes("gnç+")) return "GNÇ+";
  if (lower.includes("mavi")) return "Mavi";
  if (lower.includes("5g+")) return "5G+";
  if (lower.includes("esneyen")) return "Esneyen";
  if (lower.includes("tek hattım") || lower.includes("tek hattim")) return "Tek Hattim";
  if (lower.includes("yıllık") || lower.includes("yillik")) return "Yillik";

  return "Genel";
}

function parseBenefits(benefits: TurkcellBenefit[] | null | undefined) {
  let dataGb = 0;
  let minutes = 0;
  let sms = 0;

  (benefits ?? []).forEach((benefit) => {
    const type = String(benefit.type ?? "").toUpperCase();
    const unit = String(benefit.unitValue ?? "").toUpperCase();
    const value = toNumber(benefit.value);

    if (type === "INTERNET" || unit.includes("GB")) {
      dataGb += value;
      return;
    }

    if (type === "VOICE" || unit.includes("DK")) {
      minutes += value;
      return;
    }

    if (type === "SMS" || unit.includes("SMS")) {
      sms += value;
    }
  });

  return { dataGb, minutes, sms };
}

function buildFallbackPackageFromHtml(url: string, html: string): TurkcellPackage | null {
  const text = stripHtml(html);
  const titleMatch =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ??
    html.match(/<title>([^<]+)<\/title>/i) ??
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const rawTitle = titleMatch?.[1] ? normalizeText(titleMatch[1]) : "";
  const title = rawTitle.replace(/\s*\|\s*Turkcell$/i, "").trim();

  if (!title) {
    return null;
  }

  const dataMatch = text.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
  const minuteMatch = text.match(/(\d[\d.,]*)\s*DK/i);
  const smsMatch = text.match(/(\d[\d.,]*)\s*SMS/i);

  const taahhutluSegment =
    text.match(/TAAHHÜTLÜ ABONELİK\s+(\d[\d.,]*)\s*TL/i) ??
    text.match(/Taahhütlü Abonelik\s+(\d[\d.,]*)\s*TL/i) ??
    text.match(/(\d[\d.,]*)\s*TL/i);

  const descriptionMatch =
    html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ??
    html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);

  return {
    id: url,
    title,
    shortDescription: descriptionMatch?.[1] ? normalizeText(descriptionMatch[1]) : null,
    fullUrl: url,
    paymentType: "POSTPAID",
    cpcmTariffOfferId: url,
    benefits: [
      { type: "INTERNET", unitValue: "GB", value: dataMatch?.[1] ? toNumber(dataMatch[1]) : 0 },
      { type: "VOICE", unitValue: "DK", value: minuteMatch?.[1] ? toNumber(minuteMatch[1]) : 0 },
      { type: "SMS", unitValue: "SMS", value: smsMatch?.[1] ? toNumber(smsMatch[1]) : 0 }
    ],
    price: {
      amountDouble: taahhutluSegment?.[1] ? toNumber(taahhutluSegment[1]) : 0,
      onlineExclusive: false
    },
    selectedTags: []
  };
}

function packageToTariff(pkg: TurkcellPackageSource): TariffUpsertPayload {
  const item = pkg.package;
  const details = normalizeText(item.shortDescription ?? "");
  const benefits = parseBenefits(item.benefits);
  const isYapboz = isYapbozPackage(item);
  const now = new Date().toISOString();

  return {
    provider: "Turkcell",
    source_url:
      item.fullUrl || (item.endpoint ? `https://www.turkcell.com.tr${item.endpoint}` : pkg.sourceUrl),
    name: normalizeText(item.title ?? "Turkcell Tarifesi"),
    category_name: inferCategoryName(item.title ?? "", item.selectedTags),
    line_type: "faturali",
    data_gb: benefits.dataGb,
    minutes: Math.round(benefits.minutes),
    sms: Math.round(benefits.sms),
    price: Number(item.price?.amountDouble ?? toNumber(item.price?.amount)),
    details: details || null,
    is_online_only: !isYapboz && (Boolean(item.price?.onlineExclusive) || isDigitalOnly(item)),
    is_digital_only: !isYapboz && isDigitalOnly(item),
    is_active: true,
    scraped_at: now,
    updated_at: now
  };
}

async function fetchTurkcellPackagesFrom(url: string) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "tr-TR,tr;q=0.9"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Turkcell sayfasi acilamadi: ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (!match?.[1]) {
    throw new Error("Turkcell sayfasindaki gomulu tarife verisi bulunamadi.");
  }

  const nextData = JSON.parse(match[1]);
  const packageArrays = collectPackageArrays(nextData);
  const packageObjects = collectPackageObjects(nextData);
  const uniqueMap = new Map<string, TurkcellPackageSource>();

  packageArrays.flat().forEach((pkg) => {
    if (!pkg?.id) {
      return;
    }

    uniqueMap.set(pkg.id, { package: pkg, sourceUrl: url });
  });

  packageObjects.forEach((pkg) => {
    const key = pkg.id || pkg.fullUrl || pkg.endpoint || pkg.title;
    if (!key) {
      return;
    }

    uniqueMap.set(key, { package: pkg, sourceUrl: url });
  });

  if (uniqueMap.size === 0) {
    const fallbackPackage = buildFallbackPackageFromHtml(url, html);
    if (fallbackPackage) {
      uniqueMap.set(fallbackPackage.id || fallbackPackage.title || url, {
        package: fallbackPackage,
        sourceUrl: url
      });
    }
  }

  return Array.from(uniqueMap.values()).filter((item) => isCorePostpaidTariff(item.package));
}

async function fetchTurkcellPackages() {
  const [corePackages, newMemberPackages, ...extraPackages] = await Promise.all([
    fetchTurkcellPackagesFrom(TURKCELL_TARIFF_URL),
    fetchTurkcellPackagesFrom(TURKCELL_NEW_MEMBER_URL),
    ...TURKCELL_EXTRA_TARIFF_URLS.map((url) => fetchTurkcellPackagesFrom(url))
  ]);

  const combined = [...corePackages, ...newMemberPackages, ...extraPackages.flat()];
  const uniqueMap = new Map<string, TurkcellPackageSource>();

  combined.forEach((item) => {
    const key = item.package.fullUrl || item.package.endpoint || item.package.id || item.package.title || "";
    if (!key) {
      return;
    }
    uniqueMap.set(key, item);
  });

  return Array.from(uniqueMap.values());
}

export async function syncTurkcellTariffs() {
  const admin = createAdminClient();
  const sourcePackages = await fetchTurkcellPackages();
  const scrapedTariffs = sourcePackages.map(packageToTariff);

  const { data: existingData, error: existingError } = await admin
    .from("tariffs")
    .select("id, name, source_url, category_name, provider, line_type")
    .eq("provider", "Turkcell")
    .eq("line_type", "faturali");

  if (existingError) {
    throw new Error(`Mevcut tarifeler okunamadi: ${existingError.message}`);
  }

  const existingTariffs = (existingData as Pick<
    TariffRecord,
    "id" | "name" | "source_url" | "category_name" | "provider" | "line_type"
  >[] | null) ?? [];

  let updatedCount = 0;
  let insertedCount = 0;
  const matchedIds = new Set<string>();

  for (const tariff of scrapedTariffs) {
    const existing =
      existingTariffs.find((row) => row.source_url && row.source_url === tariff.source_url) ??
      existingTariffs.find((row) => row.name === tariff.name);

    const payload = {
      ...tariff,
      category_name:
        existing && existing.category_name && existing.category_name !== "Genel"
          ? existing.category_name
          : tariff.category_name
    };

    if (existing) {
      matchedIds.add(existing.id);
      const { error } = await admin.from("tariffs").update(payload).eq("id", existing.id);

      if (error) {
        throw new Error(`Tarife guncellenemedi (${payload.name}): ${error.message}`);
      }

      updatedCount += 1;
      continue;
    }

    const { error } = await admin.from("tariffs").insert(payload);

    if (error) {
      throw new Error(`Tarife eklenemedi (${payload.name}): ${error.message}`);
    }

    insertedCount += 1;
  }

  const staleIds = existingTariffs.filter((row) => !matchedIds.has(row.id)).map((row) => row.id);
  let deactivatedCount = 0;

  if (staleIds.length > 0) {
    const { error } = await admin
      .from("tariffs")
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .in("id", staleIds);

    if (error) {
      throw new Error(`Eski tarifeler pasife alinamadi: ${error.message}`);
    }

    deactivatedCount = staleIds.length;
  }

  return {
    sourceUrl: `${TURKCELL_TARIFF_URL} + ${TURKCELL_NEW_MEMBER_URL}`,
    scrapedCount: scrapedTariffs.length,
    updatedCount,
    insertedCount,
    deactivatedCount
  };
}
