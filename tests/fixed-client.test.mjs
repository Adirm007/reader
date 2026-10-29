import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
const source = await readFile(new URL('../source/fixed-release-client.js', import.meta.url), 'utf8');
const repository = 'Adirm007/reader';
const commit = '1234567890abcdef1234567890abcdef12345678';
const distributionCommit = 'b'.repeat(40);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture({repo=repository,version='1.0.0',marker={},replaceString}={}) {
  const metadata={schema:1,repository:repo,version,sourceCommit:commit,manifestSha256:'a'.repeat(64),...marker};
  const regex={id:'fixed-reader-test',scriptName:'Reader fixed test',findRegex:'<dream>(.*?)</dream>',
    replaceString:replaceString??`<!-- FIXED_RELEASE:${JSON.stringify(metadata)} -->\n<script>const VERSION="${version}";window.__downloadedCodeExecuted=true;throw Error('Downloaded code must never execute');</script>`};
  const bytes=Buffer.from(JSON.stringify(regex));
  return {metadata,regex,bytes,proof:{valid:true,verified:{repository:repo,version,distributionCommit,digest:digest(bytes)}},selected:{repository:repo,version}};
}
function staticNetwork(fixtures,{versions=fixtures.map(f=>f.selected.version),index,override}={}) {
  return async(url,options)=>{
    if(override){const r=await override(url,options);if(r!==undefined)return r;}
    if(url.endsWith('/fixed-updates/index.json')||url.endsWith('@fixed-updates/index.json'))return Response.json(index??{schema:1,repository,versions});
    for(const f of fixtures){
      if(url.endsWith(`/releases/v${f.selected.version}.json`))return Response.json(f.proof);
      if(url.includes('/releases/download/')||url.includes(`/${distributionCommit}/`)||url.includes(`@${distributionCommit}/`))return new Response(f.bytes);
    }
    throw Error('Unexpected URL '+url);
  };
}
function storage(){const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};}
function client({crypto=webcrypto,network=async()=>{throw Error('Unexpected network access');},localStorage}={}) {
  const requests=[],verifications=[];
  const window={crypto,localStorage,__downloadedCodeExecuted:false};
  // Transport tests substitute the cryptographic boundary; real signature verification is covered separately.
  window.__testVerifyBundle=async(bundle,repo,version)=>{verifications.push({bundle,repo,version});if(!bundle||bundle.valid!==true)throw Error('发布证明签名无效');return bundle.verified;};
  const context=vm.createContext({window,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,AbortController,setTimeout,clearTimeout,
    fetch:async(url,options)=>{requests.push({url,options});return network(url,options);}});
  const script=source.replace(/  \/\* GITHUB_RELEASE_VERIFY_BEGIN \*\/[\s\S]*?  \/\* GITHUB_RELEASE_VERIFY_END \*\//,
    '  async function verifyBundle(bundle,repository,version) { return root.__testVerifyBundle(bundle,repository,version); }');
  vm.runInContext(script,context,{timeout:1000});
  return {api:window.DreamFixedReleaseClient,window,requests,verifications};
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


test('latest verifies the numeric maximum using static JSON, without REST or downloaded regex execution',async()=>{
 const releases=[fixture({version:'0.9.0'}),fixture({version:'0.10.0'})],f=client({network:staticNetwork(releases)});
 const selected=await f.api.latest(repository);assert.equal(selected.version,'0.10.0');assert.equal(selected.distributionCommit,distributionCommit);
 assert.equal(f.requests.length,2);assert.equal(f.verifications.length,1);
 assert.ok(f.requests.every(r=>r.url.startsWith('https://raw.githubusercontent.com/Adirm007/reader/fixed-updates/')&&r.options.cache==='no-store'&&r.options.credentials==='omit'));
 assert.ok(f.requests.every(r=>!r.url.includes('api.github.com')));assert.equal(f.window.__downloadedCodeExecuted,false);
});
test('bad newest proof fails instead of choosing an older version',async()=>{
 const old=fixture(),current=fixture({version:'2.0.0'});current.proof.valid=false;
 const f=client({network:staticNetwork([old,current])});await assert.rejects(f.api.latest(repository),/签名无效/);
 assert.equal(f.verifications.length,1);assert.equal(f.verifications[0].version,'2.0.0');assert.equal(f.requests.length,2);
});
test('wrong repository, malformed, duplicate, equivalent and nonnumeric catalog versions fail',async()=>{
 const indexes=[null,[],{},{schema:2,repository,versions:[]},{schema:1,repository:'Adirm007/Protelysion',versions:['1.0']},
 {schema:1,repository,versions:['1.0','1.0']},{schema:1,repository,versions:['1.2','1.2.0']},
 ...['v1.0','latest','../evil','1.0/../evil',1.2,['1.0']].map(v=>({schema:1,repository,versions:[v]}))];
 for(const index of indexes){const f=client({network:async()=>Response.json(index)});await assert.rejects(f.api.latest(repository));assert.equal(f.requests.length,1);assert.equal(f.verifications.length,0);}
});
test('verified proof fields must match repository and version with exact digest types',async()=>{
 for(const change of [{repository:'Adirm007/Protelysion'},{version:'2.0.0'},{distributionCommit:'main'},{distributionCommit:[distributionCommit]},{digest:'sha256:'+'c'.repeat(64)},{digest:['c'.repeat(64)]}]){
 const r=fixture();Object.assign(r.proof.verified,change);const f=client({network:staticNetwork([r])});await assert.rejects(f.api.latest(repository),/发布证明与指定版本不一致/);assert.equal(f.requests.length,2);}
});
test('repository allowlist rejects unknown and inherited object names before network access',async()=>{
 const f=client();for(const repo of ['Adirm007/other','__proto__','toString','constructor']){const r=fixture({repo});assert.throws(()=>f.api.metadata(r.regex,repo),/仓库/);await assert.rejects(f.api.latest(repo),/仓库/);await assert.rejects(f.api.resolve(repo,'1.0'),/仓库/);await assert.rejects(f.api.download(r.selected),/仓库/);}assert.equal(f.requests.length,0);
});
test('manual VERSION must exist in catalog and permits an explicitly selected older release',async()=>{
 const old=fixture(),current=fixture({version:'2.0.0'}),f=client({localStorage:storage(),network:staticNetwork([old,current])});
 await f.api.latest(repository);assert.equal((await f.api.resolve(repository,'1.0.0')).metadata.version,'1.0.0');
 await assert.rejects(f.api.resolve(repository,'9.0.0'),/清单中没有该版本/);const count=f.requests.length;
 for(const bad of ['v1.0','../evil',1.2,['1.0']])await assert.rejects(f.api.resolve(repository,bad),/版本号格式无效/);
 assert.equal(f.requests.length,count);assert.equal(f.window.__downloadedCodeExecuted,false);
});
test('network failure falls back to the same catalog and proof on jsDelivr',async()=>{
 const r=fixture(),f=client({network:staticNetwork([r],{override:async url=>{if(url.startsWith('https://raw.'))throw Error('unavailable');}})});
 assert.equal((await f.api.latest(repository)).version,'1.0.0');assert.equal(f.requests.length,4);
 assert.equal(f.requests[1].url,'https://cdn.jsdelivr.net/gh/Adirm007/reader@fixed-updates/index.json');
 assert.equal(f.requests[3].url,'https://cdn.jsdelivr.net/gh/Adirm007/reader@fixed-updates/releases/v1.0.0.json');
});
test('HTTP failures or malformed JSON are failed checks, never an empty catalog',async()=>{
 for(const status of [403,404,429,500]){const f=client({network:async()=>new Response('failed',{status})});await assert.rejects(f.api.latest(repository),new RegExp('HTTP '+status));assert.equal(f.requests.length,2);}
 const f=client({network:async()=>new Response('bad json')});await assert.rejects(f.api.latest(repository));assert.equal(f.requests.length,1);
 const r=fixture(),g=client({network:staticNetwork([r],{override:async url=>{if(url.includes('/releases/'))return new Response('missing',{status:404});}})});
 await assert.rejects(g.api.latest(repository),/HTTP 404/);assert.equal(g.verifications.length,0);
});
test('empty valid catalog differs from failures and cannot roll back a previously verified higher version',async()=>{
 let fixtures=[];const f=client({localStorage:storage(),network:(url,options)=>staticNetwork(fixtures)(url,options)});
 assert.equal(await f.api.latest(repository),null);fixtures=[fixture({version:'2.0.0'})];assert.equal((await f.api.latest(repository)).version,'2.0.0');
 fixtures=[fixture()];await assert.rejects(f.api.latest(repository),/早于已验证版本/);fixtures=[];await assert.rejects(f.api.latest(repository),/早于已验证版本/);
});
test('blocked or full localStorage does not prevent valid verification',async()=>{
 const r=fixture();for(const localStorage of [{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},{getItem:()=>null,setItem(){throw Error('quota');}}]){
 const f=client({localStorage,network:staticNetwork([r])});assert.equal((await f.api.latest(repository)).version,'1.0.0');}
});
test('download rechecks proof and ignores snapshot digests or external addresses',async()=>{
 const r=fixture(),selected={...r.selected,digest:'f'.repeat(64),distributionCommit:'main',url:'https://attacker.invalid/evil'},f=client({network:staticNetwork([r])});
 const result=await f.api.download(selected);assert.equal(result.metadata.version,'1.0.0');assert.equal(f.verifications.length,1);assert.equal(f.requests[0].url,'https://raw.githubusercontent.com/Adirm007/reader/fixed-updates/releases/v1.0.0.json');assert.ok(f.requests.every(x=>!x.url.includes('attacker.invalid')));
 r.proof.valid=false;await assert.rejects(f.api.download(selected),/签名无效/);assert.equal(f.window.__downloadedCodeExecuted,false);
});
test('a valid digest cannot authorize a marker for another repository or version',async()=>{
 for(const marker of [{repository:'Adirm007/Protelysion'},{version:'2.0.0'}]){const r=fixture({marker}),f=client({network:staticNetwork([r])});await assert.rejects(f.api.download(r.selected),/标记与发布版本不一致/);assert.equal(f.requests.length,4);assert.equal(f.window.__downloadedCodeExecuted,false);}
});
test('same-size tampering fails SHA-256 on every mirror before JSON parsing',async()=>{
 const r=fixture(),f=client({network:staticNetwork([r],{override:async url=>{if(!url.includes('/fixed-updates/')&&!url.includes('@fixed-updates/'))return new Response(Buffer.alloc(r.bytes.length,0x20));}})});
 await assert.rejects(f.api.download(r.selected),/SHA-256 校验失败/);assert.equal(f.requests.length,4);assert.equal(f.window.__downloadedCodeExecuted,false);
});
test('downloads prefer the signed distribution commit static mirror without attachment CORS',async()=>{
 const r=fixture(),f=client({network:staticNetwork([r],{override:async url=>{if(url.startsWith('https://github.com/'))throw new TypeError('CORS');}})});
 const result=await f.api.download(r.selected);assert.equal(result.regex.replaceString,r.regex.replaceString);assert.equal(f.requests.length,2);
 assert.equal(f.requests[1].url,`https://raw.githubusercontent.com/${repository}/${distributionCommit}/regex/reader-fixed.regex.json`);assert.equal(f.window.__downloadedCodeExecuted,false);
});
test('corrupt raw artifact cannot bypass digest validation through jsDelivr fallback',async()=>{
 const r=fixture(),f=client({crypto:{},network:staticNetwork([r],{override:async url=>{if(url.startsWith('https://github.com/'))throw new TypeError('CORS');if(url.includes(`/${distributionCommit}/`))return new Response(Buffer.alloc(r.bytes.length,0x20));}})});
 assert.equal((await f.api.download(r.selected)).metadata.version,'1.0.0');assert.equal(f.requests.length,3);
 assert.equal(f.requests[2].url,`https://cdn.jsdelivr.net/gh/${repository}@${distributionCommit}/regex/reader-fixed.regex.json`);
});
test('oversize catalogs, proofs and artifacts fail before parsing or execution',async()=>{
 const r=fixture();for(const [match,limit] of [['index.json',1000000],['/releases/v',2000000],['/releases/download/',4000000]]){
 const f=client({network:staticNetwork([r],{override:async url=>{if(url.includes(match))return new Response('x',{headers:{'content-length':String(limit+1)}});if(match==='/releases/download/'&&!url.includes('/fixed-updates/')&&!url.includes('@fixed-updates/'))return new Response(Buffer.alloc(4000001));}})});
 await assert.rejects(match==='/releases/download/'?f.api.download(r.selected):f.api.latest(repository),/大小限制/);assert.equal(f.window.__downloadedCodeExecuted,false);}
});

function resourceRelease({path='dist/reader-runtime.js',manifestPatch,artifactPatch}={}) {
 const bytes=Buffer.from('export function start(){};export function stop(){}'),manifest={schema:1,name:'dream-reader-render-fixed',version:'1.0.0',files:{'reader-runtime.js':{path,bytes:bytes.length,sha256:digest(bytes)}},resources:{}};
 if(manifestPatch)manifestPatch(manifest);const manifestBytes=Buffer.from(JSON.stringify(manifest)),r=fixture({marker:{manifestSha256:digest(manifestBytes)}});
 const network=staticNetwork([r],{override:async url=>{
  if(url.includes('/'+commit+'/')||url.includes('@'+commit+'/'))return new Response(url.endsWith('fixed-release-manifest.json')?manifestBytes:artifactPatch?artifactPatch(bytes):bytes);
 }});
 return {r,bytes,manifestBytes,network};
}
test('runtime downloads follow signed regex to pinned manifest to exact resource hash without executing code',async()=>{
 const r=resourceRelease(),f=client({network:r.network}),file=await f.api.resource(r.r.selected,'reader-runtime.js');assert.deepEqual(Buffer.from(file.bytes),r.bytes);assert.equal(f.verifications.length,1);assert.equal(f.requests.length,4);assert.equal(f.window.__downloadedCodeExecuted,false);assert.ok(f.requests.slice(2).every(r=>r.url.includes(commit)));
});
test('signed resource acquisition rejects same-size tampering, path traversal and mismatched manifest version',async()=>{
 for(const options of [{artifactPatch:b=>Buffer.alloc(b.length,32)},{path:'dist/../evil.js'},{manifestPatch:m=>m.version='2.0.0'}]){
  const r=resourceRelease(options),f=client({network:r.network});await assert.rejects(f.api.resource(r.r.selected,'reader-runtime.js'));assert.equal(f.window.__downloadedCodeExecuted,false);
 }
});
test('a changed pinned manifest cannot authorize replacement resource bytes',async()=>{
 const r=resourceRelease(),f=client({network:async(url,options)=>url.endsWith('fixed-release-manifest.json')?new Response(Buffer.alloc(r.manifestBytes.length,32)):r.network(url,options)});
 await assert.rejects(f.api.resource(r.r.selected,'reader-runtime.js'),/清单 SHA-256/);assert.ok(f.requests.every(r=>!r.url.endsWith('/dist/reader-runtime.js')));
});
