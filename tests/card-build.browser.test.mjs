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

const fixture = `<!doctype html><html><body><div id="chat"></div><textarea id="send_textarea"></textarea><button id="send_but">发送</button><script>
window.__ctx={chatId:'a',characterId:0,name1:'测试作家',name2:'夜梦',characters:[{avatar:'reader.png'}],chatMetadata:{variables:{系统核心:'九十九夜梦'}},chat:[{mes:'opening',swipe_id:0}],saveMetadata:()=>Promise.resolve()};
window.SillyTavern={getContext:()=>__ctx};window.__data={stat_data:{命运点数:10000,主角:{状态效果:{}}}};
const scriptApi=name=>(...args)=>{__scriptCalls.push(name);throw Error('card host must not use script-library APIs');};
window.TavernHelper={getVariables:o=>o?.type==='chat'?__ctx.chatMetadata.variables:__data,updateVariablesWith:async fn=>{__data=fn(__data);},insertOrAssignVariables:async()=>{},getLastMessageId:()=>__ctx.chat.length-1,getCharWorldbookNames:()=>({primary:null,additional:[]}),getWorldbook:()=>[],updateWorldbookWith:async()=>[],createWorldbookEntries:async()=>[],getScriptTrees:scriptApi('getScriptTrees'),updateScriptTreesWith:scriptApi('updateScriptTreesWith')};
window.tavern_events=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED','GENERATION_AFTER_COMMANDS'].map(key=>[key,key]));
window.__events=new Map();window.eventOn=(name,fn)=>{const set=__events.get(name)||new Set();set.add(fn);__events.set(name,set);return{stop:()=>set.delete(fn)}};window.emit=name=>{for(const fn of __events.get(name)||[])fn();};
__ctx.eventTypes=tavern_events;__ctx.eventSource={makeFirst(name,fn){__events.set(name,new Set([fn,...(__events.get(name)||[])]));},removeListener(name,fn){__events.get(name)?.delete(fn);}};
window.ReaderCoreConfig={bookseaBase:location.origin+'/'};
</script></body></html>`;

test('the actual card build keeps playback during a manual save and restores the accepted raw runtime on reload without update checks', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  const [{ cardRuntime }, { runtime }] = await Promise.all([build({ version: '2.0' }), build({ version: '3.0' })]);
  const artifact = { metadata: { schema: 1, repository: 'Adirm007/reader', version: '3.0', sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64) },
    spec: { path: 'dist/reader-runtime.js', bytes: Buffer.byteLength(runtime), sha256: createHash('sha256').update(runtime).digest('hex') }, source: runtime };
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/card.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/card.js' ? cardRuntime : fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(), errors = [], updateRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = request.url();
    if (/fixed-updates|(?:^|\/)(?:fixed-release-manifest|release-manifest)\.json|\/dist\/reader[^/]*\.js|\/tools\/release-verifier\/|\/api\/(?:characters|settings)\/get/i.test(url)) updateRequests.push(url);
  });
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') || /^(?:blob:|data:)/.test(route.request().url()) ? route.continue() : route.abort());
  // The controller creates its own release client. Trap calls in every iframe before its
  // script executes; HTTP monitoring separately catches direct manifest/resource fetches.
  await page.addInitScript(() => {
    if (window === window.top) { window.__updateCalls = []; window.__scriptCalls = []; }
    let client, installer;
    const forbidden = name => () => { window.top.__updateCalls.push(name); throw Error('ordinary startup must not check or download updates'); };
    Object.defineProperty(window, 'DreamFixedReleaseClient', { configurable: true, get: () => client,
      set: value => { client = { ...value, latest: forbidden('latest'), resource: forbidden('resource'), __startupTrap: true }; } });
    Object.defineProperty(window, 'ReaderScriptInstaller', { configurable: true, get: () => installer,
      set: value => { installer = { ...value, ensure: forbidden('ensure') }; } });
  });
  try {
    await page.goto(origin);
    await page.evaluate(async () => { window.entry = await import('/card.js'); await entry.start({ base: location.origin }); });
    assert.deepEqual(await page.evaluate(() => ({ version: ReaderCore.runtimeVersion, mode: ReaderCore.getUpdateOptions().hostMode, count: document.querySelectorAll('#reader-core-controller').length,
      intercepted: document.getElementById('reader-core-controller').contentWindow.DreamFixedReleaseClient.__startupTrap, updates: __updateCalls, scripts: __scriptCalls })),
    { version: '2.0', mode: 'auto-regex', count: 1, intercepted: true, updates: [], scripts: [] });
    // Also observe the pre-existing delayed worldbook check, not just immediate boot.
    await page.waitForTimeout(5200);
    assert.deepEqual(await page.evaluate(() => ({ updates: __updateCalls, scripts: __scriptCalls })), { updates: [], scripts: [] });
    assert.deepEqual(updateRequests, []);
    await page.evaluate(async () => {
      window.__beforeApi = ReaderCore; window.__beforeFrame = document.getElementById('reader-core-controller');
      window.__beforeAudio = __beforeFrame.contentDocument.getElementById('bgm-player');
      const samples = 8000 * 20, buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer);
      const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples * 2, true);
      let binary = ''; for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
      __beforeAudio.src = 'data:audio/wav;base64,' + btoa(binary); await __beforeAudio.play();
    });
    const saved = await page.evaluate(async artifact => {
      const { source, ...verified } = artifact; verified.bytes = new TextEncoder().encode(source);
      const result = await ReaderCore.getUpdateOptions().installRuntime(verified);
      return { pending: result.pending, state: ReaderCore.getUpdateOptions().getHostedRuntimeState(), sameApi: ReaderCore === __beforeApi,
        sameFrame: document.getElementById('reader-core-controller') === __beforeFrame, sameAudio: __beforeFrame.contentDocument.getElementById('bgm-player') === __beforeAudio,
        playing: !__beforeAudio.paused, count: document.querySelectorAll('#reader-core-controller').length };
    }, artifact);
    assert.deepEqual(saved, { pending: true, state: { runningVersion: '2.0', pendingVersion: '3.0' }, sameApi: true, sameFrame: true, sameAudio: true, playing: true, count: 1 });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => !__beforeAudio.paused && __beforeAudio.currentTime > 0), true);
    await page.reload();
    await page.evaluate(async () => { window.entry = await import('/card.js'); await entry.start({ base: location.origin }); });
    assert.deepEqual(await page.evaluate(() => ({ version: ReaderCore.runtimeVersion, mode: ReaderCore.getUpdateOptions().hostMode, state: ReaderCore.getUpdateOptions().getHostedRuntimeState(), count: document.querySelectorAll('#reader-core-controller').length })),
      { version: '3.0', mode: 'auto-regex', state: { runningVersion: '3.0', pendingVersion: null }, count: 1 });
    await page.waitForTimeout(5200);
    assert.deepEqual(await page.evaluate(() => ({ updates: __updateCalls, scripts: __scriptCalls })), { updates: [], scripts: [] });
    assert.deepEqual(updateRequests, []);
    assert.deepEqual(await page.evaluate(() => {
      const api = ReaderCore, audio = document.getElementById('reader-core-controller').contentDocument.getElementById('bgm-player');
      entry.stop(); return { alive: api.isAlive, playing: !audio.paused, core: !!window.ReaderCore, controllers: document.querySelectorAll('#reader-core-controller').length };
    }), { alive: false, playing: false, core: false, controllers: 0 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
