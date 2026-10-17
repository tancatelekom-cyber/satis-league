const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};new Function('module','exports','require',js)(module,module.exports,require);return module.exports;
}
const {validateRevenueExpense}=load('src/lib/revenue-expense-validation.ts');
const {parseLegacyRevenueExpenseRows}=load('src/lib/revenue-expense.ts');
function form(values={}) {const f=new FormData();for(const [k,v] of Object.entries({store:'Şube',kind:'gelir',category:'Satış',year:'2026',month:'10',amount:'1250,50',...values}))f.set(k,v);return f;}
test('accepts decimal comma and decimal point without multiplying amounts',()=>{
  assert.equal(validateRevenueExpense(form()).amount,1250.5);
  assert.equal(validateRevenueExpense(form({amount:'1250.50'})).amount,1250.5);
});
test('rejects ambiguous money, missing values and invalid periods',()=>{
  for(const amount of ['1.250,50','1,250.50','','NaN','Infinity','2.00000000001','1e5'])assert.throws(()=>validateRevenueExpense(form({amount})));
  for(const values of [{month:'13'},{month:'1.5'},{year:'1999'},{year:'2026.5'},{store:' '},{kind:'other'},{category:''}])assert.throws(()=>validateRevenueExpense(form(values)));
});
test('legacy import preserves duplicate rows, zero amounts, negative adjustments and Turkish periods',()=>{
  const row=['Şube','Gelir','Satış','2026','Şubat','1.250,50'];
  const rows=parseLegacyRevenueExpenseRows([[],row,row,['Şube','Gider','İade','2026','10','-10,25'],['Şube','Gelir','Diğer','2026','1','0'],[]]);
  assert.equal(rows.length,4);assert.equal(rows.filter(r=>r.amount===1250.5).length,2);assert.equal(rows.find(r=>r.amount<0).amount,-10.25);
});
test('legacy import stops instead of silently dropping malformed populated rows',()=>{
  assert.throws(()=>parseLegacyRevenueExpenseRows([[],['Şube','Gelir','Satış','2026','','100']]));
});

test('preserves computed legacy precision and accounting dash',()=>{const rows=parseLegacyRevenueExpenseRows([[],['Şube','Gider','Hesap','2026','1','47030,4259'],['Şube','Gider','Boş','2026','1','-']]);assert.equal(rows[0].amount,47030.4259);assert.equal(rows[1].amount,0);assert.equal(validateRevenueExpense(form({amount:'-10,25'})).amount,-10.25);});
