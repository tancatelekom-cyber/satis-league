import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchStockManagementDashboard } from "@/lib/stock-management";
import { StockBranchFilter } from "@/components/stock-branch-filter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { searchParams?: Promise<{ branch?: string; product?: string; view?: string }> };

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
  const selectedProduct = String(params?.product ?? "").trim();
  const showAllStock = params?.view === "all";
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

  const rows = dashboard?.rows.filter((row) =>
    (!selectedBranch || row.branchName === selectedBranch) && (!selectedProduct || row.productShortName === selectedProduct)
  ) ?? [];
  const products = Array.from(new Set((dashboard?.rows ?? []).map((row) => row.productShortName))).sort((a, b) => a.localeCompare(b, "tr"));
  const stockBranches = selectedBranch ? [selectedBranch] : dashboard?.branches ?? [];
  const stockProducts = selectedProduct ? [selectedProduct] : products;
  const stockByProductBranch = new Map(
    (dashboard?.rows ?? []).map((row) => [`${row.productShortName}__${row.branchName}`, row.currentStock])
  );
  const transfers = dashboard?.transfers.filter(
    (row) => !selectedBranch || row.fromBranch === selectedBranch || row.toBranch === selectedBranch
  ) ?? [];
  const alarms = dashboard?.returnAlarms.filter((row) => !selectedBranch || row.branchName === selectedBranch) ?? [];
  const expiredReturns = dashboard?.expiredReturns.filter((row) => !selectedBranch || row.branchName === selectedBranch) ?? [];
  const scopedTotals = {
    currentStock: rows.reduce((sum, row) => sum + row.currentStock, 0),
    sales30: rows.reduce((sum, row) => sum + row.sales30, 0),
    orderQuantity: rows.reduce((sum, row) => sum + row.orderQuantity, 0),
    transferQuantity: transfers.reduce((sum, row) => sum + row.quantity, 0),
    returnAlarmCount: alarms.reduce((sum, row) => sum + row.stockCount, 0),
    expiredReturnCount: expiredReturns.reduce((sum, row) => sum + row.stockCount, 0)
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
            <div className="stock-management-filter">
              <StockBranchFilter branches={dashboard.branches} selectedBranch={selectedBranch} products={products} selectedProduct={selectedProduct} view={showAllStock ? "all" : ""} />
              <a href={showAllStock ? "/stok-bilgisi" : "/stok-bilgisi?view=all"}>{showAllStock ? "Stok Planına Dön" : "Tüm Stoğu Göster"}</a>
            </div>
            <span>Son güncelleme: {formatDate(dashboard.updatedAt)}</span>
          </section>

          <section className="stock-management-kpis">
            <article><span>📦</span><div><small>Mevcut stok</small><strong>{number(scopedTotals.currentStock)}</strong></div></article>
            <article><span>⚡</span><div><small>30 günlük satış</small><strong>{number(scopedTotals.sales30)}</strong></div></article>
            <article className="warning"><span>🛒</span><div><small>7 günlük sipariş</small><strong>{number(scopedTotals.orderQuantity)}</strong></div></article>
            <article className="info"><span>⇄</span><div><small>Transfer fırsatı</small><strong>{number(scopedTotals.transferQuantity)}</strong></div></article>
            <article className="danger"><span>⏳</span><div><small>İade alarmı</small><strong>{number(scopedTotals.returnAlarmCount)}</strong></div></article>
            <article className="expired"><span>⌛</span><div><small>İade süresi geçmiş</small><strong>{number(scopedTotals.expiredReturnCount)}</strong></div></article>
          </section>

          {showAllStock ? (
            <section className="stock-management-panel stock-management-panel-wide">
              <header><div><span>TÜM STOK MATRİSİ</span><h2>Ürün ve şube bazında mevcut stoklar</h2></div><b>{stockProducts.length} ürün</b></header>
              <div className="stock-management-table-wrap"><table className="stock-matrix-table">
                <thead><tr><th>Ürün kısa adı</th>{stockBranches.map((branch) => <th key={branch}>{branch}</th>)}<th>Firma Toplamı</th></tr></thead>
                <tbody>{stockProducts.map((product) => {
                  const branchValues = stockBranches.map((branch) => stockByProductBranch.get(`${product}__${branch}`) ?? 0);
                  const companyTotal = dashboard.branches.reduce((sum, branch) => sum + (stockByProductBranch.get(`${product}__${branch}`) ?? 0), 0);
                  return <tr key={product}><th>{product}</th>{branchValues.map((value, index) => <td className={value === 0 ? "stock-zero-cell" : undefined} key={stockBranches[index]}>{number(value)}</td>)}<td className="stock-company-total">{number(companyTotal)}</td></tr>;
                })}</tbody>
                <tfoot><tr><th>Firma Dip Toplamı</th>{stockBranches.map((branch) => {
                  const total = stockProducts.reduce((sum, product) => sum + (stockByProductBranch.get(`${product}__${branch}`) ?? 0), 0);
                  return <th className={total === 0 ? "stock-zero-cell" : undefined} key={branch}>{number(total)}</th>;
                })}<th>{number(stockProducts.reduce((grand, product) => grand + dashboard.branches.reduce((sum, branch) => sum + (stockByProductBranch.get(`${product}__${branch}`) ?? 0), 0), 0))}</th></tr></tfoot>
              </table>{!stockProducts.length ? <p className="stock-management-empty">Filtreye uygun stok bulunamadı.</p> : null}</div>
            </section>
          ) : <section className="stock-management-grid">
            <article className="stock-management-panel stock-management-panel-wide">
              <header><div><span>İHTİYAÇ PLANI</span><h2>7 günlük ihtiyaç, transfer ve sipariş planı</h2></div><b>{rows.filter((row) => row.grossNeed > 0).length} ürün</b></header>
              <div className="stock-management-table-wrap">
                <table><thead><tr><th>Şube / ürün kısa adı</th><th>Stok</th><th>30 gün satış</th><th>Toplam ihtiyaç</th><th>Transfer al</th><th>Sipariş ver</th></tr></thead>
                  <tbody>{rows.filter((row) => row.grossNeed > 0).map((row) => (
                    <tr key={`${row.branchName}-${row.productCode}`}>
                      <td><strong>{row.productShortName}</strong><small>{row.branchName} · {row.productCode}</small></td>
                      <td>{number(row.currentStock)}</td><td>{number(row.sales30)}</td>
                      <td><b>{number(row.grossNeed)}</b></td>
                      <td>{row.transferIncoming > 0 ? <details className="stock-transfer-detail"><summary>{number(row.transferIncoming)} adet</summary><div>{transfers.filter((item) => item.toBranch === row.branchName && item.productCode === row.productCode).map((item, index) => <span key={`${item.fromBranch}-${index}`}>{item.fromBranch}: <b>{item.quantity} adet</b></span>)}</div></details> : "—"}</td>
                      <td><b className="stock-order-badge">+{number(row.orderQuantity)}</b></td>
                    </tr>
                  ))}</tbody>
                  {rows.some((row) => row.grossNeed > 0) ? (
                    <tfoot><tr><th>Firma dış sipariş toplamı</th><th colSpan={4}></th><th>{number(scopedTotals.orderQuantity)} adet</th></tr></tfoot>
                  ) : null}
                </table>
                {!rows.some((row) => row.grossNeed > 0) ? <p className="stock-management-empty">Stok ihtiyacı görünmüyor.</p> : null}
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
              <header>
                <div><span>İADE ALARMI</span><h2>Yaşlanan stoklar</h2></div>
                <div className="stock-return-actions">
                  <b>{alarms.length}</b>
                  <a
                    className="stock-excel-button"
                    href={`/stok-bilgisi/iade-excel${selectedBranch ? `?branch=${encodeURIComponent(selectedBranch)}` : ""}`}
                    title="İade listesini Excel'e indir"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 3h10a2 2 0 0 1 2 2v3h3a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm12 7v9h2v-9h-2ZM6.2 8l2.15 3.5L6 15h2.35l1.25-2.1 1.25 2.1h2.35l-2.35-3.5L13 8h-2.35L9.6 9.9 8.55 8H6.2Z" />
                    </svg>
                    <span>İade Excel</span>
                  </a>
                </div>
              </header>
              <p className="stock-management-rule">iPhone 20–60 gün · Diğer markalar 30–60 gün</p>
              <div className="stock-return-list">{alarms.slice(0, 50).map((row) => (
                <div key={`${row.branchName}-${row.productCode}`}>
                  <span className={row.brand === "Apple iPhone" ? "apple" : "other"}>{row.brand === "Apple iPhone" ? "" : "!"}</span>
                  <p><strong>{row.productName}</strong><small>{row.branchName} · {row.stockCount} adet · {currency(row.purchaseValue)}</small></p>
                  <b>{row.oldestStockAge} gün</b>
                </div>
              ))}{!alarms.length ? <p className="stock-management-empty">İade alarmı bulunmuyor.</p> : null}</div>
            </article>

            <article className="stock-management-panel stock-expired-panel">
              <header><div><span>SÜRESİ GEÇMİŞ</span><h2>60 gün üzeri elde kalanlar</h2></div><b>{expiredReturns.reduce((sum, row) => sum + row.stockCount, 0)} adet</b></header>
              <p className="stock-management-rule stock-expired-rule">Bu ürünler aktif iade alarmına dahil edilmez.</p>
              <div className="stock-return-list stock-expired-list">{expiredReturns.slice(0, 100).map((row) => (
                <div key={`${row.branchName}-${row.productCode}`}>
                  <span>60+</span>
                  <p><strong>{row.productName}</strong><small>{row.branchName} · {row.stockCount} adet · {currency(row.purchaseValue)}</small></p>
                  <b>{row.oldestStockAge} gün</b>
                </div>
              ))}{!expiredReturns.length ? <p className="stock-management-empty">60 gün üzeri ürün bulunmuyor.</p> : null}</div>
            </article>
          </section>}
        </>
      ) : null}
    </main>
  );
}
