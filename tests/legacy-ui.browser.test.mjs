import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from '../tools/build_core.mjs';

let chromium;
try { ({ chromium } = createRequire(new URL('../../_tools/shot/package.json', import.meta.url))('playwright-core')); } catch {}
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const assets = JSON.parse(readFileSync(new URL('../ui/assets.json', import.meta.url), 'utf8')).files;
const image = readFileSync(new URL('../vendor/reader-art/cafe-default.bac5af7884aa.png', import.meta.url));

const fixture = `<!doctype html><html><body><div id="chat"></div><textarea id="send_textarea"></textarea><button id="send_but">发送</button><script>
window.__ctx={chatId:'legacy-ui',characterId:1,name1:'测试作家',name2:'夜梦',chatMetadata:{variables:{saved_story:'保留的故事'}},chat:[{mes:'opening',swipe_id:0}],saveMetadata:()=>Promise.resolve()};
window.SillyTavern={getContext:()=>__ctx};window.__data={stat_data:{命运点数:12345,主角:{状态效果:{},背包:{旧物:{品质:'普通',数量:1}}}}};window.__writes=0;
window.TavernHelper={getVariables:o=>o?.type==='chat'?__ctx.chatMetadata.variables:__data,updateVariablesWith:async(f,o)=>{if(o?.type==='chat')__ctx.chatMetadata.variables=f(__ctx.chatMetadata.variables);else {__data=f(__data);__writes++;}},insertOrAssignVariables:async()=>{},getLastMessageId:()=>__ctx.chat.length-1,getCharWorldbookNames:()=>({primary:null,additional:[]}),getWorldbook:()=>[]};
window.tavern_events=Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_DELETED','GENERATION_ENDED','GENERATION_AFTER_COMMANDS'].map(k=>[k,k]));
window.__events=new Map();window.eventOn=(name,fn)=>{const set=__events.get(name)||new Set();set.add(fn);__events.set(name,set);return {stop:()=>set.delete(fn)}};
window.__ctx.eventTypes=tavern_events;window.__ctx.eventSource={makeFirst(name,fn){__events.set(name,new Set([fn,...(__events.get(name)||[])]));},removeListener(name,fn){__events.get(name)?.delete(fn);},async emit(name,...args){for(const fn of __events.get(name)||[])await fn(...args);}};
</script></body></html>`;

test('the legacy frontend switch restores all three complete themes and returns to the new frontend without restarting music', {
  skip: !chromium || !existsSync(chrome), timeout: 120000,
}, async () => {
  // build() assembles the current editable sources in memory; it does not publish or write release files.
  const { runtime, rules } = await build();
  const letter = rules[0].replaceString.replace(/^```html\r?\n/, '').replace(/\r?\n```$/, '');
  const letterBody = '<p>切换前已经显示的来信。</p><blockquote>需要保留的引用。</blockquote>';
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://reader.test');
    response.setHeader('Content-Type', url.pathname === '/runtime.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(url.pathname === '/runtime.js' ? runtime : url.pathname === '/letter' ? letter.replace('$1', letterBody) : fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue()
    : route.request().resourceType() === 'image' ? route.fulfill({ contentType: 'image/png', body: image }) : route.abort());

  async function start() {
    await page.evaluate(async () => {
      window.runtimeModule = await import('/runtime.js'); runtimeModule.start(); await ReaderCore.ready;
      window.__controller = document.getElementById('reader-core-controller').contentWindow;
    });
  }
  async function open(view) { assert.equal(await page.evaluate(view => ReaderCore.open(view), view), true); }
  async function assertSwitchPosition(legacy) {
    const position = await page.locator('#dlb-overlay [data-dlb="egglegacyui"]').evaluate(node => {
      const previous = node.previousElementSibling, next = node.nextElementSibling;
      const headings = [...node.parentElement.children].filter(element => element.classList.contains('dlb-sub-h')
        && !!(element.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING));
      return {
        afterTheme: previous?.id === 'dlb-fold-theme',
        beforeYuan: next?.getAttribute('data-dlb') === 'eggfold' && next?.getAttribute('data-k') === 'yuan',
        insideTheme: !!node.closest('#dlb-fold-theme'),
        inDesk: !!node.closest('.q-sec-desk'),
        afterManagementHeading: /管理台/.test(headings.at(-1)?.textContent || ''),
      };
    });
    assert.deepEqual(position, { afterTheme: true, beforeYuan: true, insideTheme: false,
      inDesk: !legacy, afterManagementHeading: legacy },
    'the frontend switch is a visible management item directly below the theme section in either frontend');
  }
  async function toggle(legacy) {
    await open('eggs');
    const control = page.locator('#dlb-overlay [data-dlb="egglegacyui"]');
    assert.equal(await control.count(), 1, 'the switch remains reachable in either frontend');
    assert.match(await control.textContent(), /启用老版前端/);
    assert.equal(await control.evaluate(node => node.classList.contains('on')), !legacy);
    await assertSwitchPosition(!legacy);
    await control.click();
    await page.waitForFunction(legacy => (localStorage.getItem('dream_ui_v4') === 'off') === legacy, legacy);
    await page.waitForFunction(legacy => !!document.querySelector('#dlb-overlay #u4r') === !legacy, legacy);
    assert.equal(await page.locator('#dlb-overlay [data-dlb="egglegacyui"]').evaluate(node => node.classList.contains('on')), legacy);
    await assertSwitchPosition(legacy);
    if (process.env.READER_QA_DIR) {
      mkdirSync(process.env.READER_QA_DIR, { recursive: true });
      await page.locator('#dlb-overlay [data-dlb="egglegacyui"]').scrollIntoViewIfNeeded();
      const theme = await page.evaluate(() => ReaderCore.settings().theme);
      await page.screenshot({ path: join(process.env.READER_QA_DIR, `${theme}-${legacy ? 'legacy' : 'current'}-eggs.png`), animations: 'disabled' });
    }
  }
  async function assertLetters(legacy, theme) {
    await page.waitForFunction(({ legacy, theme }) => [...document.querySelectorAll('.mes iframe')].every(frame => {
      const doc = frame.contentDocument;
      return !!doc?.querySelector('.wrapper-v9-fix') && !!doc.querySelector('.wrapper-v9-fix.lv') === !legacy
        && doc.documentElement.getAttribute('data-dream-theme') === theme;
    }), { legacy, theme });
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.mes iframe')].map(frame => ({
      same: frame === __letterFrames[Number(frame.dataset.letterIndex)],
      body: frame.contentDocument.querySelector('.text-body-royal').innerHTML,
      quote: frame.contentDocument.querySelector('.text-body-royal blockquote')?.textContent,
      open: frame.contentDocument.querySelector('.letter-interaction').open,
      player: !!frame.contentDocument.querySelector('audio'),
    }))), [0, 1].map(() => ({ same: true, body: letterBody, quote: '需要保留的引用。', open: true, player: false })));
    assert.equal(await page.evaluate(() => ReaderCore.getLetters(1).length), 2, 'redrawing letters preserves their registration');
  }
  async function assertPages(legacy) {
    for (const view of ['lobby', 'persona', 'tuning', 'decouple', 'template', 'eggs']) {
      await open(view);
      assert.equal(await page.locator('#dlb-overlay #u4r').count(), legacy ? 0 : 1, view);
      assert.ok((await page.locator('#dlb-overlay').textContent()).trim().length > 10, `${view} is rendered`);
    }
  }
  async function assertGacha(legacy, theme) {
    await open('lobby');
    await page.locator('#dlb-overlay [data-dlb="gacha"]').first().click();
    await page.locator('.bs-gacha').waitFor({ state: 'visible' });
    const art = await page.locator('.bs-gacha').evaluate(node => ({
      theme: node.dataset.theme, figure: node.style.getPropertyValue('--gc-figure'), host: node.style.getPropertyValue('--gc-host'),
    }));
    assert.equal(art.theme, theme);
    const expected = legacy ? await page.evaluate(() => __controller.getStandingArtUrl()) : assets[`${theme}/standing/default`].path;
    assert.ok(art.figure.includes(expected), `${theme}: gacha follows the ${legacy ? 'old' : 'new'} standing art`);
    assert.equal(art.host, art.figure, 'casting uses the same standing art as the gacha panel');
    await page.evaluate(() => __controller.ReaderGacha.close());
    await page.locator('.bs-gacha').waitFor({ state: 'hidden' });
  }

  try {
    await page.goto(origin);
    assert.equal(await page.evaluate(() => localStorage.getItem('dream_ui_v4')), null);
    await start();
    await open('eggs');
    assert.equal(await page.locator('#u4r').count(), 1, 'a new player sees the new frontend by default');
    assert.equal(await page.locator('[data-dlb="egglegacyui"]').evaluate(node => node.classList.contains('on')), false);
    await page.evaluate(() => {
      __ctx.chat.push({ mes: '<dream>切换前已经显示的来信。</dream>', swipe_id: 0 });
      const mes = document.createElement('div'); mes.className = 'mes'; mes.setAttribute('mesid', '1');
      window.__letterFrames = [0, 1].map(i => { const frame = document.createElement('iframe'); frame.dataset.letterIndex = i; frame.src = '/letter'; mes.append(frame); return frame; });
      document.getElementById('chat').append(mes);
    });
    await page.waitForFunction(() => ReaderCore.getLetters(1).length === 2);
    await page.evaluate(async () => {
      for (const frame of __letterFrames) frame.contentDocument.querySelector('.letter-interaction').open = true;
      window.__audio = __controller.document.getElementById('bgm-player');
      const samples = 8000 * 120, buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer);
      const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples * 2, true);
      __audio.src = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })); await __audio.play();
    });
    const before = await page.evaluate(() => ({ time: __audio.currentTime, data: JSON.stringify(__data) }));

    for (const theme of ['cafe', 'summer', 'ink']) {
      await page.evaluate(theme => { __controller.applyVisualTheme(theme, false); ReaderCore.refresh(); }, theme);
      await assertLetters(false, theme);
      await toggle(true);
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-u4-theme')), false, 'old popup styles have no new-theme selector');
      assert.equal(await page.locator('#dream-u4-style,#dream-u4-envelope').count(), 0, 'new lobby and envelope styles are removed');
      assert.equal(await page.evaluate(() => !!ReaderCore.settings().ui), false);
      await assertLetters(true, theme);
      await assertPages(true);
      await assertGacha(true, theme);
      await toggle(false);
      await assertLetters(false, theme);
      await assertPages(false);
      await assertGacha(false, theme);
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-u4-theme')), theme);
    }

    // Another same-origin context changes this device preference while a paid receipt is open.
    // Removing the receipt must cancel its promise and keyboard handler, so Enter cannot accept an invisible order.
    await open('lobby');
    await page.evaluate(() => {
      window.__orderSettled = false;
      window.__pendingOrder = __controller.handleRhythm('喜').finally(() => { __orderSettled = true; });
    });
    await page.locator('.u4-rc').waitFor({ state: 'visible' });
    await page.evaluate(() => localStorage.setItem('dream_ui_v4', 'off'));
    await page.waitForFunction(() => !!document.getElementById('dlb-overlay') && !document.getElementById('u4r'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __orderSettled);
    assert.deepEqual(await page.evaluate(() => ({ writes: __writes, order: document.getElementById('send_textarea').value })),
      { writes: 0, order: '' }, 'frontend changes cancel pending paid receipts instead of confirming an invisible order');
    await toggle(false);

    await page.waitForFunction(time => __audio.currentTime > time, before.time);
    assert.deepEqual(await page.evaluate(() => ({
      sameController: document.getElementById('reader-core-controller').contentWindow === __controller,
      sameAudio: __controller.document.getElementById('bgm-player') === __audio, paused: __audio.paused,
      data: JSON.stringify(__data), writes: __writes, story: __ctx.chatMetadata.variables.saved_story,
    })), { sameController: true, sameAudio: true, paused: false, data: before.data, writes: 0, story: '保留的故事' });

    // The floating letter's retained service menu has the same switch and can switch back.
    await page.evaluate(async () => { __controller.toggleDisplayMode(); await ReaderCore.open({ page: 'letters', messageId: 1 }); });
    await page.locator('#dfo [data-action="toggleLegacyFrontend"]').waitFor({ state: 'attached' });
    await page.locator('#dfo [data-action="toggleLegacyFrontend"]').evaluate(node => node.click());
    await page.waitForFunction(() => localStorage.getItem('dream_ui_v4') === 'off');
    await page.reload();
    await start();
    await open('eggs');
    assert.equal(await page.locator('#u4r').count(), 0, 'the old frontend preference survives reload');
    assert.equal(await page.locator('[data-dlb="egglegacyui"]').evaluate(node => node.classList.contains('on')), true);
    await toggle(false);
    await page.reload();
    await start();
    await open('eggs');
    assert.equal(await page.locator('#u4r').count(), 1, 'turning the preference off also survives reload');
    assert.equal(await page.locator('[data-dlb="egglegacyui"]').evaluate(node => node.classList.contains('on')), false);
    await page.evaluate(() => runtimeModule.stop());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

for (const version of ['2026.11.10.6', '2026.11.08.1']) {
  test(`already rendered v${version} light letters adopt the current frontend switch without losing content or double-binding actions`, {
    skip: !chromium || !existsSync(chrome), timeout: 60000,
  }, async t => {
    let historical;
    try {
      const rules = JSON.parse(execFileSync('git', ['show', `v${version}:regex/读者对话渲染-脚本版.json`], {
        cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', maxBuffer: 2000000, stdio: ['ignore', 'pipe', 'ignore'],
      }));
      historical = (Array.isArray(rules) ? rules[0] : rules).replaceString;
    } catch {
      t.skip(`historical release tag v${version} is unavailable; fetch repository tags to run the upgrade regression`);
      return;
    }
    const { runtime } = await build();
    const body = '<p>升级前的来信。</p><blockquote>升级前的引用。</blockquote>';
    const letter = historical.replace(/^```html\r?\n/, '').replace(/\r?\n```$/, '').replace('$1', body);
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', request.url === '/runtime.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
      response.end(request.url === '/runtime.js' ? runtime : request.url === '/letter' ? letter : fixture);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: chrome, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue()
      : route.request().resourceType() === 'image' ? route.fulfill({ contentType: 'image/png', body: image }) : route.abort());
    async function expectLetter(legacy) {
      await page.waitForFunction(legacy => {
        const doc = document.querySelector('.mes iframe')?.contentDocument;
        return !!doc?.querySelector('.wrapper-v9-fix') && !!doc.querySelector('.wrapper-v9-fix.lv') === !legacy;
      }, legacy);
      assert.deepEqual(await page.evaluate(() => {
        const frame = document.querySelector('.mes iframe'), doc = frame.contentDocument;
        return { same: frame === __letterFrame, bodyNode: doc.querySelector('.text-body-royal').firstChild === __bodyNode,
          body: doc.querySelector('.text-body-royal').innerHTML, signature: doc.querySelector('.sig-mini').textContent,
          open: doc.querySelector('.letter-interaction').open, count: ReaderCore.getLetters(1).length };
      }), { same: true, bodyNode: true, body, signature: '保存的旧签名', open: true, count: 1 });
      if (!legacy) await page.waitForFunction(() => {
        const doc = document.querySelector('.mes iframe').contentDocument, avatar = doc.getElementById('char-face-img');
        return avatar.complete && avatar.naturalWidth > 0 && Number(doc.defaultView.getComputedStyle(avatar).opacity) > .99;
      });
    }
    try {
      await page.goto(origin);
      // Mount the released frame before starting its replacement runtime: this is the hot-upgrade path.
      await page.evaluate(() => {
        __ctx.chat.push({ mes: '<dream>升级前的来信。</dream>', swipe_id: 0 });
        const mes = document.createElement('div'); mes.className = 'mes'; mes.setAttribute('mesid', '1');
        window.__letterFrame = document.createElement('iframe'); __letterFrame.src = '/letter';
        mes.append(__letterFrame); document.getElementById('chat').append(mes);
      });
      await page.waitForFunction(() => !!document.querySelector('.mes iframe')?.contentWindow.ReaderLetter);
      await page.evaluate(async () => {
        const doc = __letterFrame.contentDocument;
        window.__bodyNode = doc.querySelector('.text-body-royal').firstChild;
        doc.querySelector('.sig-mini').textContent = '保存的旧签名'; doc.querySelector('.letter-interaction').open = true;
        window.runtimeModule = await import('/runtime.js'); runtimeModule.start(); await ReaderCore.ready;
      });
      await expectLetter(false);
      for (const legacy of [true, false, true, false]) {
        await page.evaluate(() => ReaderCore.open('eggs'));
        await page.locator('#dlb-overlay [data-dlb="egglegacyui"]').click();
        await expectLetter(legacy);
      }
      // A retained old anonymous event handler must not combine with a newly installed handler.
      await page.evaluate(() => {
        window.__musicCommands = 0; const command = ReaderCore.command;
        ReaderCore.command = function (name, ...args) { if (name === 'togglePlay') { __musicCommands++; return Promise.resolve(true); } return command.call(this, name, ...args); };
        __letterFrame.contentDocument.getElementById('record-btn').click();
      });
      assert.equal(await page.evaluate(() => __musicCommands), 1, 'one click performs one music command after migration');
      for (const mode of ['float', 'inline']) {
        await page.evaluate(() => document.getElementById('reader-core-controller').contentWindow.toggleDisplayMode());
        await page.waitForFunction(mode => {
          const frame = document.querySelector('.mes iframe');
          return ReaderCore.settings().mode === mode && (getComputedStyle(frame).display === 'none') === (mode === 'float');
        }, mode);
        assert.equal(await page.evaluate(() => ReaderCore.getLetters(1).length), 1, 'migrating a retained letter preserves inline/float registration');
      }
      await page.evaluate(() => runtimeModule.stop());
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
}

test('a retained complete pre-reset letter adopts both frontends and routes each action once to the shared runtime', {
  skip: !chromium || !existsSync(chrome), timeout: 60000,
}, async t => {
  let historical;
  try {
    historical = JSON.parse(execFileSync('git', ['show', 'v2026.11.08.1:source/读者对话渲染.json'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', maxBuffer: 2000000, stdio: ['ignore', 'pipe', 'ignore'],
    })).replaceString;
  } catch {
    t.skip('historical complete release tag v2026.11.08.1 is unavailable; fetch repository tags to run the adoption regression');
    return;
  }
  const { runtime } = await build();
  const body = '<p>保留下来的完整版来信。</p><blockquote>完整版中的引用。</blockquote>';
  const letter = historical.replace(/^```html\r?\n/, '').replace(/\r?\n```$/, '').replace('$1', body);
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/runtime.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    response.end(request.url === '/runtime.js' ? runtime : request.url === '/full' ? letter : fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue()
    : route.request().resourceType() === 'image' ? route.fulfill({ contentType: 'image/png', body: image }) : route.abort());
  async function expectLetter(legacy) {
    await page.waitForFunction(legacy => {
      const doc = document.querySelector('.mes iframe')?.contentDocument;
      return !!doc?.querySelector('.wrapper-v9-fix') && !!doc.querySelector('.wrapper-v9-fix.lv') === !legacy;
    }, legacy);
    assert.deepEqual(await page.evaluate(() => {
      const frame = document.querySelector('.mes iframe'), doc = frame.contentDocument;
      return { frame: frame === __completeFrame, bodyNode: doc.querySelector('.text-body-royal').firstChild === __completeBody,
        body: doc.querySelector('.text-body-royal').innerHTML, signature: doc.querySelector('.sig-mini').textContent,
        open: doc.querySelector('.letter-interaction').open, count: ReaderCore.getLetters(1).length,
        controller: document.getElementById('reader-core-controller').contentWindow === __controller,
        audio: __controller.document.getElementById('bgm-player') === __sharedAudio };
    }), { frame: true, bodyNode: true, body, signature: '完整版保存的签名', open: true, count: 1, controller: true, audio: true });
  }
  try {
    await page.goto(origin);
    await page.evaluate(() => {
      __ctx.chat.push({ mes: '<dream>保留下来的完整版来信。</dream>', swipe_id: 0 });
      const mes = document.createElement('div'); mes.className = 'mes'; mes.setAttribute('mesid', '1');
      window.__completeFrame = document.createElement('iframe'); __completeFrame.src = '/full';
      __completeFrame.style.cssText = 'width:100%;height:600px;border:0'; mes.append(__completeFrame); document.getElementById('chat').append(mes);
    });
    await page.waitForFunction(() => !!document.querySelector('.mes iframe')?.contentWindow.__isDreamIframe);
    assert.equal(await page.evaluate(() => !!__completeFrame.contentWindow.ReaderLetter), false, 'the historical fixture is a complete renderer, not a light letter');
    await page.evaluate(async () => {
      const doc = __completeFrame.contentDocument;
      window.__completeBody = doc.querySelector('.text-body-royal').firstChild;
      doc.querySelector('.sig-mini').textContent = '完整版保存的签名'; doc.querySelector('.letter-interaction').open = true;
      window.runtimeModule = await import('/runtime.js'); runtimeModule.start(); await ReaderCore.ready;
      window.__controller = document.getElementById('reader-core-controller').contentWindow;
      window.__sharedAudio = __controller.document.getElementById('bgm-player');
      window.__musicCommands = 0; window.__menuCommands = 0;
      const command = ReaderCore.command, open = ReaderCore.open;
      ReaderCore.command = function (name, ...args) { if (name === 'togglePlay') { __musicCommands++; return Promise.resolve(true); } return command.call(this, name, ...args); };
      ReaderCore.open = function (...args) { __menuCommands++; return open.apply(this, args); };
    });
    await expectLetter(false);
    for (const theme of ['cafe', 'summer', 'ink']) {
      await page.evaluate(theme => { __controller.applyVisualTheme(theme, false); ReaderCore.refresh(); }, theme);
      for (const legacy of [true, false]) {
        await page.evaluate(() => ReaderCore.open('eggs'));
        await page.locator('#dlb-overlay [data-dlb="egglegacyui"]').click();
        await expectLetter(legacy);
        assert.equal(await page.evaluate(() => __completeFrame.contentDocument.documentElement.getAttribute('data-dream-theme')), theme);
        await page.evaluate(() => {
          __musicCommands = 0; __menuCommands = 0;
          __completeFrame.contentDocument.getElementById('record-btn').click();
          __completeFrame.contentDocument.getElementById('menu-trigger').click();
        });
        assert.deepEqual(await page.evaluate(() => ({ music: __musicCommands, menu: __menuCommands })), { music: 1, menu: 1 },
          `${theme}/${legacy ? 'legacy' : 'current'}: retained complete controls call the shared application exactly once`);
      }
    }
    await page.evaluate(() => runtimeModule.stop());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
