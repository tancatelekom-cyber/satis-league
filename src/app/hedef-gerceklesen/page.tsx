import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { GoalActualRow, GoalStoreRow, fetchGoalActualRows, fetchGoalDayStats, fetchGoalStoreRows } from "@/lib/goal-actuals";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/lib/types";

type GoalActualPageProps = {
  searchParams?: Promise<{
    category?: string;
    employee?: string;
    store?: string;
    panel?: string;
    view?: string;
  }>;
};

type EmployeeSummary = {
  name: string;
  totalTarget: number;
  totalActual: number;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number;
  projectedPercent: number | null;
  hasTarget: boolean;
  showProjection: boolean;
};

type GoalMetricSummary = {
  target: number | null;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
  hasTarget: boolean;
  showProjection: boolean;
};

type GoalCategorySummary = GoalMetricSummary & {
  title: string;
  childCount: number;
  children: Array<
    GoalMetricSummary & {
      title: string;
    }
  >;
  storeDetails?: Array<
    GoalMetricSummary & {
      title: string;
    }
  >;
};

type GoalDayStats = {
  workedDays: number;
  remainingDays: number;
  totalDays: number;
};

type GoalNeedRow = {
  threshold: number;
  targetValue: number;
  remainingTotal: number;
  dailyRequired: number;
};

const EMPTY_DAY_STATS: GoalDayStats = {
  workedDays: 0,
  remainingDays: 0,
  totalDays: 0
};

function buildHref(
  view: string,
  options?: {
    employee?: string;
    store?: string;
    category?: string;
    panel?: string;
  }
) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (options?.employee) params.set("employee", options.employee);
  if (options?.store) params.set("store", options.store);
  if (options?.category) params.set("category", options.category);
  if (options?.panel) params.set("panel", options.panel);
  return `/hedef-gerceklesen?${params.toString()}`;
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

function buildEmployeeSummary(rows: GoalActualRow[], workedDays: number, totalDays: number): EmployeeSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const projectedActual = workedDays > 0 ? Math.floor((totalActual / workedDays) * totalDays) : totalActual;
  const hasTarget = totalTarget > 0;

  return {
    name: rows[0]?.employeeName ?? "-",
    totalTarget,
    totalActual,
    actual: totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection: true
  };
}

function buildCategoryGroups(rows: GoalActualRow[]) {
  const map = new Map<
    string,
    {
      mainOnlyRows: GoalActualRow[];
      children: GoalActualRow[];
    }
  >();

  rows.forEach((row) => {
    const group = map.get(row.mainCategory) ?? { mainOnlyRows: [], children: [] };
    if (row.subCategory) {
      group.children.push(row);
    } else {
      group.mainOnlyRows.push(row);
    }
    map.set(row.mainCategory, group);
  });

  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "tr"));
}

function buildMetricSummary(rows: GoalActualRow[], workedDays: number, totalDays: number): GoalMetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const projectedActual = workedDays > 0 ? Math.floor((totalActual / workedDays) * totalDays) : totalActual;
  const hasTarget = totalTarget > 0;

  return {
    target: hasTarget ? totalTarget : null,
    actual: totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection: true
  };
}

function buildStoreMetricSummary(rows: GoalStoreRow[], workedDays: number, totalDays: number): GoalMetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = totalTarget > 0;
  const showProjection = rows.every((row) => row.includeProjection);
  const projectedActual = showProjection
    ? workedDays > 0
      ? Math.floor((totalActual / workedDays) * totalDays)
      : totalActual
    : null;

  return {
    target: hasTarget ? totalTarget : null,
    actual: totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget && showProjection && projectedActual !== null ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection
  };
}

function buildCategorySummaries(rows: GoalActualRow[], workedDays: number, totalDays: number): GoalCategorySummary[] {
  return buildCategoryGroups(rows).map(([mainCategory, group]) => {
    const allRows = [...group.mainOnlyRows, ...group.children];
    const summary = buildMetricSummary(allRows, workedDays, totalDays);
    const children = group.children
      .map((row) => ({
        title: row.subCategory,
        ...buildMetricSummary([row], workedDays, totalDays)
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "tr"));

    return {
      title: mainCategory,
      childCount: children.length,
      children,
      ...summary
    };
  });
}

function buildStoreCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number): GoalCategorySummary[] {
  const map = new Map<
    string,
    {
      mainOnlyRows: GoalStoreRow[];
      children: GoalStoreRow[];
    }
  >();

  rows.forEach((row) => {
    const group = map.get(row.mainCategory) ?? { mainOnlyRows: [], children: [] };
    if (row.subCategory) {
      group.children.push(row);
    } else {
      group.mainOnlyRows.push(row);
    }
    map.set(row.mainCategory, group);
  });

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([mainCategory, group]) => {
      const allRows = [...group.mainOnlyRows, ...group.children];
      const summary = buildStoreMetricSummary(allRows, workedDays, totalDays);
      const children = group.children
        .map((row) => ({
          title: row.subCategory,
          ...buildStoreMetricSummary([row], workedDays, totalDays)
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "tr"));

      return {
        title: mainCategory,
        childCount: children.length,
        children,
        storeDetails: [],
        ...summary
      };
    });
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildCompanyRows(rows: GoalStoreRow[]): GoalStoreRow[] {
  const grouped = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const key = `${row.mainCategory}__${row.subCategory}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((group) => {
    const first = group[0];
    const actuals = group.map((row) => row.actual);
    const targets = group.map((row) => row.target).filter((value): value is number => value !== null && value > 0);
    const aggregate =
      first.companyMode === "average"
        ? average
        : (values: number[]) => values.reduce((sum, value) => sum + value, 0);

    return {
      storeCode: "Firma",
      mainCategory: first.mainCategory,
      subCategory: first.subCategory,
      target: targets.length ? aggregate(targets) : null,
      actual: aggregate(actuals),
      includeProjection: first.includeProjection,
      companyMode: first.companyMode
    };
  });
}

function buildCompanyCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number): GoalCategorySummary[] {
  const companyRows = buildCompanyRows(rows);
  const groupedRawRows = new Map<string, GoalStoreRow[]>();
  const groupedCompanyRows = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const current = groupedRawRows.get(row.mainCategory) ?? [];
    current.push(row);
    groupedRawRows.set(row.mainCategory, current);
  });

  companyRows.forEach((row) => {
    const current = groupedCompanyRows.get(row.mainCategory) ?? [];
    current.push(row);
    groupedCompanyRows.set(row.mainCategory, current);
  });

  return Array.from(groupedCompanyRows.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
    .map(([mainCategory, companyCategoryRows]) => {
      const rawCategoryRows = groupedRawRows.get(mainCategory) ?? [];
      const mainOnlyRows = companyCategoryRows.filter((row) => !row.subCategory);
      const childRows = companyCategoryRows.filter((row) => Boolean(row.subCategory));
      const summary = buildStoreMetricSummary(companyCategoryRows, workedDays, totalDays);
      const children = childRows
        .map((row) => ({
          title: row.subCategory,
          ...buildStoreMetricSummary([row], workedDays, totalDays)
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "tr"));

      const storeMap = new Map<string, GoalStoreRow[]>();
      rawCategoryRows.forEach((row) => {
        const current = storeMap.get(row.storeCode) ?? [];
        current.push(row);
        storeMap.set(row.storeCode, current);
      });

      const storeDetails = Array.from(storeMap.entries())
        .map(([storeCode, storeRows]) => ({
          title: storeCode,
          ...buildStoreMetricSummary(storeRows, workedDays, totalDays)
        }))
        .sort((a, b) => {
          if (a.hasTarget && b.hasTarget && a.actualPercent !== null && b.actualPercent !== null) {
            return b.actualPercent - a.actualPercent || b.actual - a.actual;
          }
          return b.actual - a.actual;
        });

      return {
        title: mainCategory,
        childCount: children.length,
        children,
        storeDetails,
        ...buildStoreMetricSummary([...mainOnlyRows, ...childRows], workedDays, totalDays)
      };
    });
}

function canViewAllGoalActual(role: UserRole | string | null | undefined) {
  return role === "admin" || role === "management" || role === "manager";
}

function buildNeedRows(summary: GoalCategorySummary, remainingDays: number): GoalNeedRow[] {
  if (!summary.hasTarget || !summary.target) {
    return [];
  }

  return [90, 100, 110, 120].map((threshold) => {
    const targetValue = (summary.target ?? 0) * (threshold / 100);
    const remainingTotal = Math.max(targetValue - summary.actual, 0);
    const dailyRequired = remainingDays > 0 ? Math.ceil(remainingTotal / remainingDays) : remainingTotal > 0 ? Math.ceil(remainingTotal) : 0;

    return {
      threshold,
      targetValue,
      remainingTotal,
      dailyRequired
    };
  });
}

function GoalCategoryCards({ categories }: { categories: GoalCategorySummary[] }) {
  return (
    <div className="goal-category-list">
      {categories.map((category, index) => (
        <details key={category.title} className="goal-category-card" open={index === 0}>
          <summary className="goal-category-summary">
            <div className="goal-category-title">
              <strong>{category.title}</strong>
              <span>{category.childCount > 0 ? `${category.childCount} alt kategori` : "Tek kalem kategori"}</span>
            </div>

            {category.childCount > 0 || (category.storeDetails?.length ?? 0) > 0 ? <span className="goal-category-caret">▼</span> : null}

            <div className="goal-category-metrics">
              {category.hasTarget ? (
                <span>
                  <small>Hedef</small>
                  <strong>{formatNumber(category.target)}</strong>
                </span>
              ) : null}
              <span>
                <small>Gerceklesen</small>
                <strong>{formatNumber(category.actual)}</strong>
              </span>
              {category.hasTarget ? (
                <span>
                  <small>Kalan</small>
                  <strong>{formatNumber(category.remaining)}</strong>
                </span>
              ) : null}
              {category.hasTarget && category.actualPercent !== null ? (
                <span>
                  <small>Anlik %</small>
                  <strong>{formatPercent(category.actualPercent)}</strong>
                </span>
              ) : null}
              {category.showProjection && category.projectedActual !== null ? (
                <span>
                  <small>Ay Sonu</small>
                  <strong>{formatNumber(category.projectedActual)}</strong>
                </span>
              ) : null}
              {category.hasTarget && category.showProjection && category.projectedPercent !== null ? (
                <span>
                  <small>Ay Sonu %</small>
                  <strong>{formatPercent(category.projectedPercent)}</strong>
                </span>
              ) : null}
            </div>
          </summary>

          <div className="goal-category-body">
            {!category.hasTarget ? <div className="goal-category-topline"><span>Bu kategoride hedef tanimi yok.</span></div> : null}
            {category.hasTarget && !category.showProjection ? (
              <div className="goal-category-topline">
                <span>Bu kategoride ay sonu projeksiyonu hesaplanmiyor.</span>
              </div>
            ) : null}

            {category.children.length ? (
              <div className="goal-child-list">
                {category.children.map((child) => (
                  <div key={`${category.title}-${child.title}`} className="goal-child-card">
                    <div className="goal-child-head">
                      <strong>{child.title}</strong>
                      <span>{formatNumber(child.actual)}</span>
                    </div>
                    <div className="goal-child-meta">
                      {child.hasTarget ? <span>Hedef {formatNumber(child.target)}</span> : null}
                      <span>Gerceklesen {formatNumber(child.actual)}</span>
                      {child.hasTarget ? <span>Kalan {formatNumber(child.remaining)}</span> : null}
                      {child.hasTarget && child.actualPercent !== null ? <span>Anlik % {formatPercent(child.actualPercent)}</span> : null}
                      {child.showProjection && child.projectedActual !== null ? <span>Ay Sonu {formatNumber(child.projectedActual)}</span> : null}
                      {child.hasTarget && child.showProjection && child.projectedPercent !== null ? (
                        <span>Ay Sonu % {formatPercent(child.projectedPercent)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {category.storeDetails && category.storeDetails.length ? (
              <div className="goal-store-detail-list">
                <strong className="goal-store-detail-title">Sube Detaylari</strong>
                <div className="goal-child-list">
                  {category.storeDetails.map((store) => (
                    <div key={`${category.title}-${store.title}`} className="goal-child-card">
                      <div className="goal-child-head">
                        <strong>{store.title}</strong>
                        <span>{formatNumber(store.actual)}</span>
                      </div>
                      <div className="goal-child-meta">
                        {store.hasTarget ? <span>Hedef {formatNumber(store.target)}</span> : null}
                        <span>Gerceklesen {formatNumber(store.actual)}</span>
                        {store.hasTarget ? <span>Kalan {formatNumber(store.remaining)}</span> : null}
                        {store.hasTarget && store.actualPercent !== null ? <span>Anlik % {formatPercent(store.actualPercent)}</span> : null}
                        {store.showProjection && store.projectedActual !== null ? <span>Ay Sonu {formatNumber(store.projectedActual)}</span> : null}
                        {store.hasTarget && store.showProjection && store.projectedPercent !== null ? (
                          <span>Ay Sonu % {formatPercent(store.projectedPercent)}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

export default async function GoalActualPage({ searchParams }: GoalActualPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedView = String(params?.view ?? "employee").trim();
  const selectedEmployee = String(params?.employee ?? "").trim();
  const selectedStore = String(params?.store ?? "").trim();
  const selectedCategory = String(params?.category ?? "").trim();
  const selectedPanel = String(params?.panel ?? "detail").trim();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: profile } = await supabase.from("profiles").select("approval, role").eq("id", user.id).single();

  if (!profile || profile.approval !== "approved") {
    redirect("/hesabim");
  }

  const canViewAll = canViewAllGoalActual(profile.role);
  const effectiveView = canViewAll ? selectedView : "employee";
  const effectivePanel =
    selectedPanel === "needs"
      ? "needs"
      : effectiveView === "employee" && selectedPanel === "ranking"
        ? "ranking"
        : "detail";

  if (!canViewAll && selectedView !== "employee") {
    redirect(buildHref("employee", { employee: selectedEmployee, panel: effectivePanel }));
  }

  let employeeRows: GoalActualRow[] = [];
  let storeRows: GoalStoreRow[] = [];
  let dayStats: GoalDayStats = EMPTY_DAY_STATS;
  let sheetError = "";

  try {
    [employeeRows, storeRows, dayStats] = await Promise.all([fetchGoalActualRows(), fetchGoalStoreRows(), fetchGoalDayStats()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheet verisi okunamadi.";
    sheetError = message;
  }

  const employeeNames = Array.from(new Set(employeeRows.map((row) => row.employeeName))).sort((a, b) => a.localeCompare(b, "tr"));
  const employeeCategoryOptions = Array.from(new Set(employeeRows.map((row) => row.mainCategory))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
  const storeNames = Array.from(new Set(storeRows.map((row) => row.storeCode))).sort((a, b) => a.localeCompare(b, "tr"));
  const storeCategoryOptions = Array.from(new Set(storeRows.map((row) => row.mainCategory))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );

  const effectiveEmployee = employeeNames.includes(selectedEmployee) ? selectedEmployee : "";
  const effectiveStore = storeNames.includes(selectedStore) ? selectedStore : "";
  const rankingCategoryPool = effectiveView === "store" ? storeCategoryOptions : employeeCategoryOptions;
  const defaultRankingCategory = rankingCategoryPool[0] ?? "";
  const effectiveCategory =
    effectivePanel === "ranking" && rankingCategoryPool.includes(selectedCategory) ? selectedCategory : defaultRankingCategory;

  const employeeRankingRows = effectiveCategory
    ? employeeRows.filter((row) => row.mainCategory === effectiveCategory)
    : employeeRows;
  const storeRankingRows = effectiveCategory ? storeRows.filter((row) => row.mainCategory === effectiveCategory) : storeRows;

  const employeeMap = new Map<string, GoalActualRow[]>();
  employeeRankingRows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  const employeeSummaries = Array.from(employeeMap.entries())
    .map(([, rows]) => buildEmployeeSummary(rows, dayStats.workedDays, dayStats.totalDays))
    .sort((a, b) => {
      if (a.hasTarget && b.hasTarget) {
        return (b.projectedPercent ?? 0) - (a.projectedPercent ?? 0) || b.totalActual - a.totalActual;
      }

      if (a.hasTarget !== b.hasTarget) {
        return a.hasTarget ? -1 : 1;
      }

      return b.projectedActual - a.projectedActual || b.totalActual - a.totalActual;
    });

  const storeMap = new Map<string, GoalStoreRow[]>();
  storeRankingRows.forEach((row) => {
    const current = storeMap.get(row.storeCode) ?? [];
    current.push(row);
    storeMap.set(row.storeCode, current);
  });

  const storeSummaries = Array.from(storeMap.entries())
    .map(([name, rows]) => ({
      name,
      ...buildStoreMetricSummary(rows, dayStats.workedDays, dayStats.totalDays)
    }))
    .sort((a, b) => {
      if (a.hasTarget && b.hasTarget && a.actualPercent !== null && b.actualPercent !== null) {
        return b.actualPercent - a.actualPercent || b.actual - a.actual;
      }

      if (a.hasTarget !== b.hasTarget) {
        return a.hasTarget ? -1 : 1;
      }

      return b.actual - a.actual;
    });

  const activeEmployeeName = effectiveEmployee || employeeSummaries[0]?.name || "";
  const activeStoreName = effectiveStore || storeSummaries[0]?.name || "";

  const activeEmployeeRows = activeEmployeeName
    ? employeeRows.filter((row) => row.employeeName === activeEmployeeName)
    : [];
  const activeStoreRows = activeStoreName ? storeRows.filter((row) => row.storeCode === activeStoreName) : [];
  const employeeCategorySummaries = buildCategorySummaries(activeEmployeeRows, dayStats.workedDays, dayStats.totalDays);
  const storeCategorySummaries = buildStoreCategorySummaries(activeStoreRows, dayStats.workedDays, dayStats.totalDays);
  const companyCategorySummaries = buildCompanyCategorySummaries(storeRows, dayStats.workedDays, dayStats.totalDays);
  const storeNeedSummaries = storeCategorySummaries
    .filter((category) => category.hasTarget)
    .map((category) => ({
      title: category.title,
      actual: category.actual,
      target: category.target ?? 0,
      needRows: buildNeedRows(category, dayStats.remainingDays)
    }));

  const employeeOptions = employeeNames.length
    ? employeeNames.map((name) => ({
        value: buildHref("employee", { employee: name, panel: effectivePanel }),
        label: name
      }))
    : [{ value: buildHref("employee", { panel: effectivePanel }), label: "Calisan bulunamadi" }];

  const storeOptions = storeNames.length
    ? storeNames.map((name) => ({
        value: buildHref("store", { store: name, panel: effectivePanel }),
        label: name
      }))
    : [{ value: buildHref("store", { panel: effectivePanel }), label: "Magaza bulunamadi" }];

  const categoryOptions = rankingCategoryPool.map((category) => ({
    value:
      effectiveView === "store"
        ? buildHref("store", { store: activeStoreName, category, panel: effectivePanel })
        : buildHref("employee", { employee: activeEmployeeName, category, panel: effectivePanel }),
    label: category
  }));

  return (
    <main>
      <h1 className="page-title">Hedef Gerceklesen</h1>
      <p className="page-subtitle">Google Sheet verisine gore calisan hedef, gerceklesen ve ay sonu projeksiyon gorunumu.</p>

      <div className="goal-tab-row">
        <a
          className={`goal-tab ${effectiveView === "employee" ? "goal-tab-active" : ""}`}
          href={buildHref("employee", { employee: effectiveEmployee, panel: effectivePanel })}
        >
          Calisan
        </a>
        {canViewAll ? (
          <>
            <a
              className={`goal-tab ${effectiveView === "store" ? "goal-tab-active" : ""}`}
              href={buildHref("store", { store: effectiveStore, panel: effectivePanel })}
            >
              Magaza
            </a>
            <a className={`goal-tab ${effectiveView === "company" ? "goal-tab-active" : ""}`} href={buildHref("company")}>
              Firma
            </a>
          </>
        ) : null}
      </div>

      {sheetError ? (
        <section className="guide-card goal-placeholder-card">
          <strong>Hedef Gerceklesen verisi su an acilamadi.</strong>
          <p className="subtle">{sheetError}</p>
          <p className="subtle">Google Sheet erisimi duzeldiginde sayfa otomatik olarak tekrar kullanilabilir olacak.</p>
        </section>
      ) : (
        <>
          <section className="goal-summary-strip">
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

          {effectiveView !== "company" ? (
            <section className="guide-card game-brief-card">
              <div className="league-filter-grid goal-filter-grid">
                {effectivePanel === "detail" || effectiveView === "store" ? (
                  <div className="league-filter-item">
                    <span className="league-filter-label">{effectiveView === "store" ? "Magaza" : "Calisan"}</span>
                    <FilterSelectNav
                      ariaLabel={effectiveView === "store" ? "Magaza secimi" : "Calisan secimi"}
                      value={
                        effectiveView === "store"
                          ? buildHref("store", { store: activeStoreName, panel: effectivePanel })
                          : buildHref("employee", { employee: activeEmployeeName, panel: effectivePanel })
                      }
                      options={effectiveView === "store" ? storeOptions : employeeOptions}
                    />
                  </div>
                ) : (
                  <div className="league-filter-item">
                    <span className="league-filter-label">Ana Kategori</span>
                    <FilterSelectNav
                      ariaLabel="Ana kategori secimi"
                      value={
                        effectiveView === "store"
                          ? buildHref("store", { store: activeStoreName, category: effectiveCategory, panel: effectivePanel })
                          : buildHref("employee", { employee: activeEmployeeName, category: effectiveCategory, panel: effectivePanel })
                      }
                      options={categoryOptions}
                    />
                  </div>
                )}
              </div>

              <div className="goal-mode-row">
                <a
                  className={`goal-mode-button ${effectivePanel === "detail" ? "goal-mode-button-active" : ""}`}
                  href={
                    effectiveView === "store"
                      ? buildHref("store", { store: activeStoreName, panel: "detail" })
                      : buildHref("employee", { employee: activeEmployeeName, panel: "detail" })
                  }
                >
                  Hedef Gerceklesen
                </a>
                {effectiveView === "store" ? (
                  <a
                    className={`goal-mode-button ${effectivePanel === "needs" ? "goal-mode-button-active" : ""}`}
                    href={buildHref("store", { store: activeStoreName, panel: "needs" })}
                  >
                    Gunluk Ihtiyaclar
                  </a>
                ) : (
                  <a
                    className={`goal-mode-button ${effectivePanel === "ranking" ? "goal-mode-button-active" : ""}`}
                    href={buildHref("employee", { employee: activeEmployeeName, category: effectiveCategory, panel: "ranking" })}
                  >
                    Siralama
                  </a>
                )}
              </div>
            </section>
          ) : null}

          {effectiveView === "store" && effectivePanel === "needs" ? (
            <section className="goal-panel-single">
              <article className="campaign-section-card goal-detail-card">
                <div className="goal-section-head">
                  <h2>{activeStoreName || "Magaza Gunluk Ihtiyaclari"}</h2>
                  <span>Hedefli kalemler icin gunluk gereken adet / tutar</span>
                </div>

                {storeNeedSummaries.length ? (
                  <div className="goal-category-list">
                    {storeNeedSummaries.map((item) => (
                      <article key={item.title} className="goal-category-card goal-need-card">
                        <div className="goal-category-summary">
                          <div className="goal-category-title">
                            <strong>{item.title}</strong>
                            <span>
                              Gerceklesen {formatNumber(item.actual)} / Hedef {formatNumber(item.target)}
                            </span>
                          </div>
                        </div>
                        <div className="goal-category-body">
                          <div className="goal-need-grid">
                            {item.needRows.map((need) => (
                              <div key={`${item.title}-${need.threshold}`} className="goal-need-row">
                                <strong>%{need.threshold}</strong>
                                <span>Hedef {formatNumber(need.targetValue)}</span>
                                <span>Kalan {formatNumber(need.remainingTotal)}</span>
                                <span>Gunluk {formatNumber(need.dailyRequired)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="subtle">Bu magazada hedef tanimli kalem bulunamadi.</p>
                )}
              </article>
            </section>
          ) : effectivePanel === "ranking" && effectiveView !== "company" ? (
            <section className="goal-panel-single">
              <article className="campaign-section-card goal-ranking-card">
                <div className="goal-section-head">
                  <h2>{effectiveView === "store" ? "Magaza Siralamasi" : "Firma Siralamasi"}</h2>
                  <span>{effectiveCategory || "Kategori yok"}</span>
                </div>

                <div className="goal-ranking-list">
                  {(effectiveView === "store" ? storeSummaries : employeeSummaries).length ? (
                    (effectiveView === "store" ? storeSummaries : employeeSummaries).map((summary, index) => (
                      <a
                        key={summary.name}
                        className={`goal-ranking-row ${
                          summary.name === (effectiveView === "store" ? activeStoreName : activeEmployeeName) ? "goal-ranking-row-active" : ""
                        }`}
                        href={
                          effectiveView === "store"
                            ? buildHref("store", { store: summary.name, panel: "detail" })
                            : buildHref("employee", { employee: summary.name, panel: "detail" })
                        }
                      >
                        <span className="goal-rank-badge">{index + 1}</span>
                        <div className="goal-ranking-main">
                          <strong>{summary.name}</strong>
                          <span>
                            {summary.hasTarget && summary.actualPercent !== null
                              ? `Gerceklesen ${formatPercent(summary.actualPercent)}${
                                  summary.showProjection && summary.projectedPercent !== null
                                    ? ` | Ay sonu ${formatPercent(summary.projectedPercent)}`
                                    : ""
                                }`
                              : `Gerceklesen ${formatNumber(summary.actual)}${
                                  summary.showProjection && summary.projectedActual !== null
                                    ? ` | Ay sonu ${formatNumber(summary.projectedActual)}`
                                    : ""
                                }`}
                          </span>
                        </div>
                        <strong className="goal-ranking-score">
                          {summary.hasTarget && summary.actualPercent !== null
                            ? formatPercent(summary.actualPercent)
                            : formatNumber(summary.actual)}
                        </strong>
                      </a>
                    ))
                  ) : (
                    <p className="subtle">Listelenecek veri bulunamadi.</p>
                  )}
                </div>
              </article>
            </section>
          ) : (
            <section className="goal-panel-single">
              <article className="campaign-section-card goal-detail-card">
                <div className="goal-section-head">
                  <h2>
                    {effectiveView === "company"
                      ? "Firma Hedef Gerceklesen"
                      : effectiveView === "store"
                        ? activeStoreName || "Magaza Detayi"
                        : activeEmployeeName || "Calisan Detayi"}
                  </h2>
                  <span>{effectiveView === "company" ? "Kategori bazli toplu ozet" : "Kategori bazli detay"}</span>
                </div>

                {effectiveView === "company" ? (
                  companyCategorySummaries.length ? (
                    <GoalCategoryCards categories={companyCategorySummaries} />
                  ) : (
                    <p className="subtle">Firma verisi bulunamadi.</p>
                  )
                ) : effectiveView === "store" ? (
                  storeCategorySummaries.length ? (
                    <GoalCategoryCards categories={storeCategorySummaries} />
                  ) : (
                    <p className="subtle">Bu magaza icin kategori verisi bulunamadi.</p>
                  )
                ) : employeeCategorySummaries.length ? (
                  <GoalCategoryCards categories={employeeCategorySummaries} />
                ) : (
                  <p className="subtle">Bu filtreye uygun calisan verisi bulunamadi.</p>
                )}
              </article>
            </section>
          )}
        </>
      )}
    </main>
  );
}
