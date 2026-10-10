const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/lib/personnel-query-metrics.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(source, { module: mod, exports: mod.exports });
const { parsePersonnelQueryTotals: parse, queryRatio } = mod.exports;
const row = (id, counts) => {
  const cells = Array(12).fill('');
  cells[1] = '"Adı\nSoyadı"';
  [2, 3, 5, 8, 9].forEach((col, i) => cells[col] = counts[i]);
  cells[11] = id;
  return cells.join(',');
};
const header = ',,Sorgu Adet,,,,,,Adres Sorgu';
test('matches L by ID, skips headings, handles quoted newlines and aggregates counts before rates', () => {
  const csv = [',,,,Sorgu&Satış', header, row('A', [10, 7, 2, 9, 3]), row('a', [20, 10, 1, 1, 0]), row('B', [999, 999, 999, 999, 999])].join('\r\n');
  const result = parse(csv, [' a ', 'A']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { terminalQueries: 30, scoredCustomers: 17, terminalSales: 3, superonlineQueries: 10, superonlineSales: 3 });
  assert.equal(queryRatio(result.terminalSales, result.terminalQueries), .1);
  assert.equal(queryRatio(result.superonlineSales, result.superonlineQueries), .3);
  assert.equal(queryRatio(result.terminalQueries, 5), 6);
  assert.equal(parse(csv, ['missing']), null);
});
test('zero counts remain zero, zero denominators are unavailable and malformed data is not zero', () => {
  assert.equal(parse(header + '\n' + row('A', [0, 0, 0, 0, 0]), ['A']).terminalQueries, 0);
  assert.equal(queryRatio(0, 10), 0);
  assert.equal(queryRatio(0, 0), null);
  assert.equal(queryRatio(10, -1), null);
  assert.throws(() => parse(header + '\n' + row('A', ['#YOK', 0, 0, 0, 0]), ['A']));
  assert.throws(() => parse('<html>Sign in</html>', ['A']));
  assert.equal(parse(header + '\n' + row('A', ['1.234', 0, 0, 0, 0]), ['A']).terminalQueries, 1234);
});

test('store totals include selected personnel once and calculate weighted conversion', () => {
  const csv = [header, row('A', [10, 7, 2, 9, 3]), row('B', [90, 60, 9, 1, 1]), row('OTHER', [999, 999, 999, 999, 999])].join('\n');
  const totals = parse(csv, ['A', 'B', 'A']);
  assert.equal(totals.terminalQueries, 100);
  assert.equal(totals.terminalSales, 11);
  assert.equal(totals.scoredCustomers, 67);
  assert.equal(queryRatio(totals.terminalSales, totals.terminalQueries), 0.11);
  assert.equal(queryRatio(totals.superonlineSales, totals.superonlineQueries), 0.4);
  assert.equal(queryRatio(totals.terminalQueries, 5), 20);
});
