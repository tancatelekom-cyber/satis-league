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
    <main>
      <h1 className="page-title">Admin Kontrol Merkezi</h1>
      <p className="page-subtitle">
        Telefonda daha rahat kullanabilmeniz icin admin alanlarini ayri sayfalara bolduk.
        Asagidan istediginiz alana tek dokunusla gecebilirsiniz.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin" />

      <section className="admin-overview-grid">
        <article className="admin-overview-card">
          <span>Aktif Sezon</span>
          <strong>{data.activeSeason?.name ?? "Aktif sezon yok"}</strong>
          <p>
            {data.activeSeason
              ? `${data.activeSeason.mode === "employee" ? "Calisan" : "Magaza"} bazli sezon hazir.`
              : "Sezon Yonetimi sayfasindan bir sezonu aktif yapin."}
          </p>
        </article>

        <article className="admin-overview-card">
          <span>Bekleyen Onay</span>
          <strong>{data.approvalRows.length}</strong>
          <p>Kullanici Onaylari sayfasinda onay bekleyen hesaplar bulunuyor.</p>
        </article>

        <article className="admin-overview-card">
          <span>Aktif Magaza</span>
          <strong>{data.storeRows.filter((store) => store.is_active).length}</strong>
          <p>Magaza sayfasindan kayit ekraninda gorunen magazalari yonetin.</p>
        </article>

        <article className="admin-overview-card">
          <span>Son Sezon Girdisi</span>
          <strong>{data.activeSeasonSales.length}</strong>
          <p>Sezon Satislari sayfasinda son girisleri filtreleyip duzenleyin.</p>
        </article>
      </section>

      <section className="admin-quick-grid">
        <a className="admin-quick-card" href="/admin/sezonlar">
          <strong>Sezon Yonetimi</strong>
          <span>Sezon ac, urunleri ekle, magaza carpanlarini belirle.</span>
        </a>
        <a className="admin-quick-card" href="/admin/sezon-satislari">
          <strong>Sezon Satislari</strong>
          <span>Aktif sezon icin calisan veya magaza bazli giris yap.</span>
        </a>
        <a className="admin-quick-card" href="/admin/kampanyalar">
          <strong>Canli Kampanyalar</strong>
          <span>Kampanya olustur, odul ekle, sonlandir veya sil.</span>
        </a>
        <a className="admin-quick-card" href="/admin/aylik-kampanyalar">
          <strong>Aylik Kampanyalar</strong>
          <span>Slider icin gorseller yukle, degistir ve kaldir.</span>
        </a>
        <a className="admin-quick-card" href="/admin/tarifeler">
          <strong>Tarifeler</strong>
          <span>Turkcell tarifelerini ekle, duzenle ve kategorilere ayir.</span>
        </a>
        <a className="admin-quick-card" href="/admin/magazalar">
          <strong>Magazalar</strong>
          <span>Kayit ekraninda gorunen magazalari burada yonet.</span>
        </a>
        <a className="admin-quick-card" href="/admin/onaylar">
          <strong>Kullanici Onaylari</strong>
          <span>Bekleyen hesaplari hizlica onayla veya reddet.</span>
        </a>
        <a className="admin-quick-card" href="/admin/siralama">
          <strong>Siralama</strong>
          <span>Sezon ligi ve canli liderlik ekranlarina gec.</span>
        </a>
      </section>
    </main>
  );
}
