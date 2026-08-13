import { redirect } from "next/navigation";
import { StockMonthlySalesFilter } from "@/components/stock-monthly-sales-filter";
import { fetchStockManagementDashboard } from "@/lib/stock-management";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { searchParams?: Promise<{ brand?: string; model?: string }> };

function number(value: number) { return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 }); }

export default async function MonthlyStockSalesPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;
  const selectedBrand = String(params?.brand ?? "").trim();
  const selectedModel = String(params?.model ?? "").trim();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/giris");
  const { data: profile } = await supabase.from("profiles").select("approval, role").eq("id", user.id).single();
  if (!profile || profile.approval !== "approved") redirect("/hesabim");
  if (!["manager", "management", "admin"].includes(profile.role)) redirect("/");

  let dashboard: Awaited<ReturnType<typeof fetchStockManagementDashboard>> | null = null;
  let error = "";
  try { dashboard = await fetchStockManagementDashboard(); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Satış verileri okunamadı."; }

  const allSales = dashboard?.monthlySales ?? [];
  const brands = Array.from(new Set(allSales.map((row) => row.brand))).sort((a, b) => a.localeCompare(b, "tr"));
  const modelsByBrand: Record<string, string[]> = Object.fromEntries(brands.map((brand) => [brand, Array.from(new Set(allSales.filter((row) => row.brand === brand).map((row) => row.model))).sort((a, b) => a.localeCompare(b, "tr"))]));
  const effectiveBrand = brands.includes(selectedBrand) ? selectedBrand : "";
  const validModels = effectiveBrand ? modelsByBrand[effectiveBrand] ?? [] : [];
  const effectiveModel = validModels.includes(selectedModel) ? selectedModel : "";
  const filteredSales = allSales.filter((row) => (!effectiveBrand || row.brand === effectiveBrand) && (!effectiveModel || row.model === effectiveModel));
  const branches = Array.from(new Set(allSales.map((row) => row.branchName))).sort((a, b) => a.localeCompare(b, "tr"));
  const products = Array.from(new Map(filteredSales.map((row) => [`${row.brand}__${row.model}__${row.productShortName}`, row])).values());
  const salesMap = new Map(filteredSales.map((row) => [`${row.brand}__${row.model}__${row.productShortName}__${row.branchName}`, row.quantity]));
  const monthLabel = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date());
  const grandTotal = filteredSales.reduce((sum, row) => sum + row.quantity, 0);

  return <main className="page-shell stock-management-page stock-monthly-sales-page">
    <section className="stock-management-hero stock-monthly-sales-hero"><div><span className="stock-management-eyebrow">AYLIK ŞUBE SATIŞLARI</span><h1 className="page-title">Cihaz Satış Tablosu</h1><p>{monthLabel} dönemindeki cihaz satışları; marka, model ve cihaz kısa adı kırılımıyla şube şube gösterilir.</p></div><div className="stock-management-hero-badge"><strong>{number(grandTotal)}</strong><span>bu ay satılan cihaz</span></div></section>
    <section className="stock-management-toolbar stock-monthly-toolbar"><StockMonthlySalesFilter brands={brands} modelsByBrand={modelsByBrand} selectedBrand={effectiveBrand} selectedModel={effectiveModel} /><a href="/stok-bilgisi">Stok yönetimine dön</a></section>
    {error ? <section className="admin-card stock-alert-card"><h2>Satış tablosu açılamadı</h2><p>{error}</p></section> : null}
    {dashboard ? <section className="stock-management-panel stock-management-panel-wide"><header><div><span>MEVCUT AY</span><h2>Marka, model ve şube bazında cihaz satışları</h2></div><b>{products.length} cihaz</b></header><div className="stock-management-table-wrap"><table className="stock-matrix-table stock-monthly-sales-table">
      <thead><tr><th>Cihaz kısa adı</th><th>Marka</th><th>Model</th>{branches.map((branch) => <th key={branch}>{branch}</th>)}<th>Firma Toplamı</th></tr></thead>
      <tbody>{products.map((product) => { const productKey = `${product.brand}__${product.model}__${product.productShortName}`; const values = branches.map((branch) => salesMap.get(`${productKey}__${branch}`) ?? 0); return <tr key={productKey}><th>{product.productShortName}</th><td>{product.brand}</td><td>{product.model}</td>{values.map((value, index) => <td className={value === 0 ? "stock-muted-cell" : undefined} key={branches[index]}>{number(value)}</td>)}<td className="stock-company-total">{number(values.reduce((sum, value) => sum + value, 0))}</td></tr>; })}</tbody>
      {products.length ? <tfoot><tr><th>Şube Toplamı</th><th colSpan={2}></th>{branches.map((branch) => <th key={branch}>{number(filteredSales.filter((row) => row.branchName === branch).reduce((sum, row) => sum + row.quantity, 0))}</th>)}<th>{number(grandTotal)}</th></tr></tfoot> : null}
    </table>{!products.length ? <p className="stock-management-empty">Seçilen filtrelerde bu aya ait cihaz satışı bulunamadı.</p> : null}</div></section> : null}
  </main>;
}
