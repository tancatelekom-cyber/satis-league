import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { fetchGoalActualRows, fetchGoalDayStats, GoalActualRow } from "@/lib/goal-actuals";
import { createClient } from "@/lib/supabase/server";

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

  const { data: profile } = await supabase.from("profiles").select("approval").eq("id", user.id).single();

  if (!profile || profile.approval !== "approved") {
    redirect("/hesabim");
  }

  const [rows, dayStats] = await Promise.all([fetchGoalActualRows(), fetchGoalDayStats()]);

  const employeeNames = Array.from(new Set(rows.map((row) => row.employeeName))).sort((a, b) => a.localeCompare(b, "tr"));
  const categoryOptions = Array.from(new Set(rows.map((row) => row.mainCategory))).sort((a, b) => a.localeCompare(b, "tr"));

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
  const categoryGroups = buildCategoryGroups(activeEmployeeRows);

  return (
    <main>
      <h1 className="page-title">Hedef Gerçekleşen</h1>
      <p className="page-subtitle">Google Sheet verisine göre çalışan hedef, gerçekleşen ve ay sonu projeksiyon görünümü.</p>

      <div className="goal-tab-row">
        <a className={`goal-tab ${selectedView === "employee" ? "goal-tab-active" : ""}`} href={buildHref("employee", effectiveEmployee, effectiveCategory)}>
          Çalışan
        </a>
        <a className={`goal-tab ${selectedView === "store" ? "goal-tab-active" : ""}`} href={buildHref("store", "", "")}>
          Mağaza
        </a>
        <a className={`goal-tab ${selectedView === "company" ? "goal-tab-active" : ""}`} href={buildHref("company", "", "")}>
          Firma
        </a>
      </div>

      {selectedView !== "employee" ? (
        <section className="guide-card goal-placeholder-card">
          <strong>{selectedView === "store" ? "Mağaza" : "Firma"} görünümü hazırlanıyor.</strong>
          <p className="subtle">Bugün çalışan ekranı aktif. Diğer başlıkları sonraki aşamada tamamlarız.</p>
        </section>
      ) : (
        <>
          <section className="goal-summary-strip">
            <article className="goal-summary-card">
              <span>Çalışılan Gün</span>
              <strong>{formatNumber(dayStats.workedDays)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Kalan Gün</span>
              <strong>{formatNumber(dayStats.remainingDays)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Toplam Gün</span>
              <strong>{formatNumber(dayStats.totalDays)}</strong>
            </article>
          </section>

          <section className="guide-card game-brief-card">
            <div className="league-filter-grid">
              <div className="league-filter-item">
                <span className="league-filter-label">Çalışan</span>
                <FilterSelectNav
                  ariaLabel="Çalışan seçimi"
                  value={buildHref("employee", activeEmployeeName, effectiveCategory)}
                  options={[
                    ...employeeFilteredNames.map((name) => ({
                      value: buildHref("employee", name, effectiveCategory),
                      label: name
                    }))
                  ]}
                />
              </div>

              <div className="league-filter-item">
                <span className="league-filter-label">Ana Kategori</span>
                <FilterSelectNav
                  ariaLabel="Ana kategori seçimi"
                  value={buildHref("employee", effectiveEmployee, effectiveCategory)}
                  options={[
                    { value: buildHref("employee", effectiveEmployee, ""), label: "Tüm Kategoriler" },
                    ...categoryOptions.map((category) => ({
                      value: buildHref("employee", effectiveEmployee, category),
                      label: category
                    }))
                  ]}
                />
              </div>
            </div>
          </section>

          <section className="goal-layout">
            <article className="campaign-section-card goal-ranking-card">
              <div className="goal-section-head">
                <h2>Firma Sıralaması</h2>
                <span>{summaries.length} çalışan</span>
              </div>

              <div className="goal-ranking-list">
                {summaries.map((summary, index) => (
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
                          ? `Gerçekleşen ${formatPercent(summary.actualPercent)} | Ay sonu ${formatPercent(summary.projectedPercent)}`
                          : `Gerçekleşen ${formatNumber(summary.totalActual)} | Ay sonu ${formatNumber(summary.projectedActual)}`}
                      </span>
                    </div>
                    <strong className="goal-ranking-score">
                      {summary.hasTarget ? formatPercent(summary.actualPercent) : formatNumber(summary.totalActual)}
                    </strong>
                  </a>
                ))}
              </div>
            </article>

            <article className="campaign-section-card goal-detail-card">
              <div className="goal-section-head">
                <h2>{activeEmployeeName || "Çalışan Detayı"}</h2>
                <span>{effectiveCategory || "Tüm kategoriler"}</span>
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
                          <span>Gerçekleşen</span>
                          <strong>{formatNumber(activeEmployeeSummary.totalActual)}</strong>
                        </div>
                        <div className="goal-stat-box">
                          <span>Gerçekleşen %</span>
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
                          <span>Gerçekleşen</span>
                          <strong>{formatNumber(activeEmployeeSummary.totalActual)}</strong>
                        </div>
                        <div className="goal-stat-box">
                          <span>Ay Sonu</span>
                          <strong>{formatNumber(activeEmployeeSummary.projectedActual)}</strong>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="goal-detail-table-wrap">
                    <table className="goal-detail-table">
                      <thead>
                        <tr>
                          <th>Kategori</th>
                          <th>Hedef</th>
                          <th>Gerçekleşen</th>
                          <th>Gerçekleşen %</th>
                          <th>Kalan</th>
                          <th>Ay Sonu</th>
                          <th>Ay Sonu %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryGroups.flatMap(([mainCategory, group]) => {
                          const rowsToRender: Array<{
                            key: string;
                            label: string;
                            row: GoalActualRow | null;
                            kind: "main" | "child" | "single";
                          }> = [];

                          group.mainOnlyRows.forEach((row, index) => {
                            rowsToRender.push({
                              key: `${mainCategory}-single-${index}`,
                              label: mainCategory,
                              row,
                              kind: "single"
                            });
                          });

                          if (group.children.length > 0) {
                            rowsToRender.push({
                              key: `${mainCategory}-header`,
                              label: mainCategory,
                              row: null,
                              kind: "main"
                            });

                            group.children.forEach((row, index) => {
                              rowsToRender.push({
                                key: `${mainCategory}-child-${index}`,
                                label: row.subCategory,
                                row,
                                kind: "child"
                              });
                            });
                          }

                          return rowsToRender.map((entry) => {
                            if (!entry.row) {
                              return (
                                <tr key={entry.key} className="goal-main-category-row">
                                  <td colSpan={7}>{entry.label}</td>
                                </tr>
                              );
                            }

                            const target = entry.row.target;
                            const actual = entry.row.actual;
                            const actualPercent = target ? (actual / target) * 100 : null;
                            const remaining = target ? Math.max(target - actual, 0) : null;
                            const projectedActual =
                              dayStats.workedDays > 0 ? (actual / dayStats.workedDays) * dayStats.totalDays : actual;
                            const projectedPercent = target ? (projectedActual / target) * 100 : null;

                            return (
                              <tr key={entry.key} className={entry.kind === "child" ? "goal-child-row" : ""}>
                                <td>{entry.label}</td>
                                <td>{formatNumber(target)}</td>
                                <td>{formatNumber(actual)}</td>
                                <td>{formatPercent(actualPercent)}</td>
                                <td>{formatNumber(remaining)}</td>
                                <td>{formatNumber(projectedActual)}</td>
                                <td>{formatPercent(projectedPercent)}</td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="subtle">Bu filtreye uygun çalışan verisi bulunamadı.</p>
              )}
            </article>
          </section>
        </>
      )}
    </main>
  );
}
