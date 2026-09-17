import { getCashData } from '@/lib/cash-register-data';
import { buildXlsxBuffer } from '@/lib/export/xlsx';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { rows, date } = await getCashData(params.get('date') || undefined, params.get('store') || undefined);
  const labels = { cash: 'Nakit', card: 'Kredi kartı', assignment: 'Temlikli', installment: 'Sepete taksit', free: 'Ücretsiz / İşlem' };
  const summary: (string | number)[][] = [['Şube','Tarih','Durum','Açılış','Fatura nakit','Web nakit','İşlem nakit','POS kredi kartı','Nakit gider','Beklenen kasa','Sayılan kasa','Kasa farkı','Bankaya ayrılan','Devir','Temlikli','Sepete taksit']];
  for (const r of rows) {
    const expected = Number(r.opening)+Number(r.invoice_cash)+Number(r.web_cash)+Number(r.cash_in)-Number(r.expenses);
    summary.push([r.name,date,r.saved ? 'Kaydedildi' : 'Giriş yapılmadı',Number(r.opening),Number(r.invoice_cash),Number(r.web_cash),Number(r.cash_in),Number(r.card_in),Number(r.expenses),expected,Number(r.counted),r.saved ? Number(r.counted)-expected : 0,Number(r.bank_deposit),Number(r.closing),r.entries.filter(e => e.payment === 'assignment').reduce((s,e) => s+Number(e.amount),0),r.entries.filter(e => e.payment === 'installment').reduce((s,e) => s+Number(e.amount),0)]);
  }
  summary.push(['TOPLAM',date,'',...Array.from({length:13},(_,i) => summary.slice(1).reduce((sum,r) => sum+Number(r[i+3]),0))]);
  const details: (string | number)[][] = [['Şube','Tarih','Kategori','Fiş / Fatura no','Personel','İşlem / Ürün','Tahsilat tipi','Tutar','Nakit','Kredi kartı']];
  rows.forEach(r => r.entries.forEach(e => details.push([r.name,date,e.category_name || '',e.receipt,e.staff_name || '',e.description,labels[e.payment],Number(e.amount),Number(e.cash),Number(e.card)])));
  const notes: (string | number)[][] = [['Şube','Tarih','Fiş başlangıcı','Gün notu'],...rows.map(r => [r.name,date,r.receipt_start,r.note])];
  const buffer = buildXlsxBuffer([{name:'Kasa Özeti',rows:summary},{name:'İşlem Detayları',rows:details},{name:'Gün Notları',rows:notes}]);
  return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="kasa-${date}.xlsx"`,'Cache-Control':'private, no-store'}});
}
