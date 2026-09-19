const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(file) {
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  const module = {exports:{}};new Function('module','exports','require',js)(module,module.exports,name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name));return module.exports;
}
const { calculateCashEntries, cashToday, validCashDate, cashOpeningDifference, previousCashDate } = load('src/lib/cash-register.ts');
test('opening warning compares exact previous calendar day including month and year boundaries', () => {
  assert.equal(previousCashDate('2026-01-01'),'2025-12-31');
  assert.equal(previousCashDate('2024-03-01'),'2024-02-29');
  assert.equal(cashOpeningDifference(1000,1000),0);
  assert.equal(cashOpeningDifference(1050,1000),50);
  assert.equal(cashOpeningDifference(950,1000),-50);
  assert.equal(cashOpeningDifference(1000,null),null);
  assert.equal(cashOpeningDifference(0.1+0.2,0.3),0);
  assert.equal(cashOpeningDifference(0.01,0),0.01);
});
const { buildXlsxBuffer } = load('src/lib/export/xlsx.ts');
const { buildCashReports } = load('src/lib/cash-register-report.ts');
const reportRow = {name:'Örnek Şube',store_id:'demo',entry_date:'2026-09-17',opening:1000,closing:1200,cash_in:400,card_in:600,transfer_in:0,expenses:200,bank_deposit:0,counted:1200,invoice_cash:0,web_cash:0,receipt_start:'001',note:'Test',revision:1,saved:true,hasPrior:true,previousClosing:1000,entries:[]};
test('reference form preserves financing columns, summary and non-overlapping grid',()=>{
  const reports=buildCashReports(reportRow,[]);
  assert.equal(reports.length,1);
  assert.ok(reports[0].cells.some(c=>c.value==='TEMLİKLİ'));
  assert.ok(reports[0].cells.some(c=>c.value==='SEPETE TAKSİT'));
  assert.ok(reports[0].cells.some(c=>c.value==='KASA ÖZETİ · GÜN TOPLAMI'));
  const occupied=new Set();
  for(const cell of reports[0].cells) for(let col=cell.col;col<cell.col+cell.span;col++) {
    assert.ok(col<reports[0].columns);const key=cell.row+':'+col;assert.ok(!occupied.has(key),key);occupied.add(key);
  }
});
test('overflow transactions and custom categories remain in continuation forms',()=>{
  const entries=Array.from({length:8},(_,i)=>({category_id:'device',category_name:'Cihaz',receipt:'receipt-'+i,staff_name:'Ömer',description:'Telefon',payment:'assignment',amount:45000}));
  entries.push({category_id:'custom',category_name:'Yeni Kategori',receipt:'custom-1',staff_name:'Sude',description:'Özel işlem',payment:'installment',amount:2000});
  const reports=buildCashReports({...reportRow,entries},[]);
  assert.equal(reports.length,1);
  assert.ok(reports[0].cells.some(c=>c.value==='custom-1'));
  const values=reports.flatMap(r=>r.cells.map(c=>c.value));
  for(const e of entries) assert.equal(values.filter(v=>v===e.receipt).length,1);
  assert.ok(values.includes('Yeni Kategori'.toLocaleUpperCase('tr-TR')));
});
test('form XLSX contains merged category grids and landscape print setup',()=>{
  const report=buildCashReports(reportRow,[])[0];
  const output=buildXlsxBuffer([{name:report.name,rows:[],report}]).toString('utf8');
  assert.ok(output.includes('<mergeCells'));
  assert.ok(output.includes('orientation="landscape"'));
  assert.ok(output.includes('GÜNLÜK KASA TAKİP VE GİRİŞ FORMU'));
  assert.ok(output.includes('FFfff2cc'));
});
const entry = (payment,amount,kind='income') => ({category_id:'1',payment,amount,kind});
test('temlikli and installment never change cash, expenses or POS', () => {
  const normal = [entry('cash',1500),entry('card',760),entry('cash',200,'expense')];
  const result = calculateCashEntries([...normal,entry('assignment',45000),entry('installment',12000)],[]);
  assert.deepEqual(result,{income:1500,expense:200,card:760,assignment:45000,installment:12000,qr:0,transfer:0});
});
test('neutral and free transactions do not count as cash; removed category snapshot remains usable', () => {
  const result = calculateCashEntries([entry('cash',500,'neutral'),entry('free',200),entry('cash',40,'expense')],[]);
  assert.equal(result.income,0);assert.equal(result.expense,40);
});
test('cash arithmetic sums in kuruş', () => {
  assert.equal(calculateCashEntries([entry('cash',0.1),entry('cash',0.2)],[]).income,0.3);
});
test('daily lock uses Istanbul midnight and rejects invalid dates', () => {
  assert.equal(cashToday(new Date('2026-09-17T20:59:59Z')),'2026-09-17');
  assert.equal(cashToday(new Date('2026-09-17T21:00:00Z')),'2026-09-18');
  assert.equal(validCashDate('2026-02-30'),false);assert.equal(validCashDate('2026-02-28'),true);
  assert.equal(validCashDate('2026-9-17'),false);
});
test('Excel is a real XLSX zip; user text cannot become formulas', () => {
  const output = buildXlsxBuffer([{name:'Kasa Özeti',rows:[['Şube','Tutar'],['=1+1',123.45],['A&B <şube>',0]]}]);
  const entries = {};let offset = 0;
  while (output.readUInt32LE(offset) === 0x04034b50) {
    const length = output.readUInt32LE(offset+18), nameLength=output.readUInt16LE(offset+26), extraLength=output.readUInt16LE(offset+28);
    const name=output.subarray(offset+30,offset+30+nameLength).toString();
    const start=offset+30+nameLength+extraLength;entries[name]=output.subarray(start,start+length).toString();offset=start+length;
  }
  assert.ok(entries['[Content_Types].xml']);assert.ok(entries['xl/workbook.xml'].includes('Kasa Özeti'));
  assert.match(entries['xl/worksheets/sheet1.xml'],/t="inlineStr"[^]*=1\+1/);
  assert.ok(!entries['xl/worksheets/sheet1.xml'].includes('<f>'));
  assert.ok(entries['xl/worksheets/sheet1.xml'].includes('<v>123.45</v>'));
  assert.ok(entries['xl/worksheets/sheet1.xml'].includes('A&amp;B &lt;şube&gt;'));
});

 test('new empty admin categories appear on the first image and Excel form',()=>{
  const reports=buildCashReports(reportRow,[{id:'new',name:'Yeni Hizmet',kind:'income',is_active:true}]);
  assert.ok(reports[0].cells.some(c=>c.value==='YENİ HİZMET'));
  const output=buildXlsxBuffer([{name:reports[0].name,rows:[],report:reports[0]}]).toString('utf8');
  assert.ok(output.includes('YENİ HİZMET'));
  assert.ok(reports[0].heights.every(h=>Number.isFinite(h)&&h>0));
 });

test('invoice and web cash change expected cash but carryover remains physically counted money',()=>{
 const {calculateCashSummary}=load('src/lib/cash-register.ts');
 assert.deepEqual(calculateCashSummary(100,20,30,50,10,180),{cash:100,expected:190,difference:-10,closing:180});
 assert.equal(calculateCashSummary(0,0.1,0.2,0,0,0.3).difference,0);
 const report=buildCashReports({...reportRow,invoice_cash:20,web_cash:30},[])[0];
 const label=report.cells.find(c=>c.value==='TOPLAM NAKİT TAHSİLAT');
 assert.equal(report.cells.find(c=>c.row===label.row&&c.col===label.col+label.span).value,450);
});

test('all category tables use exact entry counts and precede the final summary',()=>{
 const categories=[{id:'device',name:'Cihaz',is_active:true},{id:'new',name:'Yeni Hizmet',is_active:true}];
 const entries=Array.from({length:37},(_,i)=>({category_id:'device',category_name:'Cihaz',receipt:'r'+i,staff_name:'Ali',description:'Telefon',payment:'cash',amount:100}));
 entries.push({...entries[0],category_id:'new',category_name:'Yeni Hizmet',receipt:'new-1'});
 const report=buildCashReports({...reportRow,entries},categories)[0];
 const summary=report.cells.find(c=>c.value==='KASA ÖZETİ · GÜN TOPLAMI');
 const sections=report.cells.filter(c=>c.style==='section'&&c!==summary);
 assert.ok(sections.every(c=>c.row<summary.row&&c.col===0&&c.span===53));
 const bodyRows=new Set(report.cells.filter(c=>c.row<summary.row&&c.style==='body').map(c=>c.row));
 assert.equal(bodyRows.size,entries.length);
 for(const e of entries) assert.equal(report.cells.filter(c=>c.value===e.receipt).length,1);
 const occupied=new Set();
 for(const c of report.cells) for(let x=c.col;x<c.col+c.span;x++) {const key=c.row+':'+x;assert.ok(!occupied.has(key));occupied.add(key);}
 assert.ok(report.heights.every(h=>Number.isFinite(h)&&h>0));
});

test('QR income and expense payments never alter cash or POS and remain visible in exports',()=>{
 const result=calculateCashEntries([entry('cash',100),entry('qr',250),entry('qr',40,'expense')],[]);
 assert.deepEqual(result,{income:100,expense:0,card:0,assignment:0,installment:0,qr:290,transfer:0});
 const report=buildCashReports({...reportRow,entries:[{...entry('qr',250),category_name:'QR Test',receipt:'qr-1',staff_name:'Ali',description:'Ödeme'}]},[])[0];
 const receipt=report.cells.find(c=>c.value==='qr-1');
 const header=report.cells.find(c=>c.row===receipt.row-1&&c.value==='QR ÖDEME');
 assert.equal(report.cells.find(c=>c.row===receipt.row&&c.col===header.col).value,250);
 const xlsx=buildXlsxBuffer([{name:report.name,rows:[],report}]).toString('utf8');
 assert.ok(xlsx.includes('QR ÖDEME'));
});

test('category payment settings cover all types and preserve legacy defaults',()=>{
 const {categoryPayments}=load('src/lib/cash-register.ts');
 assert.deepEqual(categoryPayments({allowed_payments:['qr']}),['qr']);
 assert.deepEqual(categoryPayments({allowed_payments:['cash','card','qr','assignment','installment','free']}),['cash','card','qr','assignment','installment','free']);
 assert.ok(!categoryPayments({allow_assignment:false,allow_installment:false}).includes('assignment'));
 assert.ok(categoryPayments({allow_assignment:true}).includes('assignment'));
});
test('renamed categories do not duplicate transactions in the report',()=>{
 const categories=[{id:'renamed',name:'Yeni cihaz adı',is_active:true}];
 const entries=[{category_id:'renamed',category_name:'Cihaz',receipt:'unique',description:'Telefon',payment:'qr',amount:100}];
 const report=buildCashReports({...reportRow,entries},categories)[0];
 assert.equal(report.cells.filter(c=>c.value==='unique').length,1);
 assert.ok(report.cells.some(c=>c.value==='YENİ CİHAZ ADI'));
});

test('bank transfer is separate from physical cash and appears in the form and Excel',()=>{
 const result=calculateCashEntries([entry('cash',100),entry('transfer',250),entry('transfer',40,'expense')],[]);
 assert.equal(result.income,100);assert.equal(result.expense,0);assert.equal(result.card,0);assert.equal(result.transfer,290);
 const row={...reportRow,entries:[{...entry('transfer',250),category_name:'Transfer',receipt:'bank-1',description:'Havale'}]};
 const report=buildCashReports(row,[])[0];const receipt=report.cells.find(c=>c.value==='bank-1');
 const header=report.cells.find(c=>c.row===receipt.row-1&&c.value==='HAVALE');
 assert.equal(report.cells.find(c=>c.row===receipt.row&&c.col===header.col).value,250);
 assert.ok(buildXlsxBuffer([{name:report.name,rows:[],report}]).toString('utf8').includes('HAVALE'));
});


test('PDF export embeds fonts and paginates long category tables',async()=>{
  const {buildCashPdf}=load('src/lib/cash-register-pdf.ts');
  const entries=Array.from({length:100},(_,i)=>({category_id:'new',category_name:'Yeni Kategori',receipt:String(i),staff_name:'Ömer Şahin',description:'Ödeme',payment:'transfer',amount:250}));
  const pdf=await buildCashPdf(buildCashReports({...reportRow,entries},[]));
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  const raw=pdf.toString('latin1');
  assert.ok((raw.match(/\/Type \/Page\b/g)||[]).length>1);
  assert.ok(raw.includes('/FontFile2'));
});


test('historical cash editing requires explicit permission and never allows future or invalid dates',()=>{
  const {canEditCashDate}=load('src/lib/cash-register.ts');
  for(const allowed of [false,true]) {
    assert.equal(canEditCashDate('2026-09-19',allowed,'2026-09-19'),true);
    assert.equal(canEditCashDate('2026-09-20',allowed,'2026-09-19'),false);
    assert.equal(canEditCashDate('2026-02-30',allowed,'2026-09-19'),false);
    assert.equal(canEditCashDate('',allowed,'2026-09-19'),false);
  }
  assert.equal(canEditCashDate('2026-09-18',false,'2026-09-19'),false);
  assert.equal(canEditCashDate('2026-09-18',true,'2026-09-19'),true);
});
