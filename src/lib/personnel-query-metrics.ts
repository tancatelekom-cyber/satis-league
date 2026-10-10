export type PersonnelQueryTotals = {
  terminalQueries: number;
  scoredCustomers: number;
  terminalSales: number;
  superonlineQueries: number;
  superonlineSales: number;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function count(value: string | undefined): number {
  const text = (value ?? "").trim().replace(/\s/g, "");
  if (!text) throw new Error("Sorgu verisinde eksik adet var.");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,0+)?$/.test(text)) {
    throw new Error("Sorgu verisinde geçersiz adet var.");
  }
  return Number(text.replace(/\./g, "").replace(",", "."));
}

export function parsePersonnelQueryTotals(csv: string, personnelIds: string[]): PersonnelQueryTotals | null {
  const ids = new Set(personnelIds.map(id => id.trim().toLowerCase()).filter(id => id && !id.startsWith("#")));
  const rows = parseCsv(csv);
  if (!rows.some(row => row[2]?.trim() === "Sorgu Adet" && row[8]?.trim() === "Adres Sorgu")) {
    throw new Error("Sorgu tablosunun sütunları doğrulanamadı.");
  }
  const matching = rows.filter(row => ids.has((row[11] ?? "").trim().toLowerCase()));
  if (!matching.length) return null;
  const totals: PersonnelQueryTotals = { terminalQueries: 0, scoredCustomers: 0, terminalSales: 0, superonlineQueries: 0, superonlineSales: 0 };
  for (const row of matching) {
    totals.terminalQueries += count(row[2]);
    totals.scoredCustomers += count(row[3]);
    totals.terminalSales += count(row[5]);
    totals.superonlineQueries += count(row[8]);
    totals.superonlineSales += count(row[9]);
  }
  return totals;
}

export function queryRatio(numerator: number, denominator: number): number | null {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
}

export async function fetchPersonnelQueryTotals(personnelIds: string[]) {
  if (!personnelIds.length) return null;
  const response = await fetch("https://docs.google.com/spreadsheets/d/1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA/export?format=csv&gid=886531318", {
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Sorgu tablosu okunamadı.");
  return parsePersonnelQueryTotals(await response.text(), personnelIds);
}
