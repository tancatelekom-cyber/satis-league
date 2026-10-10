const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/app/api/admin/hat-trafik/route.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function request(user, profile) {
 const mod = {exports:{}};
 const query = {select(){return this},eq(){return this},async single(){return {data:profile}}};
 vm.runInNewContext(source,{module:mod,exports:mod.exports,Response,Uint8Array,require(name){
  if(name==='node:crypto') return require(name);
  return {createClient:async()=>({auth:{getUser:async()=>({data:{user}})},from:()=>query})};
 }});
 return mod.exports.POST();
}
test('traffic rejects unauthenticated and unauthorized users',async()=>{
 assert.equal((await request(null,null)).status,401);
 assert.equal((await request({id:'x'},{role:'employee',approval:'approved'})).status,403);
 assert.equal((await request({id:'x'},{role:'admin',approval:'pending'})).status,403);
});
test('admin receives a fresh non-cacheable 2 MB block',async()=>{
 const res=await request({id:'x'},{role:'admin',approval:'approved'});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'application/octet-stream');
 assert.match(res.headers.get('cache-control'),/no-store/);
 const bytes=new Uint8Array(await res.arrayBuffer());
 assert.equal(bytes.byteLength,2000000);
 assert.ok(new Set(bytes.slice(0,4096)).size>200);
});

test('approved managers and management can download, unapproved roles cannot',async()=>{
 for(const role of ['manager','management']) {
  const res=await request({id:'x'},{role,approval:'approved'});
  assert.equal(res.status,200);
  assert.equal((await res.arrayBuffer()).byteLength,2000000);
  assert.equal((await request({id:'x'},{role,approval:'pending'})).status,403);
 }
 assert.equal((await request({id:'x'},null)).status,403);
});
