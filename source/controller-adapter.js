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
  eFB = function () {};
  rFB = function () {};
  applySwitch = function () { window.__readerHostApi?.refresh(); };
  dreamLobbySave = function () {};
  dreamLobbyFresh = function () {};
  var selectedLetterMessage = null;
  validateLetterData = function () {
    pW.__dl = (window.__readerHostApi?.getLetters(selectedLetterMessage) || []).map(function (letter, index) {
      return { c: letter.html, s: letter.signature, idx: index, ifr: letter.frame };
    });
  };
  var originalOpen = openDreamLobby;
  openDreamLobby = function () {
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
    return { theme: getVisualTheme(), mode: gLS(DK, 'inline'), autoUnseal: gLS(AK, 'off') === 'on',
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
    if (owner === 'booksea') { resumeAudio = resumeAudio || !audio.paused; audio.pause(); }
    else if (resumeAudio) { resumeAudio = false; audio.play().catch(function () {}); }
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
    close: function () { closeDreamLobby(); },
    command: function (name) {
      if (!window.__readerControllerAlive || !commands[name]) return false;
      var result = commands[name].apply(null, Array.prototype.slice.call(arguments, 1));
      window.__readerHostApi?.refresh();
      return result;
    },
    settings: settings,
    openBooksea: openBooksea,
    setAudioFocus: setAudioFocus,
    dispose: function () {
      if (!window.__readerControllerAlive) return;
      window.__readerControllerAlive = false;
      try { bookseaHost?.dispose(); } catch (_) {}
      try { dlbRemoveL(); closeDreamLobby(); } catch (_) {}
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
