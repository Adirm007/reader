import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

let chromium;
try{({chromium}=createRequire(new URL('../../_tools/shot/package.json',import.meta.url))('playwright-core'));}catch{}
const chrome=process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const album=await readFile(new URL('../source/booksea-album.js',import.meta.url),'utf8');
const legacy=await readFile(new URL('../source/legacy-reader.js',import.meta.url),'utf8');
const music=legacy.slice(legacy.indexOf('var albumOrder='),legacy.indexOf("var FK='dream_font'"));

function silence(){
 const buffer=Buffer.alloc(44+16000);buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(buffer.length-44,40);return buffer;
}

test('Booksea music uses no startup/album-selection request and plays one verified track in Chromium',{skip:!chromium||!existsSync(chrome),timeout:45000},async()=>{
 const wav=silence(),sha=createHash('sha256').update(wav).digest('hex');
 const fixture='<!doctype html><html><body><audio id="bgm-player"></audio><div id="record-btn"></div><div id="track-btn"></div><div id="track-list"></div><script>localStorage.setItem("dream_current_album","书海");window.showToast=function(){};window.DreamFixedReleaseClient={sha256:async function(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");}};window.__revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{__revoked.push(url);revoke(url);};</script><script src="/album.js"></script><script src="/music.js"></script></body></html>';
 const server=createServer((request,response)=>{response.setHeader('Content-Type',request.url.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');response.end(request.url==='/album.js'?album:request.url==='/music.js'?music:fixture);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:chrome,headless:true,args:['--autoplay-policy=no-user-gesture-required']}),page=await browser.newPage();
 const requests=[],errors=[];let hold=false,releaseHold=null,failPrimary=false;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();if(url.startsWith(origin)||url.startsWith('blob:'))return route.continue();
  if(url.includes('/site/audio/music/')){
   requests.push(url);if(hold)await new Promise(resolve=>releaseHold=resolve);
   const body=failPrimary&&url.startsWith('https://raw.')?Buffer.from(wav).fill(1,44,45):wav;
   try{await route.fulfill({status:200,body,contentType:'audio/mpeg',headers:{'Access-Control-Allow-Origin':'*'}});}catch{}
   return;
  }
  return route.abort();
 });
 try{
  await page.goto(origin);await page.evaluate(()=>initPlaylist());await page.waitForTimeout(100);
  assert.equal(requests.length,0);assert.equal(await page.locator('audio').getAttribute('src'),null);assert.equal(await page.evaluate(()=>audio.preload),'none');
  await page.evaluate(()=>{switchAlbum('咖啡馆');switchAlbum('书海');});assert.equal(requests.length,0);
  await page.evaluate(({sha,bytes})=>{for(const track of ReaderBookseaAlbum.catalog){track.bytes=bytes;track.sha256=sha;}}, {sha,bytes:wav.length});
  assert.equal(await page.evaluate(()=>togglePlay()),true);
  assert.equal(requests.length,1);assert.equal(await page.evaluate(()=>audio.paused),false);assert.match(await page.locator('audio').getAttribute('src'),/^blob:/);
  await page.evaluate(()=>readerMusic.pause());const first=await page.locator('audio').getAttribute('src');
  assert.equal(await page.evaluate(()=>readerMusic.resume()),true);assert.equal(requests.length,1);await page.evaluate(()=>readerMusic.pause());
  hold=true;await page.evaluate(()=>{playTrack(1);window.__pending=togglePlay();});
  await page.waitForFunction(()=>readerMusic.loading);while(!releaseHold)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(await page.evaluate(first=>__revoked.includes(first),first));
  await page.evaluate(()=>switchAlbum('咖啡馆'));hold=false;releaseHold();
  assert.equal(await page.evaluate(()=>__pending),false);assert.equal(await page.evaluate(()=>audio.paused),true);assert.ok(!(await page.locator('audio').getAttribute('src')).startsWith('blob:'));
  failPrimary=true;await page.evaluate(()=>switchAlbum('书海'));const before=requests.length;
  assert.equal(await page.evaluate(()=>togglePlay()),true);assert.equal(requests.length-before,2);assert.match(requests.at(-1),/cdn\.jsdelivr\.net/);

  // Exercise the real legacy ended handler: reaching the end must select, fetch,
  // verify and play the next song without another click or a whole-album fetch.
  failPrimary=false;const beforeList=requests.length;
  await page.evaluate(()=>{setPlayMode('list');audio.currentTime=Math.max(0,audio.duration-.01);});
  await page.waitForFunction(()=>currentTrackIndex===1&&!readerMusic.loading&&!audio.paused);
  await page.evaluate(()=>readerMusic.pause());
  assert.equal(requests.length-beforeList,1);
  assert.equal(requests.at(-1),await page.evaluate(()=>ReaderBookseaAlbum.songs[1].url));
  assert.equal(await page.evaluate(()=>currentTrackIndex),1);

  const beforeRandom=requests.length;
  await page.evaluate(async()=>{setPlayMode('random');Math.random=()=>.5;await readerMusic.resume();audio.currentTime=Math.max(0,audio.duration-.01);});
  await page.waitForFunction(()=>currentTrackIndex===62&&!readerMusic.loading&&!audio.paused);
  await page.evaluate(()=>readerMusic.pause());
  assert.equal(requests.length-beforeRandom,1);
  assert.equal(requests.at(-1),await page.evaluate(()=>ReaderBookseaAlbum.songs[62].url));
  assert.equal(await page.evaluate(()=>currentTrackIndex),62);

  const last=await page.locator('audio').getAttribute('src');await page.evaluate(()=>readerMusic.dispose());
  assert.equal(await page.locator('audio').getAttribute('src'),null);assert.ok(await page.evaluate(last=>__revoked.includes(last),last));assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
