"use client";
import { useEffect, useRef, useState, useTransition } from 'react';
import { CashMoneyInput } from './cash-money-input';
import { useRouter } from 'next/navigation';
import { saveCashDay } from '@/app/kasa-takip/actions';
import { cashToday, cashMoney, cashPaymentLabels, categoryPayments, calculateCashSummary, cashOpeningDifference, calculateCashEntries, type CashCategory, type CashEntry, type CashRow } from '@/lib/cash-register';

export function CashRegisterEditor({ row, categories, people, editable, suggestions = {} }: { row: CashRow; categories: CashCategory[]; people: { id: string; full_name: string; role: string }[]; editable: boolean; suggestions?: Record<string,string[]> }) {
  const router = useRouter();
  const dockRef = useRef<HTMLElement>(null);
  useEffect(()=>{
    const dock=dockRef.current;
    if(!dock) return;
    const measure=()=>dock.parentElement?.style.setProperty('--cash-dock-height',`${dock.getBoundingClientRect().height}px`);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(dock);
    return ()=>observer.disconnect();
  },[]);
  const categoryPanels = useRef(new Map<string,HTMLElement>());
  const [revision,setRevision] = useState(row.revision);
  const [entries, setEntries] = useState<CashEntry[]>(row.entries);
  const [opening, setOpening] = useState(Number(row.opening));
  const [invoice, setInvoice] = useState(Number(row.invoice_cash));
  const [web, setWeb] = useState(Number(row.web_cash));
  const deposit = editable ? 0 : Number(row.bank_deposit);
  const [counted, setCounted] = useState(Number(row.counted));
  const [receipt, setReceipt] = useState(row.receipt_start);
  const [note, setNote] = useState(row.note);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const locked = !editable || pending;
  const { income, expense, card, assignment, installment, qr, transfer } = calculateCashEntries(entries, categories);
  const summary = calculateCashSummary(opening, invoice, web, income, expense, counted);
  const expected = summary.expected;
  useEffect(()=>{
    if(!dirty) return;
    const warn=(event: BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const openingDifference = cashOpeningDifference(opening, row.previousClosing);
  function update(index: number, changes: Partial<CashEntry>) { setDirty(true); setEntries(list => list.map((e,i) => i === index ? { ...e, ...changes } : e)); }
  function addRow(category: CashCategory, jump = false) {
    if(locked || !category.is_active) return;
    setEntries(list => [...list,{category_id:category.id,receipt:'',staff:'',description:'',cash:0,card:0,payment:categoryPayments(category)[0],amount:0}]);
    setDirty(true);
    if(jump) requestAnimationFrame(()=>{
      const panel=categoryPanels.current.get(category.id);
      const fields=panel?.querySelectorAll<HTMLInputElement>('input[aria-label="İşlem veya ürün"]');
      const target=fields?.[fields.length-1];
      target?.focus({preventScroll:true});
      (target || panel)?.scrollIntoView({behavior:'smooth',block:'center'});
    });
  }
  const shown = categories.filter(c => c.is_active || entries.some(e => e.category_id === c.id));
  const totals = [['Fatura nakit tahsilat (+)', invoice], ['Web nakit tahsilat (+)', web], ['İşlemlerden nakit gelir (+)',income], ['Toplam nakit tahsilat',summary.cash], ['POS kredi kartı (nötr)',card], ['Temlikli satış (nötr)',assignment], ['Sepete taksit (nötr)',installment], ['QR ödeme (nötr)',qr], ['Havale (nötr)',transfer], ['Nakit gider (−)',expense], ['Beklenen kasa', expected], ['Kasada olan', counted], ['Kasa farkı',summary.difference], ...(deposit ? [['Önceden bankaya ayrılan (−)',deposit] as const] : []), ['Yarına devir',counted - deposit]] as const;
  return <form className="cash-editor" onSubmit={event => { event.preventDefault(); if(locked) return; startTransition(async () => { setMessage('Kaydediliyor…'); try { const result = await saveCashDay({ storeId: row.store_id, date: row.entry_date, revision, opening, invoice, web, counted, receipt, note, entries }); if (result.error) setMessage(result.error); else { setRevision(revision+1); setDirty(false); setMessage('Kasa kaydedildi.'); router.refresh(); } } catch { setMessage('Kayıt tamamlanamadı. Bağlantınızı kontrol edin.'); } }); }}>
    <section className="cash-panel"><div className="cash-section-heading"><div><small>ŞUBE GÜNLÜK DEFTERİ</small><h2>{row.name}</h2></div><span className="cash-badge">{editable ? (row.entry_date === cashToday() ? 'Bugün · Düzenlenebilir' : 'Geçmiş gün · Yetkili düzenleme') : 'Geçmiş gün · Salt okunur'}</span></div>
      {!row.saved && !row.hasPrior && <p className="cash-notice">Bu şubenin ilk kasa kaydı. Açılış bakiyesini girip Kasayı kaydet düğmesine basın.</p>}
      <div className="cash-input-grid"><label>Kasa açılışı (₺)<CashMoneyInput value={opening} disabled={locked} aria-describedby="cash-opening-comparison" onValueChange={value => {setOpening(value);setDirty(true);}}/><small id="cash-opening-comparison">{row.previousClosing !== null ? `Bir önceki gün kapanışı: ${cashMoney(row.previousClosing)}` : 'Bir önceki güne ait kapanış kaydı yok.'}</small>{openingDifference !== null && openingDifference !== 0 && <span role="alert" className="cash-opening-warning">Uyarı: Kapanış açılış farkı: {openingDifference > 0 ? '+' : ''}{cashMoney(openingDifference)}</span>}</label><label>Fiş başlangıç no<input value={receipt} disabled={locked} maxLength={100} onChange={e => {setReceipt(e.target.value);setDirty(true);}}/></label></div>
    </section>
    {shown.map(category => <section className="cash-panel cash-category-panel" key={category.id} ref={node=>{if(node) categoryPanels.current.set(category.id,node);else categoryPanels.current.delete(category.id);}}><div className="cash-section-heading"><h2>{category.name}</h2><span className="cash-badge">{category.kind === 'income' ? 'Gelir' : category.kind === 'expense' ? 'Gider' : 'Nötr'}{!category.is_active ? ' · Kaldırılmış' : ''}</span></div>
      <div className="cash-table-scroll"><table><thead><tr><th>Fiş / Fatura no</th><th>Satışı yapan</th><th>İşlem / Ürün</th><th>Tahsilat tipi</th><th>Tutar (₺)</th><th></th></tr></thead><tbody>
        {entries.map((entry,index) => entry.category_id === category.id && <tr key={index}><td><input aria-label="Fiş veya fatura no" value={entry.receipt} maxLength={100} disabled={locked} onChange={e => update(index,{receipt:e.target.value})}/></td><td><select aria-label="Satışı yapan personel" value={entry.staff} required disabled={locked} onChange={e => update(index,{staff:e.target.value})}><option value="">Personel seçin</option>{!people.some(p => p.id === entry.staff) && entry.staff && <option value={entry.staff}>{entry.staff_name || 'Eski personel'}</option>}{people.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.role === 'manager' ? ' (Müdür)' : ''}</option>)}</select></td><td><input list={`cash-products-${category.id}`} aria-label="İşlem veya ürün" value={entry.description} maxLength={250} disabled={locked} onChange={e => update(index,{description:e.target.value})}/></td><td><select aria-label="Tahsilat tipi" value={entry.payment} disabled={locked} onChange={e => update(index,{payment:e.target.value as CashEntry['payment']})}>{!categoryPayments(category).includes(entry.payment) && <option value={entry.payment} disabled>{cashPaymentLabels[entry.payment]} (önceki kayıt)</option>}{categoryPayments(category).map(payment=><option key={payment} value={payment}>{cashPaymentLabels[payment]}</option>)}</select></td><td><CashMoneyInput aria-label="İşlem tutarı" value={entry.amount} disabled={locked} onValueChange={amount => update(index,{amount})}/></td><td>{!locked && <button type="button" className="cash-remove" aria-label="Satırı kaldır" onClick={() => {setEntries(list => list.filter((_,i) => i !== index));setDirty(true);}}>Sil</button>}</td></tr>)}
      </tbody></table></div>
      <datalist id={`cash-products-${category.id}`}>{[...new Set([...(suggestions[category.id] || []),...entries.filter(e=>e.category_id===category.id).map(e=>e.description.trim()).filter(Boolean)])].map(description=><option key={description} value={description}/>)}</datalist>
      {!entries.some(e => e.category_id === category.id) && <p className="cash-empty">Henüz işlem yok.</p>}
      {!locked && category.is_active && <button type="button" className="cash-secondary" onClick={() => addRow(category)}>+ Satır ekle</button>}
    </section>)}
    <section className="cash-panel"><h2>Kasa özeti</h2><div className="cash-input-grid">{[['Fatura nakit tahsilat',invoice,setInvoice],['Web nakit tahsilat',web,setWeb],['Kasada sayılan',counted,setCounted]].map(([label,value,setter]) => <label key={String(label)}>{String(label)} (₺)<CashMoneyInput value={value as number} disabled={locked} onValueChange={amount => {(setter as (value: number) => void)(amount);setDirty(true);}}/></label>)}</div><p className="cash-notice">Fatura ve web nakit tahsilatları toplam nakit tahsilata ve beklenen kasaya eklenir. Yarına devir, elle girilen kasada sayılan tutardır. Bankaya yatırılan tutarı Gider kategorisine nakit işlem olarak girin. Kart, havale, QR ödeme, temlikli ve sepete taksit nakit kasayı etkilemez.</p>
      <dl className="cash-summary">{totals.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{cashMoney(value)}</dd></div>)}</dl><label>Gün notu<textarea value={note} maxLength={2000} disabled={locked} onChange={e => {setNote(e.target.value);setDirty(true);}}/></label>
    </section>
    <nav ref={dockRef} className="cash-category-dock" aria-label="Kategoriye git ve satır ekle">{categories.filter(c=>c.is_active).map(category=><button key={category.id} type="button" disabled={pending} onClick={()=>{if(editable) addRow(category,true);else categoryPanels.current.get(category.id)?.scrollIntoView({behavior:'smooth',block:'start'});}}>{editable ? '+ ' : ''}{category.name}</button>)}</nav>
    <div className="cash-savebar"><span role="status">{(dirty && !pending && message === 'Kasa kaydedildi.' ? '' : message) || (dirty ? 'Kaydedilmemiş değişiklikler var. Kasayı kaydet düğmesine basın.' : 'Raporlar kaydedilen verileri içerir.')}</span>{!locked && <button type="submit">Kasayı kaydet</button>}{pending && <button disabled>Kaydediliyor…</button>}</div>
  </form>;
}
