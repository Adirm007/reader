// The role-card runtime owns one controller. Message frames only display letters.
import { ASSETS } from 'reader:assets';

const FRAME_ID = 'reader-core-controller';
const BUTTON_ID = 'reader-core-launcher';
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
  // Retire the previous message-based floating-menu heartbeat before taking ownership.
  if (win.__dhb) { win.clearInterval(win.__dhb); win.__dhb = null; }
  doc.getElementById('dream-hb')?.remove();
  doc.getElementById(FRAME_ID)?.remove();
  doc.getElementById(BUTTON_ID)?.remove();
  const state = { stopped: false, generation: 0, key: chatKey(win), frame: null, ready: null, stops: [], letters: new Set(), cancelReady: null };
  let resolveReady = null;
  state.cancelReady = () => { resolveReady?.(null); resolveReady = null; };

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
    const settings = api.settings();
    for (const letter of state.letters) {
      if (!letter.frame?.isConnected) { state.letters.delete(letter); continue; }
      try { letter.refresh?.(settings); } catch { state.letters.delete(letter); }
    }
  }

  const button = doc.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = '✉ 读者';
  button.title = '打开九十九夜梦的菜单';
  button.style.cssText = 'position:fixed;right:16px;bottom:90px;z-index:9990;border:1px solid #c59d5f;border-radius:24px;padding:10px 16px;color:#eadbc0;background:#251b16;box-shadow:0 3px 16px #0005;font:14px/1.4 serif;cursor:pointer';
  button.addEventListener('click', () => { void api.open('lobby'); });
  doc.body.appendChild(button);

  const api = {
    runtimeVersion: ASSETS.version,
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
      letter.refresh?.(api.settings());
      return () => state.letters.delete(letter);
    },
    getLetters(messageId) {
      const live = [...state.letters].filter(letter => letter.frame?.isConnected);
      if (messageId == null) messageId = live.reduce((last, letter) => Math.max(last, Number(letter.messageId) || 0), -1);
      return live.filter(letter => String(letter.messageId) === String(messageId)).map(letter => ({ ...letter.read(), frame: letter.frame }));
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
  running = { state, api, win, button };
  win.ReaderCore = api;

  const changed = () => {
    if (state.stopped) return;
    const next = chatKey(win);
    if (next === state.key) { notifyLetters(); return; }
    disposeController();
    state.key = next;
    state.letters.clear();
    void ensure();
  };
  const onChatChanged = changed;
  const refresh = () => { changed(); notifyLetters(); };
  const events = globalThis.tavern_events || win.tavern_events || {};
  const listen = globalThis.eventOn || win.eventOn;
  if (typeof listen === 'function') {
    for (const name of ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'GENERATION_ENDED']) {
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
  const { state, api, win, button } = running;
  running = null;
  state.stopped = true;
  state.generation++;
  state.cancelReady?.();
  for (const dispose of state.stops) { try { dispose(); } catch {} }
  try { state.frame?.contentWindow?.ReaderController?.dispose(); } catch {}
  state.frame?.remove();
  state.letters.clear();
  button.remove();
  if (win.ReaderCore === api) delete win.ReaderCore;
}
