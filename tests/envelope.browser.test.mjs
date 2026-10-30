import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {existsSync,mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from '../tools/build_core.mjs';

let chromium;
try{({chromium}=createRequire(new URL('../../_tools/shot/package.json',import.meta.url))('playwright-core'));}catch{}
const chrome=process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const fixture=`<!doctype html><html><body><div id="chat"></div><textarea id="send_textarea"></textarea><button id="send_but">发送</button><script>
window.__ctx={chatId:'a',characterId:0,characters:[{avatar:'reader.png'}],name1:'测试作家',name2:'夜梦',chatMetadata:{variables:{}},chat:[{mes:'开场白',is_user:false,swipe_id:0}],saveMetadata:()=>Promise.resolve()};
window.SillyTavern={getContext:()=>window.__ctx};window.__data={stat_data:{命运点数:10000,主角:{状态效果:{}}}};
window.TavernHelper={getVariables:o=>o?.type==='chat'?__ctx.chatMetadata.variables:__data,updateVariablesWith:async(f)=>{__data=f(__data)},insertOrAssignVariables:async()=>{},getLastMessageId:()=>__ctx.chat.length-1,getCharWorldbookNames:()=>({primary:null,additional:[]}),getWorldbook:()=>[]};
window.tavern_events=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_SENT','USER_MESSAGE_RENDERED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED','GENERATION_AFTER_COMMANDS'].map(k=>[k,k]));
window.__events=new Map();window.eventOn=(name,fn)=>{const s=__events.get(name)||new Set();s.add(fn);__events.set(name,s);return{stop:()=>s.delete(fn)}};window.emit=name=>{for(const f of __events.get(name)||[])f()};
window.__ctx.eventTypes=window.tavern_events;window.__ctx.eventSource={makeFirst(name,fn){__events.set(name,new Set([fn,...(__events.get(name)||[])]));},removeListener(name,fn){__events.get(name)?.delete(fn);}};
window.mountMessage=(texts=[])=>{const id=__ctx.chat.length;__ctx.chat.push({mes:texts.map(t=>'<dream>'+t+'</dream>').join('')||'没有读者标签的普通新消息',is_user:!texts.length,swipe_id:0});const mes=document.createElement('div');mes.className='mes';mes.setAttribute('mesid',id);for(const text of texts){const frame=document.createElement('iframe');frame.src='/letter?text='+encodeURIComponent(text);frame.style.cssText='width:100%;height:600px;border:0';mes.append(frame);}document.getElementById('chat').append(mes);emit(texts.length?'MESSAGE_RECEIVED':'MESSAGE_SENT');return id;};
</script></body></html>`;

test('one existing envelope follows inline, float and hide settings and only reads the current floor',{skip:!chromium||!existsSync(chrome),timeout:60000},async()=>{
 const {runtime,rules}=await build(),letter=rules[0].replaceString.replace(/^```html\n/,'').replace(/\n```$/,'');
 const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://reader.test');response.setHeader('Content-Type',url.pathname==='/runtime.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
  response.end(url.pathname==='/runtime.js'?runtime:url.pathname==='/letter'?letter.replace('$1',url.searchParams.get('text')||'测试来信'):fixture);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:chrome,headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
 const qa=resolve(process.env.READER_QA_DIR||'.runtime/envelope-qa');mkdirSync(qa,{recursive:true});
 await page.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('data:')?route.continue():route.abort());
 async function closeAll(){await page.evaluate(()=>{ReaderCore.close();document.querySelector('#dfo .dream-fpx')?.click();});await page.locator('#dlb-overlay,#dfo').waitFor({state:'detached'});}
 async function toggleHidden(){await page.evaluate(()=>ReaderCore.open('eggs'));await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').click();await page.evaluate(()=>ReaderCore.close());await page.locator('#dlb-overlay').waitFor({state:'detached'});}
 async function mode(value){await page.evaluate(value=>{const c=document.getElementById('reader-core-controller').contentWindow;if(ReaderCore.settings().mode!==value)c.toggleDisplayMode();},value);await page.waitForFunction(value=>ReaderCore.settings().mode===value,value);}
 async function latestLetters(id,count){await page.waitForFunction(({id,count})=>ReaderCore.getLetters(id).length===count,{id,count});await page.evaluate(()=>ReaderCore.refresh());}
 try{
  await page.goto(origin);await page.evaluate(async()=>{window.runtimeModule=await import('/runtime.js');runtimeModule.start();await ReaderCore.ready;});
  assert.equal(await page.locator('#reader-core-launcher').count(),0,'no extra launcher is introduced');
  assert.equal(await page.locator('#dfb').count(),1);assert.equal(await page.evaluate(()=>ReaderCore.settings().hidePersistentFloat),false);
  await page.screenshot({path:resolve(qa,'envelope-default.png')});
  assert.deepEqual(await page.evaluate(()=>{const frame=document.getElementById('reader-core-controller');frame.contentWindow.dreamCmd('float');frame.contentWindow.dreamCmd('inline');const box=frame.getBoundingClientRect(),style=getComputedStyle(frame);return {width:box.width,height:box.height,opacity:style.opacity,pointerEvents:style.pointerEvents};}),{width:1,height:1,opacity:'0',pointerEvents:'none'},'legacy mode broadcasts cannot reveal the controller iframe');assert.equal(await page.locator('#dfb').count(),1);assert.equal(await page.locator('#reader-core-launcher').count(),0);
  await page.locator('#dfb').click({force:true});await page.locator('#dlb-overlay').waitFor();assert.equal(await page.locator('#dfo').count(),0,'inline envelope opens the menu directly');
  await closeAll();
  // Drag preserves the old envelope interaction without opening a window.
  const before=await page.locator('#dfb').boundingBox();assert.ok(before);
  await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.mouse.move(before.x+before.width/2-150,before.y+before.height/2-80,{steps:6});await page.mouse.up();
  await page.waitForFunction(()=>window.__dfbPos&&document.getElementById('dfb').__vx===__dfbPos.x);
  assert.equal(await page.locator('#dfo,#dlb-overlay').count(),0,'dragging never opens letters or menu');
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>{const box=document.getElementById('dfb')?.getBoundingClientRect();return box&&box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight;});assert.equal(await page.locator('#dfb').count(),1,'the sole envelope stays reachable after a mobile resize');
  await page.setViewportSize({width:1280,height:900});await page.waitForFunction(()=>{const box=document.getElementById('dfb')?.getBoundingClientRect();return box&&box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight;});const position=await page.evaluate(()=>({...__dfbPos}));
  const first=await page.evaluate(()=>mountMessage(['第一封当前来信','第二封当前来信']));await latestLetters(first,2);
  // Inline plus hidden: use the embedded envelope; no host float is shown.
  assert.equal(await page.locator('.mes[mesid="'+first+'"] iframe').first().isVisible(),true);
  await toggleHidden();assert.equal(await page.evaluate(()=>localStorage.getItem('dream_hide_persistent_float')),'on');assert.equal(await page.locator('#dfb').count(),0);
  const inlineFrame=page.frameLocator('.mes[mesid="'+first+'"] iframe').first();
  await inlineFrame.locator('.envelope-casing').click();await inlineFrame.locator('#menu-trigger').click();await page.locator('#dlb-overlay').waitFor();await closeAll();
  // The same switch is available in every theme and persists across page reload.
  for(const theme of ['cafe','summer','ink']){
   await page.evaluate(theme=>{const c=document.getElementById('reader-core-controller').contentWindow;c.applyVisualTheme(theme,false);ReaderCore.refresh();return ReaderCore.open('eggs');},theme);
   assert.equal(await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').count(),1,theme);if(theme==='cafe'){await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('dlb-overlay')).opacity)>.99);await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(qa,'envelope-setting.png')});}await closeAll();
  }
  await mode('float');assert.equal(await page.locator('.mes[mesid="'+first+'"] iframe').first().isVisible(),false,'float mode hides the embedded frame');assert.equal(await page.locator('#dfb').count(),1,'legacy float remains available when the latest floor has letters');
  assert.deepEqual(await page.evaluate(()=>({...__dfbPos})),position,'mode changes keep the dragged envelope position');
  await page.locator('#dfb').click({force:true});await page.locator('#dfo .text-body-royal').waitFor();await page.waitForFunction(()=>document.querySelector('#dfo .text-body-royal')?.textContent==='第一封当前来信');
  assert.equal(await page.locator('#dlb-overlay').count(),0);assert.equal(await page.locator('#dfo .dream-fpa').textContent(),'1 / 2');
  await page.locator('#dfo .menu-trigger-zone').click();await page.locator('#dlb-overlay').waitFor();assert.equal(await page.locator('#dfo').count(),0,'opening the menu closes the floating letter window');
  await page.locator('#dfb').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#dfo .text-body-royal')?.textContent==='第一封当前来信');assert.equal(await page.locator('#dlb-overlay').count(),0,'opening current letters closes the menu without a second overlay');
  await page.locator('#dfo .dream-fpa').click();await page.waitForFunction(()=>document.querySelector('#dfo .text-body-royal')?.textContent==='第二封当前来信');await closeAll();
  await mode('inline');assert.equal(await page.locator('.mes[mesid="'+first+'"] iframe').first().isVisible(),true,'returning inline restores the embedded frame');assert.equal(await page.locator('#dfb').count(),0);await mode('float');
  // A new user floor with no tag must not keep yesterday's unread letter.
  await page.evaluate(()=>mountMessage());await page.waitForFunction(()=>!document.getElementById('dfb'));assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),0);
  await toggleHidden();assert.equal(await page.evaluate(()=>ReaderCore.settings().hidePersistentFloat),false);assert.equal(await page.locator('#dfb').count(),1);
  await page.locator('#dfb').click({force:true});await page.locator('#dlb-overlay').waitFor();assert.equal(await page.locator('#dfo').count(),0,'persistent float without a current letter opens the menu');await closeAll();
  // A selected candidate losing its tags updates immediately; old frame data cannot win.
  const swipe=await page.evaluate(()=>mountMessage(['候选中的当前来信']));await latestLetters(swipe,1);await page.locator('#dfb').click({force:true});await page.waitForFunction(()=>document.querySelector('#dfo .text-body-royal')?.textContent==='候选中的当前来信');await closeAll();
  await toggleHidden();
  await page.evaluate(()=>{const id=__ctx.chat.length-1;__ctx.chat[id].mes='换成无标签候选';__ctx.chat[id].swipe_id=1;emit('MESSAGE_SWIPED');});
  await page.waitForFunction(()=>!document.getElementById('dfb'));assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),0);assert.equal(await page.locator('.mes[mesid="'+swipe+'"] iframe').count(),1,'a still-connected old candidate cannot keep the float alive');
  await page.evaluate(()=>{const id=__ctx.chat.length-1;__ctx.chat[id].mes='<dream>编辑测试来信</dream>';__ctx.chat[id].swipe_id=2;const frame=document.createElement('iframe');frame.src='/letter?text='+encodeURIComponent('编辑测试来信');document.querySelector('.mes[mesid="'+id+'"]').replaceChildren(frame);emit('MESSAGE_SWIPED');});await latestLetters(swipe,1);await page.waitForFunction(()=>document.getElementById('dfb'));
  await page.evaluate(()=>{__ctx.chat[__ctx.chat.length-1].mes='编辑后已删除读者标签';emit('MESSAGE_UPDATED');});await page.waitForFunction(()=>!document.getElementById('dfb'));assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),0,'editing away the tag excludes a still-connected frame from the same candidate');
  await page.evaluate(()=>{const id=__ctx.chat.length-1;__ctx.chat.pop();document.querySelector('.mes[mesid="'+id+'"]').remove();emit('MESSAGE_DELETED');});
  assert.equal(await page.locator('#dfb').count(),0,'deleting the changed candidate returns to the tagless user floor');
  await page.evaluate(()=>{const id=__ctx.chat.length-1;__ctx.chat.pop();document.querySelector('.mes[mesid="'+id+'"]').remove();emit('MESSAGE_DELETED');});
  await page.waitForFunction(()=>document.getElementById('dfb'));assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),2,'deleting the tagless floor exposes the prior current letters');
  await page.reload();await page.evaluate(async()=>{window.runtimeModule=await import('/runtime.js');runtimeModule.start();await ReaderCore.ready;});
  assert.equal(await page.evaluate(()=>ReaderCore.settings().hidePersistentFloat),true);assert.equal(await page.evaluate(()=>ReaderCore.settings().mode),'float');assert.equal(await page.locator('#dfb').count(),0);
  await page.evaluate(()=>runtimeModule.stop());assert.equal(await page.locator('#reader-core-controller,#reader-core-launcher,#dfb,#dfo,#dlb-overlay').count(),0);assert.equal(await page.evaluate(()=>[...__events.values()].reduce((n,s)=>n+s.size,0)),0);assert.deepEqual(errors,[]);
 }catch(error){console.error('envelope fixture state',await page.evaluate(()=>({settings:(()=>{const s=window.ReaderCore?.settings()||{};return {theme:s.theme,mode:s.mode,hidePersistentFloat:s.hidePersistentFloat};})(),letters:window.ReaderCore?.getLetters().map(l=>l.html),paper:document.querySelector('#dfo .text-body-royal')?.innerHTML,menu:!!document.getElementById('dlb-overlay'),errors:window.__readerControllerAlive,ctx:window.__ctx?.chat})));throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('retained complete letter frames use the shared menu and remain available in hidden float mode',{skip:!chromium||!existsSync(chrome),timeout:60000},async()=>{
 const {runtime,rules}=await build(),light=rules[0].replaceString.replace(/^```html\n/,'').replace(/\n```$/,'');
 const [css,body,album,transactions,legacy]=await Promise.all(['legacy-reader.css','legacy-body.html','booksea-album.js','reader-transactions.js','legacy-reader.js'].map(name=>readFile(new URL('../source/'+name,import.meta.url),'utf8')));
 const full='<!doctype html><html><head><style>'+css+'</style></head><body>'+body.replace('<!--DREAM_LETTER-->','升级前已经显示的来信')+'<script>'+[album,transactions,legacy].join('\n;\n')+'</script></body></html>';
 const server=createServer((request,response)=>{const url=new URL(request.url,'http://reader.test');response.setHeader('Content-Type',url.pathname==='/runtime.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');response.end(url.pathname==='/runtime.js'?runtime:url.pathname==='/full'?full:url.pathname==='/letter'?light.replace('$1',url.searchParams.get('text')||'轻量来信'):fixture);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:chrome,headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
 await page.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('data:')?route.continue():route.abort());
 try{
  await page.goto(origin);
  await page.evaluate(()=>{__ctx.chat.push({mes:'<dream>升级前已经显示的来信</dream>',is_user:false,swipe_id:0});const mes=document.createElement('div');mes.className='mes';mes.setAttribute('mesid',1);const frame=document.createElement('iframe');frame.src='/full';frame.style.cssText='width:100%;height:600px;border:0';mes.append(frame);document.getElementById('chat').append(mes);});
  const old=page.frameLocator('.mes[mesid="1"] iframe');
  await old.locator('#menu-trigger').waitFor({state:'attached'});await page.waitForFunction(()=>document.querySelector('.mes iframe').contentWindow.__isDreamIframe===true);
  await page.evaluate(async()=>{window.runtimeModule=await import('/runtime.js');runtimeModule.start();await ReaderCore.ready;});
  // A regex replacement does not redraw previously displayed complete frames.
  await old.locator('.envelope-casing').click();await old.locator('#menu-trigger').click();
  await page.locator('#dlb-overlay [data-dlb="page"][data-page="eggs"]').first().click();
  assert.equal(await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').count(),1,'the old inline entry must open the same current menu');
  assert.equal(await page.evaluate(()=>document.getElementById('dlb-overlay').__dlbOwner===document.getElementById('reader-core-controller')),true);
  await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').click();
  assert.equal(await page.locator('#dfb').count(),0);
  await page.evaluate(()=>ReaderCore.close());await page.locator('#dlb-overlay').waitFor({state:'detached'});
  await old.locator('#menu-trigger').click();await page.locator('#dlb-overlay [data-dlb="page"][data-page="eggs"]').first().click();
  await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').click();assert.equal(await page.locator('#dfb').count(),1,'the inline entry can restore the hidden persistent envelope');
  await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').click();
  await page.locator('#dlb-overlay [data-dlb="eggdisplay"]').click();
  await page.waitForFunction(()=>ReaderCore.settings().mode==='float'&&document.getElementById('dfb'));
  assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),1,'the currently displayed complete frame supplies its current-floor letter');
  await page.evaluate(()=>ReaderCore.close());await page.locator('#dlb-overlay').waitFor({state:'detached'});
  await page.locator('#dfb').click({force:true});await page.waitForFunction(()=>document.querySelector('#dfo .text-body-royal')?.textContent==='升级前已经显示的来信');
  // Chat redraw is asynchronous: a previous chat's complete frame can still be
  // connected while the new chat already uses the same numeric message id.
  await page.evaluate(async()=>{window.__originalChat=__ctx.chat;__ctx.chatId='b';__ctx.chat=[{mes:'新的开场白',swipe_id:0},{mes:'<dream>另一个聊天的来信</dream>',swipe_id:0}];emit('CHAT_CHANGED');await ReaderCore.ready;});
  assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),0,'a prior-chat document cannot be registered as the new same-numbered message');
  assert.equal(await page.locator('#dfb').count(),0);
  await page.evaluate(async()=>{__ctx.chatId='a';__ctx.chat=__originalChat;emit('CHAT_CHANGED');await ReaderCore.ready;});await page.waitForFunction(()=>ReaderCore.getLetters().length===1&&document.getElementById('dfb'));
  await page.evaluate(()=>{ReaderCore.close();mountMessage();});await page.waitForFunction(()=>!document.getElementById('dfb'));
  assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),0,'retained old frames cannot keep a tagless latest floor visible');
  await page.evaluate(()=>{const id=__ctx.chat.length-1;__ctx.chat.pop();document.querySelector('.mes[mesid="'+id+'"]').remove();emit('MESSAGE_DELETED');});await page.waitForFunction(()=>document.getElementById('dfb'));
  await page.evaluate(()=>{__ctx.chat[1].mes='已编辑为没有标签';emit('MESSAGE_UPDATED');});await page.waitForFunction(()=>!document.getElementById('dfb'));
  await page.evaluate(async()=>{runtimeModule.stop();runtimeModule.start();await ReaderCore.ready;});
  assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),0,'restarting the core cannot adopt an edited-away old document as a new letter');
  assert.equal(await page.locator('#dfb').count(),0);
  await page.evaluate(()=>{document.querySelector('.mes[mesid="1"] iframe').src='data:text/html,<body>different origin</body>';});
  await page.waitForFunction(()=>document.querySelector('.mes[mesid="1"] iframe').contentDocument===null);
  assert.equal(await page.evaluate(()=>ReaderCore.getLetters().length),0,'navigating a retained frame removes its old registration');
  const lateId=await page.evaluate(()=>{const id=__ctx.chat.length;__ctx.chat.push({mes:'<dream>升级前已经显示的来信</dream>',swipe_id:0});const mes=document.createElement('div');mes.className='mes';mes.setAttribute('mesid',id);const frame=document.createElement('iframe');frame.src='/full';frame.style.cssText='width:100%;height:600px;border:0';mes.append(frame);document.getElementById('chat').append(mes);emit('MESSAGE_RECEIVED');return id;});
  await page.waitForFunction(()=>ReaderCore.getLetters().length===1&&document.getElementById('dfb'));
  assert.equal(await page.evaluate(()=>ReaderCore.settings().hidePersistentFloat),true,'a complete frame loaded after startup also supplies the hidden-mode envelope');
  await page.evaluate(()=>document.getElementById('reader-core-controller').contentWindow.toggleDisplayMode());
  const late=page.frameLocator('.mes[mesid="'+lateId+'"] iframe');
  for(const theme of ['cafe','summer','ink']){
   await page.evaluate(theme=>{document.getElementById('reader-core-controller').contentWindow.applyVisualTheme(theme,false);ReaderCore.refresh();},theme);
   if(await late.locator('.letter-interaction').getAttribute('open')===null)await late.locator('.envelope-casing').click();
   await late.locator(theme==='ink'?'.jn-scroll-menu':'#menu-trigger').click();await page.locator('#dlb-overlay [data-dlb="page"][data-page="eggs"]').first().click();
   assert.equal(await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').count(),1,theme+' has the same switch through the complete inline frame');
   await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').click();assert.equal(await page.locator('#dfb').count(),1);
   await page.locator('#dlb-overlay [data-dlb="egghidefloat"]').click();assert.equal(await page.locator('#dfb').count(),0);
   await page.evaluate(()=>ReaderCore.close());await page.locator('#dlb-overlay').waitFor({state:'detached'});
  }
  await page.evaluate(()=>runtimeModule.stop());assert.equal(await page.locator('#reader-core-controller,#dfb,#dfo,#dlb-overlay').count(),0,'cleanup completes even with a navigated complete frame');
  assert.deepEqual(errors,[]);
 }catch(error){console.error('retained complete frame state',await page.evaluate(()=>{const f=document.querySelector('.mes[mesid="2"] iframe'),d=f?.contentDocument,t=d?.getElementById('menu-trigger');const settings=ReaderCore?.settings();return {settings:{theme:settings?.theme,mode:settings?.mode,hidePersistentFloat:settings?.hidePersistentFloat},frameStyle:f?.getAttribute('style'),bodyClass:d?.body.className,outerOpen:d?.querySelector('.outer-collapse')?.open,letterOpen:d?.querySelector('.letter-interaction')?.open,trigger:t&&{display:d.defaultView.getComputedStyle(t).display,box:t.getBoundingClientRect().toJSON()}};}));throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
