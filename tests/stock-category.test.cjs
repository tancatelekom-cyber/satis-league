const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const assert = require('node:assert/strict');
const headers = ['ŞUBE','Ürün Kodu','Ürün Adı','ÜRÜN KISA AD','Ürün Tipi','Miktar','Fatura Tarihi','Stok Yaşı (Gün)','MARKA','Kategori','K','L','M'];
function csv(rows) { return [headers, ...rows].map(row => row.map(v => '"' + String(v).replaceAll('"','""') + '"').join(',')).join('\n'); }
function row(name, qty, category, index) {
 const result = ['A',name,name,name,'CIHAZ',qty,'10.11.2026',35,'Samsung','wrong-header','wrong-K','','wrong-M'];
 result[index] = category;
 return result;
}
async function dashboard(category = '') {
 const exports = {};
 const source = fs.readFileSync(path.join(__dirname,'../src/lib/stock-management.ts'),'utf8');
 const stock = csv([row('Phone',2,'Telefon',10), row('Tablet',3,'Tablet',10)]);
 const sales = csv([row('Phone',4,'Telefon',12), row('Tablet',7,'Tablet',12), row('Watch',1,'Saat',12)]);
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
  exports, Intl, Date, fetch: async url => ({ok:true,text:async()=>url.includes('1234243583')?stock:sales})
 });
 return exports.fetchStockManagementDashboard(new Date('2026-11-17T12:00:00Z'),category);
}
test('K stock and M sales categories scope stock, sales, monthly totals and returns',async()=>{
 const result = await dashboard('Telefon');
 assert.equal(result.totals.currentStock,2);
 assert.equal(result.totals.sales30,4);
 assert.equal(result.monthlySales.reduce((s,r)=>s+r.quantity,0),4);
 assert.equal(result.returnUnits.length,2);
 assert.ok(result.rows.every(r=>r.productName==='Phone'));
 assert.deepEqual(Array.from(result.categories),['Saat','Tablet','Telefon']);
});
test('all categories preserve totals',async()=>{
 const result = await dashboard();
 assert.equal(result.totals.currentStock,5);
 assert.equal(result.totals.sales30,12);
});
test('category with only sales remains available and empty selection has zero totals',async()=>{
 const salesOnly = await dashboard('Saat');
 assert.equal(salesOnly.totals.currentStock,0);
 assert.equal(salesOnly.totals.sales30,1);
 const missing = await dashboard('Missing');
 assert.equal(missing.rows.length,0);
 assert.equal(missing.returnUnits.length,0);
 assert.equal(missing.totals.sales30,0);
});
