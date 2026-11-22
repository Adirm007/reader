import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ejs from 'ejs';

const coreManagerSrc = await readFile(new URL('../source/core-manager.js', import.meta.url), 'utf8');
const extraSettingsSrc = await readFile(new URL('../source/extra-settings.js', import.meta.url), 'utf8');
const legacySrc = await readFile(new URL('../source/legacy-reader.js', import.meta.url), 'utf8');

function loadModule(src, extraGlobals = {}) {
  const events = [];
  const win = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent(ev) { events.push(ev); },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    ...extraGlobals,
  };
  win.window = win;
  win.parent = win;
  const ctx = vm.createContext({
    window: win,
    globalThis: win,
    console,
    Date,
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Function,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(src, ctx);
  return { win, events };
}

test('CoreManager extractSetvars handles nested double-brace macros', () => {
  const { win } = loadModule(coreManagerSrc);
  const cm = win.ReaderCoreManager;
  const text = '{{setvar::系统核心::测试核心}}{{setvar::系统名::测试系统}}{{setvar::复活机制::让{{user}}在基地复活}}正文{{getvar::系统名}}';
  const found = cm.extractSetvars(text);
  assert.equal(found.length, 3);
  assert.equal(found[0].name, '系统核心');
  assert.equal(found[0].value, '测试核心');
  assert.equal(found[2].name, '复活机制');
  assert.equal(found[2].value, '让{{user}}在基地复活');
});

test('CoreManager processLoadedWorldInfo intercepts secondary macro cores, scopes them locally, and supports per-core silent + wake keywords', () => {
  const variables = {
    dream_core_manager: JSON.stringify({
      enabled: true,
      primary: '九十九夜梦',
      activeCores: ['九十九夜梦', '测试次核心', '莉莉丝'],
      cores: {
        九十九夜梦: { silent: false, wakeKeywords: ['夜梦'] },
        测试次核心: { silent: false, wakeKeywords: ['唤醒测试'] },
        莉莉丝: { silent: true, wakeKeywords: ['莉莉丝出来'] },
      },
    }),
  };
  const chat = [{ is_user: true, mes: '普通冒险消息，没有唤醒词。' }];
  const stCtx = {
    chat,
    chatMetadata: { variables },
    saveMetadata() {},
  };
  const { win } = loadModule(coreManagerSrc, {
    SillyTavern: { getContext: () => stCtx },
  });
  const cm = win.ReaderCoreManager;

  const readerPrimaryEntry = {
    comment: '读者核心',
    content: '/* DREAM_WORLDBOOK reader-core */\n<% setLocalVar("系统核心", "九十九夜梦"); %>',
  };
  const secondaryMacroEntry = {
    comment: '次核心条目',
    content: '{{setvar::系统核心::测试次核心}}{{setvar::系统名::观测者}}{{setvar::fp定义::测试能量}}\n你是{{getvar::系统名}}，核心是{{getvar::系统核心}}，消费{{getvar::fp定义}}。',
  };
  const silentEjsEntry = {
    comment: '莉莉丝核心',
    content: '<% setLocalVar("系统核心", "莉莉丝"); setLocalVar("系统名", "莉莉丝"); %>莉莉丝正文',
  };
  const payload = {
    characterLore: [readerPrimaryEntry],
    globalLore: [secondaryMacroEntry, silentEjsEntry],
  };

  cm.processLoadedWorldInfo(payload, win);
  assert.doesNotMatch(secondaryMacroEntry.content, /\{\{setvar::/, 'secondary core global setvars must be stripped');
  assert.doesNotMatch(secondaryMacroEntry.content, /\{\{getvar::系统名\}\}/, 'secondary core own getvars must resolve locally');
  assert.match(secondaryMacroEntry.content, /你是观测者，核心是测试次核心，消费测试能量。/);
  assert.equal(silentEjsEntry.content, '', 'silent secondary core with no wake keyword is silenced');

  // Now user includes wake keyword for 莉莉丝
  chat[0].mes = '喂，莉莉丝出来一下！';
  const wokenEjsEntry = {
    comment: '莉莉丝核心',
    content: '<% setLocalVar("系统核心", "莉莉丝"); setLocalVar("系统名", "莉莉丝"); %>莉莉丝正文',
  };
  cm.processLoadedWorldInfo({ characterLore: [readerPrimaryEntry], globalLore: [wokenEjsEntry] }, win);
  assert.match(wokenEjsEntry.content, /莉莉丝正文/, 'wake keyword temporarily activates silent core');
  assert.match(wokenEjsEntry.content, /_dmcOwn/, 'woken secondary EJS core gets local macro scope wrapper');
});

test('ExtraSettings supports mechanism/appearance/personality, migrates legacy ejs, and isolates errors without extra labels', () => {
  const { win } = loadModule(extraSettingsSrc);
  const es = win.ReaderExtraSettings;
  const list = es.normalizeList([
    { name: '低血量提醒', kind: 'ejs', content: '<% if (stat_data.hp < 10) { %>血量危急<% } %>', enabled: true, applyWhenSilent: true },
    { name: '', kind: 'appearance', content: '戴着无框眼镜', enabled: true, applyWhenSilent: false },
    { name: '口癖', kind: 'personality', content: '喜欢轻笑', enabled: true, applyWhenSilent: false },
    { name: '坏脚本', kind: 'mechanism', content: '<% nope() %>', enabled: true, applyWhenSilent: false },
  ]);
  assert.equal(list[0].kind, 'mechanism', 'legacy ejs kind migrates cleanly to mechanism');
  assert.equal(list[1].kind, 'appearance');
  assert.equal(list[1].name, '', 'optional blank title preserved');
  assert.equal(list[2].kind, 'personality');

  const rendered = es.renderItems(list, { stat_data: { hp: 5 } });
  assert.equal(rendered.errors.length, 1);
  assert.equal(rendered.mechanismText, '     【低血量提醒】: 血量危急');
  assert.equal(rendered.appearanceText, '戴着无框眼镜');
  assert.equal(rendered.personalityText, '口癖：喜欢轻笑');
  assert.doesNotMatch(rendered.text, /附加|补充/);

  const silentRendered = es.renderItems(list, { stat_data: { hp: 5 } }, { silent: true });
  assert.equal(silentRendered.mechanisms.length, 1);
  assert.equal(silentRendered.appearances.length, 0);
  assert.equal(silentRendered.personalities.length, 0);
});

test('legacy-reader confirms kuromaku through 3-stage warning on first save only and allows >10 banned books', () => {
  assert.match(legacySrc, /function confirmKuromakuSelection\(/, 'confirmKuromakuSelection must exist in legacy-reader.js');
  assert.match(legacySrc, /这并非必须体验的内容，前面没有美好和纯真，只有痛苦和后悔。若是真的对她感到好奇想全收集，更建议在人格解耦中令其以IF形式显现/);
  assert.match(legacySrc, /同伴几乎可以预见的会死，会出现无论多强都没办法阻止的惨剧，即使如此也要选择吗？/);
  assert.match(legacySrc, /您完全理解自己在做什么对吗？/);
  assert.match(legacySrc, /仍要选择/);
  assert.match(legacySrc, /放弃/);
  assert.match(legacySrc, /dream_kuromaku_confirmed/);

  // Verify unlimited banlist (no 10-book cap in banlist functions)
  const banRegion = legacySrc.slice(legacySrc.indexOf('function bsLoadBanList'), legacySrc.indexOf('function bsTune'));
  assert.ok(banRegion.length > 0, 'banlist functions must exist');
  assert.doesNotMatch(banRegion, /已达上限|list\.length\s*>=\s*10|slice\(0,\s*10\)|\/10/, '10-book banlist limit must be completely removed');
  assert.match(banRegion, /\\u5df2\\u7981 '\+banList\.length\+' \\u672c/);
});

test('CoreManager generically adapts dynamic payload cores, multi-entry dedicated DLC books, custom shared macros, FP-wipe cores, and global worldbooks with zero third-party hardcoding', async () => {
  // Ensure core-manager.js does not hardcode specific third-party core names
  for (const forbidden of ['真王', '荆棘冠冕', 'true_king', '伊雍', '虚嗣王权', '维拉', '银月贤者']) {
    assert.ok(!coreManagerSrc.includes(forbidden), `core-manager.js must remain generic and not hardcode ${forbidden}`);
  }

  const objPayloadContent = [
    '<测试冠冕>',
    '同伴与<user>共同持有{{getvar::系统名}}（{{getvar::系统核心}}）。',
    '</测试冠冕>',
    '',
    '{{setvar::系统名::测试冠冕}}',
    '{{setvar::系统核心名::冠冕灵}}',
    '{{setvar::系统核心::甲&乙}}',
    '{{setvar::fp定义::测试能量}}',
    '{{setvar::复活机制::<复活机制>重生{{user}}</复活机制>}}',
  ].join('\n');
  const origPayload = {
    schemaVersion: 2,
    status: 'ready',
    producer: 'generic-dynamic-composer',
    checksum: 'sha256-test',
    content: objPayloadContent,
  };
  const origSnapshot = JSON.stringify(origPayload);

  const dynObjEntry = {
    comment: '[DLC][命定核心]动态组合核心载荷',
    disable: false,
    content: `<%_ {
const _p = getvar('custom_dyn.prompt_payload', { scope: 'local' });
let _c = '';
if (_p?.schemaVersion === 2) {
  if (_p.status !== 'ready') throw new Error('not ready');
  if (typeof _p.content !== 'string' || !_p.content.includes('<测试冠冕>') || !_p.content.includes('</测试冠冕>')) throw new Error('bad wrap');
  _c = _p.content;
}
_%><%- _c %><% } %>`,
  };

  const dynRawStringEntry = {
    comment: '[DLC][命定核心]直出载荷核心',
    disable: false,
    content: `<%- getLocalVar('raw_dyn.prompt_text') || '' %>`,
  };

  const multiEntryCore = {
    comment: '命定系统-星月核心',
    disable: false,
    world: '独立多条目DLC',
    content: [
      '<星月仪>',
      '<%_ { const _x = getChatMessage(-1, "user"); setLocalVar("StarMoon.state", "ok"); _%>问候:<%- _x %><%_ } _%>',
      '</星月仪>',
      '{{setvar::系统名::星月仪}}',
      '{{setvar::系统核心名::星月贤者}}',
      '{{setvar::系统核心说明::(多条目DLC机制)}}',
      '{{setvar::系统核心::星月}}',
      '{{setvar::复活机制::<复活机制>{{user}}复活</复活机制>}}',
    ].join('\n'),
  };
  const multiCompanionGuide = {
    comment: '星月-性格与扮演指南',
    disable: false,
    world: '独立多条目DLC',
    key: ['星盘占卜'],
    content: '指南正文：参考{{getvar::系统名}}',
  };
  const multiCompanionRule = {
    comment: '时之门流程',
    disable: false,
    world: '独立多条目DLC',
    key: ['时之门'],
    content: '时之门正文',
  };
  const protectedAnchor = {
    comment: '历史锚点记录',
    disable: false,
    world: '独立多条目DLC',
    content: '<!-- history_anchor -->已锚定历史事件',
  };

  const fpWipeEntry = {
    comment: '命定系统-自定义无FP核心',
    disable: false,
    content: [
      '{{setvar::系统核心::无FP测试核}}',
      '<%_ { if (getvar("系统核心") === "无FP测试核") { setMessageVar("stat_data.命运点数", 0); toastr.info("清空FP"); } } _%>',
    ].join('\n'),
  };

  const stCtx = {
    chat: [{ is_user: true, mes: '普通对话' }],
    chatMetadata: {
      variables: {
        custom_dyn: { prompt_payload: origPayload },
        raw_dyn: { prompt_text: '<直出>{{getvar::系统名}}</直出>{{setvar::系统名::直出系统}}{{setvar::系统核心::直出核}}' },
      },
    },
    saveMetadata() {},
  };
  const { win } = loadModule(coreManagerSrc, {
    SillyTavern: { getContext: () => stCtx },
    TavernHelper: {
      getCharWorldbookNames: async () => ({ primary: '命定之诗', additional: ['独立多条目DLC'] }),
      getChatWorldbookName: async () => '',
      getGlobalWorldbookNames: async () => ['全局动态核A', '全局动态核B'],
      getWorldbook: async (name) => {
        if (name === '命定之诗') return [{ name: '读者核心', enabled: true, content: '/* DREAM_WORLDBOOK reader-core */\n<% setLocalVar("系统核心", "九十九夜梦"); %>' }];
        if (name === '独立多条目DLC') return [multiEntryCore, multiCompanionGuide, multiCompanionRule, protectedAnchor];
        if (name === '全局动态核A') return [dynObjEntry];
        if (name === '全局动态核B') return [dynRawStringEntry];
        return [];
      },
    },
  });
  const cm = win.ReaderCoreManager;

  // 1. scanEnabledCores discovers primary, additional, global books + dedicated multi-entry companion entries (protecting history anchors)
  const scanned = await cm.scanEnabledCores(win);
  assert.deepEqual(Array.from(scanned, (c) => c.key), [
    '九十九夜梦',
    '星月',
    'payload:custom_dyn.prompt_payload',
    'payload:raw_dyn.prompt_text',
  ]);
  const starMoon = scanned[1];
  assert.equal(starMoon.dedicatedBook, '独立多条目DLC');
  assert.deepEqual(Array.from(starMoon.companionEntries), ['星月-性格与扮演指南', '时之门流程']);
  assert.ok(starMoon.defaultWakeKeywords.includes('星盘占卜') && starMoon.defaultWakeKeywords.includes('时之门'));
  assert.equal(scanned[2].isDynamicPayload, true);
  assert.ok(scanned[2].defaultWakeKeywords.includes('甲') && scanned[2].defaultWakeKeywords.includes('乙'));
  assert.equal(scanned[3].isDynamicPayload, true);

  // 2. Dynamic object payload secondary-scoped renders cleanly via real EJS, strips shared setvars, keeps original object unmutated
  const dynCopy = { ...dynObjEntry };
  const dynRes = cm.transformWorldbookEntry(dynCopy, {
    enabled: true,
    primary: '九十九夜梦',
    activeCores: ['九十九夜梦', 'payload:custom_dyn.prompt_payload'],
    cores: {},
  }, '', win);
  assert.equal(dynRes.mode, 'secondary-scoped');
  const dynOut = await ejs.render(dynCopy.content.replace(/\{\{user\}\}|<user>/gi, 'Alice "Hero"'), {
    getvar: (k) => (k === 'custom_dyn.prompt_payload' ? origPayload : ''),
    getLocalVar: () => '',
    setLocalVar: () => '',
    setvar: () => '',
  }, { async: true });
  assert.match(dynOut, /<测试冠冕>/);
  assert.match(dynOut, /共同持有测试冠冕（甲&乙）/);
  assert.doesNotMatch(dynOut, /\{\{setvar::系统核心::/);
  assert.equal(JSON.stringify(origPayload), origSnapshot, 'original dynamic payload variable must never be mutated');

  // 3. Dynamic raw-string payload secondary-scoped renders cleanly via getLocalVar
  const rawCopy = { ...dynRawStringEntry };
  cm.transformWorldbookEntry(rawCopy, {
    enabled: true,
    primary: '九十九夜梦',
    activeCores: ['九十九夜梦', 'payload:raw_dyn.prompt_text'],
    cores: {},
  }, '', win);
  const rawOut = await ejs.render(rawCopy.content, {
    getvar: () => '',
    getLocalVar: (k) => (k === 'raw_dyn.prompt_text' ? stCtx.chatMetadata.variables.raw_dyn.prompt_text : ''),
    setLocalVar: () => '',
    setvar: () => '',
  }, { async: true });
  assert.equal(rawOut.trim(), '<直出>直出系统</直出>');

  // 4. Dynamic payload primary-silent keeps live shared setvars and drops body
  const dynSilent = { ...dynObjEntry };
  cm.transformWorldbookEntry(dynSilent, {
    enabled: true,
    primary: 'payload:custom_dyn.prompt_payload',
    activeCores: ['payload:custom_dyn.prompt_payload', '九十九夜梦'],
    cores: { 'payload:custom_dyn.prompt_payload': { silent: true, wakeKeywords: ['甲'] } },
  }, '普通对话', win);
  const dynSilentOut = await ejs.render(dynSilent.content, {
    getvar: (k) => (k === 'custom_dyn.prompt_payload' ? origPayload : ''),
  }, { async: true });
  assert.match(dynSilentOut, /\{\{setvar::系统核心::甲&乙\}\}/);
  assert.match(dynSilentOut, /测试冠冕当前处于静默观察状态/);
  assert.doesNotMatch(dynSilentOut, /共同持有/);

  // 5. Multi-entry dedicated DLC core silent mode silences companion entries too, while keeping history anchors; waking restores & scopes them
  stCtx.chatMetadata.variables.dream_core_manager = JSON.stringify({
    enabled: true,
    primary: '九十九夜梦',
    activeCores: ['九十九夜梦', '星月'],
    cores: {
      星月: {
        name: '星月',
        silent: true,
        wakeKeywords: Array.from(starMoon.defaultWakeKeywords),
        dedicatedBook: '独立多条目DLC',
        companionEntries: Array.from(starMoon.companionEntries),
      },
    },
  });
  const readerStub = {
    comment: '读者核心',
    disable: false,
    world: '命定之诗',
    content: '/* DREAM_WORLDBOOK reader-core */\n<% setLocalVar("系统核心", "九十九夜梦"); %>',
  };
  const silentLore = [readerStub, multiEntryCore, multiCompanionGuide, multiCompanionRule, protectedAnchor].map((e) => ({ ...e }));
  cm.processLoadedWorldInfo({ characterLore: silentLore }, win);
  assert.equal(silentLore[1].disable, true);
  assert.equal(silentLore[2].disable, true, 'companion guide silenced');
  assert.equal(silentLore[3].disable, true, 'companion rule silenced');
  assert.equal(silentLore[4].disable, false, 'history anchor protected');

  stCtx.chat[0].mes = '开启星盘占卜';
  const wokenLore = [readerStub, multiEntryCore, multiCompanionGuide, multiCompanionRule, protectedAnchor].map((e) => ({ ...e }));
  cm.processLoadedWorldInfo({ characterLore: wokenLore }, win);
  assert.equal(wokenLore[1].disable, false);
  assert.doesNotMatch(wokenLore[1].content, /\{\{setvar::系统核心说明::/);
  assert.equal(wokenLore[2].disable, false);
  assert.match(wokenLore[2].content, /参考星月仪/, 'companion entry gets secondary core ownMacros scoped');
  const localBag = {};
  const mainOut = await ejs.render(wokenLore[1].content.replace(/\{\{user\}\}|<user>/gi, 'Alice "Q"'), {
    getChatMessage: () => '开启星盘占卜',
    getvar: () => '',
    getLocalVar: (k) => localBag[k] || '',
    setLocalVar: (k, v) => { localBag[k] = v; },
    setvar: () => '',
  }, { async: true });
  assert.match(mainOut, /问候:开启星盘占卜/);
  assert.equal(localBag['StarMoon.state'], 'ok', 'non-shared core state writes pass through');

  // 6. Generic FP-zeroing core secondary blocks BOTH FP wipe and bogus toastr.info
  const fpCopy = { ...fpWipeEntry };
  cm.transformWorldbookEntry(fpCopy, { enabled: true, primary: '九十九夜梦', activeCores: ['九十九夜梦', '无FP测试核'], cores: {} }, '', win);
  let fpWiped = false;
  let toastFired = false;
  await ejs.render(fpCopy.content, {
    getvar: () => '九十九夜梦',
    getLocalVar: () => '',
    setLocalVar: () => '',
    setvar: () => '',
    setMessageVar: (k) => { if (k === 'stat_data.命运点数') fpWiped = true; },
    toastr: { info: () => { toastFired = true; } },
  }, { async: true });
  assert.equal(fpWiped, false);
  assert.equal(toastFired, false);
});

test('CoreManager review regressions: stale primary bypass, unmanaged core bypass, empty wakeKeywords, @@ decorator preservation, and secondary EJS macro substitution', async () => {
  const staleVars = {
    dream_core_manager: JSON.stringify({
      enabled: true,
      primary: '九十九夜梦',
      activeCores: ['九十九夜梦', '阿米娅核心'],
      cores: {
        阿米娅核心: { silent: true, wakeKeywords: [] },
      },
    }),
  };
  const stCtx = {
    chat: [{ is_user: true, mes: '阿米娅，打开源石终端' }],
    chatMetadata: { variables: staleVars },
    saveMetadata() {},
    substituteParams: (s) => String(s).replace(/\{\{user\}\}|<user>/gi, '旅人'),
  };
  const { win } = loadModule(coreManagerSrc, { SillyTavern: { getContext: () => stCtx } });
  const cm = win.ReaderCoreManager;

  // H1: primary Reader is disabled/absent, only Merlin is enabled -> bypass stale config completely
  const merlin = {
    comment: '梅林核心',
    disable: false,
    content: '{{setvar::系统核心::梅林核心}}{{setvar::系统名::梅林}}正文',
  };
  const staleRes = cm.processLoadedWorldInfo({ characterLore: [merlin] }, win);
  assert.equal(staleRes.length, 0);
  assert.match(merlin.content, /\{\{setvar::系统核心::梅林核心\}\}/, 'Merlin must keep shared setvars when stale primary is absent');

  // H1: even when primary Reader IS present, unmanaged core outside activeCores is left alone
  const readerStub = { comment: '读者核心', disable: false, content: '/* DREAM_WORLDBOOK reader-core */\n<% setLocalVar("系统核心", "九十九夜梦"); %>' };
  const merlin2 = { comment: '梅林核心', disable: false, content: '{{setvar::系统核心::梅林核心}}{{setvar::系统名::梅林}}正文' };
  const amiya = { comment: '阿米娅核心', disable: false, content: '{{setvar::系统核心::阿米娅核心}}{{setvar::系统名::阿米娅}}正文' };
  cm.processLoadedWorldInfo({ characterLore: [readerStub, merlin2, amiya] }, win);
  assert.match(merlin2.content, /\{\{setvar::系统核心::梅林核心\}\}/, 'unmanaged core must not be stripped');
  // M4: explicit wakeKeywords: [] must NOT fall back to default wake keywords
  assert.equal(amiya.disable, true, 'explicit empty wakeKeywords must stay silent');

  // Low: primary-silent preserves leading @@ decorators
  const decoEntry = {
    comment: '装饰核',
    disable: false,
    content: '@@activate\n@@if true\n{{setvar::系统核心::装饰核}}{{setvar::系统名::装饰}}正文',
  };
  cm.transformWorldbookEntry(decoEntry, {
    enabled: true,
    primary: '装饰核',
    activeCores: ['装饰核', '九十九夜梦'],
    cores: { 装饰核: { silent: true, wakeKeywords: ['唤醒'] } },
  }, '继续', win);
  assert.ok(decoEntry.content.startsWith('@@activate\n@@if true\n'), 'primary-silent must preserve leading @@ decorators');

  // Low: secondary EJS getvar returns substituted <user>/{{user}} when ST substituteParams is available
  const escEntry = {
    comment: '转义核',
    disable: false,
    content: '{{setvar::系统核心::转义核}}{{setvar::复活机制::保护{{user}}与<user>}}\n<%- getvar("复活机制") %>',
  };
  cm.transformWorldbookEntry(escEntry, {
    enabled: true,
    primary: '九十九夜梦',
    activeCores: ['九十九夜梦', '转义核'],
    cores: {},
  }, '', win);
  const prevST = globalThis.SillyTavern;
  globalThis.SillyTavern = { getContext: () => stCtx };
  try {
    const out = await ejs.render(escEntry.content, { getvar: () => '', getLocalVar: () => '', setLocalVar: () => '', setvar: () => '' }, { async: true });
    assert.equal(out.trim(), '保护旅人与旅人');
  } finally {
    if (prevST === undefined) delete globalThis.SillyTavern;
    else globalThis.SillyTavern = prevST;
  }
});

test('ExtraSettings compiler aligns with worldbook inline compiler on trailing semicolons, raw <%= output, getMessageVar, and whitespace slurp', () => {
  const { win } = loadModule(extraSettingsSrc);
  const es = win.ReaderExtraSettings;
  const list = es.normalizeList([
    { name: '分号', kind: 'mechanism', content: '人格=<%- persona; %>', enabled: true },
    { name: '原样', kind: 'mechanism', content: "<%= '<b>粗</b>' %>", enabled: true },
    { name: '读变量', kind: 'mechanism', content: "<%- getMessageVar('stat_data.命运点数') %>", enabled: true },
    { name: '吞空白', kind: 'mechanism', content: 'A   <%_ if (true) { _%>   B   <%_ } _%>   C', enabled: true },
  ]);
  const res = es.renderItems(list, { stat_data: { 命运点数: 77 }, persona: 'reader' });
  assert.equal(res.errors.length, 0);
  assert.equal(res.mechanisms[0].text, '人格=reader');
  assert.equal(res.mechanisms[1].text, '<b>粗</b>');
  assert.equal(res.mechanisms[2].text, '77');
  assert.equal(res.mechanisms[3].text, 'ABC');
});
