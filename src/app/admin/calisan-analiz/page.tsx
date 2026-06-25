import { redirect } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { fetchGoalActualRows, fetchGoalDayStats, fetchGoalProductionRewardRows, GoalActualRow } from "@/lib/goal-actuals";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type PageProps = {
  searchParams?: Promise<{
    employee?: string;
  }>;
};

type EmployeeProfileOption = {
  id: string;
  fullName: string;
  storeName: string;
};

type MetricSummary = {
  title: string;
  target: number | null;
  actual: number;
  remaining: number | null;
  actualPercent: number | null;
  projectedActual: number;
  projectedPercent: number | null;
  hasTarget: boolean;
};

type CompanyMetricBenchmark = {
  title: string;
  employeeCount: number;
  averageActualPercent: number | null;
  averageProjectedPercent: number | null;
};

type AnalysisMetric = MetricSummary & {
  companyAverageActualPercent: number | null;
  companyAverageProjectedPercent: number | null;
  actualGap: number | null;
  projectedGap: number | null;
  status: "good" | "watch" | "critical" | "neutral";
  dailyNeed: number;
};

type RewardForecast = {
  actualPoints: number;
  projectedPoints: number;
  currentReward: string | null;
  projectedReward: string | null;
  nextReward: string | null;
};

function buildHref(employeeId: string) {
  const params = new URLSearchParams();
  if (employeeId) {
    params.set("employee", employeeId);
  }

  return `/admin/calisan-analiz?${params.toString()}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/\u0130/g, "I")
    .replace(/\u011E/g, "G")
    .replace(/\u00DC/g, "U")
    .replace(/\u015E/g, "S")
    .replace(/\u00D6/g, "O")
    .replace(/\u00C7/g, "C")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
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
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isAggregateCategoryLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return normalized === "tum kategoriler" || normalized === "tüm kategoriler";
}

function isLivePrimeCategory(value: string | null | undefined) {
  const normalized = normalizeIdentity(value);
  return normalized.includes("CANLI PRIM");
}

function buildMetricSummary(rows: GoalActualRow[], workedDays: number, totalDays: number): MetricSummary {
  const title = rows[0]?.mainCategory ?? "Kategori";
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = totalTarget > 0;
  const projectedActual = workedDays > 0 ? Math.floor((totalActual / workedDays) * totalDays) : totalActual;

  return {
    title,
    target: hasTarget ? totalTarget : null,
    actual: totalActual,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget
  };
}

function buildEmployeeCategorySummaries(rows: GoalActualRow[], workedDays: number, totalDays: number) {
  const categoryMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = categoryMap.get(row.mainCategory) ?? [];
    current.push(row);
    categoryMap.set(row.mainCategory, current);
  });

  return Array.from(categoryMap.entries())
    .map(([, categoryRows]) => buildMetricSummary(categoryRows, workedDays, totalDays))
    .sort((left, right) => left.title.localeCompare(right.title, "tr"));
}

function buildCompanyBenchmarks(rows: GoalActualRow[], workedDays: number, totalDays: number) {
  const categoryEmployeeMap = new Map<string, Map<string, GoalActualRow[]>>();

  rows.forEach((row) => {
    const categoryKey = row.mainCategory;
    const employeeKey = row.personnelId || normalizeIdentity(row.employeeName);
    const byEmployee = categoryEmployeeMap.get(categoryKey) ?? new Map<string, GoalActualRow[]>();
    const currentRows = byEmployee.get(employeeKey) ?? [];
    currentRows.push(row);
    byEmployee.set(employeeKey, currentRows);
    categoryEmployeeMap.set(categoryKey, byEmployee);
  });

  return new Map<string, CompanyMetricBenchmark>(
    Array.from(categoryEmployeeMap.entries()).map(([title, byEmployee]) => {
      const summaries = Array.from(byEmployee.values())
        .map((employeeRows) => buildMetricSummary(employeeRows, workedDays, totalDays))
        .filter((summary) => summary.hasTarget);

      return [
        title,
        {
          title,
          employeeCount: summaries.length,
          averageActualPercent: average(summaries.map((summary) => summary.actualPercent ?? 0).filter((value) => value > 0)),
          averageProjectedPercent: average(summaries.map((summary) => summary.projectedPercent ?? 0).filter((value) => value > 0))
        }
      ] satisfies [string, CompanyMetricBenchmark];
    })
  );
}

function buildRewardForecast(metrics: MetricSummary[], rewardRows: Array<{ points: number; reward: string }>, workedDays: number, totalDays: number): RewardForecast | null {
  const productionMetric = metrics.find((metric) => normalizeIdentity(metric.title) === "URETIM PUAN");

  if (!productionMetric || !rewardRows.length) {
    return null;
  }

  const actualPoints = productionMetric.actual;
  const projectedPoints = workedDays > 0 ? Math.floor((actualPoints / workedDays) * totalDays) : actualPoints;
  const currentReward = [...rewardRows].reverse().find((row) => actualPoints >= row.points)?.reward ?? null;
  const projectedReward = [...rewardRows].reverse().find((row) => projectedPoints >= row.points)?.reward ?? null;
  const nextReward = rewardRows.find((row) => row.points > actualPoints)?.reward ?? null;

  return {
    actualPoints,
    projectedPoints,
    currentReward,
    projectedReward,
    nextReward
  };
}

function statusFromMetric(metric: AnalysisMetric) {
  if (!metric.hasTarget || metric.actualPercent === null) {
    return "neutral";
  }

  if ((metric.actualGap ?? 0) <= -15 || metric.actualPercent < 70) {
    return "critical";
  }

  if ((metric.actualGap ?? 0) < 0 || metric.actualPercent < 100) {
    return "watch";
  }

  return "good";
}

function buildInsightSummary(metrics: AnalysisMetric[], rewardForecast: RewardForecast | null) {
  const targetMetrics = metrics.filter((metric) => metric.hasTarget && metric.actualPercent !== null);
  const currentAverage = average(targetMetrics.map((metric) => metric.actualPercent ?? 0));
  const projectedAverage = average(targetMetrics.map((metric) => metric.projectedPercent ?? 0));
  const strongCount = targetMetrics.filter((metric) => (metric.actualGap ?? 0) > 0).length;
  const weakCount = targetMetrics.filter((metric) => (metric.actualGap ?? 0) < 0).length;
  const bestMetric = [...targetMetrics].sort((left, right) => (right.actualGap ?? -999) - (left.actualGap ?? -999) || (right.actualPercent ?? 0) - (left.actualPercent ?? 0))[0] ?? null;
  const worstMetric = [...targetMetrics].sort((left, right) => (left.actualGap ?? 999) - (right.actualGap ?? 999) || (left.actualPercent ?? 999) - (right.actualPercent ?? 999))[0] ?? null;

  const summaryText = [
    currentAverage !== null
      ? `Genel tempo ${formatPercent(currentAverage)} seviyesinde.`
      : "Genel tempo icin yeterli hedefli kategori bulunmuyor.",
    bestMetric ? `En guclu alan ${bestMetric.title}; firma ortalamasina gore ${formatPercent(bestMetric.actualGap)} onde.` : null,
    worstMetric ? `En kritik alan ${worstMetric.title}; firma ortalamasina gore ${formatPercent(Math.abs(worstMetric.actualGap ?? 0))} geride.` : null,
    rewardForecast?.projectedReward ? `Uretim puaninda ay sonu ongorusu ${rewardForecast.projectedReward}.` : null
  ]
    .filter(Boolean)
    .join(" ");

  return {
    currentAverage,
    projectedAverage,
    strongCount,
    weakCount,
    bestMetric,
    worstMetric,
    summaryText
  };
}

export default async function EmployeeAnalysisPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedEmployeeId = String(params?.employee ?? "").trim();

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const admin = createAdminClient();
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, full_name, role, approval, is_on_leave, store:stores(name)")
    .eq("approval", "approved")
    .eq("role", "employee")
    .order("full_name", { ascending: true });

  const employeeProfiles = ((profileRows ?? []) as Array<{
    id: string;
    full_name: string;
    role: string;
    approval: string;
    is_on_leave: boolean | null;
    store: Array<{ name: string }> | { name: string } | null;
  }>)
    .filter((profile) => !profile.is_on_leave)
    .map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      storeName: Array.isArray(profile.store) ? (profile.store[0]?.name ?? "-") : (profile.store?.name ?? "-")
    }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "tr")) satisfies EmployeeProfileOption[];

  if (!employeeProfiles.length) {
    return (
      <main>
        <h1 className="page-title">Calisan Analizi</h1>
        <p className="page-subtitle">Analiz icin uygun aktif calisan bulunamadi.</p>
        <AdminSectionNav currentPath="/admin/calisan-analiz" />
      </main>
    );
  }

  const selectedProfile = employeeProfiles.find((profile) => profile.id === selectedEmployeeId) ?? employeeProfiles[0];

  let goalRows: GoalActualRow[] = [];
  let workedDays = 0;
  let totalDays = 0;
  let remainingDays = 0;
  let rewardRows: Array<{ points: number; reward: string }> = [];
  let sheetError = "";

  try {
    const [employeeRows, dayStats, productionRewardRows] = await Promise.all([
      fetchGoalActualRows(),
      fetchGoalDayStats(),
      fetchGoalProductionRewardRows()
    ]);

    goalRows = employeeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory) && !isLivePrimeCategory(row.mainCategory));
    workedDays = dayStats.workedDays;
    totalDays = dayStats.totalDays;
    remainingDays = dayStats.remainingDays;
    rewardRows = productionRewardRows;
  } catch (error) {
    sheetError = error instanceof Error ? error.message : "Hedef gerceklesen verisi su an okunamadi.";
  }

  const employeeRowsById = goalRows.filter((row) => row.personnelId && row.personnelId === selectedProfile.id);
  const employeeRowsByName = goalRows.filter(
    (row) => normalizeIdentity(row.employeeName) === normalizeIdentity(selectedProfile.fullName)
  );
  const selectedRows = employeeRowsById.length ? employeeRowsById : employeeRowsByName;
  const categorySummaries = buildEmployeeCategorySummaries(selectedRows, workedDays, totalDays);
  const companyBenchmarks = buildCompanyBenchmarks(goalRows, workedDays, totalDays);
  const mergedMetrics = categorySummaries
    .map((metric) => {
      const benchmark = companyBenchmarks.get(metric.title) ?? null;
      const dailyNeed = remainingDays > 0 && metric.remaining !== null ? Math.ceil(metric.remaining / remainingDays) : 0;
      const merged: AnalysisMetric = {
        ...metric,
        companyAverageActualPercent: benchmark?.averageActualPercent ?? null,
        companyAverageProjectedPercent: benchmark?.averageProjectedPercent ?? null,
        actualGap:
          metric.actualPercent !== null && (benchmark?.averageActualPercent ?? null) !== null
            ? metric.actualPercent - (benchmark?.averageActualPercent ?? 0)
            : null,
        projectedGap:
          metric.projectedPercent !== null && (benchmark?.averageProjectedPercent ?? null) !== null
            ? metric.projectedPercent - (benchmark?.averageProjectedPercent ?? 0)
            : null,
        status: "neutral",
        dailyNeed
      };

      return {
        ...merged,
        status: statusFromMetric(merged)
      } satisfies AnalysisMetric;
    })
    .sort((left, right) => {
      if (left.hasTarget && right.hasTarget) {
        return (right.actualPercent ?? 0) - (left.actualPercent ?? 0);
      }

      if (left.hasTarget !== right.hasTarget) {
        return left.hasTarget ? -1 : 1;
      }

      return right.actual - left.actual;
    });

  const strengths = [...mergedMetrics]
    .filter((metric) => metric.hasTarget)
    .sort((left, right) => (right.actualGap ?? -999) - (left.actualGap ?? -999) || (right.actualPercent ?? 0) - (left.actualPercent ?? 0))
    .slice(0, 4);
  const developmentAreas = [...mergedMetrics]
    .filter((metric) => metric.hasTarget)
    .sort((left, right) => (left.actualGap ?? 999) - (right.actualGap ?? 999) || (left.actualPercent ?? 999) - (right.actualPercent ?? 999))
    .slice(0, 4);
  const rewardForecast = buildRewardForecast(categorySummaries, rewardRows, workedDays, totalDays);
  const insight = buildInsightSummary(mergedMetrics, rewardForecast);

  const employeeOptions = employeeProfiles.map((profile) => ({
    label: `${profile.fullName} | ${profile.storeName}`,
    value: buildHref(profile.id)
  }));

  return (
    <main>
      <h1 className="page-title">Calisan Analizi</h1>
      <p className="page-subtitle">
        Tek bir calisani secip hedef gerceklesenini, firma ortalamasina gore durumunu ve odak aksiyonlarini net olarak inceleyin.
      </p>

      <AdminSectionNav currentPath="/admin/calisan-analiz" />

      <section className="admin-card employee-analysis-filter-card">
        <div className="employee-analysis-filter-grid">
          <label className="field">
            <span>Calisan Sec</span>
            <FilterSelectNav
              ariaLabel="Calisan secimi"
              value={buildHref(selectedProfile.id)}
              options={employeeOptions}
            />
          </label>
          <div className="employee-analysis-picked-card">
            <span>Secili Profil</span>
            <strong>{selectedProfile.fullName}</strong>
            <p>{selectedProfile.storeName}</p>
          </div>
        </div>
      </section>

      {sheetError ? (
        <section className="admin-card">
          <h3>Veri okunamadi</h3>
          <p>{sheetError}</p>
        </section>
      ) : !selectedRows.length ? (
        <section className="admin-card">
          <h3>Calisan verisi bulunamadi</h3>
          <p>Secilen kullanici icin sheet tarafinda personel id veya isim eslesmesi bulunmuyor.</p>
        </section>
      ) : (
        <section className="admin-stack employee-analysis-stack">
          <section className="employee-analysis-summary-grid">
            <article className="goal-summary-card">
              <span>Calisilan Gun</span>
              <strong>{formatNumber(workedDays)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Kalan Gun</span>
              <strong>{formatNumber(remainingDays)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Mevcut Ortalama</span>
              <strong>{formatPercent(insight.currentAverage)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Ay Sonu Ortalama</span>
              <strong>{formatPercent(insight.projectedAverage)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Firma Ort. Ustu</span>
              <strong>{formatNumber(insight.strongCount)}</strong>
            </article>
            <article className="goal-summary-card">
              <span>Gelisim Alani</span>
              <strong>{formatNumber(insight.weakCount)}</strong>
            </article>
          </section>

          <article className="evaluation-card evaluation-card-wide employee-analysis-hero">
            <div className="evaluation-card-head">
              <strong>{selectedProfile.fullName}</strong>
              <span>{selectedProfile.storeName}</span>
            </div>
            <p className="employee-analysis-hero-copy">{insight.summaryText}</p>

            <div className="employee-analysis-hero-chips">
              {insight.bestMetric ? (
                <span className="executive-chip">En iyi alan: {insight.bestMetric.title}</span>
              ) : null}
              {insight.worstMetric ? (
                <span className="executive-chip executive-chip-alert">En kritik alan: {insight.worstMetric.title}</span>
              ) : null}
              {rewardForecast?.projectedReward ? (
                <span className="executive-chip">Ay sonu kazanim: {rewardForecast.projectedReward}</span>
              ) : null}
            </div>
          </article>

          <section className="employee-analysis-two-column">
            <article className="admin-card">
              <h3>Iyi Yonler</h3>
              <div className="employee-analysis-metric-list">
                {strengths.length ? (
                  strengths.map((metric) => (
                    <div key={`strength-${metric.title}`} className="employee-analysis-metric-card employee-analysis-metric-card-good">
                      <div className="employee-analysis-metric-head">
                        <strong>{metric.title}</strong>
                        <span>{formatPercent(metric.actualPercent)}</span>
                      </div>
                      <p>
                        Firma ortalamasi {formatPercent(metric.companyAverageActualPercent)} seviyesinde. Bu calisan
                        {formatPercent(metric.actualGap)} onde gorunuyor.
                      </p>
                    </div>
                  ))
                ) : (
                  <p>Belirgin bir guclu alan bulunamadi.</p>
                )}
              </div>
            </article>

            <article className="admin-card">
              <h3>Gelismesi Gereken Alanlar</h3>
              <div className="employee-analysis-metric-list">
                {developmentAreas.length ? (
                  developmentAreas.map((metric) => (
                    <div key={`risk-${metric.title}`} className="employee-analysis-metric-card employee-analysis-metric-card-critical">
                      <div className="employee-analysis-metric-head">
                        <strong>{metric.title}</strong>
                        <span>{formatPercent(metric.actualPercent)}</span>
                      </div>
                      <p>
                        Firma ortalamasi {formatPercent(metric.companyAverageActualPercent)} seviyesinde. Aradaki fark{" "}
                        {formatPercent(Math.abs(metric.actualGap ?? 0))}. Kalan gunlerde gunluk en az {formatNumber(metric.dailyNeed)} uretim gerekli.
                      </p>
                    </div>
                  ))
                ) : (
                  <p>Gelisim gerektiren kritik alan gorunmuyor.</p>
                )}
              </div>
            </article>
          </section>

          {rewardForecast ? (
            <article className="admin-card">
              <h3>Uretim Puani ve Kazanim Ongorusu</h3>
              <div className="employee-analysis-summary-grid">
                <article className="goal-summary-card">
                  <span>Su Anki Puan</span>
                  <strong>{formatNumber(rewardForecast.actualPoints)}</strong>
                </article>
                <article className="goal-summary-card">
                  <span>Ay Sonu Puan</span>
                  <strong>{formatNumber(rewardForecast.projectedPoints)}</strong>
                </article>
                <article className="goal-summary-card">
                  <span>Mevcut Kazanim</span>
                  <strong>{rewardForecast.currentReward ?? "-"}</strong>
                </article>
                <article className="goal-summary-card">
                  <span>Ay Sonu Ongorusu</span>
                  <strong>{rewardForecast.projectedReward ?? "-"}</strong>
                </article>
                <article className="goal-summary-card">
                  <span>Siradaki Basamak</span>
                  <strong>{rewardForecast.nextReward ?? "Son skala"}</strong>
                </article>
              </div>
            </article>
          ) : null}

          <article className="admin-card">
            <h3>Kategori Bazli Karsilastirma</h3>
            <p className="employee-analysis-section-copy">
              Calisanin mevcut hedef temposu ile firma ortalamasi ayni satirda gosterilir. Cizgiler ne kadar uzunsa kategori o kadar gucludur.
            </p>

            <div className="employee-analysis-chart-list">
              {mergedMetrics.filter((metric) => metric.hasTarget).map((metric) => {
                const employeeWidth = Math.max(0, Math.min(metric.actualPercent ?? 0, 140));
                const companyWidth = Math.max(0, Math.min(metric.companyAverageActualPercent ?? 0, 140));

                return (
                  <div key={`chart-${metric.title}`} className="employee-analysis-chart-card">
                    <div className="employee-analysis-chart-head">
                      <strong>{metric.title}</strong>
                      <span className={`employee-analysis-status employee-analysis-status-${metric.status}`}>
                        {metric.status === "good"
                          ? "Guclu"
                          : metric.status === "critical"
                            ? "Kritik"
                            : metric.status === "watch"
                              ? "Takip"
                              : "Not"}
                      </span>
                    </div>

                    <div className="employee-analysis-bar-group">
                      <div className="employee-analysis-bar-row">
                        <span>Calisan</span>
                        <div className="employee-analysis-bar-track">
                          <i className="employee-analysis-bar-fill employee-analysis-bar-fill-employee" style={{ width: `${employeeWidth}%` }} />
                        </div>
                        <strong>{formatPercent(metric.actualPercent)}</strong>
                      </div>

                      <div className="employee-analysis-bar-row">
                        <span>Firma Ort.</span>
                        <div className="employee-analysis-bar-track">
                          <i className="employee-analysis-bar-fill employee-analysis-bar-fill-company" style={{ width: `${companyWidth}%` }} />
                        </div>
                        <strong>{formatPercent(metric.companyAverageActualPercent)}</strong>
                      </div>
                    </div>

                    <div className="employee-analysis-chart-meta">
                      <span>Ay sonu: {formatPercent(metric.projectedPercent)}</span>
                      <span>Firma ay sonu: {formatPercent(metric.companyAverageProjectedPercent)}</span>
                      <span>Fark: {formatPercent(metric.actualGap)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="admin-card">
            <h3>Nokta Atisi Ozet</h3>
            <div className="employee-analysis-actions">
              {developmentAreas.map((metric) => (
                <div key={`action-${metric.title}`} className="employee-analysis-action-item">
                  <strong>{metric.title}</strong>
                  <p>
                    Bugun bu alanda tempo dusuk. Firma ortalamasina yaklasmak icin once {metric.title.toLocaleLowerCase("tr-TR")} kaleminde gunluk en az{" "}
                    {formatNumber(metric.dailyNeed)} ek uretim hedeflenmeli.
                  </p>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
