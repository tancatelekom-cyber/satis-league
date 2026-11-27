const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function functions(file, names, context = {}) {
 const text = fs.readFileSync(path.join(root, file), 'utf8');
 const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 const source = ast.statements.filter(s => ts.isFunctionDeclaration(s) && names.includes(s.name?.text)).map(s => s.getText(ast)).join('\n');
 const exports = {};
 vm.runInNewContext(ts.transpileModule(source+'\nexport { '+names.join(',')+' };', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports,...context});
 return exports;
}
const caps = functions('src/lib/goal-actuals.ts', ['goalActualCapApplies','getGoalAchievementActual']);
const page = functions('src/app/hedef-gerceklesen/page.tsx',['buildCompanyRows','buildStoreMetricSummary'],{...caps,average:xs=>xs.reduce((a,b)=>a+b,0)/xs.length});
const dashboard = functions('src/lib/dashboard-success.ts',['aggregateCompanyRows'],caps);
const row=(actual,scope='company')=>({storeCode:'A',mainCategory:'TERMINAL',subCategory:'IOT',target:100,actual,actualCap:110,actualCapIsPercent:true,actualCapScope:scope,includeProjection:true,companyMode:'sum',separateInfo:false});
for (const [name,aggregate] of [['page',rows=>page.buildCompanyRows(rows,15,30)],['dashboard',rows=>dashboard.aggregateCompanyRows(rows,{workedDays:15,totalDays:30,remainingDays:15})]]) {
 test(name+': F caps company total after projecting, allowing stores to compensate',()=>{
  const result=page.buildStoreMetricSummary(aggregate([row(100),row(10)]),15,30,'company');
  assert.equal(result.projectedActual,220);
  assert.ok(Math.abs(result.projectedPercent-110)<1e-9);
 });
 test(name+': F limits projections exceeding company target cap',()=>{
  const result=page.buildStoreMetricSummary(aggregate([row(150),row(50)]),15,30,'company');
  assert.equal(result.projectedActual,220);
 });
 test(name+': SF still caps each store projection',()=>{
  const result=page.buildStoreMetricSummary(aggregate([row(100,'store-and-company'),row(10,'store-and-company')]),15,30,'company');
  assert.equal(result.projectedActual,130);
 });
}
test('F leaves store actuals and projections unrestricted',()=>{
 const result=page.buildStoreMetricSummary([row(150)],15,30,'store');
 assert.equal(result.actual,150);
 assert.equal(result.projectedActual,300);
});
