import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const source=await readFile(new URL('../source/booksea-album.js',import.meta.url),'utf8');
const legacy=await readFile(new URL('../source/legacy-reader.js',import.meta.url),'utf8');
const music=legacy.slice(legacy.indexOf('var albumOrder='),legacy.indexOf("var FK='dream_font'"));
const plain=value=>JSON.parse(JSON.stringify(value));
const digest=bytes=>createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
function node(){const classes=new Set();return {style:{},children:[],textContent:'',innerHTML:'',classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},contains:x=>classes.has(x)},appendChild(child){this.children.push(child);},addEventListener(){},setAttribute(){}};}
function fixture({saved,current,fetcher}={}){
 const values=new Map(),calls=[],revoked=[],blobs=new Map(),events=new Map(),elements=new Map();let serial=0;
 if(saved)values.set('dream_albums',JSON.stringify(saved));if(current)values.set('dream_current_album',current);
 const audio={paused:true,src:'',plays:0,loads:0,preload:'auto',pause(){this.paused=true;},play(){this.paused=false;this.plays++;return Promise.resolve();},load(){this.loads++;},removeAttribute(name){if(name==='src')this.src='';},getAttribute(name){return name==='src'?this.src||null:null;},addEventListener(name,listener){events.set(name,listener);}};
 elements.set('bgm-player',audio);
 for(const id of ['record-btn','track-btn','track-list'])elements.set(id,node());
 const root={console,setTimeout,clearTimeout,AbortController,Blob,TextEncoder,TextDecoder,
  URL:{createObjectURL(blob){const url='blob:booksea-'+ ++serial;blobs.set(url,blob);return url;},revokeObjectURL(url){revoked.push(url);blobs.delete(url);}},
  localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))},
  document:{getElementById:id=>elements.get(id),createElement:node},
  addEventListener(){},removeEventListener(){},showToast(){},
  fetch:async(url,init)=>{calls.push({url,init});return fetcher?fetcher(url,init):new Response('not requested');},
  DreamFixedReleaseClient:{sha256:async bytes=>digest(bytes)},
 };
 root.window=root;root.parent=root;vm.createContext(root);vm.runInContext(source,root);vm.runInContext(music,root);
 function patch(index,bytes){const track=root.ReaderBookseaAlbum.catalog[index];track.bytes=bytes.byteLength;track.sha256=digest(bytes);return root.ReaderBookseaAlbum.songs[index].url;}
 return {root,audio,calls,revoked,blobs,values,patch,elements};
}

test('the sixth album contains all 124 Booksea BGM tracks pinned to one complete source commit',()=>{
 const f=fixture(),album=f.root.ReaderBookseaAlbum;
 assert.deepEqual(plain(f.root.albumOrder),['咖啡馆','读者们','失乐园','收录','私货','书海']);
 assert.equal(album.catalog.length,124);assert.equal(new Set(album.songs.map(song=>song.url)).size,124);
 assert.equal(album.catalog.reduce((sum,track)=>sum+track.bytes,0),191116535);
 assert.equal(album.commit,'49353c8bdfb3fa5544e8a65179c690c1757fac26');
 for(const track of album.catalog){assert.match(track.path,/^music\/[^/]+\.mp3$/);assert.match(track.sha256,/^[a-f0-9]{64}$/);assert.ok(track.name);}
 assert.ok(album.songs.every(song=>song.url.startsWith('https://raw.githubusercontent.com/Adirm007/Protelysion/'+album.commit+'/site/audio/music/')));
});

test('existing custom or empty playlists survive and the missing sixth album is added automatically',()=>{
 const saved={'咖啡馆':[{name:'玩家的歌',url:'https://example.test/custom.mp3'}],'读者们':[],'失乐园':[],'收录':[],'私货':[]},f=fixture({saved,current:'读者们'});
 for(const [name,songs] of Object.entries(saved))assert.deepEqual(plain(f.root.albums[name]),songs);
 assert.equal(f.root.albums['书海'].length,124);assert.equal(f.root.currentAlbum,'读者们');
 assert.deepEqual(JSON.parse(f.values.get('dream_albums'))['咖啡馆'],saved['咖啡馆']);
});

test('opening or selecting the Booksea album starts no audio download, including a saved Booksea selection',()=>{
 const f=fixture({current:'书海'});f.root.initPlaylist();
 assert.equal(f.audio.preload,'none');assert.equal(f.audio.src,'');assert.equal(f.calls.length,0);
 f.root.switchAlbum('咖啡馆');f.root.switchAlbum('书海');assert.equal(f.audio.src,'');assert.equal(f.calls.length,0);
});

test('playing fetches and verifies only the selected track and pause/resume reuses its single blob',async()=>{
 const bytes=new Uint8Array([1,2,3,4]),f=fixture({fetcher:()=>new Response(bytes)}),url=f.patch(0,bytes);
 assert.equal(await f.root.readerMusic.play(url),true);assert.equal(f.calls.length,1);assert.equal(f.audio.plays,1);assert.equal(f.blobs.size,1);assert.match(f.audio.src,/^blob:/);
 const blob=f.audio.src;f.root.readerMusic.pause();assert.equal(await f.root.readerMusic.resume(),true);
 assert.equal(f.calls.length,1);assert.equal(f.audio.src,blob);assert.equal(f.blobs.size,1);
});

test('same-size tampering is rejected and the second pinned mirror must pass the same digest',async()=>{
 const good=new Uint8Array([1,2,3,4]),bad=new Uint8Array([4,3,2,1]);let attempt=0;
 const f=fixture({fetcher:()=>new Response(++attempt===1?bad:good)}),url=f.patch(0,good);
 assert.equal(await f.root.readerMusic.play(url),true);assert.equal(f.calls.length,2);assert.match(f.calls[1].url,/cdn\.jsdelivr\.net\/gh\/Adirm007\/Protelysion@49353/);assert.equal(f.blobs.size,1);assert.equal(f.audio.plays,1);
 const broken=fixture({fetcher:()=>new Response(bad)}),brokenUrl=broken.patch(0,good);
 assert.equal(await broken.root.readerMusic.play(brokenUrl),false);assert.equal(broken.calls.length,2);assert.equal(broken.audio.src,'');assert.equal(broken.blobs.size,0);assert.equal(broken.audio.plays,0);
});

test('a late track download cannot overwrite the selection or start playback after switching albums',async()=>{
 const response=deferred(),bytes=new Uint8Array([1,2,3,4]),f=fixture({fetcher:()=>response.promise}),url=f.patch(0,bytes);
 const playing=f.root.readerMusic.play(url);assert.equal(f.root.readerMusic.loading,true);
 f.root.readerMusic.select('https://example.test/another.mp3');assert.equal(f.calls[0].init.signal.aborted,true);
 response.resolve(new Response(bytes));assert.equal(await playing,false);assert.equal(f.audio.src,'https://example.test/another.mp3');assert.equal(f.audio.plays,0);assert.equal(f.blobs.size,0);
});

test('a pending play can be paused and retried without the cancelled request playing later',async()=>{
 const first=deferred(),bytes=new Uint8Array([1,2,3,4]);let attempt=0;
 const f=fixture({fetcher:()=>++attempt===1?first.promise:new Response(bytes)}),url=f.patch(0,bytes),old=f.root.readerMusic.play(url);
 f.root.readerMusic.pause();assert.equal(f.root.readerMusic.loading,false);assert.equal(await f.root.readerMusic.resume(),true);
 const fresh=f.audio.src;first.resolve(new Response(bytes));assert.equal(await old,false);assert.equal(f.audio.src,fresh);assert.equal(f.audio.plays,1);assert.equal(f.blobs.size,1);
});

test('changing tracks or disposing releases blobs and disposes pending downloads',async()=>{
 const bytes=new Uint8Array([1,2,3,4]),f=fixture({fetcher:()=>new Response(bytes)}),one=f.patch(0,bytes),two=f.patch(1,bytes);
 await f.root.readerMusic.play(one);const prior=f.audio.src;await f.root.readerMusic.play(two);
 assert.ok(f.revoked.includes(prior));assert.equal(f.blobs.size,1);
 f.root.readerMusic.dispose();assert.equal(f.blobs.size,0);assert.equal(f.audio.src,'');assert.equal(await f.root.readerMusic.resume(),false);
 const response=deferred(),waiting=fixture({fetcher:()=>response.promise}),url=waiting.patch(0,bytes),job=waiting.root.readerMusic.play(url);
 waiting.root.readerMusic.dispose();response.resolve(new Response(bytes));assert.equal(await job,false);assert.equal(waiting.blobs.size,0);assert.equal(waiting.audio.plays,0);
});

test('the existing external-song path remains direct and never uses the Booksea downloader',async()=>{
 const f=fixture(),url='https://example.test/custom.mp3';f.root.readerMusic.select(url);
 assert.equal(f.audio.src,url);assert.equal(f.calls.length,0);assert.equal(await f.root.readerMusic.play(url),true);assert.equal(f.audio.plays,1);assert.equal(f.calls.length,0);
});
