"use client";
export default function CashError({ reset }: { reset: () => void }) {
  return <section style={{padding:24}}><h1>Kasa verileri açılamadı</h1><p>Tarihi ve bağlantıyı kontrol edin. İlk kurulumda kasa SQL migration dosyasının uygulanması gerekir.</p><button onClick={reset}>Yeniden dene</button></section>;
}
