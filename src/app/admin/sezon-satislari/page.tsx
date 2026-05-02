import {
  deleteSeasonSaleAction,
  saveSeasonTableRowAction,
  updateSeasonSaleAction
} from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type SeasonSalesPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
    saleSearch?: string;
    saleDateFrom?: string;
    saleDateTo?: string;
    saleMonth?: string;
    saleCategory?: string;
    entryMonth?: string;
  }>;
};

export default async function SeasonSalesPage({ searchParams }: SeasonSalesPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData(params);

  return (
    <main>
      <h1 className="page-title">Sezon Satislari</h1>
      <p className="page-subtitle">
        Sezon puanlarini sadece admin girer. Ay secin, o aya ait veriyi tabloda gorun ve ay boyunca ayni tabloyu tekrar tekrar guncelleyin.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/sezon-satislari" />

      <section className="admin-stack">
        <article className="admin-card">
          <h3>Sezon Satis Girisi</h3>
          {data.activeSeason ? (
            <div className="message-box success-box">
              Aktif sezon hazir: <strong>{data.activeSeason.name}</strong>. Satislari bu ekranin altindan girebilirsiniz.
            </div>
          ) : (
            <div className="message-box error-box">
              Henuz aktif sezon secilmedigi icin satis girisi acilmiyor. Once{" "}
              <a href="/admin/sezonlar">Sezon Yonetimi</a> sayfasindan bir sezonu aktif yapin.
            </div>
          )}

          {data.activeSeason ? (
            <div className="season-entry-shell">
              <div className="season-entry-summary">
                <div className="season-entry-chip">
                  <span>Aktif Sezon</span>
                  <strong>{data.activeSeason.name}</strong>
                </div>
                <div className="season-entry-chip">
                  <span>Yaris Tipi</span>
                  <strong>{data.activeSeason.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}</strong>
                </div>
                <div className="season-entry-chip">
                  <span>Olcum</span>
                  <strong>{data.activeSeason.scoring === "points" ? "Puan" : "Adet"}</strong>
                </div>
                <div className="season-entry-chip">
                  <span>Urun Sayisi</span>
                  <strong>{data.activeSeasonProducts.length}</strong>
                </div>
              </div>

              <div className="campaign-layout">
                <article className="campaign-card">
                  <h4>
                    {data.activeSeason.mode === "employee"
                      ? "Calisanlar Icin Aylik Sezon Tablosu"
                      : "Magazalar Icin Aylik Sezon Tablosu"}
                  </h4>
                  <p className="season-entry-tip">
                    Isimleri secmeyin; satirlarin karsisina o ayin rakamlarini yazin. Tekrar geldiginde ayni ayin mevcut verisi tabloda dolu gelir.
                  </p>

                  <form className="admin-form" method="get">
                    <div className="auth-grid">
                      <label className="field">
                        <span>Calisacaginiz Ay</span>
                        <input defaultValue={data.entryMonth} name="entryMonth" required type="month" />
                      </label>
                      <label className="field">
                        <span>Aktif Sezon</span>
                        <input disabled value={data.activeSeason.name} />
                      </label>
                      <label className="field">
                        <span>Yaris Tipi</span>
                        <input
                          disabled
                          value={data.activeSeason.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}
                        />
                      </label>
                    </div>
                    <div className="auth-actions">
                      <button className="tiny-button approve" type="submit">
                        Ayi Ac
                      </button>
                    </div>
                  </form>

                  {data.seasonMonthOptions.length > 0 ? (
                    <div className="filter-chip-row">
                      {data.seasonMonthOptions.map((month) => (
                        <a
                          key={month.value}
                          className={`filter-chip ${data.entryMonth === month.value ? "active" : ""}`}
                          href={`/admin/sezon-satislari?entryMonth=${month.value}`}
                        >
                          {month.label}
                        </a>
                      ))}
                    </div>
                  ) : null}

                  <div className="season-entry-table-wrap">
                    <table className="season-entry-table">
                      <thead>
                        <tr>
                          <th>{data.activeSeason.mode === "employee" ? "Calisan" : "Magaza"}</th>
                          {data.activeSeasonProducts.map((product) => (
                            <th key={product.id}>
                              <span>{product.name}</span>
                              <small>{product.category_name}</small>
                            </th>
                          ))}
                          <th>Kaydet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.seasonEntryTargets.map((target) => (
                          <tr key={target.id}>
                            <td>
                              <strong>{target.label}</strong>
                              <small>{target.secondary}</small>
                            </td>
                            <td colSpan={data.activeSeasonProducts.length + 1}>
                              <form action={saveSeasonTableRowAction} className="season-entry-row-form">
                                <input name="redirectTo" type="hidden" value="/admin/sezon-satislari" />
                                <input name="seasonId" type="hidden" value={data.activeSeason?.id ?? ""} />
                                <input name="targetId" type="hidden" value={target.id} />
                                <input name="entryMonth" type="hidden" value={data.entryMonth} />
                                <div className="season-entry-row-grid">
                                  {data.activeSeasonProducts.map((product) => (
                                    <label key={product.id} className="season-entry-cell">
                                      <span>{product.name}</span>
                                      <input
                                        defaultValue={data.monthQuantityMap.get(`${target.id}__${product.id}`) ?? 0}
                                        min="0"
                                        name={`qty__${product.id}`}
                                        type="number"
                                      />
                                    </label>
                                  ))}
                                  <button className="tiny-button approve season-entry-save" type="submit">
                                    Satiri Kaydet
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article className="campaign-card">
                  <h4>Sezon Kurallari</h4>
                    <div className="step-list">
                      <div className="step-item">
                        <strong>Kategoriler</strong>
                        <span>{data.activeSeasonCategories.join(", ") || "Genel"}</span>
                      </div>
                      <div className="step-item">
                        <strong>Sezon Tipi</strong>
                        <span>{data.activeSeason.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}</span>
                    </div>
                    <div className="step-item">
                      <strong>Olcum Tipi</strong>
                      <span>{data.activeSeason.scoring === "points" ? "Puan" : "Adet"}</span>
                    </div>
                    <div className="step-item">
                      <strong>Magaza Carpanlari</strong>
                      <span>
                        {data.seasonMultiplierRows
                          .filter((item) => item.season_id === data.activeSeason?.id)
                          .map((item) => `${item.store?.name ?? "Magaza"} x${item.multiplier}`)
                          .join(", ") || "Varsayilan 1.00"}
                      </span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          ) : null}
        </article>

        {data.activeSeason ? (
          <article className="admin-card">
            <h3>Son Sezon Girisleri</h3>

            <form className="admin-form" method="get">
              <div className="auth-grid">
                <label className="field compact">
                  <span>Ay Filtresi</span>
                  <input defaultValue={data.saleMonth} name="saleMonth" type="month" />
                </label>
                <label className="field compact">
                  <span>Kategori</span>
                  <select defaultValue={data.saleCategory} name="saleCategory">
                    <option value="">Tum kategoriler</option>
                    {data.activeSeasonCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field compact">
                  <span>Arama</span>
                  <input
                    defaultValue={params?.saleSearch ?? ""}
                    name="saleSearch"
                    placeholder="Urun, calisan, magaza veya not"
                  />
                </label>
                <label className="field compact">
                  <span>Tarih Baslangic</span>
                  <input defaultValue={data.saleDateFrom} name="saleDateFrom" type="date" />
                </label>
                <label className="field compact">
                  <span>Tarih Bitis</span>
                  <input defaultValue={data.saleDateTo} name="saleDateTo" type="date" />
                </label>
              </div>
              <div className="auth-actions">
                <button className="tiny-button approve" type="submit">
                  Listeyi Filtrele
                </button>
                <a className="tiny-button" href="/admin/sezon-satislari">
                  Filtreyi Temizle
                </a>
              </div>
            </form>

            <div className="profile-summary">
              <div className="summary-card">
                <span>Kayit Sayisi</span>
                <strong>{data.filteredSeasonSummary.count}</strong>
              </div>
              <div className="summary-card">
                <span>Toplam Miktar</span>
                <strong>{data.filteredSeasonSummary.quantity}</strong>
              </div>
              <div className="summary-card">
                <span>Toplam Ham Deger</span>
                <strong>{data.filteredSeasonSummary.rawScore.toFixed(2)}</strong>
              </div>
              <div className="summary-card">
                <span>Toplam Sezon Puani</span>
                <strong>{data.filteredSeasonSummary.score.toFixed(2)}</strong>
              </div>
            </div>

            <div className="approval-list">
              {data.filteredActiveSeasonSales.length === 0 ? (
                <div className="step-item">
                  <strong>Kayit bulunamadi</strong>
                  <span>Filtreyi degistirin veya yeni sezon satisi girin.</span>
                </div>
              ) : (
                data.filteredActiveSeasonSales.map((sale) => (
                  <div key={sale.id} className="approval-row">
                    <div>
                      <h4>{sale.product_name}</h4>
                      <p>
                        {data.activeSeason?.mode === "employee"
                          ? sale.targetProfile?.full_name ?? "Calisan"
                          : sale.targetStore?.name ?? "Magaza"}
                      </p>
                      <p className="subtle">
                        Tarih: {sale.entry_date} | Kategori:{" "}
                        {data.activeSeasonProducts.find((product) => product.id === sale.product_id)?.category_name ??
                          "Genel"}
                      </p>
                      <p className="subtle">
                        Miktar: {sale.quantity} | Ham: {Number(sale.raw_score).toFixed(2)} | Puan:{" "}
                        {Number(sale.score).toFixed(2)}
                      </p>
                    </div>

                    <div className="campaign-manage-card">
                      <form action={updateSeasonSaleAction} className="admin-form">
                        <input name="redirectTo" type="hidden" value="/admin/sezon-satislari" />
                        <input name="saleId" type="hidden" value={sale.id} />
                        <input name="seasonId" type="hidden" value={data.activeSeason?.id ?? ""} />

                        <div className="auth-grid">
                          <label className="field compact">
                            <span>Ay</span>
                            <input defaultValue={sale.entry_date.slice(0, 7)} name="entryDate" required type="month" />
                          </label>

                          <label className="field compact">
                            <span>Urun</span>
                            <select defaultValue={sale.product_id ?? ""} name="productId" required>
                              {data.activeSeasonProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} / {product.category_name}
                                </option>
                              ))}
                            </select>
                          </label>

                          {data.activeSeason?.mode === "employee" ? (
                            <label className="field compact">
                              <span>Calisan</span>
                              <select defaultValue={sale.target_profile_id ?? ""} name="targetProfileId" required>
                                <option value="">Calisan secin</option>
                                {data.approvedProfilesForSeason.map((profile) => (
                                  <option key={profile.id} value={profile.id}>
                                    {profile.full_name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label className="field compact">
                              <span>Magaza</span>
                              <select defaultValue={sale.target_store_id ?? ""} name="targetStoreId" required>
                                <option value="">Magaza secin</option>
                                {data.storeRows.filter((store) => store.is_active).map((store) => (
                                  <option key={store.id} value={store.id}>
                                    {store.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}

                          <label className="field compact">
                            <span>Miktar</span>
                            <input defaultValue={sale.quantity} min="1" name="quantity" type="number" />
                          </label>
                        </div>

                        <label className="field compact">
                          <span>Not</span>
                          <input defaultValue={sale.note ?? ""} name="note" />
                        </label>

                        <div className="campaign-manage-actions">
                          <button className="tiny-button approve" type="submit">
                            Guncelle
                          </button>
                        </div>
                      </form>

                      <div className="campaign-manage-actions">
                        <div className="store-status">
                          <span>Kayit Zamani</span>
                          <strong>{new Date(sale.created_at).toLocaleString("tr-TR")}</strong>
                        </div>

                        <form action={deleteSeasonSaleAction}>
                          <input name="redirectTo" type="hidden" value="/admin/sezon-satislari" />
                          <input name="saleId" type="hidden" value={sale.id} />
                          <button className="tiny-button danger" type="submit">
                            Sil
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
