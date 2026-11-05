import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

let chromium;
try { ({ chromium } = createRequire(new URL('../../_tools/shot/package.json', import.meta.url))('playwright-core')); } catch {}
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const hostSource = (await readFile(new URL('../source/card-host.mjs', import.meta.url), 'utf8'))
  .replace("import { BUNDLED } from 'reader:bundled';", 'const BUNDLED = window.__bundled;');
const storeSource = await readFile(new URL('../source/hosted-runtime-store.js', import.meta.url), 'utf8');
const candidate = `let api;export function start(options){window.__calls.push('cached-start');api={runtimeVersion:'3.0',isAlive:true,ready:Promise.resolve(true),getUpdateOptions:()=>options.updates};window.ReaderCore=api;return api;}export function stop(){window.__calls.push('cached-stop');if(window.ReaderCore===api){api.isAlive=false;delete window.ReaderCore;}}`;
const bytes = new TextEncoder().encode(candidate);
const artifact = { metadata: { schema: 1, repository: 'Adirm007/reader', version: '3.0', sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64) },
  spec: { path: 'dist/reader-runtime.js', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, bytes: Array.from(bytes) };
const fixture = `<!doctype html><html><body><script>
window.__calls=[];window.__reads=0;window.__context={characterId:0,chatId:'test',chatMetadata:{variables:{系统核心:'九十九夜梦'}}};
window.SillyTavern={getContext:()=>__context};
window.__bundled=(()=>{let api;return{version:'2.0',start(options){__calls.push('bundle-start');api={runtimeVersion:'2.0',isAlive:true,ready:Promise.resolve(true),getUpdateOptions:()=>options.updates};window.ReaderCore=api;return api;},stop(){__calls.push('bundle-stop');if(window.ReaderCore===api){api.isAlive=false;delete window.ReaderCore;}}};})();
window.fetch=()=>{__calls.push('fetch');throw Error('no startup fetch');};window.setInterval=()=>{throw Error('no startup polling');};
window.DreamFixedReleaseClient={latest(){throw Error('no startup latest');},resource(){throw Error('no startup resource');}};
window.ReaderScriptInstaller={ensure(){throw Error('no standalone install');}};
window.TavernHelper={getScriptTrees(){throw Error('no script access');},updateScriptTreesWith(){throw Error('no script writes');}};
</script><script>${storeSource}</script><script>
window.ReaderHostedRuntimeStore=(()=>{const actual=ReaderHostedRuntimeStore;return{...actual,read(){__reads++;return actual.read();}};})();
</script></body></html>`;

test('the hosted reader persists an accepted version and restores it after a browser reload without update requests', { skip: !chromium || !existsSync(chrome), timeout: 30000 }, async () => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/host.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/host.js' ? hostSource : fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) external.push(request.url()); });
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
  try {
    await page.goto(origin);
    await page.evaluate(async () => { window.entry = await import('/host.js'); await entry.start(); });
    assert.deepEqual(await page.evaluate(async () => { const first = ReaderCore; await entry.start(); return { version: ReaderCore.runtimeVersion, same: first === ReaderCore, reads: __reads, calls: __calls }; }),
      { version: '2.0', same: true, reads: 1, calls: ['bundle-start'] });
    const saved = await page.evaluate(async artifact => {
      artifact.bytes = new Uint8Array(artifact.bytes); const before = ReaderCore;
      const result = await ReaderCore.getUpdateOptions().installRuntime(artifact);
      return { pending: result.pending, same: before === ReaderCore, state: ReaderCore.getUpdateOptions().getHostedRuntimeState(), calls: __calls };
    }, artifact);
    assert.deepEqual(saved, { pending: true, same: true, state: { runningVersion: '2.0', pendingVersion: '3.0' }, calls: ['bundle-start'] });
    await page.reload();
    await page.evaluate(async () => { window.entry = await import('/host.js'); await entry.start(); });
    assert.deepEqual(await page.evaluate(() => ({ version: ReaderCore.runtimeVersion, reads: __reads, calls: __calls, state: ReaderCore.getUpdateOptions().getHostedRuntimeState() })),
      { version: '3.0', reads: 1, calls: ['cached-start'], state: { runningVersion: '3.0', pendingVersion: null } });
    assert.deepEqual(await page.evaluate(() => { entry.stop(); return { stopped: !window.ReaderCore, calls: __calls }; }), { stopped: true, calls: ['cached-start', 'cached-stop'] });
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
