"use client";
import { useEffect, useRef, useState } from "react";
import type { MarketResult } from "@/lib/market-comparison";
import styles from "./market-comparison.module.css";
export type ComparisonPhone = { key: string; name: string; brand: string; pk: number | null };
const money = (value: number | null) => value === null ? "Fiyat yok" : value.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
type Comparison = { key: string; pk: number | null; checkedAt: string; results: MarketResult[] };

export function MarketComparison({ phones }: { phones: ComparisonPhone[] }) {
  const [key, setKey] = useState(phones[0]?.key ?? "");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const selected = phones.find(phone => phone.key === key);
  const options = phones.filter(phone => `${phone.brand} ${phone.name}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  async function refresh() {
    if (!key || abort.current) return;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(""); setData(null);
    try {
      const res = await fetch("/api/market-comparison", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }), signal: controller.signal });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Fiyatlar okunamadı.");
      setData(result);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Bağlantı hatası oluştu."); }
    finally { abort.current = null; setBusy(false); }
  }
  return <section className={styles.panel}>
    <div className={styles.filters}>
      <label>Telefon ara<input type="search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="Marka veya model" /></label>
      <label>Akıllı telefon<select value={key} disabled={busy} onChange={event => { setKey(event.target.value); setData(null); setError(""); }}>
        {selected && !options.includes(selected) ? <option value={selected.key}>{selected.name}</option> : null}
        {options.map(phone => <option key={phone.key} value={phone.key}>{phone.name}</option>)}
      </select></label>
      <button type="button" disabled={busy || !selected} onClick={refresh}>{busy ? "Fiyatlar alınıyor…" : "Yenile"}</button>
    </div>
    {!options.length ? <p>Aramanıza uygun telefon bulunamadı.</p> : null}
    {selected ? <article className={styles.pk}><span>Bizim PK fiyatımız · {selected.name}</span><strong>{money(data?.key === key ? data.pk : selected.pk)}</strong><small>{data ? "Yenileme sırasında tekrar okundu" : "Sayfa açılışında okundu"}</small></article> : <p>Akıllı telefon kaydı bulunamadı.</p>}
    <p>Yenile, seçili telefonun PK fiyatını ve üç mağazanın güncel arama sonuçlarını yeniden okur. Listelenen eşleşmeler içindeki en düşük peşin fiyat kullanılır. Renk ve satıcı farklı olabilir; sepete özel indirim, üyelik, takas ve kargo dahil değildir.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <div aria-live="polite">{busy ? <p>MediaMarkt, Vatan Bilgisayar ve Turkcell Pasaj kontrol ediliyor…</p> : data ? <p>Son kontrol: {new Date(data.checkedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</p> : <p>Karşılaştırmayı başlatmak için Yenile’ye basın.</p>}</div>
    {data ? <div className={styles.grid}>{data.results.map(result => {
      const price = result.status === "ok" ? result.offer?.price ?? null : null;
      const difference = price !== null && data.pk !== null ? price - data.pk : null;
      return <article className={styles.card} key={result.id}><h2>{result.name}</h2>
        <strong>{price !== null ? money(price) : result.status === "unavailable" ? "Satış fiyatı / stok yok" : result.status === "unmatched" ? "Tam eşleşme bulunamadı" : "Fiyat alınamadı"}</strong>
        {result.errorMessage ? <p role="status">{result.errorMessage}</p> : null}
        {result.offer ? <><p>{result.offer.title}</p><small>Satıcı: {result.offer.seller ?? "Arama sonucunda belirtilmedi"}</small><small>Stok: {result.offer.available === true ? "Var" : result.offer.available === false ? "Satışa uygun değil" : "Doğrulanmadı"}</small></> : null}
        {difference !== null ? <p className={difference >= 0 ? styles.good : styles.expensive}>{difference === 0 ? "PK fiyatımızla aynı" : difference > 0 ? `PK fiyatımız ${money(difference)} daha düşük` : `PK fiyatımız ${money(-difference)} daha yüksek`}</p> : null}
        <a target="_blank" rel="noreferrer" href={result.offer?.url ?? result.searchUrl}>{result.offer ? "Ürünü incele ↗" : "Mağazada ara ↗"}</a>
      </article>;
    })}</div> : null}
  </section>;
}
