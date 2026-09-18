"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { cashMoney, cashTotals, type CashCategory, type CashRow } from '@/lib/cash-register';
import { buildCashReports } from '@/lib/cash-register-report';
import { drawCashReport } from '@/lib/cash-register-report-image';

export function CashRegisterShare({ rows, date, categories }: { rows: CashRow[]; date: string; categories: CashCategory[] }) {
  const [message,setMessage]=useState('');
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState(0);
  const [preview,setPreview]=useState<{url:string;file:File}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const reports=useMemo(()=>rows.flatMap(row=>buildCashReports(row,categories)),[rows,categories]);
  const totals=cashTotals(rows);
  const text=[`TANCA+ Kasa Özeti · ${date}`,...rows.map(r=>`${r.name}${r.saved?'':' (Giriş yapılmadı)'}: Açılış ${cashMoney(Number(r.opening))} · Nakit giriş ${cashMoney(Number(r.cash_in)+Number(r.invoice_cash)+Number(r.web_cash))} · Havale ${cashMoney(r.entries.filter(e=>e.payment==='transfer').reduce((sum,e)=>sum+Number(e.amount),0))} · Gider ${cashMoney(Number(r.expenses))} · Devir ${cashMoney(Number(r.closing))}`),`Toplam devir: ${cashMoney(totals.closing)}`].join('\n');
  useEffect(()=>{
    if(!open) return;
    let cancelled=false;let url='';
    setPreview(null);setMessage('');
    const report=reports[selected];if(!report) return;
    try {
      drawCashReport(report).toBlob(blob=>{
        if(cancelled) return;
        if(!blob) {setMessage('Görsel oluşturulamadı.');return;}
        url=URL.createObjectURL(blob);
        const name=report.name.replace(/[^\p{L}\p{N}_-]+/gu,'-');
        setPreview({url,file:new File([blob],`kasa-${name}-${date}.png`,{type:'image/png'})});
      },'image/png');
    } catch {setMessage('Görsel oluşturulamadı.');}
    return ()=>{cancelled=true;if(url) URL.revokeObjectURL(url);};
  },[open,selected,reports,date]);
  function download() {
    if(!preview) return;
    const link=document.createElement('a');link.href=preview.url;link.download=preview.file.name;link.click();
  }
  async function share() {
    if(!preview) return;
    try {
      if(navigator.canShare?.({files:[preview.file]})) await navigator.share({files:[preview.file],title:'Günlük kasa takip formu'});
      else {download();setMessage('Form PNG olarak indirildi; WhatsApp üzerinden ekleyebilirsiniz.');}
    } catch(error) {if(!(error instanceof DOMException && error.name==='AbortError')) setMessage('Paylaşım açılamadı. PNG indir düğmesini kullanabilirsiniz.');}
  }
  return <div className="cash-share">
    <a className="cash-export" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp’ta paylaş</a>
    <button type="button" disabled={!reports.length} onClick={()=>{setSelected(0);setOpen(true);dialog.current?.showModal();}}>Resim olarak paylaş</button>
    <dialog ref={dialog} className="cash-report-dialog" onClose={()=>{setOpen(false);setPreview(null);}} aria-labelledby="cash-report-title">
      <div className="cash-report-toolbar"><div><h2 id="cash-report-title">Günlük kasa takip formu</h2><small>Kaydedilmiş veriler · {date}</small></div><button type="button" onClick={()=>dialog.current?.close()}>Kapat</button></div>
      {reports.length>1&&<label>Şube / Sayfa<select value={selected} onChange={e=>setSelected(Number(e.target.value))}>{reports.map((r,i)=><option key={i} value={i}>{r.name}</option>)}</select></label>}
      <div className="cash-report-preview">{preview?<img src={preview.url} alt="Kategori tabloları ve kasa özetini içeren günlük kasa formu"/>:<p>Form hazırlanıyor…</p>}</div>
      <div className="cash-report-toolbar"><span role="status">{message||'Excel çıktısı da bu form düzenindedir.'}</span><div className="cash-share"><button type="button" disabled={!preview} onClick={download}>PNG indir</button><button type="button" disabled={!preview} onClick={share}>Görseli paylaş</button></div></div>
    </dialog>
  </div>;
}
