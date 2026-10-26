import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createReaderHost, makeStatData, makeRelation } from './helpers/reader-host.mjs';

const profile = JSON.parse(await readFile(new URL('../source/black-author.prompt.json', import.meta.url), 'utf8'));
const template = await readFile(new URL('../source/black-author-cache.js', import.meta.url), 'utf8');
const script = template.replace('__DREAM_AUTHOR_PROFILE__', JSON.stringify(profile));
const key = 'dream_black_author_prompt';

function fixture({ existing, failSave = false, detached = false } = {}) {
  const variables = { other_setting: 'preserved' };
  if (existing !== undefined) variables[key] = existing;
  const errors = [];
  let saves = 0;
  let persisted;
  const context = {
    chatId: 'chat-a',
    chatMetadata: { variables },
    saveMetadata() {
      saves++;
      if (failSave) return Promise.reject(new Error('simulated save failure'));
      persisted = JSON.parse(JSON.stringify(variables));
      return Promise.resolve();
    },
  };
  const window = { parent: { SillyTavern: { getContext: () => context } }, frameElement: { isConnected: !detached } };
  const sandbox = vm.createContext({ window, console: { error: (...args) => errors.push(args) } });
  return {
    context, variables, errors,
    get saves() { return saves; },
    get persisted() { return persisted; },
    run() { vm.runInContext(script, sandbox); },
  };
}

test('first regex display synchronously prepares the entire profile and saves chat metadata', () => {
  const f = fixture();
  f.run();
  assert.deepEqual(JSON.parse(f.variables[key]), profile);
  assert.deepEqual(JSON.parse(f.persisted[key]), profile);
  assert.equal(f.saves, 1);
  assert.equal(f.variables.other_setting, 'preserved');
  assert.equal(f.errors.length, 0);
});

test('re-rendering the regex reuses identical data without another download or save', () => {
  const f = fixture();
  f.run();
  f.run();
  assert.equal(f.saves, 1);
});

test('a detached iframe does not initialize another chat after switching away', () => {
  const f = fixture({ detached: true });
  f.run();
  assert.equal(f.variables[key], undefined);
  assert.equal(f.saves, 0);
});

test('malformed or incomplete stored data is repaired on the next regex display', () => {
  for (const existing of ['not-json', JSON.stringify({ schema: 1, name: profile.name, revision: 99 })]) {
    const f = fixture({ existing });
    f.run();
    assert.deepEqual(JSON.parse(f.variables[key]), profile);
    assert.equal(f.saves, 1);
  }
});

test('an older renderer cannot overwrite a newer complete profile', () => {
  const newer = JSON.stringify({ ...profile, revision: profile.revision + 1 });
  const f = fixture({ existing: newer });
  f.run();
  assert.equal(f.variables[key], newer);
  assert.equal(f.saves, 0);
});

test('failed persistence is reported and remains retryable', async () => {
  const f = fixture({ failSave: true });
  f.run();
  await new Promise(setImmediate);
  assert.equal(f.variables[key], undefined);
  assert.equal(f.errors.length, 1);
  f.run();
  await new Promise(setImmediate);
  assert.equal(f.saves, 2);
});

test('cache initialization never stores a selected persona, curse latch or target list', () => {
  const f = fixture();
  f.run();
  assert.deepEqual(Object.keys(f.variables).sort(), [key, 'other_setting'].sort());
  assert.deepEqual(Object.keys(JSON.parse(f.variables[key])).sort(), Object.keys(profile).sort());
});

test('persisted regex data drives EJS offline and is unchanged when the girl returns', async () => {
  const f = fixture();
  f.run();
  const persisted = JSON.parse(JSON.stringify(f.persisted));
  const host = createReaderHost({ local: persisted, statData: makeStatData({ relations: { 同伴: makeRelation() } }) });
  assert.match(await host.render(), /黑之作家/);
  host.setStatData(makeStatData({ relations: { 同伴: makeRelation({ hp: 0 }) } }));
  assert.doesNotMatch(await host.render(), /黑之作家/);
  assert.equal(host.local[key], persisted[key]);
  assert.equal(host.requests.length, 0);
});

test('the actual distributed renderer contains and initializes the same profile', async () => {
  const manifest = JSON.parse(await readFile(new URL('../release-manifest.json', import.meta.url), 'utf8'));
  const renderer = await readFile(new URL('../' + manifest.files['reader.js'].path, import.meta.url), 'utf8');
  const block = renderer.match(/\/\* DREAM_AUTHOR_CACHE_BEGIN \*\/[\s\S]*?\/\* DREAM_AUTHOR_CACHE_END \*\//)?.[0];
  assert.ok(block);
  const f = fixture();
  vm.runInNewContext(block, { window: { parent: { SillyTavern: { getContext: () => f.context } } }, console });
  assert.deepEqual(JSON.parse(f.variables[key]), profile);
});
