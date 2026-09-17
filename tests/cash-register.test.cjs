const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module = {exports:{}};new Function('module','exports','require',js)(module,module.exports,require);return module.exports;
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
