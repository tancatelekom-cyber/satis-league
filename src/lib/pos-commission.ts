export type PosCommissionSettingsRow = {
  id?: string | null;
  commission_percent?: number | string | null;
  updated_at?: string | null;
};

export type PosCommissionSettings = {
  id: string | null;
  commissionPercent: number;
  updatedAt: string | null;
};

export function normalizePosCommissionPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Number(value)));
}

export function resolvePosCommissionSettings(
  row: PosCommissionSettingsRow | null | undefined
): PosCommissionSettings {
  const rawValue =
    typeof row?.commission_percent === "string"
      ? Number(row.commission_percent.replace(",", "."))
      : Number(row?.commission_percent ?? 0);

  return {
    id: row?.id ?? null,
    commissionPercent: normalizePosCommissionPercent(rawValue),
    updatedAt: row?.updated_at ?? null
  };
}

export function parsePosAmountInput(input: string) {
  const normalized = input.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function calculatePosNetAmount(amount: number, commissionPercent: number) {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const safePercent = normalizePosCommissionPercent(commissionPercent);
  return safeAmount * (1 - safePercent / 100);
}

export function calculatePosCommissionAmount(amount: number, commissionPercent: number) {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const netAmount = calculatePosNetAmount(safeAmount, commissionPercent);
  return safeAmount - netAmount;
}

export function formatPosCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} TL`;
}

export function formatPosPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "%0";
  }

  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}
