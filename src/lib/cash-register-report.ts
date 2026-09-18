import { cashOpeningDifference, calculateCashSummary, type CashCategory, type CashEntry, type CashRow } from './cash-register';

export type ReportStyle = 'title' | 'note' | 'section' | 'header' | 'body' | 'money' | 'input' | 'total' | 'warning';
export type ReportCell = { row: number; col: number; span: number; value: string | number; style: ReportStyle };
export type CashReport = { name: string; cells: ReportCell[]; heights: number[]; columns: number; columnWidth: number };
export const reportStyles: Record<ReportStyle, { fill: string; color: string; bold: boolean; border: boolean; align: 'left' | 'center' | 'right'; size: number }> = {
  title: { fill: '#ffffff', color: '#152b3c', bold: true, border: false, align: 'left', size: 18 },
  note: { fill: '#ffffff', color: '#526777', bold: false, border: false, align: 'left', size: 11 },
  section: { fill: '#dbe3eb', color: '#162c3d', bold: true, border: true, align: 'center', size: 12 },
  header: { fill: '#edf0f3', color: '#162c3d', bold: true, border: true, align: 'center', size: 10 },
  body: { fill: '#fffdf3', color: '#172e40', bold: false, border: true, align: 'left', size: 11 },
  money: { fill: '#fffdf3', color: '#172e40', bold: false, border: true, align: 'right', size: 11 },
  input: { fill: '#fff2cc', color: '#172e40', bold: true, border: true, align: 'right', size: 11 },
  total: { fill: '#e2efda', color: '#1b4332', bold: true, border: true, align: 'right', size: 11 },
  warning: { fill: '#fce4d6', color: '#b91c1c', bold: true, border: true, align: 'right', size: 11 }
};
export function reportLines(value: string | number, width: number, size: number) {
  const text = typeof value === 'number' ? value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
  if(typeof value === 'number') return [text];
  const limit = Math.max(3, Math.floor((width - 12) / (size * 0.64)));
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = []; let line = '';
    for (const word of paragraph.split(' ')) {
      if (line && line.length + word.length + 1 > limit) { lines.push(line); line = ''; }
      let rest = word;
      while (rest.length > limit) { if (line) { lines.push(line); line = ''; } lines.push(rest.slice(0, limit)); rest = rest.slice(limit); }
      line = line ? `${line} ${rest}` : rest;
    }
    lines.push(line); return lines;
  });
}
type Column = { label: string; span: number; field: 'receipt' | 'staff' | 'description' | 'cash' | 'card' | 'assignment' | 'installment' | 'qr' | 'transfer' };
const receipt = (span = 2): Column => ({ label: 'FİŞ NO', span, field: 'receipt' });
const staff = (span = 2): Column => ({ label: 'PERSONEL', span, field: 'staff' });
const money = (field: 'cash' | 'card' | 'assignment' | 'installment' | 'qr' | 'transfer'): Column => ({ label: { cash: 'NAKİT', card: 'KK', assignment: 'TEMLİKLİ', installment: 'SEPETE TAKSİT', qr: 'QR ÖDEME', transfer: 'HAVALE' }[field], span: 2, field });
const description = (label: string, span = 3): Column => ({ label, span, field: 'description' });
const normalize = (name: string) => name.toLocaleLowerCase('tr-TR').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ç/g,'c');
const standard = [
  { name: 'KONTÖRLÜ HAT', match: 'kontorlu hat' },
  { name: 'FATURALI', match: 'faturali' },
  { name: 'YEDEK SİM', match: 'yedek sim' },
  { name: 'CİHAZ / TERMİNAL', match: 'cihaz' },
  { name: 'PAYCELL VE PAYCELL KART', match: 'paycell ve paycell kart' },
  { name: 'AKSESUAR, TEKNİK SERVİS, HİZMET BEDELİ', match: 'aksesuar, teknik servis, hizmet bedeli' },
  { name: 'GİDER', match: 'gider' }
];
const columns: Column[] = [receipt(5), staff(9), description('İŞLEM / ÜRÜN',15),
  ...(['cash','card','assignment','installment','qr','transfer'] as const).map(field=>({...money(field),span:4}))];

/** Shared printable grid for both the PNG and Excel exports. No accounting writes. */
export function buildCashReports(row: CashRow, categories: CashCategory[]): CashReport[] {
  const groups = standard.map(slot => {
    const ids = new Set(categories.filter(c => normalize(c.name) === slot.match).map(c => c.id));
    return { ...slot, entries: row.entries.filter(e => ids.has(e.category_id) || !categories.some(c=>c.id===e.category_id) && normalize(e.category_name || '') === slot.match) };
  });
  const assigned = new Set(groups.flatMap(g => g.entries));
  const extraNames = new Map<string,string>();
  categories.filter(c => c.is_active && !standard.some(s => normalize(c.name) === s.match)).forEach(c => extraNames.set(c.id,c.name));
  row.entries.filter(e => !assigned.has(e)).forEach(e => extraNames.set(e.category_id,categories.find(c => c.id === e.category_id)?.name || e.category_name || 'Diğer işlemler'));
  const extras = [...extraNames].map(([id,name]) => ({name,entries:row.entries.filter(e => e.category_id === id)}));
  const pages = 1;
  const reports: CashReport[] = [];
  function entryValue(entry: CashEntry | undefined, field: Column['field']): string | number {
    if (!entry) return '';
    if (field === 'receipt') return entry.receipt;
    if (field === 'staff') return entry.staff_name || '';
    if (field === 'description') return `${entry.description}${entry.payment === 'free' ? ' (Ücretsiz)' : ''}`;
    if (entry.payment === field) return Number(entry.amount);
    return '';
  }
  function create(name: string, pageLabel: string) {
    const report: CashReport = { name, cells: [], heights: [], columns: 53, columnWidth: 32 };
    const add = (r: number,c: number,span: number,value: string | number,style: ReportStyle) => {
      while(report.heights.length <= r) report.heights.push(24);
      report.cells.push({row:r,col:c,span,value,style});
      const lines = reportLines(value,span*32,reportStyles[style].size);
      report.heights[r] = Math.max(report.heights[r] || 24,lines.length*(reportStyles[style].size+3)+10);
    };
    add(0,0,53,'GÜNLÜK KASA TAKİP VE GİRİŞ FORMU','title');
    add(1,0,53,`${row.name} · ${row.saved ? 'Kaydedilmiş kasa' : 'Giriş yapılmadı'} · ${pageLabel} · Tüm tutarlar TL. KK = kredi kartı.`, 'note');
    add(2,0,7,'KASA BAŞLANGIÇ (DEVİR)','note'); add(2,7,8,Number(row.opening),'input');
    add(2,15,6,'FİŞ BAŞLANGIÇ','note'); add(2,21,6,row.receipt_start,'input');
    add(2,27,3,'TARİH','note'); add(2,30,9,row.entry_date.split('-').reverse().join('.'),'input');
    const difference = cashOpeningDifference(Number(row.opening),row.previousClosing);
    if (difference) add(3,0,53,`Kapanış açılış farkı: ${difference > 0 ? '+' : ''}${difference.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})} TL`,'warning');
    return {report,add};
  }
  function section(add: ReturnType<typeof create>['add'], name: string, r: number, col: number, columns: Column[], entries: CashEntry[], capacity: number) {
    add(r,col,columns.reduce((s,c)=>s+c.span,0),name,'section');
    let c=col; columns.forEach(column => {add(r+1,c,column.span,column.label,'header');c+=column.span;});
    for(let i=0;i<capacity;i++) {c=col;columns.forEach(column=>{add(r+2+i,c,column.span,entryValue(entries[i],column.field),['cash','card','assignment','installment','qr','transfer'].includes(column.field)?'money':'body');c+=column.span;});}
  }
  for(let page=0;page<pages;page++) {
    const {report,add}=create(`${row.name}${pages>1?` ${page+1}`:''}`,`Sayfa ${page+1}/${pages}`);
    let nextRow = 5;
    for(const group of [...groups,...extras]) {
      section(add,group.name.toLocaleUpperCase('tr-TR'),nextRow,0,columns,group.entries,group.entries.length);
      nextRow += group.entries.length + 3;
    }
    const summaryRow = nextRow;
    const calculated=calculateCashSummary(row.opening,row.invoice_cash,row.web_cash,row.cash_in,row.expenses,row.counted);
    const expected=calculated.expected;
    add(summaryRow,0,53,'KASA ÖZETİ · GÜN TOPLAMI','section');
    const summary: [string,number|string,ReportStyle][] = [
      ['FATURA NAKİT TAHSİLAT (+)',Number(row.invoice_cash),'input'],['WEB NAKİT TAHSİLAT (+)',Number(row.web_cash),'input'],
      ['TOPLAM NAKİT TAHSİLAT',calculated.cash,'money'],['POS KK SATIŞLARI (NÖTR)',Number(row.card_in),'money'],
      ['QR ÖDEME (NÖTR)',row.entries.filter(e=>e.payment==='qr').reduce((sum,e)=>sum+Number(e.amount),0),'money'],
      ['HAVALE (NÖTR)',row.entries.filter(e=>e.payment==='transfer').reduce((sum,e)=>sum+Number(e.amount),0),'money'],
      ['GİDER / NAKİT (−)',Number(row.expenses),'money'],['KALAN TUTAR',expected,'total'],
      ['KASADA OLAN',row.saved?Number(row.counted):'','input'],['KASA FARKI',row.saved?Number(row.counted)-expected:'','warning'],
      ...(Number(row.bank_deposit) ? [['ÖNCEDEN BANKAYA AYRILAN',Number(row.bank_deposit),'input'] as [string,number,ReportStyle]] : []),['DEVİR',Number(row.closing),'total']
    ];
    summary.forEach(([label,value,style],i)=>{add(summaryRow+1+i,0,40,label,'body');add(summaryRow+1+i,40,13,value,style);});
    const notesRow = summaryRow + summary.length + 2;
    add(notesRow,0,53,'NAKİT: Yalnızca kasaya giren tutarı yazın. Havale, QR ödeme, temlikli ve sepete taksit satışlar nakit kasayı ve POS toplamını etkilemez.','note');
    add(notesRow+1,0,53,'Fatura ve web tahsilatları özete ayrıca girilir; aynı tahsilatı satış bölümlerinde tekrar saymayın.','note');
    add(notesRow+2,0,53,'Kalan tutar = açılış + fatura + web + nakit satışlar − nakit gider. Kasa farkı = sayılan − beklenen. Devir = elle sayılan para.','note');
    add(notesRow+3,0,53,'Bankaya yatırılan tutar Gider kategorisine nakit işlem olarak girilir. Çok sayfalı raporlarda kasa özeti tüm günün toplamıdır.','note');
    if(row.note) add(notesRow+4,0,53,`Gün notu: ${row.note}`,'note');
    reports.push(report);
  }
  return reports;
}
