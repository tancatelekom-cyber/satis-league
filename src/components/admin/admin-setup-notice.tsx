export function AdminSetupNotice() {
  return (
    <main>
      <h1 className="page-title">Admin Kontrol Merkezi</h1>
      <p className="page-subtitle">
        Admin islemlerini acabilmek icin once `.env.local` dosyasina Supabase
        bilgilerinin tam girilmis olmasi gerekiyor.
      </p>

      <section className="guide-card">
        <div className="step-list">
          <div className="step-item">
            <strong>1. Project URL</strong>
            <span>Supabase proje adresiniz `https://...supabase.co` seklinde olmali.</span>
          </div>
          <div className="step-item">
            <strong>2. Publishable key</strong>
            <span>`NEXT_PUBLIC_SUPABASE_ANON_KEY` alanina yazilmali.</span>
          </div>
          <div className="step-item">
            <strong>3. Secret key</strong>
            <span>`SUPABASE_SERVICE_ROLE_KEY` alanina yazilmali.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
