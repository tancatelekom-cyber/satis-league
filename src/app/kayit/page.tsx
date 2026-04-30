import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main>
      <h1 className="page-title">Yeni Oyuncu Kaydi</h1>
      <p className="page-subtitle">
        Calisanlar ve magaza mudurleri buradan hesap olusturur. Kayit tamamlandiginda
        kullanici dogrudan aktif olmaz; once admin onayina duser.
      </p>

      <section className="auth-layout">
        <SignupForm />

        <aside className="guide-card">
          <h3>Bu ekranda ne oluyor?</h3>
          <div className="step-list">
            <div className="step-item">
              <strong>1. Bilgiler girilir</strong>
              <span>Adi soyadi, mail, telefon, gorev ve magazasi secilir.</span>
            </div>
            <div className="step-item">
              <strong>2. Hesap olusur</strong>
              <span>Supabase kullaniciyi olusturur ve profil kaydini beklemeye alir.</span>
            </div>
            <div className="step-item">
              <strong>3. Admin onayi beklenir</strong>
              <span>Admin panelinden onay verilince kullanici aktif hale gelir.</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
