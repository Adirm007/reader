// The existing feature implementation runs once; only its message-owned bootstrap is replaced.
(function () {
  pW = window.__readerTrackedHost;
  pD = window.__readerTrackedDocument;
  getCustomPersonaHostDocument = function () { return pD; };
  findMyIframe = function () { return window.frameElement; };
  regLetter = function () {};
  startHeartbeat = function () {};
  dreamSmartSweep = function () {};
  dreamLobbyWantReopen = function () { return false; };
  dreamIsLastMes = function () { return true; };
  dlbSweep = function () {};
  dlbAlive = function () { return window.__readerControllerAlive; };
  nAll = function () { window.__readerHostApi?.refresh(); };
  syncLabels = nAll;
  var originalAddonSync = dreamSyncAddonLabels;
  dreamSyncAddonLabels = function () { originalAddonSync(true); window.__readerHostApi?.refresh(); };
  var createFloatEnvelope = eFB, removeFloatEnvelope = rFB, readFloatLetters = openFP;
  var HIDE_FLOAT_KEY = 'dream_hide_persistent_float', lastMailFingerprint = null;
  function hidePersistentFloat() { return gLS(HIDE_FLOAT_KEY, 'off') === 'on'; }
  function currentLetters() { return window.__readerHostApi?.getLetters() || []; }
  function syncFloatSetting() {
    var hidden = hidePersistentFloat();
    pD.querySelectorAll('[data-dlb="egghidefloat"]').forEach(function (row) {
      row.classList.toggle('on', hidden);
      var value = row.querySelector('.sv2');
      if (value) { value.textContent = hidden ? '已开启' : '已关闭'; value.classList.toggle('dim', !hidden); }
    });
    pD.querySelectorAll('[data-reader-hide-float-status]').forEach(function (value) { value.textContent = hidden ? '已开启' : '已关闭'; });
  }
  function refreshEnvelope() {
    var api = window.__readerHostApi;
    if (!window.__readerControllerAlive || !api?.canOwnEnvelope) return;
    var letters = currentLetters(), floating = gLS(DK, 'inline') === 'float';
    var visible = !hidePersistentFloat() || floating && letters.length > 0;
    if (!visible) { removeFloatEnvelope(); syncFloatSetting(); return; }
    var envelope = pD.getElementById('dfb');
    if (!envelope || envelope.getAttribute('data-reader-persistent-envelope') !== '1') {
      createFloatEnvelope();
      envelope = pD.getElementById('dfb');
      if (!envelope) return;
      envelope.setAttribute('data-reader-persistent-envelope', '1');
      envelope.setAttribute('role', 'button');
      envelope.tabIndex = 0;
      envelope.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); openFP();
      });
    }
    var fingerprint = JSON.stringify([api.getLatestMessageId(), letters.map(function (letter) { return [letter.html, letter.signature]; })]);
    if (fingerprint !== lastMailFingerprint) { lastMailFingerprint = fingerprint; pW.__dread = false; }
    pW.__dl = floating ? letters.map(function (letter, index) { return { c: letter.html, s: letter.signature, idx: index, ifr: letter.frame }; }) : [];
    pW.__dmid = api.getLatestMessageId();
    envelope.title = floating && letters.length ? '查看夜梦的来信' : '打开九十九夜梦的菜单';
    envelope.setAttribute('aria-label', envelope.title);
    uBadge();
    if (floating && letters.length && !pW.__dread) shkB();
    else envelope.classList.remove('dream-shaking');
    syncFloatSetting();
  }
  eFB = refreshEnvelope;
  rFB = refreshEnvelope;
  applySwitch = function () { window.__readerHostApi?.refresh(); };
  window.dreamCmd = function (command) {
    if (command === 'updatePortrait') updatePortraitImage();
    if (command === 'theme') {
      applyVisualTheme(getVisualTheme(), true);
      if (getVisualTheme() === 'summer') closeDreamLobby();
    }
    window.__readerHostApi?.refresh();
  };
  dreamLobbySave = function () {};
  dreamLobbyFresh = function () {};
  var selectedLetterMessage = null;
  validateLetterData = function () {
    pW.__dl = (window.__readerHostApi?.getLetters(selectedLetterMessage) || []).map(function (letter, index) {
      return { c: letter.html, s: letter.signature, idx: index, ifr: letter.frame };
    });
  };
  function closeFloatLetters() {
    var old = pD.getElementById('dfo');
    if (!old) return;
    if (old.__cancelTrack) old.__cancelTrack();
    else if (old.__raf) window.cancelAnimationFrame(old.__raf);
    old.remove();
  }
  openFP = function () {
    if (selectedLetterMessage == null && (gLS(DK, 'inline') !== 'float' || !currentLetters().length)) return openDreamLobby();
    if (selectedLetterMessage == null) selectedLetterMessage = window.__readerHostApi?.getLatestMessageId();
    closeDreamLobby();
    closeFloatLetters();
    try { return readFloatLetters(); }
    finally { selectedLetterMessage = null; }
  };
  var originalEggs = dlbBodyEggs;
  dlbBodyEggs = function () {
    var hidden = hidePersistentFloat();
    var row = dlbRowToggle('egghidefloat', 'display', '隐藏常驻悬浮窗', 'FLOAT WINDOW', '', hidden, hidden ? '已开启' : '已关闭', !hidden);
    return originalEggs().replace('<div class="dlb-sub-h">管理台', row + '<div class="dlb-sub-h">管理台');
  };
  var originalFloatMenu = buildMenuHTML;
  buildMenuHTML = function () {
    var row = '<div class="sub-opt" data-action="toggleHidePersistentFloat"><span>隐藏常驻悬浮窗</span><span data-reader-hide-float-status>' + (hidePersistentFloat() ? '已开启' : '已关闭') + '</span></div>';
    return originalFloatMenu().replace('<div class="sub-opt" data-action="toggleTheme">', row + '<div class="sub-opt" data-action="toggleTheme">');
  };
  pD.addEventListener('click', function (event) {
    var toggle = event.target.closest?.('[data-dlb="egghidefloat"],[data-action="toggleHidePersistentFloat"]');
    if (!toggle) return;
    event.preventDefault(); event.stopPropagation();
    sLS(HIDE_FLOAT_KEY, hidePersistentFloat() ? 'off' : 'on');
    window.__readerHostApi?.refresh();
  }, true);
  pW.addEventListener('resize', function () {
    var envelope = pD.getElementById('dfb');
    if (!envelope || envelope.getAttribute('data-reader-persistent-envelope') !== '1') return;
    envelope.__vx = Math.max(4, Math.min(Math.max(4, pW.innerWidth - (envelope.offsetWidth || 70) - 4), envelope.__vx));
    envelope.__vy = Math.max(4, Math.min(Math.max(4, pW.innerHeight - (envelope.offsetHeight || 50) - 4), envelope.__vy));
    pW.__dfbPos = { x: envelope.__vx, y: envelope.__vy };
  });
  var originalOpen = openDreamLobby;
  openDreamLobby = function () {
    closeFloatLetters();
    var result = originalOpen();
    var overlay = pD.getElementById('dlb-overlay');
    if (overlay) {
      overlay.__dlbOwner = window.frameElement;
      // Clock/visual effects remain, but message-owner recovery is no longer needed.
    }
    return result;
  };
  var commands = { togglePlay: togglePlay, handleTrackBtnClick: handleTrackBtnClick, toggleTrackList: toggleTrackList,
    toggleMenu: openDreamLobby, openDreamLobby: openDreamLobby, openBookshelf: openBookshelf,
    openChessGame: openChessGame, openDreamGallery: openDreamGallery };
  function settings() {
    return { theme: getVisualTheme(), mode: gLS(DK, 'inline'), hidePersistentFloat: hidePersistentFloat(), autoUnseal: gLS(AK, 'off') === 'on',
      address: getUserAddress() || dreamStUserName(), avatar: getAvatarUrl(), font: getFontObj(getCurrentFontId()),
      fontSize: getCurFSZ(), defaultFontSize: DEF_FSZ, playing: !!(audio && !audio.paused),
      extraCss: ['dream-ink-native-v1','dream-theme-fix'].map(function (id) { return document.getElementById(id)?.textContent || ''; }).join('\n') };
  }
  ['setCurrentFont','setCurFSZ','setPersona','setAppearance','toggleSilent','setSTVariable','delSTVariable'].forEach(function (name) {
    var original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function () { var result = original.apply(this, arguments); window.__readerHostApi?.refresh(); return result; };
  });
  var resumeAudio = false;
  function setAudioFocus(owner) {
    if (!window.__readerControllerAlive) return;
    var music = typeof readerMusic !== 'undefined' ? readerMusic : null;
    if (owner === 'booksea') { resumeAudio = resumeAudio || !audio.paused || !!music?.loading; if (music) music.pause(); else audio.pause(); }
    else if (resumeAudio) { resumeAudio = false; if (music) music.resume(); else audio.play().catch(function () {}); }
  }
  var bookseaHost = typeof window.createReaderBookseaHost === 'function' ? window.createReaderBookseaHost({
    window: window, host: window.parent, base: window.parent.ReaderCoreConfig?.bookseaBase,
    onFocus: function (active) { setAudioFocus(active ? 'booksea' : 'reader'); }
  }) : null;
  function openBooksea(action) {
    if (!window.__readerControllerAlive || !bookseaHost) return Promise.resolve(false);
    closeDreamLobby();
    return bookseaHost.open(typeof action === 'string' && action || 'maze').catch(function (error) {
      if (window.__readerControllerAlive) showToast(error && error.message || '书海暂时没能展开，请重试');
      return false;
    });
  }
  if (bookseaHost) dlbEnterBooksea = openBooksea;
  window.ReaderController = {
    open: function (page) {
      if (!window.__readerControllerAlive) return false;
      var target = typeof page === 'object' ? page.page || 'lobby' : page;
      if (target === 'letters') { selectedLetterMessage = typeof page === 'object' ? page.messageId : null; openFP(); return true; }
      var opened = openDreamLobby();
      if (opened && target && target !== 'lobby' && target !== 'main') dlbGo(target);
      return opened;
    },
    close: function () { closeDreamLobby(); closeFloatLetters(); },
    command: function (name) {
      if (!window.__readerControllerAlive || !commands[name]) return false;
      var result = commands[name].apply(null, Array.prototype.slice.call(arguments, 1));
      window.__readerHostApi?.refresh();
      return result;
    },
    settings: settings,
    refreshEnvelope: refreshEnvelope,
    openBooksea: openBooksea,
    setAudioFocus: setAudioFocus,
    dispose: function () {
      if (!window.__readerControllerAlive) return;
      window.__readerControllerAlive = false;
      try { bookseaHost?.dispose(); } catch (_) {}
      try { dlbRemoveL(); closeDreamLobby(); } catch (_) {}
      try { if (typeof readerMusic !== 'undefined' && readerMusic) readerMusic.dispose(); } catch (_) {}
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (_) {}
      try { window.ReaderTransactions?.dispose?.(); } catch (_) {}
      window.__readerCleanup();
    }
  };
  applyVisualTheme(getVisualTheme(), false);
  initModeLabels();
  updatePortraitImage();
  audio.addEventListener('play', function () { window.__readerHostApi?.refresh(); });
  audio.addEventListener('pause', function () { window.__readerHostApi?.refresh(); });
  setTimeout(function () { if (window.__readerControllerAlive) window.ReaderUpdates?.restore(); }, 0);
  setTimeout(function () { if (window.__readerControllerAlive) dreamWbAutoCheck(); }, 5000);
})();
