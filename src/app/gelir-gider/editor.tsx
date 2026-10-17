"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RevenueExpenseRow } from "@/lib/revenue-expense";
import { saveRevenueExpense, importRevenueExpense, deleteRevenueExpense } from "./actions";

export function RevenueExpenseEditor({ rows, stores }: { rows: RevenueExpenseRow[]; stores: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<RevenueExpenseRow | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const requestId = useRef<string | null>(null);
  const visible = rows.filter(row => `${row.storeName} ${row.category} ${row.periodLabel} ${row.kind}`.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))).sort((a,b) => b.periodKey.localeCompare(a.periodKey));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
  const fieldStyle = { display: "grid", gap: 6 };
  return <section className="guide-card" style={{ padding: 20, marginBottom: 24 }}>
    <h2>{editing ? "Gelir / gider kaydını düzenle" : "Yeni gelir / gider kaydı"}</h2>
    <p>Kayıtlar veritabanında saklanır. Aşağıdaki listeden kayıtları düzenleyebilir veya silebilirsiniz.</p>
    <form id="revenue-entry-form" key={editing?.id ?? "new"} onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      if (!requestId.current) requestId.current = crypto.randomUUID();
      data.set("requestId", requestId.current);
      startTransition(async () => {
        try {
          const result = await saveRevenueExpense(data); setMessage(result.message);
          if (result.ok) { requestId.current = null; setEditing(null); form.reset(); router.refresh(); }
        } catch { setMessage("İşlem tamamlanamadı. Oturumunuzu ve bağlantınızı kontrol edin."); }
      });
    }}>
      <input type="hidden" name="id" value={editing?.id ?? ""} />
      <input type="hidden" name="updatedAt" value={editing?.updatedAt ?? ""} />
      <fieldset disabled={pending} style={{ border: 0, padding: 0, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <label style={fieldStyle}>Mağaza<input name="store" list="revenue-stores" maxLength={150} required defaultValue={editing?.storeName ?? ""} /></label>
        <datalist id="revenue-stores">{stores.map(store => <option key={store} value={store} />)}</datalist>
        <label style={fieldStyle}>Tür<select name="kind" defaultValue={editing?.kind ?? "gelir"}><option value="gelir">Gelir</option><option value="gider">Gider</option></select></label>
        <label style={fieldStyle}>Kategori<input name="category" list="revenue-categories" maxLength={150} required defaultValue={editing?.category ?? ""} /></label>
        <datalist id="revenue-categories">{[...new Set(rows.map(row => row.category))].map(category => <option key={category} value={category} />)}</datalist>
        <label style={fieldStyle}>Yıl<input name="year" type="number" min={2000} max={2100} required defaultValue={editing?.year ?? Number(today.slice(0,4))} /></label>
        <label style={fieldStyle}>Ay<select name="month" defaultValue={editing?.month ?? Number(today.slice(5,7))}>{["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"].map((month,i) => <option key={month} value={i+1}>{month}</option>)}</select></label>
        <label style={fieldStyle}>Tutar (TL)<input name="amount" inputMode="decimal" placeholder="Örn. 1250,50" required defaultValue={editing?.amount ?? ""} /><small>Binlik ayırıcı kullanmayın.</small></label>
        <button className="button-primary" type="submit">{pending ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Kayıt ekle"}</button>
        {editing && <button type="button" onClick={() => {setEditing(null); requestId.current = null;}}>Vazgeç</button>}
      </fieldset>
    </form>
    <p role="status" aria-live="polite">{message}</p>
    <details open><summary>Kayıtları düzenle / sil ({rows.length})</summary>
      <label style={fieldStyle}>Kayıtlarda ara<input value={search} onChange={event => {setSearch(event.target.value); setPage(0);}} placeholder="Mağaza, kategori veya dönem" /></label>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%" }}><thead><tr><th>Mağaza</th><th>Dönem</th><th>Tür</th><th>Kategori</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>
        {visible.slice(page * 25, page * 25 + 25).map(row => <tr key={row.id}><td>{row.storeName}</td><td>{row.periodLabel}</td><td>{row.kind}</td><td>{row.category}</td><td>{row.amount.toLocaleString("tr-TR", {minimumFractionDigits:2})} TL</td><td><button disabled={pending} onClick={() => {setEditing(row); requestId.current = null; setMessage(""); document.getElementById("revenue-entry-form")?.scrollIntoView({behavior:"smooth", block:"start"});}}>Düzenle</button> <button type="button" disabled={pending} style={{color:"#b91c1c"}} onClick={() => {
          if (!window.confirm(row.storeName + " · " + row.periodLabel + " · " + row.category + " · " + row.amount.toLocaleString("tr-TR") + " TL\nBu kayıt kalıcı olarak silinecek. Onaylıyor musunuz?")) return;
          startTransition(async () => {
            try {
              const result = await deleteRevenueExpense(row.id ?? "", row.updatedAt ?? ""); setMessage(result.message);
              if (result.ok) { if (editing?.id === row.id) {setEditing(null); requestId.current = null;} setPage(0); router.refresh(); }
            } catch {setMessage("Silme işlemi tamamlanamadı. Oturumunuzu ve bağlantınızı kontrol edin.");}
          });
        }}>Sil</button></td></tr>)}
        {!visible.length && <tr><td colSpan={6}>Kayıt bulunamadı.</td></tr>}
      </tbody></table></div>
      <button disabled={page === 0} onClick={() => setPage(page-1)}>Önceki</button> <span>{page+1} / {Math.max(1,Math.ceil(visible.length/25))}</span> <button disabled={(page+1)*25 >= visible.length} onClick={() => setPage(page+1)}>Sonraki</button>
    </details>
    <details style={{ marginTop: 18 }}><summary>Eski Google Sheets kayıtlarını aktar</summary><p>Eski kayıtları bir defa aktarır. Mevcut veritabanı kayıtlarını değiştirmez.</p>
      <button disabled={pending} onClick={() => startTransition(async () => { try { const result = await importRevenueExpense(); setMessage(result.message); if(result.ok) router.refresh(); } catch {setMessage("Aktarım tamamlanamadı. Oturumunuzu ve bağlantınızı kontrol edin.");} })}>{pending ? "İşleniyor…" : "Eski kayıtları veritabanına aktar"}</button>
    </details>
  </section>;
}
