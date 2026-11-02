const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}, extra = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, Intl, Date, URLSearchParams, ...extra, require: name => { if (imports[name]) return imports[name]; throw Error(name); } });
  return module.exports;
}
const periods = load('src/lib/goal-periods.ts');
const personnelCsv = 'A,B,C,D,E,F,G,H\nAli,Adet,Hat,100,50,Sube,1,2026-10\nAli,Adet,Hat,200,70,Sube,1,01.11.2026\nAli,Adet,Hat,50,20,Sube,1,2025-11\nAli,Adet,Hat,20,5,Sube,1,bozuk';
const storeCsv = 'A,B,C,D,E,F,G,H,I,J,K\nSube,Adet,Hat,100,50,E,E,H,,,2026-10\nSube,Adet,Hat,200,70,E,E,H,,,2026-11';
const goals = load('src/lib/goal-actuals.ts', {
  './goal-periods': periods,
  '@/lib/goal-target-adjustments': { calculateAdjustedGoalTarget: (target, increase) => target * (1 + increase / 100) }
}, { fetch: async url => ({ ok: true, text: async () => url.includes('gid=650800232') ? storeCsv : personnelCsv }) });
test('parses monthly dates and Turkish month names, rejecting invalid months', () => {
  for (const value of ['2026-11', '2026-11-01', '01.11.2026', '11/2026', 'Kasım 2026']) assert.equal(periods.parseGoalPeriod(value), '2026-11');
  for (const value of ['', '2026-13', 'bozuk']) assert.equal(periods.parseGoalPeriod(value), null);
});
test('personnel H and store K isolate months and years without invalid records', async () => {
  assert.equal((await goals.fetchGoalActualRows('2026-10'))[0].actual, 50);
  assert.equal((await goals.fetchGoalActualRows('2026')).length, 2);
  assert.equal((await goals.fetchGoalStoreRows('2026-11'))[0].target, 200);
  assert.equal((await goals.fetchGoalActualRows('2024')).length, 0);
  assert.equal((await goals.fetchGoalActualRows('all')).length, 4);
});
test('year combines matching personnel and store categories', async () => {
  const employees = periods.aggregateGoalPersonnelYear(await goals.fetchGoalActualRows('2026'));
  assert.equal(employees.length, 1); assert.equal(employees[0].actual, 120); assert.equal(employees[0].target, 300);
  const stores = periods.aggregateGoalStoreYear(await goals.fetchGoalStoreRows('2026'));
  assert.equal(stores.length, 1); assert.equal(stores[0].actual, 120); assert.equal(stores[0].target, 300);
  assert.equal(stores[0].includeProjection, false);
});
test('year averages percentage metrics instead of summing percentages', () => {
  const rows = [80, 100].map(actual => ({ storeCode: 'A', mainCategory: 'Oran', subCategory: '', target: 90, actual, targetIsPercent: true, actualIsPercent: true, companyMode: 'average' }));
  const result = periods.aggregateGoalStoreYear(rows)[0];
  assert.equal(result.target, 90); assert.equal(result.actual, 90);
});
test('branch overrides and increases apply only to their own month', async () => {
  const rows = await goals.fetchGoalStoreRows('all');
  const adjusted = goals.applyGoalStoreTargetAdjustments(rows, [{ storeCode: 'Sube', categoryName: 'Adet', periodMonth: '2026-10', increasePercent: 10 }]);
  assert.ok(Math.abs(adjusted[0].target - 110) < 0.00001); assert.equal(adjusted[1].target, 200);
  const overridden = goals.applyGoalStoreFullAchievementOverrides(rows, [{ storeCode: 'Sube', categoryName: 'Adet', periodMonth: '2026-10' }]);
  assert.equal(overridden[0].target, 50); assert.equal(overridden[1].target, 200);
});
test('annual achievement preserves each monthly cap', () => {
  const rows = [50, 200].map((actual, index) => ({ storeCode: 'A', mainCategory: 'Adet', subCategory: '', target: 100, actual, actualCap: 100, actualCapIsPercent: true, actualCapScope: 'company', companyMode: 'sum', periodMonth: `2026-${index + 10}` }));
  const annual = periods.aggregateGoalStoreYear(rows)[0];
  assert.equal(goals.getGoalAchievementActual(annual, 'company'), 150);
  assert.equal(goals.getGoalAchievementActual(annual, 'store'), 250);
});

test('opening report selects latest available month when current month has no store data', () => {
  assert.equal(periods.resolveGoalReportPeriod('', '2026-11', ['2026-10']), '2026-10');
  assert.equal(periods.resolveGoalReportPeriod('', '2026-11', ['2026-10', '2026-11']), '2026-11');
  assert.equal(periods.resolveGoalReportPeriod('', '2026-11', []), '2026-11');
});
test('explicit monthly and yearly choices are preserved even without matching data', () => {
  assert.equal(periods.resolveGoalReportPeriod('2026-11', '2026-11', ['2026-10']), '2026-11');
  assert.equal(periods.resolveGoalReportPeriod('2025', '2026-11', ['2026-10']), '2025');
});

test('quarters match only their three calendar months in the selected year', () => {
  for (let quarter = 1; quarter <= 4; quarter++) {
    const selection = `2026-Q${quarter}`;
    assert.equal(periods.resolveGoalReportPeriod(selection, '2026-11', []), selection);
    assert.match(periods.goalPeriodLabel(selection), new RegExp(`Q${quarter}`));
    for (let month = 1; month <= 12; month++) {
      assert.equal(periods.goalPeriodMatches(`2026-${String(month).padStart(2, '0')}`, selection), Math.ceil(month / 3) === quarter);
      assert.equal(periods.goalPeriodMatches(`2025-${String(month).padStart(2, '0')}`, selection), false);
    }
  }
  assert.equal(periods.goalPeriodMatches(null, '2026-Q4'), false);
  assert.equal(periods.resolveGoalReportPeriod('2026-Q5', '2026-11', []), '2026-11');
});
test('quarter totals include matching monthly rows only', async () => {
  const rows = await goals.fetchGoalStoreRows('2026-Q4');
  const summary = periods.aggregateGoalStoreYear(rows)[0];
  assert.equal(summary.target, 300);
  assert.equal(summary.actual, 120);
  assert.equal((await goals.fetchGoalStoreRows('2026-Q3')).length, 0);
});
