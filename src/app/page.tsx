import Link from "next/link";
import { funMetrics } from "@/lib/mock-data";

const features = [
  {
    title: "Canli Sira Degisimi",
    text: "Satis girisi geldigi anda liderlik panosu hareket eder. Rekabet hissi anlik olarak yansir."
  },
  {
    title: "Rol Bazli Akis",
    text: "Calisan, magaza muduru, yonetim ve admin icin farkli ekranlar ve farkli yetkiler sunulur."
  },
  {
    title: "Puan ve Carpan Sistemi",
    text: "Magaza potansiyeline gore carpan tanimlanir. Boylece daha adil bir yaris kurgulanir."
  },
  {
    title: "Izinli Personel Gizleme",
    text: "Kullanici izinli gunu secer, listede gorunmez, liderlik tablosu daha dogru yansir."
  },
  {
    title: "Admin Onay Mekanizmasi",
    text: "Yeni kayitlar once beklemeye duser. Admin onay verince hesap aktif olur."
  },
  {
    title: "Eglenceli Rozetler",
    text: "Atak Oyuncu, Zirve Koruyucu, Haftanin Yildizi gibi rozetler ekibe enerji verir."
  }
];

const steps = [
  "Kullanici kaydolur ve rolu ile magazasini secer.",
  "Admin paneline onay talebi duser.",
  "Admin kampanyayi olusturur, urunleri ve tarihleri belirler.",
  "Kullanici + ve - butonlari ile satis girisi yapar.",
  "Puan, adet ve carpanlara gore siralama degisir.",
  "Yonetim raporlari izler, oduller dagitilir."
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <h1>Satis Ekibinizi Oyuna Donusturun.</h1>
          <p>
            Bu proje, satis kampanyalarinizi siradan bir tablo olmaktan cikarip renkli,
            hizli ve motive edici bir mobil deneyime donusturmek icin tasarlandi.
            Calisanlar urun satar, puan toplar, magaza yarislari kazanir ve odul
            panosunda yukselir.
          </p>

          <div className="pill-row">
            <span className="pill">Calisan Bazli Kampanya</span>
            <span className="pill">Magaza Bazli Kampanya</span>
            <span className="pill">Canli Liderlik Tablosu</span>
          </div>

          <div className="cta-row">
            <Link className="button-secondary" href="/kayit">
              Kayit Ekranini Ac
            </Link>
            <Link className="button-primary" href="/kampanyalar">
              Kampanya Ekranini Gor
            </Link>
            <Link className="button-secondary" href="/admin">
              Admin Panelini Gor
            </Link>
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-grid">
            <div className="mini-stat">
              <span className="subtle">Bugunun mod baskani</span>
              <strong>Merve</strong>
              <span>+320 puanlik atilim</span>
            </div>
            <div className="mini-stat">
              <span className="subtle">Magaza kapismasi</span>
              <strong>12 Magaza</strong>
              <span>Bitise 4 saat kala fark kapaniyor</span>
            </div>
            <div className="mini-stat">
              <span className="subtle">Odul havuzu</span>
              <strong>TV + Prim</strong>
              <span>Ayin buyuk odulleri burada</span>
            </div>
            <div className="mini-stat">
              <span className="subtle">Oyun hissi</span>
              <strong>Seviye 9</strong>
              <span>Rozet, seri, takim puani, geri sayim</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">
          <div>
            <h2>Neden Bu Yapi Dogru?</h2>
            <p>Mevcut araclarinizla hizli baslayabileceginiz sade ama guclu kurgu.</p>
          </div>
        </div>

        <div className="metrics-grid">
          {funMetrics.map((metric) => (
            <article key={metric.label} className="metric-card">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">
          <div>
            <h2>Sistemin Omurgasi</h2>
            <p>Asagidaki alanlar bu urunu gercek hayatta kullanilabilir hale getirir.</p>
          </div>
        </div>

        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="panel-card">
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">
          <div>
            <h2>Adim Adim Isleyis</h2>
            <p>Teknik olmayan gozle de takip edilebilecek sade bir surec akisi.</p>
          </div>
        </div>

        <div className="guide-card">
          <div className="step-list">
            {steps.map((step, index) => (
              <div key={step} className="step-item">
                <strong>Adim {index + 1}</strong>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="footer-note">
        Sonraki adim olarak `docs/kurulum-rehberi.md` ve `supabase/schema.sql` dosyalarini
        kullanarak gercek sisteme gecis yapabilirsiniz.
      </p>
    </main>
  );
}
