/* A reader-owned window; the game itself is fetched only when opened. */
(function (globals) {
  'use strict';
  function createReaderBookseaHost(options) {
    options = options || {};
    var bridge = options.window || globals, host = options.host || bridge.parent, doc = host.document;
    var base = new URL(options.base || 'https://adirm007.github.io/Protelysion/').href;
    var shell, frame, status, retry, app, pending, disposed = false, visible = false, generation = 0, activation = 0;
    var cancelReady;
    var aborter = new AbortController(), identity = currentIdentity();
    function currentIdentity() {
      var ctx = (bridge.SillyTavern || host.SillyTavern).getContext();
      return String(ctx.characterId) + ':' + String(typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx.chatId);
    }
    function assertCurrent() {
      if (disposed || bridge.__readerControllerAlive === false || currentIdentity() !== identity) throw new Error('聊天已切换，旧书海窗口已关闭');
    }
    function focus(value) { if (visible === value) return; visible = value; if (options.onFocus) options.onFocus(value); }
    function display(value) { if (shell) { shell.hidden = !value; shell.style.display = value ? 'flex' : 'none'; } }
    async function timedFetch(win, url, init, milliseconds) {
      var controller = new AbortController(), cancel = function () { controller.abort(); };
      aborter.signal.addEventListener('abort', cancel, {once: true});
      if (aborter.signal.aborted) cancel();
      var timer = bridge.setTimeout(cancel, milliseconds);
      try { return await win.fetch(url, Object.assign({}, init, {signal: controller.signal})); }
      finally { bridge.clearTimeout(timer); aborter.signal.removeEventListener('abort', cancel); }
    }
    function fit() {
      if (!shell || shell.dataset.fullscreen === 'true') return;
      var composer = doc.querySelector('#form_sheld') || doc.querySelector('#send_form');
      var rect = composer && composer.getBoundingClientRect();
      shell.style.bottom = Math.max(96, rect && rect.height > 0 ? host.innerHeight - rect.top + 8 : 112) + 'px';
    }
    function create() {
      shell?.remove(); host.removeEventListener('resize', fit);
      shell = doc.createElement('section');
      shell.dataset.readerBooksea = 'true'; shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-label', '普罗泰利西翁');
      shell.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;bottom:112px;z-index:9000;display:flex;flex-direction:column;border:1px solid #8e795c;border-radius:10px;overflow:hidden;background:#191c2b;box-shadow:0 10px 48px #0008;color:#eee3cb';
      var bar = doc.createElement('header');
      bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;flex-shrink:0;font:14px/1.6 system-ui;background:#272a38';
      var title = doc.createElement('strong'); title.textContent = '普罗泰利西翁'; title.style.flex = '1'; bar.append(title);
      function button(label, handler) { var b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'font:inherit;min-height:32px;padding:3px 10px;color:inherit;background:#3e4051;border:1px solid #8e795c;border-radius:5px;cursor:pointer'; b.onclick = handler; bar.append(b); return b; }
      button('全屏', function () { var full = shell.dataset.fullscreen !== 'true'; shell.dataset.fullscreen = String(full); shell.style.inset = full ? '0' : '12px 12px 112px'; this.textContent = full ? '还原' : '全屏'; fit(); });
      button('返回聊天', function () { void hide(); });
      shell.append(bar);
      status = doc.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '书页正在展开……'; status.style.cssText = 'margin:12px;font:14px/1.8 system-ui'; shell.append(status);
      retry = button('重试', function () { retry.hidden = true; pending = null; void open().catch(report); }); retry.hidden = true;
      frame = doc.createElement('iframe'); frame.title = '书海游戏';
      frame.style.cssText = 'display:block;width:100%;flex:1;min-height:0;border:0;background:#191c2b';
      frame.srcdoc = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;background:#191c2b;color:#eee3cb;font:16px/1.6 system-ui}*{box-sizing:border-box}#booksea-game{max-width:1280px;margin:auto;padding:8px}</style><main id="booksea-game"></main></html>';
      shell.append(frame);
      var createdFrame = frame;
      var loaded = new Promise(function (resolve, reject) {
        cancelReady = function () { reject(new Error('书海窗口已关闭')); };
        createdFrame.addEventListener('load', function () { cancelReady = null; resolve(); }, {once: true});
      });
      doc.body.append(shell); fit(); display(visible);
      host.addEventListener('resize', fit);
      return loaded;
    }
    function bridgeInto(win) {
      var api = bridge.TavernHelper || bridge;
      win.SillyTavern = bridge.SillyTavern || host.SillyTavern;
      win.TavernHelper = api;
      for (var name of ['Mvu', '_', 'tavern_events', 'iframe_events', 'eventOn', 'eventMakeFirst', 'eventRemoveListener',
        'getVariables', 'updateVariablesWith', 'insertOrAssignVariables', 'getLastMessageId', 'getChatMessages', 'setChatMessages',
        'createChatMessages', 'triggerSlash', 'waitGlobalInitialized', 'getCharWorldbookNames', 'getWorldbook', 'generate', 'generateRaw', 'stopGenerationById']) {
        if (bridge[name] !== undefined) win[name] = bridge[name];
        else if (api[name] !== undefined) win[name] = api[name];
        else if (host[name] !== undefined) win[name] = host[name];
      }
    }
    async function checkedBytes(win, info, sourceCache) {
      var key = 'https://protelysion-cache.invalid/sha256/' + info.sha256;
      var valid = async function (bytes) { return bytes.byteLength === info.bytes && Array.from(new Uint8Array(await win.crypto.subtle.digest('SHA-256', bytes)), function (v) { return v.toString(16).padStart(2, '0'); }).join('') === info.sha256; };
      var hit = await sourceCache.match(key), bytes = hit ? await hit.arrayBuffer() : null;
      if (bytes && await valid(bytes)) return bytes;
      var response = await timedFetch(win, new URL('distribution.js', base), {credentials: 'omit'}, 60000);
      if (!response.ok) throw new Error('书海启动器下载失败');
      bytes = await response.arrayBuffer(); assertCurrent();
      if (!await valid(bytes)) throw new Error('书海启动器校验失败');
      await sourceCache.put(key, new Response(bytes, {headers: {'Content-Type': 'application/javascript'}})); return bytes;
    }
    async function load(forceFresh) {
      assertCurrent();
      var ticket = generation;
      try {
      await create(); assertCurrent();
      var win = frame.contentWindow; bridgeInto(win);
      if (!win.isSecureContext || !win.caches || !win.crypto || !win.crypto.subtle) throw new Error('请通过HTTPS或本机localhost访问酒馆，并允许浏览器缓存');
      var cache = await win.caches.open('protelysion-host-bootstrap-v1'), url = new URL('release-manifest.json', base).href;
      // Prefer the last verified boot manifest; a network failure never delays a warm reopen.
      var saved = forceFresh ? null : await cache.match(url), response = saved;
      if (!response) {
        response = await timedFetch(win, url, {cache: 'no-store', credentials: 'omit'}, 12000);
        if (!response.ok) throw new Error('书海发布清单加载失败');
      }
      var text = await response.text(); if (text.length > 2000000) throw new Error('书海发布清单过大');
      var manifest = JSON.parse(text), info = manifest.files && manifest.files['distribution.js'];
      if (!info || !Number.isSafeInteger(info.bytes) || info.bytes <= 0 || info.bytes > 20000000 || !/^[a-f0-9]{64}$/.test(info.sha256)) throw new Error('书海发布清单无效');
      var sourceCache = await win.caches.open('protelysion-resources-v1'), bytes = await checkedBytes(win, info, sourceCache); assertCurrent();
      await cache.put(url, new Response(text, {headers: {'Content-Type': 'application/json'}}));
      await new Promise(function (resolve, reject) {
        var node = win.document.createElement('script'), blob = win.URL.createObjectURL(new Blob([bytes], {type: 'application/javascript'}));
        var finish = function (error) { bridge.clearTimeout(timer); win.URL.revokeObjectURL(blob); aborter.signal.removeEventListener('abort', cancel); if (error) reject(error); else resolve(); };
        var cancel = function () { finish(new Error('书海窗口已关闭')); };
        var timer = bridge.setTimeout(function () { finish(new Error('书海启动超时')); }, 30000);
        aborter.signal.addEventListener('abort', cancel, {once: true});
        node.onload = function () { finish(); };
        node.onerror = function () { finish(new Error('书海启动失败')); };
        node.src = blob; win.document.head.append(node);
      });
      assertCurrent();
      if (ticket !== generation) throw new Error('旧书海启动已取消');
      if (typeof win.BookseaDistribution?.bootPersistent !== 'function') {
        if (saved && !forceFresh) { await cache.delete(url); return load(true); }
        throw new Error('当前书海资源尚未包含常驻界面，请更新书海资源');
      }
      var boot = win.BookseaDistribution.bootPersistent(win.document.getElementById('booksea-game'), {base: base, manifest: manifest, mode: 'host'}, win,
        {onUserNarrative: function () { void hide(); }});
      var loaded = await new Promise(function (resolve, reject) {
        var cancel = function () { reject(new Error('书海窗口已关闭')); };
        aborter.signal.addEventListener('abort', cancel, {once: true});
        Promise.resolve(boot).then(function (value) {
          aborter.signal.removeEventListener('abort', cancel);
          if (disposed || ticket !== generation) { value?.dispose(); reject(new Error('旧书海启动已取消')); } else resolve(value);
        }, function (error) { aborter.signal.removeEventListener('abort', cancel); reject(error); });
      });
      try { assertCurrent(); } catch (error) { loaded?.dispose(); throw error; }
      app = loaded; status.hidden = true;
      if (!visible) await app.setVisible(false);
      if (saved) void timedFetch(win, url, {cache: 'no-store', credentials: 'omit'}, 12000).then(async function (fresh) {
        if (!fresh.ok) return;
        var body = await fresh.text(); if (body.length > 2000000) return;
        var candidate = JSON.parse(body), entry = candidate.files && candidate.files['distribution.js'];
        if (entry && Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= 20000000 && /^[a-f0-9]{64}$/.test(entry.sha256))
          await cache.put(url, new Response(body, {headers: {'Content-Type': 'application/json'}}));
      }).catch(function () {});
      return app;
      } catch (error) {
        // A mutable distribution URL may already serve the next release while
        // our warm boot manifest still names the previous hash. Refresh once.
        if (saved && !forceFresh && !disposed && currentIdentity() === identity) {
          app?.dispose(); app = undefined;
          await cache.delete(url);
          return load(true);
        }
        throw error;
      }
    }
    function report(error) {
      if (disposed) return;
      if (status) { status.hidden = false; status.textContent = error && error.message || String(error); }
      if (retry) retry.hidden = false;
      if (options.onError) options.onError(error);
    }
    async function open(action) {
      assertCurrent();
      var request = ++activation;
      display(true);
      focus(true);
      if (!pending) pending = load().catch(function (error) { if (!disposed) { app?.dispose(); app = undefined; } pending = null; throw error; });
      try { var loaded = await pending; assertCurrent(); if (visible && request === activation) { display(true); await loaded.setVisible(true); assertCurrent(); if (visible && request === activation && typeof loaded.action === 'function') await loaded.action(action || 'maze'); } return loaded; }
      catch (error) { report(error); throw error; }
    }
    async function hide() {
      if (disposed) return;
      activation++;
      focus(false); display(false);
      try { if (app) await app.setVisible(false); } catch (error) { report(error); }
    }
    function dispose() {
      if (disposed) return;
      disposed = true; generation++; cancelReady?.(); cancelReady = null; aborter.abort(); app?.dispose(); app = undefined;
      shell?.remove(); shell = frame = undefined; host.removeEventListener('resize', fit); focus(false);
    }
    return {open: open, hide: hide, dispose: dispose, inspect: function () { return {loaded: !!app, visible: visible, disposed: disposed, identity: identity}; }};
  }
  globals.createReaderBookseaHost = createReaderBookseaHost;
})(window);
