/* A reader-owned window; the game itself is fetched only when opened. */
(function (globals) {
  'use strict';
  function createReaderBookseaHost(options) {
    options = options || {};
    var bridge = options.window || globals, host = options.host || bridge.parent, doc = host.document;
    var base = new URL(options.base || 'https://adirm007.github.io/Protelysion/').href;
    var shell, frame, status, retry, app, pending, disposed = false, visible = false, generation = 0, activation = 0;
    var cancelReady, backdropObserver, composerObserver;
    var aborter = new AbortController(), identity = currentIdentity();
    function currentIdentity() {
      var ctx = (bridge.SillyTavern || host.SillyTavern).getContext();
      return String(ctx.characterId) + ':' + String(typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx.chatId);
    }
    function assertCurrent() {
      if (disposed || bridge.__readerControllerAlive === false || currentIdentity() !== identity) throw new Error('聊天已切换，旧书海窗口已关闭');
    }
    function focus(value) { if (visible === value) return; visible = value; if (options.onFocus) options.onFocus(value); }
    function display(value) { if (shell) { shell.hidden = !value; shell.style.display = value ? 'flex' : 'none'; if (value) fit(); } }
    async function timedFetch(win, url, init, milliseconds) {
      var controller = new AbortController(), cancel = function () { controller.abort(); };
      aborter.signal.addEventListener('abort', cancel, {once: true});
      if (aborter.signal.aborted) cancel();
      var timer = bridge.setTimeout(cancel, milliseconds);
      try { return await win.fetch(url, Object.assign({}, init, {signal: controller.signal})); }
      finally { bridge.clearTimeout(timer); aborter.signal.removeEventListener('abort', cancel); }
    }
    function fit() {
      if (!shell) return;
      var viewport = host.visualViewport, full = shell.dataset.fullscreen === 'true', gap = full ? 0 : 12;
      var top = Math.max(0, viewport?.offsetTop || 0), left = Math.max(0, viewport?.offsetLeft || 0);
      var height = Math.max(0, Math.min(viewport?.height || host.innerHeight, host.innerHeight - top));
      var width = Math.max(0, Math.min(viewport?.width || host.innerWidth, host.innerWidth - left));
      // Mobile themes may stretch the wrapper across the chat. Measure the actual input bar first.
      var composer = doc.querySelector('#send_form') || doc.querySelector('#form_sheld');
      var rect = composer && composer.getBoundingClientRect();
      var bottom = full ? 0 : Math.max(96, rect && rect.height > 0 && rect.bottom > top && rect.top < top + height ? top + height - rect.top + 8 : 112);
      // An expanded input or a keyboard must never consume the whole game window.
      if (!full && height - gap - bottom < Math.min(320, height * .8)) bottom = gap;
      shell.style.top = 'calc(' + top + 'px + max(' + gap + 'px, env(safe-area-inset-top, 0px)))';
      shell.style.left = 'calc(' + left + 'px + max(' + gap + 'px, env(safe-area-inset-left, 0px)))';
      shell.style.right = 'calc(' + (host.innerWidth - left - width) + 'px + max(' + gap + 'px, env(safe-area-inset-right, 0px)))';
      // SillyTavern mobile fixes body beneath a transformed, zero-height html element.
      // Give the window its own viewport height; top/bottom alone collapse in that containing block.
      shell.style.bottom = 'auto';
      shell.style.height = 'calc(' + height + 'px - max(' + gap + 'px, env(safe-area-inset-top, 0px)) - max(' + bottom + 'px, env(safe-area-inset-bottom, 0px)))';
    }
    function stopFitting() {
      composerObserver?.disconnect();
      host.removeEventListener('resize', fit);
      host.removeEventListener('orientationchange', fit);
      host.visualViewport?.removeEventListener('resize', fit);
      host.visualViewport?.removeEventListener('scroll', fit);
    }
    function startFitting() {
      host.addEventListener('resize', fit);
      host.addEventListener('orientationchange', fit);
      host.visualViewport?.addEventListener('resize', fit);
      host.visualViewport?.addEventListener('scroll', fit);
      composerObserver = new bridge.ResizeObserver(fit);
      for (var composer of doc.querySelectorAll('#send_form, #form_sheld')) composerObserver.observe(composer);
    }
    function syncBackdrop() {
      var root = frame?.contentDocument?.documentElement;
      if (root) root.style.setProperty('--reader-booksea-background', doc.documentElement.hasAttribute('data-u4-theme') ? '#241110' : '#191c2b');
    }
    function create() {
      backdropObserver?.disconnect();
      shell?.remove(); stopFitting();
      shell = doc.createElement('section');
      shell.dataset.readerBooksea = 'true'; shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-label', '普罗泰利西翁');
      shell.style.cssText = 'box-sizing:border-box;position:fixed;top:12px;left:12px;right:12px;bottom:112px;z-index:9000;display:flex;flex-direction:column;border:1px solid #8e795c;border-radius:10px;overflow:hidden;background:#191c2b;box-shadow:0 10px 48px #0008;color:#eee3cb';
      var bar = doc.createElement('header');
      bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;flex-shrink:0;font:14px/1.6 system-ui;background:#272a38';
      var title = doc.createElement('strong'); title.textContent = '普罗泰利西翁'; title.style.flex = '1'; bar.append(title);
      function button(label, handler) { var b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'font:inherit;min-height:32px;padding:3px 10px;color:inherit;background:#3e4051;border:1px solid #8e795c;border-radius:5px;cursor:pointer'; b.onclick = handler; bar.append(b); return b; }
      button('全屏', function () { var full = shell.dataset.fullscreen !== 'true'; shell.dataset.fullscreen = String(full); this.textContent = full ? '还原' : '全屏'; fit(); });
      button('返回聊天', function () { void hide(); });
      shell.append(bar);
      status = doc.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '书页正在展开……'; status.style.cssText = 'margin:12px;font:14px/1.8 system-ui'; shell.append(status);
      retry = button('重试', function () { retry.hidden = true; pending = null; void open().catch(report); }); retry.hidden = true;
      frame = doc.createElement('iframe'); frame.title = '书海游戏';
      frame.style.cssText = 'display:block;width:100%;flex:1;min-height:0;border:0;background:#191c2b';
      frame.srcdoc = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;background:var(--reader-booksea-background,#191c2b);color:#eee3cb;font:16px/1.6 system-ui}*{box-sizing:border-box}#booksea-game{max-width:1280px;margin:auto;padding:8px}</style><main id="booksea-game"></main></html>';
      shell.append(frame);
      var createdFrame = frame;
      var loaded = new Promise(function (resolve, reject) {
        cancelReady = function () { reject(new Error('书海窗口已关闭')); };
        createdFrame.addEventListener('load', function () { syncBackdrop(); cancelReady = null; resolve(); }, {once: true});
      });
      doc.body.append(shell); fit(); display(visible);
      backdropObserver = new bridge.MutationObserver(syncBackdrop);
      backdropObserver.observe(doc.documentElement, {attributes: true, attributeFilter: ['data-u4-theme']});
      startFitting();
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
      backdropObserver?.disconnect();
      stopFitting(); shell?.remove(); shell = frame = undefined; focus(false);
    }
    return {open: open, hide: hide, dispose: dispose, inspect: function () { return {loaded: !!app, visible: visible, disposed: disposed, identity: identity}; }};
  }
  globals.createReaderBookseaHost = createReaderBookseaHost;
})(window);
