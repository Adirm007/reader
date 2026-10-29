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

async function fixture(t, { failDistributionOnce = false } = {}) {
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
      response.end('<!doctype html><html><body><form id="send_form" style="position:fixed;bottom:0;height:80px"><textarea></textarea></form></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
  await page.goto(origin);
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
