import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchStockManagementDashboard } from "@/lib/stock-management";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { searchParams?: Promise<{ branch?: string }> };

function number(value: number, digits = 0) {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function currency(value: number) {
  return value.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(value));
}

export default async function StockManagementPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;
  const selectedBranch = String(params?.branch ?? "").trim();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/giris");

  const { data: profile } = await supabase.from("profiles").select("approval, role").eq("id", user.id).single();
  if (!profile || profile.approval !== "approved") redirect("/hesabim");
  if (!["manager", "management", "admin"].includes(profile.role)) redirect("/");

  let dashboard: Awaited<ReturnType<typeof fetchStockManagementDashboard>> | null = null;
  let error = "";
  try {
    dashboard = await fetchStockManagementDashboard();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Stok yönetimi verileri okunamadı.";
  }

  const rows = dashboard?.rows.filter((row) => !selectedBranch || row.branchName === selectedBranch) ?? [];
  const transfers = dashboard?.transfers.filter(
    (row) => !selectedBranch || row.fromBranch === selectedBranch || row.toBranch === selectedBranch
  ) ?? [];
  const alarms = dashboard?.returnAlarms.filter((row) => !selectedBranch || row.branchName === selectedBranch) ?? [];
  const scopedTotals = {
    currentStock: rows.reduce((sum, row) => sum + row.currentStock, 0),
    sales30: rows.reduce((sum, row) => sum + row.sales30, 0),
    orderQuantity: rows.reduce((sum, row) => sum + row.orderQuantity, 0),
    transferQuantity: transfers.reduce((sum, row) => sum + row.quantity, 0),
    returnAlarmCount: alarms.reduce((sum, row) => sum + row.stockCount, 0)
  };

  return (
    <main className="page-shell stock-management-page">
      <section className="stock-management-hero">
        <div>
          <span className="stock-management-eyebrow">30 GÜNLÜK AKILLI STOK PLANI</span>
          <h1 className="page-title">Stok Yönetimi</h1>
          <p>Şube satış hızı, sipariş ihtiyacı, transfer fırsatları ve yaşlanan stoklar tek ekranda.</p>
        </div>
        <div className="stock-management-hero-badge"><strong>30</strong><span>günlük satış analizi</span></div>
      </section>

      {error ? <section className="admin-card stock-alert-card"><h2>Stok verisi açılamadı</h2><p>{error}</p></section> : null}

      {dashboard ? (
        <>
          <section className="stock-management-toolbar">
            <form method="get">
              <label>
                <span>Şube filtresi</span>
                <select name="branch" defaultValue={selectedBranch}>
                  <option value="">Tüm şubeler</option>
                  {dashboard.branches.map((branch) => <option value={branch} key={branch}>{branch}</option>)}
                </select>
              </label>
              <button type="submit">Şubeyi Göster</button>
              {selectedBranch ? <a href="/stok-bilgisi">Filtreyi Temizle</a> : null}
            </form>
            <span>Son güncelleme: {formatDate(dashboard.updatedAt)}</span>
          </section>

          <section className="stock-management-kpis">
            <article><span>📦</span><div><small>Mevcut stok</small><strong>{number(scopedTotals.currentStock)}</strong></div></article>
            <article><span>⚡</span><div><small>30 günlük satış</small><strong>{number(scopedTotals.sales30)}</strong></div></article>
            <article className="warning"><span>🛒</span><div><small>Sipariş ihtiyacı</small><strong>{number(scopedTotals.orderQuantity)}</strong></div></article>
            <article className="info"><span>⇄</span><div><small>Transfer fırsatı</small><strong>{number(scopedTotals.transferQuantity)}</strong></div></article>
            <article className="danger"><span>⏳</span><div><small>İade alarmı</small><strong>{number(scopedTotals.returnAlarmCount)}</strong></div></article>
          </section>

          <section className="stock-management-grid">
            <article className="stock-management-panel stock-management-panel-wide">
              <header><div><span>SİPARİŞ MOTORU</span><h2>30 günlük satışa göre sipariş listesi</h2></div><b>{rows.filter((row) => row.orderQuantity > 0).length} ürün</b></header>
              <div className="stock-management-table-wrap">
                <table><thead><tr><th>Şube / ürün kısa adı</th><th>Stok</th><th>30 gün satış</th><th>Devir hızı</th><th>Stok günü</th><th>Sipariş</th></tr></thead>
                  <tbody>{rows.filter((row) => row.orderQuantity > 0).slice(0, 100).map((row) => (
                    <tr key={`${row.branchName}-${row.productCode}`}>
                      <td><strong>{row.productShortName}</strong><small>{row.branchName} · {row.productCode}</small></td>
                      <td>{number(row.currentStock)}</td><td>{number(row.sales30)}</td>
                      <td><span className="stock-speed">{number(row.turnoverRate, 1)}x</span></td>
                      <td>{row.coverageDays === null ? "Satış yok" : `${number(row.coverageDays)} gün`}</td>
                      <td><b className="stock-order-badge">+{number(row.orderQuantity)}</b></td>
                    </tr>
                  ))}</tbody>
                </table>
                {!rows.some((row) => row.orderQuantity > 0) ? <p className="stock-management-empty">Sipariş açığı görünmüyor.</p> : null}
              </div>
            </article>

            <article className="stock-management-panel">
              <header><div><span>TRANSFER RADARI</span><h2>Şubeler arası dengeleme</h2></div><b>{transfers.length}</b></header>
              <div className="stock-transfer-list">{transfers.slice(0, 40).map((row, index) => (
                <div className="stock-transfer-card" key={`${row.productCode}-${row.fromBranch}-${row.toBranch}-${index}`}>
                  <strong>{row.productName}</strong><small>{row.productCode}</small>
                  <div><span>{row.fromBranch}</span><b>{row.quantity} adet →</b><span>{row.toBranch}</span></div>
                </div>
              ))}{!transfers.length ? <p className="stock-management-empty">Uygun transfer eşleşmesi yok.</p> : null}</div>
            </article>

            <article className="stock-management-panel stock-return-panel">
              <header><div><span>İADE ALARMI</span><h2>Yaşlanan stoklar</h2></div><b>{alarms.length}</b></header>
              <p className="stock-management-rule">iPhone ≥20 gün · Diğer markalar ≥30 gün</p>
              <div className="stock-return-list">{alarms.slice(0, 50).map((row) => (
                <div key={`${row.branchName}-${row.productCode}`}>
                  <span className={row.brand === "Apple iPhone" ? "apple" : "other"}>{row.brand === "Apple iPhone" ? "" : "!"}</span>
                  <p><strong>{row.productName}</strong><small>{row.branchName} · {row.stockCount} adet · {currency(row.purchaseValue)}</small></p>
                  <b>{row.oldestStockAge} gün</b>
                </div>
              ))}{!alarms.length ? <p className="stock-management-empty">İade alarmı bulunmuyor.</p> : null}</div>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
