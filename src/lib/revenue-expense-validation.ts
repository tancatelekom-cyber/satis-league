export type RevenueExpenseInput = { store_name: string; kind: "gelir" | "gider"; category: string; year: number; month: number; amount: number };
export function validateRevenueExpense(data: FormData): RevenueExpenseInput {
  const store_name = String(data.get("store") ?? "").trim();
  const category = String(data.get("category") ?? "").trim();
  const kind = String(data.get("kind") ?? "");
  const year = Number(data.get("year"));
  const month = Number(data.get("month"));
  const raw = String(data.get("amount") ?? "").trim();
  if (!/^-?\d{1,12}([.,]\d{1,10})?$/.test(raw)) throw new Error("Tutarı binlik ayırıcı olmadan, en fazla on ondalık basamakla girin.");
  const amount = Number(raw.replace(",", "."));
  if (!store_name || store_name.length > 150 || !category || category.length > 150 || !["gelir", "gider"].includes(kind)
    || !Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12
    || !Number.isFinite(amount) || amount < -999999999999.99 || amount > 999999999999.99) throw new Error("Mağaza, tür, kategori, dönem ve tutarı kontrol edin.");
  return { store_name, category, kind: kind as "gelir" | "gider", year, month, amount };
}
