import Link from "next/link";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type RankingAdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function RankingAdminPage({ searchParams }: RankingAdminPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData();

  return (
    <main>
      <h1 className="page-title">Siralama ve Sonuclar</h1>
      <p className="page-subtitle">
        Liderlik ekranlarini tek sayfada acmak yerine bu ekrandan kolayca ilgili rapora gecin.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/siralama" />

      <section className="admin-overview-grid">
        <article className="admin-overview-card">
          <span>Aktif Sezon</span>
          <strong>{data.activeSeason?.name ?? "Yok"}</strong>
          <p>{data.activeSeason ? "Canli lig verisi bu sezondan besleniyor." : "Henuz aktif sezon secilmedi."}</p>
        </article>
        <article className="admin-overview-card">
          <span>Son Sezon Girisi</span>
          <strong>{data.activeSeasonSales.length}</strong>
          <p>Admin girilen son sezon satisi kayitlarinin toplam adedi.</p>
        </article>
      </section>

      <section className="admin-quick-grid">
        <Link className="admin-quick-card" href="/lig">
          <strong>Sezon Ligi</strong>
          <span>Kullanicilarin gordugu siralama ve odul alanlarini ac.</span>
        </Link>
        <Link className="admin-quick-card" href="/kampanyalar">
          <strong>Kampanya Ekrani</strong>
          <span>Canli kampanya listesi ve aktif/planlanan/sonuclanan alanlarini ac.</span>
        </Link>
        <Link className="admin-quick-card" href="/magaza-vs-magaza">
          <strong>Magaza VS Magaza</strong>
          <span>Magaza yarisi ekranini telefon gorunumunde kontrol et.</span>
        </Link>
      </section>
    </main>
  );
}
