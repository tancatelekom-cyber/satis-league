import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getMonthlyCampaignSlides } from "@/lib/monthly-campaigns";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import {
  deleteMonthlyCampaignSlideAction,
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
      <h1 className="page-title">Aylik Kampanyalar</h1>
      <p className="page-subtitle">
        Sadece gorsel yukleyin. Kullanici tarafinda bu gorseller kayarak gosterilir.
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
            <h2>Yeni Gorsel Yukle</h2>
            <p>Yuklediginiz her resim sirayla kullanicilara gosterilir.</p>
          </div>
        </div>

        <form action={uploadMonthlyCampaignSlideAction} className="admin-media-upload-form">
          <input accept="image/png,image/jpeg,image/webp" name="image" required type="file" />
          <button className="button-primary" type="submit">
            Resim Yukle
          </button>
        </form>
      </section>

      <section className="admin-media-grid">
        {slides.length === 0 ? (
          <article className="admin-media-card empty-state-card">
            <strong>Henuz gorsel yok</strong>
            <p className="subtle">Ilk aylik kampanya afisini yuklediginizde burada listelenecek.</p>
          </article>
        ) : (
          slides.map((slide, index) => (
            <article key={slide.id} className="admin-media-card">
              <div className="admin-media-preview">
                <img src={slide.imageUrl} alt={slide.title} />
              </div>

              <div className="admin-media-body">
                <strong>{slide.title || `Gorsel ${index + 1}`}</strong>
                <span>Sira: {slide.sortOrder + 1}</span>
              </div>

              <a
                className="button-secondary"
                href={slide.imageUrl}
                target="_blank"
                rel="noreferrer"
                download
              >
                Gorseli Ac / Indir
              </a>

              <form action={replaceMonthlyCampaignSlideAction} className="admin-media-action-form">
                <input name="slideId" type="hidden" value={slide.id} />
                <input accept="image/png,image/jpeg,image/webp" name="image" required type="file" />
                <button className="button-secondary" type="submit">
                  Resmi Degistir
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
      </section>
    </main>
  );
}
