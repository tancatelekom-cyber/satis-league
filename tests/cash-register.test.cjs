const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(file) {
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
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
  assert.equal(reports.length,3);
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
  assert.deepEqual(result,{income:1500,expense:200,card:760,assignment:45000,installment:12000});
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
