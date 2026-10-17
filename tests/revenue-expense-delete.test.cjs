const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
function setup({allowed=true,data=[{id:'record'}],error=null}={}){const calls=[];const query={delete(){calls.push('delete');return this;},eq(k,v){calls.push([k,v]);return this;},async select(){return {data,error};}};const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync('src/app/gelir-gider/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('module','exports','require',js)(mod,mod.exports,name=>{
if(name==='@/lib/auth/require-revenue-expense-access')return {requireRevenueExpenseAccess:async()=>{calls.push('auth');if(!allowed)throw Error('denied');return {};}};
if(name==='@/lib/supabase/admin')return {createAdminClient:()=>{calls.push('admin');return {from:()=>query};}};
if(name==='next/cache')return {revalidatePath:p=>calls.push(['refresh',p])};return {};});return {run:mod.exports.deleteRevenueExpense,calls};}
const id='11111111-1111-4111-a111-111111111111',stamp='2026-10-17T12:00:00.123456+00:00';
test('unauthorized deletion never creates an admin client',async()=>{const s=setup({allowed:false});await assert.rejects(s.run(id,stamp));assert.deepEqual(s.calls,['auth']);});
test('invalid deletion target never reaches database',async()=>{const s=setup();assert.equal((await s.run('',stamp)).ok,false);assert.deepEqual(s.calls,['auth']);});
test('deletes only matching record version and refreshes reports',async()=>{const s=setup();assert.equal((await s.run(id,stamp)).ok,true);assert.deepEqual(s.calls,['auth','admin','delete',['id',id],['updated_at',stamp],['refresh','/gelir-gider']]);});
test('changed or missing records do not report successful deletion',async()=>{const s=setup({data:[]});assert.equal((await s.run(id,stamp)).ok,false);assert.ok(!s.calls.some(c=>Array.isArray(c)&&c[0]==='refresh'));});
test('database errors are shown as failure',async()=>{const s=setup({data:null,error:{message:'internal'}});const result=await s.run(id,stamp);assert.equal(result.ok,false);assert.ok(!result.message.includes('internal'));});
