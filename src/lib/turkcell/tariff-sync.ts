import { createAdminClient } from "@/lib/supabase/admin";
import { TariffRecord } from "@/lib/types";

const TURKCELL_TARIFF_URL = "https://www.turkcell.com.tr/paket-ve-tarifeler/faturali-hat";

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
  price?: {
    amount?: string | number | null;
    amountDouble?: number | null;
    onlineExclusive?: boolean | null;
  } | null;
  cpcmTariffOfferId?: string | null;
  tab?: string | null;
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

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  const normalized = String(value ?? "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "")
    .trim();

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

function isDigitalOnly(pkg: TurkcellPackage) {
  const text = `${pkg.title ?? ""} ${pkg.shortDescription ?? ""}`.toLocaleLowerCase("tr-TR");
  return /online.?a ozel|online ozel|dijital.?e ozel|dijital ozel|sadece dijital|sadece online/.test(text);
}

function isCorePostpaidTariff(pkg: TurkcellPackage) {
  const title = (pkg.title ?? "").toLocaleLowerCase("tr-TR");

  if (pkg.paymentType !== "POSTPAID") {
    return false;
  }

  if (!pkg.cpcmTariffOfferId) {
    return false;
  }

  if (pkg.price?.onlineExclusive) {
    return false;
  }

  if (isDigitalOnly(pkg)) {
    return false;
  }

  if (
    /superbox|mobil wifi|hotspot|ek |günlük|haftalık|gezgin|sms paketi|dakika paketi|internet paketi|oyna|izle|akıllı fatura tl paketi/.test(
      title
    )
  ) {
    return false;
  }

  return true;
}

function inferCategoryName(name: string) {
  const lower = name.toLocaleLowerCase("tr-TR");

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

function packageToTariff(pkg: TurkcellPackage): TariffUpsertPayload {
  const details = normalizeText(pkg.shortDescription ?? "");
  const benefits = parseBenefits(pkg.benefits);
  const now = new Date().toISOString();

  return {
    provider: "Turkcell",
    source_url: pkg.fullUrl || (pkg.endpoint ? `https://www.turkcell.com.tr${pkg.endpoint}` : TURKCELL_TARIFF_URL),
    name: normalizeText(pkg.title ?? "Turkcell Tarifesi"),
    category_name: inferCategoryName(pkg.title ?? ""),
    line_type: "faturali",
    data_gb: benefits.dataGb,
    minutes: benefits.minutes,
    sms: benefits.sms,
    price: Number(pkg.price?.amountDouble ?? toNumber(pkg.price?.amount)),
    details: details || null,
    is_online_only: Boolean(pkg.price?.onlineExclusive),
    is_digital_only: isDigitalOnly(pkg),
    is_active: true,
    scraped_at: now,
    updated_at: now
  };
}

async function fetchTurkcellPackages() {
  const response = await fetch(TURKCELL_TARIFF_URL, {
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
  const uniqueMap = new Map<string, TurkcellPackage>();

  packageArrays.flat().forEach((pkg) => {
    if (!pkg?.id) {
      return;
    }

    uniqueMap.set(pkg.id, pkg);
  });

  return Array.from(uniqueMap.values()).filter(isCorePostpaidTariff);
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
    sourceUrl: TURKCELL_TARIFF_URL,
    scrapedCount: scrapedTariffs.length,
    updatedCount,
    insertedCount,
    deactivatedCount
  };
}
