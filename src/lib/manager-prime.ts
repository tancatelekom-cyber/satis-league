import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGoalDayStats, fetchGoalStoreRows, type GoalDayStats, type GoalStoreRow } from "@/lib/goal-actuals";

export type ManagerPrimeColumnKey =
  | "scale"
  | "recontract"
  | "production"
  | "activation"
  | "terminal"
  | "sol"
  | "accessory";

export type ManagerPrimeSettings = {
  scale: string;
  recontractCategory: string;
  recontract: string;
  productionCategory: string;
  production: string;
  activationCategory: string;
  activation: string;
  terminalCategory: string;
  terminal: string;
  solCategory: string;
  sol: string;
  accessoryCategory: string;
  accessory: string;
};

export type ManagerPrimeSheetRow = {
  thresholdPercent: number;
  recontractReward: number;
  productionReward: number;
  activationReward: number;
  terminalReward: number;
  solReward: number;
  accessoryRate: number;
};

export type ManagerPrimeMetricKey =
  | "recontract"
  | "production"
  | "activation"
  | "terminal"
  | "sol"
  | "accessory";

export type ManagerPrimeMetric = {
  key: ManagerPrimeMetricKey;
  label: string;
  actual: number;
  target: number | null;
  projected: number;
  actualTempo: number;
  projectedTempo: number;
};

export type ManagerPrimeBreakdownRow = {
  key: ManagerPrimeMetricKey;
  label: string;
  actualTempo: number;
  projectedTempo: number;
  currentScaleLabel: string;
  projectedScaleLabel: string;
  currentBaseValue: number;
  projectedBaseValue: number;
  currentReward: number;
  projectedReward: number;
};

export type ManagerPrimeOpportunity = {
  key: ManagerPrimeMetricKey;
  label: string;
  nextScaleLabel: string;
  estimatedIncrease: number;
  dailyRequired: number;
  additionalRequiredTotal: number;
};

export type ManagerPrimeSummary = {
  storeName: string;
  managerName: string;
  currentPrimeTotal: number;
  projectedPrimeTotal: number;
  currentNonAccessoryBaseTotal: number;
  projectedNonAccessoryBaseTotal: number;
  currentRecontractMultiplier: number;
  projectedRecontractMultiplier: number;
  currentAccessoryReward: number;
  projectedAccessoryReward: number;
  rows: ManagerPrimeBreakdownRow[];
  metrics: Record<ManagerPrimeMetricKey, ManagerPrimeMetric>;
  opportunities: ManagerPrimeOpportunity[];
};

const GOAL_SHEET_ID = "1Ppf_vGtlD6RInm0fxy3lDaV5Sy3LWggkH6Gw1wgciuA";
const MANAGER_PRIME_SHEET_GID = "745050344";

const DEFAULT_MANAGER_PRIME_SETTINGS: ManagerPrimeSettings = {
  scale: "A",
  recontractCategory: "REKONTRATLAMA",
  recontract: "B",
  productionCategory: "URETIM PUANI",
  production: "D",
  activationCategory: "AKTIVASYON",
  activation: "E",
  terminalCategory: "TERMINAL",
  terminal: "F",
  solCategory: "SOL",
  sol: "G",
  accessoryCategory: "AKSESUAR KARLILIK",
  accessory: "H"
};

const METRIC_LABELS: Record<ManagerPrimeMetricKey, string> = {
  recontract: "REKONTRATLAMA",
  production: "URETIM PUANI",
  activation: "AKTIVASYON PUAN",
  terminal: "TERMINAL",
  sol: "SOL",
  accessory: "AKSESUAR KARLILIK"
};

function buildSheetUrl(gid: string) {
  const params = new URLSearchParams();
  params.set("format", "csv");
  params.set("gid", gid);

  return `https://docs.google.com/spreadsheets/d/${GOAL_SHEET_ID}/export?${params.toString()}`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/\u0130/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLocalizedNumber(value: string) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function columnLetterToIndex(letter: string) {
  const trimmed = String(letter ?? "").trim().toUpperCase();
  if (!trimmed) {
    return 0;
  }

  let index = 0;
  for (let position = 0; position < trimmed.length; position += 1) {
    index = index * 26 + (trimmed.charCodeAt(position) - 64);
  }

  return Math.max(0, index - 1);
}

function buildScaleLabel(thresholdPercent: number) {
  if (!thresholdPercent) {
    return "0";
  }

  return `%${thresholdPercent.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

function findScaleRow(rows: ManagerPrimeSheetRow[], tempoPercent: number) {
  const sortedRows = [...rows].sort((left, right) => left.thresholdPercent - right.thresholdPercent);
  return sortedRows
    .filter((row) => tempoPercent >= row.thresholdPercent)
    .at(-1) ?? sortedRows[0] ?? null;
}

function findNextScaleRow(rows: ManagerPrimeSheetRow[], tempoPercent: number) {
  const sortedRows = [...rows].sort((left, right) => left.thresholdPercent - right.thresholdPercent);
  return sortedRows.find((row) => row.thresholdPercent > tempoPercent) ?? null;
}

function buildMetric(
  key: ManagerPrimeMetricKey,
  rows: GoalStoreRow[],
  dayStats: GoalDayStats,
  categoryName: string
): ManagerPrimeMetric {
  const expectedCategory = normalizeText(categoryName).toUpperCase();
  const matchedRows = rows.filter((row) => normalizeText(row.mainCategory).toUpperCase() === expectedCategory);
  const actual = matchedRows.reduce((sum, row) => sum + row.actual, 0);
  const targetSum = matchedRows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const target = targetSum > 0 ? targetSum : null;
  const projected = dayStats.workedDays > 0 ? (actual / dayStats.workedDays) * dayStats.totalDays : actual;
  const actualTempo = target ? (actual / target) * 100 : 0;
  const projectedTempo = target ? (projected / target) * 100 : 0;

  return {
    key,
    label: METRIC_LABELS[key],
    actual,
    target,
    projected,
    actualTempo,
    projectedTempo
  };
}

function sameStoreName(left: string, right: string) {
  return normalizeText(left).toUpperCase() === normalizeText(right).toUpperCase();
}

function parseRewardString(value: string) {
  return parseLocalizedNumber(String(value ?? "").replace("₺", ""));
}

export async function getManagerPrimeSettings() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("manager_prime_settings")
      .select(
        "scale_column, recontract_category, recontract_column, production_category, production_column, activation_category, activation_column, terminal_category, terminal_column, sol_category, sol_column, accessory_category, accessory_column"
      )
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_MANAGER_PRIME_SETTINGS;
    }

    return {
      scale: String(data.scale_column ?? DEFAULT_MANAGER_PRIME_SETTINGS.scale).trim().toUpperCase() || DEFAULT_MANAGER_PRIME_SETTINGS.scale,
      recontractCategory:
        String(data.recontract_category ?? DEFAULT_MANAGER_PRIME_SETTINGS.recontractCategory).trim() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.recontractCategory,
      recontract:
        String(data.recontract_column ?? DEFAULT_MANAGER_PRIME_SETTINGS.recontract).trim().toUpperCase() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.recontract,
      productionCategory:
        String(data.production_category ?? DEFAULT_MANAGER_PRIME_SETTINGS.productionCategory).trim() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.productionCategory,
      production:
        String(data.production_column ?? DEFAULT_MANAGER_PRIME_SETTINGS.production).trim().toUpperCase() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.production,
      activationCategory:
        String(data.activation_category ?? DEFAULT_MANAGER_PRIME_SETTINGS.activationCategory).trim() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.activationCategory,
      activation:
        String(data.activation_column ?? DEFAULT_MANAGER_PRIME_SETTINGS.activation).trim().toUpperCase() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.activation,
      terminalCategory:
        String(data.terminal_category ?? DEFAULT_MANAGER_PRIME_SETTINGS.terminalCategory).trim() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.terminalCategory,
      terminal:
        String(data.terminal_column ?? DEFAULT_MANAGER_PRIME_SETTINGS.terminal).trim().toUpperCase() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.terminal,
      solCategory:
        String(data.sol_category ?? DEFAULT_MANAGER_PRIME_SETTINGS.solCategory).trim() || DEFAULT_MANAGER_PRIME_SETTINGS.solCategory,
      sol:
        String(data.sol_column ?? DEFAULT_MANAGER_PRIME_SETTINGS.sol).trim().toUpperCase() || DEFAULT_MANAGER_PRIME_SETTINGS.sol,
      accessoryCategory:
        String(data.accessory_category ?? DEFAULT_MANAGER_PRIME_SETTINGS.accessoryCategory).trim() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.accessoryCategory,
      accessory:
        String(data.accessory_column ?? DEFAULT_MANAGER_PRIME_SETTINGS.accessory).trim().toUpperCase() ||
        DEFAULT_MANAGER_PRIME_SETTINGS.accessory
    } satisfies ManagerPrimeSettings;
  } catch {
    return DEFAULT_MANAGER_PRIME_SETTINGS;
  }
}

export async function fetchManagerPrimeSheetRows(settings?: ManagerPrimeSettings) {
  const resolvedSettings = settings ?? (await getManagerPrimeSettings());
  const response = await fetch(buildSheetUrl(MANAGER_PRIME_SHEET_GID), {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "text/csv, text/plain, */*",
      "user-agent": "Mozilla/5.0 (compatible; TancaSuperLigBot/1.0; +https://vercel.app)"
    }
  });

  if (!response.ok) {
    throw new Error(`Magaza muduru prim sayfasi okunamadi: ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  const scaleIndex = columnLetterToIndex(resolvedSettings.scale);
  const recontractIndex = columnLetterToIndex(resolvedSettings.recontract);
  const productionIndex = columnLetterToIndex(resolvedSettings.production);
  const activationIndex = columnLetterToIndex(resolvedSettings.activation);
  const terminalIndex = columnLetterToIndex(resolvedSettings.terminal);
  const solIndex = columnLetterToIndex(resolvedSettings.sol);
  const accessoryIndex = columnLetterToIndex(resolvedSettings.accessory);

  return rows
    .slice(1)
    .map((row): ManagerPrimeSheetRow | null => {
      const thresholdPercent = parseLocalizedNumber(row[scaleIndex] ?? "");
      if (!Number.isFinite(thresholdPercent) && thresholdPercent !== 0) {
        return null;
      }

      const hasAnyValue = [
        row[recontractIndex],
        row[productionIndex],
        row[activationIndex],
        row[terminalIndex],
        row[solIndex],
        row[accessoryIndex]
      ].some((value) => normalizeText(value ?? ""));

      if (!hasAnyValue && !thresholdPercent) {
        return null;
      }

      return {
        thresholdPercent,
        recontractReward: parseRewardString(row[recontractIndex] ?? ""),
        productionReward: parseRewardString(row[productionIndex] ?? ""),
        activationReward: parseRewardString(row[activationIndex] ?? ""),
        terminalReward: parseRewardString(row[terminalIndex] ?? ""),
        solReward: parseRewardString(row[solIndex] ?? ""),
        accessoryRate: parseLocalizedNumber(row[accessoryIndex] ?? "")
      };
    })
    .filter((row): row is ManagerPrimeSheetRow => Boolean(row))
    .sort((left, right) => left.thresholdPercent - right.thresholdPercent);
}

export async function buildManagerPrimeSummary(managerName: string, storeName: string) {
  const [storeRows, dayStats, settings] = await Promise.all([
    fetchGoalStoreRows(),
    fetchGoalDayStats(),
    getManagerPrimeSettings()
  ]);
  const sheetRows = await fetchManagerPrimeSheetRows(settings);

  const managerRows = storeRows.filter((row) => sameStoreName(row.storeCode, storeName));
  if (!managerRows.length) {
    return null;
  }

  const metrics = {
    recontract: buildMetric("recontract", managerRows, dayStats, settings.recontractCategory),
    production: buildMetric("production", managerRows, dayStats, settings.productionCategory),
    activation: buildMetric("activation", managerRows, dayStats, settings.activationCategory),
    terminal: buildMetric("terminal", managerRows, dayStats, settings.terminalCategory),
    sol: buildMetric("sol", managerRows, dayStats, settings.solCategory),
    accessory: buildMetric("accessory", managerRows, dayStats, settings.accessoryCategory)
  } satisfies Record<ManagerPrimeMetricKey, ManagerPrimeMetric>;

  const currentRecontractMultiplier = Math.min(1, Math.max(0, metrics.recontract.actualTempo / 100));
  const projectedRecontractMultiplier = Math.min(1, Math.max(0, metrics.recontract.projectedTempo / 100));

  const recontractCurrentScale = findScaleRow(sheetRows, metrics.recontract.actualTempo);
  const recontractProjectedScale = findScaleRow(sheetRows, metrics.recontract.projectedTempo);
  const currentRecontractBaseValue = recontractCurrentScale?.recontractReward ?? 0;
  const projectedRecontractBaseValue = recontractProjectedScale?.recontractReward ?? 0;

  const nonAccessoryKeys: ManagerPrimeMetricKey[] = ["recontract", "production", "activation", "terminal", "sol"];
  const rows: ManagerPrimeBreakdownRow[] = [];
  let currentNonAccessoryBaseTotal = 0;
  let projectedNonAccessoryBaseTotal = 0;

  for (const key of nonAccessoryKeys) {
    const metric = metrics[key];
    const currentScale = key === "recontract" ? recontractCurrentScale : findScaleRow(sheetRows, metric.actualTempo);
    const projectedScale =
      key === "recontract" ? recontractProjectedScale : findScaleRow(sheetRows, metric.projectedTempo);

    const currentBaseValue =
      key === "recontract"
        ? currentRecontractBaseValue
        : key === "production"
        ? (currentScale?.productionReward ?? 0)
        : key === "activation"
          ? (currentScale?.activationReward ?? 0)
          : key === "terminal"
            ? (currentScale?.terminalReward ?? 0)
            : (currentScale?.solReward ?? 0);

    const projectedBaseValue =
      key === "recontract"
        ? projectedRecontractBaseValue
        : key === "production"
        ? (projectedScale?.productionReward ?? 0)
        : key === "activation"
          ? (projectedScale?.activationReward ?? 0)
          : key === "terminal"
            ? (projectedScale?.terminalReward ?? 0)
            : (projectedScale?.solReward ?? 0);

    currentNonAccessoryBaseTotal += currentBaseValue;
    projectedNonAccessoryBaseTotal += projectedBaseValue;

    rows.push({
      key,
      label: metric.label,
      actualTempo: metric.actualTempo,
      projectedTempo: metric.projectedTempo,
      currentScaleLabel: buildScaleLabel(currentScale?.thresholdPercent ?? 0),
      projectedScaleLabel: buildScaleLabel(projectedScale?.thresholdPercent ?? 0),
      currentBaseValue,
      projectedBaseValue,
      currentReward: currentBaseValue * currentRecontractMultiplier,
      projectedReward: projectedBaseValue * projectedRecontractMultiplier
    });
  }

  const accessoryCurrentScale = findScaleRow(sheetRows, metrics.accessory.actualTempo);
  const accessoryProjectedScale = findScaleRow(sheetRows, metrics.accessory.projectedTempo);
  const currentAccessoryReward = metrics.accessory.actual * ((accessoryCurrentScale?.accessoryRate ?? 0) / 100);
  const projectedAccessoryReward = metrics.accessory.projected * ((accessoryProjectedScale?.accessoryRate ?? 0) / 100);

  rows.push({
    key: "accessory",
    label: metrics.accessory.label,
    actualTempo: metrics.accessory.actualTempo,
    projectedTempo: metrics.accessory.projectedTempo,
    currentScaleLabel: buildScaleLabel(accessoryCurrentScale?.thresholdPercent ?? 0),
    projectedScaleLabel: buildScaleLabel(accessoryProjectedScale?.thresholdPercent ?? 0),
    currentBaseValue: accessoryCurrentScale?.accessoryRate ?? 0,
    projectedBaseValue: accessoryProjectedScale?.accessoryRate ?? 0,
    currentReward: currentAccessoryReward,
    projectedReward: projectedAccessoryReward
  });

  const currentPrimeTotal = currentNonAccessoryBaseTotal * currentRecontractMultiplier + currentAccessoryReward;
  const projectedPrimeTotal = projectedNonAccessoryBaseTotal * projectedRecontractMultiplier + projectedAccessoryReward;

  const opportunities: ManagerPrimeOpportunity[] = [];
  const remainingDays = Math.max(0, dayStats.remainingDays);

  if (remainingDays > 0) {
    for (const key of nonAccessoryKeys) {
      const metric = metrics[key];
      if (!metric.target || metric.target <= 0) {
        continue;
      }

      const nextScale = findNextScaleRow(sheetRows, metric.projectedTempo);
      if (!nextScale) {
        continue;
      }

      const requiredTotal = (metric.target * nextScale.thresholdPercent) / 100;
      const additionalRequiredTotal = Math.max(0, requiredTotal - metric.actual);
      if (additionalRequiredTotal <= 0) {
        continue;
      }

      const dailyRequired = additionalRequiredTotal / remainingDays;
      let estimatedIncrease = 0;

      if (key === "recontract") {
        const nextMultiplier = Math.min(1, nextScale.thresholdPercent / 100);
        const nextRecontractBaseValue = nextScale.recontractReward;
        const nextNonAccessoryBaseTotal =
          projectedNonAccessoryBaseTotal - projectedRecontractBaseValue + nextRecontractBaseValue;
        const nextPrimeTotal = nextNonAccessoryBaseTotal * nextMultiplier + projectedAccessoryReward;
        estimatedIncrease = Math.max(0, nextPrimeTotal - projectedPrimeTotal);
      } else {
        const projectedScale = findScaleRow(sheetRows, metric.projectedTempo);
        const currentProjectedBaseValue =
          key === "production"
            ? projectedScale?.productionReward ?? 0
            : key === "activation"
              ? projectedScale?.activationReward ?? 0
              : key === "terminal"
                ? projectedScale?.terminalReward ?? 0
                : projectedScale?.solReward ?? 0;

        const nextProjectedBaseValue =
          key === "production"
            ? nextScale.productionReward
            : key === "activation"
              ? nextScale.activationReward
              : key === "terminal"
                ? nextScale.terminalReward
                : nextScale.solReward;

        const nextPrimeTotal =
          (projectedNonAccessoryBaseTotal - currentProjectedBaseValue + nextProjectedBaseValue) *
            projectedRecontractMultiplier +
          projectedAccessoryReward;
        estimatedIncrease = Math.max(0, nextPrimeTotal - projectedPrimeTotal);
      }

      opportunities.push({
        key,
        label: metric.label,
        nextScaleLabel: buildScaleLabel(nextScale.thresholdPercent),
        estimatedIncrease,
        dailyRequired,
        additionalRequiredTotal
      });
    }

    if (metrics.accessory.target && metrics.accessory.target > 0) {
      const nextAccessoryScale = findNextScaleRow(sheetRows, metrics.accessory.projectedTempo);
      if (nextAccessoryScale) {
        const requiredTotal = (metrics.accessory.target * nextAccessoryScale.thresholdPercent) / 100;
        const additionalRequiredTotal = Math.max(0, requiredTotal - metrics.accessory.actual);

        if (additionalRequiredTotal > 0) {
          const nextProjectedAccessoryReward =
            requiredTotal * ((nextAccessoryScale.accessoryRate ?? 0) / 100);
          opportunities.push({
            key: "accessory",
            label: metrics.accessory.label,
            nextScaleLabel: buildScaleLabel(nextAccessoryScale.thresholdPercent),
            estimatedIncrease: Math.max(0, nextProjectedAccessoryReward - projectedAccessoryReward),
            dailyRequired: additionalRequiredTotal / remainingDays,
            additionalRequiredTotal
          });
        }
      }
    }
  }

  opportunities.sort((left, right) => right.estimatedIncrease - left.estimatedIncrease || left.dailyRequired - right.dailyRequired);

  return {
    storeName,
    managerName,
    currentPrimeTotal,
    projectedPrimeTotal,
    currentNonAccessoryBaseTotal,
    projectedNonAccessoryBaseTotal,
    currentRecontractMultiplier,
    projectedRecontractMultiplier,
    currentAccessoryReward,
    projectedAccessoryReward,
    rows,
    metrics,
    opportunities
  } satisfies ManagerPrimeSummary;
}

export const defaultManagerPrimeSettings = DEFAULT_MANAGER_PRIME_SETTINGS;

export async function fetchManagerPrimeStoreCategoryOptions() {
  const storeRows = await fetchGoalStoreRows();
  return [...new Set(storeRows.map((row) => row.mainCategory).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "tr"));
}
