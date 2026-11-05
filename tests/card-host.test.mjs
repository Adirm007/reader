import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../source/card-host.mjs', import.meta.url), 'utf8'))
  .replace("import { BUNDLED } from 'reader:bundled';", 'const BUNDLED = window.__bundled;')
  .replace('import(/* @vite-ignore */ url)', '__importModule(url)')
  .replace(/export function (start|stop)/g, 'function $1') + '\nwindow.entry = {start, stop};';
const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve }; };
const artifact = version => ({ metadata: { version }, spec: { sha256: `sha-${version}` }, bytes: new TextEncoder().encode(JSON.stringify({ version })) });

function fixture(options = {}) {
  const calls = { reads: 0, imports: 0, saves: 0, starts: [], stops: [], warnings: [] }, blobs = new Map();
  const ctx = { characterId: 0, chatId: 'a', chatMetadata: { variables: { 系统核心: '九十九夜梦' } } };
  let saved = options.artifact || null;
  const sandbox = { Blob, Promise, JSON, Number, Math, Error, console: { warn: (...args) => calls.warnings.push(args.join(' ')) },
    fetch() { throw Error('startup must not fetch'); }, setTimeout() { throw Error('startup must not add a timer'); }, setInterval() { throw Error('startup must not poll'); },
    ReaderScriptInstaller: { ensure() { throw Error('must not install scripts'); } },
    DreamFixedReleaseClient: { latest() { throw Error('must not check latest'); }, resource() { throw Error('must not download resources'); } },
    TavernHelper: { getScriptTrees() { throw Error('must not read script trees'); }, updateScriptTreesWith() { throw Error('must not write scripts'); } },
    SillyTavern: { getContext: () => ctx },
    URL: { createObjectURL(blob) { const key = `blob:test-${blobs.size}`; blobs.set(key, blob); return key; }, revokeObjectURL() {} },
  };
  sandbox.window = sandbox; sandbox.parent = sandbox;
  function module(version) {
    let api;
    return { version, start(opts) {
      calls.starts.push(version);
      if (options.owner) return options.owner;
      api = { runtimeVersion: version, isAlive: true, ready: options.ready || Promise.resolve(true), getUpdateOptions: () => opts.updates };
      sandbox.ReaderCore = api; return api;
    }, stop() { calls.stops.push(version); if (sandbox.ReaderCore === api) { api.isAlive = false; delete sandbox.ReaderCore; } } };
  }
  sandbox.__bundled = module('2.0');
  sandbox.__importModule = async url => { calls.imports++; await options.importGate?.promise; return module(JSON.parse(await blobs.get(url).text()).version); };
  sandbox.ReaderHostedRuntimeStore = {
    async read() { calls.reads++; await options.readGate?.promise; return { artifact: saved, error: options.readError || null }; },
    async save(next, guard) { calls.saves++; guard(); await options.saveGate?.promise; guard(); if (options.saveFails) throw Error('cache full'); saved = next; return next; },
  };
  vm.runInNewContext(source, sandbox, { filename: 'card-host.mjs' });
  return { entry: sandbox.entry, sandbox, calls, ctx, get saved() { return saved; } };
}

test('the card host starts its bundled runtime without network, script-library access or timers, reading the local selection once', async () => {
  const f = fixture(), first = f.entry.start({ base: '/assets' });
  assert.equal(f.entry.start(), first);
  const api = await first;
  assert.equal(api.runtimeVersion, '2.0'); assert.equal(await f.entry.start(), api);
  assert.equal(f.calls.reads, 1); assert.equal(f.calls.imports, 0); assert.deepEqual(f.calls.starts, ['2.0']);
  assert.equal(api.getUpdateOptions().hostMode, 'auto-regex');
  f.entry.stop(); await f.entry.start(); f.entry.stop();
  assert.equal(f.calls.reads, 1); assert.deepEqual(f.calls.starts, ['2.0', '2.0']);
});

test('a newer selected local runtime is imported once and the old host stops the real active module', async () => {
  const f = fixture({ artifact: artifact('3.0') }), api = await f.entry.start();
  assert.equal(api.runtimeVersion, '3.0'); assert.deepEqual(f.calls.starts, ['3.0']);
  f.entry.stop(); assert.equal(api.isAlive, false); assert.deepEqual(f.calls.stops, ['3.0']);
  await f.entry.start(); f.entry.stop();
  assert.equal(f.calls.reads, 1); assert.equal(f.calls.imports, 1); assert.deepEqual(f.calls.starts, ['3.0', '3.0']);
});

test('a cached version equal to or older than the bundle never replaces the bundled runtime', async () => {
  for (const version of ['1.0', '2.0']) {
    const f = fixture({ artifact: artifact(version) });
    assert.equal((await f.entry.start()).runtimeVersion, '2.0'); assert.equal(f.calls.imports, 0); f.entry.stop();
  }
});

test('a missing or damaged selection falls back to the bundle without a network recovery', async () => {
  const f = fixture({ readError: 'selected cache is missing' });
  assert.equal((await f.entry.start()).runtimeVersion, '2.0'); assert.equal(f.calls.warnings.length, 1); f.entry.stop();
});

test('stopping while local restore is pending prevents a late startup, and reopening reuses the one local read', async () => {
  const readGate = deferred(), f = fixture({ readGate }), pending = f.entry.start();
  f.entry.stop(); readGate.resolve(); assert.equal(await pending, null); assert.deepEqual(f.calls.starts, []);
  assert.equal((await f.entry.start()).runtimeVersion, '2.0'); assert.equal(f.calls.reads, 1); f.entry.stop();
});

test('stopping while a cached module import is pending cannot revive it', async () => {
  const importGate = deferred(), f = fixture({ artifact: artifact('3.0'), importGate }), pending = f.entry.start();
  await new Promise(setImmediate); assert.equal(f.calls.imports, 1);
  f.entry.stop(); importGate.resolve(); assert.equal(await pending, null); assert.deepEqual(f.calls.starts, []);
});

test('stopping while the controller is preparing cancels startup without reporting a controller failure', async () => {
  const ready = deferred(), f = fixture({ ready: ready.promise }), pending = f.entry.start();
  await new Promise(setImmediate); f.entry.stop(); ready.resolve(null);
  assert.equal(await pending, null); assert.equal(f.sandbox.ReaderCore, undefined); assert.equal(f.calls.warnings.length, 0);
});

test('manual acceptance saves a pending version without restarting playback, and reopening uses it without rereading storage', async () => {
  const f = fixture(), api = await f.entry.start({ updates: { other: true } }), updates = api.getUpdateOptions();
  assert.equal(updates.other, true);
  const result = await updates.installRuntime(artifact('3.0'));
  assert.equal(result.pending, true); assert.equal(f.sandbox.ReaderCore, api); assert.equal(api.isAlive, true);
  assert.deepEqual(f.calls.starts, ['2.0']); assert.deepEqual(f.calls.stops, []);
  assert.deepEqual(JSON.parse(JSON.stringify(updates.getHostedRuntimeState())), { runningVersion: '2.0', pendingVersion: '3.0' });
  f.entry.stop(); assert.equal((await f.entry.start()).runtimeVersion, '3.0');
  assert.equal(f.calls.reads, 1); assert.deepEqual(f.calls.starts, ['2.0', '3.0']); f.entry.stop();
});

test('a failed manual save leaves the previous selection and playing instance intact', async () => {
  const previous = artifact('3.0'), f = fixture({ artifact: previous, saveFails: true }), api = await f.entry.start();
  await assert.rejects(api.getUpdateOptions().installRuntime(artifact('4.0')), /cache full/);
  assert.equal(f.saved, previous); assert.equal(f.sandbox.ReaderCore, api); assert.deepEqual(f.calls.stops, []);
  assert.equal(api.getUpdateOptions().getHostedRuntimeState().pendingVersion, null);
  f.entry.stop(); assert.equal((await f.entry.start()).runtimeVersion, '3.0'); f.entry.stop();
});

test('a chat switch during manual persistence prevents changing the selected version', async () => {
  const saveGate = deferred(), f = fixture({ saveGate }), api = await f.entry.start();
  const saving = api.getUpdateOptions().installRuntime(artifact('3.0'));
  f.ctx.chatId = 'b'; saveGate.resolve(); await assert.rejects(saving, /聊天或读者运行状态已变化/);
  assert.equal(f.saved, null); f.entry.stop();
});

test('the same hosted reader can accept an update after following a new chat', async () => {
  const f = fixture(), api = await f.entry.start(); f.ctx.chatId = 'b';
  await api.getUpdateOptions().installRuntime(artifact('3.0'));
  assert.equal(f.saved.metadata.version, '3.0'); assert.equal(f.sandbox.ReaderCore, api); f.entry.stop();
});

test('an existing standalone owner remains untouched and is reported only once', async () => {
  const owner = { runtimeVersion: '3.0', scriptOwner: { id: 'reader-script' }, isAlive: true }, f = fixture({ owner });
  f.sandbox.ReaderCore = owner;
  assert.equal(await f.entry.start(), owner); f.entry.stop(); assert.equal(await f.entry.start(), owner); f.entry.stop();
  assert.equal(f.sandbox.ReaderCore, owner); assert.equal(f.calls.warnings.length, 1); assert.deepEqual(f.calls.stops, []);
});
