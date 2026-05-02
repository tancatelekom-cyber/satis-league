import { createSeasonAction, deleteSeasonAction, toggleSeasonStatusAction, updateSeasonAction } from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { SeasonProductBuilder } from "@/components/admin/season-product-builder";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type SeasonAdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function SeasonAdminPage({ searchParams }: SeasonAdminPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData();

  return (
    <main>
      <h1 className="page-title">Sezon Yonetimi</h1>
      <p className="page-subtitle">
        Buradan sezonlari olusturun, urunleri kategori bazli ekleyin, magaza carpanlarini belirleyin ve birden fazla sezonu ayni anda aktif tutun.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/sezonlar" />

      <section className="admin-stack">
        <article className="admin-card">
          <h3>Yeni Sezon Olustur</h3>
          <form action={createSeasonAction} className="admin-form">
            <input name="redirectTo" type="hidden" value="/admin/sezonlar" />

            <div className="auth-grid">
              <label className="field">
                <span>Sezon Adi</span>
                <input name="name" placeholder="Ornek: Yaz Sezonu 2026" required />
              </label>
              <label className="field">
                <span>Baslangic Tarihi</span>
                <input name="startDate" required type="date" />
              </label>
              <label className="field">
                <span>Bitis Tarihi</span>
                <input name="endDate" required type="date" />
              </label>
              <label className="field">
                <span>Sezon Tipi</span>
                <select defaultValue="employee" name="mode">
                  <option value="employee">Calisan Bazli</option>
                  <option value="store">Magaza Bazli</option>
                </select>
              </label>
              <label className="field">
                <span>Olcum Tipi</span>
                <select defaultValue="points" name="scoring">
                  <option value="points">Puan</option>
                  <option value="quantity">Adet</option>
                </select>
              </label>
              <label className="field season-toggle">
                <span>Aktif Sezon Yap</span>
                <input name="isActive" type="checkbox" />
              </label>
            </div>

            <label className="field">
              <span>Aciklama</span>
              <textarea
                className="text-area"
                name="description"
                placeholder="Bu sezonda odaklanilacak hedefleri yazin"
                rows={2}
              />
            </label>

            <div className="auth-grid">
              <label className="field">
                <span>Odul Basligi</span>
                <input name="rewardTitle" placeholder="Ornek: Sezon Sampiyonluk Odulleri" />
              </label>
              <label className="field">
                <span>Odul Detayi</span>
                <input name="rewardDetails" placeholder="Ornek: Prim, plaket ve kutlama duyurusu" />
              </label>
              <label className="field">
                <span>1. Sira Odulu</span>
                <input name="rewardFirst" placeholder="Ornek: 15.000 TL prim" />
              </label>
              <label className="field">
                <span>2. Sira Odulu</span>
                <input name="rewardSecond" placeholder="Ornek: 7.500 TL prim" />
              </label>
              <label className="field">
                <span>3. Sira Odulu</span>
                <input name="rewardThird" placeholder="Ornek: 3.000 TL prim" />
              </label>
            </div>

            <SeasonProductBuilder
              productFieldName="seasonProducts"
              multiplierFieldName="seasonStoreMultipliers"
              stores={data.storeRows.filter((store) => store.is_active)}
            />

            <div className="auth-actions">
              <button className="button-primary" type="submit">
                Sezonu Kaydet
              </button>
            </div>
          </form>
        </article>

        <article className="admin-card">
          <h3>Kayitli Sezonlar</h3>
          <div className="approval-list">
            {data.seasonRows.length === 0 ? (
              <div className="step-item">
                <strong>Henuz sezon yok</strong>
                <span>Ilk sezonu yukaridaki formdan olusturun.</span>
              </div>
            ) : (
              data.seasonRows.map((season) => (
                <div key={season.id} className="approval-row">
                  <div>
                    <h4>{season.name}</h4>
                    <p>
                      {season.start_date} - {season.end_date}
                    </p>
                    <p className="subtle">{season.description ?? "Aciklama yok"}</p>
                    <p className="subtle">
                      Tur: {season.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                      {season.scoring === "points" ? "Puan" : "Adet"}
                    </p>
                    <p className="subtle">
                      Sezon urunleri:{" "}
                      {data.seasonProductRows
                        .filter((item) => item.season_id === season.id)
                        .map(
                          (item) =>
                            `${item.name} / ${item.category_name} (${item.base_points} ${item.unit_label})`
                        )
                        .join(", ") || "Tanimlanmadi"}
                    </p>
                  </div>

                  <div className="campaign-manage-card">
                    <form action={updateSeasonAction} className="admin-form">
                      <input name="redirectTo" type="hidden" value="/admin/sezonlar" />
                      <input name="seasonId" type="hidden" value={season.id} />

                      <div className="auth-grid">
                        <label className="field compact">
                          <span>Sezon Adi</span>
                          <input defaultValue={season.name} name="name" required />
                        </label>
                        <label className="field compact">
                          <span>Baslangic</span>
                          <input defaultValue={season.start_date} name="startDate" required type="date" />
                        </label>
                        <label className="field compact">
                          <span>Bitis</span>
                          <input defaultValue={season.end_date} name="endDate" required type="date" />
                        </label>
                        <label className="field compact">
                          <span>Sezon Tipi</span>
                          <select defaultValue={season.mode} name="mode">
                            <option value="employee">Calisan Bazli</option>
                            <option value="store">Magaza Bazli</option>
                          </select>
                        </label>
                        <label className="field compact">
                          <span>Olcum Tipi</span>
                          <select defaultValue={season.scoring} name="scoring">
                            <option value="points">Puan</option>
                            <option value="quantity">Adet</option>
                          </select>
                        </label>
                        <label className="field compact season-toggle">
                          <span>Aktif Sezon</span>
                          <input defaultChecked={season.is_active} name="isActive" type="checkbox" />
                        </label>
                      </div>

                      <label className="field compact">
                        <span>Aciklama</span>
                        <textarea
                          className="text-area"
                          defaultValue={season.description ?? ""}
                          name="description"
                          rows={2}
                        />
                      </label>

                      <div className="auth-grid">
                        <label className="field compact">
                          <span>Odul Basligi</span>
                          <input defaultValue={season.reward_title ?? ""} name="rewardTitle" />
                        </label>
                        <label className="field compact">
                          <span>Odul Detayi</span>
                          <input defaultValue={season.reward_details ?? ""} name="rewardDetails" />
                        </label>
                        <label className="field compact">
                          <span>1. Sira Odulu</span>
                          <input defaultValue={season.reward_first ?? ""} name="rewardFirst" />
                        </label>
                        <label className="field compact">
                          <span>2. Sira Odulu</span>
                          <input defaultValue={season.reward_second ?? ""} name="rewardSecond" />
                        </label>
                        <label className="field compact">
                          <span>3. Sira Odulu</span>
                          <input defaultValue={season.reward_third ?? ""} name="rewardThird" />
                        </label>
                      </div>

                      <SeasonProductBuilder
                        productFieldName="seasonProducts"
                        multiplierFieldName="seasonStoreMultipliers"
                        stores={data.storeRows.filter((store) => store.is_active)}
                        initialProducts={data.seasonProductRows
                          .filter((item) => item.season_id === season.id)
                          .map((item) => ({
                            name: item.name,
                            category_name: item.category_name,
                            base_points: item.base_points,
                            unit_label: item.unit_label
                          }))}
                        initialMultipliers={data.seasonMultiplierRows
                          .filter((item) => item.season_id === season.id)
                          .map((item) => ({
                            storeName: item.store?.name ?? "",
                            multiplier: item.multiplier
                          }))}
                      />

                      <div className="campaign-manage-actions">
                        <button className="tiny-button approve" type="submit">
                          Guncelle
                        </button>
                      </div>
                    </form>

                    <div className="campaign-manage-actions">
                      <form action={toggleSeasonStatusAction}>
                        <input name="redirectTo" type="hidden" value="/admin/sezonlar" />
                        <input name="seasonId" type="hidden" value={season.id} />
                        <input name="isActive" type="hidden" value={String(season.is_active)} />
                        <button className="tiny-button" type="submit">
                          {season.is_active ? "Pasif Yap" : "Aktif Yap"}
                        </button>
                      </form>

                      <form action={deleteSeasonAction}>
                        <input name="redirectTo" type="hidden" value="/admin/sezonlar" />
                        <input name="seasonId" type="hidden" value={season.id} />
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
      </section>
    </main>
  );
}
