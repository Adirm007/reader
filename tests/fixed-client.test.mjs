import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../source/fixed-release-client.js', import.meta.url), 'utf8');
const repository = 'Adirm007/reader';
const commit = '1234567890abcdef1234567890abcdef12345678';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture({ repo = repository, version = '1.0.0', marker = {}, replaceString } = {}) {
  const metadata = { schema: 1, repository: repo, version, sourceCommit: commit, manifestSha256: 'a'.repeat(64), ...marker };
  const regex = {
    id: 'fixed-reader-test', scriptName: 'Reader fixed test', findRegex: '<dream>(.*?)</dream>',
    replaceString: replaceString ?? `<!-- FIXED_RELEASE:${JSON.stringify(metadata)} -->\n<script>const VERSION="${version}"; window.__downloadedCodeExecuted = true; throw Error('Downloaded code must never execute');</script>`,
  };
  const bytes = Buffer.from(JSON.stringify(regex));
  const asset = {
    name: 'reader-fixed.regex.json', size: bytes.length, digest: `sha256:${digest(bytes)}`,
    browser_download_url: `https://github.com/${repo}/releases/download/v${version}/reader-fixed.regex.json`,
  };
  const release = { tag_name: `v${version}`, immutable: true, draft: false, prerelease: false, assets: [asset] };
  return { metadata, regex, bytes, asset, release, selected: { repository: repo, version, release } };
}

function client({ crypto = webcrypto, network = async () => { throw Error('Unexpected network access'); } } = {}) {
  const requests = [];
  const window = { crypto, __downloadedCodeExecuted: false };
  const context = vm.createContext({
    window, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, DataView, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return network(url, options);
    },
  });
  vm.runInContext(source, context, { timeout: 1000 });
  return { api: window.DreamFixedReleaseClient, window, requests };
}

for (const mode of ['native', 'software']) {
  test(`${mode} SHA-256 matches independent vectors including padding boundaries and a byte view`, async () => {
    let nativeCalls = 0;
    const crypto = mode === 'native' ? { subtle: { digest: (...args) => { nativeCalls++; return webcrypto.subtle.digest(...args); } } } : {};
    const { api } = client({ crypto });
    const vectors = [Buffer.alloc(0), Buffer.from('abc'), Buffer.from('你好，固定版本 🌙')];
    for (const size of [55, 56, 63, 64, 65, 127, 128, 1000000]) vectors.push(Buffer.alloc(size, 0x61));
    const backing = Buffer.from('skip this|the exact byte view|and this');
    vectors.push(backing.subarray(10, 29));
    assert.equal(digest(vectors[0]), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(digest(vectors[1]), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const bytes of vectors) assert.equal(await api.sha256(bytes), digest(bytes), `SHA-256 of ${bytes.length} bytes`);
    const buffer = Uint8Array.from([1, 2, 3, 4]).buffer;
    assert.equal(await api.sha256(buffer), digest(Buffer.from(buffer)));
    assert.equal(nativeCalls, mode === 'native' ? vectors.length + 1 : 0);
  });
}

test('numeric version comparison supports patch, calendar and trailing zero segments', () => {
  const { api } = client();
  for (const [a, b, expected] of [['0.9.0', '0.10.0', -1], ['1.2.10', '1.2.9', 1], ['2026.10.27.1', '2026.10.26.99', 1], ['1.2', '1.2.0', 0], ['0.0', '0.0.0.0', 0]]) {
    assert.equal(api.compare(a, b), expected);
    assert.equal(api.compare(b, a), -expected || 0);
  }
  for (const invalid of ['latest', 'v1.0.0', '1', '1.0-beta', '1.0/evil', '1.0\n', '123456789.0']) assert.throws(() => api.compare(invalid, '1.0.0'));
});

test('latest uses immutable stable releases and chooses numeric maximum rather than array order', async () => {
  const releases = [fixture({ version: '0.9.0' }).release, fixture({ version: '0.10.0' }).release];
  releases.push({ ...fixture({ version: '9.0.0' }).release, immutable: false });
  releases.push({ ...fixture({ version: '10.0.0' }).release, draft: true });
  releases.push({ ...fixture({ version: '11.0.0' }).release, prerelease: true });
  const f = client({ network: async () => Response.json(releases) });
  const selected = await f.api.latest(repository);
  assert.equal(selected.version, '0.10.0');
  assert.equal(f.requests.length, 1);
  assert.match(f.requests[0].url, /releases\?per_page=100&page=1$/);
  assert.equal(f.window.__downloadedCodeExecuted, false);
});

test('latest follows pagination before claiming which version is newest', async () => {
  const f = client({ network: async url => url.endsWith('page=1')
    ? Response.json([fixture({ version: '1.0.0' }).release], { headers: { link: '<https://api.github.com/repos/Adirm007/reader/releases?per_page=100&page=2>; rel="next"' } })
    : Response.json([fixture({ version: '2.0.0' }).release]) });
  assert.equal((await f.api.latest(repository)).version, '2.0.0');
  assert.equal(f.requests.length, 2);
});

test('mutable, draft, prerelease, missing digest and ambiguous asset are rejected before download', async () => {
  for (const change of [
    f => { f.release.immutable = false; }, f => { f.release.immutable = undefined; },
    f => { f.release.draft = true; }, f => { f.release.prerelease = true; },
    f => { delete f.asset.digest; }, f => { f.asset.digest = `sha256:${'a'.repeat(63)}`; },
    f => { f.release.assets.push({ ...f.asset }); }, f => { f.asset.size = 4000001; },
  ]) {
    const release = fixture(); change(release);
    const f = client();
    await assert.rejects(f.api.download(release.selected));
    assert.equal(f.requests.length, 0);
    assert.equal(f.window.__downloadedCodeExecuted, false);
  }
});

test('repository allowlist rejects unknown and inherited object property names', async () => {
  const f = client();
  for (const repo of ['Adirm007/other', '__proto__', 'toString', 'constructor']) {
    const release = fixture({ repo });
    assert.throws(() => f.api.metadata(release.regex, repo), /仓库/);
    await assert.rejects(f.api.download(release.selected), /仓库/);
  }
  assert.equal(f.requests.length, 0);
});

test('asset URL must match the exact project, release tag and stable attachment name', async () => {
  for (const url of [
    'https://github.com/attacker/reader/releases/download/v1.0.0/reader-fixed.regex.json',
    'https://github.com/Adirm007/reader/releases/download/v2.0.0/reader-fixed.regex.json',
    'https://github.com/Adirm007/reader/releases/download/v1.0.0/another.regex.json',
    'https://example.invalid/reader-fixed.regex.json',
  ]) {
    const release = fixture(); release.asset.browser_download_url = url;
    const f = client();
    await assert.rejects(f.api.download(release.selected), /指定仓库/);
    assert.equal(f.requests.length, 0);
  }
});

test('marker is parsed only as data and rejects missing, duplicated and incompatible fields', () => {
  const f = client();
  const good = fixture();
  assert.equal(f.api.metadata(good.regex, repository, '1.0.0').sourceCommit, commit);
  assert.equal(f.api.fromInstalled({ replace_string: good.regex.replaceString }, repository).version, '1.0.0');
  for (const release of [
    fixture({ replaceString: '<script>window.__downloadedCodeExecuted = true;</script>' }),
    fixture({ replaceString: good.regex.replaceString + good.regex.replaceString }),
    fixture({ marker: { repository: 'Adirm007/Protelysion' } }),
    fixture({ marker: { schema: 2 } }), fixture({ marker: { sourceCommit: 'main' } }),
    fixture({ marker: { manifestSha256: 'bad' } }),
  ]) assert.throws(() => f.api.metadata(release.regex, repository, '1.0.0'));
  assert.throws(() => f.api.metadata(good.regex, repository, '2.0.0'));
  assert.equal(f.window.__downloadedCodeExecuted, false);
});

test('marker version and hashes must be strings, not coercible JSON numbers or arrays', () => {
  const { api } = client();
  for (const marker of [{ version: 1.2 }, { version: ['1.0.0'] }, { sourceCommit: [commit] }, { manifestSha256: ['a'.repeat(64)] }]) {
    assert.throws(() => api.metadata(fixture({ marker }).regex, repository));
  }
});

test('installed version honors the one edited VERSION number without evaluating downloaded JavaScript', () => {
  const f = client();
  const release = fixture();
  const edited = release.regex.replaceString.replace('const VERSION="1.0.0"', 'const VERSION="2.0.0"');
  const selected = f.api.fromInstalled({ replace_string: edited }, repository);
  assert.equal(selected.version, '2.0.0');
  assert.equal(selected.sourceCommit, commit);
  assert.equal(selected.manifestSha256, release.metadata.manifestSha256);
  assert.throws(() => f.api.fromInstalled({ replace_string: edited.replace('const VERSION="2.0.0"', 'const OTHER="2.0.0"') }, repository));
  assert.throws(() => f.api.fromInstalled({ replace_string: edited + '\nconst VERSION="3.0.0";' }, repository));
  assert.equal(f.window.__downloadedCodeExecuted, false);
});

test('a valid digest does not authorize a marker for another repository or requested version', async () => {
  for (const marker of [{ repository: 'Adirm007/Protelysion' }, { version: '2.0.0' }]) {
    const release = fixture({ marker });
    const f = client({ network: async () => new Response(release.bytes) });
    await assert.rejects(f.api.download(release.selected), /标记与发布版本不一致/);
    assert.equal(f.requests.length, 3);
    assert.equal(f.window.__downloadedCodeExecuted, false);
  }
});

test('same-size tampering fails SHA-256 on every mirror before JSON is interpreted', async () => {
  const release = fixture();
  const changed = Buffer.alloc(release.bytes.length, 0x20);
  const f = client({ network: async () => new Response(changed) });
  await assert.rejects(f.api.download(release.selected), /SHA-256 校验失败/);
  assert.equal(f.requests.length, 3);
  assert.equal(f.window.__downloadedCodeExecuted, false);
});

test('release attachment CORS failure uses its exact tag raw mirror with the API digest', async () => {
  const release = fixture();
  const f = client({ network: async url => {
    if (url === release.asset.browser_download_url) throw new TypeError('Failed to fetch (CORS)');
    assert.equal(url, 'https://raw.githubusercontent.com/Adirm007/reader/v1.0.0/regex/reader-fixed.regex.json');
    return new Response(release.bytes);
  } });
  const result = await f.api.download(release.selected);
  assert.equal(result.metadata.version, '1.0.0');
  assert.equal(result.regex.replaceString, release.regex.replaceString);
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every(request => request.options.credentials === 'omit'));
  assert.ok(f.requests.every(request => !/\/main\/|@main|github\.io|\/latest\//.test(request.url)));
  assert.equal(f.window.__downloadedCodeExecuted, false);
});

test('a corrupt raw mirror cannot bypass digest validation through jsDelivr fallback', async () => {
  const release = fixture();
  const f = client({ crypto: {}, network: async url => {
    if (url === release.asset.browser_download_url) throw new TypeError('CORS');
    if (url.startsWith('https://raw.')) return new Response(Buffer.alloc(release.bytes.length, 0x20));
    assert.equal(url, 'https://cdn.jsdelivr.net/gh/Adirm007/reader@v1.0.0/regex/reader-fixed.regex.json');
    return new Response(release.bytes);
  } });
  assert.equal((await f.api.download(release.selected)).metadata.version, '1.0.0');
  assert.equal(f.requests.length, 3);
  assert.equal(f.window.__downloadedCodeExecuted, false);
});

test('403 or 429 is a failed check, never an empty/latest-null result', async () => {
  for (const status of [403, 429]) {
    const f = client({ network: async () => Response.json({ message: 'rate limit exceeded' }, { status }) });
    await assert.rejects(f.api.latest(repository), /限流.*无法确认更新/);
    await assert.rejects(f.api.resolve(repository, '1.0.0'), /限流/);
    assert.equal(f.requests.length, 2);
    assert.equal(f.window.__downloadedCodeExecuted, false);
  }
});

test('a complete empty release list is distinct from a broken API response', async () => {
  const empty = client({ network: async () => Response.json([]) });
  assert.equal(await empty.api.latest(repository), null);
  const malformed = client({ network: async () => Response.json({ message: 'unexpected response' }) });
  await assert.rejects(malformed.api.latest(repository), /列表格式异常/);
  const invalidJson = client({ network: async () => new Response('this is not JSON') });
  await assert.rejects(invalidJson.api.latest(repository));
});
