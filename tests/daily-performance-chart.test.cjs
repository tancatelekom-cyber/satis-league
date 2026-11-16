const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const mod={exports:{}};
const source=ts.transpileModule(fs.readFileSync('src/components/evaluation/daily-performance-dashboard.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(source,{module:mod,exports:mod.exports,require(name){if(name.endsWith('.css'))return {default:{chart:'chart'}};if(name.startsWith('@/lib/'))return {};return require(name);}});
const Chart=mod.exports.DailyPerformanceChart;
const series=[{day:1,actual:12,target:10,percent:120},{day:2,actual:0,target:9,percent:0},{day:3,actual:9876,target:4321,percent:999}];
test('chart excludes current and future days and prints historical values without hover',()=>{
 const html=renderToStaticMarkup(React.createElement(Chart,{series,today:3}));
 assert.match(html,/>12<\/text>/);assert.match(html,/>0<\/text>/);assert.match(html,/>10<\/text>/);
 assert.doesNotMatch(html,/9876|9.876|4321|4.321/);
 const percent=renderToStaticMarkup(React.createElement(Chart,{series,today:3,percent:true}));
 assert.match(percent,/>120%<\/text>/);assert.match(percent,/>0%<\/text>/);assert.doesNotMatch(percent,/999/);
});
test('first day has an empty state and missing past values remain unavailable',()=>{
 const first=renderToStaticMarkup(React.createElement(Chart,{series,today:1}));assert.doesNotMatch(first,/<svg/);assert.match(first,/henüz geçmiş gün/);
 const missing=renderToStaticMarkup(React.createElement(Chart,{series:[{day:1,actual:null,target:null,percent:null}],today:2}));assert.match(missing,/>—<\/text>/);
});
