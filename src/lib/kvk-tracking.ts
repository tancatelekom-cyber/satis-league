export const KVK_SHEET_ID = "1ya4e8B6MkdcL4CqPaMwwxIXVIPD9CEFjN9Jtlyf70hI";
export const KVK_SOURCES = [
  { key: "statement", label: "KVK ekstre", gid: "469075323" },
  { key: "assignment", label: "KVK temlik", gid: "418893837" },
  { key: "advance", label: "TRC temlik", gid: "581678954" }
] as const;
export type KvkKind = "Havale" | "İade" | "Temlik primi" | "Ön ödeme";
export type KvkEntry = { date: string; description: string; kind: KvkKind; cents: number; row: number; gid: string };
export type KvkData = { entries: KvkEntry[]; updatedAt: string | null; errors: string[] };

export function canViewKvk(role: string, approval: string) {
  return approval === "approved" && ["admin", "management"].includes(role);
}

export function parseKvkDate(value: string): string | null {
  const s = value.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  const tr = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s.*)?$/);
  if (!iso && !tr) return null;
  const [y, m, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(tr![3]), Number(tr![2]), Number(tr![1])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
}

export function parseKvkMoney(value: string): number | null {
  let s = value.trim().replace(/(?:TRY|TL|₺)/gi, "").replace(/\s/g, "");
  if (!s || s === "-") return 0;
  if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1);
  if (s.includes(",")) {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(s)) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function csvRows(text: string) {
  if (/^\s*</.test(text)) throw new Error("Sheet CSV verisi yerine oturum sayfası döndürdü.");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\r" || c === "\n") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV satırı tamamlanmamış.");
  if (row.length || cell) { row.push(cell); rows.push(row); }
  return rows;
}

export function parseKvkSource(text: string, source: typeof KVK_SOURCES[number]): KvkData {
  const rows = csvRows(text);
  const minColumns = source.key === "statement" ? 5 : source.key === "assignment" ? 13 : 34;
  if (!rows.some(row => row.length >= minColumns)) throw new Error("Beklenen sütunlar bulunamadı.");
  const result: KvkData = { entries: [], updatedAt: null, errors: [] };
  rows.forEach((row, index) => {
    if (!row.some(cell => cell.trim())) return;
    const rawDate = row[source.key === "statement" ? 0 : 12] ?? "";
    const date = parseKvkDate(rawDate);
    const approvalRaw = source.key === "assignment" ? (row[5] ?? "").trim() : "";
    const approval = parseKvkDate(approvalRaw);
    if (approval && (!result.updatedAt || approval > result.updatedAt)) result.updatedAt = approval;
    const description = source.key === "statement" ? (row[1] ?? "").trim() : source.label;
    const normalized = description.toLocaleLowerCase("tr-TR");
    const kind: KvkKind | null = source.key === "assignment" ? "Temlik primi" : source.key === "advance" ? "Ön ödeme" : normalized.includes("iade") ? "İade" : normalized.includes("havale") ? "Havale" : null;
    if (!kind) return;
    // Allow heading rows, but never silently discard a dated or monetary transaction.
    const rawAmount = source.key === "statement" ? row[4] : row[source.key === "assignment" ? 9 : 33];
    const amount = parseKvkMoney(rawAmount ?? "");
    const debt = source.key === "statement" ? parseKvkMoney(row[3] ?? "") : 0;
    if (!date && index === 0 && !/\d/.test(rawDate) && (amount === null || !rawAmount?.trim())) return;
    if (!date || amount === null || debt === null || (source.key === "assignment" && approvalRaw && !approval)) {
      result.errors.push(`${source.label}, satır ${index + 1}: tarih veya tutar okunamadı.`); return;
    }
    result.entries.push({ date, description, kind, cents: amount - debt, row: index + 1, gid: source.gid });
  });
  return result;
}

export function summarizeKvk(data: KvkData, start: string, end: string) {
  if (!parseKvkDate(start) || !parseKvkDate(end) || start > end) throw new Error("Geçerli bir başlangıç ve bitiş tarihi seçin.");
  const entries = data.entries.filter(row => row.date >= start && row.date <= end).sort((a, b) => b.date.localeCompare(a.date));
  const totals: Record<KvkKind, number> = { Havale: 0, İade: 0, "Temlik primi": 0, "Ön ödeme": 0 };
  for (const row of entries) totals[row.kind] += row.cents;
  const matched = totals.Havale + totals.İade + totals["Temlik primi"];
  return { entries, totals, matched, difference: matched - totals["Ön ödeme"] };
}

export async function fetchKvkData(): Promise<KvkData> {
  const parts = await Promise.all(KVK_SOURCES.map(async source => {
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${KVK_SHEET_ID}/export?format=csv&gid=${source.gid}`, {
        cache: "no-store", signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) throw new Error(`Kaynağa erişilemiyor (HTTP ${res.status}).`);
      return parseKvkSource(await res.text(), source);
    } catch {
      return { entries: [], updatedAt: null, errors: [`${source.label} okunamadı. Google Sheet paylaşımını ve sunucu erişimini kontrol edin.`] } satisfies KvkData;
    }
  }));
  return { entries: parts.flatMap(p => p.entries), errors: parts.flatMap(p => p.errors), updatedAt: parts[1].updatedAt };
}
