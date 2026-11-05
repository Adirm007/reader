/* DREAM_UPDATE_CENTER_BEGIN */
(function(root){
  'use strict';
  var ORDER=['worldbook','regex','script'], RESULT='dream_reader_update_result_v1';
  function message(error){return String(error&&error.message||error);}
  function backupDetail(stored){return stored===false?'；浏览器存储空间不足，旧正则备份未保存（可从发布页重新下载旧版）':'';}
  function liveApi(){var host=root.parent||root,api=host.ReaderCore;return api&&api.isAlive!==false?api:root.__readerHostApi&&root.__readerHostApi.isAlive!==false?root.__readerHostApi:null;}
  function contextId(){var h=root.parent||root,c=h.SillyTavern&&h.SillyTavern.getContext();return JSON.stringify(c&&[c.characterId,typeof c.getCurrentChatId==='function'?c.getCurrentChatId():c.chatId]);}
  function guard(allowRetired){
    var host=root.parent||root, ctx=host.SillyTavern&&host.SillyTavern.getContext(), id=ctx&&(typeof ctx.getCurrentChatId==='function'?ctx.getCurrentChatId():ctx.chatId), character=ctx&&ctx.characterId;
    var identity=root.DreamRegexUpdateGuard&&JSON.stringify(root.DreamRegexUpdateGuard.identity(host));
    return function(){var now=host.SillyTavern&&host.SillyTavern.getContext(), chat=now&&(typeof now.getCurrentChatId==='function'?now.getCurrentChatId():now.chatId);if(!allowRetired&&root.__readerControllerAlive===false||!now||chat!==id||now.characterId!==character||identity&&identity!==JSON.stringify(root.DreamRegexUpdateGuard.identity(host)))throw Error('聊天、角色或预设已变化，请重新检查更新');};
  }
  function createCoordinator(components,capture,onResult){
    var pending=null, checked=null, assertCurrent=null, activeComponents=null;
    function check(){
      if(pending)return pending;
      checked=null;activeComponents=null;
      assertCurrent=(capture||guard)();
      activeComponents=typeof components==='function'?components():components;
      pending=Promise.all(activeComponents.map(async function(component){
        try{assertCurrent();var plan=await component.check();assertCurrent();return {id:component.id,label:component.label,status:plan.status,detail:plan.detail||'',plan:plan};}
        catch(e){return {id:component.id,label:component.label,status:'failed',detail:message(e)};}
      })).then(function(results){assertCurrent();checked=results;return results;}).finally(function(){pending=null;});
      return pending;
    }
    function apply(progress){
      if(pending)return pending;
      if(!checked)return Promise.reject(Error('请先检查更新'));
      pending=(async function(){
        assertCurrent();
        var ordered=checked.slice().sort(function(a,b){return ORDER.indexOf(a.id)-ORDER.indexOf(b.id);});
        for(var i=0;i<ordered.length;i++){
          var item=ordered[i];if(item.status!=='outdated')continue;
          try{assertCurrent();if(onResult)onResult(checked,item.id);if(progress)progress(item.label);var component=activeComponents.find(function(c){return c.id===item.id;});var result=await component.apply(item.plan,assertCurrent);item.status='updated';item.detail=result&&result.detail||'已更新';}
          catch(e){item.status='failed';item.detail=message(e);}
          if(onResult)onResult(checked);
        }
        return checked;
      })().finally(function(){pending=null;});
      return pending;
    }
    return Object.freeze({check:check,apply:apply,get busy(){return !!pending;},get results(){return checked;}});
  }
  function coreComponents(){
    var client=root.DreamFixedReleaseClient, api=liveApi(), selectedJob=null, selectionTime=0;
    function selected(){if(!selectedJob||Date.now()-selectionTime>1500){selectionTime=Date.now();selectedJob=client.latest('Adirm007/reader');}return selectedJob;}
    function helper(){return root.TavernHelper||root.parent.TavernHelper;}
    function hooks(){return api&&api.getUpdateOptions&&api.getUpdateOptions()||{};}
    function lightSnapshot(){
      var h=helper(), lists=[], found=[];
      if(!h||typeof h.getTavernRegexes!=='function')throw Error('缺少读取正则接口');
      [{type:'global'},{type:'character',name:'current'},{type:'preset',name:'in_use'}].forEach(function(option){var list=h.getTavernRegexes(option);if(!Array.isArray(list))throw Error('正则列表格式异常');lists.push({option:option,list:list});list.forEach(function(r,index){if(r.id==='b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007'&&r.script_name==='读者对话渲染-脚本版'){var match=String(r.replace_string).match(/READER_LIGHT_VERSION:([0-9.]+)/);found.push({option:option,list:list,index:index,version:match?match[1]:'0.0'});}});});
      if(found.length!==1)throw Error(found.length?'发现重复读者正则，请先处理重复安装':'未找到受管理的轻量读者正则');
      return {target:found[0],fingerprint:JSON.stringify(lists)};
    }
    async function readArtifact(plan,name){var file=await client.resource(plan.selected,name);if(file.metadata.repository!=='Adirm007/reader'||file.metadata.version!==plan.selected.version)throw Error('更新资源身份不符');return file;}
    function validateLight(regex,version){if(!regex||regex.id!=='b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007'||regex.scriptName!=='读者对话渲染-脚本版'||!regex.readerRuntime||regex.readerRuntime.kind!=='light-letter'||regex.readerRuntime.version!==version||typeof regex.replaceString!=='string'||regex.replaceString.indexOf('ReaderLetter')<0||/<audio\b|function openDreamLobby\(/.test(regex.replaceString))throw Error('更新资源不是轻量读者正则');}
    async function bookseaUpdates(){
      var updates=root.DreamReleaseUpdates;if(!updates)return null;
      var installed=updates.scan().projects.find(function(p){return p.repository==='Adirm007/Protelysion';});
      if(!installed||!installed.installed.length&&!installed.invalid.length)return null;
      var checked=await updates.check({repositories:['Adirm007/Protelysion']}),project=checked.projects[0];
      if(checked.snapshot.errors.length||project.error||project.invalid.length||project.installed.length!==1)throw Error('书海固定版检查未完成：'+(project.error||project.invalid.join('；')||checked.snapshot.errors.join('；')||'发现重复安装'));
      return checked;
    }
    // The card owns its runtime. Only an explicit update saves a new local selection.
    function hostedPlan(latest){
      if(hooks().hostMode==='auto-regex'){
        var state=hooks().getHostedRuntimeState&&hooks().getHostedRuntimeState(),pending=state&&state.pendingVersion;
        var version=pending&&client.compare(pending,api.runtimeVersion)>0?pending:api.runtimeVersion;
        return {status:latest&&client.compare(latest.version,version)>0?'outdated':'current',selected:latest,version:version,hosted:true,runningVersion:api.runtimeVersion,pendingVersion:pending,
          detail:'读者运行脚本（自动正则托管）：当前 v'+api.runtimeVersion+(pending&&pending!==api.runtimeVersion?'；已保存 v'+pending+'，下次启动生效':'')+(latest?'；最新 v'+latest.version:'；尚无正式发布')};
      }
      return {status:'unavailable',selected:latest,version:api.runtimeVersion,
        detail:'当前由旧版角色卡托管读者 v'+api.runtimeVersion+'；请更新命定之诗程序资源以支持保存手动选定版本，不会自动创建独立脚本'};
    }
    var components=[];
    if(api&&!(root.ReaderFixedMigration&&(root.ReaderFixedMigration.hasFixed()||root.ReaderFixedMigration.hasLinked()))){
      components.push({id:'regex',label:'正则',check:async function(){var snapshot=lightSnapshot(),checks=await Promise.all([selected(),bookseaUpdates()]),latest=checks[0],booksea=checks[1],project=booksea&&booksea.projects[0],lightOutdated=!!latest&&client.compare(latest.version,snapshot.target.version)>0;return {status:lightOutdated||project&&project.updatable?'outdated':'current',selected:latest,snapshot:snapshot,lightOutdated:lightOutdated,booksea:booksea,detail:'读者脚本版正则（轻量信件）：当前 v'+snapshot.target.version+(latest?'；最新 v'+latest.version:'；尚无正式发布')+(project?'；书海固定版正则：当前 v'+project.installed[0].metadata.version+(project.latest?'；最新 v'+project.latest.version:'；尚无正式发布'):'')};},apply:async function(plan,assertCurrent){
        var booksea=plan.booksea&&plan.booksea.projects[0].updatable;
        if(booksea&&!plan.lightOutdated){assertCurrent();var receipt=await root.DreamReleaseUpdates.apply(plan.booksea,[],assertCurrent);return {detail:'书海固定版正则已更新至 v'+plan.booksea.projects[0].latest.version+backupDetail(receipt&&receipt.stored)};}
        if(booksea&&typeof hooks().installRegex==='function'&&typeof hooks().installRegexBatch!=='function')throw Error('当前宿主不支持读者与书海联合更新，请先升级命定之诗程序脚本后重试');
        var artifact=await readArtifact(plan,'reader-letter.json'),regex=JSON.parse(new TextDecoder().decode(artifact.bytes));validateLight(regex,artifact.metadata.version);assertCurrent();
        if(lightSnapshot().fingerprint!==plan.snapshot.fingerprint)throw Error('正则在检查后已变化，请重新检查');
        if(booksea){
          var jointReceipt,request={version:artifact.metadata.version,regex:regex,metadata:artifact.metadata,release:artifact.release,commit:async function(){assertCurrent();jointReceipt=await root.DreamReleaseUpdates.apply(plan.booksea,[{repository:'Adirm007/reader',version:artifact.metadata.version,scope:plan.snapshot.target.option,index:plan.snapshot.target.index,id:regex.id,scriptName:regex.scriptName,replaceString:regex.replaceString}],assertCurrent);return jointReceipt;}};
          var batch=hooks().installRegexBatch;if(typeof batch==='function')await batch(request);else await request.commit();
          return {detail:'轻量信件已更新至 v'+artifact.metadata.version+'；书海固定版正则已更新至 v'+plan.booksea.projects[0].latest.version+backupDetail(jointReceipt&&jointReceipt.stored)};
        }
        var update=hooks().installRegex,stored;
        if(typeof update==='function'){var updated=await update({version:artifact.metadata.version,regex:regex,metadata:artifact.metadata,release:artifact.release});stored=updated&&updated.stored;}
        else {
          var h=helper(), target=plan.snapshot.target, protection=root.DreamRegexUpdateGuard;
          if(!protection||typeof h.replaceTavernRegexes!=='function')throw Error('缺少安全正则替换接口');
          protection.assertSafe(root.parent||root,target.option,target.list);
          var list=target.list.slice(),old=list[target.index];list[target.index]=Object.assign({},old,{replace_string:regex.replaceString,script_name:regex.scriptName});
          if(root.DreamReleaseUpdates&&root.DreamReleaseUpdates.storeBackup)stored=root.DreamReleaseUpdates.storeBackup(root.parent||root,'dream_reader_light_backup_v1',{scope:target.option,list:[old]});assertCurrent();await h.replaceTavernRegexes(list,target.option);
        }
        return {detail:'轻量正则已更新到 v'+artifact.metadata.version+backupDetail(stored)};
      }});
      components.push({id:'script',label:hooks().hostMode==='auto-regex'?'读者运行脚本':'读者常驻脚本',check:async function(){var latest=await selected(),version=api.runtimeVersion,owner=api.scriptOwner,snapshot=null;
        if(!owner)return hostedPlan(latest);
        if(owner){if(!root.ReaderScriptInstaller||typeof root.ReaderScriptInstaller.verify!=='function')throw Error('脚本保存核对模块不可用');var verified=await root.ReaderScriptInstaller.verify({scope:owner.scope||'character'},guard());if(verified.api!==api)throw Error('运行脚本已变化，请重新检查');version=verified.version;snapshot=verified.snapshot;}
        else if(api.ready!==undefined&&!await api.ready)throw Error('读者控制器未能启动');
        return {status:latest&&client.compare(latest.version,version)>0?'outdated':'current',selected:latest,version:version,snapshot:snapshot,detail:'酒馆助手脚本库「读者常驻脚本」（'+(owner.scope==='global'?'全局':'角色')+'脚本）；当前 v'+version+(latest?'；最新 v'+latest.version:'；尚无正式发布')};},apply:async function(plan,assertCurrent){
        if(plan.hosted){
          var artifact=await readArtifact(plan,'reader-runtime.js');assertCurrent();
          var installHosted=hooks().installRuntime;if(typeof installHosted!=='function')throw Error('当前读者宿主不支持保存运行版本');
          await installHosted(artifact,guard(true));
          return {detail:'已保存读者运行脚本 v'+artifact.metadata.version+'；下次启动读者时生效，当前播放保持不变'};
        }
        if(!root.ReaderScriptInstaller)throw Error('脚本安装模块不可用');
        var artifact=await readArtifact(plan,'reader-runtime.js');assertCurrent();
        await root.ReaderScriptInstaller.install(artifact,guard(true),{scope:api.scriptOwner.scope||'character',snapshot:plan.snapshot});
        return {detail:'酒馆助手常驻脚本已保存并启动 v'+artifact.metadata.version};
      }});
    }else{
      var compatRegexWritten=false;
      components.push({id:'regex',label:'正则',check:async function(){compatRegexWritten=false;var repositories=root.DreamReleaseUpdates.scan().projects.filter(function(p){return (p.installed.length||p.invalid.length)&&!(p.repository==='Adirm007/reader'&&p.installed.length===1&&p.installed[0].scope.type!=='preset');}).map(function(p){return p.repository;}),checked=await root.DreamReleaseUpdates.check({repositories:repositories}),used=checked.projects,stale=used.filter(function(p){return p.updatable;}),failures=used.filter(function(p){return p.error||p.invalid.length||p.installed.length>1;});return {status:stale.length?'outdated':failures.length||checked.snapshot.errors.length?'failed':'current',checked:checked,detail:used.length?used.map(function(p){return p.label+'固定版正则：'+(p.error||p.invalid.join('；')||(p.installed.length>1?'发现重复安装':!p.installed.length?'未安装受管理固定版，请从发布页导入':p.updatable?'可更新至 v'+p.latest.version:'没有可用更新'));}).join('；'):'读者固定版/外链版会在脚本一步换成脚本版正则'};},apply:async function(plan,assertCurrent){assertCurrent();var receipt=await root.DreamReleaseUpdates.apply(plan.checked);compatRegexWritten=true;return {detail:'固定版正则更新已提交'+(receipt&&receipt.stored===false?'；浏览器存储空间不足，旧正则备份未保存（可从发布页重新下载旧版）':'')};}});
      components.push({id:'script',label:'读者常驻脚本',check:async function(){if(!root.ReaderFixedMigration)throw Error('首次脚本迁移模块不可用');return root.ReaderFixedMigration.check(await selected());},apply:async function(plan,assertCurrent){if(compatRegexWritten){plan=await root.ReaderFixedMigration.check(plan.selected);assertCurrent();}return root.ReaderFixedMigration.install(plan,assertCurrent);}});
    }
    components.push({id:'worldbook',label:'世界书',check:async function(){
      var latest=await selected();if(!latest)throw Error('尚无可验证的正式发布');var file=await client.resource(latest,'worldbook/manifest.json'),manifest=JSON.parse(new TextDecoder().decode(file.bytes));
      if(manifest.schema!==1||!Array.isArray(manifest.entries))throw Error('世界书清单格式异常');manifest._signed=latest;
      var h=root.dreamWbTH();if(!h)throw Error('缺少世界书读写接口');var found=await root.dreamWbScan(h,manifest),outdated=root.dreamWbOutdated(found);
      return {status:outdated.length?'outdated':'current',manifest:manifest,targets:outdated,helper:h,detail:found.length?found.map(function(item){return item.name+'：当前 v'+item.version+'；最新 v'+item.spec.version;}).join('；'):'当前绑定范围没有受管理的读者条目'};
    },apply:async function(plan,assertCurrent){var done=await root.dreamWbApply(plan.helper,plan.manifest,plan.targets,null,assertCurrent);return {detail:'已更新 '+done.length+' 个条目；旧条目已改名备份并关闭'};}});
    return components;
  }
  var coordinator=null,overlay=null;
  function instance(){if(!coordinator){var scope;coordinator=createCoordinator(coreComponents,function(){scope=contextId();return guard();},function(results,pending){var record={context:scope,items:results.map(function(item){return {id:item.id,label:item.label,status:item.id===pending?'submitted':item.status,detail:item.detail,version:item.plan&&item.plan.selected&&item.plan.selected.version};})};try{(root.parent||root).localStorage.setItem(RESULT,JSON.stringify(record));}catch(e){/* Results never authorize code or state writes. */}});}return coordinator;}
  function receipt(results){
    var storage=(root.parent||root).localStorage,previous=JSON.parse(storage.getItem(RESULT)||'null');
    if(!previous||previous.context!==contextId()||!Array.isArray(previous.items))return null;
    var changed=false;
    if(results)previous.items.forEach(function(item){var checked=results.find(function(result){return result.id===item.id;});if(item.id==='script'&&(item.status==='submitted'||item.status==='failed')&&item.version&&checked&&checked.status==='current'&&checked.plan.version&&root.DreamFixedReleaseClient.compare(checked.plan.version,item.version)>=0){item.status='updated';item.detail=checked.plan.hosted&&checked.plan.pendingVersion?'已重新核对本地保存；下次启动读者时生效':'已重新核对保存和运行状态';changed=true;}});
    if(changed)storage.setItem(RESULT,JSON.stringify(previous));return previous;
  }
  root.openReaderUpdateCenter=function(e){
    if(e&&e.stopPropagation)e.stopPropagation();var doc=getCustomPersonaHostDocument();
    if(overlay&&overlay.isConnected)return overlay;
    var shell=createCustomPersonaLibraryShell(doc,'检查更新',''),box=doc.createElement('div'),info=doc.createElement('div'),status=doc.createElement('div'),buttons=doc.createElement('div');overlay=shell.overlay;
    box.className='dad-form';info.className='dad-wb-pre';status.className='dad-status';status.setAttribute('aria-live','polite');buttons.className='dad-row';box.appendChild(info);box.appendChild(status);box.appendChild(buttons);shell.card.appendChild(box);dreamAddonCss(doc);
    var history=null;
    function renderHistory(results){try{var previous=receipt(results);if(previous){if(!history){history=doc.createElement('div');history.className='dad-hint';history.style.whiteSpace='pre-wrap';box.insertBefore(history,info);}history.textContent='上次更新：\n'+previous.items.map(function(item){var state=item.status;return item.label+'：'+(state==='submitted'?'已提交，请重新检查核对':state==='failed'?'失败：'+item.detail:state==='updated'?'已更新':state==='current'?'无需更新':item.detail);}).join('\n');}}catch(e){}}
    renderHistory();
    var center=instance(),labels={current:'已是最新',outdated:'有可用更新',updated:'已更新',failed:'失败',unavailable:'不可自动更新'};
    function button(label,handler){buttons.appendChild(customPersonaButton(doc,label,'',handler));}
    function render(results){renderHistory(results);info.textContent=results.map(function(item){return item.label+'：'+(labels[item.status]||item.status)+'\n'+item.detail;}).join('\n\n');}
    async function run(){if(center.busy)return;buttons.textContent='';status.textContent='正在检查…';try{var results=await center.check();if(!overlay.isConnected)return;render(results);var count=results.filter(function(item){return item.status==='outdated';}).length;status.textContent=(root.__readerHostApi&&root.__readerHostApi.updateRestoreError?root.__readerHostApi.updateRestoreError+'；':'')+(count?'发现 '+count+' 项更新':'检查完成');if(count)button('更新可用项目（'+count+' 项）',async function(){if(center.busy)return;buttons.textContent='';try{var done=await center.apply(function(name){status.textContent='正在更新'+name+'…';});if(!overlay.isConnected)return;render(done);status.textContent=done.some(function(item){return item.status==='failed';})?'部分项目未完成，请重新检查':'更新完成';}catch(error){status.textContent=message(error);}button('重新检查',run);});}catch(error){status.textContent=message(error);}finally{if(overlay.isConnected){button('重新检查',run);button('关闭',shell.close);}}}
    run();return overlay;
  };
  root.openDreamReleaseUpdates=root.openReaderUpdateCenter;
  root.openDreamWorldbookUpdate=root.openReaderUpdateCenter;
  // Compatibility for older adapters. Local restoration belongs to the card host, never to
  // the update page; startup must not check releases, download code or install a library row.
  async function restore(){}
  root.ReaderUpdates=Object.freeze({createCoordinator:createCoordinator,components:coreComponents,restore:restore,check:function(){return instance().check().then(function(results){try{receipt(results);}catch(e){}return results;});},apply:function(progress){return instance().apply(progress);}});
  // A previously installed updater can only download the new complete fixed loader.
  // That accepted, pinned loader finishes its own first script migration on load.
  if(root.ReaderFixedMigration&&!root.__readerHostApi)setTimeout(function(){root.ReaderFixedMigration.autoStart().catch(function(){});},0);
})(window);
/* DREAM_UPDATE_CENTER_END */
