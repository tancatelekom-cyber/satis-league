export const REVENUE_EXPENSE_EDITORS = [
  "7998f539-5077-472b-ba65-a1d45533eafa",
  "9d481c04-49b3-48de-8559-3e11185338bc"
] as const;
export function isRevenueExpenseEditor(id: string) {
  return (REVENUE_EXPENSE_EDITORS as readonly string[]).includes(id);
}
