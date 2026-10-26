import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const template = await readFile(new URL('tools/fixed-loader.html', root), 'utf8');
const clientSource = await readFile(new URL('source/fixed-release-client.js', root), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const commit = '1234567890abcdef1234567890abcdef12345678';
function release(version = '1.0.0') {
  const assets = {
    'dist/reader.css': Buffer.from('body { color: black; }'),
    'dist/reader-body.html': Buffer.from('<main><!--DREAM_LETTER--></main>'),
    'dist/reader.js': Buffer.from('window.readerLoaded = true;'),
  };
  const files = Object.fromEntries(Object.keys(assets).map(file => [file.split('/').at(-1), {
    path: file, bytes: assets[file].length, sha256: sha(assets[file]),
  }]));
  const manifest = Buffer.from(JSON.stringify({ schema: 1, name: 'dream-reader-render-fixed', version, files, resources: {} }));
  const pin = { schema: 1, repository: 'Adirm007/reader', version, sourceCommit: commit, manifestSha256: sha(manifest) };
  return { pin, assets, manifest };
}

async function runLoader(fixture, { network, caches = new Map(), secure = true, crypto = webcrypto, version, resolve } = {}) {
  const requests = [], appended = [];
  const elements = new Map(['dream-loader-status', 'dream-loader-retry', 'dream-loader-letter', 'dream-letter-src', 'dream-macro-user', 'dream-macro-char']
    .map(id => [id, { textContent: '', hidden: true, content: { textContent: id === 'dream-letter-src' ? 'Letter' : '' }, innerHTML: id === 'dream-letter-src' ? 'Letter' : '' }]));
  const cache = {
    async match(key) { return caches.has(key) ? new Response(caches.get(key)) : undefined; },
    async put(key, response) { caches.set(key, Buffer.from(await response.arrayBuffer())); },
  };
  const document = {
    getElementById: id => elements.get(id),
    createElement: tag => ({ tag }),
    head: { appendChild: node => appended.push(node) },
    body: { innerHTML: '', appendChild: node => appended.push(node) },
  };
  const window = { isSecureContext: secure, crypto, caches: { open: async () => cache } };
  window.parent = window;
  const context = vm.createContext({ window, document, crypto, caches: window.caches, TextDecoder, TextEncoder, Uint8Array,
    Response, AbortController, setTimeout, clearTimeout, fetch: async (url, options) => {
      requests.push({ url, options });
      if (network) return network(url, options);
      const file = url.replace(/^https:\/\/raw\.githubusercontent\.com\/Adirm007\/reader\/[a-f0-9]{40}\//, '');
      const bytes = file === 'fixed-release-manifest.json' ? fixture.manifest : fixture.assets[file];
      return new Response(bytes || '', { status: bytes ? 200 : 404 });
    } });
  const source = template.replace('__FIXED_CONFIG__', JSON.stringify(fixture.pin))
    .replace('__FIXED_VERSION__', JSON.stringify(version || fixture.pin.version)).replace('__FIXED_RELEASE_CLIENT__', '')
    .match(/<script>([\s\S]*)<\/script>/)[1];
  vm.runInContext(clientSource, context);
  window.DreamFixedReleaseClient = { sha256: window.DreamFixedReleaseClient.sha256,
    resolve: resolve || (() => { throw new Error('Unexpected version discovery'); }) };
  vm.runInContext(source, context);
  for (let i = 0; i < 200; i++) {
    if (appended.some(node => node.tag === 'script') || elements.get('dream-loader-retry').hidden === false) {
      return { window, requests, appended, elements, caches };
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Loader never completed');
}

test('fixed loader verifies the pinned manifest and every asset before executing code', async () => {
  const fixture = release();
  const result = await runLoader(fixture);
  assert.equal(result.appended.filter(node => node.tag === 'script').length, 1);
  assert.match(result.appended.at(-1).text, /window.readerLoaded/);
  assert.equal(result.window.DREAM_READER_FIXED.sourceCommit, commit);
  assert.equal(result.window.DREAM_READER_RELEASE.fixed, true);
  assert.equal(result.requests.length, 4);
  for (const { url, options } of result.requests) {
    assert.ok(url.includes('/' + commit + '/'));
    assert.doesNotMatch(url, /\/main\/|@main|github\.io|latest/);
    assert.equal(options.redirect, 'error');
  }
});

test('a changed manifest cannot authorize a changed renderer at the same URL', async () => {
  const fixture = release();
  const bad = JSON.parse(fixture.manifest);
  const malicious = Buffer.from('window.evil = true;');
  bad.files['reader.js'] = { path: 'dist/reader.js', bytes: malicious.length, sha256: sha(malicious) };
  const result = await runLoader(fixture, { network: async () => new Response(JSON.stringify(bad)) });
  assert.equal(result.appended.length, 0);
  assert.equal(result.window.DREAM_READER_FIXED, undefined);
  assert.equal(result.requests.length, 2);
  assert.ok(result.requests.every(request => request.url.endsWith('/fixed-release-manifest.json')));
  assert.match(result.elements.get('dream-loader-status').textContent, /校验失败/);
});

test('tampering with an asset blocks execution even when its byte count is unchanged', async () => {
  const fixture = release();
  fixture.assets['dist/reader.js'] = Buffer.alloc(fixture.assets['dist/reader.js'].length, 32);
  const result = await runLoader(fixture);
  assert.equal(result.appended.length, 0);
  assert.match(result.elements.get('dream-loader-status').textContent, /reader\.js/);
});

test('LAN HTTP and missing Web Crypto still verify the full SHA-256', async () => {
  for (const options of [{ secure: false }, { crypto: {} }]) {
    const result = await runLoader(release(), options);
    assert.equal(result.appended.filter(node => node.tag === 'script').length, 1);
    const bad = release();
    bad.assets['dist/reader.js'] = Buffer.alloc(bad.assets['dist/reader.js'].length, 32);
    const tampered = await runLoader(bad, options);
    assert.equal(tampered.appended.length, 0);
    assert.match(tampered.elements.get('dream-loader-status').textContent, /校验失败/);
  }
});

test('offline fixed caches are verified and cannot leak across versions', async () => {
  const fixture = release();
  const first = await runLoader(fixture);
  const network = async () => { throw new Error('offline'); };
  const offline = await runLoader(fixture, { caches: first.caches, network });
  assert.equal(offline.requests.length, 0);
  assert.equal(offline.appended.filter(node => node.tag === 'script').length, 1);
  const next = await runLoader(release('1.0.1'), { caches: first.caches, network });
  assert.equal(next.appended.length, 0);
  const rendererKey = [...first.caches.keys()].find(key => key.endsWith('/dist/reader.js'));
  first.caches.set(rendererKey, Buffer.from('broken cached bytes'));
  const corrupted = await runLoader(fixture, { caches: first.caches, network });
  assert.equal(corrupted.appended.length, 0);
});

test('all network mirrors stay on the same source SHA', async () => {
  const fixture = release();
  const result = await runLoader(fixture, { network: async url => {
    if (url.startsWith('https://raw.')) return new Response('', { status: 503 });
    const file = url.split('@' + commit + '/')[1];
    const bytes = file === 'fixed-release-manifest.json' ? fixture.manifest : fixture.assets[file];
    return new Response(bytes);
  } });
  assert.equal(result.appended.filter(node => node.tag === 'script').length, 1);
  assert.ok(result.requests.some(request => request.url.startsWith('https://cdn.jsdelivr.net/')));
  assert.ok(result.requests.every(request => request.url.includes(commit)));
});

test('editing only VERSION selects an immutable numeric release without executing its downloaded loader', async () => {
  const current = release(), next = release('1.0.1'), resolved = [];
  const result = await runLoader(current, { version: '1.0.1', resolve: async (repo, version) => {
    resolved.push([repo, version]);
    return { metadata: next.pin, regex: { replaceString: 'window.evil = true;' } };
  }, network: async url => {
    const file = url.split('/' + commit + '/')[1];
    const bytes = file === 'fixed-release-manifest.json' ? next.manifest : next.assets[file];
    return new Response(bytes || '', { status: bytes ? 200 : 404 });
  } });
  assert.deepEqual(resolved, [['Adirm007/reader', '1.0.1']]);
  assert.equal(result.window.DREAM_READER_FIXED.version, '1.0.1');
  assert.equal(result.appended.filter(node => node.tag === 'script').length, 1);
  assert.doesNotMatch(result.appended.at(-1).text, /window.evil/);
});

test('a requested numeric version cannot silently fall back to the embedded old version', async () => {
  const result = await runLoader(release(), { version: '9.0.0', resolve: async () => { throw new Error('版本尚未发布'); } });
  assert.equal(result.requests.length, 0);
  assert.equal(result.appended.length, 0);
  assert.match(result.elements.get('dream-loader-status').textContent, /尚未发布/);
});

test('the builder reads committed bytes and rejects mismatched versions and corrupt releases', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'reader-fixed-test-'));
  try {
    for (const folder of ['tools', 'regex', 'dist', 'source', 'gallery']) await mkdir(path.join(dir, folder));
    for (const file of ['build_release.py', 'build_fixed_release.py', 'publish_fixed_release.py', 'fixed-loader.html']) await copyFile(new URL('tools/' + file, root), path.join(dir, 'tools', file));
    const fixture = release();
    for (const [file, bytes] of Object.entries(fixture.assets)) await writeFile(path.join(dir, file), bytes);
    const ordinaryManifest = JSON.parse(fixture.manifest);
    ordinaryManifest.name = 'dream-reader-render';
    delete ordinaryManifest.resources;
    await writeFile(path.join(dir, 'release-manifest.json'), JSON.stringify(ordinaryManifest));
    await writeFile(path.join(dir, 'source', 'fixed-release-client.js'), 'window.DreamFixedReleaseClient = {};');
    await writeFile(path.join(dir, 'source', 'fixed-runtime.js'), '/* DREAM_FIXED_RUNTIME_BEGIN */\nwindow.fixedRuntime = true;\n/* DREAM_FIXED_RUNTIME_END */');
    await writeFile(path.join(dir, 'source', 'regex-update-guard.js'), 'window.regexGuard = true;');
    await writeFile(path.join(dir, 'source', 'release-updates.js'), 'window.releaseUpdates = true;');
    execFileSync('python', ['-c', [
      'import sys; sys.path.insert(0,"tools"); import build_release',
      'source={"replaceString":"<script>window.original=true;</script>"}',
      'first=build_release.install_release_tools(source)["replaceString"]',
      'second=build_release.install_release_tools(source)["replaceString"]',
      'assert first==second, "release tool injection must be idempotent"',
      'assert second.count("/* DREAM_FIXED_RUNTIME_BEGIN */")==1',
      'assert second.index("window.original")<second.index("window.DreamFixedReleaseClient")<second.index("window.fixedRuntime")<second.index("window.releaseUpdates")',
    ].join('\n')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    await writeFile(path.join(dir, 'gallery', '含 空格.txt'), '资源');
    await writeFile(path.join(dir, 'regex', '读者对话渲染-外链版.json'), JSON.stringify({ scriptName: 'legacy', findRegex: '<dream>(.*?)</dream>', replaceString: 'legacy' }));
    execFileSync('python', ['tools/build_fixed_release.py', '1.0.0', '--prepare-manifest'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    const preparedBytes = await readFile(path.join(dir, 'fixed-release-manifest.json'));
    const prepared = JSON.parse(preparedBytes);
    assert.equal(prepared.name, 'dream-reader-render-fixed');
    assert.equal(prepared.resources['gallery/含 空格.txt'].sha256, sha(Buffer.from('资源')));
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init'); git('config', 'user.email', 'fixed-test@example.invalid'); git('config', 'user.name', 'Fixed release test');
    git('add', '.'); git('commit', '-m', 'fixture');
    const sourceCommit = git('rev-parse', 'HEAD');
    const build = version => execFileSync('python', ['tools/build_fixed_release.py', version, sourceCommit], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // A dirty working-tree manifest must never replace committed bytes.
    await writeFile(path.join(dir, 'release-manifest.json'), '{}');
    build('1.0.0');
    const result = JSON.parse(await readFile(path.join(dir, 'regex', 'reader-fixed.regex.json')));
    assert.match(result.replaceString, new RegExp(sha(preparedBytes)));
    assert.match(result.replaceString, new RegExp(sourceCommit));
    assert.equal(result.scriptName, '读者对话渲染-固定版 v1.0.0');
    assert.equal(result.id, 'cfc0375e-3c5c-4ea1-8b7b-2093c7df0a11');
    assert.match(result.replaceString, /<!-- FIXED_RELEASE:\{"schema":1,/);
    const beforePackage = git('rev-parse', 'HEAD');
    const packaged = JSON.parse(execFileSync('python', ['tools/publish_fixed_release.py', '1.0.0', sourceCommit], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(git('rev-parse', 'HEAD'), beforePackage);
    assert.equal(packaged.sourceCommit, sourceCommit);
    assert.notEqual(packaged.distributionCommit, sourceCommit);
    assert.equal(git('rev-parse', `${packaged.distributionCommit}^`), sourceCommit);
    const tagBytes = execFileSync('git', ['show', `${packaged.distributionCommit}:regex/reader-fixed.regex.json`], { cwd: dir });
    assert.equal(sha(tagBytes), packaged.sha256);
    assert.match(JSON.parse(tagBytes).replaceString, new RegExp(sourceCommit));
    assert.equal('fixedRelease' in JSON.parse(tagBytes), false);
    assert.throws(() => build('1.0.1'));
    assert.throws(() => build('latest'));
    await writeFile(path.join(dir, 'release-manifest.json'), fixture.manifest);
    await writeFile(path.join(dir, 'dist', 'reader.js'), 'corrupt');
    git('add', '.'); git('commit', '-m', 'corrupt');
    assert.throws(() => execFileSync('python', ['tools/build_fixed_release.py', '1.0.0', git('rev-parse', 'HEAD')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }));
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith('reader-fixed-test-'));
    await rm(dir, { recursive: true, force: true });
  }
});
