import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Satis Kampanya Oyunu",
  description: "Satis ekibini motive eden mobil uyumlu web oyunu"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>
        <div className="page-shell">
          <header className="topbar">
            <div className="brand">
              <div className="brand-badge">S+</div>
              <div>
                <div>SATIS LEAGUE</div>
                <small className="subtle">Mobil web oyun prototipi</small>
              </div>
            </div>

            <nav className="nav-links">
              <Link className="nav-link" href="/">
                Ana Sayfa
              </Link>
              <Link className="nav-link" href="/kayit">
                Kayit Ol
              </Link>
              <Link className="nav-link" href="/giris">
                Giris
              </Link>
              <Link className="nav-link" href="/hesabim">
                Hesabim
              </Link>
              <Link className="nav-link" href="/bildirimler">
                Bildirimler
              </Link>
              <Link className="nav-link" href="/kampanyalar">
                Kampanya Ekrani
              </Link>
              <Link className="nav-link" href="/magaza-vs-magaza">
                Magaza VS Magaza
              </Link>
              <Link className="nav-link" href="/lig">
                Sezon Ligi
              </Link>
              <Link className="nav-link" href="/kontrol-listesi">
                Kontrol Listesi
              </Link>
              <Link className="nav-link" href="/admin">
                Admin Paneli
              </Link>
            </nav>
          </header>

          {children}
        </div>
      </body>
    </html>
  );
}
