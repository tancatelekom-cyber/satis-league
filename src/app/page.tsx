import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <h1>TANCA SUPER LIG</h1>
          <p className="page-subtitle">Hizli erisim menusu</p>

          <div className="cta-row">
            <Link className="button-primary" href="/kampanyalar">
              Gunluk Kampanyalar
            </Link>
            <Link className="button-secondary" href="/lig">
              Yildizlar Kulubu
            </Link>
            <Link className="button-secondary" href="/tarifeler">
              Tarifeler
            </Link>
            <Link className="button-secondary" href="/cihaz-fiyat-listesi">
              Cihaz Fiyat Listesi
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
