/* DREAM_SCRIPT_INSTALLER_BEGIN */
(function(root){
  'use strict';
  var ID='cfc0375e-3c5c-4ea1-8b7b-2093c7df0a13',NAME='读者常驻脚本',REPOSITORY='Adirm007/reader';
  var VERSION=/^\d{1,8}(?:\.\d{1,8}){1,5}$/,HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/;
  var sleep=function(host,ms){return new Promise(function(resolve){host.setTimeout(resolve,ms);});};
  function message(error){return String(error&&error.message||error);}
  function scopeOf(options){var scope=options&&options.scope||'character';if(scope!=='character'&&scope!=='global')throw Error('预设中的固定版暂不支持安全安装常驻脚本，已保留原正则');return scope;}
  function environment(){
    var candidates=[];try{candidates.push(root.top);}catch(e){}try{candidates.push(root.parent);}catch(e){}candidates.push(root);
    for(var i=0;i<candidates.length;i++)try{
      var host=candidates[i],helper=host.TavernHelper;
      if(host.SillyTavern&&typeof host.SillyTavern.getContext==='function'&&helper)return {host:host,helper:helper};
    }catch(e){}
    throw Error('未找到酒馆助手，无法安装常驻脚本');
  }
  function identity(host){
    var ctx=host.SillyTavern.getContext(),character=ctx.characters&&ctx.characters[ctx.characterId],preset=null;
    try{var manager=ctx.getPresetManager&&ctx.getPresetManager('openai');preset=manager&&manager.getSelectedPresetName();}catch(e){}
    var chat=typeof ctx.getCurrentChatId==='function'?ctx.getCurrentChatId():ctx.chatId;
    if(!character||typeof character.avatar!=='string'||chat==null)throw Error('请先打开角色聊天，再安装读者脚本');
    return {characterId:String(ctx.characterId),avatar:character.avatar,chatId:String(chat),preset:preset||null,mainApi:ctx.mainApi||null};
  }
  function fingerprint(value){return JSON.stringify(value,function(_key,item){if(item&&typeof item==='object'&&!Array.isArray(item)){var sorted={};Object.keys(item).sort().forEach(function(key){sorted[key]=item[key];});return sorted;}return item;});}
  function flatten(trees,parentEnabled){
    var result=[];trees.forEach(function(tree){if(tree&&tree.type==='folder')result=result.concat(flatten(tree.scripts||[],parentEnabled&&tree.enabled!==false));else if(tree)result.push({script:tree,folderEnabled:parentEnabled});});return result;
  }
  function managedMetadata(script){
    var data=script&&script.data&&script.data.reader_runtime;
    if(!script||script.type!=='script'||script.id!==ID||!data||data.schema!==1||data.kind!=='standalone'
      ||!VERSION.test(data.version||'')||typeof data.ownerToken!=='string'||!data.ownerToken
      ||!HEX40.test(data.sourceCommit||'')||!HEX64.test(data.manifestSha256||'')||!HEX64.test(data.sourceSha256||'')
      ||typeof script.content!=='string'||script.content.indexOf('/* READER_STANDALONE:')!==0)
      throw Error('读者脚本 ID 已被其他内容使用，已停止自动安装');
    return data;
  }
  function inspect(options){
    var scope=scopeOf(options),env=environment(),helper=env.helper,host=env.host;
    if(typeof helper.getScriptTrees!=='function'||typeof helper.updateScriptTreesWith!=='function'||typeof host.fetch!=='function')throw Error('当前酒馆助手缺少脚本库读写接口，已保留原正则');
    var context=identity(host),ctx=host.SillyTavern.getContext();
    if(typeof ctx.getRequestHeaders!=='function')throw Error('无法核对脚本是否保存，已保留原正则');
    var trees=helper.getScriptTrees({type:scope});if(!Array.isArray(trees))throw Error('脚本列表格式异常');
    if(trees.some(function(tree){return tree&&tree.type==='folder'&&tree.id===ID;}))throw Error('读者脚本 ID 已被其他内容使用，已停止自动安装');
    var matches=flatten(trees,true).filter(function(item){return item.script.id===ID;});
    if(matches.length>1)throw Error('读者脚本重复，请先处理重复项');
    var managed=matches.length?matches[0].script:null,metadata=managed?managedMetadata(managed):null;
    var globalSettings=ctx.extensionSettings&&ctx.extensionSettings.tavern_helper,enabled=globalSettings&&globalSettings.script&&globalSettings.script.enabled;
    var containerEnabled=scope==='global'?!!(enabled&&enabled.global):!!(enabled&&Array.isArray(enabled.characters)&&enabled.characters.indexOf(context.avatar)>=0);
    return {host:host,helper:helper,scope:scope,managed:managed,version:metadata&&metadata.version,metadata:metadata,
      enabled:containerEnabled&&(!managed||managed.enabled!==false&&matches[0].folderEnabled),containerEnabled:containerEnabled,
      snapshot:{context:context,trees:trees,fingerprint:fingerprint(trees)}};
  }
  function assertIdentity(env,external){if(typeof external==='function')external();if(fingerprint(identity(env.host))!==fingerprint(env.snapshot.context))throw Error('聊天、角色或预设已变化，已停止安装读者脚本');}
  function replaceManaged(trees,script){return trees.map(function(tree){if(tree.id===ID)return script;return tree.type==='folder'?Object.assign({},tree,{scripts:replaceManaged(tree.scripts||[],script)}):tree;});}
  function findManaged(trees){if(!Array.isArray(trees))return null;var found=flatten(trees,true).filter(function(item){return item.script.id===ID;});return found.length===1?found[0].script:null;}
  async function persistedScript(env){
    var ctx=env.host.SillyTavern.getContext(),headers=ctx.getRequestHeaders(),route=env.scope==='global'?'/api/settings/get':'/api/characters/get';
    var controller=typeof AbortController==='function'?new AbortController():null,timer=controller?env.host.setTimeout(function(){controller.abort();},6000):null;
    try{
      var response=await env.host.fetch(route,{method:'POST',headers:headers,body:JSON.stringify(env.scope==='global'?{}:{avatar_url:env.snapshot.context.avatar}),credentials:'same-origin',cache:'no-store',signal:controller?controller.signal:undefined});
      if(!response.ok)throw Error('脚本保存核对失败（HTTP '+response.status+'）');
      var data=await response.json(),trees;
      if(env.scope==='global'){
        if(typeof data.settings!=='string')throw Error('酒馆设置响应格式异常');
        var settings=JSON.parse(data.settings);trees=settings.extension_settings&&settings.extension_settings.tavern_helper&&settings.extension_settings.tavern_helper.script&&settings.extension_settings.tavern_helper.script.scripts;
      }else{
        if(typeof data.json_data!=='string')throw Error('角色卡响应缺少完整数据');
        var card=JSON.parse(data.json_data),value=card.data&&card.data.extensions&&card.data.extensions.tavern_helper;
        if(Array.isArray(value))value=Object.fromEntries(value);trees=value&&value.scripts;
      }
      return findManaged(trees);
    }finally{if(timer!==null)env.host.clearTimeout(timer);}
  }
  function owns(api,token){var owner=api&&api.scriptOwner;return !!owner&&owner.id===ID&&owner.token===token;}
  async function waitPersisted(env,script,external){
    var until=Date.now()+8000;
    do{assertIdentity(env,external);var saved=await persistedScript(env);assertIdentity(env,external);if(saved&&fingerprint(saved)===fingerprint(script))return;await sleep(env.host,100);}while(Date.now()<until);
    throw Error('读者脚本尚未确认保存，原正则已保留，请重新检查');
  }
  async function waitReady(env,token,version,external){
    var until=Date.now()+8000,readiness=null;
    do{
      assertIdentity(env,external);var api=env.host.ReaderCore,status=env.host.__readerStandaloneStatus;
      if(!env.startedStatus&&status&&status.id===ID&&status.token===token)env.startedStatus=status;
      if(status&&status.id===ID&&status.token===token&&status.phase==='failed')throw Error('读者脚本启动失败：'+status.error);
      if(status&&status.id===ID&&status.token===token&&status.phase==='delegated')throw Error('读者已由其他宿主脚本运行，独立脚本未接管，原正则已保留');
      if(api&&owns(api,token)&&api.runtimeVersion===version&&api.isAlive!==false){
        if(!readiness||readiness.api!==api){
          readiness={api:api,done:false,value:null,error:null};
          (function(waiting){Promise.resolve(api.ready).then(function(value){waiting.done=true;waiting.value=value;},function(error){waiting.done=true;waiting.error=error;});})(readiness);
        }
        if(readiness.done){if(readiness.error)throw readiness.error;if(!readiness.value)throw Error('读者控制器未能启动');assertIdentity(env,external);if(env.host.ReaderCore===api)return api;}
      }
      await sleep(env.host,100);
    }while(Date.now()<until);
    throw Error('读者脚本尚未启动，原正则已保留；请在酒馆助手脚本库启用读者脚本后重试');
  }
  async function restorePrevious(env,script,token,expected,priorStatus,priorApi,external){
    assertIdentity(env,external);
    var status=env.host.__readerStandaloneStatus,active=env.host.ReaderCore;
    if(status&&status!==env.startedStatus&&status!==priorStatus)throw Error('已有后续脚本实例接管');
    if(active&&active.isAlive!==false&&!owns(active,token)&&active!==priorApi)throw Error('已有其他运行脚本接管');
    var current=env.helper.getScriptTrees({type:env.scope});
    if(fingerprint(current)!==expected||fingerprint(findManaged(current))!==fingerprint(script))throw Error('脚本库已有后续修改');
    if(status&&status===env.startedStatus&&typeof status.cancel==='function')status.cancel();
    var writing=env.helper.updateScriptTreesWith(function(trees){
      assertIdentity(env,external);
      if(fingerprint(trees)!==expected)throw Error('恢复前脚本库已变化');
      return replaceManaged(trees,env.managed);
    },{type:env.scope});
    if(writing&&typeof writing.then==='function')await writing;
    env.startedStatus=null;
    await waitPersisted(env,env.managed,external);
    if(env.enabled)await waitReady(env,env.metadata.ownerToken,env.metadata.version,external);
  }
  async function performInstall(artifact,assertCurrent,options){
    var env=inspect(options),client=root.DreamFixedReleaseClient,pin=artifact&&artifact.metadata,release=artifact&&artifact.release,spec=artifact&&artifact.spec;
    assertIdentity(env,assertCurrent);
    var snapshot=options&&options.snapshot;
    if(snapshot&&(fingerprint(snapshot.context)!==fingerprint(env.snapshot.context)||snapshot.fingerprint!==env.snapshot.fingerprint))throw Error('聊天或脚本库在检查后已变化，请重新检查');
    if(!client||typeof client.sha256!=='function'||typeof client.compare!=='function')throw Error('脚本完整性校验模块不可用');
    if(!pin||pin.schema!==1||pin.repository!==REPOSITORY||!VERSION.test(pin.version||'')||!HEX40.test(pin.sourceCommit||'')||!HEX64.test(pin.manifestSha256||'')
      ||!release||release.repository!==REPOSITORY||release.version!==pin.version||!HEX40.test(release.distributionCommit||'')||!HEX64.test(release.digest||''))throw Error('脚本固定版本信息不完整');
    var bytes=artifact.bytes instanceof Uint8Array?artifact.bytes:new Uint8Array(artifact.bytes);
    if(!spec||!Number.isSafeInteger(spec.bytes)||spec.bytes<=0||spec.bytes>8000000||bytes.byteLength!==spec.bytes||!HEX64.test(spec.sha256||'')||await client.sha256(bytes)!==spec.sha256)throw Error('脚本内容与已验证的发布清单不符');
    var source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(!/\bexport\s+(?:async\s+)?function\s+start\b/.test(source)||!/\bexport\s+function\s+stop\b/.test(source)||typeof root.ReaderStandaloneBootstrap!=='function')throw Error('脚本生命周期或安装启动器缺失');
    if(env.metadata&&client.compare(pin.version,env.metadata.version)<0)throw Error('不会用旧版本覆盖现有读者脚本');
    if(env.metadata&&client.compare(pin.version,env.metadata.version)===0&&(env.metadata.sourceSha256!==spec.sha256||env.metadata.sourceCommit!==pin.sourceCommit||env.metadata.manifestSha256!==pin.manifestSha256))throw Error('同版本脚本来源不一致，已停止安装');
    var priorStatus=env.host.__readerStandaloneStatus,priorApi=env.host.ReaderCore,reuse=env.metadata&&env.metadata.version===pin.version&&(!priorStatus||priorStatus.token!==env.metadata.ownerToken||!['failed','stopped'].includes(priorStatus.phase));
    var token=reuse?env.metadata.ownerToken:env.host.crypto&&typeof env.host.crypto.randomUUID==='function'?env.host.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    var config={schema:1,id:ID,token:token,version:pin.version,initialAvatar:env.snapshot.context.avatar,scope:env.scope};
    var metadata={schema:1,kind:'standalone',version:pin.version,ownerToken:token,sourceCommit:pin.sourceCommit,manifestSha256:pin.manifestSha256,sourceSha256:spec.sha256,avatar:config.initialAvatar};
    var content='/* READER_STANDALONE:'+JSON.stringify(config)+' */\n'+source+'\n;('+root.ReaderStandaloneBootstrap.toString()+')('+JSON.stringify(config)+');\n';
    var script=env.managed?Object.assign({},env.managed,{content:content,data:Object.assign({},env.managed.data,{reader_runtime:metadata})}):{type:'script',enabled:true,name:NAME,id:ID,content:content,info:'读者核心的常驻菜单、播放器与书海窗口',button:{enabled:false,buttons:[]},data:{reader_runtime:metadata},export_with:{data:true,button:true}};
    assertIdentity(env,assertCurrent);
    var oldTrees=env.helper.getScriptTrees({type:env.scope});
    if(fingerprint(oldTrees)!==env.snapshot.fingerprint)throw Error('脚本库在检查后已变化，请重新检查');
    var expected=fingerprint(env.managed?replaceManaged(oldTrees,script):oldTrees.concat([script])),wrote=false;
    try{
      if(!env.managed||fingerprint(env.managed)!==fingerprint(script)){
        wrote=true;
        var writing=env.helper.updateScriptTreesWith(function(trees){assertIdentity(env,assertCurrent);if(fingerprint(trees)!==env.snapshot.fingerprint)throw Error('脚本库在安装前已变化，请重新检查');return env.managed?replaceManaged(trees,script):trees.concat([script]);},{type:env.scope});
        if(writing&&typeof writing.then==='function')await writing;
      }
      var startedStatus=env.host.__readerStandaloneStatus;
      if(startedStatus&&startedStatus!==priorStatus&&startedStatus.id===ID&&startedStatus.token===token)env.startedStatus=startedStatus;
      await waitPersisted(env,script,assertCurrent);
      var fresh=inspect({scope:env.scope});assertIdentity(env,assertCurrent);
      if(!fresh.enabled)throw Error('读者脚本已安装；请在酒馆助手脚本库开启'+(env.scope==='global'?'全局脚本':'角色脚本')+'及读者脚本后重试，原正则已保留');
      var api=await waitReady(env,token,pin.version,assertCurrent);
      if(typeof api.retireLegacyMenu==='function')api.retireLegacyMenu();
      return {version:pin.version,id:ID,ownerToken:token,persisted:true,api:api};
    }catch(error){
      var detail='',sameContext=false;
      try{assertIdentity(env,assertCurrent);sameContext=true;}catch(e){}
      if(env.managed&&wrote){
        try{await restorePrevious(env,script,token,expected,priorStatus,priorApi,assertCurrent);detail='；旧版脚本已恢复';}
        catch(recoveryError){detail='；旧版脚本未能恢复：'+message(recoveryError);}
      }else if(sameContext){
        var status=env.host.__readerStandaloneStatus;
        if(status&&status===env.startedStatus&&status.id===ID&&status.token===token&&typeof status.cancel==='function')status.cancel();
      }
      throw Error(message(error)+detail);
    }
  }
  function install(artifact,assertCurrent,options){
    var env=environment(),scope=scopeOf(options),context=identity(env.host),pin=artifact&&artifact.metadata;
    if(typeof assertCurrent==='function')assertCurrent();
    var key=fingerprint({context:context,scope:scope,version:pin&&pin.version,sourceCommit:pin&&pin.sourceCommit,manifestSha256:pin&&pin.manifestSha256});
    var pending=env.host.__readerScriptInstallation;
    if(pending){if(pending.key===key)return pending.promise;throw Error('另一次读者脚本安装尚未结束，请稍后重新检查');}
    var job=performInstall(artifact,assertCurrent,options);
    env.host.__readerScriptInstallation={key:key,promise:job};
    job.then(function(){if(env.host.__readerScriptInstallation&&env.host.__readerScriptInstallation.promise===job)delete env.host.__readerScriptInstallation;},function(){if(env.host.__readerScriptInstallation&&env.host.__readerScriptInstallation.promise===job)delete env.host.__readerScriptInstallation;});
    return job;
  }
  root.ReaderScriptInstaller=Object.freeze({id:ID,inspect:inspect,install:install});
})(window);
/* DREAM_SCRIPT_INSTALLER_END */
