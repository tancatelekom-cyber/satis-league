import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { createClient } from "@/lib/supabase/server";
import { CashDepotRow, buildDistinctOptions, fetchCashDepotRows, fetchDevicePriceRows } from "@/lib/device-price-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DevicePriceListPageProps = {
  searchParams?: Promise<{
    mode?: string;
    category?: string;
    subcategory?: string;
    brand?: string;
    model?: string;
    product?: string;
  }>;
};

function buildHref(paramsInput: {
  mode?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  model?: string;
  product?: string;
}) {
  const params = new URLSearchParams();
  if (paramsInput.mode) params.set("mode", paramsInput.mode);
  if (paramsInput.category) params.set("category", paramsInput.category);
  if (paramsInput.subcategory) params.set("subcategory", paramsInput.subcategory);
  if (paramsInput.brand) params.set("brand", paramsInput.brand);
  if (paramsInput.model) params.set("model", paramsInput.model);
  if (paramsInput.product) params.set("product", paramsInput.product);
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
  const selectedMode = String(params?.mode ?? "temlikli").trim() || "temlikli";
  const selectedCategory = String(params?.category ?? "").trim();
  const selectedSubCategory = String(params?.subcategory ?? "").trim();
  const selectedBrand = String(params?.brand ?? "").trim();
  const selectedModel = String(params?.model ?? "").trim();
  const selectedProduct = String(params?.product ?? "").trim();

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

  const canViewCashDepotCost = profile.role === "admin" || profile.role === "management";
  const canExportCashDepot = canViewCashDepotCost;

  const isTemlikliMode = selectedMode !== "nakit-depo";

  let allRows = [] as Awaited<ReturnType<typeof fetchDevicePriceRows>>;
  let fetchError = "";
  if (isTemlikliMode) {
    try {
      allRows = await fetchDevicePriceRows();
    } catch (error) {
      fetchError = error instanceof Error ? error.message : "Cihaz listesi okunamadi.";
      allRows = [];
    }
  }

  const categoryOptions = buildDistinctOptions(allRows.map((item) => item.category));
  const categoryRows = selectedCategory ? allRows.filter((item) => item.category === selectedCategory) : allRows;
  const brandOptions = buildDistinctOptions(categoryRows.map((item) => item.brand));
  const effectiveBrand = selectedBrand && brandOptions.includes(selectedBrand) ? selectedBrand : "";
  const brandRows = effectiveBrand ? categoryRows.filter((item) => item.brand === effectiveBrand) : [];
  const productOptions = buildDistinctOptions(brandRows.map((item) => item.productName));
  const effectiveProduct = selectedProduct && productOptions.includes(selectedProduct) ? selectedProduct : "";
  const filteredRowsRaw = effectiveProduct
    ? brandRows.filter((item) => item.productName === effectiveProduct)
    : brandRows;
  const filteredRows = sortDeviceRows(filteredRowsRaw);
  const showDetailTable = Boolean(effectiveProduct);

  let cashDepotRows: CashDepotRow[] = [];
  let cashDepotError = "";
  if (!isTemlikliMode) {
    try {
      cashDepotRows = await fetchCashDepotRows();
    } catch (error) {
      cashDepotError = error instanceof Error ? error.message : "Nakit Depo listesi okunamadi.";
      cashDepotRows = [];
    }
  }

  const cashCategoryOptions = buildDistinctOptions(cashDepotRows.map((item) => item.category));
  const effectiveCashCategory =
    selectedCategory && cashCategoryOptions.includes(selectedCategory) ? selectedCategory : "";
  const cashCategoryRows = effectiveCashCategory
    ? cashDepotRows.filter((item) => item.category === effectiveCashCategory)
    : [];
  const cashSubCategoryOptions = buildDistinctOptions(cashCategoryRows.map((item) => item.subCategory));
  const effectiveCashSubCategory =
    selectedSubCategory && cashSubCategoryOptions.includes(selectedSubCategory) ? selectedSubCategory : "";
  const cashSubCategoryRows = effectiveCashSubCategory
    ? cashCategoryRows.filter((item) => item.subCategory === effectiveCashSubCategory)
    : cashCategoryRows;
  const cashBrandOptions = buildDistinctOptions(cashSubCategoryRows.map((item) => item.brand));
  const effectiveCashBrand = selectedBrand && cashBrandOptions.includes(selectedBrand) ? selectedBrand : "";
  const cashBrandRows = effectiveCashBrand
    ? cashSubCategoryRows.filter((item) => item.brand === effectiveCashBrand)
    : cashSubCategoryRows;
  const cashModelOptions = buildDistinctOptions(cashBrandRows.map((item) => item.model));
  const effectiveCashModel = selectedModel && cashModelOptions.includes(selectedModel) ? selectedModel : "";
  const filteredCashRows = effectiveCashModel
    ? cashBrandRows.filter((item) => item.model === effectiveCashModel)
    : cashBrandRows;

  return (
    <main>
      <h1 className="page-title">Cihaz Fiyat Listesi</h1>

      <div className="device-mode-row">
        <a
          className={`device-mode-button ${isTemlikliMode ? "device-mode-button-active" : ""}`}
          href={buildHref({ mode: "temlikli" })}
        >
          Temlikli Urunler
        </a>
        <a
          className={`device-mode-button ${!isTemlikliMode ? "device-mode-button-active" : ""}`}
          href={buildHref({ mode: "nakit-depo" })}
        >
          Nakit Depo
        </a>
      </div>

      {!isTemlikliMode ? (
        <>
          <section className="guide-card game-brief-card">
            {canExportCashDepot ? (
              <div className="detail-page-head">
                <div />
                <a
                  className="button-secondary export-link-button"
                  href={buildHref({
                    mode: selectedMode,
                    category: effectiveCashCategory,
                    subcategory: effectiveCashSubCategory,
                    brand: effectiveCashBrand,
                    model: effectiveCashModel
                  }).replace("/cihaz-fiyat-listesi", "/cihaz-fiyat-listesi/nakit-depo-excel")}
                >
                  Excel'e Indir
                </a>
              </div>
            ) : null}

            <div className="league-filter-grid">
              <div className="league-filter-item">
                <span className="league-filter-label">Kategori</span>
                <FilterSelectNav
                  ariaLabel="Nakit Depo kategori secimi"
                  value={buildHref({
                    mode: selectedMode,
                    category: effectiveCashCategory,
                    subcategory: effectiveCashSubCategory,
                    brand: effectiveCashBrand,
                    model: effectiveCashModel
                  })}
                  options={[
                    { value: buildHref({ mode: selectedMode }), label: "Kategori secin" },
                    ...cashCategoryOptions.map((category) => ({
                      value: buildHref({ mode: selectedMode, category }),
                      label: category
                    }))
                  ]}
                />
              </div>

              <div className="league-filter-item">
                <span className="league-filter-label">Alt Kategori</span>
                <FilterSelectNav
                  ariaLabel="Nakit Depo alt kategori secimi"
                  value={buildHref({
                    mode: selectedMode,
                    category: effectiveCashCategory,
                    subcategory: effectiveCashSubCategory,
                    brand: effectiveCashBrand,
                    model: effectiveCashModel
                  })}
                  options={[
                    {
                      value: buildHref({ mode: selectedMode, category: effectiveCashCategory }),
                      label: effectiveCashCategory ? "Tum Alt Kategoriler" : "Once kategori secin"
                    },
                    ...cashSubCategoryOptions.map((subCategory) => ({
                      value: buildHref({ mode: selectedMode, category: effectiveCashCategory, subcategory: subCategory }),
                      label: subCategory
                    }))
                  ]}
                />
              </div>

              <div className="league-filter-item">
                <span className="league-filter-label">Marka</span>
                <FilterSelectNav
                  ariaLabel="Nakit Depo marka secimi"
                  value={buildHref({
                    mode: selectedMode,
                    category: effectiveCashCategory,
                    subcategory: effectiveCashSubCategory,
                    brand: effectiveCashBrand,
                    model: effectiveCashModel
                  })}
                  options={[
                    {
                      value: buildHref({
                        mode: selectedMode,
                        category: effectiveCashCategory,
                        subcategory: effectiveCashSubCategory
                      }),
                  label: effectiveCashSubCategory ? "Tum Markalar" : "Once alt kategori secin"
                    },
                    ...cashBrandOptions.map((brand) => ({
                      value: buildHref({
                        mode: selectedMode,
                        category: effectiveCashCategory,
                        subcategory: effectiveCashSubCategory,
                        brand
                      }),
                      label: brand
                    }))
                  ]}
                />
              </div>

              <div className="league-filter-item">
                <span className="league-filter-label">Model</span>
                <FilterSelectNav
                  ariaLabel="Nakit Depo model secimi"
                  value={buildHref({
                    mode: selectedMode,
                    category: effectiveCashCategory,
                    subcategory: effectiveCashSubCategory,
                    brand: effectiveCashBrand,
                    model: effectiveCashModel
                  })}
                  options={[
                    {
                      value: buildHref({
                        mode: selectedMode,
                        category: effectiveCashCategory,
                        subcategory: effectiveCashSubCategory,
                        brand: effectiveCashBrand
                      }),
                      label: effectiveCashSubCategory ? "Tum Modeller" : "Once alt kategori secin"
                    },
                    ...cashModelOptions.map((model) => ({
                      value: buildHref({
                        mode: selectedMode,
                        category: effectiveCashCategory,
                        subcategory: effectiveCashSubCategory,
                        brand: effectiveCashBrand,
                        model
                      }),
                      label: model
                    }))
                  ]}
                />
              </div>
            </div>

            {cashDepotError ? (
              <div className="notice danger" role="alert">
                <strong>Nakit Depo listesi okunamadi.</strong>
                <span>{cashDepotError}</span>
                <span>Biraz sonra tekrar deneyin. Sorun devam ederse Sheet erisimini kontrol edin.</span>
              </div>
            ) : null}
          </section>

          <section className="cash-depot-list" aria-label="Nakit Depo urunleri">
            {filteredCashRows.length === 0 ? (
              <div className="device-empty">
                {cashDepotError
                  ? "Nakit Depo listesi su an okunamiyor."
                  : effectiveCashCategory
                    ? "Seciminize uygun nakit depo urunu bulunamadi."
                    : "Listeyi gormek icin once kategori secin."}
              </div>
            ) : (
              filteredCashRows.map((item) => (
                <details key={item.id} className="cash-depot-item">
                  <summary className="cash-depot-summary">
                    <div className="cash-depot-main">
                      <strong>
                        {item.brand} {item.model}
                      </strong>
                      <span>
                        {item.color || "Renk belirtilmedi"} {item.serialNo ? `| SN: ${item.serialNo}` : ""}
                      </span>
                    </div>
                    <strong className="cash-depot-price">{formatCurrency(item.salePrice)}</strong>
                  </summary>

                  <div className="cash-depot-body">
                    <div className="cash-depot-meta-grid">
                      <div className="cash-depot-meta-box">
                        <span>Renk</span>
                        <strong>{item.color || "-"}</strong>
                      </div>
                      {canViewCashDepotCost ? (
                        <div className="cash-depot-meta-box">
                          <span>Maliyet</span>
                          <strong>{formatCurrency(item.costPrice)}</strong>
                        </div>
                      ) : null}
                      <div className="cash-depot-meta-box">
                        <span>Ek Aciklama</span>
                        <strong>{item.note || "-"}</strong>
                      </div>
                      <div className="cash-depot-meta-box">
                        <span>Seri No</span>
                        <strong>{item.serialNo || "-"}</strong>
                      </div>
                    </div>

                    <details className="cash-depot-bonus">
                      <summary>
                        <span className="cash-depot-bonus-label">Prim</span>
                      </summary>
                      <div className="cash-depot-bonus-body">{formatCurrency(item.bonus)}</div>
                    </details>
                  </div>
                </details>
              ))
            )}
          </section>
        </>
      ) : (
      <section className="guide-card game-brief-card">
        <div className="league-filter-grid">
          <div className="league-filter-item">
            <span className="league-filter-label">Kategori</span>
                <FilterSelectNav
                  ariaLabel="Cihaz kategori secimi"
              value={buildHref({
                mode: selectedMode,
                category: selectedCategory,
                brand: effectiveBrand,
                product: effectiveProduct
              })}
                  options={[
                { value: buildHref({ mode: selectedMode, brand: effectiveBrand, product: effectiveProduct }), label: "Tum Kategoriler" },
                ...categoryOptions.map((category) => ({
                  value: buildHref({ mode: selectedMode, category, brand: effectiveBrand, product: effectiveProduct }),
                  label: category
                }))
              ]}
            />
          </div>

          <div className="league-filter-item">
            <span className="league-filter-label">Marka</span>
                <FilterSelectNav
                  ariaLabel="Cihaz marka secimi"
              value={buildHref({
                mode: selectedMode,
                category: selectedCategory,
                brand: effectiveBrand,
                product: effectiveProduct
              })}
                  options={[
                { value: buildHref({ mode: selectedMode, category: selectedCategory }), label: "Marka secin" },
                ...brandOptions.map((brand) => ({
                  value: buildHref({ mode: selectedMode, category: selectedCategory, brand, product: effectiveProduct }),
                  label: brand
                }))
              ]}
            />
          </div>

          <div className="league-filter-item league-filter-item-wide">
            <span className="league-filter-label">Urun</span>
                <FilterSelectNav
                  ariaLabel="Cihaz urun secimi"
              value={buildHref({
                mode: selectedMode,
                category: selectedCategory,
                brand: effectiveBrand,
                product: effectiveProduct
              })}
                  options={[
                {
                  value: buildHref({ mode: selectedMode, category: selectedCategory, brand: effectiveBrand }),
                  label: effectiveBrand ? "Tum Urunler" : "Once marka secin"
                },
                ...productOptions.map((product) => ({
                  value: buildHref({ mode: selectedMode, category: selectedCategory, brand: effectiveBrand, product }),
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
      )}

      {isTemlikliMode ? (
      <section className="device-cards" aria-label="Cihaz kartlari">
        {filteredRows.length === 0 ? (
          <div className="device-empty">
            {fetchError
              ? "Cihaz listesi su an okunamiyor."
              : effectiveBrand
                ? "Seciminize uygun cihaz bulunamadi."
                : "Listeyi gormek icin once marka secin."}
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
      ) : null}

      {isTemlikliMode && showDetailTable ? (
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
                    {fetchError
                      ? "Cihaz listesi su an okunamiyor."
                      : effectiveBrand
                        ? "Seciminize uygun cihaz bulunamadi."
                        : "Listeyi gormek icin once marka secin."}
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
      ) : null}
    </main>
  );
}
