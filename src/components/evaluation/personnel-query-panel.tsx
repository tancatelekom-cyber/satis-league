import { fetchPersonnelQueryTotals, queryRatio } from "@/lib/personnel-query-metrics";
import styles from "./personnel-query-panel.module.css";

const number = (value: number | null) => value === null ? "—" : value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const percent = (value: number | null) => value === null ? "—" : value.toLocaleString("tr-TR", { style: "percent", maximumFractionDigits: 1 });

export async function PersonnelQueryPanel({ personnelIds, workedDays, scope = "employee" }: { personnelIds: string[]; workedDays: number; scope?: "employee" | "store" }) {
  let totals;
  try { totals = await fetchPersonnelQueryTotals(personnelIds); }
  catch {
    return <section className={styles.panel}><h3>Sorgu ve Satış Dönüşümü</h3><p role="status">Sorgu verileri şu anda okunamıyor. Lütfen daha sonra tekrar deneyin.</p></section>;
  }
  if (!totals) return <section className={styles.panel}><h3>Sorgu ve Satış Dönüşümü</h3><p>{scope === "store" ? "Bu mağazanın personelleriyle eşleşen sorgu kaydı bulunamadı." : "Bu personelin ID’siyle eşleşen sorgu kaydı bulunamadı."}</p></section>;
  const terminal = [
    ["Toplam sorgu", number(totals.terminalQueries)],
    ["Günlük ortalama sorgu", number(queryRatio(totals.terminalQueries, workedDays))],
    ["Puan çıkan müşteri", number(totals.scoredCustomers)],
    ["Puan çıkma oranı (D/C)", percent(queryRatio(totals.scoredCustomers, totals.terminalQueries))],
    ["Puan çıkan müşteriye satış", number(totals.terminalSales)],
    ["Satış oranı (F/D)", percent(queryRatio(totals.terminalSales, totals.scoredCustomers))],
    ["Sorgudan satışa dönüşüm (F/C)", percent(queryRatio(totals.terminalSales, totals.terminalQueries))]
  ];
  const superonline = [
    ["Toplam adres sorgusu", number(totals.superonlineQueries)],
    ["Günlük ortalama sorgu", number(queryRatio(totals.superonlineQueries, workedDays))],
    ["Gerçekleşen satış", number(totals.superonlineSales)],
    ["Satışa dönüşüm oranı (J/I)", percent(queryRatio(totals.superonlineSales, totals.superonlineQueries))]
  ];
  const groups = [{ title: "Terminal", metrics: terminal }, { title: "Superonline", metrics: superonline }];
  return <section className={styles.panel} aria-label={scope === "store" ? "Mağaza sorgu ve satış dönüşümü" : "Personel sorgu ve satış dönüşümü"}>
    <h3>{scope === "store" ? "Mağaza Sorgu ve Satış Dönüşümü" : "Sorgu ve Satış Dönüşümü"}</h3>
    {scope === "store" ? <p>Mağaza personelleri ve müdürlerinin sorgu ve satış adetleri toplanır. Oranlar toplam adetler üzerinden hesaplanır.</p> : null}
    <p>Günlük ortalama = toplam sorgu / hedef ekranındaki geçen gün ({number(workedDays)} gün). {workedDays > 0 ? "" : "Geçen gün bilgisi olmadığı için günlük ortalama hesaplanamıyor."}</p>
    <div className={styles.grid}>{groups.map(({ title, metrics }) =>
      <article key={title} className={styles.card}><h4>{title}</h4><dl>{metrics.map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      )}</dl></article>
    )}</div>
    <p className={styles.note}>Oranların paydası sıfırsa “—” gösterilir. Kaynakta günlük geçmiş bulunmadığından önceki güne göre değişim hesaplanmaz.</p>
  </section>;
}
