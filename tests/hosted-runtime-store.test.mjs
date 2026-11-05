import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
const source=await readFile(new URL('../source/hosted-runtime-store.js',import.meta.url),'utf8');
const clientSource=(await readFile(new URL('../source/fixed-release-client.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const softwareHashes=clientSource.match(/  function softwareSHA256\(input\) \{[\s\S]*?\n  \}\n(?=  async function sha256)/g);
assert.equal(softwareHashes?.length,1,'the bundled software hash must come from one existing pure implementation');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function artifact(version='2.0',code='export function start(){} export function stop(){}'){
 const bytes=Buffer.from(code);return {metadata:{schema:1,repository:'Adirm007/reader',version,sourceCommit:'a'.repeat(40),manifestSha256:'b'.repeat(64)},spec:{path:'dist/reader-runtime.js',bytes:bytes.length,sha256:hash(bytes)},bytes};
}
function fixture(previous,{software=false}={}){
 const values=previous?.values||new Map(),entries=previous?.entries||new Map(),calls={get:0,open:0,match:0,put:0,fetch:0};
 const deleted=[];
 const cache={async match(key){calls.match++;return entries.get(key)?.clone();},async put(key,response){calls.put++;entries.set(key,response.clone());},async delete(key){deleted.push(key);return entries.delete(key);}};
 const host={crypto:webcrypto,localStorage:{getItem(key){calls.get++;return values.get(key)??null;},setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},caches:{async open(){calls.open++;return cache;}}};
 const root={parent:host};
 const context=vm.createContext({window:root,TextDecoder,Uint8Array,ArrayBuffer,Response,fetch(){calls.fetch++;throw Error('Unexpected network access');}});
 if(software)vm.runInContext(softwareHashes[0],context);
 vm.runInContext(source,context);
 return {api:root.ReaderHostedRuntimeStore,root,host,cache,values,entries,calls,deleted};
}
test('startup without a selection reads one small record and performs no cache or network work',async()=>{
 const f=fixture(),result=await f.api.read();assert.equal(result.artifact,null);assert.equal(result.error,null);
 assert.deepEqual(f.calls,{get:1,open:0,match:0,put:0,fetch:0});
});
test('manual save persists verified bytes outside localStorage and reload reads only that local selection',async()=>{
 const f=fixture(),input=artifact(),saved=await f.api.save(input),metadata=JSON.parse(f.values.get(f.api.key));
 assert.equal(saved.code,input.bytes.toString());assert.equal(metadata.version,'2.0');assert.equal(metadata.sha256,input.spec.sha256);
 assert.ok(f.values.get(f.api.key).length<700);assert.equal(f.values.get(f.api.key).includes('export function'),false);
 const reloaded=fixture(f),result=await reloaded.api.read();assert.equal(result.error,null);assert.equal(result.artifact.code,saved.code);
 assert.deepEqual(reloaded.calls,{get:1,open:1,match:1,put:0,fetch:0});
});
test('a missing, corrupt or unavailable runtime cache falls back without fetching or replacing the selection',async()=>{
 for(const mode of ['missing','corrupt','unavailable']){
  const f=fixture();await f.api.save(artifact());const before=f.values.get(f.api.key),selected=JSON.parse(before);
  if(mode==='missing')f.entries.clear();
  if(mode==='corrupt')f.entries.set(selected.codeKey,new Response('x'.repeat(selected.bytes)));
  if(mode==='unavailable')f.host.caches.open=async()=>{throw Error('Storage disabled');};
  const result=await f.api.read();assert.equal(result.artifact,null);assert.match(result.error,/使用卡内版本/);assert.equal(f.values.get(f.api.key),before);assert.equal(f.calls.fetch,0);
 }
});
test('malformed or foreign selection metadata is rejected before reading code',async()=>{
 const initial=fixture();await initial.api.save(artifact());const selected=JSON.parse(initial.values.get(initial.api.key));
 for(const changes of [{repository:'Other/reader'},{schema:2},{version:2},{sourceCommit:'bad'},{manifestSha256:'bad'},{bytes:8000001},{sha256:'bad'},{codeKey:'https://attacker.invalid/code.js'}]){
  const f=fixture();f.values.set(f.api.key,JSON.stringify({...selected,...changes}));const result=await f.api.read();
  assert.equal(result.artifact,null);assert.ok(result.error);assert.equal(f.calls.open,0);assert.equal(f.calls.fetch,0);
 }
});
test('saving rejects changed bytes, wrong resources and foreign repositories before any cache write',async()=>{
 for(const mutate of [input=>input.bytes[0]^=1,input=>input.spec.bytes++,input=>input.metadata.repository='Other/reader',input=>input.spec.path='other.js',input=>input.metadata.version=2]){
  const f=fixture(),input=artifact();mutate(input);await assert.rejects(f.api.save(input));assert.equal(f.calls.put,0);assert.equal(f.values.has(f.api.key),false);
 }
});
test('failed cache writes or readback checks leave the old selected runtime intact',async()=>{
 for(const mode of ['write','readback']){
  const f=fixture(),old=artifact('1.0');await f.api.save(old);const before=f.values.get(f.api.key);
  if(mode==='write')f.cache.put=async()=>{throw Error('Quota exceeded');};
  else{const put=f.cache.put;f.cache.put=async(key,response)=>{await put(key,response);f.entries.set(key,new Response('corrupted'));};}
  await assert.rejects(f.api.save(artifact('2.0','new runtime code')));assert.equal(f.values.get(f.api.key),before);
  assert.equal((await f.api.read()).artifact.code,old.bytes.toString());assert.equal(f.calls.fetch,0);
 }
});
test('a metadata quota failure keeps the previous selection usable',async()=>{
 const f=fixture(),old=artifact('1.0');await f.api.save(old);const before=f.values.get(f.api.key);
 f.host.localStorage.setItem=()=>{throw Error('Quota exceeded');};await assert.rejects(f.api.save(artifact('2.0','new runtime code')),/Quota/);
 assert.equal(f.values.get(f.api.key),before);assert.equal((await f.api.read()).artifact.code,old.bytes.toString());
});
test('blocked browser storage reports a local fallback and clear removes only the selection',async()=>{
 const f=fixture();await f.api.save(artifact());const count=f.entries.size;f.api.clear();assert.equal((await f.api.read()).artifact,null);assert.equal(f.entries.size,count);
 f.host.localStorage.getItem=()=>{throw Error('Storage blocked');};const result=await f.api.read();assert.equal(result.artifact,null);assert.match(result.error,/Storage blocked/);
});
test('a stale save guard cannot write or select a new runtime even after its code was cached',async()=>{
 for(const stage of ['before-save','after-cache']){
  const f=fixture(),old=artifact('1.0');await f.api.save(old);const before=f.values.get(f.api.key),writes=f.calls.put;
  let current=stage!=='before-save';
  if(stage==='after-cache'){const put=f.cache.put;f.cache.put=async(...args)=>{await put(...args);current=false;};}
  await assert.rejects(f.api.save(artifact('2.0','new runtime code'),()=>{if(!current)throw Error('Chat changed');}),/Chat changed/);
  assert.equal(f.values.get(f.api.key),before);assert.equal((await f.api.read()).artifact.code,old.bytes.toString());assert.equal(f.deleted.length,0);
  if(stage==='before-save')assert.equal(f.calls.put,writes);
 }
});
test('successful manual updates remove only the previous selected code instead of accumulating old runtimes',async()=>{
 const f=fixture(),unrelated='https://other.invalid/player-code.js';f.entries.set(unrelated,new Response('keep'));
 await f.api.save(artifact('1.0','first runtime'));const first=JSON.parse(f.values.get(f.api.key)).codeKey;
 await f.api.save(artifact('2.0','second runtime'));const second=JSON.parse(f.values.get(f.api.key)).codeKey;
 await f.api.save(artifact('3.0','third runtime'));const third=JSON.parse(f.values.get(f.api.key)).codeKey;
 assert.deepEqual(f.deleted,[first,second]);assert.deepEqual([...f.entries.keys()],[unrelated,third]);assert.equal((await f.api.read()).artifact.metadata.version,'3.0');
});
test('failed metadata saves preserve the old cache and invalid prior keys cannot authorize cache cleanup',async()=>{
 const f=fixture();await f.api.save(artifact('1.0','first runtime'));const before=f.values.get(f.api.key),oldKey=JSON.parse(before).codeKey;
 const set=f.host.localStorage.setItem;f.host.localStorage.setItem=()=>{throw Error('Quota exceeded');};
 await assert.rejects(f.api.save(artifact('2.0','second runtime')),/Quota/);assert.equal(f.entries.has(oldKey),true);assert.deepEqual(f.deleted,[]);
 f.host.localStorage.setItem=set;const unrelated='https://other.invalid/keep';f.entries.set(unrelated,new Response('keep'));
 f.values.set(f.api.key,JSON.stringify({...JSON.parse(before),codeKey:unrelated}));await f.api.save(artifact('3.0','third runtime'));
 assert.equal(f.entries.has(unrelated),true);assert.deepEqual(f.deleted,[]);
});
test('the bundled pure SHA-256 validates save and reload without Web Crypto or a release client',async()=>{
 const f=fixture(null,{software:true});delete f.host.crypto;const input=artifact();
 const saved=await f.api.save(input);assert.equal(saved.code,input.bytes.toString());assert.equal(f.root.DreamFixedReleaseClient,undefined);
 const reloaded=fixture(f,{software:true});delete reloaded.host.crypto;
 const read=await reloaded.api.read();assert.equal(read.error,null);assert.equal(read.artifact.code,saved.code);assert.equal(reloaded.calls.fetch,0);
 const selected=JSON.parse(f.values.get(f.api.key));f.entries.set(selected.codeKey,new Response('x'.repeat(selected.bytes)));
 const corrupt=await reloaded.api.read();assert.equal(corrupt.artifact,null);assert.match(corrupt.error,/SHA-256/);assert.equal(reloaded.calls.fetch,0);
});
