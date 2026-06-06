import { redirect } from "next/navigation";
import { StoreEvaluationPresentation } from "@/components/evaluation/store-evaluation-presentation";
import { requireUser } from "@/lib/auth/require-user";
import { fetchGoalActualRows, fetchGoalDayStats, type GoalActualRow, type GoalDayStats } from "@/lib/goal-actuals";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

type PresentationProfile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  approval: string;
  store: {
    name: string;
  } | null;
};

type MetricSummary = {
  title: string;
  target: number | null;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
  hasTarget: boolean;
};

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
};

type CategorySummaryRow = {
  label: string;
  target: number | null;
  actual: number;
  remaining: number | null;
  actualPercent: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
};

type EmployeeSnapshot = {
  name: string;
  totalActual: number;
  totalTarget: number | null;
  sharePercent: number;
  projectedPercent: number | null;
  belowTargetCount: number;
  strongestMetric: string;
  primaryRisk: string;
  dailyNeed: number;
};

type EmployeeCategoryTableRow = CategorySummaryRow;

type EmployeeCategoryTable = {
  title: string;
  parentTitle?: string;
  hasTarget: boolean;
  rows: EmployeeCategoryTableRow[];
  totalRow: EmployeeCategoryTableRow;
};

type PageProps = {
  searchParams?: Promise<{
    store?: string;
  }>;
};

const EMPTY_DAYS: GoalDayStats = {
  workedDays: 0,
  remainingDays: 0,
  totalDays: 0
};

function canOpenEvaluationPresentation(role: UserRole | null | undefined) {
  return role === "admin" || role === "management" || role === "manager";
}

function normalizeCategoryKey(value: string) {
  return String(value ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/\u0130/g, "I")
    .replace(/\u011E/g, "G")
    .replace(/\u00DC/g, "U")
    .replace(/\u015E/g, "S")
    .replace(/\u00D6/g, "O")
    .replace(/\u00C7/g, "C");
}

function isAggregateCategoryLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return normalized === "tum kategoriler" || normalized === "tüm kategoriler";
}

function isEntryCount(title: string) {
  return normalizeCategoryKey(title).includes("GIRIS SAY");
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  });
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })}`;
}

function buildEmployeeMetricSummary(rows: GoalActualRow[], workedDays: number, totalDays: number): MetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const projectedActual = workedDays > 0 ? Math.floor((actual / workedDays) * totalDays) : actual;
  const hasTarget = totalTarget > 0;

  return {
    title: rows[0]?.mainCategory ?? "Genel",
    target: hasTarget ? totalTarget : null,
    actual,
    actualPercent: hasTarget ? (actual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - actual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget
  };
}

function buildEmployeeCategorySummaries(rows: GoalActualRow[], workedDays: number, totalDays: number) {
  const map = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = map.get(row.mainCategory) ?? [];
    current.push(row);
    map.set(row.mainCategory, current);
  });

  return Array.from(map.entries())
    .map(([title, categoryRows]) => ({ ...buildEmployeeMetricSummary(categoryRows, workedDays, totalDays), title }))
    .sort((left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0));
}

function buildStoreCategoryRows(rows: GoalActualRow[], dayStats: GoalDayStats) {
  return buildEmployeeCategorySummaries(rows, dayStats.workedDays, dayStats.totalDays)
    .filter((metric) => !isEntryCount(metric.title))
    .map((metric) => ({
      label: metric.title,
      target: metric.target,
      actual: metric.actual,
      remaining: metric.remaining,
      actualPercent: metric.actualPercent,
      projectedActual: metric.projectedActual,
      projectedPercent: metric.projectedPercent
    }));
}

function buildEmployeeSnapshots(rows: GoalActualRow[], dayStats: GoalDayStats) {
  const employeeMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  const storeTotalActual = rows.reduce((sum, row) => sum + row.actual, 0);

  return Array.from(employeeMap.entries())
    .map(([name, employeeRows]) => {
      const totalSummary = buildEmployeeMetricSummary(employeeRows, dayStats.workedDays, dayStats.totalDays);
      const metrics = buildEmployeeCategorySummaries(employeeRows, dayStats.workedDays, dayStats.totalDays).filter(
        (metric) => metric.hasTarget && !isEntryCount(metric.title)
      );
      const sortedMetrics = [...metrics].sort(
        (left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0)
      );
      const strongestMetric = [...metrics].sort(
        (left, right) => (right.projectedPercent ?? right.actualPercent ?? 0) - (left.projectedPercent ?? left.actualPercent ?? 0)
      )[0];
      const primaryRisk = sortedMetrics[0];
      const dailyNeed =
        dayStats.remainingDays > 0 && primaryRisk?.remaining ? Math.ceil(primaryRisk.remaining / dayStats.remainingDays) : primaryRisk?.remaining ?? 0;

      return {
        name,
        totalActual: totalSummary.actual,
        totalTarget: totalSummary.target,
        sharePercent: storeTotalActual > 0 ? (totalSummary.actual / storeTotalActual) * 100 : 0,
        projectedPercent: totalSummary.projectedPercent ?? totalSummary.actualPercent,
        belowTargetCount: metrics.filter((metric) => (metric.projectedPercent ?? metric.actualPercent ?? 0) < 100).length,
        strongestMetric: strongestMetric?.title ?? "-",
        primaryRisk: primaryRisk?.title ?? "-",
        dailyNeed
      } satisfies EmployeeSnapshot;
    })
    .sort((left, right) => right.sharePercent - left.sharePercent);
}

function buildEmployeeCategoryTables(rows: GoalActualRow[], dayStats: GoalDayStats) {
  const categoryMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = categoryMap.get(row.mainCategory) ?? [];
    current.push(row);
    categoryMap.set(row.mainCategory, current);
  });

  return Array.from(categoryMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "tr"))
    .map(([title, categoryRows]) => {
      const employeeMap = new Map<string, GoalActualRow[]>();

      categoryRows.forEach((row) => {
        const current = employeeMap.get(row.employeeName) ?? [];
        current.push(row);
        employeeMap.set(row.employeeName, current);
      });

      const rowsForTable = Array.from(employeeMap.entries())
        .map(([label, employeeRows]) => {
          const summary = buildEmployeeMetricSummary(employeeRows, dayStats.workedDays, dayStats.totalDays);

          return {
            label,
            target: summary.target,
            actual: summary.actual,
            remaining: summary.remaining,
            actualPercent: summary.actualPercent,
            projectedActual: summary.projectedActual,
            projectedPercent: summary.projectedPercent
          } satisfies EmployeeCategoryTableRow;
        })
        .sort((left, right) => left.label.localeCompare(right.label, "tr"));

      const totalSummary = buildEmployeeMetricSummary(categoryRows, dayStats.workedDays, dayStats.totalDays);

      return {
        title,
        hasTarget: totalSummary.target !== null && totalSummary.target > 0,
        rows: rowsForTable,
        totalRow: {
          label: "SUBE",
          target: totalSummary.target,
          actual: totalSummary.actual,
          remaining: totalSummary.remaining,
          actualPercent: totalSummary.actualPercent,
          projectedActual: totalSummary.projectedActual,
          projectedPercent: totalSummary.projectedPercent
        }
      } satisfies EmployeeCategoryTable;
    });
}

function buildEmployeeSubcategoryTables(rows: GoalActualRow[], dayStats: GoalDayStats) {
  const categoryMap = new Map<string, GoalActualRow[]>();

  rows
    .filter((row) => Boolean(row.subCategory))
    .forEach((row) => {
      const key = `${row.mainCategory}__${row.subCategory}`;
      const current = categoryMap.get(key) ?? [];
      current.push(row);
      categoryMap.set(key, current);
    });

  return Array.from(categoryMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "tr"))
    .map(([key, subcategoryRows]) => {
      const [parentTitle, title] = key.split("__");
      const employeeMap = new Map<string, GoalActualRow[]>();

      subcategoryRows.forEach((row) => {
        const current = employeeMap.get(row.employeeName) ?? [];
        current.push(row);
        employeeMap.set(row.employeeName, current);
      });

      const rowsForTable = Array.from(employeeMap.entries())
        .map(([label, employeeRows]) => {
          const summary = buildEmployeeMetricSummary(employeeRows, dayStats.workedDays, dayStats.totalDays);

          return {
            label,
            target: summary.target,
            actual: summary.actual,
            remaining: summary.remaining,
            actualPercent: summary.actualPercent,
            projectedActual: summary.projectedActual,
            projectedPercent: summary.projectedPercent
          } satisfies EmployeeCategoryTableRow;
        })
        .sort((left, right) => left.label.localeCompare(right.label, "tr"));

      const totalSummary = buildEmployeeMetricSummary(subcategoryRows, dayStats.workedDays, dayStats.totalDays);

      return {
        title,
        parentTitle,
        hasTarget: totalSummary.target !== null && totalSummary.target > 0,
        rows: rowsForTable,
        totalRow: {
          label: "SUBE",
          target: totalSummary.target,
          actual: totalSummary.actual,
          remaining: totalSummary.remaining,
          actualPercent: totalSummary.actualPercent,
          projectedActual: totalSummary.projectedActual,
          projectedPercent: totalSummary.projectedPercent
        }
      } satisfies EmployeeCategoryTable;
    });
}

function buildSummaryCards(storeName: string, rows: GoalActualRow[], dayStats: GoalDayStats, employeeSnapshots: EmployeeSnapshot[], storeCategoryRows: CategorySummaryRow[]) {
  const riskCount = employeeSnapshots.filter((item) => item.belowTargetCount > 0).length;
  const strongestCategory = [...storeCategoryRows].sort((left, right) => (right.projectedPercent ?? 0) - (left.projectedPercent ?? 0))[0];
  const criticalCategory = [...storeCategoryRows].sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0))[0];
  const branchAverage = average(
    storeCategoryRows
      .filter((row) => row.target !== null && !isEntryCount(row.label))
      .map((row) => row.projectedPercent ?? row.actualPercent ?? 0)
      .filter((value) => value > 0)
  );

  return [
    {
      label: "Secili Sube",
      value: storeName,
      detail: "Sunum bu magaza icin hazirlandi."
    },
    {
      label: "Calisan Sayisi",
      value: String(new Set(rows.map((row) => row.employeeName)).size),
      detail: "Sunumdaki aktif personel adedi."
    },
    {
      label: "Calisilan Gun",
      value: formatNumber(dayStats.workedDays),
      detail: "Ayin su ana kadarki fiili gunu."
    },
    {
      label: "Kalan Gun",
      value: formatNumber(dayStats.remainingDays),
      detail: "Hedef kapatmak icin kalan sure."
    },
    {
      label: "Sube Tempo",
      value: formatPercent(branchAverage),
      detail: `En guclu alan ${strongestCategory?.label ?? "-"}, en kritik alan ${criticalCategory?.label ?? "-"}.`
    },
    {
      label: "Riskli Personel",
      value: String(riskCount),
      detail: "Bire bir takip gerektiren calisan sayisi."
    }
  ] satisfies SummaryCard[];
}

function buildStoreNarrative(storeName: string, storeCategoryRows: CategorySummaryRow[], employeeSnapshots: EmployeeSnapshot[]) {
  const criticalCategory = [...storeCategoryRows].sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0))[0];
  const strongestCategory = [...storeCategoryRows].sort((left, right) => (right.projectedPercent ?? 0) - (left.projectedPercent ?? 0))[0];
  const topContributor = [...employeeSnapshots].sort((left, right) => right.sharePercent - left.sharePercent)[0];

  if (!criticalCategory) {
    return `${storeName} icin su an gosterilecek kategori bazli veri bulunamiyor.`;
  }

  return `${storeName} subesinde en kritik alan ${criticalCategory.label}, en guclu alan ${strongestCategory?.label ?? "-"}. Sube ici payda en yuksek katki ${topContributor?.name ?? "-"} tarafinda uretiliyor.`;
}

function buildActionLines(storeCategoryRows: CategorySummaryRow[], employeeSnapshots: EmployeeSnapshot[], dayStats: GoalDayStats) {
  const lines: string[] = [];

  storeCategoryRows
    .filter((row) => row.target !== null && (row.projectedPercent ?? row.actualPercent ?? 0) < 100)
    .slice(0, 4)
    .forEach((row) => {
      const dailyNeed = dayStats.remainingDays > 0 && row.remaining !== null ? Math.ceil(row.remaining / dayStats.remainingDays) : row.remaining ?? 0;
      lines.push(`${row.label}: kalan gunlerde gunde en az ${formatNumber(dailyNeed)} ek uretim hedefiyle vardiya takip listesine alinmali.`);
    });

  employeeSnapshots
    .filter((item) => item.belowTargetCount > 0)
    .slice(0, 4)
    .forEach((employee) => {
      lines.push(`${employee.name}: ${employee.primaryRisk} alaninda bire bir takip yapilip gunde en az ${formatNumber(employee.dailyNeed)} ek uretim beklenmeli.`);
    });

  const lowShareEmployees = [...employeeSnapshots].sort((left, right) => left.sharePercent - right.sharePercent).slice(0, 2);
  lowShareEmployees.forEach((employee) => {
    lines.push(`${employee.name}: sube ici payi ${formatPercent(employee.sharePercent)} seviyesinde. Guclu oldugu ${employee.strongestMetric} alanindan ekstra katkı istenmeli.`);
  });

  return lines;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EvaluationPresentationPage({ searchParams }: PageProps) {
  await requireUser();

  if (!isSupabaseAdminConfigured()) {
    redirect("/hesabim");
  }

  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, role, approval, store:stores(name)")
    .eq("id", user.id)
    .single();

  const safeProfile = (profile as PresentationProfile | null) ?? null;

  if (!safeProfile || safeProfile.approval !== "approved" || !canOpenEvaluationPresentation(safeProfile.role)) {
    redirect("/hesabim");
  }

  const [employeeRows, dayStats] = await Promise.all([fetchGoalActualRows(), fetchGoalDayStats().catch(() => EMPTY_DAYS)]);
  const filteredRows = employeeRows.filter((row) => row.storeName && !isAggregateCategoryLabel(row.mainCategory));
  const allStoreNames = Array.from(new Set(filteredRows.map((row) => row.storeName))).sort((left, right) => left.localeCompare(right, "tr"));
  const ownStoreName = safeProfile.store?.name?.trim() ?? "";
  const allowedStoreNames =
    safeProfile.role === "manager"
      ? Array.from(new Set([ownStoreName].filter(Boolean))).sort((left, right) => left.localeCompare(right, "tr"))
      : allStoreNames;

  if (!allowedStoreNames.length) {
    return (
      <main>
        <h1 className="page-title">Degerlendirme Sunumu</h1>
        <p className="page-subtitle">Sunum icin kullanilabilecek sube verisi bulunamadi.</p>
      </main>
    );
  }

  const requestedStore = String(params?.store ?? "").trim();
  const selectedStore = allowedStoreNames.includes(requestedStore) ? requestedStore : allowedStoreNames[0];
  const selectedRows = filteredRows.filter((row) => row.storeName === selectedStore);
  const generatedAt = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());

  if (!selectedRows.length) {
    return (
      <main>
        <h1 className="page-title">Degerlendirme Sunumu</h1>
        <p className="page-subtitle">{selectedStore} subesi icin personel hedef gerceklesen verisi bulunamadi.</p>
      </main>
    );
  }

  const storeCategoryRows = buildStoreCategoryRows(selectedRows, dayStats);
  const employeeSnapshots = buildEmployeeSnapshots(selectedRows, dayStats);
  const employeeCategoryTables = buildEmployeeCategoryTables(selectedRows, dayStats);
  const employeeSubcategoryTables = buildEmployeeSubcategoryTables(selectedRows, dayStats);
  const summaryCards = buildSummaryCards(selectedStore, selectedRows, dayStats, employeeSnapshots, storeCategoryRows);
  const storeNarrative = buildStoreNarrative(selectedStore, storeCategoryRows, employeeSnapshots);
  const actionLines = buildActionLines(storeCategoryRows, employeeSnapshots, dayStats);

  return (
    <main>
      <h1 className="page-title">Degerlendirme Sunumu</h1>
      <p className="page-subtitle">Magaza muduru, yonetim ve admin kullanicilari icin sube bazli tam ekran sunum.</p>

      <section className="guide-card">
        <div className="section-title compact-title">
          <div>
            <h2>Sube Secimi</h2>
            <p>{safeProfile.role === "manager" ? "Kendi magazaniz icin sunum hazirlaniyor." : "Sunum alinacak subeyi secin."}</p>
          </div>
        </div>

        <form className="admin-form" method="get">
          <label className="field">
            <span>Sube</span>
            <select defaultValue={selectedStore} name="store" disabled={safeProfile.role === "manager"}>
              {allowedStoreNames.map((storeName) => (
                <option key={storeName} value={storeName}>
                  {storeName}
                </option>
              ))}
            </select>
          </label>

          {safeProfile.role !== "manager" ? (
            <button className="button-primary" type="submit">
              Sunumu Ac
            </button>
          ) : null}
        </form>
      </section>

      <StoreEvaluationPresentation
        actionLines={actionLines}
        employeeCategoryTables={employeeCategoryTables}
        employeeSnapshots={employeeSnapshots}
        employeeSubcategoryTables={employeeSubcategoryTables}
        generatedAt={generatedAt}
        storeCategoryRows={storeCategoryRows}
        storeName={selectedStore}
        storeNarrative={storeNarrative}
        summaryCards={summaryCards}
      />
    </main>
  );
}
