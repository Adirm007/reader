/* DREAM_READER_UI_SWITCH_BEGIN */
// 新表现层（window.ReaderUI，ui/ 打包）的切换点。必须是最外层：脚本版放在 controller-adapter.js 之后，
// 完整版放在 legacy-reader.js 与 template-system.js 之后。它只换「画什么」：动作仍由 dlbClick 链处理，
// 计价、FP、事务、聊天变量都不经过这里。localStorage.dream_ui_v4 = 'off' 时每个函数都直接走旧实现。
// 五个子页（眼中的她、故事定调、人格解耦、条目模仿、彩蛋服务台）也由 ReaderUI 画：动作、id、.on/.cur/.sv2
// 与旧版一致；人格解耦与唱片、笔迹、大小三个列表仍嵌旧函数生成的片段，由 dlbAfterRender 绑定。
(function () {
  var UI = window.ReaderUI;
  if (!UI || typeof UI.skeleton !== 'function' || typeof dlbGo !== 'function') return;
  var legacy = {
    cafe: cfSkeleton, summer: sxSkeleton, ink: jnSkeleton, ensure: dlbEnsureCss, top: dlbTopHTML, main: dlbMainHTML,
    go: dlbGo, page: dlbPageHTML, clock: dlbClockSync, fp: dlbSyncFpDom, juke: dlbJukeSync, badges: dlbBadges, apply: applyVisualTheme,
    rhythm: typeof handleRhythm === 'function' ? handleRhythm : null,
    gachaArt: typeof dreamGachaArt === 'function' ? dreamGachaArt : null
  };
  function on() { try { return UI.enabled(window.localStorage); } catch (e) { return true; } }
  function oldFrontend() { return gLS('dream_ui_v4', 'on') === 'off'; }
  function theme() { try { var t = getVisualTheme(); return t === 'summer' || t === 'ink' ? t : 'cafe'; } catch (e) { return 'cafe'; } }
  function fresh(ov) { return !!(ov && ov.querySelector('#u4r')); }
  function safe(fn, fallback) { try { var v = fn(); return v === undefined || v === null ? fallback : v; } catch (e) { return fallback; } }
  function state() {
    var app = safe(function () { return getCurrentAppearance(); }, 'default');
    // Outfit names follow the theme (summer swimsuits, ink qipao …): getAppearanceLabel knows all three sets.
    var appName = safe(function () { return getAppearanceLabel(app); }, '');
    var count = safe(function () { return playlist.length; }, 0);
    return {
      theme: theme(),
      fp: String(safe(function () { return dlbFp; }, '——')),
      daily: safe(function () { return dlbDaily; }, '日常:一日'),
      dailyOpts: safe(function () { return DLB_DAILY_OPTS.map(function (o) { return { k: o.k, nm: o.nm, pr: o.pr }; }); }, []),
      persona: { id: safe(function () { return getCurrentPersona(); }, 'reader'), label: safe(function () { return dlbPersonaShort(); }, '读者') },
      appearance: { id: app, label: appName },
      address: safe(function () { return getUserAddress(); }, ''),
      books: safe(function () { return dlbBookN; }, -2),
      juke: {
        playing: safe(function () { return !!(audio && !audio.paused); }, false),
        title: safe(function () { return count ? playlist[currentTrackIndex].name : '空专辑'; }, ''),
        no: count ? safe(function () { return (currentTrackIndex + 1) + ' / ' + count; }, '') : '0 / 0',
        album: safe(function () { return currentAlbum; }, ''),
        mode: safe(function () { return playModeLabel(getPlayMode()); }, '')
      },
      gachaPrice: String(safe(function () { return dreamGachaPrice(); }, '')),
      standing: safe(function () { return getStandingArtUrl(); }, ''),
      avatar: safe(function () { return getAvatarUrl(); }, ''),
      personas: safe(function () { return PERSONA_ITEMS.map(function (x) { return { id: x.id, name: x.name, hint: x.hint || '' }; }); }, []),
      appearances: safe(function () { return APPEARANCE_ITEMS.map(function (x) { return { id: x.id, name: getAppearanceLabel(x.id) }; }); }, []),
      eggs: {
        display: safe(function () { return gLS(DK, 'inline') === 'float' ? '悬浮' : '默认'; }, '默认'),
        unseal: safe(function () { return gLS(AK, 'off') === 'on'; }, false),
        silent: !!safe(function () { return getSilentState(); }, false),
        beautify: !!safe(function () { return getCafeEnvelopeBeautifyState(); }, false),
        letterLimit: !!safe(function () { return getLetterLimitState(); }, false),
        hideFloat: safe(function () { return gLS('dream_hide_persistent_float', 'off') === 'on'; }, false),
        legacyUi: oldFrontend(),
        yuan: !!safe(function () { return getYuanPlusEnabled(); }, false),
        yuanStream: !!safe(function () { return getYuanPlusStreamEnabled(); }, false),
        yuanPref: String(safe(function () { return getYuanPlusPreference(); }, '')),
        api: String(safe(function () { return dreamApiLabel(); }, '')),
        open: safe(function () { return dlbEggOpen; }, {})
      }
    };
  }
  // Legacy fragments a sub-page embeds; only the ones the page shows open are built.
  function fragments(page) {
    var f = {};
    if (page === 'decouple') f.decouple = safe(function () { return renderPersonaDecoupleHTML(); }, '');
    if (page === 'eggs') {
      try { dlbYuanCache = getYuanPlusPreference(); } catch (e) {}
      var open = safe(function () { return dlbEggOpen; }, {});
      if (open.disc) f.disc = safe(function () { return buildDiscListHTML(); }, '');
      if (open.font) f.font = safe(function () { return buildFontListHTML(); }, '');
      if (open.fsz) f.fsz = safe(function () { return buildFSZHTML(); }, '');
    }
    return f;
  }
  var hooks = { state: state };
  var oldOpenLobby = openDreamLobby, oldCloseLobby = closeDreamLobby;
  openDreamLobby = function () {
    if (dlbOv() && typeof UI.unmount === 'function') UI.unmount(dlbOv());
    return oldOpenLobby.apply(this, arguments);
  };
  closeDreamLobby = function () {
    if (dlbOv() && typeof UI.unmount === 'function') UI.unmount(dlbOv());
    return oldCloseLobby.apply(this, arguments);
  };
  if (legacy.gachaArt) {
    dreamGachaArt = function () {
      var art = legacy.gachaArt.apply(this, arguments);
      if (!on() || typeof UI.gachaArt !== 'function') return art;
      var current = UI.gachaArt(theme(), safe(function () { return getCurrentAppearance(); }, 'default'));
      if (current.figure) art.figure = current.figure;
      if (current.backdrop && !safe(function () { return getCurrentPersona() === 'custom'; }, false)) art.backdrop = current.backdrop;
      return art;
    };
  }
  function legacySkeleton(t) { return (legacy[t] || legacy.cafe)(); }
  // Swap the whole overlay content between the new skeleton and the legacy one (same overlay node, so its
  // timer, listeners and ownership stay). What openDreamLobby does for a legacy skeleton is repeated here.
  function swap(ov, t, toNew) {
    if (typeof UI.unmount === 'function') UI.unmount(ov);
    ov.innerHTML = toNew ? UI.skeleton(t, state()) : legacySkeleton(t);
    ov.classList.toggle('u4-on', toNew);
    if (toNew) return;
    var art = ov.querySelector('#dlb-art');
    if (art) { art.onload = function () { art.classList.add('dlb-loaded'); }; if (art.complete) art.classList.add('dlb-loaded'); }
    try { if (ov.querySelector('.sx-root')) sxPrefetchChibi(ov); } catch (e) {}
  }

  cfSkeleton = function () { return on() ? UI.skeleton('cafe', state()) : legacy.cafe(); };
  sxSkeleton = function () { return on() ? UI.skeleton('summer', state()) : legacy.summer(); };
  jnSkeleton = function () { return on() ? UI.skeleton('ink', state()) : legacy.ink(); };
  dlbEnsureCss = function () {
    legacy.ensure();
    if (!pD) return;
    if (on()) UI.install(pD, theme()); else UI.uninstall(pD);
  };
  dlbTopHTML = function (page) { return fresh(dlbOv()) ? UI.top(theme(), page, state()) : legacy.top(page); };
  dlbMainHTML = function () { return fresh(dlbOv()) ? UI.main(theme(), state()) : legacy.main(); };
  dlbPageHTML = function (page) { return fresh(dlbOv()) && UI.supports(theme(), page) ? UI.page(theme(), page, state(), fragments(page)) : legacy.page(page); };
  dlbGo = function (page) {
    dlbEnsureCss();
    var ov = dlbOv();
    if (ov) {
      var t = theme(), want = on() && UI.supports(t, page);
      if (want !== fresh(ov)) swap(ov, t, want);
      ov.classList.toggle('u4-on', want);
    }
    legacy.go(page);
    ov = dlbOv();
    if (fresh(ov)) UI.mount(ov, theme(), hooks);
  };
  dlbClockSync = function () { legacy.clock(); UI.sync(dlbOv(), 'clock'); };
  dlbSyncFpDom = function () { legacy.fp(); UI.sync(dlbOv(), 'fp'); };
  dlbJukeSync = function () { legacy.juke(); UI.sync(dlbOv(), 'juke'); };
  dlbBadges = function () { legacy.badges(); UI.sync(dlbOv(), 'badges'); };
  // The order's own promise says whether it went through: cancelled confirms return nothing, failed charges reject.
  // With the new layer on, the question is asked on the theme's order slip first; the legacy order then runs with
  // its own confirm() answered yes (it asks synchronously before anything is charged).
  if (legacy.rhythm) {
    var runRhythm = function (self, args, kind) {
      var result = legacy.rhythm.apply(self, args);
      if (result && typeof result.then === 'function') {
        result.then(function () { if (on()) UI.notify(dlbOv(), { type: 'paid', kind: kind }); }, function () {});
      }
      return result;
    };
    handleRhythm = function (kind) {
      var self = this, args = arguments;
      var config = safe(function () { return RHYTHM_CONFIG[kind]; }, null);
      if (!on() || !config || !pD || typeof UI.confirmOrder !== 'function') return runRhythm(self, args, kind);
      return UI.confirmOrder(pD, theme(), { kind: kind, cost: config.cost }).then(function (ok) {
        if (ok === null) return runRhythm(self, args, kind);
        if (!ok) return undefined;
        var nativeConfirm = window.confirm;
        window.confirm = function () { return true; };
        try { return runRhythm(self, args, kind); } finally { window.confirm = nativeConfirm; }
      });
    };
  }
  // A failed theme sheet falls back across the lobby, windows, envelope and letters together.
  UI.onFail = function () { try { refreshFrontend(); } catch (e) {} };

  // Floating envelope (#dfb) and the light letters follow the same switch.
  function envelope() { try { if (pD) UI.installEnvelope(pD, on() ? theme() : null); } catch (e) {} }
  applyVisualTheme = function () { var result = legacy.apply.apply(this, arguments); envelope(); return result; };
  // Both renderers keep the same preference and controls, so the old UI always has a way back.
  var oldEggs = dlbBodyEggs;
  dlbBodyEggs = function () {
    var enabled = oldFrontend();
    var row = dlbRowToggle('egglegacyui', 'display', '启用老版前端', 'LEGACY UI',
      '大厅、立绘、信件与命运抽卡等一起切回旧版；关闭后恢复新版', enabled, enabled ? '已开启' : '已关闭', !enabled);
    row = row.replace('class="dlb-row', 'role="button" tabindex="0" aria-pressed="' + enabled + '" class="dlb-row');
    return oldEggs().replace(/<div class="dlb-row dlb-fold(?: on)?" data-dlb="eggfold" data-k="yuan">/, function (next) { return row + next; });
  };
  var oldMenu = buildMenuHTML;
  buildMenuHTML = function () {
    var row = '<div class="sub-opt" role="button" tabindex="0" data-action="toggleLegacyFrontend"><span>启用老版前端</span><span data-reader-legacy-ui-status>'
      + (oldFrontend() ? '已开启' : '已关闭') + '</span></div>';
    return oldMenu().replace(/<div class="sub-opt" data-action="toggleTheme">[\s\S]*?<\/div>/, function (themeRow) { return themeRow + row; });
  };
  function refreshFrontend() {
    dlbEnsureCss();
    envelope();
    if (dlbOv()) { dlbGo(dlbPage || 'main'); dlbLayout(); }
    [document, pD].forEach(function (doc) {
      if (!doc) return;
      doc.querySelectorAll('[data-reader-legacy-ui-status]').forEach(function (node) { node.textContent = oldFrontend() ? '已开启' : '已关闭'; });
    });
    if (window.ReaderGacha && window.ReaderGacha.isOpen()) dreamOpenGacha();
    if (window.__readerHostApi) window.__readerHostApi.refresh();
    else nAll('frontend');
  }
  function toggleFrontend(event) {
    var control = event.target.closest && event.target.closest('[data-dlb="egglegacyui"],[data-action="toggleLegacyFrontend"]');
    if (!control) return;
    if (event.type === 'keydown' && (control.tagName === 'BUTTON' || event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault(); event.stopPropagation();
    try { window.localStorage.setItem('dream_ui_v4', oldFrontend() ? 'on' : 'off'); }
    catch (error) { showToast('前端设置未能保存，请检查浏览器存储空间后重试'); return; }
    refreshFrontend();
  }
  (pD && pD !== document ? [document, pD] : [document]).forEach(function (doc) {
    doc.addEventListener('click', toggleFrontend, true);
    doc.addEventListener('keydown', toggleFrontend, true);
  });
  var oldCommand = window.dreamCmd;
  window.dreamCmd = function (command) {
    if (command === 'frontend') {
      if (window.__readerHostApi) refreshFrontend();
      else { dlbEnsureCss(); envelope(); if (dlbOv()) dlbGo(dlbPage || 'main'); }
      return;
    }
    return oldCommand && oldCommand.apply(this, arguments);
  };
  window.addEventListener('storage', function (event) { if (event.key === 'dream_ui_v4' || event.key === null) refreshFrontend(); });
  envelope();
  var app = window.ReaderController;
  if (app && typeof app.settings === 'function') {
    var legacySettings = app.settings;
    var refreshLetters = function () { try { window.__readerHostApi && window.__readerHostApi.refresh(); } catch (e) {} };
    app.settings = function () {
      var s = legacySettings.apply(this, arguments) || {};
      if (!on()) return s;
      var appearance = safe(function () { return getCurrentAppearance(); }, 'default');
      var custom = safe(function () { return getCurrentPersona() === 'custom'; }, false);
      var ui = UI.letterUi(s.theme || theme(), appearance, refreshLetters);
      // The legacy theme sheets (#dream-ink-native-v1, #dream-theme-fix) style the old letter DOM; v4 letters carry their own.
      s.extraCss = '';
      s.ui = { version: UI.version, art: ui.art, css: ui.css };
      if (ui.art.avatar && !custom) s.avatar = ui.art.avatar;
      return s;
    };
  }
})();
/* DREAM_READER_UI_SWITCH_END */
