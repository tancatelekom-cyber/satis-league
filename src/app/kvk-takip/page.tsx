import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { canViewKvk, fetchKvkData, parseKvkDate, summarizeKvk } from "@/lib/kvk-tracking";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
const money = (cents: number) => (cents / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const dateLabel = (date: string) => date.split("-").reverse().join(".");

export default async function KvkTrackingPage({ searchParams }: { searchParams?: Promise<{ start?: string; end?: string; page?: string }> }) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role, approval").eq("id", user.id).single();
  if (!profile || !canViewKvk(profile.role, profile.approval)) redirect("/hesabim");
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = params?.start ?? `${today.slice(0, 7)}-01`;
  const end = params?.end ?? today;
  const validRange = Boolean(/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && parseKvkDate(start) && parseKvkDate(end) && start <= end);
  const data = validRange ? await fetchKvkData() : null;
  const summary = data && !data.errors.length ? summarizeKvk(data, start, end) : null;
  const pageCount = Math.max(1, Math.ceil((summary?.entries.length ?? 0) / 100));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(params?.page ?? "1", 10) || 1));
  return <main className={styles.page}>
    <header className={styles.hero}><span>FİNANS TAKİBİ</span><h1>KVK Takip</h1><p>Temlik primleri, iadeler ve havalelerin ön ödemeler, hazırkart ve ek giderlerle karşılaştırması.</p>
      <strong>KVK güncelleme tarihi: {data?.updatedAt ? dateLabel(data.updatedAt) : "Doğrulanamadı"}</strong>
      <small>En yeni onay tarihi · Seçili tarih aralığından bağımsız</small>
    </header>
    <form className={styles.filters} method="get">
      <label>Başlangıç tarihi<input name="start" type="date" required defaultValue={parseKvkDate(start) ?? ""} /></label>
      <label>Bitiş tarihi<input name="end" type="date" required defaultValue={parseKvkDate(end) ?? ""} /></label>
      <button type="submit">Karşılaştır / Yenile</button>
    </form>
    {!validRange ? <p className={styles.error} role="alert">Geçerli bir tarih aralığı seçin. Başlangıç tarihi bitişten sonra olamaz.</p> : null}
    {data?.errors.length ? <section className={styles.error} role="alert"><h2>Karşılaştırma tamamlanamadı</h2><p>Eksik veya okunamayan veriler nedeniyle toplamlar gösterilmiyor.</p><p>Lütfen verileri kontrol edip tekrar deneyin.</p></section> : null}
    {summary ? <>
      <section className={styles.cards}>{Object.entries(summary.totals).map(([label, amount]) => <article key={label}><span>{label}</span><strong>{money(amount)}</strong><small>{summary.entries.filter(row => row.kind === label).length} işlem</small></article>)}</section>
      <section className={styles.comparison}>
        <div><span>Temlik primi + iade + havale</span><strong>{money(summary.matched)}</strong></div>
        <div><span>Ön ödemeler + hazırkart ve ek giderler</span><strong>{money(summary.expenses)}</strong></div>
        <div><span>Fark (KVK toplamı − ön ödemeler ve giderler)</span><strong>{money(summary.difference)}</strong><p>{summary.difference === 0 ? (summary.entries.length ? "Seçili dönemin toplamları eşit." : "Seçili dönemde işlem bulunamadı.") : summary.difference > 0 ? "KVK toplamı ön ödemeler ve giderlerden fazla." : "Ön ödemeler ve giderler KVK toplamından fazla."}</p></div>
      </section>
      {data?.updatedAt && end > data.updatedAt ? <p className={styles.notice}>Seçili bitiş tarihi son KVK onay tarihinden ileride. Sonraki günlere ait mahsuplar henüz işlenmemiş olabilir.</p> : null}
      <section className={styles.details}><h2>İşlem dökümü</h2><p>{dateLabel(start)} – {dateLabel(end)} · {summary.entries.length} işlem · Sayfa {page}/{pageCount}</p>
        <div className={styles.tableWrap}><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th>Tutar</th></tr></thead><tbody>
          {summary.entries.slice((page - 1) * 100, page * 100).map(row => <tr key={`${row.gid}-${row.row}`}><td>{dateLabel(row.date)}</td><td>{row.kind}</td><td>{row.description}</td><td>{money(row.cents)}</td></tr>)}
        </tbody></table></div>
        <nav className={styles.pagination} aria-label="İşlem sayfaları">{page > 1 ? <a href={`?start=${start}&end=${end}&page=${page - 1}`}>← Önceki</a> : null}{page < pageCount ? <a href={`?start=${start}&end=${end}&page=${page + 1}`}>Sonraki →</a> : null}</nav>
      </section>
    </> : null}
  </main>;
}
