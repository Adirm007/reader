// No application, network loader, audio or MVU writer lives in a letter frame.
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
  function core() { return host.ReaderCore; }
  function refresh(settings) {
    current = settings || {};
    document.documentElement.setAttribute('data-dream-theme', current.theme || 'cafe');
    var avatar = document.getElementById('char-face-img');
    if (avatar && current.avatar && avatar.getAttribute('src') !== current.avatar) avatar.src = current.avatar;
    var wrapper = document.querySelector('.wrapper-v9-fix');
    if (wrapper) wrapper.style.zoom = (current.fontSize || 16) / (current.defaultFontSize || 16);
    var font = current.font || {};
    document.querySelectorAll('.text-body-royal,.sig-mini').forEach(function (node) { if (font.family) node.style.fontFamily = font.family; });
    if (font.css) {
      var link = document.querySelector('link[data-reader-font]');
      if (!link) { link = document.createElement('link'); link.rel = 'stylesheet'; link.dataset.readerFont = '1'; document.head.appendChild(link); }
      if (link.getAttribute('href') !== font.css) link.href = font.css;
    }
    if (extra.textContent !== (current.extraCss || '')) extra.textContent = current.extraCss || '';
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
  }
  window.ReaderLetter = { connect: connect };
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
  window.addEventListener('pagehide', function () { unregister?.(); host.document.removeEventListener('reader:ready', connect); }, { once: true });
  // Keep the existing long-letter fold without a host resize listener per message.
  var body = document.querySelector('.text-body-royal'), card = document.querySelector('.cafe-v20-responsive');
  if (body && card) {
    var fold = document.createElement('button'); fold.type = 'button'; fold.className = 'letter-fold-toggle'; fold.hidden = true;
    body.after(fold);
    try { if (localStorage.getItem('dream_letter_unfold') === '1') card.classList.add('letter-unfolded'); } catch (_) {}
    function updateFold() {
      var opened = card.classList.contains('letter-unfolded');
      if (opened) card.classList.remove('letter-unfolded');
      var overflow = getComputedStyle(body).maxHeight !== 'none' && body.scrollHeight > body.clientHeight + 2;
      if (opened) card.classList.add('letter-unfolded');
      fold.hidden = !overflow; fold.textContent = opened ? '收起信纸' : '展开全文'; fold.setAttribute('aria-expanded', String(opened));
      body.classList.toggle('letter-more-above', body.scrollTop > 2);
      body.classList.toggle('letter-more-below', body.scrollTop + body.clientHeight < body.scrollHeight - 2);
    }
    fold.addEventListener('click', function () { var opened = !card.classList.contains('letter-unfolded'); card.classList.toggle('letter-unfolded', opened); try { localStorage.setItem('dream_letter_unfold', opened ? '1' : '0'); } catch (_) {} updateFold(); });
    body.addEventListener('scroll', updateFold, { passive: true });
    window.addEventListener('resize', updateFold);
    document.querySelector('.letter-interaction')?.addEventListener('toggle', updateFold);
    if (typeof ResizeObserver === 'function') new ResizeObserver(updateFold).observe(body);
    updateFold();
  }
  connect();
})();
