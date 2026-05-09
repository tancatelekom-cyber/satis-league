import {
  createCampaignSaleByAdminAction,
  createCampaignAction,
  deleteCampaignSaleAction,
  deleteCampaignAction,
  endCampaignAction,
  updateCampaignSaleAction,
  updateCampaignAction
} from "@/app/admin/actions";
import { AdminCampaignSaleForm } from "@/components/admin/admin-campaign-sale-form";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { CampaignBuilder } from "@/components/admin/campaign-builder";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { formatCampaignDateTime, isoToLocalDateTimeInput } from "@/lib/campaign-utils";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type CampaignAdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function CampaignAdminPage({ searchParams }: CampaignAdminPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData();

  return (
    <main>
      <h1 className="page-title">Canli Kampanyalar</h1>
      <p className="page-subtitle">
        Kampanya acma, guncelleme ve sonlandirma islemleri bu sayfada toplandi. Telefonda daha rahat kullanabilirsiniz.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/kampanyalar" />

      <section className="admin-stack">
        <article className="admin-card">
          <h3>Canli Kampanya Olustur</h3>
          <form action={createCampaignAction} className="admin-form">
            <input name="redirectTo" type="hidden" value="/admin/kampanyalar" />

            <div className="auth-grid">
              <label className="field">
                <span>Kampanya Adi</span>
                <input name="name" placeholder="Ornek: Mayis Hedef Yarisi" required />
              </label>
              <label className="field">
                <span>Kampanya Tipi</span>
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
              <label className="field">
                <span>Baslangic Tarih ve Saat</span>
                <input name="startAt" required type="datetime-local" />
              </label>
              <label className="field">
                <span>Bitis Tarih ve Saat</span>
                <input name="endAt" required type="datetime-local" />
              </label>
            </div>

            <label className="field">
              <span>Aciklama</span>
              <textarea
                className="text-area"
                name="description"
                placeholder="Kampanyanin amaci, odulu ve hedef kitlesi"
                rows={3}
              />
            </label>

            <label className="field">
              <span>Kampanya Giris Yetkisi Olan Profiller</span>
              <div className="checkbox-grid permission-checkbox-grid">
                {data.approvedCampaignPermissionProfiles.length === 0 ? (
                  <span className="subtle">Onayli profil bulunamadi.</span>
                ) : (
                  data.approvedCampaignPermissionProfiles.map((profile) => (
                    <label key={profile.id} className="checkbox-card">
                      <input name="allowedEntryProfileIds" type="checkbox" value={profile.id} />
                      <span>
                        {profile.full_name} | {profile.role === "employee" ? "Calisan" : profile.role === "manager" ? "Magaza Muduru" : "Yonetim"}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <small className="subtle">Bos birakirsan onayli tum kullanicilar kampanya girisi yapabilir.</small>
            </label>

            <div className="auth-grid">
              <label className="field">
                <span>Odul Basligi</span>
                <input name="rewardTitle" placeholder="Ornek: Aylik Sampiyon Odulleri" />
              </label>
              <label className="field">
                <span>Odul Detayi</span>
                <input name="rewardDetails" placeholder="Ornek: Prim, hediye ceki ve kutlama duyurusu" />
              </label>
              <label className="field">
                <span>1. Sira Odulu</span>
                <input name="rewardFirst" placeholder="Ornek: 10.000 TL prim" />
              </label>
              <label className="field">
                <span>2. Sira Odulu</span>
                <input name="rewardSecond" placeholder="Ornek: 5.000 TL prim" />
              </label>
              <label className="field">
                <span>3. Sira Odulu</span>
                <input name="rewardThird" placeholder="Ornek: 2.500 TL prim" />
              </label>
            </div>

            <CampaignBuilder stores={data.storeRows.filter((store) => store.is_active)} />

            <div className="auth-actions">
              <button className="button-primary" type="submit">
                Kampanyayi Ac
              </button>
            </div>
          </form>
        </article>

        <article className="admin-card">
          <h3>Canli Kampanya Satis Girisi</h3>
          <p className="subtle">
            Admin olarak kampanyayi secin, sonra hedef personel veya magazayi secip satisi o hesaba isleyin.
          </p>

          <AdminCampaignSaleForm
            action={createCampaignSaleByAdminAction}
            campaigns={data.campaignRows.map((campaign) => ({
              id: campaign.id,
              name: campaign.name,
              mode: campaign.mode,
              products: data.productRows
                .filter((product) => product.campaign_id === campaign.id)
                .map((product) => ({
                  id: product.id,
                  name: product.name,
                  base_points: product.base_points,
                  unit_label: product.unit_label
                }))
            }))}
            employees={data.approvedProfilesForSeason.map((profile) => ({
              id: profile.id,
              full_name: profile.full_name
            }))}
            stores={data.storeRows.filter((store) => store.is_active).map((store) => ({
              id: store.id,
              name: store.name
            }))}
          />
        </article>

        <article className="admin-card">
          <h3>Son Kampanyalar</h3>
          <div className="approval-list">
            {data.campaignRows.length === 0 ? (
              <div className="step-item">
                <strong>Henuz kampanya yok</strong>
                <span>Ilk kampanyayi yukaridaki formdan olusturun.</span>
              </div>
            ) : (
              data.campaignRows.map((campaign) => (
                <div key={campaign.id} className="approval-row">
                  <div>
                    <h4>{campaign.name}</h4>
                    <p>
                      {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                      {campaign.scoring === "points" ? "Puan" : "Adet"}
                    </p>
                    <p className="subtle">
                      {formatCampaignDateTime(campaign.start_at)} - {formatCampaignDateTime(campaign.end_at)}
                    </p>
                    <p className="subtle">
                      Urunler:{" "}
                      {data.productRows
                        .filter((product) => product.campaign_id === campaign.id)
                        .map((product) => `${product.name} (${product.base_points} ${product.unit_label})`)
                        .join(", ") || "Urun yok"}
                    </p>
                    <p className="subtle">
                      Magaza carpanlari:{" "}
                      {data.multiplierRows
                        .filter((item) => item.campaign_id === campaign.id)
                        .map((item) => `${item.store?.name ?? "Magaza"} x${item.multiplier}`)
                        .join(", ") || "Varsayilan 1.00"}
                    </p>
                    <p className="subtle">
                      Giris yetkisi olanlar:{" "}
                      {data.campaignEntryPermissionRows
                        .filter((item) => item.campaign_id === campaign.id)
                        .map((item) => item.profile?.full_name ?? "Profil")
                        .join(", ") || "Tum onayli kullanicilar"}
                    </p>

                    <div className="campaign-sales-admin">
                      <strong>Canli Satis Kayitlari</strong>
                      <div className="campaign-sales-list">
                        {data.campaignSales.filter((sale) => sale.campaign_id === campaign.id).length === 0 ? (
                          <div className="compact-sale-row empty">Bu kampanyada henuz satis kaydi yok.</div>
                        ) : (
                          data.campaignSales
                            .filter((sale) => sale.campaign_id === campaign.id)
                            .slice(0, 12)
                            .map((sale) => (
                              <div key={sale.id} className="compact-sale-row">
                                <div className="compact-sale-copy">
                                  <strong>{sale.targetProfile?.full_name ?? sale.targetStore?.name ?? "Hedef yok"}</strong>
                                  <span>
                                    {sale.product?.name ?? "Urun"} | {sale.quantity} {sale.product?.unit_label ?? "adet"} |{" "}
                                    {Number(sale.weighted_score ?? 0).toFixed(0)} puan
                                  </span>
                                  <span className="subtle">
                                    Giren: {sale.actorProfile?.full_name ?? "Bilinmiyor"} |{" "}
                                    {new Date(sale.created_at).toLocaleString("tr-TR")}
                                  </span>
                                </div>

                                <div className="compact-sale-actions">
                                  <form action={updateCampaignSaleAction} className="compact-sale-form">
                                    <input name="redirectTo" type="hidden" value="/admin/kampanyalar" />
                                    <input name="saleId" type="hidden" value={sale.id} />
                                    <input name="campaignId" type="hidden" value={campaign.id} />
                                    <input
                                      className="compact-sale-input"
                                      defaultValue={sale.quantity}
                                      name="quantity"
                                      type="number"
                                    />
                                    <button className="tiny-button approve" type="submit">
                                      Guncelle
                                    </button>
                                  </form>

                                  <form action={deleteCampaignSaleAction}>
                                    <input name="redirectTo" type="hidden" value="/admin/kampanyalar" />
                                    <input name="saleId" type="hidden" value={sale.id} />
                                    <button className="tiny-button danger" type="submit">
                                      Sil
                                    </button>
                                  </form>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="campaign-manage-card">
                    <form action={updateCampaignAction} className="admin-form">
                      <input name="redirectTo" type="hidden" value="/admin/kampanyalar" />
                      <input name="campaignId" type="hidden" value={campaign.id} />

                      <div className="auth-grid">
                        <label className="field compact">
                          <span>Kampanya Adi</span>
                          <input defaultValue={campaign.name} name="name" required />
                        </label>
                        <label className="field compact">
                          <span>Kampanya Tipi</span>
                          <select defaultValue={campaign.mode} name="mode">
                            <option value="employee">Calisan Bazli</option>
                            <option value="store">Magaza Bazli</option>
                          </select>
                        </label>
                        <label className="field compact">
                          <span>Olcum Tipi</span>
                          <select defaultValue={campaign.scoring} name="scoring">
                            <option value="points">Puan</option>
                            <option value="quantity">Adet</option>
                          </select>
                        </label>
                        <label className="field compact">
                          <span>Baslangic</span>
                          <input
                            defaultValue={isoToLocalDateTimeInput(campaign.start_at)}
                            name="startAt"
                            required
                            type="datetime-local"
                          />
                        </label>
                        <label className="field compact">
                          <span>Bitis</span>
                          <input
                            defaultValue={isoToLocalDateTimeInput(campaign.end_at)}
                            name="endAt"
                            required
                            type="datetime-local"
                          />
                        </label>
                      </div>

                      <label className="field compact">
                        <span>Aciklama</span>
                        <textarea
                          className="text-area"
                          defaultValue={campaign.description ?? ""}
                          name="description"
                          rows={2}
                        />
                      </label>

                      <div className="auth-grid">
                        <label className="field compact">
                          <span>Odul Basligi</span>
                          <input defaultValue={campaign.reward_title ?? ""} name="rewardTitle" />
                        </label>
                        <label className="field compact">
                          <span>Odul Detayi</span>
                          <input defaultValue={campaign.reward_details ?? ""} name="rewardDetails" />
                        </label>
                        <label className="field compact">
                          <span>1. Sira Odulu</span>
                          <input defaultValue={campaign.reward_first ?? ""} name="rewardFirst" />
                        </label>
                        <label className="field compact">
                          <span>2. Sira Odulu</span>
                          <input defaultValue={campaign.reward_second ?? ""} name="rewardSecond" />
                        </label>
                        <label className="field compact">
                          <span>3. Sira Odulu</span>
                          <input defaultValue={campaign.reward_third ?? ""} name="rewardThird" />
                        </label>
                      </div>

                      <label className="field compact">
                        <span>Kampanya Magaza Carpanlari</span>
                        <textarea
                          className="text-area"
                          defaultValue={data.multiplierRows
                            .filter((item) => item.campaign_id === campaign.id)
                            .map((item) => `${item.store?.name ?? ""}|${item.multiplier}`)
                            .join("\n")}
                          name="storeMultipliers"
                          rows={4}
                        />
                      </label>

                      <label className="field compact">
                        <span>Kampanya Giris Yetkisi Olan Profiller</span>
                        <div className="checkbox-grid permission-checkbox-grid">
                          {data.approvedCampaignPermissionProfiles.map((profile) => {
                            const isChecked = data.campaignEntryPermissionRows.some(
                              (item) => item.campaign_id === campaign.id && item.profile_id === profile.id
                            );

                            return (
                              <label key={`${campaign.id}-${profile.id}`} className="checkbox-card">
                                <input
                                  defaultChecked={isChecked}
                                  name="allowedEntryProfileIds"
                                  type="checkbox"
                                  value={profile.id}
                                />
                                <span>
                                  {profile.full_name} |{" "}
                                  {profile.role === "employee"
                                    ? "Calisan"
                                    : profile.role === "manager"
                                      ? "Magaza Muduru"
                                      : "Yonetim"}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <small className="subtle">Bos ise tum onayli kullanicilar kampanya girisi yapabilir.</small>
                      </label>

                      <div className="campaign-manage-actions">
                        <button className="tiny-button approve" type="submit">
                          Guncelle
                        </button>
                      </div>
                    </form>

                    <div className="campaign-manage-actions">
                      <div className="store-status">
                        <span>Durum</span>
                        <strong>{campaign.is_active ? "Aktif" : "Pasif"}</strong>
                      </div>

                      <form action={endCampaignAction}>
                        <input name="redirectTo" type="hidden" value="/admin/kampanyalar" />
                        <input name="campaignId" type="hidden" value={campaign.id} />
                        <button className="tiny-button" type="submit">
                          Sonlandir
                        </button>
                      </form>

                      <form action={deleteCampaignAction}>
                        <input name="redirectTo" type="hidden" value="/admin/kampanyalar" />
                        <input name="campaignId" type="hidden" value={campaign.id} />
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
