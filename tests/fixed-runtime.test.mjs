import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const client=await readFile(new URL('../source/fixed-release-client.js',import.meta.url),'utf8');
const runtime=await readFile(new URL('../source/fixed-runtime.js',import.meta.url),'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex');
function setup({fixed=true,bad=false}={}){
  const assets={'gallery/links.txt':Buffer.from('external | https://media.example/cg.png'),'personas/女孩.json':Buffer.from('{"name":"snapshot"}'),'worldbook/manifest.json':Buffer.from('{"version":"1.0.0"}')};
  const resources=Object.fromEntries(Object.entries(assets).map(([path,bytes])=>[path,{path,bytes:bytes.length,sha256:hash(bytes)}]));
  const requests=[],bases=['https://raw.githubusercontent.com/Adirm007/reader/'+'a'.repeat(40)+'/','https://cdn.jsdelivr.net/gh/Adirm007/reader@'+'a'.repeat(40)+'/'];
  const original=()=>['live'];
  const root={console,URL,TextEncoder,TextDecoder,Uint8Array,DataView,ArrayBuffer,AbortController,Response,Blob,setTimeout,clearTimeout,addEventListener(){},dreamGalleryBases:original,dreamGalleryIsImage:n=>/\.png$/.test(n),dreamGalleryFileItem:n=>({name:n,urls:[bases[0]+'gallery/'+n]}),dreamGalleryParseLinks:t=>t?[{external:true,urls:['https://media.example/cg.png']}]:[],fetch:async url=>{requests.push(String(url));const path=decodeURIComponent(String(url).slice(bases.find(b=>String(url).startsWith(b))?.length||0)),bytes=assets[path];if(!bytes)return new Response('missing',{status:404});return new Response(bad?Buffer.alloc(bytes.length,33):bytes);}};
  if(fixed)root.DREAM_READER_FIXED={repository:'Adirm007/reader',version:'1.0.0',sourceCommit:'a'.repeat(40),manifestSha256:'b'.repeat(64),bases,manifest:{resources}};
  root.window=root;vm.createContext(root);vm.runInContext(client,root);vm.runInContext(runtime,root);return {root,requests,assets,original};
}
test('fixed resource hooks add no automatic downloads, polling, fonts or chess preloads',()=>{
  const f=setup();assert.equal(f.requests.length,0);assert.equal(f.root.DREAM_FIXED_STOCKFISH_URL,undefined);
  const live=setup({fixed:false});assert.equal(live.root.dreamGalleryBases,live.original);assert.equal(live.root.DREAM_FIXED_RESOURCE,undefined);
});
test('directory listing comes from the pinned hash catalog without querying GitHub contents/main',async()=>{
  const f=setup(),url=f.root.dreamDlcApi(),listing=JSON.parse(await f.root.dreamFetchText(url));assert.equal(f.requests.length,0);assert.equal(listing[0].name,'女孩.json');assert.match(listing[0].download_url,/a{40}/);assert.doesNotMatch(url,/main/);
  await assert.rejects(f.root.dreamFetchText(url.replace('a'.repeat(40),'main')),/动态目录/);
});
test('persona and worldbook reads verify pinned bytes even on LAN HTTP without Web Crypto',async()=>{
  const f=setup(),url=f.root.dreamGalleryBases()[0]+'personas/'+encodeURIComponent('女孩.json');assert.equal(JSON.parse(await f.root.dreamFetchText(url)).name,'snapshot');assert.equal(f.requests.length,1);assert.match(f.requests[0],/a{40}/);
  assert.equal(await f.root.dreamWbSha('hello'),hash('hello'));
  await assert.rejects(f.root.dreamFetchText('https://evil.example/reader/main/worldbook/manifest.json'));
});
test('equal-size secondary resource tampering fails across all pinned mirrors',async()=>{
  const f=setup({bad:true});await assert.rejects(f.root.DREAM_FIXED_RESOURCE.read('personas/女孩.json'),/校验失败/);assert.equal(f.requests.length,2);assert.ok(f.requests.every(u=>u.includes('a'.repeat(40))));
});
test('the pinned external CG link list is retained instead of silently removing existing gallery content',async()=>{
  const f=setup(),items=await f.root.dreamGalleryLoad();assert.equal(items.length,1);assert.equal(items[0].external,true);assert.equal(items[0].urls[0],'https://media.example/cg.png');assert.equal(f.requests.length,1);assert.match(f.requests[0],/gallery\/links.txt$/);
});
