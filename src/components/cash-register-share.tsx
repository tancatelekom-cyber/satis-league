"use client";
import { useState } from 'react';
import { cashMoney, cashTotals, calculateCashEntries, type CashRow } from '@/lib/cash-register';

export function CashRegisterShare({ rows, date }: { rows: CashRow[]; date: string }) {
  const [message,setMessage] = useState('');
  const totals = cashTotals(rows);
  const text = [`TANCA+ Kasa Özeti · ${date}`, ...rows.map(r => `${r.name}${r.saved ? '' : ' (Giriş yapılmadı)'}: Açılış ${cashMoney(Number(r.opening))} · Nakit giriş ${cashMoney(Number(r.cash_in)+Number(r.invoice_cash)+Number(r.web_cash))} · Gider ${cashMoney(Number(r.expenses))} · Devir ${cashMoney(Number(r.closing))}`), `Toplam devir: ${cashMoney(totals.closing)}`].join('\n');
  async function imageShare() {
    try {
      const selected = rows.length === 1 ? rows[0] : null;
      const details = selected?.entries || [];
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 190 + rows.length * 72 + (selected ? 650 + details.length * 44 : 0);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Görsel oluşturulamadı.');
      ctx.fillStyle='#f1f6f7';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#123c4b';ctx.fillRect(0,0,1200,100);ctx.fillStyle='#fff';ctx.font='bold 30px Arial';ctx.fillText(`TANCA+ · Kasa Özeti · ${date}`,30,60);
      rows.forEach((r,i) => { const y = 145 + i * 72;ctx.fillStyle='#123c4b';ctx.font='bold 21px Arial';ctx.fillText(r.name,30,y,490);ctx.font='18px Arial';ctx.fillText(r.saved ? 'Kaydedildi' : 'Giriş yapılmadı',30,y+24);ctx.fillText(`Açılış ${cashMoney(Number(r.opening))}`,535,y);ctx.fillText(`Devir ${cashMoney(Number(r.closing))}`,860,y); });
      if (selected) {
        const labels = {cash:'Nakit',card:'Kredi kartı',assignment:'Temlikli',installment:'Sepete taksit',free:'Ücretsiz / İşlem'};
        let y = 230;
        ctx.fillStyle='#123c4b';ctx.font='bold 18px Arial';
        ['Kategori / Fiş','Personel','İşlem / Ürün','Tahsilat','Tutar'].forEach((t,i) => ctx.fillText(t,[30,305,540,840,1020][i],y));
        details.forEach(e => {y += 44;ctx.font='16px Arial';ctx.fillStyle='#234c5c';ctx.fillText(`${e.category_name} / ${e.receipt}`,30,y,255);ctx.fillText(e.staff_name || '',305,y,215);ctx.fillText(e.description,540,y,275);ctx.fillText(labels[e.payment],840,y,165);ctx.fillText(cashMoney(Number(e.amount)),1020,y,155);});
        y += 45;
        const finance = calculateCashEntries(details,[]);
        const expected = Number(selected.opening)+Number(selected.invoice_cash)+Number(selected.web_cash)+Number(selected.cash_in)-Number(selected.expenses);
        const summary = [['Fatura nakit',selected.invoice_cash],['Web nakit',selected.web_cash],['İşlem nakit',selected.cash_in],['POS kredi kartı (nötr)',selected.card_in],['Temlikli (nötr)',finance.assignment],['Sepete taksit (nötr)',finance.installment],['Nakit gider',selected.expenses],['Beklenen kasa',expected],['Kasada sayılan',selected.counted],['Kasa farkı',selected.saved ? Number(selected.counted)-expected : 0],['Bankaya ayrılan',selected.bank_deposit]] as const;
        summary.forEach(([label,value]) => {y += 35;ctx.font='19px Arial';ctx.fillText(label,30,y);ctx.font='bold 19px Arial';ctx.fillText(cashMoney(Number(value)),840,y);});
      }
      ctx.fillStyle='#087c70';ctx.font='bold 26px Arial';ctx.fillText(`Toplam devir: ${cashMoney(totals.closing)}`,30,canvas.height-24);
      const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Görsel oluşturulamadı.')),'image/png'));
      const file = new File([blob],`kasa-${date}.png`,{type:'image/png'});
      if (navigator.canShare?.({files:[file]})) { await navigator.share({files:[file],title:'Kasa özeti'});setMessage(''); }
      else { const url = URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(() => URL.revokeObjectURL(url),1000);setMessage('Görsel indirildi; WhatsApp üzerinden ekleyebilirsiniz.'); }
    } catch(error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Görsel paylaşılamadı. Yeniden deneyin.'); }
  }
  return <div className="cash-share"><a className="cash-export" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp’ta paylaş</a><button type="button" onClick={imageShare}>Resim olarak paylaş</button>{message && <span role="status">{message}</span>}</div>;
}
