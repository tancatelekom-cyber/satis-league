export type CashDay = {
  store_id: string; entry_date: string; opening: number; closing: number;
  cash_in: number; card_in: number; transfer_in: number; expenses: number;
  bank_deposit: number; counted: number; note: string; revision: number;
  invoice_cash: number; web_cash: number; receipt_start: string; entries: CashEntry[];
};
export type CashCategory = { id: string; name: string; kind: 'income' | 'expense' | 'neutral'; is_active: boolean; allow_assignment: boolean; allow_installment: boolean };
export type CashEntry = { category_id: string; category_name?: string; kind?: string; receipt: string; staff: string; staff_name?: string; description: string; cash: number; card: number; payment: 'cash' | 'card' | 'assignment' | 'installment' | 'qr' | 'free'; amount: number };
export type CashRow = CashDay & { name: string; saved: boolean; hasPrior: boolean; previousClosing: number | null };
export function previousCashDate(date: string) {
  const previous = new Date(`${date}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}
export function cashOpeningDifference(opening: number, previousClosing: number | null) {
  return previousClosing === null ? null : (Math.round(opening * 100) - Math.round(previousClosing * 100)) / 100;
}
export function cashToday(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function calculateCashEntries(entries: CashEntry[], categories: CashCategory[]) {
  const cents = { income: 0, expense: 0, card: 0, assignment: 0, installment: 0, qr: 0 };
  for (const entry of entries) {
    const kind = categories.find(c => c.id === entry.category_id)?.kind || entry.kind;
    const value = Math.round(Number(entry.amount) * 100);
    if (kind === 'income' && entry.payment === 'cash') cents.income += value;
    if (kind === 'expense' && entry.payment === 'cash') cents.expense += value;
    if (kind === 'income' && entry.payment === 'card') cents.card += value;
    if (entry.payment === 'assignment') cents.assignment += value;
    if (entry.payment === 'installment') cents.installment += value;
    if (entry.payment === 'qr') cents.qr += value;
  }
  return { income: cents.income / 100, expense: cents.expense / 100, card: cents.card / 100, assignment: cents.assignment / 100, installment: cents.installment / 100, qr: cents.qr / 100 };
}
export function validCashDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function cashMoney(value: number) { return value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' }); }
export function cashTotals(rows: CashRow[]) {
  return rows.reduce((sum, row) => ({ opening: sum.opening + Number(row.opening), closing: sum.closing + Number(row.closing), cash: sum.cash + Number(row.cash_in), expenses: sum.expenses + Number(row.expenses), deposit: sum.deposit + Number(row.bank_deposit) }), { opening: 0, closing: 0, cash: 0, expenses: 0, deposit: 0 });
}

export function calculateCashSummary(opening: number, invoice: number, web: number, income: number, expense: number, counted: number) {
  const cents = (value: number) => Math.round(Number(value) * 100);
  const cash = cents(invoice) + cents(web) + cents(income);
  const expected = cents(opening) + cash - cents(expense);
  return { cash: cash / 100, expected: expected / 100, difference: (cents(counted) - expected) / 100, closing: cents(counted) / 100 };
}
