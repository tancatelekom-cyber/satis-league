import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined;

  return (
    <main>
      <h1 className="page-title">Kullanici Girisi</h1>
      <p className="page-subtitle">
        Admin tarafindan onaylanan kullanicilar buradan giris yapar. Onaysiz hesaplar
        kampanyayi goremez.
      </p>

      <section className="auth-layout">
        <LoginForm message={params?.message} />

        <aside className="guide-card">
          <h3>Giris sonrasi ne olacak?</h3>
          <div className="step-list">
            <div className="step-item">
              <strong>Calisan</strong>
              <span>Kendi kampanya ve satis ekranina yonlenir.</span>
            </div>
            <div className="step-item">
              <strong>Magaza Muduru</strong>
              <span>Kendi magazasi ve personeli icin veri girebilir.</span>
            </div>
            <div className="step-item">
              <strong>Yonetim ve Admin</strong>
              <span>Rapor ve yonetim ekranlarini gorur.</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
