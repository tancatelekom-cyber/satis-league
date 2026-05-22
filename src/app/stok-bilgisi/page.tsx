import { redirect } from "next/navigation";
import { fetchAymadaBranchStocks } from "@/lib/aymada-stock";
import { createClient } from "@/lib/supabase/server";
import { StockProductBrowser } from "@/components/stock/stock-product-browser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatNumber(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
}

export default async function StockInfoPage() {
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

  let stock = null as Awaited<ReturnType<typeof fetchAymadaBranchStocks>> | null;
  let error = "";

  try {
    stock = await fetchAymadaBranchStocks();
  } catch (err) {
    error = err instanceof Error ? err.message : "Stok bilgisi su an okunamadi.";
  }

  return (
    <main className="page-shell">
      <section className="hero home-leaders-hero">
        <div className="hero-copy">
          <h1 className="page-title">Stok Bilgisi</h1>
          <p className="page-subtitle">Aymada Custom API uzerinden okunan cihaz stoklari burada gorunur.</p>
        </div>
      </section>

      {error ? (
        <section className="admin-card stock-alert-card">
          <h2>Stok bilgisi acilamadi.</h2>
          <p>{error}</p>
          <p>Vercel ortam degiskenlerinde Aymada API bilgilerini tanimladiktan sonra sayfayi tekrar acin.</p>
        </section>
      ) : null}

      {stock ? (
        <>
          <section className="stock-total-grid" aria-label="Toplam stok ozeti">
            <div className="stock-total-card">
              <span>Smartphone</span>
              <strong>{formatNumber(stock.totalSmartphone)}</strong>
            </div>
            <div className="stock-total-card">
              <span>Tablet</span>
              <strong>{formatNumber(stock.totalTablet)}</strong>
            </div>
            <div className="stock-total-card">
              <span>IoT</span>
              <strong>{formatNumber(stock.totalIot)}</strong>
            </div>
            <div className="stock-total-card stock-total-card-main">
              <span>Toplam</span>
              <strong>{formatNumber(stock.total)}</strong>
            </div>
          </section>

          <section className="admin-card stock-card">
            <div className="stock-card-head">
              <div>
                <h2>Cihaz Stoklari</h2>
                <p>Son okuma: {formatUpdatedAt(stock.updatedAt)}</p>
              </div>
              <span>{stock.products.length} urun</span>
            </div>

            {stock.warning ? <p className="stock-warning">{stock.warning}</p> : null}

            {stock.debug ? (
              <details className="stock-debug">
                <summary>Aymada gelen veri ornegi</summary>
                <pre>{JSON.stringify(stock.debug, null, 2)}</pre>
              </details>
            ) : null}

            {stock.products.length > 0 ? (
              <StockProductBrowser products={stock.products} />
            ) : (
              <p className="stock-empty">Smartphone, tablet veya IoT stogu bulunamadi.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
