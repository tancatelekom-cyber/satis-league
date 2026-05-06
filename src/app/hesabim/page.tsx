import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { approvalLabels, roleLabels } from "@/lib/labels";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { ProfileSummary } from "@/lib/types";

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main>
        <h1 className="page-title">Hesabim</h1>
        <p className="page-subtitle">
          Bu ekrani kullanabilmek icin once `.env.local` dosyasina Supabase bilgilerini
          girmelisiniz.
        </p>
        <section className="guide-card">
          <h3>Simdi ne yapacaksiniz?</h3>
          <div className="step-list">
            <div className="step-item">
              <strong>1. Supabase API bilgilerini bulun</strong>
              <span>Project URL ve anon key degerlerini alin.</span>
            </div>
            <div className="step-item">
              <strong>2. .env.local dosyasini doldurun</strong>
              <span>Ornek yapisi `.env.example` dosyasinda hazir.</span>
            </div>
            <div className="step-item">
              <strong>3. SQL dosyasini calistirin</strong>
              <span>`supabase/schema.sql` icindeki tablolar olusmali.</span>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data } = await supabase
    .from("profiles")
    .select(
      `
        id,
        full_name,
        email,
        phone,
        role,
        approval,
        is_on_leave,
        store:stores(name)
      `
    )
    .eq("id", user.id)
    .single();
  const profile = (data as ProfileSummary | null) ?? null;

  return (
    <main>
      <h1 className="page-title">Hesabim</h1>
      <p className="page-subtitle">
        Bu ekran kullanicinin aktif olup olmadigini gosteren kontrol noktasi gibi
        dusunuldu.
      </p>

      <section className="campaign-layout">
        <article className="campaign-card">
          <div className="campaign-header">
            <div>
              <div className="status-chip">
                {profile ? approvalLabels[profile.approval] : "Profil bulunamadi"}
              </div>
              <h2>{profile?.full_name ?? user.email}</h2>
              <p>{profile?.email ?? user.email}</p>
            </div>

            <LogoutButton />
          </div>

          {profile ? (
            <div className="profile-summary">
              <div className="summary-row">
                <span>Rol</span>
                <strong>{roleLabels[profile.role]}</strong>
              </div>
              <div className="summary-row">
                <span>Magaza</span>
                <strong>{profile.store?.name ?? "Henuz atanmis degil"}</strong>
              </div>
              <div className="summary-row">
                <span>Telefon</span>
                <strong>{profile.phone ?? "-"}</strong>
              </div>
              <div className="summary-row">
                <span>Izin Durumu</span>
                <strong>{profile.is_on_leave ? "Izinli" : "Aktif"}</strong>
              </div>
            </div>
          ) : (
            <div className="message-box error-box">
              Profil kaydi bulunamadi. Genelde bu durum `schema.sql` dosyasi henuz
              calistirilmadiginda olur.
            </div>
          )}

          {profile?.approval === "approved" ? (
            <div className="action-row">
              <Link className="button-primary" href="/">
                Ana Ekrana Git
              </Link>
            </div>
          ) : null}
        </article>

        <aside className="leaderboard-card">
          <h3>Durum Aciklamasi</h3>
          <p>
            Kaydinizdan sonra admin onayi beklenir. Onay geldikten sonra bu ekran
            otomatik olarak aktif kullanici durumuna gecer.
          </p>

          <div className="step-list">
            <div className="step-item">
              <strong>Pending</strong>
              <span>Admin sizi henuz aktif etmedi. Beklemede kalirsiniz.</span>
            </div>
            <div className="step-item">
              <strong>Approved</strong>
              <span>Kampanyalari, sira tablosunu ve satis girisini acabilirsiniz.</span>
            </div>
            <div className="step-item">
              <strong>Rejected</strong>
              <span>Admin kaydi reddetti. Gerekirse yeni kayit acilir.</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
