import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const manifest = JSON.parse(await read('release-manifest.json'));

test('every published renderer asset matches the declared byte count and hash', async () => {
  for (const entry of Object.values(manifest.files)) {
    const bytes = await read(entry.path);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
  }
});

test('the browser classic-script renderer parses without importing or executing it', async () => {
  const js = (await read(manifest.files['reader.js'].path)).toString('utf8');
  assert.doesNotThrow(() => new vm.Script(js));
});

test('full-regex imports and the external renderer contain the same initialization and UI code', async () => {
  const full = JSON.parse(await read('source/读者对话渲染.json'));
  const js = full.replaceString.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(js);
  assert.equal(js.trim(), (await read(manifest.files['reader.js'].path)).toString('utf8').trim());
});

test('worldbook delivery hashes are accurate and the hidden persona text is not embedded', async () => {
  const book = JSON.parse(await read('worldbook/manifest.json'));
  for (const entry of book.entries) {
    const bytes = await read(entry.file);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    const source = bytes.toString('utf8');
    assert.doesNotMatch(source, /黑之作家|【无形恶意】|【诅咒尽头】/);
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  }
});
