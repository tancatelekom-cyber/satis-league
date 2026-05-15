import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { GoalActualRow, fetchGoalActualRows, fetchGoalDayStats } from "@/lib/goal-actuals";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/lib/types";

type GoalActualPageProps = {
  searchParams?: Promise<{
    category?: string;
    employee?: string;
    view?: string;
  }>;
};

type EmployeeSummary = {
  name: string;
  totalTarget: number;
  totalActual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number;
  projectedPercent: number | null;
  hasTarget: boolean;
};

type GoalMetricSummary = {
  target: number | null;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number;
  projectedPercent: number | null;
  hasTarget: boolean;
};

type GoalCategorySummary = GoalMetricSummary & {
  title: string;
  childCount: number;
  children: Array<
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

const EMPTY_DAY_STATS: GoalDayStats = {
  workedDays: 0,
  remainingDays: 0,
  totalDays: 0
};

function buildHref(view: string, employee?: string, category?: string) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (employee) params.set("employee", employee);
  if (category) params.set("category", category);
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
  const projectedActual = workedDays > 0 ? (totalActual / workedDays) * totalDays : totalActual;
  const hasTarget = totalTarget > 0;

  return {
    name: rows[0]?.employeeName ?? "-",
    totalTarget,
    totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget
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
  const projectedActual = workedDays > 0 ? (totalActual / workedDays) * totalDays : totalActual;
  const hasTarget = totalTarget > 0;

  return {
    target: hasTarget ? totalTarget : null,
    actual: totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget
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

function canViewAllGoalActual(role: UserRole | string | null | undefined) {
  return role === "admin" || role === "management" || role === "manager";
}

export default async function GoalActualPage({ searchParams }: GoalActualPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedView = String(params?.view ?? "employee").trim();
  const selectedEmployee = String(params?.employee ?? "").trim();
  const selectedCategory = String(params?.category ?? "").trim();

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

  if (!canViewAll && selectedView !== "employee") {
    redirect(buildHref("employee", selectedEmployee, selectedCategory));
  }

  let rows: GoalActualRow[] = [];
  let dayStats: GoalDayStats = EMPTY_DAY_STATS;
  let sheetError = "";

  try {
    [rows, dayStats] = await Promise.all([fetchGoalActualRows(), fetchGoalDayStats()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheet verisi okunamadi.";
    sheetError = message;
  }

  const employeeNames = Array.from(new Set(rows.map((row) => row.employeeName))).sort((a, b) => a.localeCompare(b, "tr"));
  const categoryOptions = Array.from(new Set(rows.map((row) => row.mainCategory))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );

  const effectiveCategory = categoryOptions.includes(selectedCategory) ? selectedCategory : "";
  const categoryFilteredRows = effectiveCategory ? rows.filter((row) => row.mainCategory === effectiveCategory) : rows;

  const employeeFilteredNames = Array.from(new Set(categoryFilteredRows.map((row) => row.employeeName))).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
  const effectiveEmployee = employeeFilteredNames.includes(selectedEmployee) ? selectedEmployee : "";

  const employeeMap = new Map<string, GoalActualRow[]>();
  categoryFilteredRows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  const summaries = Array.from(employeeMap.entries())
    .map(([, employeeRows]) => buildEmployeeSummary(employeeRows, dayStats.workedDays, dayStats.totalDays))
    .sort((a, b) => {
      if (a.hasTarget && b.hasTarget) {
        return (b.projectedPercent ?? 0) - (a.projectedPercent ?? 0) || b.totalActual - a.totalActual;
      }

      if (a.hasTarget !== b.hasTarget) {
        return a.hasTarget ? -1 : 1;
      }

      return b.projectedActual - a.projectedActual || b.totalActual - a.totalActual;
    });

  const activeEmployeeName = effectiveEmployee || summaries[0]?.name || "";
  const activeEmployeeRows = activeEmployeeName
    ? categoryFilteredRows.filter((row) => row.employeeName === activeEmployeeName)
    : [];
  const activeEmployeeSummary = activeEmployeeRows.length
    ? buildEmployeeSummary(activeEmployeeRows, dayStats.workedDays, dayStats.totalDays)
    : null;
  const categorySummaries = buildCategorySummaries(activeEmployeeRows, dayStats.workedDays, dayStats.totalDays);

  const employeeOptions = employeeFilteredNames.length
    ? employeeFilteredNames.map((name) => ({
        value: buildHref("employee", name, effectiveCategory),
        label: name
      }))
    : [{ value: buildHref("employee", "", effectiveCategory), label: "Calisan bulunamadi" }];

  const categorySelectOptions = [
    { value: buildHref("employee", effectiveEmployee, ""), label: "Tum Kategoriler" },
    ...categoryOptions.map((category) => ({
      value: buildHref("employee", effectiveEmployee, category),
      label: category
    }))
  ];

  return (
    <main>
      <h1 className="page-title">Hedef Gerceklesen</h1>
      <p className="page-subtitle">Google Sheet verisine gore calisan hedef, gerceklesen ve ay sonu projeksiyon gorunumu.</p>

      <div className="goal-tab-row">
        <a
          className={`goal-tab ${effectiveView === "employee" ? "goal-tab-active" : ""}`}
          href={buildHref("employee", effectiveEmployee, effectiveCategory)}
        >
          Calisan
        </a>
        {canViewAll ? (
          <>
            <a className={`goal-tab ${effectiveView === "store" ? "goal-tab-active" : ""}`} href={buildHref("store", "", "")}>
              Magaza
            </a>
            <a className={`goal-tab ${effectiveView === "company" ? "goal-tab-active" : ""}`} href={buildHref("company", "", "")}>
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
      ) : effectiveView !== "employee" ? (
        <section className="guide-card goal-placeholder-card">
          <strong>{effectiveView === "store" ? "Magaza" : "Firma"} gorunumu hazirlaniyor.</strong>
          <p className="subtle">Bugun calisan ekrani aktif. Diger basliklari sonraki asamada tamamlariz.</p>
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

          <section className="guide-card game-brief-card">
            <div className="league-filter-grid">
              <div className="league-filter-item">
                <span className="league-filter-label">Calisan</span>
                <FilterSelectNav
                  ariaLabel="Calisan secimi"
                  value={buildHref("employee", activeEmployeeName, effectiveCategory)}
                  options={employeeOptions}
                />
              </div>

              <div className="league-filter-item">
                <span className="league-filter-label">Ana Kategori</span>
                <FilterSelectNav
                  ariaLabel="Ana kategori secimi"
                  value={buildHref("employee", effectiveEmployee, effectiveCategory)}
                  options={categorySelectOptions}
                />
              </div>
            </div>
          </section>

          <section className="goal-layout">
            <article className="campaign-section-card goal-ranking-card">
              <div className="goal-section-head">
                <h2>Firma Siralamasi</h2>
                <span>{summaries.length} calisan</span>
              </div>

              <div className="goal-ranking-list">
                {summaries.length ? (
                  summaries.map((summary, index) => (
                    <a
                      key={summary.name}
                      className={`goal-ranking-row ${summary.name === activeEmployeeName ? "goal-ranking-row-active" : ""}`}
                      href={buildHref("employee", summary.name, effectiveCategory)}
                    >
                      <span className="goal-rank-badge">{index + 1}</span>
                      <div className="goal-ranking-main">
                        <strong>{summary.name}</strong>
                        <span>
                          {summary.hasTarget
                            ? `Gerceklesen ${formatPercent(summary.actualPercent)} | Ay sonu ${formatPercent(summary.projectedPercent)}`
                            : `Gerceklesen ${formatNumber(summary.totalActual)} | Ay sonu ${formatNumber(summary.projectedActual)}`}
                        </span>
                      </div>
                      <strong className="goal-ranking-score">
                        {summary.hasTarget ? formatPercent(summary.actualPercent) : formatNumber(summary.totalActual)}
                      </strong>
                    </a>
                  ))
                ) : (
                  <p className="subtle">Listelenecek calisan verisi bulunamadi.</p>
                )}
              </div>
            </article>

            <article className="campaign-section-card goal-detail-card">
              <div className="goal-section-head">
                <h2>{activeEmployeeName || "Calisan Detayi"}</h2>
                <span>{effectiveCategory || "Tum kategoriler"}</span>
              </div>

              {activeEmployeeSummary ? (
                <>
                  <div className="goal-stat-grid">
                    {activeEmployeeSummary.hasTarget ? (
                      <>
                        <div className="goal-stat-box">
                          <span>Hedef</span>
                          <strong>{formatNumber(activeEmployeeSummary.totalTarget)}</strong>
                        </div>
                        <div className="goal-stat-box">
                          <span>Gerceklesen</span>
                          <strong>{formatNumber(activeEmployeeSummary.totalActual)}</strong>
                        </div>
                        <div className="goal-stat-box">
                          <span>Gerceklesen %</span>
                          <strong>{formatPercent(activeEmployeeSummary.actualPercent)}</strong>
                        </div>
                        <div className="goal-stat-box">
                          <span>Kalan</span>
                          <strong>{formatNumber(activeEmployeeSummary.remaining)}</strong>
                        </div>
                        <div className="goal-stat-box">
                          <span>Ay Sonu</span>
                          <strong>{formatNumber(activeEmployeeSummary.projectedActual)}</strong>
                        </div>
                        <div className="goal-stat-box">
                          <span>Ay Sonu %</span>
                          <strong>{formatPercent(activeEmployeeSummary.projectedPercent)}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="goal-stat-box">
                          <span>Gerceklesen</span>
                          <strong>{formatNumber(activeEmployeeSummary.totalActual)}</strong>
                        </div>
                        <div className="goal-stat-box">
                          <span>Ay Sonu</span>
                          <strong>{formatNumber(activeEmployeeSummary.projectedActual)}</strong>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="goal-category-list">
                    {categorySummaries.map((category, index) => (
                      <details key={category.title} className="goal-category-card" open={index === 0}>
                        <summary className="goal-category-summary">
                          <div className="goal-category-title">
                            <strong>{category.title}</strong>
                            <span>
                              {category.childCount > 0
                                ? `${category.childCount} alt kategori`
                                : "Tek kalem kategori"}
                            </span>
                          </div>

                          <div className="goal-category-metrics">
                            <span>
                              <small>Gerceklesen</small>
                              <strong>{formatNumber(category.actual)}</strong>
                            </span>
                            <span>
                              <small>Ay Sonu</small>
                              <strong>{formatNumber(category.projectedActual)}</strong>
                            </span>
                            {category.hasTarget ? (
                              <span>
                                <small>Hedef %</small>
                                <strong>{formatPercent(category.actualPercent)}</strong>
                              </span>
                            ) : null}
                          </div>
                        </summary>

                        <div className="goal-category-body">
                          <div className="goal-category-topline">
                            {category.hasTarget ? (
                              <>
                                <span>Hedef: {formatNumber(category.target)}</span>
                                <span>Kalan: {formatNumber(category.remaining)}</span>
                                <span>Ay Sonu %: {formatPercent(category.projectedPercent)}</span>
                              </>
                            ) : (
                              <span>Bu kategoride hedef tanimi yok.</span>
                            )}
                          </div>

                          {category.children.length ? (
                            <div className="goal-child-list">
                              {category.children.map((child) => (
                                <div key={`${category.title}-${child.title}`} className="goal-child-card">
                                  <div className="goal-child-head">
                                    <strong>{child.title}</strong>
                                    <span>{formatNumber(child.actual)}</span>
                                  </div>
                                  <div className="goal-child-meta">
                                    {child.hasTarget ? (
                                      <>
                                        <span>Hedef {formatNumber(child.target)}</span>
                                        <span>% {formatPercent(child.actualPercent)}</span>
                                        <span>Ay Sonu {formatNumber(child.projectedActual)}</span>
                                      </>
                                    ) : (
                                      <span>Ay Sonu {formatNumber(child.projectedActual)}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ))}
                  </div>
                </>
              ) : (
                <p className="subtle">Bu filtreye uygun calisan verisi bulunamadi.</p>
              )}
            </article>
          </section>
        </>
      )}
    </main>
  );
}
