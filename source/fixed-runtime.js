/* DREAM_FIXED_RUNTIME_BEGIN */
(function (root) {
  'use strict';
  var fixed=root.DREAM_READER_FIXED, client=root.DreamFixedReleaseClient;
  if(!fixed)return;
  if(!client||!fixed.manifest||!fixed.manifest.resources)throw Error('固定版依赖清单不完整');
  var resources=fixed.manifest.resources, memory=new Map(), media=new Map();
  root.addEventListener('pagehide',function(){media.forEach(function(p){p.then(function(url){URL.revokeObjectURL(url);}).catch(function(){});});media.clear();},{once:true});
  var scope=fixed.repository+'/'+fixed.version+'/'+fixed.manifestSha256;
  function encode(path){return path.split('/').map(encodeURIComponent).join('/');}
  async function read(path) {
    var spec=resources[path];
    if(!spec||spec.path!==path||!Number.isSafeInteger(spec.bytes)||spec.bytes<0||!/^[a-f0-9]{64}$/.test(spec.sha256))throw Error('该资源不在当前固定版中：'+path);
    if(memory.has(path))return memory.get(path);
    var pending=(async function(){
      var cache=null,key='https://reader-fixed-cache.invalid/'+encodeURIComponent(scope)+'/'+spec.sha256;
      try{if(root.caches)cache=await root.caches.open('dream-reader-fixed-resources');}catch(e){}
      async function valid(bytes){return bytes.byteLength===spec.bytes&&await client.sha256(bytes)===spec.sha256;}
      if(cache){var hit=await cache.match(key);if(hit){var saved=await hit.arrayBuffer();if(await valid(saved))return saved;await cache.delete(key);}}
      for(var i=0;i<fixed.bases.length;i++) {
        var ctl=typeof AbortController==='function'?new AbortController():null;
        var timer=ctl?setTimeout(function(){ctl.abort();},30000):0;
        try {
          var response=await fetch(fixed.bases[i]+encode(path),{credentials:'omit',signal:ctl?ctl.signal:undefined});
          if(!response.ok)throw Error('HTTP '+response.status);
          var bytes=await response.arrayBuffer();if(!await valid(bytes))throw Error('资源校验失败');
          if(cache)try{await cache.put(key,new Response(bytes));}catch(e){}
          return bytes;
        }catch(e){}finally{if(timer)clearTimeout(timer);}
      }
      throw Error('当前固定版资源加载或校验失败：'+path);
    })();
    memory.set(path,pending);
    try{return await pending;}finally{memory.delete(path);}
  }
  function listing(dir) {
    return Object.keys(resources).filter(function(p){return p.indexOf(dir+'/')===0&&p.slice(dir.length+1).indexOf('/')<0;}).map(function(p){
      return {type:'file',name:p.slice(dir.length+1),sha:resources[p].sha256,download_url:fixed.bases[0]+encode(p)};
    });
  }
  function resourcePath(url) {
    var parsed=new URL(url), path;
    if(parsed.origin==='https://adirm007.github.io'&&parsed.pathname.indexOf('/reader/')===0)path=parsed.pathname.slice(8);
    else if(parsed.origin==='https://raw.githubusercontent.com')path=parsed.pathname.replace(/^\/Adirm007\/reader\/[^/]+\//,'');
    else if(/^(?:cdn|fastly)\.jsdelivr\.net$/.test(parsed.hostname))path=parsed.pathname.replace(/^\/gh\/Adirm007\/reader@[^/]+\//,'');
    else throw Error('固定版不读取此动态资源地址');
    path=decodeURIComponent(path);
    if(!Object.prototype.hasOwnProperty.call(resources,path))throw Error('该资源不在当前固定版中：'+path);
    return path;
  }
  root.dreamGalleryBases=function(){return fixed.bases.slice();};
  root.dreamGalleryApi=function(){return 'https://api.github.com/repos/Adirm007/reader/contents/gallery?ref='+fixed.sourceCommit;};
  root.dreamDlcApi=function(){return 'https://api.github.com/repos/Adirm007/reader/contents/personas?ref='+fixed.sourceCommit;};
  root.dreamFetchText=async function(url){
    var parsed=new URL(url);
    if(parsed.origin==='https://api.github.com') {
      var dir=parsed.pathname.match(/^\/repos\/Adirm007\/reader\/contents\/(gallery|personas)$/);
      if(!dir||parsed.searchParams.get('ref')!==fixed.sourceCommit)throw Error('固定版禁止读取动态目录');
      return JSON.stringify(listing(dir[1]));
    }
    return new TextDecoder().decode(await read(resourcePath(url)));
  };
  root.dreamGalleryCacheKey=function(){return 'dream_gallery_fixed_'+scope;};
  root.dreamDlcCacheKey=function(){return 'dream_persona_dlc_fixed_'+scope;};
  root.dreamDlcMetaKey=function(){return 'dream_persona_dlc_meta_fixed_'+scope;};
  // The repository list is pinned; external image hosts remain third-party media chosen by the author.
  root.dreamGalleryLoad=async function(){
    var items=listing('gallery').filter(function(f){return root.dreamGalleryIsImage(f.name);}).sort(function(a,b){return a.name.localeCompare(b.name,'zh-Hans-CN',{numeric:true});}).map(function(f){
      var item=root.dreamGalleryFileItem(f.name);item.fixedPath='gallery/'+f.name;return item;
    });
    if(resources['gallery/links.txt'])items=items.concat(root.dreamGalleryParseLinks(new TextDecoder().decode(await read('gallery/links.txt'))));
    return items;
  };
  var originalImage=root.dreamGalleryImg;
  root.dreamGalleryImg=function(doc,item,cls){
    if(!item.fixedPath)return originalImage(doc,item,cls);
    var img=doc.createElement('img');img.className=cls||'';img.alt=item.title||'';img.decoding='async';
    if(!media.has(item.fixedPath))media.set(item.fixedPath,read(item.fixedPath).then(function(bytes){return URL.createObjectURL(new Blob([bytes]));}).catch(function(e){media.delete(item.fixedPath);throw e;}));
    media.get(item.fixedPath).then(function(url){item.urls=[url];img.src=url;}).catch(function(){img.classList.add('dgl-broken');});
    return img;
  };
  root.dreamWbSha=function(text){return client.sha256(new TextEncoder().encode(text));};
  root.dreamWbAutoCheck=async function(){};
  root.DREAM_FIXED_RESOURCE=Object.freeze({read:read,scope:scope});
})(window);
/* DREAM_FIXED_RUNTIME_END */
