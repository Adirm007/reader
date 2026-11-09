/* DREAM_READER_UI_SWITCH_BEGIN */
// 新表现层（window.ReaderUI，ui/ 打包）的切换点。必须是最外层：脚本版放在 controller-adapter.js 之后，
// 完整版放在 legacy-reader.js 与 template-system.js 之后。它只换「画什么」：动作仍由 dlbClick 链处理，
// 计价、FP、事务、聊天变量都不经过这里。localStorage.dream_ui_v4 = 'off' 时每个函数都直接走旧实现。
// ReaderUI 还没接管的子页（Phase 5 之前的人格、定调、彩蛋、解耦、条目模仿）仍用旧骨架整页绘制。
(function () {
  var UI = window.ReaderUI;
  if (!UI || typeof UI.skeleton !== 'function' || typeof dlbGo !== 'function') return;
  var legacy = {
    cafe: cfSkeleton, summer: sxSkeleton, ink: jnSkeleton, ensure: dlbEnsureCss, top: dlbTopHTML, main: dlbMainHTML,
    go: dlbGo, clock: dlbClockSync, fp: dlbSyncFpDom, juke: dlbJukeSync, badges: dlbBadges, apply: applyVisualTheme,
    rhythm: typeof handleRhythm === 'function' ? handleRhythm : null
  };
  function on() { try { return UI.enabled(window.localStorage); } catch (e) { return true; } }
  function theme() { try { var t = getVisualTheme(); return t === 'summer' || t === 'ink' ? t : 'cafe'; } catch (e) { return 'cafe'; } }
  function fresh(ov) { return !!(ov && ov.querySelector('#u4r')); }
  function safe(fn, fallback) { try { var v = fn(); return v === undefined || v === null ? fallback : v; } catch (e) { return fallback; } }
  function state() {
    var app = safe(function () { return getCurrentAppearance(); }, 'default'), appName = '';
    safe(function () { APPEARANCE_ITEMS.forEach(function (x) { if (x.id === app) appName = x.name; }); });
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
      avatar: safe(function () { return getAvatarUrl(); }, '')
    };
  }
  var hooks = { state: state };
  function legacySkeleton(t) { return (legacy[t] || legacy.cafe)(); }
  // Swap the whole overlay content between the new skeleton and the legacy one (same overlay node, so its
  // timer, listeners and ownership stay). What openDreamLobby does for a legacy skeleton is repeated here.
  function swap(ov, t, toNew) {
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
  dlbGo = function (page) {
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
  if (legacy.rhythm) {
    handleRhythm = function (kind) {
      var result = legacy.rhythm.apply(this, arguments);
      if (result && typeof result.then === 'function') {
        result.then(function () { if (on()) UI.notify(dlbOv(), { type: 'paid', kind: kind }); }, function () {});
      }
      return result;
    };
  }

  // Floating envelope (#dfb) and the light letters follow the same switch.
  function envelope() { try { if (pD) UI.installEnvelope(pD, on() ? theme() : null); } catch (e) {} }
  applyVisualTheme = function () { var result = legacy.apply.apply(this, arguments); envelope(); return result; };
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
      var art = UI.letterArt(s.theme || theme(), appearance, refreshLetters);
      // The legacy theme sheets (#dream-ink-native-v1, #dream-theme-fix) style the old letter DOM; v4 letters carry their own.
      s.extraCss = '';
      s.ui = { version: UI.version, art: art };
      if (art.avatar && !custom) s.avatar = art.avatar;
      return s;
    };
  }
})();
/* DREAM_READER_UI_SWITCH_END */
