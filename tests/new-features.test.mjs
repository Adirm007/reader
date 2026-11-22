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

  const secondaryMacroEntry = {
    comment: '次核心条目',
    content: '{{setvar::系统核心::测试次核心}}{{setvar::系统名::观测者}}{{setvar::fp定义::测试能量}}\n你是{{getvar::系统名}}，核心是{{getvar::系统核心}}，消费{{getvar::fp定义}}。',
  };
  const silentEjsEntry = {
    comment: '莉莉丝核心',
    content: '<% setLocalVar("系统核心", "莉莉丝"); setLocalVar("系统名", "莉莉丝"); %>莉莉丝正文',
  };
  const payload = {
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
  cm.processLoadedWorldInfo({ globalLore: [wokenEjsEntry] }, win);
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

test('CoreManager supports heavy workshop cores: True King dynamic payload (V2 & RC16), Eyon 系统核心说明, null核心 toastr isolation, and global worldbooks', async () => {
  const payloadContent = [
    '<荆棘冠冕>',
    '姬月与<user>共同持有{{getvar::系统名}}（{{getvar::系统核心}}）。',
    '</荆棘冠冕>',
    '',
    '{{setvar::系统名::荆棘冠冕}}',
    '{{setvar::系统核心名::冠冕之灵}}',
    '{{setvar::系统核心::姬月&叶莲娜}}',
    '{{setvar::fp定义::弥赛亚之力}}',
    '{{setvar::复活机制::<复活机制>姬月守护{{user}}</复活机制>}}',
  ].join('\n');
  const origPayload = {
    schemaVersion: 2,
    status: 'ready',
    producer: 'true-king-composition-v2',
    checksum: 'sha256-test',
    content: payloadContent,
  };
  const origSnapshot = JSON.stringify(origPayload);

  const tkRc16Entry = {
    comment: '[DLC][命定核心][真王核心v2]真王核心组合载荷',
    disable: false,
    content: `<%_ {
const _tkv2Payload = getvar('true_king_v2.prompt_payload', { scope: 'local' });
let _tkv2Content = '';
const _tkv2HasPayload = _tkv2Payload?.schemaVersion === 2;
if (_tkv2HasPayload) {
  if (_tkv2Payload.status !== 'ready') throw new Error('not ready');
  if (_tkv2Payload.producer !== 'true-king-composition-v2') throw new Error('bad producer');
  if (typeof _tkv2Payload.content !== 'string' || !_tkv2Payload.content.includes('<荆棘冠冕>') || !_tkv2Payload.content.includes('</荆棘冠冕>')) throw new Error('bad wrap');
  _tkv2Content = _tkv2Payload.content;
}
_%><%- _tkv2Content %><% } %>`,
  };

  const eyonLikeEntry = {
    comment: '[DLC][命定系统]伊雍核心(夜见哉川)',
    disable: false,
    content: [
      '<虚嗣王权>',
      '<%_ { const _x = getChatMessage(-1, "user"); _%>问候:<%- _x %><%_ } _%>',
      '</虚嗣王权>',
      '{{setvar::系统名::虚嗣王权}}',
      '{{setvar::系统核心名::圣卷见证者}}',
      '{{setvar::系统核心说明::(伊雍历史溯源机制)}}',
      '{{setvar::系统核心::伊雍}}',
      '{{setvar::复活机制::<复活机制>{{user}}复活</复活机制>}}',
    ].join('\n'),
  };

  const nullEntry = {
    comment: '命定系统-null核心(byH)',
    disable: false,
    content: [
      '{{setvar::系统核心::null核心}}',
      '<%_ { if (getvar("系统核心") === "null核心") { setMessageVar("stat_data.命运点数", 0); toastr.info("吃掉了FP"); } } _%>',
    ].join('\n'),
  };

  const stCtx = {
    chat: [{ is_user: true, mes: '普通对话' }],
    chatMetadata: { variables: { true_king_v2: { prompt_payload: origPayload } } },
    saveMetadata() {},
  };
  const { win } = loadModule(coreManagerSrc, {
    SillyTavern: { getContext: () => stCtx },
    TavernHelper: {
      getCharWorldbookNames: async () => ({ primary: '命定之诗', additional: [] }),
      getChatWorldbookName: async () => '',
      getGlobalWorldbookNames: async () => ['全局真王', '全局伊雍'],
      getWorldbook: async (name) => {
        if (name === '命定之诗') return [{ name: '读者核心', enabled: true, content: '/* DREAM_WORLDBOOK reader-core */\n<% setLocalVar("系统核心", "九十九夜梦"); %>' }];
        if (name === '全局真王') return [tkRc16Entry];
        if (name === '全局伊雍') return [eyonLikeEntry];
        return [];
      },
    },
  });
  const cm = win.ReaderCoreManager;

  // 1. scanEnabledCores discovers Global Worldbooks too
  const scanned = await cm.scanEnabledCores(win);
  assert.deepEqual(Array.from(scanned, (c) => c.key), ['九十九夜梦', '真王核心', '伊雍']);
  assert.equal(scanned[1].isDynamicPayload, true);
  assert.equal(scanned[2].sharedMap['系统核心说明'], '(伊雍历史溯源机制)');

  // 2. True King secondary-scoped renders via real EJS without TDZ, strips shared macros, keeps payload unmutated
  const tkCopy = { ...tkRc16Entry };
  const tkRes = cm.transformWorldbookEntry(tkCopy, { enabled: true, primary: '九十九夜梦', activeCores: ['九十九夜梦', '真王核心'], cores: {} }, '');
  assert.equal(tkRes.mode, 'secondary-scoped');
  const tkOut = await ejs.render(tkCopy.content.replace(/\{\{user\}\}|<user>/gi, 'Alice "Hero"'), {
    getvar: (k) => (k === 'true_king_v2.prompt_payload' ? origPayload : ''),
    getLocalVar: () => '',
    setLocalVar: () => '',
    setvar: () => '',
  }, { async: true });
  assert.match(tkOut, /<荆棘冠冕>/);
  assert.match(tkOut, /共同持有荆棘冠冕（姬月&叶莲娜）/);
  assert.doesNotMatch(tkOut, /\{\{setvar::系统核心::/);
  assert.equal(JSON.stringify(origPayload), origSnapshot, 'original true_king_v2.prompt_payload must never be mutated');

  // 3. True King primary-silent keeps live shared setvars and drops body
  const tkSilent = { ...tkRc16Entry };
  cm.transformWorldbookEntry(tkSilent, {
    enabled: true,
    primary: '真王核心',
    activeCores: ['真王核心', '九十九夜梦'],
    cores: { 真王核心: { silent: true, wakeKeywords: ['姬月'] } },
  }, '普通对话');
  const tkSilentOut = await ejs.render(tkSilent.content, {
    getvar: (k) => (k === 'true_king_v2.prompt_payload' ? origPayload : ''),
  }, { async: true });
  assert.match(tkSilentOut, /\{\{setvar::系统核心::姬月&叶莲娜\}\}/);
  assert.match(tkSilentOut, /荆棘冠冕当前处于静默观察状态/);
  assert.doesNotMatch(tkSilentOut, /共同持有/);

  // 4. Eyon secondary-scoped strips 系统核心说明 and renders cleanly via real EJS even after <user> quote substitution
  const eyonCopy = { ...eyonLikeEntry };
  cm.transformWorldbookEntry(eyonCopy, { enabled: true, primary: '九十九夜梦', activeCores: ['九十九夜梦', '伊雍'], cores: {} }, '');
  assert.doesNotMatch(eyonCopy.content, /\{\{setvar::系统核心说明::/);
  const eyonOut = await ejs.render(eyonCopy.content.replace(/\{\{user\}\}|<user>/gi, 'Alice "Q"'), {
    getChatMessage: () => '你好',
    getvar: () => '',
    getLocalVar: () => '',
    setLocalVar: () => '',
    setvar: () => '',
  }, { async: true });
  assert.match(eyonOut, /问候:你好/);

  // 5. null核心 secondary blocks BOTH FP wipe and bogus toastr.info
  const nullCopy = { ...nullEntry };
  cm.transformWorldbookEntry(nullCopy, { enabled: true, primary: '九十九夜梦', activeCores: ['九十九夜梦', 'null核心'], cores: {} }, '');
  let fpWiped = false;
  let toastFired = false;
  await ejs.render(nullCopy.content, {
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
