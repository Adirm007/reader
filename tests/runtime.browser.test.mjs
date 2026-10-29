import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from '../tools/build_core.mjs';

let chromium;
try { ({ chromium } = createRequire(new URL('../../_tools/shot/package.json', import.meta.url))('playwright-core')); } catch {}
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const fixture = `<!doctype html><html><body><div id="chat"></div><textarea id="send_textarea"></textarea><button id="send_but">发送</button><script>
window.__ctx={chatId:'a',characterId:1,name1:'测试作家',name2:'夜梦',chatMetadata:{variables:{}},chat:[{mes:'opening',swipe_id:0}],saveMetadata:()=>Promise.resolve()};
window.SillyTavern={getContext:()=>window.__ctx};window.__data={stat_data:{命运点数:10000,主角:{状态效果:{}}}};
window.TavernHelper={getVariables:o=>o?.type==='chat'?__ctx.chatMetadata.variables:__data,updateVariablesWith:async(f)=>{__data=f(__data)},insertOrAssignVariables:async()=>{},getLastMessageId:()=>__ctx.chat.length-1,getCharWorldbookNames:()=>({primary:null,additional:[]}),getWorldbook:()=>[]};
window.tavern_events=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED','GENERATION_AFTER_COMMANDS'].map(k=>[k,k]));
window.__events=new Map();window.eventOn=(name,fn)=>{const s=__events.get(name)||new Set();s.add(fn);__events.set(name,s);return{stop:()=>s.delete(fn)}};window.emit=name=>{for(const f of __events.get(name)||[])f()};
window.__ctx.eventTypes=window.tavern_events;window.__ctx.eventSource={makeFirst(name,fn){__events.set(name,new Set([fn,...(__events.get(name)||[])]));},removeListener(name,fn){__events.get(name)?.delete(fn);},async emit(name,...args){for(const f of __events.get(name)||[])await f(...args);}};
</script></body></html>`;

test('persistent runtime survives letter redraw, stops resources, and isolates chat switches in Chromium', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  const { rules, runtime } = await build();
  const letterHtml = rules[0].replaceString.replace(/^```html\n/, '').replace(/\n```$/, '').replace('$1', '你好，这是一封测试来信。');
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/runtime.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/runtime.js' ? runtime : request.url === '/letter' ? letterHtml : fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  try {
    await page.goto(origin);
    await page.evaluate(async () => { window.ReaderCoreConfig={bookseaBase:location.origin+'/'};window.runtimeModule = await import('/runtime.js'); runtimeModule.start(); await ReaderCore.ready; });
    assert.equal(await page.locator('#reader-core-controller').count(), 1);
    assert.equal(await page.locator('.mes').count(), 0);
    // No <dream> or message iframe is needed to open the application.
    await page.locator('#reader-core-launcher').click();
    await page.locator('#dlb-overlay').waitFor();
    for (const view of ['persona', 'decouple', 'tuning', 'eggs', 'template', 'lobby']) {
      assert.equal(await page.evaluate(page => ReaderCore.open(page), view), true);
      assert.ok(await page.locator('#dlb-overlay').textContent());
    }
    await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('dlb-overlay')).opacity) > .99);
    await page.evaluate(() => { const controller=document.getElementById('reader-core-controller').contentWindow;controller.DreamFixedReleaseClient={...controller.DreamFixedReleaseClient,latest:async()=>null};ReaderCore.open('eggs'); });
    assert.equal(await page.locator('#dlb-overlay [data-dlb="eggwb"]').count(), 1);
    assert.equal(await page.locator('#dlb-overlay [data-dlb="eggupdates"]').count(), 0);
    await page.locator('#dlb-overlay [data-dlb="eggwb"]').click();
    assert.equal(await page.locator('#cpl-overlay .cpl-title').textContent(), '检查更新');
    await page.locator('#cpl-overlay .cpl-close').click();
    if (process.env.READER_QA_DIR) {
      mkdirSync(process.env.READER_QA_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.READER_QA_DIR, 'reader-runtime-desktop.png') });
    }
    await page.evaluate(() => ReaderCore.close());
    // A failed optional game download reports inside its window and does not
    // become an unhandled rejection from the legacy menu click handler.
    assert.equal(await page.evaluate(() => ReaderCore.openBooksea('maze')), false);
    await page.getByRole('button', {name:'返回聊天',exact:true}).click();

    await page.evaluate(async () => {
      const controller = document.getElementById('reader-core-controller').contentWindow;
      window.__controller = controller;
      const audio = controller.document.getElementById('bgm-player');
      const samples = 8000 * 20, buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer);
      function text(offset, value) { for (let i=0;i<value.length;i++) view.setUint8(offset+i,value.charCodeAt(i)); }
      text(0,'RIFF');view.setUint32(4,36+samples*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples*2,true);
      const bytes = new Uint8Array(buffer);let binary='';for(const value of bytes)binary+=String.fromCharCode(value);
      audio.src='data:audio/wav;base64,'+btoa(binary);await audio.play();window.__audio=audio;
      for(let i=0;i<6;i++){const mes=document.createElement('div');mes.className='mes';mes.setAttribute('mesid',String(i));const frame=document.createElement('iframe');frame.src='/letter';mes.append(frame);document.getElementById('chat').append(mes);}
    });
    await page.waitForFunction(() => document.querySelectorAll('.mes iframe').length === 6 && [...document.querySelectorAll('.mes iframe')].every(frame => frame.contentWindow?.document.querySelector('.text-body-royal')));
    await page.waitForTimeout(350);
    const before = await page.evaluate(() => __audio.currentTime);
    await page.evaluate(() => { document.querySelector('.mes iframe').remove(); __ctx.chat.push({mes:'new message',swipe_id:0});emit('MESSAGE_RECEIVED');emit('MESSAGE_UPDATED');emit('MESSAGE_SWIPED');emit('CHAT_CHANGED'); });
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(() => ({same:document.getElementById('reader-core-controller').contentWindow===__controller,audio:__audio===__controller.document.getElementById('bgm-player'),paused:__audio.paused,advanced:__audio.currentTime>0})), {same:true,audio:true,paused:false,advanced:true});
    assert.ok(await page.evaluate(() => __audio.currentTime) > before);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.mes iframe')].filter(frame => frame.contentWindow?.document.querySelector('audio')).length), 0);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.mes iframe')].filter(frame => frame.contentWindow?.ReaderController).length), 0);
    // Live presentation changes reach all light frames without instantiating another app.
    await page.evaluate(() => { __controller.setCurrentFont('default');__controller.setCurFSZ(18);__controller.applyVisualTheme('ink',false);__controller.nAll(); });
    const presentation = await page.evaluate(() => ({theme:ReaderCore.settings().theme, letters:ReaderCore.getLetters().length, themes:[...document.querySelectorAll('.mes iframe')].map(frame=>frame.contentDocument.documentElement.getAttribute('data-dream-theme'))}));
    assert.ok(presentation.themes.every(theme=>theme==='ink'), JSON.stringify(presentation));
    const fontSizes = await page.evaluate(() => [...document.querySelectorAll('.mes iframe')].map(frame=>frame.contentDocument.querySelector('.wrapper-v9-fix').style.zoom));
    assert.ok(fontSizes.every(zoom => Number(zoom) === 18/16));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => ReaderCore.open('lobby'));
    await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('dlb-overlay')).opacity) > .99);
    assert.equal(await page.evaluate(() => document.getElementById('dlb-overlay').getBoundingClientRect().width), 390);
    if (process.env.READER_QA_DIR) await page.screenshot({ path: join(process.env.READER_QA_DIR, 'reader-runtime-mobile.png') });

    await page.evaluate(async () => { runtimeModule.stop();runtimeModule.start();await ReaderCore.ready;window.__controller=document.getElementById('reader-core-controller').contentWindow; });
    assert.equal(await page.evaluate(() => [1,2,3,4,5].reduce((total,id)=>total+ReaderCore.getLetters(id).length,0)), 5);

    await page.evaluate(async () => { __ctx={...__ctx,chatId:'b',chatMetadata:{variables:{}},chat:[{mes:'different chat',swipe_id:0}]};emit('CHAT_CHANGED');await ReaderCore.ready; });
    assert.deepEqual(await page.evaluate(() => ({different:document.getElementById('reader-core-controller').contentWindow!==__controller,dead:__controller.__readerControllerAlive===false,paused:__audio.paused,cached:!!__ctx.chatMetadata.variables.dream_black_author_prompt})), {different:true,dead:true,paused:true,cached:true});
    await page.evaluate(() => runtimeModule.stop());
    assert.equal(await page.locator('#reader-core-controller,#reader-core-launcher,#dlb-overlay').count(), 0);
    assert.equal(await page.evaluate(() => [...__events.values()].reduce((count,set)=>count+set.size,0)), 0);
    assert.deepEqual(errors, []);
    // Stop an in-flight start before iframe load, then start cleanly again.
    assert.equal(await page.evaluate(async () => { const api=runtimeModule.start();const pending=api.ready;runtimeModule.stop();return await pending; }), null);
    await page.evaluate(async () => { __ctx.name1 = "O'Neil \"作家\" \\ / \n"; __ctx.name2 = '`角色${name}`';runtimeModule.start();await ReaderCore.ready;runtimeModule.start(); });
    assert.equal(await page.locator('#reader-core-controller,#reader-core-launcher').count(), 2);
    assert.equal(await page.evaluate(() => ReaderCore.settings().address), "O'Neil \"作家\" \\ / \n");
    assert.equal(await page.evaluate(() => [1,2,3,4,5].reduce((total,id)=>total+ReaderCore.getLetters(id).length,0)), 0);
    assert.deepEqual(errors, []);
    // Queued commands must not target the disposed app after a synchronous chat switch.
    assert.deepEqual(await page.evaluate(async () => {
      let called=0;
      const app=document.getElementById('reader-core-controller').contentWindow.ReaderController;
      app.command=()=>{called++;return true;};app.openBooksea=()=>{called++;return true;};
      const commands=[ReaderCore.command('togglePlay'),ReaderCore.openBooksea('descend')];
      __ctx={...__ctx,chatId:'c',chatMetadata:{variables:{}},chat:[{mes:'another chat',swipe_id:0}]};emit('CHAT_CHANGED');
      return {results:await Promise.all(commands),called};
    }), {results:[false,false],called:0});
    await page.evaluate(async () => { await ReaderCore.ready; });
    await page.evaluate(() => runtimeModule.stop());
    assert.equal(await page.evaluate(async () => {
      __ctx.chatMetadata={variables:{}};
      runtimeModule.start();
      await __ctx.eventSource.emit(tavern_events.GENERATION_AFTER_COMMANDS,'normal',{},false);
      return !!__ctx.chatMetadata.variables.dream_black_author_prompt;
    }), true);
    await page.evaluate(() => runtimeModule.stop());
    // A partial initialization failure cleans its host resources and can be retried.
    assert.equal(await page.evaluate(async () => {
      let once=true;
      Object.defineProperty(window,'ReaderCoreConfig',{configurable:true,get(){if(once){once=false;throw Error('fixture reader startup failure');}return {};}});
      runtimeModule.start();return await ReaderCore.ready;
    }), null);
    assert.equal(await page.locator('#reader-core-controller,#dlb-overlay,#reader-template-system-style').count(), 0);
    await page.evaluate(async () => { await ReaderCore.ready; });
    assert.equal(await page.locator('#reader-core-controller').count(), 1);
    assert.deepEqual(errors, ['fixture reader startup failure']);
    await page.evaluate(() => { runtimeModule.stop();delete window.ReaderCoreConfig; });
    // A cancelled standalone hot update cannot restart a core after unload or
    // stop a newer owner that appeared while the replacement was preparing.
    for (const owner of ['retry','unload','other']) {
      await page.evaluate(async () => { runtimeModule.start();await ReaderCore.ready; });
      await page.evaluate(() => {
        window.__candidateStops=0;
        const source=`let api;export function start(){api={runtimeVersion:'99.0',ready:new Promise(resolve=>{window.__candidateResolve=resolve;})};window.ReaderCore=api;return api;}export function stop(){window.__candidateStops++;if(window.ReaderCore===api)delete window.ReaderCore;}`;
        window.__replacement=ReaderCore.replaceRuntime({version:'99.0',source}).then(()=> 'success',error=>error.message);
      });
      await page.waitForFunction(() => typeof window.__candidateResolve==='function');
      const result=await page.evaluate(async owner => {
        if(owner!=='retry')runtimeModule.stop();if(owner==='other')window.ReaderCore={other:true};window.__candidateResolve(null);delete window.__candidateResolve;
        const result=await window.__replacement;return {result,stops:window.__candidateStops,controllers:document.querySelectorAll('#reader-core-controller').length,other:!!window.ReaderCore?.other};
      },owner);
      assert.match(result.result,/未能启动|已变化/);assert.equal(result.controllers,owner==='retry'?1:0);assert.equal(result.stops,owner==='other'?0:1);assert.equal(result.other,owner==='other');
      await page.evaluate(() => { runtimeModule.stop();delete window.ReaderCore; });
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
