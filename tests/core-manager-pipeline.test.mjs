// Multi-core management against the host pipeline it runs in, replayed in the verified order
// (SillyTavern 1.19.0 world-info.js / script.js, ST-Prompt-Template 1.17.9 handler.ts, evaluate.ts, worldinfo.ts):
//   WORLDINFO_ENTRIES_LOADED: core manager (makeFirst) -> Prompt-Template decorators (@@if, @@private, @@activate)
//   -> SillyTavern macro pass per activated entry, entries joined into one prompt slot per (position, depth, role)
//   -> Prompt-Template renders each slot as ONE async EJS template; any error leaves the whole slot raw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ejs from 'ejs';

const coreManagerSrc = await readFile(new URL('../source/core-manager.js', import.meta.url), 'utf8');
const HOOK_KEY = '__dreamCoreManagerWorldInfoHook';
// evalTemplate defaults in ST-Prompt-Template (src/function/ejs.ts).
const PT_OPTIONS = { async: true, outputFunctionName: 'print', _with: true, localsName: 'locals', client: true };
const PT_DECORATORS = new Set(['@@activate', '@@dont_activate', '@@message_formatting', '@@generate_before',
  '@@generate_after', '@@render_before', '@@render_after', '@@dont_preload', '@@preload', '@@only_preload',
  '@@initial_variables', '@@always_enabled', '@@private', '@@if', '@@iframe', '@@preprocessing']);
const SPECIAL = ['@@generate_before', '@@generate_after', '@@render_before', '@@render_after', '@@only_preload', '@@initial_variables'];
const BUCKETS = ['characterLore', 'globalLore', 'personaLore', 'chatLore'];

function readPath(object, path) {
  if (object && Object.prototype.hasOwnProperty.call(object, path)) return object[path];
  return String(path).split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function parseDecorators(content) {
  if (!content.startsWith('@@')) return [[], content];
  const lines = content.split('\n');
  const decorators = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (!line.startsWith('@@') || line.startsWith('@@@')) break;
    if (PT_DECORATORS.has(line.split(' ')[0])) decorators.push(line);
  }
  return [decorators, lines.slice(i).join('\n')];
}

function createHost({ variables = {}, chat = [{ is_user: true, mes: '继续冒险。' }], withEvents = false } = {}) {
  const errors = [];
  const toasts = [];
  const listeners = [];
  let saves = 0;
  const stCtx = {
    chat,
    chatMetadata: { variables },
    saveMetadata() { saves++; },
    getCurrentChatId: () => 'chat-1',
    ...(withEvents ? {
      eventTypes: { WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded' },
      eventSource: { makeFirst(name, fn) { listeners.push({ name, fn }); } },
    } : {}),
  };
  const win = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    SillyTavern: { getContext: () => stCtx },
    toastr: { warning: (message) => toasts.push(message) },
  };
  win.window = win;
  win.parent = win;
  const quietConsole = { ...console, error: (...args) => errors.push(args), warn: (...args) => errors.push(args) };
  vm.runInContext(coreManagerSrc, vm.createContext({ window: win, globalThis: win, console: quietConsole }));
  return { cm: win.ReaderCoreManager, win, stCtx, errors, toasts, listeners, saves: () => saves };
}

function setConfig(host, config) {
  host.stCtx.chatMetadata.variables.dream_core_manager = JSON.stringify({ version: 1, enabled: true, ...config });
}

// ST-Prompt-Template handleWorldInfoLoaded, which runs after the core manager's makeFirst hook.
async function promptTemplateLoaded(data, books, env) {
  const activated = [];
  for (const type of BUCKETS) {
    const list = data[type] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      const [decorators, clean] = parseDecorators(entry.content);
      const names = decorators.map((line) => line.split(' ')[0]);
      if (names.some((name) => SPECIAL.includes(name))) { list.splice(i, 1); continue; }
      const condition = names.indexOf('@@if');
      if (!entry.disable && condition >= 0) {
        const expr = decorators[condition].slice(decorators[condition].indexOf(' ') + 1);
        if ((await ejs.render(`<%- !!(${expr}) %>`, env, PT_OPTIONS)) === 'false') { list.splice(i, 1); continue; }
      }
      if (!entry.disable && names.includes('@@private')) {
        list[i] = { ...entry, content: `${decorators.join('\n')}\n<% await (async()=>{%>${clean}<%})(); %>` };
      }
      if (names.includes('@@activate') && !names.includes('@@dont_activate')) {
        // activateWorldInfo re-reads the entry from its book: the raw, decorator-stripped content comes back.
        const raw = books[entry.world].find((e) => e.uid === entry.uid);
        activated.push({ ...structuredClone(raw), content: parseDecorators(raw.content)[1], world: entry.world,
          disable: false, constant: true, ignoreBudget: true });
      }
    }
  }
  for (const entry of activated) {
    let position = 'chatLore';
    for (const type of BUCKETS) {
      const list = data[type] || [];
      const index = list.findIndex((e) => e.world === entry.world && e.uid === entry.uid);
      if (index > -1) { list.splice(index, 1); position = type; }
    }
    (data[position] ||= []).push(entry);
  }
}

// SillyTavern: decorator lines stripped, disabled entries skipped, macros run in activation order
// (setvar writes the chat variable and leaves nothing), then one prompt slot per (position, depth, role).
function stMergeSlots(cm, data, macros) {
  const slots = new Map();
  for (const type of ['chatLore', 'personaLore', 'globalLore', 'characterLore']) {
    for (const entry of data[type] || []) {
      if (entry.disable) continue;
      let text = parseDecorators(entry.content)[1];
      let out = '';
      let cursor = 0;
      for (const sv of cm.extractSetvars(text)) {
        out += text.slice(cursor, sv.start);
        macros[sv.name] = sv.value;
        cursor = sv.end;
      }
      text = (out + text.slice(cursor)).replace(/\{\{getvar::([^:}]+)\}\}/gi, (_, key) => macros[key.trim()] ?? '');
      if (!text) continue;
      const key = `${entry.position ?? 4}:${entry.depth ?? 4}:${entry.role ?? 0}`;
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push(text);
    }
  }
  return new Map([...slots].map(([key, parts]) => [key, parts.join('\n')]));
}

function promptEnv(local, userText = '') {
  return {
    getvar: (key, options = {}) => readPath(local, key) ?? options.defaults,
    getLocalVar: (key, options = {}) => readPath(local, key) ?? options.defaults,
    setvar: (key, value) => { local[key] = value; return value; },
    setLocalVar: (key, value) => { local[key] = value; return value; },
    getMessageVar: () => undefined,
    getChatMessage: () => userText,
  };
}

async function renderSlot(text, env) {
  try {
    return await ejs.render(text, env, PT_OPTIONS);
  } catch {
    return text;
  }
}

async function generate(host, lore, { books = {}, userText = host.stCtx.chat.at(-1)?.mes || '' } = {}) {
  const data = { globalLore: [], characterLore: [], chatLore: [], personaLore: [] };
  for (const entry of lore) data[entry.bucket || 'characterLore'].push(structuredClone(entry));
  const results = host.cm.processLoadedWorldInfo(data, host.win);
  const local = host.stCtx.chatMetadata.variables;
  const env = promptEnv(local, userText);
  await promptTemplateLoaded(data, books, env);
  const slots = stMergeSlots(host.cm, data, local);
  const previous = globalThis[HOOK_KEY];
  globalThis[HOOK_KEY] = host.win[HOOK_KEY];
  try {
    const rendered = new Map();
    for (const [key, text] of slots) rendered.set(key, await renderSlot(text, env));
    return { data, results, slots, rendered, depth1: rendered.get('4:1:0') ?? '' };
  } finally {
    if (previous === undefined) delete globalThis[HOOK_KEY];
    else globalThis[HOOK_KEY] = previous;
  }
}

const at = (uid, comment, content, extra = {}) => ({ uid, world: '角色主书', comment, position: 4, depth: 1, role: 0, disable: false, content, ...extra });
const readerCore = () => at(1, '读者核心', '<%_ /* DREAM_WORLDBOOK reader-core */ _%>\n<%_ { _%>【读者正文】<%_ } _%>');
const hybridCore = () => at(2, '命定系统-混合核', [
  '<混合核>',
  '<%_ { const seen = String(getChatMessage(-1, "user") || ""); _%>混合核看见：<%- seen %><%_ } _%>',
  '</混合核>',
  '{{setvar::系统核心::混合核}}{{setvar::系统名::混合系统}}{{setvar::fp定义::混合能量}}',
].join('\n'));
const PAYLOAD_KEY = 'payload:dyn_core.prompt_payload';
const loaderBody = [
  '<%_ {',
  "const _p = getvar('dyn_core.prompt_payload', { scope: 'local' });",
  "let _c = '';",
  'if (_p?.schemaVersion === 2) {',
  "  print('载荷半截输出');",
  "  if (_p.status !== 'ready') throw new Error('载荷未就绪：' + (_p.error || _p.status));",
  '  _c = _p.content;',
  '}',
  '_%><%- _c %><% } %>',
].join('\n');
const payloadLoader = () => at(3, '[DLC][命定核心]测试组合载荷', loaderBody);
// Same loader shape, but neither its name nor its size passes the thin-loader heuristics.
const opaqueLoader = () => at(3, '组合装载器', `${loaderBody}\n<%# ${'说明'.repeat(2600)} %>`);
const readyPayload = { schemaVersion: 2, status: 'ready', content: '<载荷核>载荷正文</载荷核>\n{{setvar::系统名::载荷系统}}{{setvar::系统核心::载荷核}}' };
const failedPayload = { schemaVersion: 2, status: 'error', content: '', error: '拼装失败' };
const dlcCore = () => at(4, '命定系统-星砂核心', '<星砂>\n<%_ { _%>星砂正文<%_ } _%>\n</星砂>\n{{setvar::系统核心::星砂}}{{setvar::系统名::星砂仪}}', { world: '星砂DLC' });
const dlcCompanion = () => at(5, '星砂-流程', '<%_ { const state = getMessageVar("stat_data.星砂"); _%>流程：<%- state.阶段 %><%_ } _%>', { world: '星砂DLC' });

test('one throwing core no longer leaves its whole merged depth-1 slot as raw EJS', async () => {
  const lore = [readerCore(), hybridCore(), payloadLoader(), dlcCore(), dlcCompanion()];

  // The host behaviour itself: without management a single throw keeps the entire slot unrendered.
  const plain = createHost({ variables: { dyn_core: { prompt_payload: failedPayload } } });
  const raw = await generate(plain, lore);
  assert.match(raw.depth1, /<%/, 'Prompt-Template leaves the merged slot raw when one entry throws');

  const host = createHost({ variables: { dyn_core: { prompt_payload: failedPayload } } });
  setConfig(host, {
    primary: '九十九夜梦',
    activeCores: ['九十九夜梦', '混合核', PAYLOAD_KEY, '星砂'],
    cores: { 星砂: { name: '星砂', dedicatedBook: '星砂DLC', companionEntries: ['星砂-流程'] } },
  });
  const out = await generate(host, lore);
  assert.doesNotMatch(out.depth1, /<%|%>/);
  assert.match(out.depth1, /【读者正文】/);
  assert.match(out.depth1, /混合核看见：继续冒险。/);
  assert.match(out.depth1, /星砂正文/);
  assert.doesNotMatch(out.depth1, /载荷半截输出/, 'output printed before the throw is dropped with the failing entry');
  assert.doesNotMatch(out.depth1, /流程：/, 'a throwing companion entry is isolated as well');
  assert.deepEqual(Array.from(out.results.filter((r) => r.mode === 'companion-guarded'), (r) => r.entryName), ['星砂-流程']);
  const reported = Array.from(host.win[HOOK_KEY].errors, (e) => e.core).sort();
  assert.deepEqual(reported, [PAYLOAD_KEY, '星砂'].sort());
  assert.equal(host.toasts.length, 2);
  assert.ok(host.errors.some((args) => String(args[0]).includes('已单独跳过')), 'the original error stays in the console');

  // The same error in the next generation is logged again but not toasted again.
  await generate(host, lore);
  assert.equal(host.toasts.length, 2);
  assert.equal(host.win[HOOK_KEY].errors.length, 4);

  // A ready payload renders as before, scoped as a secondary core.
  host.stCtx.chatMetadata.variables.dyn_core.prompt_payload = readyPayload;
  const ready = await generate(host, lore);
  assert.match(ready.depth1, /<载荷核>载荷正文<\/载荷核>/);
  assert.doesNotMatch(ready.depth1, /\{\{setvar::/);
});

test('a guarded primary keeps its scope rules: self-scoped or @@private entries are guarded, top-level bindings are left alone', async () => {
  const host = createHost({ variables: { dyn_core: { prompt_payload: failedPayload } } });
  setConfig(host, { primary: PAYLOAD_KEY, activeCores: [PAYLOAD_KEY, '九十九夜梦', '混合核'], cores: {} });
  const out = await generate(host, [readerCore(), payloadLoader(), hybridCore()]);
  assert.ok(out.results.some((r) => r.core === PAYLOAD_KEY && r.mode === 'primary-active' && r.guarded));
  assert.match(out.depth1, /【读者正文】/);
  assert.match(out.depth1, /混合核看见：/);
  assert.doesNotMatch(out.depth1, /<%/);

  // A top-level const may be read by a later entry of the same slot, so that primary is not put in a block.
  const shared = '{{setvar::系统核心::共享核}}<% const sharedTitle = "共享标题"; %><%- sharedTitle %>';
  const later = at(9, '同槽条目', '<%- typeof sharedTitle === "string" ? sharedTitle + "可见" : "不可见" %>');
  const scopeHost = createHost();
  setConfig(scopeHost, { primary: '共享核', activeCores: ['共享核', '九十九夜梦'], cores: {} });
  const scoped = await generate(scopeHost, [at(8, '命定系统-共享核', shared), later]);
  assert.ok(scoped.results.every((r) => !r.guarded));
  assert.match(scoped.depth1, /共享标题可见/);
  assert.equal(scopeHost.cm.isScopeSafeEjs('<% const t = 1; %>'), false);
  assert.equal(scopeHost.cm.isScopeSafeEjs(loaderBody), true);

  // @@private already gives the entry a function scope (an async IIFE added after this hook), so it is guarded.
  const privateCore = at(10, '命定系统-私有核', [
    '@@private',
    '{{setvar::系统核心::私有核}}<% const v = await Promise.resolve(getvar("私有核数据")); print("私有核半截"); if (!v) throw new Error("私有核未就绪"); %>私有核正文',
  ].join('\n'));
  const privateHost = createHost();
  setConfig(privateHost, { primary: '私有核', activeCores: ['私有核', '九十九夜梦'], cores: {} });
  const priv = await generate(privateHost, [readerCore(), privateCore, hybridCore()]);
  assert.ok(priv.results.some((r) => r.core === '私有核' && r.guarded));
  assert.match(priv.depth1, /【读者正文】/);
  assert.doesNotMatch(priv.depth1, /私有核半截|私有核正文|<%/);
  privateHost.stCtx.chatMetadata.variables.私有核数据 = '有';
  assert.match((await generate(privateHost, [readerCore(), privateCore])).depth1, /私有核半截私有核正文/);
});

test('@@activate on a managed entry no longer swaps the raw entry back after scoping or silent folding', async () => {
  const activated = at(6, '命定系统-激活核', '@@activate\n{{setvar::系统核心::激活核}}{{setvar::系统名::激活系统}}激活核正文（{{getvar::系统名}}）');
  const books = { 角色主书: [readerCore(), activated] };

  // What the pit was: a rewrite that keeps @@activate is replaced by Prompt-Template with the raw book copy.
  const kept = { globalLore: [], characterLore: [{ ...activated, content: '@@activate\n激活核正文（激活系统）' }], chatLore: [], personaLore: [] };
  await promptTemplateLoaded(kept, books, promptEnv({}));
  assert.match(kept.characterLore[0].content, /\{\{setvar::系统名::激活系统\}\}/);

  const host = createHost({ variables: { 系统名: '读者' } });
  setConfig(host, { primary: '九十九夜梦', activeCores: ['九十九夜梦', '激活核'], cores: {} });
  const out = await generate(host, [readerCore(), activated], { books });
  const entry = out.data.characterLore.find((e) => e.uid === 6);
  assert.equal(entry.content, '激活核正文（激活系统）');
  assert.equal(entry.constant, true);
  assert.equal(entry.ignoreBudget, true);
  assert.equal(host.stCtx.chatMetadata.variables.系统名, '读者', 'the secondary setvar never reaches the chat variable');
  assert.match(out.depth1, /激活核正文（激活系统）/);

  // Silent primary folding survives too.
  const silentHost = createHost();
  setConfig(silentHost, { primary: '激活核', activeCores: ['激活核', '九十九夜梦'], cores: { 激活核: { silent: true, wakeKeywords: ['唤醒激活核'] } } });
  const silent = await generate(silentHost, [readerCore(), activated], { books });
  assert.match(silent.depth1, /当前处于静默观察状态/);
  assert.doesNotMatch(silent.depth1, /激活核正文/);
  assert.equal(silentHost.stCtx.chatMetadata.variables.系统名, '激活系统', 'the silent primary still owns the shared macros');
});

test('a configured payload core is recognised before its runtime has written a usable payload', async () => {
  const host = createHost();
  const config = { primary: PAYLOAD_KEY, activeCores: [PAYLOAD_KEY, '九十九夜梦', '混合核'], cores: {} };
  setConfig(host, config);
  const loader = opaqueLoader();
  assert.equal(host.cm.detectCoreFromEntry(loader, '角色主书', host.win), null, 'heuristics alone cannot place this loader on a fresh chat');
  assert.equal(host.cm.detectManagedCore(loader, host.win, host.cm.normalizeConfig(config)).key, PAYLOAD_KEY);

  const out = await generate(host, [readerCore(), loader, hybridCore()]);
  assert.equal(host.win[HOOK_KEY].round.stale, false, 'the payload primary is not mistaken for a missing one');
  assert.equal(host.win[HOOK_KEY].round.primaryLoaded, true);
  assert.equal(host.stCtx.chatMetadata.variables.系统名, undefined, 'the secondary core does not take over the shared macros');
  assert.match(out.depth1, /混合核看见：/);

  // The same opaque loader as a failing secondary is managed and isolated.
  const secondary = createHost({ variables: { dyn_core: { prompt_payload: failedPayload } } });
  setConfig(secondary, { primary: '九十九夜梦', activeCores: ['九十九夜梦', PAYLOAD_KEY, '混合核'], cores: {} });
  const isolated = await generate(secondary, [readerCore(), opaqueLoader(), hybridCore()]);
  assert.ok(isolated.results.some((r) => r.core === PAYLOAD_KEY && r.mode === 'secondary-scoped'));
  assert.match(isolated.depth1, /【读者正文】/);
  assert.doesNotMatch(isolated.depth1, /<%|载荷半截输出/);
});

test('each generation publishes what it loaded in memory only: live external primary macros, stale state, cleared when unmanaged', async () => {
  const external = at(11, '外挂核', '{{setvar::系统核心::外挂核}}{{setvar::系统名::新名字}}外挂核正文', { world: '外挂全局书', bucket: 'globalLore' });
  const host = createHost({ withEvents: true });
  setConfig(host, {
    primary: '外挂核',
    activeCores: ['外挂核', '九十九夜梦', '混合核'],
    cores: {},
    primaryMacros: { 系统核心: '外挂核', 系统名: '旧名字' },
  });
  const saved = host.stCtx.chatMetadata.variables.dream_core_manager;
  await generate(host, [readerCore(), external, hybridCore()]);
  assert.deepEqual(JSON.parse(JSON.stringify(host.win[HOOK_KEY].round)), {
    chatId: 'chat-1',
    primary: '外挂核',
    primaryLoaded: true,
    stale: false,
    primaryMacros: { 系统核心: '外挂核', 系统名: '新名字' },
  });
  assert.equal(host.stCtx.chatMetadata.variables.dream_core_manager, saved, 'the saved configuration is not rewritten');
  assert.equal(host.saves(), 0, 'nothing is saved');

  // The external primary is gone this round: the stale configuration is bypassed and says so.
  const stale = await generate(host, [readerCore(), hybridCore()]);
  assert.equal(stale.results.length, 0);
  assert.equal(host.win[HOOK_KEY].round.stale, true);
  assert.equal(host.win[HOOK_KEY].round.primaryLoaded, false);

  // The registered listener replaces or clears the state on every load.
  const [{ fn: listener }] = host.listeners;
  host.cm.uninstallWorldInfoHook(host.win);
  assert.equal(host.win[HOOK_KEY].round, null);
  host.win[HOOK_KEY].round = { primary: '旧状态' };
  listener({ characterLore: [readerCore()] });
  assert.equal(host.win[HOOK_KEY].round, null, 'a load without a running manager leaves no state behind');
  host.cm.installWorldInfoHook(host.win);
  assert.equal(host.listeners.length, 1, 'reinstalling does not register a second listener');
  listener({ globalLore: [structuredClone(external)], characterLore: [readerCore()] });
  assert.equal(host.win[HOOK_KEY].round.primaryMacros.系统名, '新名字');

  host.stCtx.chatMetadata.variables.dream_core_manager = JSON.stringify({ enabled: false });
  listener({ characterLore: [readerCore()] });
  assert.equal(host.win[HOOK_KEY].round, null);
});
