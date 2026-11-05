/* DREAM_HOSTED_RUNTIME_STORE_BEGIN */
(function(root){
  'use strict';
  var KEY='dream_reader_hosted_runtime_selected_v1',CACHE='dream-reader-hosted-runtime-v1',REPOSITORY='Adirm007/reader';
  var VERSION=/^\d{1,8}(?:\.\d{1,8}){1,5}$/,HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/,MAX_BYTES=8000000;
  var PREFIX='https://reader-runtime-cache.invalid/v1/sha256/';
  function host(){return root.parent||root;}
  function message(error){return String(error&&error.message||error);}
  function codeKey(sha256){return PREFIX+sha256+'.js';}
  function selection(value){
    if(!value||value.schema!==1||value.repository!==REPOSITORY||typeof value.version!=='string'||!VERSION.test(value.version)
      ||typeof value.sourceCommit!=='string'||!HEX40.test(value.sourceCommit)||typeof value.manifestSha256!=='string'||!HEX64.test(value.manifestSha256)
      ||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>MAX_BYTES||typeof value.sha256!=='string'||!HEX64.test(value.sha256)
      ||value.codeKey!==codeKey(value.sha256))throw Error('已选读者运行版本的本地记录格式无效');
    return {schema:1,repository:REPOSITORY,version:value.version,sourceCommit:value.sourceCommit,manifestSha256:value.manifestSha256,bytes:value.bytes,sha256:value.sha256,codeKey:value.codeKey};
  }
  function artifactSelection(artifact){
    var pin=artifact&&artifact.metadata,spec=artifact&&artifact.spec;
    if(!pin||pin.schema!==1||!spec||spec.path!=='dist/reader-runtime.js')throw Error('不是读者常驻运行资源');
    return selection({schema:pin.schema,repository:pin.repository,version:pin.version,sourceCommit:pin.sourceCommit,manifestSha256:pin.manifestSha256,bytes:spec.bytes,sha256:spec.sha256,codeKey:codeKey(spec.sha256)});
  }
  function bytesOf(value){
    if(value instanceof ArrayBuffer)return new Uint8Array(value.slice(0));
    if(ArrayBuffer.isView(value))return new Uint8Array(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
    throw Error('读者运行资源字节格式无效');
  }
  async function digest(bytes){
    var client=root.DreamFixedReleaseClient;
    if(client&&typeof client.sha256==='function')return client.sha256(bytes);
    var crypto=host().crypto||root.crypto;
    if(!crypto||!crypto.subtle||typeof crypto.subtle.digest!=='function'){
      if(typeof softwareSHA256==='function')return softwareSHA256(bytes);
      throw Error('本地 SHA-256 校验不可用');
    }
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(function(value){return value.toString(16).padStart(2,'0');}).join('');
  }
  async function checked(bytes,selected){
    if(bytes.byteLength!==selected.bytes||await digest(bytes)!==selected.sha256)throw Error('本地读者运行资源的大小或 SHA-256 不符');
    var code=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return {metadata:{schema:1,repository:REPOSITORY,version:selected.version,sourceCommit:selected.sourceCommit,manifestSha256:selected.manifestSha256},spec:{path:'dist/reader-runtime.js',bytes:selected.bytes,sha256:selected.sha256},bytes:bytes,code:code};
  }
  async function cache(){var storage=host().caches;if(!storage||typeof storage.open!=='function')throw Error('浏览器不支持持久运行资源缓存');return storage.open(CACHE);}
  async function cached(storage,selected){var response=await storage.match(selected.codeKey);if(!response||!response.ok)throw Error('已选读者运行资源的本地缓存不存在');return checked(new Uint8Array(await response.arrayBuffer()),selected);}
  // Reading a saved selection never fetches metadata or runtime code from the network.
  async function read(){
    try{
      var raw=host().localStorage.getItem(KEY);if(raw===null)return {artifact:null,error:null};
      if(typeof raw!=='string'||raw.length>4096)throw Error('已选读者运行版本的本地记录格式无效');
      var selected=selection(JSON.parse(raw));return {artifact:await cached(await cache(),selected),error:null};
    }catch(error){return {artifact:null,error:'已选读者运行版本无法读取，请使用卡内版本：'+message(error)};}
  }
  // The caller obtains and verifies the release first. Recheck its exact bytes here, then read
  // the saved code back before changing the small selection record. A failed save keeps the old selection.
  async function save(artifact,assertCurrent){
    if(typeof assertCurrent==='function')assertCurrent();
    var selected=artifactSelection(artifact),bytes=bytesOf(artifact.bytes);await checked(bytes,selected);
    var storage=await cache();
    if(typeof assertCurrent==='function')assertCurrent();
    await storage.put(selected.codeKey,new Response(bytes,{status:200,headers:{'Content-Type':'text/javascript; charset=utf-8'}}));
    var saved=await cached(storage,selected);
    if(typeof assertCurrent==='function')assertCurrent();
    var local=host().localStorage,previousRaw=local.getItem(KEY);
    local.setItem(KEY,JSON.stringify(selected));
    // The new code is confirmed and selected. Keep only that selection's code, without touching
    // unrelated entries or failing an already committed update when cache cleanup is unavailable.
    try{
      var previous=previousRaw&&previousRaw.length<=4096?selection(JSON.parse(previousRaw)):null;
      if(previous&&previous.codeKey!==selected.codeKey)await storage.delete(previous.codeKey);
    }catch(error){}
    return saved;
  }
  // Leave immutable byte entries in the cache; only the selected version controls startup.
  function clear(){host().localStorage.removeItem(KEY);}
  root.ReaderHostedRuntimeStore=Object.freeze({key:KEY,cacheName:CACHE,read:read,save:save,clear:clear});
})(window);
/* DREAM_HOSTED_RUNTIME_STORE_END */
