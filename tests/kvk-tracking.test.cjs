const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/kvk-tracking.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Intl,Date,AbortSignal});
const {parseKvkDate:date,parseKvkMoney:money,parseKvkSource:parse,summarizeKvk:sum,KVK_SOURCES:sources,canViewKvk}=mod.exports;
const csv=rows=>rows.map(row=>row.map(c=>'"'+String(c??'').replaceAll('"','""')+'"').join(',')).join('\n');
const row=(cols,values)=>{const r=Array(cols).fill('');for(const [key,value] of Object.entries(values))r[Number(key)]=value;return r;};
test('money is in cents, Turkish grouping and signs are preserved',()=>{
 for(const [input,expected] of [['1.234,56',123456],['1.234',123400],['1234.56',123456],['(10,50)',-1050],['₺ 10,01',1001],['',0],['#YOK',null]])assert.equal(money(input),expected);
 assert.equal(date('31.02.2026'),null);assert.equal(date('23.10.2026 13:40'),'2026-10-23');
});
test('inclusive period, net credits, ignored purchases and latest approval independent of period',()=>{
 const a=parse(csv([['Tarih','Açıklama','','Borç','Alacak'],['01.10.2026','HAVALE','',0,'100,10'],['23.10.2026','İADE','',10,60],['23.10.2026','Cihaz faturası','',999,0],['30.09.2026','Havale','',0,999]]),sources[0]);
 const b=parse(csv([row(16,{5:'Onay tarihi',9:'Temlik fiyatı',15:'Prim',8:'Aktivasyon tarihi',12:'Satış tarihi'}),row(16,{5:'24.10.2026',9:'9876,54',15:'20,20',8:'15.10.2026 16:25:20',12:'15.07.2026'}),row(16,{5:'01.11.2026',9:12345,15:999,8:'01.11.2026 12:00:00',12:'15.10.2026'})]),sources[1]);
 const c=parse(csv([row(34,{12:'Tarih',33:'Ön ödeme'}),row(34,{12:'23.10.2026',33:'200,30'})]),sources[2]);
 const data={entries:[...a.entries,...b.entries,...c.entries],errors:[...a.errors,...b.errors,...c.errors],updatedAt:b.updatedAt};
 assert.equal(data.errors.length,0);assert.equal(data.updatedAt,'2026-11-01');
 const result=sum(data,'2026-10-01','2026-10-23');
 assert.equal(result.entries.length,4);assert.equal(result.matched,17030);assert.equal(result.difference,-3000);
 assert.throws(()=>sum(data,'2026-11-01','2026-10-01'));
});
test('invalid values are reported and combined labels counted only once',()=>{
 const d=parse(csv([['Tarih','Açıklama','','Borç','Alacak'],['23.10.2026','Havale iade','',0,10],['23.10.2026','Havale','',0,'#VALUE!']]),sources[0]);
 assert.equal(d.entries.length,1);assert.equal(d.entries[0].kind,'İade');assert.equal(d.errors.length,1);
 assert.throws(()=>parse('<html>Login</html>',sources[0]));
});
test('only approved admin and management can view KVK',()=>{
 assert.equal(canViewKvk('admin','approved'),true);assert.equal(canViewKvk('management','approved'),true);
 for(const role of ['manager','employee','unknown'])assert.equal(canViewKvk(role,'approved'),false);
 assert.equal(canViewKvk('admin','pending'),false);
});

test('ONS costs use debt minus credit and are added to the right side once',()=>{
 const d=parse(csv([['Tarih','Açıklama','','Borç','Alacak'],['01.10.2026','FATURA /ONS','',100,0],['02.10.2026','ons iade','',0,20],['03.10.2026','Havale','',0,200],['30.09.2026','ONS','',999,0]]),sources[0]);
 assert.equal(d.errors.length,0);
 const result=sum(d,'2026-10-01','2026-10-23');
 assert.equal(result.totals['Hazırkart ve ek giderler'],8000);
 assert.equal(result.totals['İade'],0);
 assert.equal(result.expenses,8000);
 assert.equal(result.difference,12000);
});
