const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleShim={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/daily-performance.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleShim,exports:moduleShim.exports,AbortSignal,fetch});
const {parseDailyPerformance,attachPerformanceTargets,dailyPerformanceSeries}=moduleShim.exports;
function csv(){ return 'store,category,sub,id,code,name,2,1,3\n"62 ŞUBE ",AKTİVASYON,SOL,id1,ext,"TEST, USER",4,0,\n,,,,,,,,\n'; }
test('uses day headers rather than column order and preserves missing vs zero',()=>{const rows=parseDailyPerformance(csv());assert.equal(rows.length,1);assert.equal(rows[0].store,'62 ŞUBE');assert.equal(rows[0].days[0],0);assert.equal(rows[0].days[1],4);assert.equal(rows[0].days[2],null);});
test('matches ID, branch and category with explicit SOL alias',()=>{const row=parseDailyPerformance(csv());const targets=[{personnelId:'id1',storeName:'62 ŞUBE',mainCategory:'AKTİVASYON',subCategory:'TOPLAM SOL',target:30}];assert.equal(attachPerformanceTargets(row,targets)[0].monthlyTarget,30);assert.equal(attachPerformanceTargets(row,[{...targets[0],personnelId:'other'}])[0].monthlyTarget,null);assert.equal(attachPerformanceTargets(row,[...targets,...targets])[0].monthlyTarget,null);});
test('requirement uses previous cumulative actual and remaining calendar days',()=>{
 const base=parseDailyPerformance(csv())[0];
 const points=dailyPerformanceSeries([{...base,monthlyTarget:30,days:[10,5,0]}],30,3);
 assert.equal(points[0].target,30/26);
 assert.equal(points[1].remainingTarget,20);
 assert.equal(points[1].target,20/25);
 assert.equal(points[1].percent,5/(20/25)*100);
 assert.equal(points[2].target,15/24);
});
test('incomplete target coverage never produces a partial-denominator percentage',()=>{const row=parseDailyPerformance(csv())[0];const series=dailyPerformanceSeries([{...row,monthlyTarget:30},row],30,2);assert.equal(series[1].actual,8);assert.equal(series[1].percent,null);});

test('overachievement does not offset another persons remaining requirement',()=>{
 const row=parseDailyPerformance(csv())[0];
 const points=dailyPerformanceSeries([{...row,monthlyTarget:10,days:[20,0]}, {...row,personnelId:'two',monthlyTarget:30,days:[0,0]}],30,2);
 assert.equal(points[1].remainingTarget,30);
 assert.equal(points[1].target,30/25);
});
test('missing historical cells suppress subsequent requirements; achieved target has no division by zero',()=>{
 const row=parseDailyPerformance(csv())[0];
 const missing=dailyPerformanceSeries([{...row,monthlyTarget:10,days:[null,2]}],30,2);
 assert.equal(missing[1].target,null);
 const done=dailyPerformanceSeries([{...row,monthlyTarget:10,days:[10,2]}],30,2);
 assert.equal(done[1].target,0);assert.equal(done[1].targetMet,true);assert.equal(done[1].percent,null);
 const last=dailyPerformanceSeries([{...row,monthlyTarget:30,days:Array(31).fill(0)}],30,31);
 assert.equal(last.length,30);assert.equal(last[29].remainingDays,1);assert.equal(last[29].target,30);
});

test('weekly rest allowance and known leave days are not counted twice',()=>{
 const count=moduleShim.exports.remainingPerformanceWorkDays;
 assert.equal(count(30,1),26);assert.equal(count(30,10),18);assert.equal(count(30,30),1);
 assert.equal(count(30,1,[7,14,21,28]),26);
 assert.equal(count(30,1,[2,3,4,5,6,7]),24);
 const row=parseDailyPerformance(csv())[0];
 const series=dailyPerformanceSeries([{...row,monthlyTarget:30,leaveDays:[1],days:[0,0]}],30,2);
 assert.equal(series[0].onLeave,true);assert.equal(series[0].target,0);assert.equal(series[0].percent,null);
 assert.equal(series[1].target,30/25);
});
