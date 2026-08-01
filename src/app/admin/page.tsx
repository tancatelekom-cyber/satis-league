import { requireAdminAccess } from "@/lib/auth/require-admin";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateHomeLeaderPeriodAction } from "./ayin-yildizlari/actions";

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
  const admin = createAdminClient();
  const { data: homeLeaderSettings } = await admin
    .from("home_leader_settings")
    .select("display_month")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const configuredMonth = String(homeLeaderSettings?.display_month ?? "").slice(0, 7);
  const homeLeaderMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(configuredMonth)
    ? configuredMonth
    : currentMonth;

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

      <section className="guide-card game-brief-card">
        <div className="section-title compact-title">
          <div>
            <span>ANA EKRAN AYARI</span>
            <h2>Ayın Yıldızlarında hangi dönem görünsün?</h2>
            <p>Seçilen ayın satış liderleri ana ekranda tüm kullanıcılara gösterilir.</p>
          </div>
        </div>

        <form action={updateHomeLeaderPeriodAction} className="admin-form">
          <input name="redirectTo" type="hidden" value="/admin" />
          <label className="field">
            <span>Gösterilecek yıl ve ay</span>
            <input
              className="input"
              name="displayMonth"
              type="month"
              defaultValue={homeLeaderMonth}
              required
            />
          </label>
          <button className="button-primary" type="submit">
            Ana Ekran Dönemini Kaydet
          </button>
        </form>
      </section>

      <AdminSectionNav currentPath="/admin" />
    </main>
  );
}
