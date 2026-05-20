import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CopyCoachingButton } from "@/components/evaluation/copy-coaching-button";
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

type ViewMode = "employee" | "store" | "company";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY_DAYS = {
  workedDays: 0,
  remainingDays: 0,
  totalDays: 0
};

function canOpenEvaluation(role: UserRole | string | null | undefined) {
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

function pickCritical(metrics: Metric[]) {
  return metrics
    .filter((metric) => metric.hasTarget && !isQualityLimitMetric(metric.title) && (metric.projectedPercent ?? metric.actualPercent ?? 0) < 100)
    .sort((a, b) => (a.projectedPercent ?? a.actualPercent ?? 0) - (b.projectedPercent ?? b.actualPercent ?? 0))
    .slice(0, 4);
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

function buildProductionChannelNotes(metrics: Metric[]) {
  const terminalMetric = metrics.find((metric) => normalizeCategoryKey(metric.title).includes("TERMINAL"));
  const activationMetric = metrics.find((metric) => normalizeCategoryKey(metric.title).includes("AKTIVASYON"));

  if (!terminalMetric || !activationMetric) {
    return [];
  }

  const terminalWeight = terminalMetric.actual / 6;
  const activationWeight = activationMetric.actual / 3;

  if (terminalWeight <= 0 && activationWeight <= 0) {
    return ["- Uretim puani tarafinda terminal ve aktivasyon katkisi henuz net olusmamis. Kalan gunlerde iki kanali da gunluk takip edelim."];
  }

  if (terminalWeight < activationWeight * 0.7) {
    return [
      "- Uretim puaninda agirlik aktivasyon tarafina kaymis gorunuyor. Puan dengesini guclendirmek icin terminal tarafini gelistirmelisin; kalan gunlerde terminal gorusmelerini ayrica takip edelim."
    ];
  }

  if (activationWeight < terminalWeight * 0.7) {
    return [
      "- Uretim puaninda agirlik terminal tarafina kaymis gorunuyor. Puanin daha dengeli ilerlemesi icin aktivasyon tarafini gelistirmelisin; kalan gunlerde aktivasyon aksiyonlarini one alalim."
    ];
  }

  return ["- Uretim puaninda terminal ve aktivasyon dengesi kabul edilebilir seviyede. Bu dengeyi bozmadan toplam puani buyutmeye odaklanalim."];
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
    `- Giris sayisini ayri hedef kalemi gibi degerlendirmiyorum; burada musteri trafigine donusum olarak bakiyorum. Iceri giren musterilerin yaklasik ${formatPercent(conversion)} kadarinda aktivasyon, terminal veya rekontratlama satisi olusmus. Bu orani yukari tasimak icin giris yapan musteride ihtiyac analizi ve kapanis takibini siklastiralim.`
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
      `- Uretim puaninda ay sonu gidisatin ${formatNumber(currentScale)} skalasina denk geliyor. Bu en ust skala oldugu icin burada amac tempoyu korumak ve kanal dengesini bozmamak.`
    ];
  }

  const neededForNextScale = Math.max(nextScale - productionPointMetric.actual, 0);
  const dailyNeed = remainingDays > 0 ? Math.ceil(neededForNextScale / remainingDays) : neededForNextScale;
  const scaleText = currentScale > 0 ? `${formatNumber(currentScale)} skalasina` : "400 skalasinin altina";

  return [
    `- Uretim puaninda mevcut gidisat ay sonu ${scaleText} denk geliyor. Bir ust skala olan ${formatNumber(nextScale)} icin kalan gunlerde gunluk en az ${formatNumber(dailyNeed)} uretim puani yapman gerekiyor.`
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
    `- ${productionPointMetric.title}: ay sonu gidisat 400 puanlik ilk prim skalasinin altinda kaliyor. Ilk skalaya girmek icin kalan gunlerde gunluk en az ${formatNumber(dailyNeed)} uretim puani yapman gerekiyor.`
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
        `- Memnuniyet skoru ${formatNumber(satisfactionMetric.actual)}. Alt limit 4,40 oldugu icin karsilama, ihtiyac analizi ve islem sonrasi teyit gunluk takip edilmeli.`
      );
    } else if (satisfactionMetric.actual < 4.5) {
      notes.push(
        `- Memnuniyet skoru ${formatNumber(satisfactionMetric.actual)} ile alt limite yakin. Dusus yasamamak icin musteri deneyimi her gun kontrol edilmeli.`
      );
    }
  }

  if (pinMetric && pinMetric.actual > 0) {
    const pinPercent = pinMetric.actual <= 1 ? pinMetric.actual * 100 : pinMetric.actual;

    if (pinPercent <= 70) {
      notes.push(
        `- PIN orani ${formatPercent(pinPercent)}. %70 sinirinda veya altinda oldugu icin PIN kullanim adimlari ekipte tekrar hatirlatilmali.`
      );
    } else if (pinPercent <= 75) {
      notes.push(
        `- PIN orani ${formatPercent(pinPercent)} ile alt limite yakin. Bu oranin dusmemesi icin PIN kullanim takibi siklastirilmali.`
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
}) {
  const strong = pickStrong(args.metrics);
  const critical = pickCritical(args.metrics).filter((metric) => !isEvaluationHiddenMetric(metric.title));
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
  const dailyNeeded = (metric: Metric) =>
    args.remainingDays > 0 && metric.remaining !== null ? Math.ceil(metric.remaining / args.remainingDays) : metric.remaining ?? 0;
  const dailyCurrentPace = (metric: Metric) => (args.workedDays > 0 ? metric.actual / args.workedDays : metric.actual);
  const dailyTargetLines = critical.slice(0, 4).map((metric) => {
    const needed = dailyNeeded(metric);
    return `- ${metric.title}: ay sonu ${formatPercent(metric.projectedPercent ?? metric.actualPercent)} seviyesinde kalir. Hedefi kapatmak icin kalan gunlerde gunluk en az ${formatNumber(needed)} uretmen lazim.`;
  });
  const developmentLines = [
    ...critical.map(
      (metric) =>
        `- ${metric.title}: mevcut tempo ile ay sonu ${formatPercent(metric.projectedPercent ?? metric.actualPercent)} olur. Kalan ${formatNumber(metric.remaining)} acigi kapatmak icin gunluk en az ${formatNumber(dailyNeeded(metric))} uretim gerekiyor.`
    ),
    ...productionPointDevelopmentLines
  ];
  const storeAverageSection = args.storeAverageNotes.length
    ? [
        "",
        "Firma / ortalama kritikleri:",
        ...args.storeAverageNotes.map((note) => `- ${note} Bu kalem icin magaza icinde gunluk takip ve ekip yonlendirmesi artirilmali.`)
      ]
    : [];
  const qualityLimitNotes = buildQualityLimitNotes(args.metrics, args.view);
  const qualityLimitSection = qualityLimitNotes.length ? ["", "Alt limit uyarilari:", ...qualityLimitNotes] : [];
  const averageFocusSection =
    args.view === "employee"
      ? [
          "",
          "Ortalama karsilastirmasina gore odak alanlari:",
          ...(args.employeeAverageNotes.length
            ? args.employeeAverageNotes.map(
                (note) =>
                  `- ${note.title}: bu kalemde ekip ortalamasi ${formatNumber(note.average)}, sende ${formatNumber(note.actual)}. Ortalama farki ${formatNumber(note.gap)}. Kalan gunlerde bu kalemi her gun kontrol edip farki kademeli kapatmaya odaklanalim.`
              )
            : ["- Ortalama altinda belirgin bir kalem gorunmuyor. Bu durumda yuksek hacimli kalemlerde tempoyu korumak oncelik."])
        ]
      : [];
  const opening =
    args.view === "employee"
      ? `Merhaba ${args.title}, bu notu performansini birlikte netlestirmek ve kalan gunlerde nereye odaklanacagimizi sadece belirlemek icin hazirladim.`
      : `Bu not, secili alanin kalan gunlerde daha net yonetilebilmesi icin hazirlandi.`;

  const lines = [
    opening,
    `Donem: ${formatNumber(args.workedDays)} gun tamamlandi, ${formatNumber(args.remainingDays)} gun kaldi.`,
    "",
    "Guclu taraflarin:",
    ...(strong.length
      ? strong.map((metric) => {
          const pace = dailyCurrentPace(metric);
          if (metric.hasTarget) {
            return `- ${metric.title}: bu kalemde hedef temposu yakalaniyor. Su an ${formatNumber(metric.actual)} gerceklesen var; mevcut tempo ay sonu ${formatPercent(metric.projectedPercent)} seviyesine tasir. Gunluk ortalama ${formatNumber(pace)} uretimi korumalisin.`;
          }

          return `- ${metric.title}: hedef tanimi yok ama ${formatNumber(metric.actual)} gerceklesen var. Bu kalemi guclu takip kalemi olarak koruyalim.`;
        })
      : ["- Hedefe giden guclu bir hedefli kalem henuz netlesmemis. Bu yuzden odagi hedef acigi olan kalemlere cevirmeliyiz."]),
    "",
    "Gelistirmemiz gereken alanlar:",
    ...(developmentLines.length
      ? developmentLines
      : ["- Hedefli kalemlerde su an belirgin risk yok. Bu iyi bir alan; ayni disiplini koruyalim."]),
    ...averageFocusSection,
    ...qualityLimitSection,
    "",
    "Kalan gunler icin net aksiyon:",
    ...(dailyTargetLines.length
      ? dailyTargetLines
      : ["- Her gun en az bir ana kalemi kontrol edip, dusuk kalan kalemlerde satis gorusmesini ozellikle one alalim."]),
    ...(productionChannelNotes.length ? productionChannelNotes : []),
    ...(productionPointScaleNotes.length ? productionPointScaleNotes : []),
    ...(entryConversionNotes.length ? entryConversionNotes : []),
    "- Gun sonunda sadece toplam rakama degil, hangi kalemin eksik kaldigina bakalim.",
    "- Bir sonraki gunde en dusuk kalan kalemi ilk aksiyon olarak takip edelim.",
    ...storeAverageSection,
    "",
    "Hedefsiz takip edilen kalemler:",
    ...(actualOnly.length
      ? actualOnly.map(
          (metric) =>
            `- ${metric.title}: hedef tanimi yok ama su an ${formatNumber(metric.actual)} gerceklesen var. Mevcut gunluk tempo ${formatNumber(dailyCurrentPace(metric))}; ay sonu tahmini ${formatNumber(metric.projected)}. Burada amac trendi korumak ve dusus varsa hemen fark etmek.`
        )
      : ["- Hedefsiz takip edilen oncelikli kalem yok."]),
    "",
    `Analiz guncellenme: ${formatIstanbulDateTime()}`
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
    .select("approval, role, store:stores(name)")
    .eq("id", user.id)
    .single();

  const safeProfile = profile as { approval?: string; role?: UserRole; store?: { name: string } | null } | null;
  if (!safeProfile || safeProfile.approval !== "approved" || !canOpenEvaluation(safeProfile.role)) {
    redirect("/");
  }

  const view: ViewMode =
    requestedView === "company" && canOpenCompany(safeProfile.role)
      ? "company"
      : requestedView === "store"
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
  const allStoreNames = Array.from(new Set(storeRows.map((row) => row.storeCode).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
  const storeNames = safeProfile.role === "manager" && ownStoreName ? allStoreNames.filter((name) => name === ownStoreName) : allStoreNames;

  const activeEmployee = employeeNames.includes(requestedTarget) ? requestedTarget : employeeNames[0] ?? "";
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
  const coachingText = buildCoachingText({
    title: selectedTitle,
    view,
    metrics: visibleMetrics,
    workedDays: dayStats.workedDays,
    remainingDays: dayStats.remainingDays,
    totalDays: dayStats.totalDays,
    storeAverageNotes,
    employeeAverageNotes
  });

  const employeeOptions = employeeNames.map((name) => ({ label: name, value: buildHref("employee", name, activeCategory) }));
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
          <a className={`goal-tab ${view === "store" ? "goal-tab-active" : ""}`} href={buildHref("store", activeStore)}>
            Magaza
          </a>
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
                  <CopyCoachingButton text={coachingText} />
                </div>
                <pre className="evaluation-copy-text">{coachingText}</pre>
              </article>

              <article className="evaluation-card">
                <h2>Gelistirme Alanlari</h2>
                <div className="evaluation-bars">
                  {pickCritical(visibleMetrics).length ? (
                    pickCritical(visibleMetrics).map((metric) => (
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
