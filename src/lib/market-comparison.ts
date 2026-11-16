export const RETAILERS = [
  { id: "mediamarkt", name: "MediaMarkt", origin: "https://www.mediamarkt.com.tr" },
  { id: "vatan", name: "Vatan Bilgisayar", origin: "https://www.vatanbilgisayar.com" },
  { id: "pasaj", name: "Turkcell Pasaj", origin: "https://www.turkcell.com.tr" }
] as const;
export type Retailer = typeof RETAILERS[number];
export type MarketOffer = { title: string; url: string; price: number | null; available: boolean | null; seller: string | null };
export type MarketResult = { id: string; name: string; status: "ok" | "unavailable" | "unmatched" | "error"; checkedAt: string; searchUrl: string; offer: MarketOffer | null; errorMessage?: string };
export const normalizePhone = (text: string) => text.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim();
export const isSmartphoneCategory = (category: string) => normalizePhone(category) === "akilli telefon";

function identity(text: string) {
  const normalized = normalizePhone(text.replace(/(\d+)\s*\/\s*(\d+)\s*GB/gi, "$1GB $2GB")).replace(/(\d)\s*(gb|tb)\b/g, "$1$2");
  const sizes = [...normalized.matchAll(/\b(\d+)(gb|tb)\b/g)].map(m => Number(m[1]) * (m[2] === "tb" ? 1024 : 1));
  const tokens = normalized.replace(/\b\d+(?:gb|tb)\b/g, " ").split(/\s+/).filter(Boolean);
  return { tokens, storage: Math.max(0, ...sizes.filter(n => n >= 32)), ram: Math.max(0, ...sizes.filter(n => n < 32)) };
}

export function matchesPhone(product: string, brand: string, candidate: string) {
  const a = identity(`${brand} ${product}`), b = identity(candidate);
  if (/\b(kilif|ekran koruyucu|yenilenmis|ikinci el|teshir|refurbished)\b/.test(normalizePhone(candidate))) return false;
  if (!a.storage || a.storage !== b.storage || (a.ram > 0 && a.ram !== b.ram)) return false;
  const ignored = new Set(["apple", "samsung", "galaxy", "akilli", "telefon", "telefonu", "ram", "egyg", "5g", "4g"]);
  const required = a.tokens.filter(t => !ignored.has(t));
  if (!required.length || !required.every(t => b.tokens.includes(t))) return false;
  const brandToken = normalizePhone(brand).split(" ")[0];
  if (brandToken !== "apple" && !b.tokens.includes(brandToken)) return false;
  for (const variant of ["pro", "plus", "max", "ultra", "fe", "lite", "mini", "se", "ee"]) {
    if (a.tokens.includes(variant) !== b.tokens.includes(variant)) return false;
  }
  if (a.tokens.includes("5g") && b.tokens.includes("4g") || a.tokens.includes("4g") && b.tokens.includes("5g")) return false;
  return true;
}

function decode(text: string) {
  return text.replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}
function safeUrl(value: string, retailer: Retailer) {
  try { const url = new URL(decode(value), retailer.origin); url.hash = ""; return url.origin === retailer.origin ? url.href : null; } catch { return null; }
}

export function parseMarketOffers(html: string, retailer: Retailer): MarketOffer[] {
  const offers: MarketOffer[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const obj = node as Record<string, unknown>;
    if (["Product", "ProductGroup"].includes(String(obj["@type"]))) {
      const url = safeUrl(String(obj.url ?? obj["@id"] ?? ""), retailer);
      const list = Array.isArray(obj.offers) ? obj.offers : obj.offers ? [obj.offers] : [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const offer = item as Record<string, unknown>;
        const price = Number(offer.price);
        const availability = String(offer.availability ?? "");
        const seller = typeof offer.seller === "object" && offer.seller ? String((offer.seller as Record<string, unknown>).name ?? "") : "";
        if (url && obj.name) offers.push({ title: decode(String(obj.name)), url, price: offer.priceCurrency === "TRY" && Number.isFinite(price) && price > 0 ? price : null,
          available: /OutOfStock|Discontinued|SoldOut|PreOrder|PreSale/.test(availability) ? false : /InStock|LimitedAvailability/.test(availability) ? true : null, seller: seller || null });
      }
    }
    Object.values(obj).forEach(visit);
  }
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Unusable metadata must not become a price. */ }
  }
  if (retailer.id === "vatan") {
    for (const block of html.split(/<div class="product-list product-list--list-page">/).slice(1)) {
      const title = block.match(/class="product-list__product-name">\s*<h3>([\s\S]*?)<\/h3>/)?.[1];
      const url = safeUrl(block.match(/class="product-list-link" href="([^"]+)"/)?.[1] ?? "", retailer);
      const raw = block.replace(/<!--[\s\S]*?-->/g, "").match(/class=['"]product-list__price['"]>([\d.,]+)</)?.[1];
      const price = Number(raw?.replace(/\./g, "").replace(",", "."));
      if (title && url) offers.push({ title: decode(title.replace(/<[^>]+>/g, "")), url, price: Number.isFinite(price) && price > 0 ? price : null, available: null, seller: "Vatan Bilgisayar" });
    }
  }
  return offers;
}

export function marketSearchUrl(retailer: Retailer, query: string) {
  return retailer.id === "mediamarkt" ? `${retailer.origin}/tr/search.html?query=${encodeURIComponent(query)}` : retailer.id === "vatan" ? `${retailer.origin}/arama/${encodeURIComponent(query)}/` : `${retailer.origin}/pasaj/search?qx=${encodeURIComponent(query)}`;
}

class MarketFetchError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}

async function readMarketHtml(url: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(attempt === 0 ? 15000 : 8000), headers: { accept: "text/html", "accept-language": "tr-TR,tr;q=0.9" } });
      if (!response.ok) {
        await response.body?.cancel();
        throw new MarketFetchError(response.status === 403 || response.status === 401
          ? `Mağaza, uygulama sunucusundan gelen isteği kabul etmedi (HTTP ${response.status}).`
          : response.status === 429 ? "Mağaza istek sınırına ulaşıldı (HTTP 429). Bir süre sonra tekrar deneyin."
          : `Mağaza yanıtı alınamadı (HTTP ${response.status}).`, response.status >= 500);
      }
      const html = await response.text();
      // Product pages may contain captcha script references without being challenge pages.
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      if (/access denied|just a moment|verify you are human|captcha|robot check/i.test(title)) {
        throw new MarketFetchError("Mağaza otomatik erişim doğrulaması istiyor; fiyat doğrulanamadı.");
      }
      return html;
    } catch (error) {
      const retryable = !(error instanceof MarketFetchError) || error.retryable;
      if (attempt === 0 && retryable) continue;
      if (error instanceof MarketFetchError) throw error;
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new MarketFetchError("Mağaza bağlantısı zaman aşımına uğradı; iki denemede de fiyat alınamadı.");
      throw new MarketFetchError("Uygulama sunucusu mağazaya bağlanamadı; iki denemede de bağlantı kurulamadı.");
    }
  }
  throw new MarketFetchError("Mağazaya bağlanılamadı.");
}

export async function fetchMarketPrice(retailer: Retailer, product: string, brand: string): Promise<MarketResult> {
  const query = [...new Set(identity(`${brand} ${product}`).tokens.filter(token => !["apple", "egyg", "ram"].includes(token)))].join(" ");
  const searchUrl = marketSearchUrl(retailer, query);
  const base = { id: retailer.id, name: retailer.name, checkedAt: new Date().toISOString(), searchUrl };
  try {
    const html = await readMarketHtml(searchUrl);
    const candidates = parseMarketOffers(html, retailer).filter(offer => matchesPhone(product, brand, offer.title));
    const priced = candidates.filter(offer => offer.price !== null && offer.available !== false).sort((a, b) => a.price! - b.price!);
    return { ...base, checkedAt: new Date().toISOString(), status: priced.length ? "ok" : candidates.length ? "unavailable" : "unmatched", offer: priced[0] ?? candidates[0] ?? null };
  } catch (error) { return { ...base, checkedAt: new Date().toISOString(), status: "error", offer: null, errorMessage: error instanceof MarketFetchError ? error.message : "Fiyat verisi okunamadı." }; }
}
