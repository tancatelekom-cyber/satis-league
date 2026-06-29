import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { requireUser } from "@/lib/auth/require-user";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";
import { roleLabels } from "@/lib/labels";
import { buildManagerPrimeSummary } from "@/lib/manager-prime";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

type PageProps = {
  searchParams?: Promise<{
    manager?: string;
  }>;
};

type ManagerProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  approval: string;
  store: {
    name: string;
  } | null;
};

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })} TL`;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  })}`;
}

function buildManagerHref(managerId: string) {
  const params = new URLSearchParams();
  if (managerId) {
    params.set("manager", managerId);
  }
  return `/magaza-muduru-primi?${params.toString()}`;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ManagerPrimePage({ searchParams }: PageProps) {
  await requireUser();

  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, approval, store:stores(name)")
    .eq("id", user.id)
    .single();

  const safeProfile = (profile as ManagerProfileRow | null) ?? null;

  if (!safeProfile || safeProfile.approval !== "approved") {
    redirect("/hesabim");
  }

  const resolvedFeatureAccess = await getResolvedFeatureAccessForProfile("mudur-primi", user.id, safeProfile.role);
  if (!resolvedFeatureAccess.allowed) {
    redirect("/");
  }

  if (!["manager", "management", "admin"].includes(safeProfile.role)) {
    redirect("/");
  }

  const { data: managerProfilesData } = await supabase
    .from("profiles")
    .select("id, full_name, role, approval, store:stores(name)")
    .eq("approval", "approved")
    .eq("role", "manager")
    .order("full_name", { ascending: true });

  const allManagers = ((managerProfilesData as ManagerProfileRow[] | null) ?? []).filter((item) => item.full_name);
  const visibleManagers =
    safeProfile.role === "manager" ? allManagers.filter((item) => item.id === safeProfile.id) : allManagers;

  if (!visibleManagers.length) {
    return (
      <main>
        <h1 className="page-title">Magaza Muduru Prim Kazanimi</h1>
        <p className="page-subtitle">Gosterilecek magaza muduru kaydi bulunamadi.</p>
      </main>
    );
  }

  const requestedManagerId = String(params?.manager ?? "").trim();
  const selectedManager = visibleManagers.find((item) => item.id === requestedManagerId) ?? visibleManagers[0];
  const summary = await buildManagerPrimeSummary(selectedManager.full_name, selectedManager.store?.name ?? "");

  if (!summary) {
    return (
      <main>
        <h1 className="page-title">Magaza Muduru Prim Kazanimi</h1>
        <p className="page-subtitle">{selectedManager.full_name} icin hedef gerceklesen verisi bulunamadi.</p>
      </main>
    );
  }

  return (
    <main>
      <h1 className="page-title">Magaza Muduru Prim Kazanimi</h1>
      <p className="page-subtitle">
        Magaza mudurunun mevcut temposuna ve ay sonu gidisatina gore mevcut prim ile ay sonu prim ongorusu hesaplanir.
      </p>

      <section className="guide-card game-brief-card" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          <article className="campaign-summary-card">
            <span>Secili Mudur</span>
            <strong>{summary.managerName}</strong>
            <p>{summary.storeName}</p>
          </article>
          <article className="campaign-summary-card">
            <span>Rol</span>
            <strong>{roleLabels[selectedManager.role]}</strong>
            <p>Prim hesabi bu profil icin olusturuldu.</p>
          </article>
          <article className="campaign-summary-card">
            <span>Mevcut Prim</span>
            <strong>{formatCurrency(summary.currentPrimeTotal)}</strong>
            <p>Bugune kadarki tempoya gore tahmini mevcut prim.</p>
          </article>
          <article className="campaign-summary-card">
            <span>Ay Sonu Prim Ongorusu</span>
            <strong>{formatCurrency(summary.projectedPrimeTotal)}</strong>
            <p>Mevcut tempoyla ay sonu beklenen toplam.</p>
          </article>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          <article className="campaign-summary-card">
            <span>Rekontratlama Tempo</span>
            <strong>{formatPercent(summary.metrics.recontract.actualTempo)}</strong>
            <p>Cekirdek prim toplamini su an etkileyen oran.</p>
          </article>
          <article className="campaign-summary-card">
            <span>Ay Sonu Rekontratlama</span>
            <strong>{formatPercent(summary.metrics.recontract.projectedTempo)}</strong>
            <p>Ay sonu cekirdek prim carpan ongorusu.</p>
          </article>
          <article className="campaign-summary-card">
            <span>Aksesuar Primi</span>
            <strong>{formatCurrency(summary.currentAccessoryReward)}</strong>
            <p>Aksesuar karlilik bagimsiz prim tutari.</p>
          </article>
          <article className="campaign-summary-card">
            <span>Ay Sonu Aksesuar</span>
            <strong>{formatCurrency(summary.projectedAccessoryReward)}</strong>
            <p>Aksesuar karlilik ay sonu bagimsiz prim ongorusu.</p>
          </article>
        </div>

        {safeProfile.role !== "manager" ? (
          <div className="admin-form">
            <label className="field">
              <span>Magaza Muduru Secimi</span>
              <FilterSelectNav
                ariaLabel="Magaza muduru secimi"
                value={buildManagerHref(selectedManager.id)}
                options={visibleManagers.map((item) => ({
                  label: `${item.full_name}${item.store?.name ? ` | ${item.store.name}` : ""}`,
                  value: buildManagerHref(item.id)
                }))}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head web-kontor-section-head">
          <div>
            <h2 className="goal-panel-title">Prim Dagilim Detayi</h2>
            <p className="goal-panel-subtitle">
              Uretim puani, aktivasyon puan, terminal ve SOL kazanimi toplanir; toplam rekontratlama temposu ile carpilir. Aksesuar karlilik bagimsiz hesaplanir.
            </p>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="goal-company-trend-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Su An Tempo</th>
                <th>Ay Sonu Tempo</th>
                <th>Su An Skala</th>
                <th>Ay Sonu Skala</th>
                <th>Su An Baz</th>
                <th>Ay Sonu Baz</th>
                <th>Su An Prim</th>
                <th>Ay Sonu Prim</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => {
                const accessoryRow = row.key === "accessory";
                const recontractRow = row.key === "recontract";

                return (
                  <tr key={`manager-prime-${row.key}`}>
                    <th>{row.label}</th>
                    <td>{formatPercent(row.actualTempo)}</td>
                    <td>{formatPercent(row.projectedTempo)}</td>
                    <td>{row.currentScaleLabel}</td>
                    <td>{row.projectedScaleLabel}</td>
                    <td>
                      {accessoryRow
                        ? formatPercent(row.currentBaseValue, 0)
                        : recontractRow
                          ? `${row.currentBaseValue.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}x`
                          : formatCurrency(row.currentBaseValue)}
                    </td>
                    <td>
                      {accessoryRow
                        ? formatPercent(row.projectedBaseValue, 0)
                        : recontractRow
                          ? `${row.projectedBaseValue.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}x`
                          : formatCurrency(row.projectedBaseValue)}
                    </td>
                    <td>{formatCurrency(row.currentReward)}</td>
                    <td>{formatCurrency(row.projectedReward)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>Toplam</th>
                <td>{formatPercent(summary.metrics.recontract.actualTempo)}</td>
                <td>{formatPercent(summary.metrics.recontract.projectedTempo)}</td>
                <td>-</td>
                <td>-</td>
                <td>{formatCurrency(summary.currentCoreBaseTotal)}</td>
                <td>{formatCurrency(summary.projectedCoreBaseTotal)}</td>
                <td>{formatCurrency(summary.currentPrimeTotal)}</td>
                <td>{formatCurrency(summary.projectedPrimeTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head web-kontor-section-head">
          <div>
            <h2 className="goal-panel-title">Kategori Tempo Ozetleri</h2>
            <p className="goal-panel-subtitle">Hedef, gerceklesen ve ay sonu pace verileri kategori bazinda listelenir.</p>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="goal-company-trend-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Hedef</th>
                <th>Gerceklesen</th>
                <th>Ay Sonu Ongorusu</th>
                <th>Su An Tempo</th>
                <th>Ay Sonu Tempo</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(summary.metrics).map((metric) => (
                <tr key={`manager-prime-metric-${metric.key}`}>
                  <th>{metric.label}</th>
                  <td>{metric.target ? formatNumber(metric.target) : "-"}</td>
                  <td>{formatNumber(metric.actual)}</td>
                  <td>{formatNumber(metric.projected)}</td>
                  <td>{formatPercent(metric.actualTempo)}</td>
                  <td>{formatPercent(metric.projectedTempo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
