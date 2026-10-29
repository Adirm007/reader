import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const transactions = await readFile(new URL('../source/reader-transactions.js', import.meta.url), 'utf8');
const legacy = await readFile(new URL('../source/legacy-reader.js', import.meta.url), 'utf8');
const template = await readFile(new URL('../source/template-system.js', import.meta.url), 'utf8');

// Extract the real editable feature function, ignoring braces inside JS strings.
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

function fixture(fp = 1000) {
  let context = {characterId: 1, chatId: 'a', chat: [{swipe_id: 0, data: {stat_data: {命运点数: fp, 主角: {状态效果: {}}, unrelated: 'kept'}, preference: 7}}], chatMetadata: {variables: {}}};
  let commits = 0;
  context.getCurrentChatId = () => context.chatId;
  context.saveMetadata = async () => {};
  const helper = {
    getLastMessageId: () => context.chat.length - 1,
    getVariables: option => option.type === 'chat' ? context.chatMetadata.variables : context.chat[option.message_id].data,
    async updateVariablesWith(update, option) { const next = update(context.chat[option.message_id].data); context.chat[option.message_id].data = next; commits++; },
  };
  const win = {TavernHelper: helper, navigator: {}, __readerControllerAlive: true, SillyTavern: {getContext: () => context}};
  win.parent = win;
  const sandbox = vm.createContext({window: win, console: {...console, warn() {}}, setTimeout, clearTimeout});
  vm.runInContext(transactions, sandbox);
  const tx = win.ReaderTransactions;
  Object.assign(sandbox, {ReaderTransactions: tx, confirm: () => true, showToast() {}, getYuanPlusEnabled: () => false,
    RHYTHM_CONFIG: {缘: {cost: 200, key: '涟漪·缘', effect: '测试效果', duration: '至事件触发'}}});
  const load = (names, source = legacy) => vm.runInContext(names.map(name => declaration(source, name)).join('\n'), sandbox);
  return {win, tx, helper, sandbox, load, get context() {return context;}, get data() {return context.chat.at(-1).data;}, get commits() {return commits;},
    switchChat() { context = {...context, chatId: 'b', chatMetadata: {variables: {}}, chat: [{swipe_id: 0, data: {stat_data: {命运点数: 777, 主角: {状态效果: {}}}}}]}; }};
}

test('rhythm charge and status effect are committed together and preserve unrelated state', async () => {
  const f = fixture();
  f.load(['getRootVars', 'getMainCharacter', 'cloneStatusEffects', 'getStatusEffects', 'buildMainPatch', 'buildStatusPatch', 'handleRhythm']);
  await f.sandbox.handleRhythm('缘');
  assert.equal(f.data.stat_data.命运点数, 800);
  assert.equal(f.data.stat_data.主角.状态效果['涟漪·缘'].效果, '测试效果');
  assert.equal(f.data.stat_data.unrelated, 'kept');
  assert.equal(f.data.preference, 7);
  assert.equal(f.commits, 1);
});

test('failed effect construction leaves FP unchanged', async () => {
  const f = fixture(), token = f.tx.capture();
  await assert.rejects(f.tx.transact(token, token.id, data => {f.tx.charge(data, 200); throw Error('effect failed');}), /effect failed/);
  assert.equal(f.data.stat_data.命运点数, 1000);
  assert.equal(f.commits, 0);
});

test('concurrent costs cannot overspend and the receipt prevents repeated application', async () => {
  const f = fixture(300), a = f.tx.capture(), b = f.tx.capture();
  const results = await Promise.allSettled([f.tx.transact(a, 'first', data => f.tx.charge(data, 200)), f.tx.transact(b, 'second', data => f.tx.charge(data, 200))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.data.stat_data.命运点数, 100);
  assert.equal(await f.tx.transact(a, 'first', data => f.tx.charge(data, 200)), 100);
  assert.equal(f.data.stat_data.命运点数, 100);
});

for (const [name, change] of [
  ['chat switch', f => f.switchChat()],
  ['new message', f => f.context.chat.push({swipe_id: 0, data: structuredClone(f.data)})],
  ['swipe switch', f => {f.context.chat[0].swipe_id++;}],
  ['message replacement', f => {f.context.chat[0] = {...f.context.chat[0]};}],
  ['runtime stop', f => {f.win.__readerControllerAlive = false;}],
]) test(name + ' invalidates a captured operation before any state write', async () => {
  const f = fixture(), token = f.tx.capture(); change(f);
  await assert.rejects(f.tx.transact(token, 'old', data => f.tx.charge(data, 200)), /已变化|已关闭/);
  assert.equal(f.commits, 0);
});

test('a long guarded host request cannot continue writing after the chat changed', async () => {
  const f = fixture(), token = f.tx.capture();
  let resolve;
  const api = f.tx.guardApi({generateRaw: () => new Promise(done => {resolve = done;}), createWorldbookEntries() {throw Error('must not write');}}, token);
  const pending = api.generateRaw(); f.switchChat(); resolve('generated');
  await assert.rejects(pending, /已变化/);
  assert.throws(() => api.createWorldbookEntries('another chat', []), /已变化/);
  assert.equal(f.data.stat_data.命运点数, 777);
});

test('duplicate clicks are blocked while the operation is running, then released on failure', async () => {
  const f = fixture(); let reject;
  const pending = f.tx.run('paid-action', () => new Promise((_, fail) => {reject = fail;}));
  await assert.rejects(f.tx.run('paid-action', async () => {}), /正在进行/);
  reject(Error('generation failed')); await assert.rejects(pending, /generation failed/);
  assert.equal(await f.tx.run('paid-action', async () => 'retry'), 'retry');
  assert.equal(f.win.ReaderActiveTaskToken, null);
});

test('bookshelf contents and FP are saved in the same message transaction', async () => {
  const f = fixture(4000); f.load(['bsSave']);
  const books = [{t: '一部作品', a: '作者', d: '简介'}], token = f.tx.capture();
  await f.sandbox.bsSave(books, token, 1500);
  assert.equal(f.commits, 1);
  assert.equal(f.data.stat_data.命运点数, 2500);
  assert.deepEqual(JSON.parse(JSON.stringify(f.data.dream_reader_bookshelf.books)), books);
  assert.deepEqual(JSON.parse(f.context.chatMetadata.variables.dream_bookshelf), books);
});

test('a failed generation incurs no fee and missing MVU never falls back to chat FP', async () => {
  const f = fixture(); f.load(['handleYuanPlusOrder']);
  f.sandbox.RHYTHM_CONFIG = {缘: {cost: 200}};
  f.win.ReaderTemplateSystem = {generateForYuanPlus: async () => {throw Error('generation unavailable');}};
  await assert.rejects(f.sandbox.handleYuanPlusOrder(), /generation unavailable/);
  assert.equal(f.data.stat_data.命运点数, 1000);
  f.context.chat[0].data = {};
  f.context.chatMetadata.variables.命运点数 = 10000;
  assert.throws(() => f.tx.requireFp(f.tx.capture(), 200), /有效的命运点数/);
  assert.equal(f.context.chatMetadata.variables.命运点数, 10000);
});

test('chess awards are pinned to one game operation and cannot be claimed twice', async () => {
  const f = fixture(); f.load(['addFP']); f.sandbox.G_rewardToken = f.tx.capture();
  assert.equal(await f.sandbox.addFP(17), true);
  assert.equal(await f.sandbox.addFP(17), true);
  assert.equal(f.data.stat_data.命运点数, 1017);
  f.switchChat(); assert.equal(await f.sandbox.addFP(17), false);
  assert.equal(f.data.stat_data.命运点数, 777);
});

test('template writer checks the original context after generation before writing the worldbook', async () => {
  const f = fixture(); f.load(['runWriter'], template);
  let resolve, started, writes = 0;
  const ready = new Promise(done => {started = done;});
  Object.assign(f.sandbox, {collectContext: async () => ({}), buildGenerationPrompt: () => 'prompt', generateText: () => new Promise(done => {resolve = done; started();}), parseGenerated: () => ({}), writeEntry: async () => {writes++;}});
  const pending = f.sandbox.runWriter({}, {}, {});
  await ready; f.switchChat(); resolve('result');
  await assert.rejects(pending, /已变化/); assert.equal(writes, 0);
});

test('worldbook updater recognizes only the known integrated reader signature', async () => {
  const f = fixture(); f.load(['dreamWbLegacy']);
  const specs = JSON.parse(await readFile(new URL('../worldbook/entries.json', import.meta.url), 'utf8')).entries[0];
  const entry = {name: '[本体][命定系统]读者核心(Angtuck)', content: "setLocalVar('系统核心', '九十九夜梦'); getLocalVar('dream_persona');"};
  assert.equal(f.sandbox.dreamWbLegacy(entry, specs), true);
  assert.equal(f.sandbox.dreamWbLegacy({...entry, name: '玩家自己写的读者核心'}, specs), false);
  assert.equal(f.sandbox.dreamWbLegacy({...entry, content: 'unrelated content'}, specs), false);
});
