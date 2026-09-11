import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getMonthlyCampaignSlides } from "@/lib/monthly-campaigns";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import {
  deleteMonthlyCampaignSlideAction,
  moveMonthlyCampaignSlideAction,
  replaceMonthlyCampaignSlideAction,
  uploadMonthlyCampaignSlideAction
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MonthlyCampaignAdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

const CAMPAIGN_GROUPS = [
  {
    type: "turkcell" as const,
    title: "Turkcell Kampanyalar"
  },
  {
    type: "tanca" as const,
    title: "Tanca Kampanyalar"
  }
];

export default async function MonthlyCampaignAdminPage({
  searchParams
}: MonthlyCampaignAdminPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const slides = await getMonthlyCampaignSlides({ includeInactive: true });

  return (
    <main>
      <h1 className="page-title">Aylık Kampanyalar</h1>
      <p className="page-subtitle">
        Kampanya adını, alanını ve görselini ekleyin. Kullanıcılar kampanya adına tıklayarak görseli açabilir.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/aylik-kampanyalar" />

      <section className="guide-card admin-media-panel">
        <div className="section-title compact-title">
          <div>
            <h2>Yeni Kampanya Ekle</h2>
            <p>Kampanyanın adını ve Turkcell veya Tanca alanını seçin.</p>
          </div>
        </div>

        <form
          action={uploadMonthlyCampaignSlideAction}
          className="admin-media-upload-form admin-media-upload-form-detailed"
          encType="multipart/form-data"
        >
          <label className="admin-media-field">
            <span>Kampanya Adı</span>
            <input
              maxLength={120}
              name="title"
              placeholder="Örn. Eylül Fırsatları"
              required
              type="text"
            />
          </label>
          <label className="admin-media-field">
            <span>Kampanya Alanı</span>
            <select defaultValue="turkcell" name="campaignType" required>
              <option value="turkcell">Turkcell Kampanyalar</option>
              <option value="tanca">Tanca Kampanyalar</option>
            </select>
          </label>
          <label className="admin-media-field admin-media-file-field">
            <span>Kampanya Görseli</span>
            <input accept="image/png,image/jpeg,image/webp" name="image" required type="file" />
          </label>
          <button className="button-primary" type="submit">
            Kampanyayı Ekle
          </button>
        </form>
      </section>

      <div className="admin-media-groups">
        {CAMPAIGN_GROUPS.map((group) => {
          const groupSlides = slides.filter((slide) => slide.campaignType === group.type);

          return (
            <section key={group.type} className={`admin-media-group admin-media-group-${group.type}`}>
              <div className="admin-media-group-header">
                <div>
                  <span>Kampanya Alanı</span>
                  <h2>{group.title}</h2>
                </div>
                <strong>{groupSlides.length} kampanya</strong>
              </div>

              <div className="admin-media-grid">
                {groupSlides.length === 0 ? (
                  <article className="admin-media-card empty-state-card">
                    <strong>Henüz kampanya yok</strong>
                    <p className="subtle">Bu alana eklenen kampanyalar burada listelenecek.</p>
                  </article>
                ) : (
                  groupSlides.map((slide, index) => (
                    <article key={slide.id} className="admin-media-card">
                      <div className="admin-media-preview">
                        <img src={slide.imageUrl} alt={slide.title} />
                      </div>

                      <div className="admin-media-body">
                        <strong>{slide.title}</strong>
                        <span>Sıra: {index + 1}</span>
                      </div>

                      <div className="admin-media-order-row">
                        <form action={moveMonthlyCampaignSlideAction}>
                          <input name="slideId" type="hidden" value={slide.id} />
                          <input name="direction" type="hidden" value="up" />
                          <button className="button-secondary" disabled={index === 0} type="submit">
                            Yukarı Al
                          </button>
                        </form>
                        <form action={moveMonthlyCampaignSlideAction}>
                          <input name="slideId" type="hidden" value={slide.id} />
                          <input name="direction" type="hidden" value="down" />
                          <button
                            className="button-secondary"
                            disabled={index === groupSlides.length - 1}
                            type="submit"
                          >
                            Aşağı Al
                          </button>
                        </form>
                      </div>

                      <a
                        className="button-secondary"
                        href={slide.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        download
                      >
                        Görseli Aç / İndir
                      </a>

                      <form
                        action={replaceMonthlyCampaignSlideAction}
                        className="admin-media-action-form"
                        encType="multipart/form-data"
                      >
                        <input name="slideId" type="hidden" value={slide.id} />
                        <label className="admin-media-field">
                          <span>Kampanya Adı</span>
                          <input defaultValue={slide.title} maxLength={120} name="title" required type="text" />
                        </label>
                        <label className="admin-media-field">
                          <span>Kampanya Alanı</span>
                          <select defaultValue={slide.campaignType} name="campaignType" required>
                            <option value="turkcell">Turkcell Kampanyalar</option>
                            <option value="tanca">Tanca Kampanyalar</option>
                          </select>
                        </label>
                        <label className="admin-media-field">
                          <span>Yeni Görsel</span>
                          <input
                            accept="image/png,image/jpeg,image/webp"
                            name="image"
                            required
                            type="file"
                          />
                        </label>
                        <button className="button-secondary" type="submit">
                          Kampanyayı Güncelle
                        </button>
                      </form>

                      <form action={deleteMonthlyCampaignSlideAction}>
                        <input name="slideId" type="hidden" value={slide.id} />
                        <button className="button-danger" type="submit">
                          Sil
                        </button>
                      </form>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
