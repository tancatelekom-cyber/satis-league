import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { fetchGoalActualRows, fetchGoalDayStats, fetchGoalStoreRows, type GoalActualRow, type GoalDayStats, type GoalStoreRow } from "@/lib/goal-actuals";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type MetricSummary = {
  title: string;
  target: number | null;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
  hasTarget: boolean;
  showProjection: boolean;
};

type FocusItem = {
  owner: string;
  metric: string;
  actual: number;
  target: number | null;
  projectedPercent: number | null;
  remaining: number | null;
  dailyNeed: number;
  action: string;
  note: string;
};

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
};

const EMPTY_DAYS: GoalDayStats = {
  workedDays: 0,
  remainingDays: 0,
  totalDays: 0
};

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

  return normalized === "tum kategoriler" || normalized === "tüm kategoriler" || normalized === "tã¼m kategoriler";
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
    hasTarget,
    showProjection: true
  };
}

function buildStoreMetricSummary(rows: GoalStoreRow[], workedDays: number, totalDays: number): MetricSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const hasTarget = totalTarget > 0;
  const showProjection = rows.every((row) => row.includeProjection);
  const projectedActual = showProjection
    ? workedDays > 0
      ? Math.floor((actual / workedDays) * totalDays)
      : actual
    : null;

  return {
    title: rows[0]?.mainCategory ?? "Genel",
    target: hasTarget ? totalTarget : null,
    actual,
    actualPercent: hasTarget ? (actual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - actual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget && projectedActual !== null ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection
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

function buildStoreCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number) {
  const map = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const current = map.get(row.mainCategory) ?? [];
    current.push(row);
    map.set(row.mainCategory, current);
  });

  return Array.from(map.entries())
    .map(([title, categoryRows]) => ({ ...buildStoreMetricSummary(categoryRows, workedDays, totalDays), title }))
    .sort((left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0));
}

function buildCompanyRows(rows: GoalStoreRow[]) {
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
    } satisfies GoalStoreRow;
  });
}

function buildCompanyCategorySummaries(rows: GoalStoreRow[], workedDays: number, totalDays: number) {
  const companyRows = buildCompanyRows(rows);
  const map = new Map<string, GoalStoreRow[]>();

  companyRows.forEach((row) => {
    const current = map.get(row.mainCategory) ?? [];
    current.push(row);
    map.set(row.mainCategory, current);
  });

  return Array.from(map.entries())
    .map(([title, categoryRows]) => ({ ...buildStoreMetricSummary(categoryRows, workedDays, totalDays), title }))
    .sort((left, right) => (left.projectedPercent ?? left.actualPercent ?? 0) - (right.projectedPercent ?? right.actualPercent ?? 0));
}

function buildActionLabel(metricTitle: string, dailyNeed: number, ownerKind: "store" | "employee" | "company") {
  const normalized = normalizeCategoryKey(metricTitle);

  if (normalized.includes("AKTIVASYON")) {
    return `${ownerKind === "employee" ? "Gunluk aktivasyon hedefi" : "Vardiya bazli aktivasyon hedefi"} netlestirilsin, gunde en az ${formatNumber(dailyNeed)} aktivasyon icin anlik takip yapilsin.`;
  }

  if (normalized.includes("TERMINAL")) {
    return `Terminal teklifleri kasa akisi icine yerlestirilsin, gunde en az ${formatNumber(dailyNeed)} ek cikis zorlanmali.`;
  }

  if (normalized.includes("CIRO") || normalized.includes("KARLILIK")) {
    return `Sepet buyutme ve premium yonlendirme ile gunde en az ${formatNumber(dailyNeed)} ek uretim alinmali.`;
  }

  if (normalized.includes("AYIN URUN")) {
    return `Ayin urunu vitrin ve bire bir yonlendirme ile her gun en az ${formatNumber(dailyNeed)} adet desteklenmeli.`;
  }

  if (normalized.includes("REKONTRATLAMA")) {
    return `Rekontrat listesi vardiya basi paylasilsin, gunde en az ${formatNumber(dailyNeed)} kontrat kapatilmasi takip edilmeli.`;
  }

  return `Kalan gunlerde her gun en az ${formatNumber(dailyNeed)} ek uretim alinacak mikro hedef tanimlansin.`;
}

function toFocusItem(
  owner: string,
  metric: MetricSummary,
  remainingDays: number,
  ownerKind: "store" | "employee" | "company"
): FocusItem | null {
  if (!metric.hasTarget || isEntryCount(metric.title)) {
    return null;
  }

  const score = metric.projectedPercent ?? metric.actualPercent;
  if (score === null || score >= 100) {
    return null;
  }

  const dailyNeed = remainingDays > 0 && metric.remaining !== null ? Math.ceil(metric.remaining / remainingDays) : metric.remaining ?? 0;

  return {
    owner,
    metric: metric.title,
    actual: metric.actual,
    target: metric.target,
    projectedPercent: score,
    remaining: metric.remaining,
    dailyNeed,
    action: buildActionLabel(metric.title, dailyNeed, ownerKind),
    note: `Gerceklesen ${formatNumber(metric.actual)} / Hedef ${formatNumber(metric.target)} / Ay sonu ${formatPercent(score)}`
  };
}

function buildStoreFocusItems(rows: GoalStoreRow[], workedDays: number, totalDays: number, remainingDays: number) {
  const storeMap = new Map<string, GoalStoreRow[]>();

  rows.forEach((row) => {
    const current = storeMap.get(row.storeCode) ?? [];
    current.push(row);
    storeMap.set(row.storeCode, current);
  });

  return Array.from(storeMap.entries())
    .map(([storeCode, storeRows]) => {
      const criticalMetric = buildStoreCategorySummaries(storeRows, workedDays, totalDays)
        .map((metric) => toFocusItem(storeCode, metric, remainingDays, "store"))
        .find(Boolean);
      return criticalMetric ?? null;
    })
    .filter((item): item is FocusItem => Boolean(item))
    .sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0))
    .slice(0, 8);
}

function buildEmployeeFocusItems(rows: GoalActualRow[], workedDays: number, totalDays: number, remainingDays: number) {
  const employeeMap = new Map<string, GoalActualRow[]>();

  rows.forEach((row) => {
    const current = employeeMap.get(row.employeeName) ?? [];
    current.push(row);
    employeeMap.set(row.employeeName, current);
  });

  return Array.from(employeeMap.entries())
    .map(([employeeName, employeeRows]) => {
      const criticalMetric = buildEmployeeCategorySummaries(employeeRows, workedDays, totalDays)
        .map((metric) => toFocusItem(employeeName, metric, remainingDays, "employee"))
        .find(Boolean);
      return criticalMetric ?? null;
    })
    .filter((item): item is FocusItem => Boolean(item))
    .sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0))
    .slice(0, 10);
}

function buildCompanyFocusItems(rows: GoalStoreRow[], workedDays: number, totalDays: number, remainingDays: number) {
  return buildCompanyCategorySummaries(rows, workedDays, totalDays)
    .map((metric) => toFocusItem("Firma", metric, remainingDays, "company"))
    .filter((item): item is FocusItem => Boolean(item))
    .sort((left, right) => (left.projectedPercent ?? 0) - (right.projectedPercent ?? 0));
}

function buildZeroActualItems(rows: GoalStoreRow[]) {
  const seen = new Set<string>();

  return buildCompanyRows(rows)
    .filter((row) => !isEntryCount(row.mainCategory) && row.actual === 0)
    .map((row) => row.subCategory || row.mainCategory)
    .filter((label) => {
      if (seen.has(label)) {
        return false;
      }

      seen.add(label);
      return true;
    });
}

function buildSummaryCards(dayStats: GoalDayStats, storeFocusItems: FocusItem[], employeeFocusItems: FocusItem[], companyFocusItems: FocusItem[], zeroItems: string[]) {
  return [
    {
      label: "Calisilan Gun",
      value: formatNumber(dayStats.workedDays),
      detail: "Ay icinde gerceklesen calisma gunu."
    },
    {
      label: "Kalan Gun",
      value: formatNumber(dayStats.remainingDays),
      detail: "Mudur aksiyonlari icin kalan sure."
    },
    {
      label: "Riskli Magaza",
      value: formatNumber(storeFocusItems.length),
      detail: "Acil takip gerektiren magaza sayisi."
    },
    {
      label: "Riskli Calisan",
      value: formatNumber(employeeFocusItems.length),
      detail: "Hedef temposu kritik seviyede olan calisan."
    },
    {
      label: "Firma Kritik Kalem",
      value: formatNumber(companyFocusItems.length),
      detail: "Firma genelinde hedef altinda kalan ana kategori."
    },
    {
      label: "Sifir Gerceklesen",
      value: formatNumber(zeroItems.length),
      detail: "Firma genelinde hic hareket almayan kalem."
    }
  ] satisfies SummaryCard[];
}

function buildManagerActionLines(storeFocusItems: FocusItem[], employeeFocusItems: FocusItem[], companyFocusItems: FocusItem[], zeroItems: string[]) {
  const lines: string[] = [];

  companyFocusItems.slice(0, 3).forEach((item) => {
    lines.push(`${item.metric}: ${item.action}`);
  });

  storeFocusItems.slice(0, 3).forEach((item) => {
    lines.push(`${item.owner} / ${item.metric}: ${item.action}`);
  });

  employeeFocusItems.slice(0, 2).forEach((item) => {
    lines.push(`${item.owner} / ${item.metric}: bire bir takip yapilsin, gunde en az ${formatNumber(item.dailyNeed)} ek uretim istenmeli.`);
  });

  if (zeroItems.length) {
    lines.push(`Sifir gerceklesen kalemler: ${zeroItems.join(", ")}. Bu alanlar gun icinde kontrol listesine zorunlu yazilmali.`);
  }

  return lines;
}

export default async function ManagerBriefingPage() {
  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  let employeeRows: GoalActualRow[] = [];
  let storeRows: GoalStoreRow[] = [];
  let dayStats: GoalDayStats = EMPTY_DAYS;
  let errorMessage = "";

  try {
    [employeeRows, storeRows, dayStats] = await Promise.all([fetchGoalActualRows(), fetchGoalStoreRows(), fetchGoalDayStats()]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Hedef gerceklesen verisi okunamadi.";
  }

  const filteredEmployeeRows = employeeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));
  const filteredStoreRows = storeRows.filter((row) => !isAggregateCategoryLabel(row.mainCategory));
  const storeFocusItems = buildStoreFocusItems(filteredStoreRows, dayStats.workedDays, dayStats.totalDays, dayStats.remainingDays);
  const employeeFocusItems = buildEmployeeFocusItems(filteredEmployeeRows, dayStats.workedDays, dayStats.totalDays, dayStats.remainingDays);
  const companyFocusItems = buildCompanyFocusItems(filteredStoreRows, dayStats.workedDays, dayStats.totalDays, dayStats.remainingDays);
  const zeroItems = buildZeroActualItems(filteredStoreRows);
  const summaryCards = buildSummaryCards(dayStats, storeFocusItems, employeeFocusItems, companyFocusItems, zeroItems);
  const actionLines = buildManagerActionLines(storeFocusItems, employeeFocusItems, companyFocusItems, zeroItems);
  const strongestCompanyMetric =
    buildCompanyCategorySummaries(filteredStoreRows, dayStats.workedDays, dayStats.totalDays)
      .filter((metric) => metric.hasTarget && !isEntryCount(metric.title))
      .sort((left, right) => (right.projectedPercent ?? right.actualPercent ?? 0) - (left.projectedPercent ?? left.actualPercent ?? 0))[0] ?? null;

  return (
    <main>
      <h1 className="page-title">Mudur Sunumu</h1>
      <p className="page-subtitle">
        Bu ekran sadece admin icin hazirlandi. Anlik hedef gerceklesen verisine gore magaza mudurlerine sunulacak kritikleri, firma durumunu
        ve kalan gun aksiyonlarini tek yerde toplar.
      </p>

      {errorMessage ? <div className="message-box error-box">{errorMessage}</div> : null}

      <AdminSectionNav currentPath="/admin/mudur-sunumu" />

      <section className="admin-overview-grid">
        {summaryCards.map((card) => (
          <article key={card.label} className="admin-overview-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="admin-stack">
        <article className="admin-card executive-hero-card">
          <h3>Firma Genel Durumu</h3>
          <p>
            {companyFocusItems.length
              ? `Firma genelinde ${companyFocusItems.length} ana kategori hedef temposunun altinda. En iyi korunan alan ${
                  strongestCompanyMetric?.title ?? "belirsiz"
                }, en kritik alan ise ${companyFocusItems[0]?.metric ?? "belirsiz"}.`
              : "Firma genelinde belirgin hedef riski gorunmuyor. Mevcut tempo korunursa hedef kapanisi destekleniyor."}
          </p>

          <div className="executive-chip-row">
            <span className="executive-chip">Calisilan gun: {formatNumber(dayStats.workedDays)}</span>
            <span className="executive-chip">Kalan gun: {formatNumber(dayStats.remainingDays)}</span>
            <span className="executive-chip">Sifir gerceklesen kalem: {formatNumber(zeroItems.length)}</span>
          </div>
        </article>

        <section className="admin-grid executive-grid">
          <article className="admin-card">
            <h3>Firma Hedef Gerceklesenleri</h3>
            <div className="executive-list">
              {companyFocusItems.length ? (
                companyFocusItems.slice(0, 8).map((item) => (
                  <div key={`company-${item.metric}`} className="executive-list-item">
                    <div>
                      <strong>{item.metric}</strong>
                      <p>{item.note}</p>
                    </div>
                    <span className="executive-score">{formatPercent(item.projectedPercent)}</span>
                  </div>
                ))
              ) : (
                <p className="subtle">Firma tarafinda hedef altinda belirgin ana kategori bulunmuyor.</p>
              )}
            </div>
          </article>

          <article className="admin-card">
            <h3>Gozden Kacirilan Firma Kalemleri</h3>
            <div className="executive-chip-row">
              {zeroItems.length ? (
                zeroItems.map((item) => (
                  <span key={item} className="executive-chip executive-chip-alert">
                    {item}
                  </span>
                ))
              ) : (
                <p className="subtle">Firma genelinde sifir gerceklesen kritik kalem yok.</p>
              )}
            </div>
          </article>
        </section>

        <section className="admin-grid executive-grid">
          <article className="admin-card">
            <h3>Magaza Kritikleri</h3>
            <div className="executive-list">
              {storeFocusItems.length ? (
                storeFocusItems.map((item) => (
                  <div key={`${item.owner}-${item.metric}`} className="executive-list-item">
                    <div>
                      <strong>{item.owner}</strong>
                      <span>{item.metric}</span>
                      <p>{item.note}</p>
                      <p className="executive-action-copy">{item.action}</p>
                    </div>
                    <span className="executive-score">{formatPercent(item.projectedPercent)}</span>
                  </div>
                ))
              ) : (
                <p className="subtle">Magaza bazli acil kritik gorunmuyor.</p>
              )}
            </div>
          </article>

          <article className="admin-card">
            <h3>Calisan Kritikleri</h3>
            <div className="executive-list">
              {employeeFocusItems.length ? (
                employeeFocusItems.map((item) => (
                  <div key={`${item.owner}-${item.metric}`} className="executive-list-item">
                    <div>
                      <strong>{item.owner}</strong>
                      <span>{item.metric}</span>
                      <p>{item.note}</p>
                      <p className="executive-action-copy">{item.action}</p>
                    </div>
                    <span className="executive-score">{formatPercent(item.projectedPercent)}</span>
                  </div>
                ))
              ) : (
                <p className="subtle">Calisan bazli acil kritik gorunmuyor.</p>
              )}
            </div>
          </article>
        </section>

        <article className="admin-card">
          <h3>Kalan Gunler Icin Alinmasi Gereken Aksiyonlar</h3>
          <div className="executive-action-list">
            {actionLines.length ? (
              actionLines.map((line) => (
                <div key={line} className="step-item executive-step-item">
                  <strong>Aksiyon</strong>
                  <span>{line}</span>
                </div>
              ))
            ) : (
              <p className="subtle">Ek aksiyon gerektiren belirgin bir baski gorunmuyor.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
