import { redirect } from "next/navigation";
import { StoreEvaluationPresentation } from "@/components/evaluation/store-evaluation-presentation";
import { requireUser } from "@/lib/auth/require-user";
import {
  fetchGoalActualRows,
  fetchGoalDayStats,
  fetchGoalStoreRows,
  type GoalActualRow,
  type GoalDayStats,
  type GoalStoreRow
} from "@/lib/goal-actuals";
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
  dailyNeed?: number;
};

type CategoryShareRow = {
  label: string;
  actual: number;
  sharePercent: number;
  projectedPercent: number | null;
  dailyNeed: number;
};

type CategoryShareTable = {
  title: string;
  parentTitle?: string;
  rows: CategoryShareRow[];
};

type EmployeeSnapshot = {
  name: string;
  totalActual: number;
  productionPointActual: number;
  sharePercent: number;
  strongestMetric: string;
};

type EmployeeCategoryTable = {
  title: string;
  parentTitle?: string;
  hasTarget: boolean;
  rows: CategorySummaryRow[];
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

function isProductionPointMetric(title: string) {
  return normalizeCategoryKey(title).includes("URETIM PUAN");
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

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sameStore(left: string, right: string) {
  return normalizeCategoryKey(left) === normalizeCategoryKey(right);
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

function buildStoreMetricSummary(rows: GoalStoreRow[], workedDays: number, totalDays: number): MetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = totalTarget > 0;
  const showProjection = rows.every((row) => row.includeProjection);
  const projectedActual = showProjection ? (workedDays > 0 ? Math.floor((actual / workedDays) * totalDays) : actual) : null;

  return {
    title: rows[0]?.mainCategory ?? "Genel",
    target: hasTarget ? totalTarget : null,
    actual,
    actualPercent: hasTarget ? (actual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - actual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget && projectedActual !== null ? (projectedActual / totalTarget) * 100 : null,
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

function buildStoreCategoryRows(rows: GoalStoreRow[], dayStats: GoalDayStats) {
  const categoryMap = new Map<string, GoalStoreRow[]>();

  rows
    .filter((row) => !isAggregateCategoryLabel(row.mainCategory))
    .forEach((row) => {
      const current = categoryMap.get(row.mainCategory) ?? [];
      current.push(row);
      categoryMap.set(row.mainCategory, current);
    });

  return Array.from(categoryMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "tr"))
    .map(([label, categoryRows]) => {
      const summary = buildStoreMetricSummary(categoryRows, dayStats.workedDays, dayStats.totalDays);

      return {
        label,
        target: summary.target,
        actual: summary.actual,
        remaining: summary.remaining,
        actualPercent: summary.actualPercent,
        projectedActual: summary.projectedActual,
        projectedPercent: summary.projectedPercent ?? summary.actualPercent,
        dailyNeed:
          dayStats.remainingDays > 0 && summary.remaining !== null ? Math.ceil(summary.remaining / dayStats.remainingDays) : summary.remaining ?? 0
      } satisfies CategorySummaryRow;
    });
}

function buildEmployeeSnapshots(rows: GoalActualRow[]) {
  const employeeMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  const storeProductionPointActual = rows
    .filter((row) => isProductionPointMetric(row.mainCategory))
    .reduce((sum, row) => sum + row.actual, 0);
  const storeTotalActual = rows.reduce((sum, row) => sum + row.actual, 0);

  return Array.from(employeeMap.entries())
    .map(([name, employeeRows]) => {
      const productionPointActual = employeeRows
        .filter((row) => isProductionPointMetric(row.mainCategory))
        .reduce((sum, row) => sum + row.actual, 0);
      const totalActual = employeeRows.reduce((sum, row) => sum + row.actual, 0);
      const strongestMetric =
        buildEmployeeCategorySummaries(employeeRows, 1, 1).sort(
          (left, right) => (right.actualPercent ?? right.actual ?? 0) - (left.actualPercent ?? left.actual ?? 0)
        )[0]?.title ?? "-";

      return {
        name,
        totalActual,
        productionPointActual,
        sharePercent:
          storeProductionPointActual > 0
            ? (productionPointActual / storeProductionPointActual) * 100
            : storeTotalActual > 0
              ? (totalActual / storeTotalActual) * 100
              : 0,
        strongestMetric
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
          } satisfies CategorySummaryRow;
        })
        .sort((left, right) => left.label.localeCompare(right.label, "tr"));

      const totalSummary = buildEmployeeMetricSummary(categoryRows, dayStats.workedDays, dayStats.totalDays);

      return {
        title,
        hasTarget: totalSummary.target !== null && totalSummary.target > 0,
        rows: rowsForTable
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
          } satisfies CategorySummaryRow;
        })
        .sort((left, right) => left.label.localeCompare(right.label, "tr"));

      const totalSummary = buildEmployeeMetricSummary(subcategoryRows, dayStats.workedDays, dayStats.totalDays);

      return {
        title,
        parentTitle,
        hasTarget: totalSummary.target !== null && totalSummary.target > 0,
        rows: rowsForTable
      } satisfies EmployeeCategoryTable;
    });
}

function buildCategoryShareTables(rows: GoalActualRow[], dayStats: GoalDayStats) {
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

      const categoryTotalActual = categoryRows.reduce((sum, row) => sum + row.actual, 0);
      const rowsForTable = Array.from(employeeMap.entries())
        .map(([label, employeeRows]) => {
          const summary = buildEmployeeMetricSummary(employeeRows, dayStats.workedDays, dayStats.totalDays);

          return {
            label,
            actual: summary.actual,
            sharePercent: categoryTotalActual > 0 ? (summary.actual / categoryTotalActual) * 100 : 0,
            projectedPercent: summary.projectedPercent ?? summary.actualPercent,
            dailyNeed:
              dayStats.remainingDays > 0 && summary.remaining !== null ? Math.ceil(summary.remaining / dayStats.remainingDays) : summary.remaining ?? 0
          } satisfies CategoryShareRow;
        })
        .sort((left, right) => right.sharePercent - left.sharePercent);

      return {
        title,
        rows: rowsForTable
      } satisfies CategoryShareTable;
    });
}

function buildSubcategoryShareTables(rows: GoalActualRow[], dayStats: GoalDayStats) {
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

      const categoryTotalActual = subcategoryRows.reduce((sum, row) => sum + row.actual, 0);
      const rowsForTable = Array.from(employeeMap.entries())
        .map(([label, employeeRows]) => {
          const summary = buildEmployeeMetricSummary(employeeRows, dayStats.workedDays, dayStats.totalDays);

          return {
            label,
            actual: summary.actual,
            sharePercent: categoryTotalActual > 0 ? (summary.actual / categoryTotalActual) * 100 : 0,
            projectedPercent: summary.projectedPercent ?? summary.actualPercent,
            dailyNeed:
              dayStats.remainingDays > 0 && summary.remaining !== null ? Math.ceil(summary.remaining / dayStats.remainingDays) : summary.remaining ?? 0
          } satisfies CategoryShareRow;
        })
        .sort((left, right) => right.sharePercent - left.sharePercent);

      return {
        title,
        parentTitle,
        rows: rowsForTable
      } satisfies CategoryShareTable;
    });
}

function buildSummaryCards(storeName: string, employeeRows: GoalActualRow[], dayStats: GoalDayStats, storeCategoryRows: CategorySummaryRow[]) {
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
      value: String(new Set(employeeRows.map((row) => row.employeeName)).size),
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
      label: "Kritik Kategori",
      value: criticalCategory?.label ?? "-",
      detail: `Gunluk minimum ihtiyac ${formatNumber(criticalCategory?.dailyNeed ?? 0)}.`
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

  return `${storeName} subesinde magaza hedefi baz alindiginda en kritik alan ${criticalCategory.label}, en guclu alan ${strongestCategory?.label ?? "-"}. Uretim puani katkisi en yuksek isim ${topContributor?.name ?? "-"} olarak gorunuyor.`;
}

function buildActionLines(storeCategoryRows: CategorySummaryRow[], categoryShareTables: CategoryShareTable[]) {
  const lines: string[] = [];

  storeCategoryRows
    .filter((row) => row.target !== null && (row.projectedPercent ?? row.actualPercent ?? 0) < 100)
    .slice(0, 4)
    .forEach((row) => {
      lines.push(`${row.label}: magaza hedefinde ay sonu ${formatPercent(row.projectedPercent ?? row.actualPercent)} gorunuyor. Kalan gunlerde gunde en az ${formatNumber(row.dailyNeed ?? 0)} uretim gerekli.`);
    });

  categoryShareTables.slice(0, 4).forEach((table) => {
    const criticalEmployee = table.rows
      .filter((row) => (row.projectedPercent ?? 0) < 100)
      .sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0))[0];

    if (criticalEmployee) {
      lines.push(
        `${criticalEmployee.label} / ${table.title}: calisan hedefinde ay sonu ${formatPercent(criticalEmployee.projectedPercent)} seviyesinde. Gunde en az ${formatNumber(criticalEmployee.dailyNeed)} uretim gerekli.`
      );
    }
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

  const [employeeRows, storeRows, dayStats] = await Promise.all([
    fetchGoalActualRows(),
    fetchGoalStoreRows().catch(() => [] as GoalStoreRow[]),
    fetchGoalDayStats().catch(() => EMPTY_DAYS)
  ]);

  const filteredEmployeeRows = employeeRows.filter((row) => row.storeName && !isAggregateCategoryLabel(row.mainCategory));
  const filteredStoreRows = storeRows.filter((row) => row.storeCode && !isAggregateCategoryLabel(row.mainCategory));
  const allStoreNames = Array.from(
    new Set([...filteredEmployeeRows.map((row) => row.storeName), ...filteredStoreRows.map((row) => row.storeCode)])
  ).sort((left, right) => left.localeCompare(right, "tr"));
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
  const selectedEmployeeRows = filteredEmployeeRows.filter((row) => sameStore(row.storeName, selectedStore));
  const selectedStoreRows = filteredStoreRows.filter((row) => sameStore(row.storeCode, selectedStore));
  const generatedAt = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());

  if (!selectedEmployeeRows.length) {
    return (
      <main>
        <h1 className="page-title">Degerlendirme Sunumu</h1>
        <p className="page-subtitle">{selectedStore} subesi icin personel hedef gerceklesen verisi bulunamadi.</p>
      </main>
    );
  }

  const storeCategoryRows = selectedStoreRows.length
    ? buildStoreCategoryRows(selectedStoreRows, dayStats)
    : buildEmployeeCategorySummaries(selectedEmployeeRows, dayStats.workedDays, dayStats.totalDays)
        .filter((metric) => !isEntryCount(metric.title))
        .map((metric) => ({
          label: metric.title,
          target: metric.target,
          actual: metric.actual,
          remaining: metric.remaining,
          actualPercent: metric.actualPercent,
          projectedActual: metric.projectedActual,
          projectedPercent: metric.projectedPercent ?? metric.actualPercent,
          dailyNeed:
            dayStats.remainingDays > 0 && metric.remaining !== null ? Math.ceil(metric.remaining / dayStats.remainingDays) : metric.remaining ?? 0
        }));
  const employeeSnapshots = buildEmployeeSnapshots(selectedEmployeeRows);
  const employeeCategoryTables = buildEmployeeCategoryTables(selectedEmployeeRows, dayStats);
  const employeeSubcategoryTables = buildEmployeeSubcategoryTables(selectedEmployeeRows, dayStats);
  const categoryShareTables = buildCategoryShareTables(selectedEmployeeRows, dayStats);
  const subcategoryShareTables = buildSubcategoryShareTables(selectedEmployeeRows, dayStats);
  const summaryCards = buildSummaryCards(selectedStore, selectedEmployeeRows, dayStats, storeCategoryRows);
  const storeNarrative = buildStoreNarrative(selectedStore, storeCategoryRows, employeeSnapshots);
  const actionLines = buildActionLines(storeCategoryRows, categoryShareTables);

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
        categoryShareTables={categoryShareTables}
        employeeCategoryTables={employeeCategoryTables}
        employeeSubcategoryTables={employeeSubcategoryTables}
        generatedAt={generatedAt}
        storeCategoryRows={storeCategoryRows}
        storeName={selectedStore}
        storeNarrative={storeNarrative}
        subcategoryShareTables={subcategoryShareTables}
        summaryCards={summaryCards}
      />
    </main>
  );
}
