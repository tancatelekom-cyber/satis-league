import Link from 'next/link';
import { getCashData } from '@/lib/cash-register-data';
import { cashToday, cashMoney, cashTotals, type CashCategory } from '@/lib/cash-register';
import { createAdminClient } from '@/lib/supabase/admin';
import { CashRegisterEditor } from '@/components/cash-register-editor';
import { CashRegisterShare } from '@/components/cash-register-share';
import './cash.css';

export default async function CashPage({ searchParams }: { searchParams: Promise<{date?:string;store?:string}> }) {
  const params = await searchParams;
  const data = await getCashData(params.date,params.store);
  const { date, rows, stores, allStores, profile } = data;
  const db = createAdminClient();
  const { data: categories, error } = await db.from('cash_register_categories').select('*').order('name');
  if (error) return <main className="cash-page"><p role="alert">Kasa kurulumu tamamlanmamış. Kasa SQL migration dosyasını uygulayın.</p></main>;
  const selected = rows.length === 1 ? rows[0] : null;
  const { data: people } = selected ? await db.from('profiles').select('id,full_name,role').eq('store_id',selected.store_id).eq('approval','approved').order('full_name') : { data: [] };
  const totals = cashTotals(rows);
  const query = new URLSearchParams({date,...(params.store ? {store:params.store} : {})});
  return <main className="cash-page">
    <header className="cash-hero"><div><small>OPERASYON / GÜNLÜK KASA</small><h1>Kasa takip</h1><p>Şube defterleri, günlük tahsilatlar ve kasa devri tek yerde.</p></div>{profile.role === 'admin' && <Link href="/admin/kasa-takip">Yetkiler ve kategoriler →</Link>}</header>
    <section className="cash-panel cash-toolbar"><form className="cash-toolbar"><label>Tarih<input name="date" type="date" defaultValue={date} max={cashToday()}/></label>{allStores && <label>Şube<select name="store" defaultValue={params.store || ''}><option value="">Tüm şubeler</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}<button>Göster</button></form><a className="cash-export" href={`/kasa-takip/excel?${query}`}>Excel indir</a><CashRegisterShare rows={rows} date={date}/></section>
    {allStores && <><div className="cash-metrics">{[['Şube',String(rows.length)],['Açılış toplamı',cashMoney(totals.opening)],['Nakit gider',cashMoney(totals.expenses)],['Devir toplamı',cashMoney(totals.closing)]].map(([label,value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div><section className="cash-panel"><h2>Tüm şubeler · Kasa özeti</h2><div className="cash-table-scroll"><table><thead><tr><th>Şube</th><th>Durum</th><th>Açılış</th><th>Nakit gelir*</th><th>Gider</th><th>Bankaya ayrılan</th><th>Devir</th></tr></thead><tbody>{rows.map(r => <tr key={r.store_id}><td><Link href={`/kasa-takip?date=${date}&store=${r.store_id}`}>{r.name}</Link></td><td>{r.saved ? 'Kaydedildi' : 'Giriş yapılmadı'}</td><td>{cashMoney(Number(r.opening))}</td><td>{cashMoney(Number(r.cash_in)+Number(r.invoice_cash)+Number(r.web_cash))}</td><td>{cashMoney(Number(r.expenses))}</td><td>{cashMoney(Number(r.bank_deposit))}</td><td>{cashMoney(Number(r.closing))}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>TOPLAM</td><td>{cashMoney(totals.opening)}</td><td>{cashMoney(rows.reduce((s,r) => s+Number(r.cash_in)+Number(r.invoice_cash)+Number(r.web_cash),0))}</td><td>{cashMoney(totals.expenses)}</td><td>{cashMoney(totals.deposit)}</td><td>{cashMoney(totals.closing)}</td></tr></tfoot></table></div><p>* Fatura ve web nakit tahsilatı dahildir. Giriş yapılmayan günlerde son devir gösterilir.</p></section></>}
    {!rows.length && <section className="cash-panel">Görüntülenebilecek şube bulunamadı. Şube atamanızı kontrol edin.</section>}
    {selected && <CashRegisterEditor key={`${selected.store_id}-${date}`} row={selected} categories={(categories || []) as CashCategory[]} people={people || []} editable={date === cashToday()}/>}
    {allStores && !selected && <p>Günlük işlem satırlarını görmek veya düzenlemek için bir şube seçin.</p>}
  </main>;
}
