import { requireAdminAccess } from "@/lib/auth/require-admin";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type AdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData();

  return (
    <main className="admin-center-page">
      <section className="admin-center-hero">
        <span className="admin-center-hero-icon" aria-hidden="true">⚙️</span>
        <div>
          <span className="admin-center-eyebrow">YÖNETİM PANELİ</span>
          <h1 className="page-title">Admin Kontrol Merkezi</h1>
          <p className="page-subtitle">
            Sistem durumunu izleyin ve yönetmek istediğiniz alana hızlıca ulaşın.
          </p>
        </div>
      </section>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <section className="admin-overview-grid">
        <article className="admin-overview-card">
          <span className="admin-overview-icon" aria-hidden="true">🗓️</span>
          <span className="admin-overview-label">Aktif Sezon</span>
          <strong>{data.activeSeason?.name ?? "Aktif sezon yok"}</strong>
          <p>
            {data.activeSeason
              ? `${data.activeSeason.mode === "employee" ? "Calisan" : "Magaza"} bazli sezon hazir.`
              : "Sezon Yonetimi sayfasindan bir sezonu aktif yapin."}
          </p>
        </article>

        <article className="admin-overview-card">
          <span className="admin-overview-icon" aria-hidden="true">👤</span>
          <span className="admin-overview-label">Bekleyen Onay</span>
          <strong>{data.approvalRows.length}</strong>
          <p>Kullanici Yonetimi sayfasinda onay bekleyen hesaplar bulunuyor.</p>
        </article>

        <article className="admin-overview-card">
          <span className="admin-overview-icon" aria-hidden="true">🏬</span>
          <span className="admin-overview-label">Aktif Mağaza</span>
          <strong>{data.storeRows.filter((store) => store.is_active).length}</strong>
          <p>Magaza sayfasindan kayit ekraninda gorunen magazalari yonetin.</p>
        </article>

        <article className="admin-overview-card">
          <span className="admin-overview-icon" aria-hidden="true">📥</span>
          <span className="admin-overview-label">Son Sezon Girdisi</span>
          <strong>{data.activeSeasonSales.length}</strong>
          <p>Sezon Satislari sayfasinda son girisleri filtreleyip duzenleyin.</p>
        </article>
      </section>

      <AdminSectionNav currentPath="/admin" />
    </main>
  );
}
