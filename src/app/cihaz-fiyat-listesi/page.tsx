import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { createClient } from "@/lib/supabase/server";
import { buildDistinctOptions, fetchDevicePriceRows } from "@/lib/device-price-list";

export const dynamic = "force-dynamic";

type DevicePriceListPageProps = {
  searchParams?: Promise<{
    category?: string;
    brand?: string;
    product?: string;
  }>;
};

function buildHref(category?: string, brand?: string, product?: string) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (brand) params.set("brand", brand);
  if (product) params.set("product", product);
  return `/cihaz-fiyat-listesi${params.size ? `?${params.toString()}` : ""}`;
}

function formatCurrency(value: number | null) {
  if (!value || value <= 0) {
    return "-";
  }

  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })} TL`;
}

function isCashContractRow(item: { monthlyInstallment: number; installmentCount: number }) {
  return item.monthlyInstallment <= 0 || item.installmentCount <= 0;
}

function sortDeviceRows<T extends { monthlyInstallment: number; installmentCount: number }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aCash = isCashContractRow(a);
    const bCash = isCashContractRow(b);

    if (aCash !== bCash) {
      return aCash ? -1 : 1;
    }

    return Number(a.installmentCount ?? 0) - Number(b.installmentCount ?? 0);
  });
}

export default async function DevicePriceListPage({ searchParams }: DevicePriceListPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedCategory = String(params?.category ?? "").trim();
  const selectedBrand = String(params?.brand ?? "").trim();
  const selectedProduct = String(params?.product ?? "").trim();

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

  let allRows = [] as Awaited<ReturnType<typeof fetchDevicePriceRows>>;
  let fetchError = "";
  try {
    allRows = await fetchDevicePriceRows();
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Cihaz listesi okunamadi.";
    allRows = [];
  }

  const categoryOptions = buildDistinctOptions(allRows.map((item) => item.category));
  const categoryRows = selectedCategory ? allRows.filter((item) => item.category === selectedCategory) : allRows;
  const brandOptions = buildDistinctOptions(categoryRows.map((item) => item.brand));
  const effectiveBrand = selectedBrand && brandOptions.includes(selectedBrand) ? selectedBrand : "";
  const brandRows = effectiveBrand ? categoryRows.filter((item) => item.brand === effectiveBrand) : categoryRows;
  const productOptions = buildDistinctOptions(brandRows.map((item) => item.productName));
  const effectiveProduct = selectedProduct && productOptions.includes(selectedProduct) ? selectedProduct : "";
  const filteredRowsRaw = effectiveProduct
    ? brandRows.filter((item) => item.productName === effectiveProduct)
    : brandRows;
  const filteredRows = sortDeviceRows(filteredRowsRaw);

  return (
    <main>
      <h1 className="page-title">Cihaz Fiyat Listesi</h1>

      <section className="guide-card game-brief-card">
        <div className="league-filter-grid">
          <div className="league-filter-item">
            <span className="league-filter-label">Kategori</span>
            <FilterSelectNav
              ariaLabel="Cihaz kategori secimi"
              value={buildHref(selectedCategory, effectiveBrand, effectiveProduct)}
              options={[
                { value: buildHref("", selectedBrand, selectedProduct), label: "Tum Kategoriler" },
                ...categoryOptions.map((category) => ({
                  value: buildHref(category, selectedBrand, selectedProduct),
                  label: category
                }))
              ]}
            />
          </div>

          <div className="league-filter-item">
            <span className="league-filter-label">Marka</span>
            <FilterSelectNav
              ariaLabel="Cihaz marka secimi"
              value={buildHref(selectedCategory, effectiveBrand, effectiveProduct)}
              options={[
                { value: buildHref(selectedCategory, "", selectedProduct), label: "Tum Markalar" },
                ...brandOptions.map((brand) => ({
                  value: buildHref(selectedCategory, brand, selectedProduct),
                  label: brand
                }))
              ]}
            />
          </div>

          <div className="league-filter-item league-filter-item-wide">
            <span className="league-filter-label">Urun</span>
            <FilterSelectNav
              ariaLabel="Cihaz urun secimi"
              value={buildHref(selectedCategory, effectiveBrand, effectiveProduct)}
              options={[
                { value: buildHref(selectedCategory, effectiveBrand, ""), label: "Tum Urunler" },
                ...productOptions.map((product) => ({
                  value: buildHref(selectedCategory, effectiveBrand, product),
                  label: product
                }))
              ]}
            />
          </div>
        </div>

        {fetchError ? (
          <div className="notice danger" role="alert">
            <strong>Cihaz listesi okunamadi.</strong>
            <span>{fetchError}</span>
            <span>Biraz sonra tekrar deneyin. Sorun devam ederse Sheet erisimini kontrol edin.</span>
          </div>
        ) : null}
      </section>

      <section className="device-cards" aria-label="Cihaz kartlari">
        {filteredRows.length === 0 ? (
          <div className="device-empty">
            {fetchError ? "Cihaz listesi su an okunamiyor." : "Seciminize uygun cihaz bulunamadi."}
          </div>
        ) : (
          filteredRows.map((item) =>
            isCashContractRow(item) ? (
              <article key={item.id} className="device-cash-row">
                <strong>{item.productName}</strong>
                <span>Pesine Kontrat: {formatCurrency(item.contractCashPrice ?? item.totalPayable)}</span>
              </article>
            ) : (
              <article key={item.id} className="device-card">
                <div className="device-card-top">
                  <div className="device-card-title">
                    <strong>{item.productName}</strong>
                    <span className="device-card-meta">
                      {item.brand} {item.category ? `â€¢ ${item.category}` : ""}
                    </span>
                  </div>
                  <div className="device-card-total">
                    <span className="subtle">Toplam</span>
                    <strong>{formatCurrency(item.totalPayable)}</strong>
                  </div>
                </div>

                <div className="device-card-grid">
                  <div className="device-card-kv">
                    <span className="subtle">Taksit Sayisi</span>
                    <strong>{item.installmentCount > 0 ? `${item.installmentCount} Ay` : "-"}</strong>
                  </div>
                  <div className="device-card-kv">
                    <span className="subtle">Taksit Tutari</span>
                    <strong>{formatCurrency(item.monthlyInstallment)}</strong>
                  </div>
                  <div className="device-card-kv">
                    <span className="subtle">Toplam Tutar</span>
                    <strong>{formatCurrency(item.totalPayable)}</strong>
                  </div>
                </div>
              </article>
            )
          )
        )}
      </section>

      <section className="season-entry-table-wrap">
        <table className="season-entry-table device-price-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Marka</th>
              <th>Urun Adi</th>
              <th>Pesine Kontrat</th>
              <th>Taksit Sayisi</th>
              <th>Aylik Taksit</th>
              <th>Toplam Odenecek</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td className="device-empty-row" colSpan={7}>
                  {fetchError ? "Cihaz listesi su an okunamiyor." : "Seciminize uygun cihaz bulunamadi."}
                </td>
              </tr>
            ) : (
              filteredRows.map((item) => (
                <tr key={item.id}>
                  <td>{item.category}</td>
                  <td>{item.brand}</td>
                  <td>
                    <strong>{item.productName}</strong>
                  </td>
                  <td>{formatCurrency(item.contractCashPrice)}</td>
                  <td>{item.installmentCount > 0 ? `${item.installmentCount} Ay` : "-"}</td>
                  <td>{isCashContractRow(item) ? "Pesin/Kontrat" : formatCurrency(item.monthlyInstallment)}</td>
                  <td>
                    <strong>{formatCurrency(item.totalPayable)}</strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
