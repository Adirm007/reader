// The role-card runtime owns one controller. Message frames only display letters.
import { ASSETS } from 'reader:assets';

const FRAME_ID = 'reader-core-controller';
const OLD_BUTTON_ID = 'reader-core-launcher';
const LEGACY_SOURCE = Symbol.for('reader.legacy-letter.source');
let running = null;
let successor = null;
let lifecycle = 0;

function hostWindow() {
  try { return window.parent && window.parent !== window ? window.parent : window; }
  catch { return window; }
}

function chatKey(win) {
  const context = win.SillyTavern?.getContext?.();
  const chat = context?.getCurrentChatId?.() ?? context?.chatId;
  return `${context?.characterId ?? ''}|${chat ?? ''}`;
}

function macroText(text, win, script = false) {
  const context = win.SillyTavern?.getContext?.() || {};
  const escaped = value => script ? JSON.stringify(String(value)).slice(1, -1).replace(/'/g, '\\u0027').replace(/`/g, '\\u0060').replace(/\$/g, '\\u0024') : String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  return text.replace(/<user>|\{\{user\}\}/gi, () => escaped(context.name1 || '作家'))
    .replace(/<(?:bot|char)>|\{\{char\}\}/gi, () => escaped(context.name2 || '九十九夜梦'));
}

export function start(options = {}) {
  if (successor) return successor.start(options);
  if (running) return running.api;
  const win = hostWindow(), doc = win.document;
  win.ReaderCore?.stop?.();
  const legacyNodes = ['dfb','dfo','dfc','dream-hb','dream-p-toast','dlb-overlay','dlb-style','cp-overlay','cp-style','cpl-overlay','cpl-style','dgl-overlay','dgl-style-v2','chess-overlay','chess-styles','bs-overlay','bs-detail-ov','bs-styles','dream-addon-style-v3','dream-ink-native-v1','dream-theme-fix','reader-template-system-overlay','reader-template-system-style'].map(id => doc.getElementById(id)).filter(Boolean);
  doc.getElementById(FRAME_ID)?.remove();
  doc.getElementById(OLD_BUTTON_ID)?.remove();
  const state = { stopped: false, generation: 0, key: chatKey(win), frame: null, ready: null, stops: [], letters: new Set(), legacyFrames: new Map(), cancelReady: null, legacyRetired: false };
  let resolveReady = null;
  state.cancelReady = () => { resolveReady?.(null); resolveReady = null; };

  const retireLegacyMenu = () => {
    if (win.__dhb) { win.clearInterval(win.__dhb); win.__dhb = null; }
    doc.getElementById('dream-hb')?.remove();
    for (const node of legacyNodes) node.remove();
    state.legacyRetired = true;
    adoptLegacyFrames();
    state.frame?.contentWindow?.ReaderController?.refreshEnvelope?.();
  };

  // Replacing a regex does not redraw its already rendered complete iframes.
  // Keep their letters readable, but route their menu back to this controller.
  function adoptLegacyFrame(frame) {
    if (state.stopped || !state.legacyRetired || !frame.closest?.('.mes[mesid]')) return false;
    let target, letterDoc;
    try {
      target = frame.contentWindow;
      letterDoc = frame.contentDocument;
    } catch {
      const previous = state.legacyFrames.get(frame);
      if (previous) { previous.restore(); state.legacyFrames.delete(frame); state.letters.delete(previous.letter); }
      return !!previous;
    }
    const previous = state.legacyFrames.get(frame);
    if (previous?.document === letterDoc) return false;
    if (previous) { previous.restore(); state.legacyFrames.delete(frame); state.letters.delete(previous.letter); }
    try {
      if (!target?.__isDreamIframe || target.ReaderLetter || target.__readerHostApi || !letterDoc?.querySelector('.text-body-royal') || !letterDoc.getElementById('menu-trigger')) return !!previous;
    } catch { return !!previous; }
    const messageId = frame.closest('.mes[mesid]').getAttribute('mesid');
    const source = win.SillyTavern?.getContext?.()?.chat?.[Number(messageId)];
    if (!Object.prototype.hasOwnProperty.call(letterDoc, LEGACY_SOURCE)) {
      Object.defineProperty(letterDoc, LEGACY_SOURCE, {value: Object.freeze({chatKey: state.key, messageId, mes: source?.mes, swipeId: source?.swipe_id ?? 0, hasMessage: !!source})});
    }
    const rendered = letterDoc[LEGACY_SOURCE];
    if (rendered.chatKey !== state.key || rendered.messageId !== messageId) return !!previous;
    const sourceText = rendered.mes, sourceSwipe = rendered.swipeId, sourceKey = rendered.chatKey;
    const originalStyle = frame.getAttribute('style'), originals = new Map();
    // Old float mode rewrites the whole iframe style. Its inline counterpart
    // clears that hiding style, so use the same baseline when returning inline.
    const legacyHidden = letterDoc.body.classList.contains('dream-float-mode');
    if (legacyHidden) frame.style.cssText = '';
    const display = frame.style.getPropertyValue('display'), priority = frame.style.getPropertyPriority('display');
    function replace(name, replacement) {
      if (typeof target[name] !== 'function') return;
      const original = target[name];
      target[name] = replacement;
      originals.set(name, {original, replacement});
    }
    const openMenu = () => { void api.open('lobby'); return true; };
    const refresh = () => api.refresh();
    for (const name of ['openDreamLobby','toggleMenu','legacyToggleMenu']) replace(name, openMenu);
    for (const name of ['applySwitch','hideMyIframe','showMyIframe','eFB','rFB','regLetter','startHeartbeat']) replace(name, refresh);
    replace('dreamSmartSweep', () => {});
    replace('dreamCmd', refresh);
    replace('togglePlay', () => { void api.command('togglePlay'); });
    replace('handleTrackBtnClick', () => { void api.command('handleTrackBtnClick'); });
    const letter = {
      frame, messageId, swipeId: sourceSwipe,
      isCurrent: () => {
        const message = win.SillyTavern?.getContext?.()?.chat?.[Number(messageId)];
        return state.key === sourceKey && (!rendered.hasMessage || !!message && message.mes === sourceText && (message.swipe_id ?? 0) === sourceSwipe);
      },
      read: () => ({html: letterDoc.querySelector('.text-body-royal')?.innerHTML || '', signature: letterDoc.querySelector('.sig-mini')?.textContent || ''}),
      refresh: settings => {
        letterDoc.body.classList.remove('dream-float-mode');
        if (settings.mode === 'float') frame.style.setProperty('display', 'none', 'important');
        else if (display) frame.style.setProperty('display', display, priority);
        else frame.style.removeProperty('display');
        if (letterDoc.documentElement.getAttribute('data-dream-theme') !== settings.theme) target.applyVisualTheme?.(settings.theme, false);
        const avatar = letterDoc.getElementById('char-face-img');
        if (avatar && settings.avatar && avatar.getAttribute('src') !== settings.avatar) avatar.src = settings.avatar;
        const wrapper = letterDoc.querySelector('.wrapper-v9-fix');
        if (wrapper) wrapper.style.zoom = (settings.fontSize || 16) / (settings.defaultFontSize || 16);
        letterDoc.querySelectorAll('.text-body-royal,.sig-mini').forEach(node => { if (settings.font?.family) node.style.fontFamily = settings.font.family; });
        letterDoc.querySelectorAll('[data-dream-dear],#dream-dear-name').forEach(node => { if (settings.address) node.textContent = settings.address; });
        letterDoc.getElementById('record-btn')?.classList.toggle('is-playing', !!settings.playing);
      }
    };
    const restore = () => {
      // A reused iframe may already belong to a different or cross-origin page.
      try {
        if (frame.contentDocument !== letterDoc) return;
        for (const [name, entry] of originals) if (target[name] === entry.replacement) target[name] = entry.original;
        if (originalStyle === null) frame.removeAttribute('style'); else frame.setAttribute('style', originalStyle);
        letterDoc.body.classList.toggle('dream-float-mode', legacyHidden);
      } catch {}
    };
    state.legacyFrames.set(frame, {letter, restore, document: letterDoc});
    state.letters.add(letter);
    return true;
  }

  function adoptLegacyFrames() {
    for (const frame of doc.querySelectorAll('.mes[mesid] iframe')) adoptLegacyFrame(frame);
  }

  function releaseLegacyFrames() {
    for (const {letter, restore} of state.legacyFrames.values()) { restore(); state.letters.delete(letter); }
    state.legacyFrames.clear();
  }

  const disposeController = () => {
    state.generation++;
    try { state.frame?.contentWindow?.ReaderController?.dispose(); } catch (error) { console.warn('[读者] 清理界面', error); }
    state.frame?.remove();
    state.frame = null;
    resolveReady?.(null);
    resolveReady = null;
    state.ready = null;
  };

  const ensure = () => {
    if (state.stopped) return Promise.resolve(null);
    if (state.ready) return state.ready;
    const generation = ++state.generation;
    const frame = doc.createElement('iframe');
    frame.id = FRAME_ID;
    frame.title = '读者常驻控制器';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-4px;top:-4px;width:1px;height:1px;opacity:0;pointer-events:none;border:0;margin:0;padding:0';
    state.frame = frame;
    state.ready = new Promise((resolve) => { resolveReady = resolve; });
    frame.addEventListener('load', () => {
      if (state.stopped || state.frame !== frame || generation !== state.generation) return;
      try {
        const target = frame.contentWindow;
        target.__readerRuntimeGeneration = generation;
        target.__readerHostApi = api;
        const helper = new Proxy({}, { get: (_, name) => {
          for (const owner of [globalThis.TavernHelper, win.TavernHelper, globalThis, win]) {
            if (owner && owner[name] !== undefined) return typeof owner[name] === 'function' ? owner[name].bind(owner) : owner[name];
          }
        } });
        target.TavernHelper = helper;
        target.SillyTavern = win.SillyTavern;
        target.Mvu = globalThis.Mvu || win.Mvu;
        target._ = globalThis._ || win._;
        for (const name of ['eventOn','eventMakeFirst','eventEmit','tavern_events','getCurrentMessageId','getAllVariables']) {
          target[name] = globalThis[name] || win[name];
        }
        const script = frame.contentDocument.createElement('script');
        script.textContent = macroText(ASSETS.controller, win, true);
        frame.contentDocument.body.appendChild(script);
        const app = target.ReaderController;
        if (!app) throw new Error('读者控制器未能启动');
        // Keep the complete fixed renderer usable if the first script cannot start.
        if (!options.scriptOwner || !win.__readerScriptInstallation) retireLegacyMenu();
        resolveReady?.(app);
        resolveReady = null;
        // Reattach already-rendered light letters after a script restart. This
        // runs once per controller, without a permanent listener per letter.
        for (const letter of doc.querySelectorAll('iframe')) {
          try { letter.contentWindow?.ReaderLetter?.connect?.(); } catch {}
        }
        notifyLetters();
        doc.dispatchEvent(new win.Event('reader:ready'));
      } catch (error) {
        console.error('[读者] 常驻界面启动失败', error);
        try {
          const target = frame.contentWindow;
          target.__readerControllerAlive = false;
          target.__readerCleanup?.();
        } catch {}
        frame.remove();
        if (state.frame === frame) state.frame = null;
        resolveReady?.(null);
        resolveReady = null;
        state.ready = null;
      }
    }, { once: true });
    frame.srcdoc = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + ASSETS.css + '</style></head><body>' + macroText(ASSETS.body, win) + '</body></html>';
    doc.body.appendChild(frame);
    return state.ready;
  };

  function notifyLetters() {
    if (state.stopped) return;
    const settings = api.settings();
    for (const letter of state.letters) {
      if (!letter.frame?.isConnected) { state.legacyFrames.get(letter.frame)?.restore(); state.legacyFrames.delete(letter.frame); state.letters.delete(letter); continue; }
      try { letter.refresh?.(settings); } catch { state.legacyFrames.get(letter.frame)?.restore(); state.legacyFrames.delete(letter.frame); state.letters.delete(letter); }
    }
    state.frame?.contentWindow?.ReaderController?.refreshEnvelope?.();
  }

  function latestMessageId() {
    const context = win.SillyTavern?.getContext?.();
    if (Array.isArray(context?.chat)) return context.chat.length - 1;
    try {
      const last = (globalThis.getLastMessageId || win.TavernHelper?.getLastMessageId)?.();
      if (Number.isInteger(last)) return last;
    } catch {}
    return [...doc.querySelectorAll('.mes[mesid]')].reduce((last, message) => Math.max(last, Number(message.getAttribute('mesid')) || 0), -1);
  }

  const api = {
    runtimeVersion: ASSETS.version,
    get scriptOwner() { return options.scriptOwner || null; },
    get canOwnEnvelope() { return state.legacyRetired; },
    getLatestMessageId: latestMessageId,
    retireLegacyMenu,
    getUpdateOptions: () => options.updates || {},
    replaceRuntime: async (request) => {
      const key = state.key;
      if (state.stopped || chatKey(win) !== key) throw Error('聊天已变化，请重新检查更新');
      const url = URL.createObjectURL(new Blob([request.source], {type: 'text/javascript'}));
      let next;
      try { next = await import(/* @vite-ignore */ url); }
      finally { URL.revokeObjectURL(url); }
      if (state.stopped || chatKey(win) !== key) throw Error('聊天已变化，请重新检查更新');
      if (typeof next.start !== 'function' || typeof next.stop !== 'function') throw Error('更新脚本缺少生命周期接口');
      stop();
      const transfer = lifecycle;
      let app;
      try {
        app = await next.start(options);
        if (!app || app.runtimeVersion !== request.version || !await app.ready) throw Error('更新脚本未能启动');
        if (lifecycle !== transfer || running || chatKey(win) !== key || win.ReaderCore !== app) throw Error('聊天或运行脚本已变化，旧更新已取消');
        successor = next;
        return app;
      } catch (error) {
        const owns = app && win.ReaderCore === app;
        if (owns) next.stop();
        if (lifecycle === transfer && !running && chatKey(win) === key && (owns || !win.ReaderCore)) start(options);
        throw error;
      }
    },
    open: async (page = 'lobby') => {
      const key = state.key, generation = state.generation;
      const app = await ensure();
      if (!app || state.stopped || key !== state.key || generation !== state.generation && state.frame?.contentWindow?.ReaderController !== app) return false;
      return app.open(page);
    },
    close: () => state.frame?.contentWindow?.ReaderController?.close(),
    command: async (name, ...args) => {
      const app = await ensure();
      if (!app || state.stopped || chatKey(win) !== state.key || state.frame?.contentWindow?.ReaderController !== app) return false;
      return app.command(name, ...args);
    },
    settings: () => state.frame?.contentWindow?.ReaderController?.settings?.() || {},
    registerLetter(letter) {
      if (state.stopped || !letter.frame?.isConnected) return () => {};
      state.letters.add(letter);
      notifyLetters();
      return () => { state.letters.delete(letter); notifyLetters(); };
    },
    getLetters(messageId) {
      const chat = win.SillyTavern?.getContext?.()?.chat;
      const live = [...state.letters].filter(letter => letter.frame?.isConnected
        && (letter.swipeId == null || String(letter.swipeId) === String(chat?.[Number(letter.messageId)]?.swipe_id ?? 0))
        && (!letter.isCurrent || letter.isCurrent()));
      if (messageId == null) messageId = latestMessageId();
      return live.filter(letter => String(letter.messageId) === String(messageId)).sort((left, right) => {
        const position = left.frame.compareDocumentPosition?.(right.frame) || 0;
        return position & 4 ? -1 : position & 2 ? 1 : 0;
      }).map(letter => ({ ...letter.read(), frame: letter.frame }));
    },
    setAudioFocus: (owner) => state.frame?.contentWindow?.ReaderController?.setAudioFocus?.(owner),
    openBooksea: async (action = 'maze') => {
      const app = await ensure();
      if (!app || state.stopped || chatKey(win) !== state.key || state.frame?.contentWindow?.ReaderController !== app) return false;
      return app.openBooksea(action);
    },
    refresh: notifyLetters,
    get ready() { return ensure(); },
    get isAlive() { return !state.stopped; },
    stop,
  };
  running = { state, api, win };
  win.ReaderCore = api;

  const changed = () => {
    if (state.stopped) return;
    const next = chatKey(win);
    if (next === state.key) { notifyLetters(); return; }
    disposeController();
    releaseLegacyFrames();
    state.key = next;
    state.letters.clear();
    void ensure();
  };
  const onChatChanged = changed;
  const refresh = () => { changed(); notifyLetters(); };
  const onFrameLoaded = event => { if (event.target?.tagName === 'IFRAME' && adoptLegacyFrame(event.target)) notifyLetters(); };
  doc.addEventListener('load', onFrameLoaded, true);
  state.stops.push(() => doc.removeEventListener('load', onFrameLoaded, true));
  state.stops.push(releaseLegacyFrames);
  const events = globalThis.tavern_events || win.tavern_events || {};
  const listen = globalThis.eventOn || win.eventOn;
  if (typeof listen === 'function') {
    for (const name of ['CHAT_CHANGED', 'MESSAGE_SENT', 'USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_ENDED']) {
      if (!events[name]) continue;
      const handle = listen(events[name], name === 'CHAT_CHANGED' ? onChatChanged : refresh);
      if (handle?.stop) state.stops.push(() => handle.stop());
    }
  } else {
    // Preview and hosts without helper events still detect an explicit chat switch.
    doc.addEventListener('reader:chat-changed', onChatChanged);
    state.stops.push(() => doc.removeEventListener('reader:chat-changed', onChatChanged));
  }
  // The host awaits this native event before building world-info/EJS prompts.
  // A fast first send must not race the controller's pure prompt-data cache.
  const context = win.SillyTavern?.getContext?.();
  const source = context?.eventSource, nativeEvents = context?.eventTypes || events;
  if (typeof source?.makeFirst === 'function' && typeof source?.removeListener === 'function' && nativeEvents.GENERATION_AFTER_COMMANDS) {
    const prepare = async (_type, _options, dryRun) => { if (state.stopped || dryRun) return; changed(); await ensure(); };
    source.makeFirst(nativeEvents.GENERATION_AFTER_COMMANDS, prepare);
    state.stops.push(() => source.removeListener(nativeEvents.GENERATION_AFTER_COMMANDS, prepare));
  }
  void ensure();
  return api;
}

export function stop() {
  lifecycle++;
  if (successor) { successor.stop(); return; }
  if (!running) return;
  const { state, api, win } = running;
  running = null;
  state.stopped = true;
  state.generation++;
  state.cancelReady?.();
  for (const dispose of state.stops) { try { dispose(); } catch {} }
  try { state.frame?.contentWindow?.ReaderController?.dispose(); } catch {}
  state.frame?.remove();
  state.letters.clear();
  if (win.ReaderCore === api) delete win.ReaderCore;
}
