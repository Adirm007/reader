// Letters display content. The temporary 4.3 bridge can finish the same accepted reader release.
(function () {
  var host = window.parent, frame = window.frameElement;
  var unregister = null, connectedCore = null, current = {}, extra = document.createElement('style');
  var currentMessageId = null;
  var sourceMessage = null, sourceText = null, sourceSwipe = null;
  var originalDisplay = frame?.style.getPropertyValue('display') || '', originalDisplayPriority = frame?.style.getPropertyPriority('display') || '';
  function chatKey() {
    try { var ctx = host.SillyTavern?.getContext?.(); return ctx ? String(ctx.characterId ?? '') + '|' + String(ctx.getCurrentChatId?.() ?? ctx.chatId ?? '') : null; } catch (_) { return null; }
  }
  var renderedChat = chatKey();
  document.head.appendChild(extra);
  // Build embeds the actual pre-reset letter, rather than trying to restyle the new markup.
  var legacyView = __READER_LEGACY_LETTER_VIEW__;
  var baseStyle = document.getElementById('reader-letter-style'), newCss = baseStyle?.textContent || '';
  var newView = document.querySelector('.wrapper-v9-fix')?.cloneNode(true);
  newView?.querySelector('.text-body-royal')?.replaceChildren();
  var legacyMode = false, cleanupFold = null, updateFold = function () {};
  function selectView(useLegacy) {
    if (legacyMode === useLegacy) return;
    var old = document.querySelector('.wrapper-v9-fix');
    if (!old) return;
    var oldBody = old.querySelector('.text-body-royal'), oldCard = old.querySelector('.cafe-v20-responsive');
    var oldLetter = old.querySelector('.letter-interaction'), oldOuter = old.querySelector('.outer-collapse');
    var signature = old.querySelector('.sig-mini')?.textContent || '';
    var address = old.querySelector('[data-dream-dear],#dream-dear-name')?.textContent || '';
    var scrollTop = oldBody?.scrollTop || 0, opened = !!oldLetter?.open, unfolded = oldCard?.classList.contains('letter-unfolded');
    var target;
    if (useLegacy) {
      var template = document.createElement('template'); template.innerHTML = legacyView.html;
      target = template.content.querySelector('.wrapper-v9-fix');
    } else target = newView?.cloneNode(true);
    if (!target) return;
    cleanupFold?.();
    var body = target.querySelector('.text-body-royal');
    // Moving the existing nodes retains quoted content, links and any attached handlers exactly.
    if (body && oldBody) body.replaceChildren.apply(body, Array.from(oldBody.childNodes));
    var sign = target.querySelector('.sig-mini'); if (sign) sign.textContent = signature;
    target.querySelectorAll('[data-dream-dear],#dream-dear-name').forEach(function (node) { node.textContent = address; });
    var letter = target.querySelector('.letter-interaction'); if (letter) letter.open = opened;
    var outer = target.querySelector('.outer-collapse'); if (outer && oldOuter) outer.open = oldOuter.open;
    var card = target.querySelector('.cafe-v20-responsive'); card?.classList.toggle('letter-unfolded', !!unfolded);
    if (baseStyle) baseStyle.textContent = useLegacy ? legacyView.css : newCss;
    old.replaceWith(target); legacyMode = useLegacy;
    bindFold(); if (body) body.scrollTop = scrollTop;
  }
  // Draw the right medium before the controller connects: the theme is a chat variable, then the device setting.
  (function () {
    var theme = null;
    try { theme = host.SillyTavern?.getContext?.()?.chatMetadata?.variables?.dream_visual_theme; } catch (_) {}
    if (['cafe', 'summer', 'ink'].indexOf(theme) < 0) { try { theme = localStorage.getItem('dream_visual_theme'); } catch (_) {} }
    document.documentElement.setAttribute('data-dream-theme', ['summer', 'ink'].indexOf(theme) >= 0 ? theme : 'cafe');
  })();
  var FOLD = { cafe: ['再展开一折', '折回去'], summer: ['翻到背面', '翻回正面'], ink: ['展开花笺', '卷起花笺'] };
  function core() { return host.ReaderCore; }
  function refresh(settings) {
    current = settings || {};
    selectView(!current.ui);
    document.documentElement.setAttribute('data-dream-theme', current.theme || 'cafe');
    var avatar = document.getElementById('char-face-img');
    if (avatar && !avatar.__lvLoad) { avatar.__lvLoad = true; avatar.addEventListener('load', function () { avatar.classList.add('is-in'); }); }
    if (avatar && current.avatar && avatar.getAttribute('src') !== current.avatar) avatar.src = current.avatar;
    // v4 letters take their art and display faces from the controller; the legacy theme sheets (extraCss) target the old DOM.
    var art = (current.ui && current.ui.art) || {};
    ['scene', 'paper'].forEach(function (key) {
      var value = art[key] ? 'url("' + String(art[key]).replace(/"/g, '%22') + '")' : '';
      if (document.documentElement.style.getPropertyValue('--lv-' + key) !== value) {
        if (value) document.documentElement.style.setProperty('--lv-' + key, value); else document.documentElement.style.removeProperty('--lv-' + key);
      }
    });
    var wrapper = document.querySelector('.wrapper-v9-fix');
    if (wrapper) wrapper.style.zoom = (current.fontSize || 16) / (current.defaultFontSize || 16);
    var font = current.font || {};
    document.querySelectorAll('.text-body-royal,.sig-mini').forEach(function (node) { if (font.family) node.style.fontFamily = font.family; });
    if (font.css) {
      var link = document.querySelector('link[data-reader-font]');
      if (!link) { link = document.createElement('link'); link.rel = 'stylesheet'; link.dataset.readerFont = '1'; document.head.appendChild(link); }
      if (link.getAttribute('href') !== font.css) link.href = font.css;
    }
    var css = current.ui ? current.ui.css || '' : current.extraCss || '';
    if (extra.textContent !== css) extra.textContent = css;
    document.querySelectorAll('[data-dream-dear],#dream-dear-name').forEach(function (node) { if (current.address) node.textContent = current.address; });
    var letter = document.querySelector('.letter-interaction');
    if (letter && current.autoUnseal) { letter.open = true; var casing = letter.querySelector('.envelope-casing'); if (casing) casing.style.display = 'none'; }
    document.getElementById('record-btn')?.classList.toggle('is-playing', !!current.playing);
    // Float mode uses the shared envelope; keep this frame registered as letter data.
    document.body.classList.toggle('reader-letter-compact', current.mode === 'float');
    if (frame) {
      if (current.mode === 'float') frame.style.setProperty('display', 'none', 'important');
      else if (originalDisplay) frame.style.setProperty('display', originalDisplay, originalDisplayPriority);
      else frame.style.removeProperty('display');
    }
    updateFold();
  }
  function connect() {
    if (!frame?.isConnected) { host.document.removeEventListener('reader:ready', connect); return; }
    if (renderedChat !== null && renderedChat !== chatKey()) { host.document.removeEventListener('reader:ready', connect); return; }
    var app = core();
    if (!app || app === connectedCore && unregister) return;
    unregister?.();
    connectedCore = app;
    host.document.removeEventListener('reader:ready', connect);
    var messageId;
    try { if (typeof getCurrentMessageId === 'function') messageId = getCurrentMessageId(); } catch (_) {}
    if (messageId == null) messageId = frame?.closest('.mes')?.getAttribute('mesid');
    currentMessageId = messageId;
    if (sourceMessage === null) {
      var message = host.SillyTavern?.getContext?.()?.chat?.[messageId];
      if (message) { sourceMessage = message; sourceText = message.mes; sourceSwipe = message.swipe_id ?? 0; }
    }
    unregister = app.registerLetter({ frame: frame, messageId: messageId, swipeId: sourceSwipe, refresh: refresh,
      isCurrent: function () {
        if (sourceMessage === null) return true;
        var message = host.SillyTavern?.getContext?.()?.chat?.[messageId];
        return !!message && message.mes === sourceText && (message.swipe_id ?? 0) === sourceSwipe;
      },
      read: function () { return { html: document.querySelector('.text-body-royal')?.innerHTML || '', signature: document.querySelector('.sig-mini')?.textContent || '' }; } });
    window.ReaderLetterUpdaterBridge?.(app,function(){
      if(!frame?.isConnected||core()!==app||renderedChat!==null&&renderedChat!==chatKey())throw Error('来信或聊天已变化');
      if(sourceMessage!==null){var message=host.SillyTavern?.getContext?.()?.chat?.[messageId];if(!message||message.mes!==sourceText||(message.swipe_id??0)!==sourceSwipe)throw Error('来信候选已变化');}
    });
  }
  window.ReaderLetter = { connect: connect, presentation: 2 };
  document.addEventListener('click', function (event) {
    if (current.mode === 'float' && event.target.closest('.flower-btn')) {
      event.preventDefault(); event.stopPropagation(); void core()?.open({ page: 'letters', messageId: currentMessageId }); return;
    }
    var action = event.target.closest('[data-reader-action]')?.dataset.readerAction;
    if (!action) return;
    event.preventDefault(); event.stopPropagation(); connect();
    if (!core()) { var toast = document.getElementById('order-toast'); if (toast) { toast.textContent = '读者脚本正在准备，请稍后重试'; toast.classList.add('show'); } return; }
    if (action === 'music') void core().command('togglePlay');
    else void core().open('lobby');
  });
  document.addEventListener('keydown', function (event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-reader-action]')) { event.preventDefault(); event.target.click(); }
  });
  host.document.addEventListener('reader:ready', connect);
  window.addEventListener('pagehide', function () { unregister?.(); cleanupFold?.(); window.removeEventListener('resize', onResize); host.document.removeEventListener('reader:ready', connect); }, { once: true });
  // Keep the existing long-letter fold without a host resize listener per message.
  function bindFold() {
    var body = document.querySelector('.text-body-royal'), card = document.querySelector('.cafe-v20-responsive');
    if (!body || !card) return;
    var fold = document.createElement('button'); fold.type = 'button'; fold.className = 'letter-fold-toggle'; fold.hidden = true;
    body.after(fold);
    try { if (localStorage.getItem('dream_letter_unfold') === '1') card.classList.add('letter-unfolded'); } catch (_) {}
    updateFold = function () {
      var opened = card.classList.contains('letter-unfolded');
      if (opened) card.classList.remove('letter-unfolded');
      var overflow = getComputedStyle(body).maxHeight !== 'none' && body.scrollHeight > body.clientHeight + 2;
      if (opened) card.classList.add('letter-unfolded');
      var words = legacyMode ? ['展开全文', '收起信纸'] : FOLD[document.documentElement.getAttribute('data-dream-theme')] || FOLD.cafe;
      fold.hidden = !overflow; fold.textContent = opened ? words[1] : words[0]; fold.setAttribute('aria-expanded', String(opened));
      body.classList.toggle('letter-more-above', body.scrollTop > 2);
      body.classList.toggle('letter-more-below', body.scrollTop + body.clientHeight < body.scrollHeight - 2);
    };
    fold.addEventListener('click', function () { var opened = !card.classList.contains('letter-unfolded'); card.classList.toggle('letter-unfolded', opened); try { localStorage.setItem('dream_letter_unfold', opened ? '1' : '0'); } catch (_) {} updateFold(); });
    body.addEventListener('scroll', updateFold, { passive: true });
    var letter = document.querySelector('.letter-interaction'), update = updateFold;
    letter?.addEventListener('toggle', update);
    var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(body);
    cleanupFold = function () { observer?.disconnect(); body.removeEventListener('scroll', update); letter?.removeEventListener('toggle', update); };
    updateFold();
  }
  function onResize() { updateFold(); }
  window.addEventListener('resize', onResize);
  var startsLegacy = false;
  try { startsLegacy = localStorage.getItem('dream_ui_v4') === 'off'; } catch (_) {}
  if (startsLegacy) selectView(true); else bindFold();
  connect();
})();
