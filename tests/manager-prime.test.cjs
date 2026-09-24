const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('src/lib/manager-prime.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const sheet = 'SKALA,REKONTRATLAMA,C,D,E,F,G,H\n0,0,0,0,0,0,0,0\n90%,0,0,0,0,0,0,0\n100%,5000,0,0,0,0,0,0\n110%,5000,0,0,0,0,0,0,0\n120%,5000,0,0,0,0,0,0,0';

async function summary(actual, { target = 1000, workedDays = 30, csv = sheet } = {}) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, URLSearchParams,
    fetch: async () => ({ ok: true, text: async () => csv }),
    require: (name) => {
      if (name === '@/lib/supabase/admin') return { createAdminClient: () => { throw new Error('Use default settings'); } };
      if (name === '@/lib/goal-actuals') return {
        fetchGoalStoreRows: async () => [{ storeCode: 'Test', mainCategory: 'REKONTRATLAMA', actual, target }],
        fetchGoalDayStats: async () => ({ workedDays, totalDays: 30, remainingDays: 30 - workedDays })
      };
      throw new Error(`Unexpected import: ${name}`);
    }
  });
  return module.exports.buildManagerPrimeSummary('Manager', 'Test');
}

test('A/B scales award a fixed amount at boundaries and above the last scale', async () => {
  for (const [actual, expected] of [[0, 0], [899, 0], [900, 0], [999, 0], [1000, 5000], [1099, 5000], [1100, 5000], [1200, 5000], [2000, 5000]]) {
    const result = await summary(actual);
    assert.equal(result.currentRecontractReward, expected, `actual=${actual}`);
    assert.equal(result.currentPrimeTotal, expected);
    assert.equal(result.rows[0].currentBaseValue, expected);
  }
});

test('current and projected rewards use their own achievement scales', async () => {
  const result = await summary(600, { workedDays: 15 });
  assert.equal(result.currentRecontractReward, 0);
  assert.equal(result.projectedRecontractReward, 5000);
  assert.equal(result.projectedPrimeTotal, 5000);
  assert.equal(result.rows[0].projectedScaleLabel, '%120');
  assert.equal(result.opportunities.some(row => row.key === 'recontract'), false);
});

test('opportunity skips nonpaying tiers and uses the fixed incremental reward', async () => {
  const result = await summary(400, { workedDays: 15 });
  const opportunity = result.opportunities.find(row => row.key === 'recontract');
  assert.equal(opportunity.nextScaleLabel, '%100');
  assert.equal(opportunity.estimatedIncrease, 5000);
  assert.equal(opportunity.additionalRequiredTotal, 600);
  assert.equal(opportunity.dailyRequired, 40);
});

test('changed sheet rewards are read dynamically, including higher-paying future tiers', async () => {
  const csv = sheet.replace('120%,5000', '120%,7500');
  const result = await summary(550, { workedDays: 15, csv });
  assert.equal(result.projectedRecontractReward, 5000);
  assert.equal(result.opportunities[0].nextScaleLabel, '%120');
  assert.equal(result.opportunities[0].estimatedIncrease, 2500);
  assert.equal((await summary(1200, { csv })).currentRecontractReward, 7500);
});

test('missing target does not qualify for recontract reward or opportunities', async () => {
  const result = await summary(1000, { target: null, workedDays: 15 });
  assert.equal(result.currentRecontractReward, 0);
  assert.equal(result.projectedRecontractReward, 0);
  assert.equal(result.opportunities.length, 0);
});
