import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from '../tools/build_core.mjs';

let chromium;
try { ({ chromium } = createRequire(new URL('../../_tools/shot/package.json', import.meta.url))('playwright-core')); } catch {}
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const selectionKey = 'dream_reader_core_selected_v1';

async function browserFixture(run) {
  const [{ runtime }, candidate] = await Promise.all([build({ version: '1.0' }), build({ version: '2.0' })]);
  const artifact = {
    metadata: { schema: 1, repository: 'Adirm007/reader', version: '2.0', sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64) },
    spec: { path: 'dist/reader-runtime.js', bytes: Buffer.byteLength(candidate.runtime), sha256: createHash('sha256').update(candidate.runtime).digest('hex') },
    release: { repository: 'Adirm007/reader', version: '2.0', distributionCommit: 'c'.repeat(40), digest: 'd'.repeat(64) },
  };
  const fixture = `<!doctype html><html><body><div id="chat"></div><textarea id="send_textarea"></textarea><button id="send_but">发送</button><script>
window.__calls=[];window.__artifact=${JSON.stringify(artifact)};
window.__ctx={chatId:'a',characterId:0,name1:'测试作家',name2:'夜梦',characters:[{avatar:'reader.png'}],chatMetadata:{variables:{系统核心:'九十九夜梦'}},chat:[{mes:'opening',swipe_id:0}],saveMetadata:()=>Promise.resolve()};
window.SillyTavern={getContext:()=>__ctx};window.__data={stat_data:{命运点数:10000,主角:{状态效果:{}}}};
const forbidden=name=>()=>{__calls.push(name);throw Error('legacy runtime must not change '+name);};
window.TavernHelper={getVariables:o=>o?.type==='chat'?__ctx.chatMetadata.variables:__data,updateVariablesWith:async fn=>{__data=fn(__data);},insertOrAssignVariables:async()=>{},getLastMessageId:()=>__ctx.chat.length-1,getCharWorldbookNames:()=>({primary:null,additional:[]}),getWorldbook:()=>[],getTavernRegexes:()=>[],replaceTavernRegexes:forbidden('regex-write'),updateWorldbookWith:forbidden('worldbook-write'),createWorldbookEntries:forbidden('worldbook-create'),getScriptTrees:forbidden('script-read'),updateScriptTreesWith:forbidden('script-write')};
window.tavern_events=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED','GENERATION_AFTER_COMMANDS'].map(key=>[key,key]));
window.__events=new Map();window.eventOn=(name,fn)=>{const set=__events.get(name)||new Set();set.add(fn);__events.set(name,set);return{stop:()=>set.delete(fn)}};window.emit=name=>{for(const fn of __events.get(name)||[])fn();};
__ctx.eventTypes=tavern_events;__ctx.eventSource={makeFirst(name,fn){__events.set(name,new Set([fn,...(__events.get(name)||[])]));},removeListener(name,fn){__events.get(name)?.delete(fn);}};
window.ReaderCoreConfig={bookseaBase:location.origin+'/'};
// The ready event fires synchronously before the adapter's zero-delay restore timer.
document.addEventListener('reader:ready',()=>{
  const controller=document.getElementById('reader-core-controller').contentWindow;
  controller.DreamFixedReleaseClient={...controller.DreamFixedReleaseClient,
    latest:async repository=>{__calls.push({kind:'latest',repository});return {repository,version:'2.0'};},
    resource:async(selected,name)=>{
      __calls.push({kind:'resource',selected:JSON.parse(JSON.stringify(selected)),name});
      const code=await fetch('/candidate.js').then(response=>response.text());
      if(window.__resourceGate)await window.__resourceGate;
      return {...__artifact,bytes:new TextEncoder().encode(code)};
    }};
  controller.dreamWbAutoCheck=()=>{};
});
</script></body></html>`;
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url?.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/runtime.js' ? runtime : request.url === '/candidate.js' ? candidate.runtime : fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') || /^(?:blob:|data:)/.test(route.request().url()) ? route.continue() : route.abort());
  const start = () => page.evaluate(async () => {
    window.entry = await import('/runtime.js');
    entry.start({ updates: {} });
    await ReaderCore.ready;
  });
  try { await page.goto(origin); await run({ page, start, artifact, errors }); }
  finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

test('legacy auto-regex manually updates the real runtime and restores only its accepted version after reload', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  await browserFixture(async ({ page, start, artifact, errors }) => {
    await start();
    assert.deepEqual(await page.evaluate(() => ({ version: ReaderCore.runtimeVersion, count: document.querySelectorAll('#reader-core-controller').length, calls: __calls })), { version: '1.0', count: 1, calls: [] });
    const checked = await page.evaluate(async key => {
      const updates = document.getElementById('reader-core-controller').contentWindow.ReaderUpdates;
      window.__center = updates.createCoordinator(updates.components().filter(item => item.id === 'script'));
      const result = await __center.check();
      return { status: result[0].status, selected: localStorage.getItem(key), calls: __calls };
    }, selectionKey);
    assert.equal(checked.status, 'outdated');
    assert.equal(checked.selected, null);
    assert.deepEqual(checked.calls, [{ kind: 'latest', repository: 'Adirm007/reader' }]);
    await page.evaluate(() => { window.__oldApi = ReaderCore; window.__applied = __center.apply(); });
    await page.waitForFunction(() => window.ReaderCore?.runtimeVersion === '2.0');
    assert.deepEqual(await page.evaluate(async key => ({ version: ReaderCore.runtimeVersion, count: document.querySelectorAll('#reader-core-controller').length, selected: JSON.parse(localStorage.getItem(key)), status: (await __applied)[0].status, oldAlive: __oldApi.isAlive }), selectionKey),
      { version: '2.0', count: 1, selected: artifact.metadata, status: 'updated', oldAlive: false });
    await page.evaluate(async () => {
      const updates = document.getElementById('reader-core-controller').contentWindow.ReaderUpdates;
      await updates.restore(); await updates.restore();
    });
    assert.equal((await page.evaluate(() => __calls.filter(call => call.kind === 'resource'))).length, 1);

    await page.reload();
    await start();
    await page.waitForFunction(() => window.ReaderCore?.runtimeVersion === '2.0');
    assert.deepEqual(await page.evaluate(() => ({ count: document.querySelectorAll('#reader-core-controller').length, calls: __calls })),
      { count: 1, calls: [{ kind: 'resource', selected: artifact.metadata, name: 'reader-runtime.js' }] });
    assert.deepEqual(await page.evaluate(() => {
      const api = ReaderCore; entry.stop();
      return { alive: api.isAlive, core: !!window.ReaderCore, controllers: document.querySelectorAll('#reader-core-controller').length };
    }), { alive: false, core: false, controllers: 0 });
    assert.deepEqual(errors, []);
  });
});

test('stopping the legacy host while an accepted runtime downloads cannot revive its controller', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  await browserFixture(async ({ page, start, artifact, errors }) => {
    await page.evaluate(({ key, metadata }) => {
      localStorage.setItem(key, JSON.stringify(metadata));
      window.__resourceGate = new Promise(resolve => { window.__releaseResource = resolve; });
    }, { key: selectionKey, metadata: artifact.metadata });
    await start();
    await page.waitForFunction(() => __calls.some(call => call.kind === 'resource'));
    await page.evaluate(() => {
      window.__restore = document.getElementById('reader-core-controller').contentWindow.ReaderUpdates.restore();
      entry.stop(); __releaseResource();
    });
    await page.evaluate(() => __restore);
    assert.deepEqual(await page.evaluate(() => ({ core: !!window.ReaderCore, controllers: document.querySelectorAll('#reader-core-controller').length, calls: __calls })),
      { core: false, controllers: 0, calls: [{ kind: 'resource', selected: artifact.metadata, name: 'reader-runtime.js' }] });
    assert.deepEqual(errors, []);
  });
});
