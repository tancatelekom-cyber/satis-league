const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, setTimeout, clearTimeout, require: name => imports[name] || require(name) });
  return module.exports;
}
const { withAuthTimeout } = load('src/lib/auth/with-auth-timeout.ts');
test('auth result and errors propagate without waiting for timeout', async () => {
  assert.equal(await withAuthTimeout(Promise.resolve('user'), 100), 'user');
  await assert.rejects(withAuthTimeout(Promise.reject(new Error('offline')), 100), /offline/);
});
test('an unresponsive authentication request expires instead of hiding content forever', async () => {
  await assert.rejects(withAuthTimeout(new Promise(() => {}), 10), /zaman aşımına/);
});
test('public login renders immediately; protected content stays hidden during verification', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const path of ['/giris', '/kayit', '/']) {
    const { AuthGate } = load('src/components/auth/auth-gate.tsx', {
      'next/navigation': { usePathname: () => path, useRouter: () => ({ replace() {} }) },
      '@/lib/supabase/browser': { createClient() { throw Error('No browser auth required for initial render'); } },
      '@/lib/auth/with-auth-timeout': { withAuthTimeout }
    });
    const html = renderToStaticMarkup(React.createElement(AuthGate, null, 'PRIVATE_OR_LOGIN_CONTENT'));
    if (path === '/') { assert.ok(!html.includes('PRIVATE_OR_LOGIN_CONTENT')); assert.ok(html.includes('Oturumunuz kontrol ediliyor')); }
    else assert.ok(html.includes('PRIVATE_OR_LOGIN_CONTENT'));
  }
});
