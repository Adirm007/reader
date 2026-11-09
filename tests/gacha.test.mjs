import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from '../tools/build_core.mjs';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const [gacha, transactions, legacy, body] = await Promise.all([read('source/reader-gacha.js'), read('source/reader-transactions.js'), read('source/legacy-reader.js'), read('source/legacy-body.html')]);

// The real editable feature function, ignoring braces inside JS strings.
function declaration(source, name) {
  const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  let index = source.indexOf('{', start), level = 0, quote = '';
  for (; index < source.length; index++) {
    const character = source[index];
    if (quote) { if (character === '\\') index++; else if (character === quote) quote = ''; continue; }
    if ('\'"`'.includes(character)) quote = character;
    else if (character === '{') level++;
    else if (character === '}' && --level === 0) return source.slice(start, index + 1);
  }
  throw Error('Unclosed feature function: ' + name);
}

function host(fp = 1000) {
  let context = {characterId: 1, chatId: 'a', chat: [{swipe_id: 0, extra: {}, data: {stat_data: {命运点数: fp, 主角: {背包: {旧物: {品质: '普通', 数量: 1}}}, unrelated: 'kept'}}}], chatMetadata: {variables: {other: 1}}};
  let commits = 0, saves = 0;
  context.getCurrentChatId = () => context.chatId;
  context.saveMetadata = async () => { saves++; };
  const helper = {
    getLastMessageId: () => context.chat.length - 1,
    getVariables: option => option.type === 'chat' ? context.chatMetadata.variables : context.chat[option.message_id].data,
    async updateVariablesWith(update, option) { context.chat[option.message_id].data = update(context.chat[option.message_id].data); commits++; },
  };
  const store = new Map(), storage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, String(value)); }};
  const win = {TavernHelper: helper, navigator: {}, __readerControllerAlive: true, SillyTavern: {getContext: () => context}, localStorage: storage};
  win.parent = win;
  const sandbox = vm.createContext({window: win, console: {...console, warn() {}}, setTimeout, clearTimeout, structuredClone, URL, AbortController, Response, Promise});
  sandbox.globalThis = sandbox;
  vm.runInContext(transactions, sandbox);
  vm.runInContext(gacha, sandbox);
  const options = {document: null, transactions: win.ReaderTransactions, context: () => context, helper, storage, fetch: async () => new Response('{}'), isAlive: () => win.__readerControllerAlive !== false};
  return {win, sandbox, helper, storage, options, get context() { return context; }, get data() { return context.chat.at(-1).data; }, get commits() { return commits; }, get saves() { return saves; },
    switchChat() { context = {...context, chatId: 'b', chatMetadata: {variables: {}}, chat: [{swipe_id: 0, data: {stat_data: {命运点数: 9}}}]}; }};
}
const plain = value => JSON.parse(JSON.stringify(value));
const card = (name, star, kind = 'item') => ({id: name, kind, name, star, description: name + '的说明', type: '道具'});
const pool = {workKey: 'bangumi:1', work: {key: 'bangumi:1', source: 'bangumi', sourceId: '1', title: '测试作品', media: 'anime'}, items: [], fates: [], sources: [], by: 'offline', at: 1};
const scale = {id: 'destined', name: '命定之诗品质', label: star => ['', '普通', '优良', '稀有', '史诗', '传说', '神话'][star]};

test('the persistent controller loads the generated gacha once, after the transactions it uses', async () => {
  const { runtime } = await build();
  const controller = JSON.parse(runtime.match(/^const ASSETS = (.*);$/m)[1]).controller;
  assert.equal(controller.split('DREAM_READER_GACHA_BEGIN').length, 2);
  assert.ok(controller.indexOf('createReaderTransactions') < controller.indexOf('DREAM_READER_GACHA_BEGIN'));
  assert.ok(controller.indexOf('DREAM_READER_GACHA_END') < controller.indexOf('function dreamOpenGacha('));
  assert.doesNotThrow(() => new vm.Script(controller));
});

test('the generated gacha survives tavern macros, regex replacement text and the compatibility <script> wrapper', () => {
  assert.doesNotMatch(gacha, /<user>|\{\{user\}\}|<(?:bot|char)>|\{\{char\}\}|\{\{match\}\}/i);
  assert.doesNotMatch(gacha, /\$(?:\d|<)/, 'the full regex build is replacement text: no capture-group tokens');
  assert.doesNotMatch(gacha, /<\/script/i);
  assert.match(gacha, /^\/\* DREAM_READER_GACHA_BEGIN \*\/\n\/\* 命运抽卡 [\d.]+（读者大厅）：由 gacha\/src\/reader\/gacha-entry\.ts 打包生成/);
  const f = host();
  assert.equal(typeof f.win.ReaderGacha?.open, 'function');
  assert.deepEqual({...f.win.ReaderGacha.price()}, {cast: 1000, single: 200, ten: 2000}, 'a new big pool 1000 FP, a draw 200, ten draws 2000');
  f.storage.setItem('dream_gacha_settings_v1', JSON.stringify({cost1: 0, cost10: 0, castCost: 0}));
  assert.deepEqual({...f.win.ReaderGacha.price()}, {cast: 1000, single: 200, ten: 2000}, 'prices are fixed, not a device setting');
  f.win.__readerControllerAlive = false;
  assert.equal(f.win.ReaderGacha.open(f.options), false, 'a stopped reader never mounts the panel');
});

test('a draw charges FP and fills the protagonist bag in one ReaderTransactions commit', async () => {
  const f = host(1000), port = f.win.ReaderGacha.port(f.options);
  assert.deepEqual({...port.wallet()}, {fp: 1000});
  const wallet = await port.commit({cost: 1000, cards: [card('星砂罗盘', 6), card('借书卡', 3), card('初见', 5, 'fate')], pool, kind: 'item', bag: true, scale});
  assert.equal(wallet.fp, 0);
  assert.equal(f.commits, 1, 'one variable update, not a charge followed by a separate bag write');
  const stat = f.data.stat_data, bag = stat.主角.背包;
  assert.equal(stat.命运点数, 0);
  assert.equal(bag.星砂罗盘.品质, '神话'); assert.equal(bag.借书卡.品质, '稀有'); assert.equal(bag['命运·初见'].类型, '命运');
  assert.equal(bag.星砂罗盘.标签[0], '命运抽卡'); assert.ok(!bag.星砂罗盘.标签.includes('书海'), 'not mistaken for a Booksea voucher');
  assert.deepEqual(plain(bag.旧物), {品质: '普通', 数量: 1}); assert.equal(stat.unrelated, 'kept');
  assert.ok(Object.keys(f.data.dream_reader_receipts).some(key => key.endsWith(':gacha')));
  await assert.rejects(port.commit({cost: 200, cards: [card('粉笔', 1)], pool, kind: 'item', bag: true, scale}), /FP不足/);
  assert.equal(f.commits, 1, 'an unaffordable draw writes nothing');
});

test('a character page and a big-pity exchange go through the same paid-action commit, spending no FP', async () => {
  const f = host(500), port = f.win.ReaderGacha.port(f.options);
  const page = {id: 'p', kind: 'character', name: '旅人', star: 6, description: '书海的旅人', role: '主角', power: '能在书页间穿行'};
  assert.equal((await port.commit({cost: 0, cards: [page], pool, kind: 'character', bag: true, scale, spark: true})).fp, 500);
  assert.equal(f.commits, 1); assert.equal(f.data.stat_data.命运点数, 500);
  const entry = f.data.stat_data.主角.背包['角色·旅人'];
  assert.equal(entry.类型, '角色书页'); assert.equal(entry.品质, '神话'); assert.equal(entry.效果.持有, '以书页的形式被主角持有');
  assert.equal(entry.效果.实力, '完全等同原作：能在书页间穿行'); assert.match(entry.效果.具现, /完全保有自身自由意志的情况下自由行动，主角无法强制约束/);
  assert.ok(Object.keys(f.data.dream_reader_receipts).some(key => key.endsWith(':gacha-spark')), 'exchanges get their own receipt');
  assert.deepEqual(plain(port.bag()).map(item => [item.name, item.kind, item.price]), [['角色·旅人', 'character', 6000]]);
});

test('a new big pool and recycling are paid actions too: one commit each, receipts kept', async () => {
  const f = host(1500), port = f.win.ReaderGacha.port(f.options);
  assert.deepEqual({...await port.commitCast({cost: 1000, theme: '奇幻'})}, {fp: 500});
  assert.equal(f.commits, 1); assert.equal(f.data.stat_data.命运点数, 500);
  await assert.rejects(port.commitCast({cost: 1000, theme: '奇幻'}), /FP不足/); assert.equal(f.commits, 1);
  f.data.stat_data.主角.背包.星砂罗盘 = {品质: '神话', 类型: '道具', 数量: 2, 标签: ['命运抽卡', '物品', '作品:测试作品', '星级:6']};
  f.data.stat_data.主角.背包.借书卡 = {品质: '稀有', 类型: '道具', 数量: 1, 标签: ['命运抽卡', '物品', '作品:测试作品', '星级:3']};
  assert.deepEqual(plain(port.bag()).map(entry => [entry.name, entry.count, entry.price]), [['星砂罗盘', 2, 6000], ['借书卡', 1, 100]], 'only gacha items, priced at 1/25 of the same-tier contract');
  assert.deepEqual(plain(await port.recycle([{name: '星砂罗盘', quality: '神话', count: 1}, {name: '借书卡', quality: '稀有', count: 1}])), {fp: 6600, gained: 6100, removed: 2});
  assert.equal(f.commits, 2, 'recycling is one variable update');
  const bag = f.data.stat_data.主角.背包;
  assert.equal(bag.星砂罗盘.数量, 1); assert.equal(bag.借书卡, undefined); assert.deepEqual(plain(bag.旧物), {品质: '普通', 数量: 1}, 'items from elsewhere stay');
  await assert.rejects(port.recycle([{name: '旧物', quality: '普通', count: 1}]), /已经变了/); assert.equal(f.commits, 2);
  const keys = Object.keys(f.data.dream_reader_receipts);
  assert.ok(keys.some(key => key.endsWith(':gacha-cast')) && keys.some(key => key.endsWith(':gacha-recycle')));
});

test('pity and history live in the chat variable dream_gacha; chat switches cancel stale writes', async () => {
  const f = host(), port = f.win.ReaderGacha.port(f.options);
  const durable = {version: 1, pity: {since5: 1, since6: 1, total: 1}, history: [], updated: 1};
  await port.writeDurable(durable);
  assert.deepEqual(plain(f.context.chatMetadata.variables.dream_gacha), durable);
  assert.equal(f.context.chatMetadata.variables.other, 1); assert.equal(f.saves, 1);
  f.switchChat();
  assert.match(port.wallet().blocked, /聊天已切换/);
  await assert.rejects(port.writeDurable(durable), /聊天已切换/);
  await assert.rejects(port.commit({cost: 1, cards: [card('粉笔', 1)], pool, kind: 'item', bag: true, scale}), /聊天已切换/);
  assert.equal(f.context.chatMetadata.variables.dream_gacha, undefined, 'never written into the other chat');
});

test('an unfinished Booksea expedition blocks draws, new big pools and recycling', async () => {
  const f = host();
  f.context.chatMetadata.variables.booksea = {activeExpedition: {run: {id: 'r1'}, mode: 'explore'}};
  const port = f.win.ReaderGacha.port(f.options);
  assert.match(port.wallet().blocked, /书海的旅程还没结束/);
  await assert.rejects(port.commit({cost: 200, cards: [card('粉笔', 1)], pool, kind: 'item', bag: true, scale}), /书海的旅程还没结束/);
  await assert.rejects(port.commitCast({cost: 1000, theme: '奇幻'}), /书海的旅程还没结束/);
  await assert.rejects(port.recycle([{name: '旧物', quality: '普通', count: 1}]), /书海的旅程还没结束/);
  assert.equal(f.commits, 0);
});

test('lobby 命运抽卡 always opens the gacha panel with the current lobby theme; nothing is typed into the chat', () => {
  const opened = [], toasts = [];
  const textarea = {value: '', dispatchEvent() {}, focus() {}};
  const pD = {querySelector: selector => selector === '#send_textarea' ? textarea : null};
  const pW = {location: {origin: 'http://127.0.0.1:8000'}, SillyTavern: {getContext: () => ({})}};
  const TavernHelper = {generateRaw: config => Promise.resolve(config), stopGenerationById() {}};
  const win = {__readerControllerAlive: true, TavernHelper, parent: pW, localStorage: {getItem: () => null}, fetch: () => 'fetched'};
  let theme = 'summer';
  const sandbox = vm.createContext({window: win, pD, pW, Event: class { constructor(type) { this.type = type; } }, console: {...console, error() {}},
    pToast: message => toasts.push(message), ReaderTransactions: {id: 'tx'}, getVisualTheme: () => theme, getStandingArtUrl: () => 'https://img.example/fig.png', getAvatarUrl: () => 'https://img.example/scene.png',
    SX_CHIBI: {gacha_a: 'https://img.example/sx-a.png', gacha_b: 'https://img.example/sx-b.png'}, dlbFpLater() {},
    dreamApplyApiRoute: (route, config) => ({...config, custom_api: {route}})});
  vm.runInContext(['dreamGachaPrice', 'dreamGachaMini', 'dreamGachaCostText', 'dreamGachaTheme', 'dreamGachaArt', 'dreamGachaHelper', 'dreamGachaAlive', 'dreamOpenGacha', 'pOrderItem'].map(name => declaration(legacy, name)).join('\n'), sandbox);
  // Not installed (a broken update): say so, never fall back to a typed order.
  assert.equal(sandbox.dreamOpenGacha(), false);
  assert.deepEqual(toasts, ['命运抽卡没有装好：请更新读者正则后再试']); assert.equal(textarea.value, '');
  assert.equal(sandbox.dreamGachaMini(), '<i class="mini">200</i>'); assert.equal(sandbox.dreamGachaCostText(' '), '200 FP');
  win.ReaderGacha = {open: options => { opened.push(options); return true; }, price: () => ({cast: 1000, single: 200, ten: 2000})};
  assert.equal(sandbox.dreamOpenGacha(), true);
  assert.equal(opened.length, 1); assert.equal(textarea.value, '');
  const options = opened[0];
  assert.equal(options.document, pD); assert.equal(options.transactions, sandbox.ReaderTransactions); assert.equal(options.proxyBase, 'http://127.0.0.1:8000');
  assert.equal(options.theme(), 'summer'); theme = 'ink'; assert.equal(options.theme(), 'ink', 'the panel follows the lobby theme each time it opens');
  theme = 'summer';
  assert.deepEqual(JSON.parse(JSON.stringify(options.art())), {figure: 'https://img.example/fig.png', backdrop: 'https://img.example/scene.png', chibi: {idle: 'https://img.example/sx-a.png', cheer: 'https://img.example/sx-b.png'}});
  assert.equal(options.isAlive(), true); win.__readerControllerAlive = false; assert.equal(options.isAlive(), false); win.__readerControllerAlive = true;
  return options.generate({max_chat_history: 0}).then(config => {
    assert.deepEqual(config.custom_api, {route: 'gacha'}, 'model calls follow the 命运抽卡 independent-API route');
    sandbox.pOrderItem('更新新闻');
    assert.equal(textarea.value, '更新新闻', 'other orders are untouched');
    assert.deepEqual(toasts, ['命运抽卡没有装好：请更新读者正则后再试', '已点单: 更新新闻']);
  });
});

test('every lobby theme and the paper menu open the gacha directly; the old five-draw order is gone', () => {
  assert.doesNotMatch(legacy, /抽卡5次/); assert.doesNotMatch(body, /抽卡5次/);
  assert.equal((legacy.match(/data-dlb="gacha"/g) || []).length, 2, 'summer ribbon and the classic lobby');
  for (const pattern of [/cfCoaster\('gacha','','命运抽卡',dreamGachaMini\(\),'gacha'\)/, /jnTile\('gacha','命运抽卡',dreamGachaCostText\(' '\),'gacha'\)/,
    /<li class="m-item" data-dream-gacha="1"><span>命运抽卡<\/span><span class="m-cost">'\+dreamGachaCostText\(''\)\+'/,
    /var gch=e\.target\.closest\('\[data-dream-gacha\]'\);if\(gch\)\{dreamOpenGacha\(\);return;\}var t=e\.target\.closest\('\[data-order\]'\)/,
    /if\(act==='gacha'\)\{dreamOpenGacha\(\);return;\}/]) assert.match(legacy, pattern);
  assert.match(body, /<li class="m-item" onclick="dreamOpenGacha\(\)"><span>命运抽卡<\/span><span class="m-cost">200FP<\/span><\/li>/);
  assert.match(legacy, /\['gacha','命运抽卡','[^']+'\]\r?\n\];/, 'the independent API settings list a 命运抽卡 route');
});

test('the full-regex build carries the same gacha after its transactions', async () => {
  const full = JSON.parse(await read('source/读者对话渲染.json')).replaceString;
  assert.equal(full.split('DREAM_READER_GACHA_BEGIN').length, 2);
  assert.ok(full.indexOf('DREAM_READER_TRANSACTIONS_END') < full.indexOf('DREAM_READER_GACHA_BEGIN'));
  assert.ok(full.includes(gacha.trim()), 'the committed bundle, byte for byte');
  assert.doesNotMatch(full, /抽卡5次/);
});
