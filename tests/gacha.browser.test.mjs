import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from '../tools/build_core.mjs';

let chromium;
try { ({ chromium } = createRequire(new URL('../../_tools/shot/package.json', import.meta.url))('playwright-core')); } catch {}
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const uiAssets = JSON.parse(readFileSync(new URL('../ui/assets.json', import.meta.url), 'utf8')).files;

// Synthetic catalogue and model replies only: no real database, cover or paid model request.
const fixture = `<!doctype html><html><body><div id="chat"></div><textarea id="send_textarea"></textarea><button id="send_but">发送</button><script>
window.__ctx={chatId:'a',characterId:1,name1:'测试作家',name2:'夜梦',chatMetadata:{variables:{}},chat:[{mes:'opening',swipe_id:0,extra:{}}],saveMetadata:()=>Promise.resolve()};
window.SillyTavern={getContext:()=>window.__ctx};window.__data={stat_data:{命运点数:3000,主角:{状态效果:{},背包:{旧物:{品质:'普通',数量:1}}}}};window.__writes=0;
const reply=()=>JSON.stringify({protagonist:'旅人',plan:{items:30,fates:24},items:[6,6,6,6,6,6,6,6,6,5,5,5,4,4,4,4,3,3,3,3,3,2,2,2,2,2,1,1,1,1].map((star,i)=>({name:'书页物品'+i,star,type:'道具',description:'测试物品'+i})),fates:[6,5,5,5,4,4,4,4,3,3,3,3,3,2,2,2,2,2,2,1,1,1,1,1].map((star,i)=>({name:'书页命运'+i,star,description:'测试命运'+i}))});
window.TavernHelper={getVariables:o=>o?.type==='chat'?__ctx.chatMetadata.variables:__data,updateVariablesWith:async(f,o)=>{if(o?.type==='chat'){__ctx.chatMetadata.variables=f(__ctx.chatMetadata.variables);return;}__data=f(__data);__writes++;},insertOrAssignVariables:async()=>{},getLastMessageId:()=>__ctx.chat.length-1,getCharWorldbookNames:()=>({primary:null,additional:[]}),getWorldbook:()=>[],generateRaw:async()=>reply(),stopGenerationById(){}};
window.__mockFetch=async url=>{url=String(url);const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});let m;
 if((m=/api\\.bgm\\.tv\\/v0\\/search\\/subjects\\?limit=(\\d+)&offset=(\\d+)/.exec(url))){const limit=+m[1],offset=+m[2];return json({total:120,limit,offset,data:Array.from({length:limit},(_,i)=>({id:5000+(offset+i)%120,type:2,name:'作品'+((offset+i)%120),name_cn:'测试作品'+((offset+i)%120),summary:'少女在会移动的图书馆里醒来。',date:'2001-01-01',images:{},tags:[{name:'奇幻'}],rating:{score:7}}))});}
 if(/api\\.bgm\\.tv\\/v0\\/subjects\\/\\d+\\/characters/.test(url))return json([{id:1,name:'旅人',relation:'主角',type:1}]);
 if(/api\\.bgm\\.tv\\/v0\\/subjects\\/\\d+$/.test(url))return json({summary:'少女在会移动的图书馆里醒来，必须在三个夜晚里找回被借走的名字。',infobox:[]});
 if(/api\\.bgm\\.tv\\/v0\\/characters\\//.test(url))return json({summary:'',infobox:[]});
 return new Response('{}',{status:503});};
window.tavern_events=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED','GENERATION_AFTER_COMMANDS'].map(k=>[k,k]));
window.__events=new Map();window.eventOn=(name,fn)=>{const s=__events.get(name)||new Set();s.add(fn);__events.set(name,s);return{stop:()=>s.delete(fn)}};window.emit=name=>{for(const f of __events.get(name)||[])f()};
window.__ctx.eventTypes=window.tavern_events;window.__ctx.eventSource={makeFirst(name,fn){__events.set(name,new Set([fn,...(__events.get(name)||[])]));},removeListener(name,fn){__events.get(name)?.delete(fn);},async emit(name,...args){for(const f of __events.get(name)||[])await f(...args);}};
</script></body></html>`;

test('default standing art decodes in the lobby, appearance picker, gacha hero and casting overlay', { skip: !chromium || !existsSync(chrome), timeout: 60000 }, async () => {
  const { runtime } = await build();
  const image = readFileSync(new URL('../vendor/reader-art/cafe-default.bac5af7884aa.png', import.meta.url));
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/runtime.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/runtime.js' ? runtime : fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue()
    : route.request().resourceType() === 'image' ? route.fulfill({ contentType: 'image/png', body: image }) : route.abort());
  const decodedImg = selector => page.waitForFunction(selector => {
    const img = document.querySelector(selector);
    return img?.complete && img.naturalWidth === 832 && img.naturalHeight === 1216;
  }, selector);
  const decodedBackground = (selector, pseudo = null) => page.evaluate(async ({ selector, pseudo }) => {
    const value = getComputedStyle(document.querySelector(selector), pseudo).backgroundImage;
    const match = /^url\("(.*)"\)$/.exec(value);
    if (!match) return { present: false, decoded: false };
    const image = new Image(); image.src = match[1];
    try { await image.decode(); } catch { return { present: true, decoded: false }; }
    return { present: true, decoded: image.naturalWidth === 832 && image.naturalHeight === 1216 };
  }, { selector, pseudo });
  try {
    await page.goto(origin);
    await page.evaluate(async () => {
      window.runtimeModule = await import('/runtime.js'); runtimeModule.start(); await ReaderCore.ready;
      const controller = document.getElementById('reader-core-controller').contentWindow;
      controller.fetch = url => new Promise(resolve => {window.__releaseArtSearch = () => resolve(window.__mockFetch(url));});
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#dfb').click();
    await decodedImg('#dlb-overlay [data-u4-her]');
    await page.evaluate(() => ReaderCore.open('persona'));
    await decodedImg('#dlb-overlay .q-photo[data-id="default"] img');
    await page.evaluate(() => ReaderCore.open('lobby'));
    await page.locator('#dlb-overlay [data-dlb="gacha"]').first().click();
    await page.locator('.bs-gacha').waitFor({ state: 'visible' });
    assert.ok((await page.locator('.bs-gacha').evaluate(el => el.style.getPropertyValue('--gc-figure'))).includes(uiAssets['cafe/standing/default'].path), 'gacha must use the same new standing art as the lobby, not merely a decodable legacy image');
    assert.deepEqual(await decodedBackground('.gc-hero-fig'), { present: true, decoded: true }, 'the actual default PNG must render through the gacha CSS image variable');
    await page.locator('.bs-gacha .gc-theme', { hasText: '奇幻' }).first().click();
    const cast = page.locator('.bs-gacha .gc-actions button', { hasText: '撒网' });
    await cast.click(); await page.locator('.bs-gacha .gc-actions button.is-armed').click();
    await page.locator('.gc-cast').waitFor({ state: 'visible' });
    assert.deepEqual(await decodedBackground('.gc-cast', '::before'), { present: true, decoded: true }, 'the casting overlay must render the same standing art');
    if (process.env.READER_QA_DIR) {
      mkdirSync(process.env.READER_QA_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.READER_QA_DIR, 'default-art-casting.png') });
    }
    await page.evaluate(() => {window.__releaseArtSearch?.(); document.getElementById('reader-core-controller').contentWindow.ReaderGacha.close(); ReaderCore.close();});
    for (const [theme, appearance] of [['summer', 'classic'], ['ink', 'white_hoodie'], ['cafe', 'black_knit']]) {
      await page.evaluate(({theme, appearance}) => {
        const c = document.getElementById('reader-core-controller').contentWindow;
        c.applyVisualTheme(theme, false); c.setAppearance(appearance); ReaderCore.open('lobby');
      }, {theme, appearance});
      await decodedImg('#dlb-overlay [data-u4-her]');
      await page.locator('#dlb-overlay [data-dlb="gacha"]').first().click();
      await page.locator('.bs-gacha').waitFor({ state: 'visible' });
      const art = await page.locator('.bs-gacha').evaluate(el => ({theme: el.dataset.theme, figure: el.style.getPropertyValue('--gc-figure'), host: el.style.getPropertyValue('--gc-host'), backdrop: el.style.getPropertyValue('--gc-stage')}));
      assert.equal(art.theme, theme);
      assert.ok(art.figure.includes(uiAssets[`${theme}/standing/${appearance}`].path), `${theme}: selected outfit uses the new standing art`);
      assert.equal(art.host, art.figure, `${theme}: casting uses the same new standing art`);
      assert.ok(art.backdrop.includes(uiAssets[`${theme}/avatar/${appearance}`].path), `${theme}: stage follows the new avatar`);
      await page.evaluate(() => {document.getElementById('reader-core-controller').contentWindow.ReaderGacha.close(); ReaderCore.close();});
    }
    await page.evaluate(() => runtimeModule.stop());
  } finally {
    await browser.close();
    server.close();
  }
});

test('lobby 命运抽卡 opens the gacha above the lobby: a paid big pool, a ten-draw into MVU, recycling, then cleanup with the reader', { skip: !chromium || !existsSync(chrome), timeout: 120000 }, async () => {
  const { runtime } = await build();
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/runtime.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/runtime.js' ? runtime : fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  try {
    await page.goto(origin);
    await page.evaluate(async () => { window.runtimeModule = await import('/runtime.js'); runtimeModule.start(); await ReaderCore.ready; document.getElementById('reader-core-controller').contentWindow.fetch = window.__mockFetch; });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#dfb').click();
    await page.locator('#dlb-overlay').waitFor();
    const entry = page.locator('#dlb-overlay [data-dlb="gacha"]').first();
    assert.equal((await entry.locator('.mini').innerText()).trim(), '200');
    assert.equal(await page.evaluate(() => document.getElementById('dlb-overlay').innerHTML.includes('抽卡5次')), false);
    await entry.click();
    const gacha = page.locator('.bs-gacha');
    await gacha.waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => {
      const shell = document.querySelector('.bs-gacha .gc-shell').getBoundingClientRect(), hit = document.elementFromPoint(shell.left + shell.width / 2, shell.top + 30);
      return { top: !!hit?.closest('.bs-gacha'), lobby: !!document.getElementById('dlb-overlay'), order: document.getElementById('send_textarea').value };
    }), { top: true, lobby: true, order: '' });
    assert.equal(await gacha.getAttribute('data-theme'), 'cafe', 'the panel follows the lobby theme');
    await gacha.locator('.gc-theme', { hasText: '奇幻' }).first().click();
    const cast = gacha.locator('.gc-actions button', { hasText: '撒网' });
    await cast.click();
    assert.equal(await gacha.locator('.gc-cast').count(), 0, 'the first click only asks for confirmation');
    assert.equal(await page.evaluate(() => __writes), 0);
    await gacha.locator('.gc-actions button.is-armed').click();
    await gacha.locator('.gc-grid .gc-work').first().waitFor({ timeout: 30000 });
    assert.ok(await gacha.locator('.gc-grid .gc-work').count() >= 20);
    assert.deepEqual(await page.evaluate(() => ({ fp: __data.stat_data.命运点数, writes: __writes })), { fp: 2000, writes: 1 }, 'a new big pool costs 1000 FP once the works are in');
    await gacha.locator('.gc-grid .gc-work').first().click();
    await gacha.locator('.gc-drawer button', { hasText: '选为小池' }).click();
    await gacha.locator('.gc-tabs').waitFor({ timeout: 30000 });
    await gacha.locator('.gc-draws button', { hasText: '十连' }).click();
    await gacha.locator('.gc-stage').waitFor();
    assert.equal(await gacha.locator('.gc-card.is-open').count(), 10);
    const state = await page.evaluate(() => ({ fp: __data.stat_data.命运点数, bag: Object.values(__data.stat_data.主角.背包).filter(item => item.标签?.[0] === '命运抽卡').length, old: __data.stat_data.主角.背包.旧物, writes: __writes, pity: __ctx.chatMetadata.variables.dream_gacha?.pity?.total }));
    assert.equal(state.fp, 0, 'ten draws cost 2000 FP'); assert.equal(state.writes, 2); assert.equal(state.pity, 10);
    assert.ok(state.bag >= 1); assert.deepEqual(state.old, { 品质: '普通', 数量: 1 });
    await gacha.locator('.gc-stage-bar button', { hasText: '收下' }).click();
    await gacha.locator('.gc-head .gc-icon').nth(1).click();
    const tier = gacha.locator('.gc-rgroup').last(), recycle = tier.locator('.gc-rgroup-head button');
    const expected = await tier.evaluate(group => Number(/\+([\d,]+)/.exec(group.querySelector('.gc-rgroup-head button').textContent)[1].replace(/,/g, '')));
    await recycle.click(); await recycle.click();
    await page.waitForFunction(() => __writes === 3);
    assert.equal(await page.evaluate(() => __data.stat_data.命运点数), expected, 'recycling one quality tier pays its listed price back');
    assert.deepEqual(await page.evaluate(() => __data.stat_data.主角.背包.旧物), { 品质: '普通', 数量: 1 }, 'items from elsewhere are never recycled');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    assert.equal(await gacha.isHidden(), true);
    assert.equal(await page.locator('#dlb-overlay').isVisible(), true);
    await page.evaluate(() => runtimeModule.stop());
    assert.equal(await page.locator('.bs-gacha,#dream-gacha-style').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
