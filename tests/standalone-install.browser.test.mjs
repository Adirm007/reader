import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from '../tools/build_core.mjs';
import {fixedReaderFixture,SCRIPT_ID} from './helpers/fixed-script-migration-host.mjs';

let chromium;
try{({chromium}=createRequire(new URL('../../_tools/shot/package.json',import.meta.url))('playwright-core'));}catch{}
const chrome=process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const fixture=`<!doctype html><html><body><div id="chat"></div><textarea id="send_textarea"></textarea><button id="send_but">发送</button><script>
window.__ctx={chatId:'a',characterId:0,characters:[{avatar:'reader.png'},{avatar:'other.png'}],name1:'测试作家',name2:'夜梦',chatMetadata:{variables:{}},chat:[{mes:'opening',swipe_id:0}],saveMetadata:()=>Promise.resolve()};
window.SillyTavern={getContext:()=>window.__ctx};window.__data={stat_data:{命运点数:10000,主角:{状态效果:{}}}};
window.TavernHelper={getVariables:o=>o?.type==='chat'?__ctx.chatMetadata.variables:__data,updateVariablesWith:async(f)=>{__data=f(__data)},insertOrAssignVariables:async()=>{},getLastMessageId:()=>__ctx.chat.length-1,getCharWorldbookNames:()=>({primary:null,additional:[]}),getWorldbook:()=>[]};
window.tavern_events=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED','GENERATION_AFTER_COMMANDS'].map(k=>[k,k]));
window.__events=new Map();window.eventOn=(name,fn)=>{const s=__events.get(name)||new Set();s.add(fn);__events.set(name,s);return{stop:()=>s.delete(fn)}};window.emit=name=>{for(const f of __events.get(name)||[])f()};
window.__ctx.eventTypes=window.tavern_events;window.__ctx.eventSource={makeFirst(name,fn){__events.set(name,new Set([fn,...(__events.get(name)||[])]));},removeListener(name,fn){__events.get(name)?.delete(fn);},async emit(name,...args){for(const f of __events.get(name)||[])await f(...args);}};
window.boot=(suffix='')=>{const f=document.createElement('iframe');f.dataset.helper='true';f.src='/helper'+suffix;document.body.append(f);return f;};
</script></body></html>`;

test('the saved helper module starts the real reader after reload and survives old-owner cleanup',{skip:!chromium||!existsSync(chrome),timeout:60000},async()=>{
 const {runtime}=await build({version:'2.0'}),f=fixedReaderFixture();
 const client=f.root.DreamFixedReleaseClient,read=client.resource;
 f.root.DreamFixedReleaseClient={...client,resource:async(selected,name)=>{
  const artifact=await read(selected,name);if(name!=='reader-runtime.js')return artifact;
  const bytes=new TextEncoder().encode(runtime);return {...artifact,bytes,spec:{path:'dist/reader-runtime.js',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
 }};
 const plan=await f.root.ReaderFixedMigration.check({repository:'Adirm007/reader',version:'2.0'});
 await f.root.ReaderFixedMigration.install(plan,()=>{});
 const saved=f.scripts.find(item=>item.id===SCRIPT_ID),token=saved.data.reader_runtime.ownerToken;
 assert.ok(saved.content.includes(runtime),'saved script contains the complete verified module');
 assert.ok(!saved.content.includes('import("https://'),'reload must not depend on a moving runtime URL');
 const replacement=saved.content.replaceAll(token,'replacement-owner');
 const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url.startsWith('/installed')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
  response.end(request.url==='/installed.js'?saved.content:request.url==='/installed-next.js'?replacement:request.url.startsWith('/helper')?'<!doctype html><script type="module" src="'+(request.url==='/helper-next'?'/installed-next.js':'/installed.js')+'"></script>':fixture);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:chrome,headless:true}),page=await browser.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('data:')?route.continue():route.abort());
 try{
  await page.goto(origin);await page.evaluate(()=>{
   window.ReaderCoreConfig={bookseaBase:location.origin+'/'};
   window.__legacyTicks=0;window.__legacyClicks=0;window.__dhb=setInterval(()=>window.__legacyTicks++,20);
   const legacy=document.createElement('button');legacy.id='dfb';legacy.textContent='旧固定版菜单';legacy.onclick=()=>window.__legacyClicks++;document.body.append(legacy);window.__legacyFloat=legacy;
   const heartbeat=document.createElement('script');heartbeat.id='dream-hb';heartbeat.type='application/json';heartbeat.textContent='{}';document.head.append(heartbeat);
   window.__dl=[{c:'旧来信',s:'夜梦',idx:0,ifr:null}];window.__legacyCache=__dl;window.__dmid='original-message';window.__dread=true;
   // Persistence is still pending even though the new owned runtime can become ready.
   window.__readerScriptInstallation={key:'persistence-pending'};window.__first=boot();
  });
  await page.waitForFunction(()=>window.ReaderCore?.scriptOwner?.token&&__readerStandaloneStatus.phase==='ready');
  assert.equal(await page.locator('#dream-hb').count(),1);
  await page.evaluate(()=>{window.__beforeCancellation=__legacyTicks;__readerStandaloneStatus.cancel();});
  await page.waitForFunction(()=>!window.ReaderCore&&__legacyTicks>__beforeCancellation);
  assert.equal(await page.locator('#dream-hb').count(),1,'failed persistence preserves the old heartbeat marker');
  assert.equal(await page.locator('#dfb').count(),1,'failed persistence preserves the old floating menu');
  assert.deepEqual(await page.evaluate(()=>({cache:__dl===__legacyCache,message:__dmid,read:__dread})),{cache:true,message:'original-message',read:true});
  await page.locator('#dfb').click();assert.equal(await page.evaluate(()=>__legacyClicks),1);
  await page.evaluate(()=>{delete window.__readerScriptInstallation;window.__first=boot();});
  await page.waitForFunction(()=>window.ReaderCore?.scriptOwner?.token&&__readerStandaloneStatus.phase==='ready');
  assert.equal(await page.locator('#dream-hb').count(),0);assert.equal(await page.evaluate(()=>__dhb),null);
  assert.equal(await page.evaluate(()=>__legacyFloat.isConnected),false);assert.equal(await page.locator('#dfb').count(),1,'successful takeover reuses one floating envelope');assert.equal(await page.locator('#reader-core-launcher').count(),0);
  assert.equal(await page.evaluate(()=>ReaderCore.scriptOwner.scope),'character');
  assert.equal(await page.locator('#reader-core-controller').count(),1);assert.equal(await page.locator('.mes').count(),0);
  await page.locator('#dfb').click();await page.locator('#dlb-overlay').waitFor();
  await page.reload();await page.evaluate(()=>{window.ReaderCoreConfig={bookseaBase:location.origin+'/'};window.__first=boot();});
  await page.waitForFunction(()=>window.ReaderCore?.scriptOwner?.token&&__readerStandaloneStatus.phase==='ready');
  assert.equal(await page.evaluate(()=>ReaderCore.runtimeVersion),'2.0');assert.equal(await page.locator('#reader-core-controller').count(),1);
  await page.evaluate(()=>{window.__next=boot('-next');});
  await page.waitForFunction(()=>window.ReaderCore?.scriptOwner?.token==='replacement-owner'&&__readerStandaloneStatus.phase==='ready');
  await page.evaluate(()=>{__first.contentWindow.dispatchEvent(new PageTransitionEvent('pagehide'));__first.remove();});
  assert.equal(await page.evaluate(()=>ReaderCore.scriptOwner.token),'replacement-owner');assert.equal(await page.locator('#reader-core-controller').count(),1);
  await page.evaluate(()=>{window.__priorInstance=ReaderCore.scriptOwner.instance;window.__third=boot('-next');});
  await page.waitForFunction(()=>window.ReaderCore?.scriptOwner?.token==='replacement-owner'&&ReaderCore.scriptOwner.instance!==__priorInstance&&__readerStandaloneStatus.phase==='ready');
  await page.evaluate(()=>{__next.contentWindow.dispatchEvent(new PageTransitionEvent('pagehide'));__next.remove();});
  assert.equal(await page.evaluate(()=>ReaderCore.scriptOwner.token),'replacement-owner');assert.equal(await page.locator('#reader-core-controller').count(),1);
  await page.evaluate(()=>{__ctx.chatMetadata.variables['系统核心']='其他核心';emit('MESSAGE_UPDATED');});
  await page.waitForFunction(()=>!window.ReaderCore&&__readerStandaloneStatus.phase==='paused');
  await page.evaluate(()=>{__ctx.chatMetadata.variables['系统核心']='九十九夜梦';emit('MESSAGE_UPDATED');});
  await page.waitForFunction(()=>window.ReaderCore?.isAlive&&__readerStandaloneStatus.phase==='ready');
  await page.evaluate(()=>{__ctx.characterId=1;__ctx.chatId='other';emit('CHAT_CHANGED');});
  await page.waitForFunction(()=>!window.ReaderCore&&__readerStandaloneStatus.phase==='paused');
  assert.equal(await page.locator('#reader-core-controller,#reader-core-launcher,#dfb').count(),0);
  await page.evaluate(()=>{__ctx.characterId=0;__ctx.chatId='a';window.ReaderCore={isAlive:true,scriptOwner:null,external:true,stop(){throw Error('external host must remain untouched');}};window.__external=ReaderCore;boot();});
  await page.waitForFunction(()=>__readerStandaloneStatus.phase==='delegated');
  assert.equal(await page.evaluate(()=>ReaderCore===__external),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
