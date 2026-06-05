import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CopyCoachingButton } from "@/components/evaluation/copy-coaching-button";
import { SpeakCoachingButton } from "@/components/evaluation/speak-coaching-button";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import {
  GoalActualRow,
  GoalStoreRow,
  fetchGoalActualRows,
  fetchGoalDayStats,
  fetchGoalStoreRows
} from "@/lib/goal-actuals";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/lib/types";

type EvaluationPageProps = {
  searchParams?: Promise<{
    view?: string;
    target?: string;
    category?: string;
  }>;
};

type Metric = {
  title: string;
  target: number | null;
  actual: number;
  remaining: number | null;
  actualPercent: number | null;
  projected: number | null;
  projectedPercent: number | null;
  hasTarget: boolean;
  showProjection: boolean;
};

type AverageNote = {
  title: string;
  actual: number;
  average: number;
  gap: number;
};

type ZeroActualItem = {
  key: string;
  label: string;
};

type ViewMode = "employee" | "store" | "company";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY_DAYS = {
  workedDays: 0,
  remainingDays: 0,
  totalDays: 0
};

function canOpenEvaluation(role: UserRole | string | null | undefined) {
  return role === "admin" || role === "management" || role === "manager" || role === "employee";
}

function canOpenStore(role: UserRole | string | null | undefined) {
  return role === "admin" || role === "management" || role === "manager";
}

function canOpenCompany(role: UserRole | string | null | undefined) {
  return role === "admin" || role === "management";
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  });
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `%${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}

function formatIstanbulDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function buildHref(view: ViewMode, target?: string, category?: string) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (target) params.set("target", target);
  if (category) params.set("category", category);
  return `/degerlendirme?${params.toString()}`;
}

function metricFromEmployeeRows(title: string, rows: GoalActualRow[], workedDays: number, totalDays: number): Metric {
  const target = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = target > 0;
  const projected = workedDays > 0 ? Math.floor((actual / workedDays) * totalDays) : actual;

  return {
    title,
    target: hasTarget ? target : null,
    actual,
    remaining: hasTarget ? Math.max(target - actual, 0) : null,
    actualPercent: hasTarget ? (actual / target) * 100 : null,
    projected,
    projectedPercent: hasTarget ? (projected / target) * 100 : null,
    hasTarget,
    showProjection: true
  };
}

function metricFromStoreRows(title: string, rows: GoalStoreRow[], workedDays: number, totalDays: number): Metric {
  const target = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = target > 0;
  const showProjection = rows.every((row) => row.includeProjection);
  const projected = showProjection ? (workedDays > 0 ? Math.floor((actual / workedDays) * totalDays) : actual) : null;

  return {
    title,
    target: hasTarget ? target : null,
    actual,
    remaining: hasTarget ? Math.max(target - actual, 0) : null,
    actualPercent: hasTarget ? (actual / target) * 100 : null,
    projected,
    projectedPercent: hasTarget && projected !== null ? (projected / target) * 100 : null,
    hasTarget,
    showProjection
  };
}

function groupByCategory<T extends { mainCategory: string }>(
  rows: T[],
  buildMetric: (title: string, categoryRows: T[]) => Metric
) {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const list = map.get(row.mainCategory) ?? [];
    list.push(row);
    map.set(row.mainCategory, list);
  });

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([title, categoryRows]) => buildMetric(title, categoryRows));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function normalizeCategoryKey(value: string) {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/\u0130/g, "I")
    .replace(/\u011E/g, "G")
    .replace(/\u00DC/g, "U")
    .replace(/\u015E/g, "S")
    .replace(/\u00D6/g, "O")
    .replace(/\u00C7/g, "C");
}

function isProductionComponent(title: string) {
  const key = normalizeCategoryKey(title);
  return key.includes("TERMINAL") || key.includes("AKTIVASYON");
}

function isEntryCount(title: string) {
  const key = normalizeCategoryKey(title);
  return key.includes("GIRIS SAY");
}

function isRecontract(title: string) {
  return normalizeCategoryKey(title).includes("REKONTRAT");
}

function isProductionPoint(title: string) {
  return normalizeCategoryKey(title).includes("URETIM PUAN");
}

function isSatisfactionScore(title: string) {
  return normalizeCategoryKey(title).includes("MEMNUNIYET");
}

function isPinRatio(title: string) {
  const key = normalizeCategoryKey(title);
  return key.includes("PIN") && key.includes("ORAN");
}

function isQualityLimitMetric(title: string) {
  return isSatisfactionScore(title) || isPinRatio(title);
}

function isEvaluationHiddenMetric(title: string) {
  return isEntryCount(title);
}

function buildCompanyCategoryMetrics(rows: GoalStoreRow[], workedDays: number, totalDays: number) {
  const categoryMap = new Map<string, GoalStoreRow[]>();
  rows.forEach((row) => {
    const current = categoryMap.get(row.mainCategory) ?? [];
    current.push(row);
    categoryMap.set(row.mainCategory, current);
  });

  return Array.from(categoryMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([title, categoryRows]) => {
      const mode = categoryRows[0]?.companyMode ?? "sum";
      const aggregate = mode === "average" ? average : (values: number[]) => values.reduce((sum, value) => sum + value, 0);
      const targetValues = categoryRows.map((row) => row.target ?? 0).filter((value) => value > 0);
      const actual = aggregate(categoryRows.map((row) => row.actual));
      const target = targetValues.length ? aggregate(targetValues) : 0;
      const includeProjection = categoryRows.every((row) => row.includeProjection);
      const projected = includeProjection ? (workedDays > 0 ? Math.floor((actual / workedDays) * totalDays) : actual) : null;

      return {
        title,
        target: target > 0 ? target : null,
        actual,
        remaining: target > 0 ? Math.max(target - actual, 0) : null,
        actualPercent: target > 0 ? (actual / target) * 100 : null,
        projected,
        projectedPercent: target > 0 && projected !== null ? (projected / target) * 100 : null,
        hasTarget: target > 0,
        showProjection: includeProjection
      } satisfies Metric;
    });
}

function pickStrong(metrics: Metric[]) {
  return metrics
    .filter((metric) => {
      if (isProductionPoint(metric.title)) {
        return false;
      }

      if (!metric.hasTarget) {
        return metric.actual > 0 && !isProductionComponent(metric.title) && !isEntryCount(metric.title) && !isQualityLimitMetric(metric.title);
      }

      return !isEntryCount(metric.title) && !isQualityLimitMetric(metric.title) && (metric.projectedPercent ?? metric.actualPercent ?? 0) >= 100;
    })
    .sort((a, b) => (b.projectedPercent ?? b.actual) - (a.projectedPercent ?? a.actual))
    .slice(0, 3);
}

function getEmployeeCategoryAverage(title: string, allEmployeeRows: GoalActualRow[]) {
  const employeeTotals = new Map<string, number>();
  allEmployeeRows
    .filter((row) => row.mainCategory === title)
    .forEach((row) => {
      employeeTotals.set(row.employeeName, (employeeTotals.get(row.employeeName) ?? 0) + row.actual);
    });

  return average(Array.from(employeeTotals.values()).filter((value) => value > 0));
}

function buildProductionStrongMetrics(metrics: Metric[], allEmployeeRows: GoalActualRow[]) {
  const productionPointMetric = metrics.find((metric) => isProductionPoint(metric.title));

  if (!productionPointMetric) {
    return [];
  }

  const projected = productionPointMetric.projected ?? productionPointMetric.actual;
  if (projected < 400) {
    return [];
  }

  const terminalMetric = metrics.find((metric) => normalizeCategoryKey(metric.title).includes("TERMINAL"));
  const activationMetric = metrics.find((metric) => normalizeCategoryKey(metric.title).includes("AKTIVASYON"));

  if (!terminalMetric || !activationMetric) {
    return [];
  }

  const terminalWeight = terminalMetric.actual / 6;
  const activationWeight = activationMetric.actual / 3;
  const terminalAverage = getEmployeeCategoryAverage(terminalMetric.title, allEmployeeRows);
  const activationAverage = getEmployeeCategoryAverage(activationMetric.title, allEmployeeRows);

  if (activationWeight < terminalWeight * 0.7 && terminalAverage > 0 && terminalMetric.actual > terminalAverage) {
    return [terminalMetric];
  }

  if (terminalWeight < activationWeight * 0.7 && activationAverage > 0 && activationMetric.actual > activationAverage) {
    return [activationMetric];
  }

  return [];
}

function pickCritical(metrics: Metric[]) {
  return metrics
    .filter((metric) => metric.hasTarget && !isQualityLimitMetric(metric.title) && (metric.projectedPercent ?? metric.actualPercent ?? 0) < 100)
    .sort((a, b) => (a.projectedPercent ?? a.actualPercent ?? 0) - (b.projectedPercent ?? b.actualPercent ?? 0))
    .slice(0, 4);
}

function isCriticalCandidate(metric: Metric | undefined) {
  if (!metric) {
    return false;
  }

  return metric.hasTarget && !isQualityLimitMetric(metric.title) && (metric.projectedPercent ?? metric.actualPercent ?? 0) < 100;
}

function appendUniqueMetric(metrics: Metric[], candidate: Metric | undefined) {
  if (!candidate || !isCriticalCandidate(candidate) || metrics.some((metric) => metric.title === candidate.title)) {
    return metrics;
  }

  return [...metrics, candidate].sort((a, b) => (a.projectedPercent ?? a.actualPercent ?? 0) - (b.projectedPercent ?? b.actualPercent ?? 0));
}

function buildPriorityCriticalMetrics(metrics: Metric[], view: ViewMode) {
  let criticalMetrics = pickCritical(metrics);
  const activationMetric = metrics.find(
    (metric) =>
      normalizeCategoryKey(metric.title).includes("AKTIVASYON") &&
      isCriticalCandidate(metric)
  );
  criticalMetrics = appendUniqueMetric(criticalMetrics, activationMetric);

  if (view === "company") {
    const terminalMetric = metrics.find(
      (metric) =>
        normalizeCategoryKey(metric.title).includes("TERMINAL") &&
        isCriticalCandidate(metric)
    );
    criticalMetrics = appendUniqueMetric(criticalMetrics, terminalMetric);
  }

  return criticalMetrics;
}

function buildStoreAverageNotes(storeMetrics: Metric[], allStoreRows: GoalStoreRow[]) {
  const notes: string[] = [];
  storeMetrics.forEach((metric) => {
    const categoryRows = allStoreRows.filter((row) => row.mainCategory === metric.title);
    const storeActuals = categoryRows.map((row) => row.actual);
    const avg = average(storeActuals);
    if (avg > 0 && metric.actual < avg) {
      notes.push(`${metric.title}: firma ortalamasi ${formatNumber(avg)}, mevcut ${formatNumber(metric.actual)}.`);
    }
  });
  return notes.slice(0, 4);
}

function buildEmployeeAverageNotes(employeeMetrics: Metric[], allEmployeeRows: GoalActualRow[]) {
  const notes: AverageNote[] = [];

  employeeMetrics.forEach((metric) => {
    const employeeTotals = new Map<string, number>();
    allEmployeeRows
      .filter((row) => row.mainCategory === metric.title)
      .forEach((row) => {
        employeeTotals.set(row.employeeName, (employeeTotals.get(row.employeeName) ?? 0) + row.actual);
      });

    const categoryAverage = average(Array.from(employeeTotals.values()).filter((value) => value > 0));

    if (categoryAverage > 0 && metric.actual < categoryAverage) {
      notes.push({
        title: metric.title,
        actual: metric.actual,
        average: categoryAverage,
        gap: categoryAverage - metric.actual
      });
    }
  });

  return notes.sort((a, b) => b.gap - a.gap).slice(0, 5);
}

function buildStoreZeroActualItems(rows: GoalStoreRow[], activeCategory: string) {
  const seen = new Set<string>();

  return rows
    .filter((row) => !activeCategory || row.mainCategory === activeCategory)
    .filter((row) => !isEvaluationHiddenMetric(row.mainCategory) && row.actual === 0)
    .map((row) => {
      const label = row.subCategory || row.mainCategory;
      return {
        key: `${row.storeCode}-${row.mainCategory}-${row.subCategory || "main"}`,
        label
      };
    })
    .filter((item) => {
      if (seen.has(item.label)) {
        return false;
      }
      seen.add(item.label);
      return true;
    });
}

function buildProductionChannelNotes(metrics: Metric[]) {
  const terminalMetric = metrics.find((metric) => normalizeCategoryKey(metric.title).includes("TERMINAL"));
  const activationMetric = metrics.find((metric) => normalizeCategoryKey(metric.title).includes("AKTIVASYON"));

  if (!terminalMetric || !activationMetric) {
    return [];
  }

  const terminalWeight = terminalMetric.actual / 6;
  const activationWeight = activationMetric.actual / 3;

  if (terminalWeight <= 0 && activationWeight <= 0) {
    return ["- Üretim puanı tarafında terminal ve aktivasyon katkısı henüz net oluşmamış. Kalan günlerde iki kanalı da günlük takip edelim."];
  }

  if (terminalWeight < activationWeight * 0.7) {
    return [
      "- Üretim puanında ağırlık aktivasyon tarafına kaymış görünüyor. Puan dengesini güçlendirmek için terminal tarafını geliştirmelisin; kalan günlerde terminal görüşmelerini ayrıca takip edelim."
    ];
  }

  if (activationWeight < terminalWeight * 0.7) {
    return [
      "- Üretim puanında ağırlık terminal tarafına kaymış görünüyor. Puanın daha dengeli ilerlemesi için aktivasyon tarafını geliştirmelisin; kalan günlerde aktivasyon aksiyonlarını öne alalım."
    ];
  }

  return ["- Üretim puanında terminal ve aktivasyon dengesi kabul edilebilir seviyede. Bu dengeyi bozmadan toplam puanı büyütmeye odaklanalım."];
}

function buildEntryConversionNotes(metrics: Metric[]) {
  const entryMetric = metrics.find((metric) => isEntryCount(metric.title));

  if (!entryMetric || entryMetric.actual <= 0) {
    return [];
  }

  const salesTotal = metrics
    .filter((metric) => isProductionComponent(metric.title) || isRecontract(metric.title))
    .reduce((sum, metric) => sum + metric.actual, 0);
  const conversion = (salesTotal / entryMetric.actual) * 100;

  return [
    `- Giriş sayısını ayrı hedef kalemi gibi değerlendirmiyorum; burada müşteri trafiğine dönüşüm olarak bakıyorum. İçeri giren müşterilerin yaklaşık ${formatPercent(conversion)} kadarında aktivasyon, terminal veya rekontratlama satışı oluşmuş. Bu oranı yukarı taşımak için giriş yapan müşteride ihtiyaç analizi ve kapanış takibini sıklaştıralım.`
  ];
}

function buildProductionPointScaleNotes(metrics: Metric[], remainingDays: number) {
  const productionPointMetric = metrics.find((metric) => isProductionPoint(metric.title));

  if (!productionPointMetric) {
    return [];
  }

  const projected = productionPointMetric.projected ?? productionPointMetric.actual;
  const currentScale = projected < 400 ? 0 : Math.min(Math.floor(projected / 50) * 50, 10000);
  const nextScale = currentScale < 400 ? 400 : Math.min(currentScale + 50, 10000);

  if (nextScale >= 10000 && currentScale >= 10000) {
    return [
      `- Üretim puanında ay sonu gidişatın ${formatNumber(currentScale)} skalasına denk geliyor. Bu en üst skala olduğu için burada amaç tempoyu korumak ve kanal dengesini bozmamak.`
    ];
  }

  const neededForNextScale = Math.max(nextScale - productionPointMetric.actual, 0);
  const dailyNeed = remainingDays > 0 ? Math.ceil(neededForNextScale / remainingDays) : neededForNextScale;
  const scaleText = currentScale > 0 ? `${formatNumber(currentScale)} skalasına` : "400 skalasının altına";

  return [
    `- Üretim puanında mevcut gidişat ay sonu ${scaleText} denk geliyor. Bir üst skala olan ${formatNumber(nextScale)} için kalan günlerde günlük en az ${formatNumber(dailyNeed)} üretim puanı yapman gerekiyor.`
  ];
}

function buildProductionPointDevelopmentLines(metrics: Metric[], remainingDays: number) {
  const productionPointMetric = metrics.find((metric) => isProductionPoint(metric.title));

  if (!productionPointMetric) {
    return [];
  }

  const projected = productionPointMetric.projected ?? productionPointMetric.actual;

  if (projected >= 400) {
    return [];
  }

  const neededForFirstScale = Math.max(400 - productionPointMetric.actual, 0);
  const dailyNeed = remainingDays > 0 ? Math.ceil(neededForFirstScale / remainingDays) : neededForFirstScale;

  return [
    `- ${productionPointMetric.title}: ay sonu gidişat 400 puanlık ilk prim skalasının altında kalıyor. İlk skalaya girmek için kalan günlerde günlük en az ${formatNumber(dailyNeed)} üretim puanı yapman gerekiyor.`
  ];
}

function buildActivationCountNotes(metrics: Metric[], workedDays: number, remainingDays: number) {
  const activationMetric = metrics.find((metric) => normalizeCategoryKey(metric.title).includes("AKTIVASYON"));

  if (!activationMetric) {
    return [];
  }

  const pace = workedDays > 0 ? activationMetric.actual / workedDays : activationMetric.actual;
  const projectedPercent = activationMetric.projectedPercent ?? activationMetric.actualPercent;

  if (!activationMetric.hasTarget) {
    if (activationMetric.actual <= 0) {
      return [];
    }

    return [
      `- ${activationMetric.title}: bu kalem hedefsiz takip ediliyor. Şu an ${formatNumber(activationMetric.actual)} gerçekleşen var; günlük ortalama ${formatNumber(pace)} seviyesinde. Toplam aktivasyon adedindeki bu tempoyu koruyup düşüş olursa aynı gün müdahale edelim.`
    ];
  }

  if ((projectedPercent ?? 0) >= 100) {
    return [
      `- ${activationMetric.title}: aktivasyon adedinde mevcut tempo hedefi taşıyor. Şu an ${formatNumber(activationMetric.actual)} gerçekleşen var; bu tempo ay sonu ${formatPercent(projectedPercent)} seviyesine ulaşıyor. Toplam adet ritmini korumaya odaklanalım.`
    ];
  }

  const needed =
    remainingDays > 0 && activationMetric.remaining !== null
      ? Math.ceil(activationMetric.remaining / remainingDays)
      : activationMetric.remaining ?? 0;

  return [
    `- ${activationMetric.title}: aktivasyon adedinde mevcut tempo ay sonu ${formatPercent(projectedPercent)} seviyesinde kalıyor. Hedefi kapatmak için kalan günlerde günlük en az ${formatNumber(needed)} aktivasyon gerekiyor. Bu kalemi toplam adet üzerinden günlük takip edelim.`
  ];
}

function buildQualityLimitNotes(metrics: Metric[], view: ViewMode) {
  if (view === "employee") {
    return [];
  }

  const notes: string[] = [];
  const satisfactionMetric = metrics.find((metric) => isSatisfactionScore(metric.title));
  const pinMetric = metrics.find((metric) => isPinRatio(metric.title));

  if (satisfactionMetric && satisfactionMetric.actual > 0) {
    if (satisfactionMetric.actual < 4.4) {
      notes.push(
        `- Memnuniyet skoru ${formatNumber(satisfactionMetric.actual)}. Alt limit 4,40 olduğu için karşılama, ihtiyaç analizi ve işlem sonrası teyit günlük takip edilmeli.`
      );
    } else if (satisfactionMetric.actual < 4.5) {
      notes.push(
        `- Memnuniyet skoru ${formatNumber(satisfactionMetric.actual)} ile alt limite yakın. Düşüş yaşamamak için müşteri deneyimi her gün kontrol edilmeli.`
      );
    }
  }

  if (pinMetric && pinMetric.actual > 0) {
    const pinPercent = pinMetric.actual <= 1 ? pinMetric.actual * 100 : pinMetric.actual;

    if (pinPercent <= 70) {
      notes.push(
        `- PIN oranı ${formatPercent(pinPercent)}. %70 sınırında veya altında olduğu için PIN kullanım adımları ekipte tekrar hatırlatılmalı.`
      );
    } else if (pinPercent <= 75) {
      notes.push(
        `- PIN oranı ${formatPercent(pinPercent)} ile alt limite yakın. Bu oranın düşmemesi için PIN kullanım takibi sıklaştırılmalı.`
      );
    }
  }

  return notes;
}

function buildCoachingText(args: {
  title: string;
  view: ViewMode;
  metrics: Metric[];
  workedDays: number;
  remainingDays: number;
  totalDays: number;
  storeAverageNotes: string[];
  employeeAverageNotes: AverageNote[];
  allEmployeeRows: GoalActualRow[];
  zeroActualItems?: ZeroActualItem[];
}) {
  const strong = [
    ...pickStrong(args.metrics),
    ...(args.view === "employee" ? buildProductionStrongMetrics(args.metrics, args.allEmployeeRows) : [])
  ].filter((metric, index, list) => list.findIndex((item) => item.title === metric.title) === index);
  const critical = buildPriorityCriticalMetrics(args.metrics, args.view).filter((metric) => !isEvaluationHiddenMetric(metric.title));
  const actualOnly = args.metrics
    .filter(
      (metric) =>
        !metric.hasTarget &&
        !isProductionComponent(metric.title) &&
        !isProductionPoint(metric.title) &&
        !isEvaluationHiddenMetric(metric.title) &&
        !isQualityLimitMetric(metric.title)
    )
    .slice(0, 3);
  const productionChannelNotes = args.view === "employee" ? buildProductionChannelNotes(args.metrics) : [];
  const entryConversionNotes = args.view === "employee" ? buildEntryConversionNotes(args.metrics) : [];
  const productionPointScaleNotes = args.view === "employee" ? buildProductionPointScaleNotes(args.metrics, args.remainingDays) : [];
  const productionPointDevelopmentLines =
    args.view === "employee" ? buildProductionPointDevelopmentLines(args.metrics, args.remainingDays) : [];
  const activationCountNotes = buildActivationCountNotes(args.metrics, args.workedDays, args.remainingDays);
  const dailyNeeded = (metric: Metric) =>
    args.remainingDays > 0 && metric.remaining !== null ? Math.ceil(metric.remaining / args.remainingDays) : metric.remaining ?? 0;
  const dailyCurrentPace = (metric: Metric) => (args.workedDays > 0 ? metric.actual / args.workedDays : metric.actual);
  const dailyTargetLines = critical.slice(0, 4).map((metric) => {
    const needed = dailyNeeded(metric);
    return `- ${metric.title}: ay sonu ${formatPercent(metric.projectedPercent ?? metric.actualPercent)} seviyesinde kalır. Hedefi kapatmak için kalan günlerde günlük en az ${formatNumber(needed)} üretmen lazım.`;
  });
  const developmentLines = [
    ...critical.map(
      (metric) =>
        `- ${metric.title}: mevcut tempo ile ay sonu ${formatPercent(metric.projectedPercent ?? metric.actualPercent)} olur. Kalan ${formatNumber(metric.remaining)} açığı kapatmak için günlük en az ${formatNumber(dailyNeeded(metric))} üretim gerekiyor.`
    ),
    ...productionPointDevelopmentLines
  ];
  const storeAverageSection = args.storeAverageNotes.length
    ? [
        "",
        "Firma / ortalama kritikleri:",
        ...args.storeAverageNotes.map((note) => `- ${note} Bu kalem için mağaza içinde günlük takip ve ekip yönlendirmesi artırılmalı.`)
      ]
    : [];
  const zeroActualSection =
    args.view === "store" && args.zeroActualItems?.length
      ? [
          "",
          "Gözden kaçırdığın kalemler:",
          ...args.zeroActualItems.map((item) => `- ${item.label}: bu kalemde henüz gerçekleşen yok. Bugün mutlaka kontrol listesine alınmalı.`)
        ]
      : [];
  const qualityLimitNotes = buildQualityLimitNotes(args.metrics, args.view);
  const qualityLimitSection = qualityLimitNotes.length ? ["", "Alt limit uyarıları:", ...qualityLimitNotes] : [];
  const averageFocusSection =
    args.view === "employee"
      ? [
          "",
          "Ortalama karşılaştırmasına göre odak alanları:",
          ...(args.employeeAverageNotes.length
            ? args.employeeAverageNotes.map(
                (note) =>
                  `- ${note.title}: bu kalemde ekip ortalaması ${formatNumber(note.average)}, sende ${formatNumber(note.actual)}. Ortalama farkı ${formatNumber(note.gap)}. Kalan günlerde bu kalemi her gün kontrol edip farkı kademeli kapatmaya odaklanalım.`
              )
            : ["- Ortalama altında belirgin bir kalem görünmüyor. Bu durumda yüksek hacimli kalemlerde tempoyu korumak öncelik."])
        ]
      : [];
  const opening =
    args.view === "employee"
      ? `Merhaba ${args.title}, bu notu performansını birlikte netleştirmek ve kalan günlerde nereye odaklanacağımızı belirlemek için hazırladım.`
      : `Bu not, seçili alanın kalan günlerde daha net yönetilebilmesi için hazırlandı.`;

  const lines = [
    opening,
    `Dönem: ${formatNumber(args.workedDays)} gün tamamlandı, ${formatNumber(args.remainingDays)} gün kaldı.`,
    "",
    "Güçlü tarafların:",
    ...(strong.length
      ? strong.map((metric) => {
          const pace = dailyCurrentPace(metric);
          if (metric.hasTarget) {
            return `- ${metric.title}: bu kalemde hedef temposu yakalanıyor. Şu an ${formatNumber(metric.actual)} gerçekleşen var; mevcut tempo ay sonu ${formatPercent(metric.projectedPercent)} seviyesine taşır. Günlük ortalama ${formatNumber(pace)} üretimi korumalısın.`;
          }

          return `- ${metric.title}: hedef tanımı yok ama ${formatNumber(metric.actual)} gerçekleşen var. Bu kalemi güçlü takip kalemi olarak koruyalım.`;
        })
      : ["- Hedefe giden güçlü bir hedefli kalem henüz netleşmemiş. Bu yüzden odağı hedef açığı olan kalemlere çevirmeliyiz."]),
    "",
    "Geliştirmemiz gereken alanlar:",
    ...(developmentLines.length
      ? developmentLines
      : ["- Hedefli kalemlerde şu an belirgin risk yok. Bu iyi bir alan; aynı disiplini koruyalım."]),
    ...averageFocusSection,
    ...qualityLimitSection,
    "",
    "Kalan günler için net aksiyon:",
    ...(dailyTargetLines.length
      ? dailyTargetLines
      : ["- Her gün en az bir ana kalemi kontrol edip, düşük kalan kalemlerde satış görüşmesini özellikle öne alalım."]),
    ...(activationCountNotes.length ? activationCountNotes : []),
    ...(productionChannelNotes.length ? productionChannelNotes : []),
    ...(productionPointScaleNotes.length ? productionPointScaleNotes : []),
    ...(entryConversionNotes.length ? entryConversionNotes : []),
    "- Gün sonunda sadece toplam rakama değil, hangi kalemin eksik kaldığına bakalım.",
    "- Bir sonraki günde en düşük kalan kalemi ilk aksiyon olarak takip edelim.",
    ...zeroActualSection,
    ...storeAverageSection,
    "",
    "Hedefsiz takip edilen kalemler:",
    ...(actualOnly.length
      ? actualOnly.map(
          (metric) =>
            `- ${metric.title}: hedef tanımı yok ama şu an ${formatNumber(metric.actual)} gerçekleşen var. Mevcut günlük tempo ${formatNumber(dailyCurrentPace(metric))}; ay sonu tahmini ${formatNumber(metric.projected)}. Burada amaç trendi korumak ve düşüş varsa hemen fark etmek.`
        )
      : ["- Hedefsiz takip edilen öncelikli kalem yok."]),
    "",
    `Analiz güncellenme: ${formatIstanbulDateTime()}`
  ];

  return lines.join("\n");
}

async function refreshEvaluationAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/giris");

  const { data: profile } = await supabase.from("profiles").select("approval, role").eq("id", user.id).single();
  const safeProfile = profile as { approval?: string; role?: UserRole } | null;

  if (!safeProfile || safeProfile.approval !== "approved" || safeProfile.role !== "admin") {
    redirect("/");
  }

  revalidatePath("/degerlendirme");
  redirect(String(formData.get("redirectTo") ?? "/degerlendirme"));
}

export default async function EvaluationPage({ searchParams }: EvaluationPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const requestedView = String(params?.view ?? "employee") as ViewMode;
  const requestedTarget = String(params?.target ?? "").trim();
  const requestedCategory = String(params?.category ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/giris");

  const { data: profile } = await supabase
    .from("profiles")
    .select("approval, role, full_name, store:stores(name)")
    .eq("id", user.id)
    .single();

  const safeProfile = profile as { approval?: string; role?: UserRole; full_name?: string | null; store?: { name: string } | null } | null;
  if (!safeProfile || safeProfile.approval !== "approved" || !canOpenEvaluation(safeProfile.role)) {
    redirect("/");
  }

  const view: ViewMode =
    requestedView === "company" && canOpenCompany(safeProfile.role)
      ? "company"
      : requestedView === "store" && canOpenStore(safeProfile.role)
        ? "store"
        : "employee";

  let employeeRows: GoalActualRow[] = [];
  let storeRows: GoalStoreRow[] = [];
  let dayStats = EMPTY_DAYS;
  let errorMessage = "";

  try {
    [employeeRows, storeRows, dayStats] = await Promise.all([fetchGoalActualRows(), fetchGoalStoreRows(), fetchGoalDayStats()]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Google Sheet verisi okunamadi.";
  }

  const ownStoreName = safeProfile.store?.name ?? "";
  const employeeNames = Array.from(new Set(employeeRows.map((row) => row.employeeName).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
  const visibleEmployeeNames =
    safeProfile.role === "employee" && safeProfile.full_name
      ? employeeNames.filter((name) => normalizeCategoryKey(name) === normalizeCategoryKey(safeProfile.full_name ?? ""))
      : employeeNames;
  const allStoreNames = Array.from(new Set(storeRows.map((row) => row.storeCode).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
  const storeNames = safeProfile.role === "manager" && ownStoreName ? allStoreNames.filter((name) => name === ownStoreName) : allStoreNames;

  const activeEmployee = visibleEmployeeNames.includes(requestedTarget) ? requestedTarget : visibleEmployeeNames[0] ?? "";
  const activeStore = storeNames.includes(requestedTarget) ? requestedTarget : storeNames[0] ?? "";

  const employeeTargetRows = employeeRows.filter((row) => row.employeeName === activeEmployee);
  const storeTargetRows = storeRows.filter((row) => row.storeCode === activeStore);

  const employeeMetrics = groupByCategory(employeeTargetRows, (title, rows) =>
    metricFromEmployeeRows(title, rows, dayStats.workedDays, dayStats.totalDays)
  );
  const storeMetrics = groupByCategory(storeTargetRows, (title, rows) => metricFromStoreRows(title, rows, dayStats.workedDays, dayStats.totalDays));
  const companyMetrics = buildCompanyCategoryMetrics(storeRows, dayStats.workedDays, dayStats.totalDays);

  const currentMetrics = view === "company" ? companyMetrics : view === "store" ? storeMetrics : employeeMetrics;
  const displayMetrics = currentMetrics.filter((metric) => !isEvaluationHiddenMetric(metric.title));
  const categories = displayMetrics.map((metric) => metric.title);
  const activeCategory = categories.includes(requestedCategory) ? requestedCategory : "";
  const visibleMetrics = activeCategory ? displayMetrics.filter((metric) => metric.title === activeCategory) : displayMetrics;
  const selectedTitle = view === "company" ? "Firma" : view === "store" ? activeStore : activeEmployee;
  const storeAverageNotes = view === "store" ? buildStoreAverageNotes(visibleMetrics, storeRows) : [];
  const employeeAverageNotes = view === "employee" ? buildEmployeeAverageNotes(visibleMetrics, employeeRows) : [];
  const zeroActualItems = view === "store" ? buildStoreZeroActualItems(storeTargetRows, activeCategory) : [];
  const criticalChartMetrics = buildPriorityCriticalMetrics(visibleMetrics, view);
  const coachingText = buildCoachingText({
    title: selectedTitle,
    view,
    metrics: visibleMetrics,
    workedDays: dayStats.workedDays,
    remainingDays: dayStats.remainingDays,
    totalDays: dayStats.totalDays,
    storeAverageNotes,
    employeeAverageNotes,
    allEmployeeRows: employeeRows,
    zeroActualItems
  });

  const employeeOptions = visibleEmployeeNames.map((name) => ({ label: name, value: buildHref("employee", name, activeCategory) }));
  const storeOptions = storeNames.map((name) => ({ label: name, value: buildHref("store", name, activeCategory) }));
  const categoryOptions = [
    { label: "Tum Kategoriler", value: buildHref(view, view === "company" ? "" : selectedTitle) },
    ...categories.map((category) => ({
      label: category,
      value: buildHref(view, view === "company" ? "" : selectedTitle, category)
    }))
  ];

  return (
    <main>
      <div className="evaluation-title-row">
        <h1 className="page-title">Degerlendirme</h1>
        {safeProfile.role === "admin" ? (
          <form action={refreshEvaluationAction}>
            <input
              name="redirectTo"
              type="hidden"
              value={buildHref(view, view === "company" ? "" : selectedTitle, activeCategory)}
            />
            <button className="button-primary evaluation-refresh-button" type="submit">
              Analizi Guncelle
            </button>
          </form>
        ) : null}
      </div>

      <section className="evaluation-shell">
        <div className="goal-tab-row evaluation-tabs">
          <a className={`goal-tab ${view === "employee" ? "goal-tab-active" : ""}`} href={buildHref("employee", activeEmployee)}>
            Calisan
          </a>
          {canOpenStore(safeProfile.role) ? (
            <a className={`goal-tab ${view === "store" ? "goal-tab-active" : ""}`} href={buildHref("store", activeStore)}>
              Magaza
            </a>
          ) : null}
          {canOpenCompany(safeProfile.role) ? (
            <a className={`goal-tab ${view === "company" ? "goal-tab-active" : ""}`} href={buildHref("company")}>
              Firma
            </a>
          ) : null}
        </div>

        {errorMessage ? (
          <section className="notice danger">{errorMessage}</section>
        ) : (
          <>
            <section className="evaluation-filter-card">
              {view !== "company" ? (
                <label className="evaluation-filter-item">
                  <span>{view === "store" ? "Magaza Secimi" : "Calisan Secimi"}</span>
                  <FilterSelectNav
                    ariaLabel={view === "store" ? "Magaza secimi" : "Calisan secimi"}
                    value={buildHref(view, selectedTitle, activeCategory)}
                    options={view === "store" ? storeOptions : employeeOptions}
                  />
                </label>
              ) : null}
              <label className="evaluation-filter-item">
                <span>Kategori Secimi</span>
                <FilterSelectNav
                  ariaLabel="Kategori secimi"
                  value={activeCategory ? buildHref(view, view === "company" ? "" : selectedTitle, activeCategory) : buildHref(view, view === "company" ? "" : selectedTitle)}
                  options={categoryOptions}
                />
              </label>
            </section>

            <section className="goal-summary-strip evaluation-day-strip">
              <article className="goal-summary-card">
                <span>Calisilan Gun</span>
                <strong>{formatNumber(dayStats.workedDays)}</strong>
              </article>
              <article className="goal-summary-card">
                <span>Kalan Gun</span>
                <strong>{formatNumber(dayStats.remainingDays)}</strong>
              </article>
              <article className="goal-summary-card">
                <span>Toplam Gun</span>
                <strong>{formatNumber(dayStats.totalDays)}</strong>
              </article>
            </section>

            <section className="evaluation-grid">
              <article className="evaluation-card evaluation-card-wide">
                <div className="evaluation-card-head">
                  <div>
                    <span>Secili Alan</span>
                    <strong>{selectedTitle || "Veri yok"}</strong>
                  </div>
                  <div className="evaluation-card-actions">
                    <SpeakCoachingButton text={coachingText} />
                    <CopyCoachingButton text={coachingText} />
                  </div>
                </div>
                {zeroActualItems.length ? (
                  <div className="evaluation-zero-alert">
                    <strong>Gozden kacirdigin kalemler</strong>
                    <p>Gercekleseni 0 olan bu kalemler bugun mutlaka kontrol edilmeli.</p>
                    <div>
                      {zeroActualItems.map((item) => (
                        <span key={item.key}>{item.label}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <pre className="evaluation-copy-text">{coachingText}</pre>
              </article>

              <article className="evaluation-card">
                <h2>Gelistirme Alanlari</h2>
                <div className="evaluation-bars">
                  {criticalChartMetrics.length ? (
                    criticalChartMetrics.map((metric) => (
                      <div key={metric.title} className="evaluation-bar-row">
                        <span>{metric.title}</span>
                        <strong>{formatPercent(metric.projectedPercent ?? metric.actualPercent)}</strong>
                        <div className="evaluation-bar-track">
                          <i style={{ width: `${Math.min(Math.max(metric.projectedPercent ?? metric.actualPercent ?? 0, 4), 100)}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="subtle">Kritik hedef acigi gorunmuyor.</p>
                  )}
                </div>
              </article>

              <article className="evaluation-card">
                <h2>Kategori Kartlari</h2>
                <div className="evaluation-metric-list">
                  {visibleMetrics.map((metric) => {
                    const isQualityMetric = isQualityLimitMetric(metric.title);

                    return (
                      <div key={metric.title} className="evaluation-metric-card">
                        <strong>{metric.title}</strong>
                        <div className="evaluation-metric-values">
                          <span>Gerceklesen {formatNumber(metric.actual)}</span>
                          {isQualityMetric ? (
                            <b>{isSatisfactionScore(metric.title) ? "Alt limit 4,40" : "Alt limit %70"}</b>
                          ) : (
                            <>
                              <span>Ay Sonu {formatNumber(metric.projected)}</span>
                              {metric.hasTarget ? <b>{formatPercent(metric.projectedPercent)} ay sonu</b> : <b>Hedefsiz takip</b>}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
