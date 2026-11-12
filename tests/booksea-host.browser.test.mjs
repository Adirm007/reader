// Browser coverage of the reader-owned shell and bootstrap cache; the distribution is a small stub.
// This does not claim Godot, gameplay, or a real tavern/model integration was exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = createRequire(new URL('../../_tools/shot/package.json', import.meta.url))('playwright-core')); } catch {}
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const runnable = !!chromium && existsSync(chrome);
const source = await readFile(new URL('../source/booksea-host.js', import.meta.url), 'utf8');
const shellCss = await readFile(new URL('../ui/src/booksea-shell.css', import.meta.url), 'utf8');
const distribution = `
window.BookseaDistribution = { async bootPersistent(root, config, win, hooks) {
  const host = win.parent, state = host.__state;
  state.boots++; state.base = config.base;
  state.bridged = typeof win.TavernHelper?.getVariables === 'function' && !!win.SillyTavern;
  const app = {
    dead: false,
    async setVisible(value) { state.visibility.push(value); if (value && host.__controls.holdVisible) await new Promise(resolve => {host.__releaseVisible=resolve;}); },
    async action(value) { state.actions.push(value); },
    dispose() { if (this.dead) return; this.dead = true; state.disposes++; }
  };
  host.__notifyNarrative = hooks.onUserNarrative;
  if (host.__controls.holdBoot) await new Promise(resolve => {host.__releaseBoot=resolve;});
  root.textContent = 'stub ready';
  return app;
}};
`;
const legacyDistribution = 'window.BookseaDistribution = { boot() {} };';
const manifest = bytes => ({ revision: 'test-bootstrap', files: { 'distribution.js': {
  bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex'),
} } });

async function fixture(t, { failDistributionOnce = false, viewport = { width: 1100, height: 800 }, mobile = false, expandedComposer = false, decorated = false, hostCss = false } = {}) {
  const requests = { manifest: 0, distribution: 0 };
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/game/release-manifest.json') {
      requests.manifest++;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(manifest(distribution)));
    } else if (pathname === '/game/distribution.js') {
      requests.distribution++;
      if (failDistributionOnce && requests.distribution === 1) { response.statusCode = 503; response.end('try again'); return; }
      response.setHeader('Content-Type', 'application/javascript');
      response.end(distribution);
    } else {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const composerStyle = expandedComposer ? 'position:fixed;inset:24px 0 0' : 'position:fixed;bottom:0;left:0;right:0;height:80px';
      const hostStyle = hostCss ? '<style>html{-webkit-transform:translateZ(0)}body{position:fixed;height:100dvh;width:100%;margin:0;overflow:hidden}</style>' : '';
      response.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1">' + hostStyle + '<body><div id="form_sheld" style="' + composerStyle + '"><form id="send_form" style="position:fixed;bottom:0;height:80px"><textarea></textarea></form></div></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport, isMobile: mobile });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
  await page.goto(origin);
  if (decorated) await page.addStyleTag({ content: shellCss });
  await page.evaluate(async ({ source, base }) => {
    window.__ctx = { characterId: 1, chatId: 'a' };
    window.SillyTavern = { getContext: () => window.__ctx };
    window.TavernHelper = { getVariables: () => ({}) };
    window.__state = { boots: 0, disposes: 0, visibility: [], actions: [], focus: [], errors: [] };
    window.__controls = {};
    const owner = document.createElement('iframe'); owner.id = 'reader-owner';
    owner.srcdoc = '<!doctype html><html><body></body></html>';
    const ready = new Promise(resolve => owner.onload = resolve); document.body.append(owner); await ready;
    const bridge = owner.contentWindow;
    bridge.SillyTavern = window.SillyTavern; bridge.TavernHelper = window.TavernHelper; bridge.__readerControllerAlive = true;
    bridge.eval(source);
    window.__makeHost = () => bridge.createReaderBookseaHost({ window: bridge, host: window, base,
      onFocus: value => __state.focus.push(value), onError: error => __state.errors.push(error.message) });
    window.__host = __makeHost();
  }, { source, base: origin + '/game/' });
  return { page, requests, errors, origin };
}

test('书海常驻 shell 使用同源桥、隐藏暂停、复开复用且正文回调收回音频焦点', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, requests, errors, origin } = await fixture(t);
  await page.evaluate(() => __host.open());
  assert.deepEqual(await page.evaluate(() => ({ boots: __state.boots, bridged: __state.bridged, base: __state.base,
    focus: __state.focus, actions: __state.actions })),
    { boots: 1, bridged: true, base: origin + '/game/', focus: [true], actions: ['maze'] });
  assert.equal(await page.locator('[data-reader-booksea] iframe').count(), 1);
  await page.evaluate(() => __host.hide());
  assert.equal(await page.locator('[data-reader-booksea]').isVisible(), false);
  await page.evaluate(() => __host.open('narrative'));
  assert.equal(await page.locator('[data-reader-booksea]').isVisible(), true);
  await page.evaluate(() => __notifyNarrative());
  await page.waitForFunction(() => !__host.inspect().visible);
  assert.deepEqual(await page.evaluate(() => ({ boots: __state.boots, focus: __state.focus,
    visibility: __state.visibility, actions: __state.actions })),
    { boots: 1, focus: [true, false, true, false], visibility: [true, false, true, false], actions: ['maze', 'narrative'] });
  assert.equal(requests.distribution, 1);
  await page.evaluate(() => __host.dispose());
  assert.equal(await page.locator('[data-reader-booksea]').count(), 0);
  assert.equal(await page.evaluate(() => __state.disposes), 1);
  assert.deepEqual(errors, []);
});

test('窗口 iframe 尚未 load 时 stop 会立即结束 open，不留下悬挂任务', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, errors } = await fixture(t);
  const settled = await page.evaluate(async () => {
    const opening = __host.open().then(() => 'resolved', () => 'cancelled');
    __host.dispose();
    return Promise.race([opening, new Promise(resolve => setTimeout(() => resolve('hung'), 500))]);
  });
  assert.equal(settled, 'cancelled');
  assert.equal(await page.locator('[data-reader-booksea]').count(), 0);
  assert.deepEqual(errors, []);
});

test('异步 distribution 启动中 stop，迟到的 app 被释放且 open 立即取消', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, errors } = await fixture(t);
  await page.evaluate(() => { __controls.holdBoot = true; window.__opening = __host.open().then(() => 'resolved', () => 'cancelled'); });
  await page.waitForFunction(() => typeof __releaseBoot === 'function');
  assert.equal(await page.evaluate(async () => {
    __host.dispose();
    return Promise.race([__opening, new Promise(resolve => setTimeout(() => resolve('hung'), 500))]);
  }), 'cancelled');
  await page.evaluate(() => __releaseBoot());
  await page.waitForFunction(() => __state.disposes === 1);
  assert.equal(await page.locator('[data-reader-booksea]').count(), 0);
  assert.deepEqual(errors, []);
});

test('首次启动器下载失败后可重试，换聊天后拒绝旧窗口', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, requests, errors } = await fixture(t, { failDistributionOnce: true });
  assert.match(await page.evaluate(() => __host.open().then(() => '', error => error.message)), /下载失败/);
  assert.equal(await page.getByRole('button', { name: '重试', exact: true }).isVisible(), true);
  await page.evaluate(() => __host.open());
  assert.equal(requests.distribution, 2);
  assert.equal(await page.evaluate(() => __state.boots), 1);
  await page.evaluate(() => { __ctx.chatId = 'b'; });
  assert.match(await page.evaluate(() => __host.open().then(() => '', error => error.message)), /聊天已切换/);
  await page.evaluate(() => __host.dispose());
  assert.deepEqual(errors, []);
});

async function seedLegacyCache(page, origin, withBytes) {
  await page.evaluate(async ({ origin, oldManifest, oldBytes, withBytes }) => {
    const cache = await caches.open('protelysion-host-bootstrap-v1');
    await cache.put(origin + '/game/release-manifest.json', new Response(JSON.stringify(oldManifest)));
    if (withBytes) {
      const resources = await caches.open('protelysion-resources-v1');
      await resources.put('https://protelysion-cache.invalid/sha256/' + oldManifest.files['distribution.js'].sha256,
        new Response(oldBytes));
    }
  }, { origin, oldManifest: manifest(legacyDistribution), oldBytes: legacyDistribution, withBytes });
}

test('旧启动器缓存不支持常驻 API 时自动刷新清单一次并启动新版', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, requests, errors, origin } = await fixture(t);
  await seedLegacyCache(page, origin, true);
  await page.evaluate(() => __host.open());
  assert.equal(await page.evaluate(() => __state.boots), 1);
  assert.equal(requests.manifest, 1);
  assert.equal(requests.distribution, 1);
  assert.deepEqual(errors, []);
});

test('旧清单仍在而资源被淘汰时，SHA变化会刷新清单并恢复启动', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, requests, errors, origin } = await fixture(t);
  await seedLegacyCache(page, origin, false);
  await page.evaluate(() => __host.open());
  assert.equal(await page.evaluate(() => __state.boots), 1);
  assert.equal(requests.manifest, 1);
  assert.ok(requests.distribution <= 2);
  assert.deepEqual(errors, []);
});

test('打开期间返回聊天，迟到的显示完成不会再次派发游戏操作', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, errors } = await fixture(t);
  await page.evaluate(() => { __controls.holdVisible = true; window.__opening = __host.open(); });
  await page.waitForFunction(() => typeof __releaseVisible === 'function');
  await page.evaluate(() => __host.hide());
  await page.evaluate(() => __releaseVisible());
  await page.evaluate(() => __opening);
  assert.deepEqual(await page.evaluate(() => __state.actions), []);
  assert.equal(await page.locator('[data-reader-booksea]').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('启动期间连续打开只创建一个应用，并只派发最后一次操作', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, requests, errors } = await fixture(t);
  await page.evaluate(() => {
    __controls.holdBoot = true;
    window.__first = __host.open('descend');
  });
  await page.waitForFunction(() => typeof __releaseBoot === 'function');
  await page.evaluate(() => {
    window.__second = __host.open('narrative');
    __releaseBoot();
  });
  await page.evaluate(() => Promise.all([__first, __second]));
  assert.equal(await page.evaluate(() => __state.boots), 1);
  assert.deepEqual(await page.evaluate(() => __state.actions), ['narrative']);
  assert.equal(await page.locator('[data-reader-booksea] iframe').count(), 1);
  assert.equal(requests.distribution, 1);
  assert.deepEqual(errors, []);
});

for (const decorated of [false, true]) {
 for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`移动端${decorated ? '新外壳' : '普通外壳'} ${viewport.width}×${viewport.height} 的扩展输入区域不会把书海挤成细条`, { skip: !runnable, timeout: 30_000 }, async t => {
    const { page, errors } = await fixture(t, { viewport, mobile: true, expandedComposer: true, decorated });
    const minimumGameHeight = viewport.width > viewport.height ? viewport.height * .75 : Math.min(240, viewport.height * .5);
    await page.evaluate(() => __host.open());
    const layout = await page.evaluate(() => {
      const shell = document.querySelector('[data-reader-booksea]');
      const frame = shell.querySelector('iframe');
      return { shell: shell.getBoundingClientRect().toJSON(), frame: frame.getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight };
    });
    assert.ok(layout.frame.height >= minimumGameHeight, `书海游戏区域高度应可用，实际 ${layout.frame.height}px`);
    assert.ok(layout.shell.top >= 0 && layout.shell.bottom <= layout.height, '书海窗口应完整位于可见屏幕内');
    assert.ok(layout.shell.left >= 0 && layout.shell.right <= layout.width, '书海窗口不应横向溢出');
    await page.getByRole('button', { name: '全屏', exact: true }).click();
    const fullscreen = await page.locator('[data-reader-booksea] iframe').boundingBox();
    assert.ok(fullscreen.height >= viewport.height - 90, '全屏后应保留几乎整屏的游戏区域');
    await page.getByRole('button', { name: '还原', exact: true }).click();
    const restored = await page.locator('[data-reader-booksea] iframe').boundingBox();
    assert.ok(restored.height >= minimumGameHeight, '还原后游戏区域也不应缩成细条');
    assert.deepEqual(errors, []);
  });
 }
 test(`移动端${decorated ? '新外壳' : '普通外壳'}避让正常输入栏并随键盘缩小后的视口调整`, { skip: !runnable, timeout: 30_000 }, async t => {
   const { page, errors } = await fixture(t, { viewport: { width: 390, height: 844 }, mobile: true, decorated });
   await page.evaluate(() => __host.open());
   const normal = await page.evaluate(() => ({
     shell: document.querySelector('[data-reader-booksea]').getBoundingClientRect().toJSON(),
     composer: document.querySelector('#form_sheld').getBoundingClientRect().toJSON(),
   }));
   assert.ok(normal.shell.bottom <= normal.composer.top, '普通输入栏仍应保留可见空间');
   await page.locator('#send_form textarea').focus();
   await page.setViewportSize({ width: 390, height: 360 });
   await page.waitForFunction(() => innerHeight === 360 && document.querySelector('[data-reader-booksea]').getBoundingClientRect().bottom <= 360);
   const reduced = await page.locator('[data-reader-booksea] iframe').boundingBox();
   assert.ok(reduced.height >= 120, `键盘缩小视口后游戏区域仍可操作，实际 ${reduced.height}px`);
   await page.getByRole('button', { name: '全屏', exact: true }).click();
   const fullscreen = await page.locator('[data-reader-booksea] iframe').boundingBox();
   assert.ok(fullscreen.height >= 270, '缩小视口内的全屏仍应充分利用可见空间');
   await page.getByRole('button', { name: '还原', exact: true }).click();
   const restored = await page.locator('[data-reader-booksea] iframe').boundingBox();
   assert.ok(restored.height >= 120, '键盘视口内还原不能丢失游戏区域');
   await page.setViewportSize({ width: 390, height: 844 });
   await page.waitForFunction(() => document.querySelector('[data-reader-booksea] iframe').getBoundingClientRect().height > 500);
   assert.deepEqual(errors, []);
 });
}

test('移动布局：实际输入栏也铺满屏幕时保留可操作的书海区域', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, errors } = await fixture(t, { viewport: { width: 390, height: 844 }, mobile: true, decorated: true });
  await page.locator('#send_form').evaluate(form => { form.style.height = 'calc(100vh - 24px)'; });
  await page.evaluate(() => __host.open());
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => document.querySelector('[data-reader-booksea]').getBoundingClientRect().height >= innerHeight * .8);
    const frame = await page.locator('[data-reader-booksea] iframe').boundingBox();
    const minimumGameHeight = viewport.height * (viewport.width > viewport.height ? .75 : .6);
    assert.ok(frame.height >= minimumGameHeight, `输入栏占满屏幕后游戏高度仍应可用，实际 ${frame.height}px`);
  }
  assert.deepEqual(errors, []);
});

test('移动布局：输入栏仅改变高度时自动避让，隐藏后复开沿用游戏并重新适配', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, errors } = await fixture(t, { viewport: { width: 390, height: 844 }, mobile: true, decorated: true });
  await page.evaluate(() => {
    // Exclude the window-resize path even if Chromium delivers a late initial event.
    const add = window.addEventListener.bind(window);
    window.__blockedResizeListeners = 0;
    window.addEventListener = (type, listener, options) => {
      if (type === 'resize') { __blockedResizeListeners++; return; }
      return add(type, listener, options);
    };
  });
  await page.evaluate(() => __host.open());
  const initial = await page.locator('[data-reader-booksea]').boundingBox();
  await page.evaluate(() => {
    document.querySelector('#send_form').style.height = '240px';
  });
  await page.waitForFunction(() => document.querySelector('[data-reader-booksea]').getBoundingClientRect().bottom <= document.querySelector('#send_form').getBoundingClientRect().top);
  const resized = await page.locator('[data-reader-booksea]').boundingBox();
  assert.ok(initial.height - resized.height >= 100, '输入栏增高应由 ResizeObserver 收回相应空间');
  assert.equal(await page.evaluate(() => __blockedResizeListeners), 1, '书海的 window resize 监听已被阻断，输入栏变化仍能自行适配');
  await page.evaluate(() => { __host.hide(); document.querySelector('#send_form').style.height = '820px'; });
  await page.evaluate(() => __host.open());
  const reopened = await page.locator('[data-reader-booksea] iframe').boundingBox();
  assert.ok(reopened.height >= 600, '复开时重新适配扩大的输入栏');
  assert.equal(await page.evaluate(() => __state.boots), 1, '复开继续使用同一个游戏实例');
  assert.deepEqual(errors, []);
});

test('移动布局：visualViewport 的 resize、scroll 与偏移在全屏和还原时保持几何边界', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, errors } = await fixture(t, { viewport: { width: 390, height: 844 }, mobile: true, decorated: true });
  await page.evaluate(() => {
    window.__viewport = Object.assign(new EventTarget(), { offsetTop: 120, offsetLeft: 15, width: 360, height: 400 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: __viewport });
  });
  await page.evaluate(() => __host.open());
  const initial = await page.locator('[data-reader-booksea]').boundingBox();
  assert.equal(initial.x, 27);
  assert.equal(initial.y, 132);
  assert.ok(initial.x + initial.width <= 375 && initial.y + initial.height <= 520);
  await page.evaluate(() => {
    Object.assign(__viewport, { offsetTop: 160, offsetLeft: 8, width: 374, height: 480 });
    __viewport.dispatchEvent(new Event('resize'));
  });
  const resized = await page.locator('[data-reader-booksea]').boundingBox();
  assert.equal(resized.x, 20);
  assert.equal(resized.y, 172);
  assert.ok(resized.x + resized.width <= 382 && resized.y + resized.height <= 640);
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await page.evaluate(() => {
    Object.assign(__viewport, { offsetTop: 200, offsetLeft: 20, width: 350, height: 300 });
    __viewport.dispatchEvent(new Event('scroll'));
  });
  const fullscreen = await page.locator('[data-reader-booksea]').boundingBox();
  assert.deepEqual(fullscreen, { x: 20, y: 200, width: 350, height: 300 });
  assert.ok((await page.locator('[data-reader-booksea] iframe').boundingBox()).height >= 220);
  await page.getByRole('button', { name: '还原', exact: true }).click();
  const restored = await page.locator('[data-reader-booksea]').boundingBox();
  assert.equal(restored.y, 212);
  assert.ok(restored.x >= 20 && restored.x + restored.width <= 370 && restored.y + restored.height <= 500);
  assert.deepEqual(errors, []);
});

test('移动布局：dispose 移除窗口及视口监听并断开输入栏与背景观察器', { skip: !runnable, timeout: 30_000 }, async t => {
  const { page, errors } = await fixture(t, { viewport: { width: 390, height: 844 }, mobile: true });
  await page.evaluate(() => {
    function trackListeners(target, types) {
      const active = new Map(types.map(type => [type, new Set()]));
      const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
      target.addEventListener = (type, listener, options) => { active.get(type)?.add(listener); return add(type, listener, options); };
      target.removeEventListener = (type, listener, options) => { active.get(type)?.delete(listener); return remove(type, listener, options); };
      return () => [...active.values()].reduce((total, listeners) => total + listeners.size, 0);
    }
    window.__viewport = Object.assign(new EventTarget(), { offsetTop: 0, offsetLeft: 0, width: 390, height: 844 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: __viewport });
    window.__windowListeners = trackListeners(window, ['resize', 'orientationchange']);
    window.__viewportListeners = trackListeners(__viewport, ['resize', 'scroll']);
    window.__observers = [];
    const bridge = document.querySelector('#reader-owner').contentWindow;
    for (const kind of ['ResizeObserver', 'MutationObserver']) {
      const Native = bridge[kind];
      bridge[kind] = class {
        constructor(callback) {
          this.record = { kind, targets: new Set(), callbacks: 0, disconnected: false };
          __observers.push(this.record);
          this.native = new Native((...args) => { this.record.callbacks++; callback(...args); });
        }
        observe(...args) { this.record.targets.add(args[0]); return this.native.observe(...args); }
        disconnect() { this.record.targets.clear(); this.record.disconnected = true; this.native.disconnect(); }
      };
    }
  });
  await page.evaluate(() => __host.open());
  const active = await page.evaluate(() => ({ window: __windowListeners(), viewport: __viewportListeners(), observers: __observers.map(item => ({ kind: item.kind, targets: item.targets.size })) }));
  assert.deepEqual(active, { window: 2, viewport: 2, observers: [{ kind: 'MutationObserver', targets: 1 }, { kind: 'ResizeObserver', targets: 2 }] });
  await page.evaluate(() => __host.dispose());
  const disposed = await page.evaluate(() => ({ window: __windowListeners(), viewport: __viewportListeners(), observers: __observers.every(item => item.disconnected && item.targets.size === 0) }));
  assert.deepEqual(disposed, { window: 0, viewport: 0, observers: true });
  const callbacks = await page.evaluate(() => __observers.map(item => item.callbacks));
  await page.evaluate(async () => {
    document.querySelector('#send_form').style.height = '300px';
    document.documentElement.setAttribute('data-u4-theme', 'coffee');
    dispatchEvent(new Event('resize'));
    dispatchEvent(new Event('orientationchange'));
    __viewport.dispatchEvent(new Event('resize'));
    __viewport.dispatchEvent(new Event('scroll'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.deepEqual(await page.evaluate(() => __observers.map(item => item.callbacks)), callbacks, '断开后不再执行观察回调');
  assert.equal(await page.locator('[data-reader-booksea]').count(), 0);
  assert.deepEqual(errors, []);
});

for (const decorated of [false, true]) {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    test(`真实宿主 CSS：${decorated ? '新外壳' : '普通外壳'} ${viewport.width}×${viewport.height} 在零高根定位块内仍保持可用`, { skip: !runnable, timeout: 30_000 }, async t => {
      const { page, errors } = await fixture(t, { viewport, mobile: true, decorated, hostCss: true });
      await page.evaluate(() => __host.open());
      assert.equal(await page.evaluate(() => document.documentElement.getBoundingClientRect().height), 0, '固定 body 与根元素变换重现酒馆零高包含块');
      async function assertUsable(size) {
        const minimum = size.width > size.height ? size.height * .75 : 240;
        const layout = await page.evaluate(() => ({
          shell: document.querySelector('[data-reader-booksea]').getBoundingClientRect().toJSON(),
          frame: document.querySelector('[data-reader-booksea] iframe').getBoundingClientRect().toJSON(),
        }));
        assert.ok(layout.frame.height >= minimum, `真实宿主规则下游戏高度应至少 ${minimum}px，实际布局 ${JSON.stringify(layout)}`);
        assert.ok(layout.shell.top >= 0 && layout.shell.bottom <= size.height, `窗口应位于真实可见高度内，视口 ${JSON.stringify(size)}，实际布局 ${JSON.stringify(layout)}`);
      }
      await assertUsable(viewport);
      await page.getByRole('button', { name: '全屏', exact: true }).click();
      assert.ok((await page.locator('[data-reader-booksea] iframe').boundingBox()).height >= viewport.height - 90, '零高根定位块内全屏仍应使用可见高度');
      await page.getByRole('button', { name: '还原', exact: true }).click();
      await assertUsable(viewport);
      const rotated = { width: viewport.height, height: viewport.width };
      await page.setViewportSize(rotated);
      await page.waitForFunction(size => {
        const shell = document.querySelector('[data-reader-booksea]').getBoundingClientRect();
        const frame = document.querySelector('[data-reader-booksea] iframe').getBoundingClientRect();
        const minimum = size.width > size.height ? size.height * .75 : 240;
        return innerWidth === size.width && innerHeight === size.height && shell.bottom <= size.height && frame.height >= minimum;
      }, rotated);
      await assertUsable(rotated);
      assert.deepEqual(errors, []);
    });
  }
}
