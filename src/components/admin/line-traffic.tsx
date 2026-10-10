"use client";

import { useEffect, useRef, useState } from "react";

const TOTAL = 200_000_000;
const CHUNK = 2_000_000;

export function LineTraffic() {
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [received, setReceived] = useState(0);
  const [message, setMessage] = useState("Başlatmak için aşağıdaki butona basın.");
  useEffect(() => () => controller.current?.abort(), []);

  async function start() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setReceived(0);
    setMessage("Veri indiriliyor…");
    let total = 0;
    try {
      for (let i = 0; i < TOTAL / CHUNK; i++) {
        const response = await fetch("/api/admin/hat-trafik", { method: "POST", cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Admin oturumunuzu kontrol edip tekrar deneyin." : "İndirme başarısız oldu. Tekrar başlatabilirsiniz.");
        if (!response.headers.get("content-type")?.includes("application/octet-stream") || !response.body) throw new Error("Geçerli veri alınamadı.");
        const reader = response.body.getReader();
        let chunkBytes = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunkBytes += value.byteLength;
            total += value.byteLength;
            setReceived(total);
          }
        } finally { reader.releaseLock(); }
        if (chunkBytes !== CHUNK) throw new Error("Veri eksik alındı. İndirme durduruldu.");
      }
      setMessage("Tamamlandı. 200 MB veri indirildi.");
    } catch (error) {
      setMessage(abort.signal.aborted ? "İndirme iptal edildi." : error instanceof Error ? error.message : "Bağlantı hatası oluştu.");
    } finally {
      controller.current = null;
      setRunning(false);
    }
  }

  return <section className="admin-card" style={{ padding: 24 }}>
    <h2>200 MB Data Çek</h2>
    <p>Bu işlem cihazınızın aktif internet bağlantısından 200 MB veri indirir. Mobil hattınızda trafik oluşturmak için Wi-Fi’yi kapatıp o hattın mobil verisini kullanın.</p>
    <p>Veri dosya olarak kaydedilmez. Bağlantı ek yükleri nedeniyle operatörün ölçtüğü kullanım biraz daha yüksek olabilir.</p>
    <progress aria-label="İndirilen veri" max={TOTAL} value={Math.min(received, TOTAL)} style={{ width: "100%", height: 22 }} />
    <p>Gerçek indirilen: <strong>{(received / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 6 })} MB</strong> / 200 MB — %{(Math.floor(Math.min(100, received / TOTAL * 100) * 10) / 10).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}<br />{received.toLocaleString("tr-TR")} bayt alındı (1 MB = 1.000.000 bayt).</p>
    <p role="status" aria-live="polite">{message}</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button type="button" className="button-primary" onClick={start} disabled={running}>{running ? "İndiriliyor…" : "200 MB Data Çek"}</button>
      {running ? <button type="button" className="button-secondary" onClick={() => controller.current?.abort()}>İptal Et</button> : null}
    </div>
  </section>;
}
