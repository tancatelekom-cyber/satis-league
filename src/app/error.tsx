"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main><section className="guide-card" role="alert">
    <h1>Sayfa yüklenemedi</h1><p>Geçici bir bağlantı veya yükleme sorunu oluştu. Tekrar deneyebilirsiniz.</p>
    <div className="action-row"><button className="button-primary" onClick={reset}>Tekrar dene</button><a className="button-secondary" href="/hesabim">Hesabımı kontrol et</a></div>
  </section></main>;
}
