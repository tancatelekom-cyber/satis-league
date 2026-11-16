const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/market-comparison.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,URL,AbortSignal,fetch});
const {matchesPhone:matches,isSmartphoneCategory,parseMarketOffers,RETAILERS}=mod.exports;
test('only smartphones and exact model variants are compared',()=>{
 assert.equal(isSmartphoneCategory('Akıllı Telefon'),true);assert.equal(isSmartphoneCategory('Tablet'),false);
 assert.equal(matches('IPHONE 15 128GB','APPLE','Apple iPhone 15 128 GB Siyah'),true);
 for(const name of ['Apple iPhone 16 128 GB','Apple iPhone 15 Pro 128 GB','Apple iPhone 15 256 GB','iPhone 15 128 GB kılıf','Yenilenmiş iPhone 15 128GB'])assert.equal(matches('IPHONE 15 128GB','APPLE',name),false,name);
 assert.equal(matches('Galaxy A56 8GB/256GB','SAMSUNG','Samsung Galaxy A56 5G 8/256 GB Akıllı Telefon'),true);
 assert.equal(matches('Galaxy A56 8GB/256GB','SAMSUNG','Samsung Galaxy A56 12GB 256GB'),false);
 assert.equal(matches('Galaxy A56 8GB/256GB','SAMSUNG','Samsung Galaxy A56 256GB'),false);
});
test('structured data preserves missing prices, out of stock and same-domain URLs',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'ItemList',itemListElement:[{'@type':'Product',name:'iPhone 15 128GB',url:'https://www.mediamarkt.com.tr/tr/product/a.html',offers:{price:10000,priceCurrency:'TRY',availability:'https://schema.org/OutOfStock'}},{'@type':'Product',name:'Phone',url:'https://evil.example/test',offers:{price:1,priceCurrency:'TRY'}},{'@type':'Product',name:'Phone',url:'/tr/product/b.html',offers:{price:999,priceCurrency:'USD'}}]})+'</script>';
 const results=parseMarketOffers(html,RETAILERS[0]);assert.equal(results.length,2);assert.equal(results[0].available,false);assert.equal(results[1].price,null);
});
test('Vatan listing uses price from the same product block and decodes Turkish entities',()=>{
 const html='<div class="product-list product-list--list-page"><a class="product-list-link" href="https://www.vatanbilgisayar.com/iphone.html"><div class="product-list__product-name"><h3>iPhone 15 128GB Siyah</h3></div><span class="product-list__price">45.999</span></a></div>';
 const offer=parseMarketOffers(html,RETAILERS[1])[0];assert.equal(offer.price,45999);assert.equal(offer.available,null);
});
