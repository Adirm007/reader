/* DREAM_RELEASE_UPDATES_BEGIN */
(function(root){
  'use strict';
  var client=root.DreamFixedReleaseClient;
  var PROJECTS=[{repository:'Adirm007/reader',label:'读者',id:'cfc0375e-3c5c-4ea1-8b7b-2093c7df0a11'},{repository:'Adirm007/Protelysion',label:'书海',id:'cfc0375e-3c5c-4ea1-8b7b-2093c7df0a12'}];
  var RECEIPT='dream_fixed_update_receipt_v1';
  function host(){
    var candidates=[];try{candidates.push(root.top);}catch(e){}try{candidates.push(root.parent);}catch(e){}candidates.push(root);
    for(var i=0;i<candidates.length;i++)try{var w=candidates[i],h=w&&w.TavernHelper;if(h&&typeof h.getTavernRegexes==='function')return {window:w,helper:h};}catch(e){}
    throw Error('未找到可读取正则的酒馆助手；可从发布页手动导入固定版');
  }
  function helperReady(h){
    if(typeof h.replaceTavernRegexes!=='function'||typeof h.getTavernHelperVersion!=='function')return false;
    var m=String(h.getTavernHelperVersion()).match(/^v?(\d+)\.(\d+)\.(\d+)/);
    return !!m&&client.compare(m.slice(1).join('.'),'4.9.3')>=0;
  }
  function contextKey(w){
    if(root.DreamRegexUpdateGuard)return JSON.stringify(root.DreamRegexUpdateGuard.identity(w));
    try{var c=w.SillyTavern.getContext();return JSON.stringify([c.characterId,c.chatId,c.name2]);}catch(e){return 'unknown';}
  }
  function scan(){
    if(!client)throw Error('固定版更新校验模块不可用');
    var h=host(), scopes=[{type:'global'},{type:'character',name:'current'},{type:'preset',name:'in_use'}], lists=[],errors=[];
    var projects=PROJECTS.map(function(p){return Object.assign({},p,{installed:[],invalid:[]});});
    scopes.forEach(function(option){
      try{
        var list=h.helper.getTavernRegexes(Object.assign({},option));if(!Array.isArray(list))throw Error('正则列表格式异常');
        var record={option:option,list:list};lists.push(record);
        list.forEach(function(regex,index){
          projects.forEach(function(p){
            var text=String(regex.replace_string||'');
            if(regex.id!==p.id&&text.indexOf('"repository":"'+p.repository+'"')<0)return;
            try{var m=client.fromInstalled(regex,p.repository);p.installed.push({metadata:m,regex:regex,index:index,scope:option});}
            catch(e){if(regex.id===p.id||text.indexOf('<!-- FIXED_RELEASE:')>=0)p.invalid.push(String(e.message||e));}
          });
        });
      }catch(e){errors.push(option.type+'：'+String(e.message||e));}
    });
    return {host:h,lists:lists,projects:projects,errors:errors,context:contextKey(h.window),fingerprint:JSON.stringify(lists)};
  }
  async function check(options){
    var snapshot=scan();
    var projects=snapshot.projects.filter(function(p){return !options||!options.repositories||options.repositories.indexOf(p.repository)>=0;});
    var results=await Promise.allSettled(projects.map(function(p){return client.latest(p.repository);}));
    return {snapshot:snapshot,projects:projects.map(function(p,i){
      var r=results[i],state=Object.assign({},p,{latest:r.status==='fulfilled'?r.value:null,error:r.status==='rejected'?String(r.reason&&r.reason.message||r.reason):null});
      state.updatable=!state.error&&state.latest&&state.installed.length===1&&!state.invalid.length&&client.compare(state.latest.version,state.installed[0].metadata.version)>0;
      return state;
    })};
  }
  async function apply(checked,letters,assertCurrent){
    if(assertCurrent)assertCurrent();
    letters=letters||[];
    if(!Array.isArray(letters)||letters.length>1)throw Error('轻量信件更新列表无效');
    letters.forEach(function(letter){if(!letter||letter.repository!=='Adirm007/reader'||letter.id!=='b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007'||letter.scriptName!=='读者对话渲染-脚本版'||typeof letter.replaceString!=='string'||letter.replaceString.length>200000||letter.replaceString.indexOf('ReaderLetter')<0||/<audio\b|function\s+openDreamLobby\b/i.test(letter.replaceString))throw Error('合并更新必须使用已校验的读者轻量信件');});
    var before=checked.snapshot, helper=before.host.helper;
    if(!helperReady(helper))throw Error('一键更新需要酒馆助手 4.9.3 或更新版本；请升级助手或从发布页手动导入');
    if(before.errors.length)throw Error('部分正则范围无法读取，不能安全更新：'+before.errors.join('；'));
    var changes=checked.projects.filter(function(p){return p.updatable;});
    if(!changes.length&&!letters.length)throw Error('没有可执行的一键更新');
    var guard=root.DreamRegexUpdateGuard;
    if(!guard)throw Error('正则设置保护模块不可用，请手动导入固定版');
    var affected=before.lists.filter(function(g){return changes.some(function(p){return JSON.stringify(p.installed[0].scope)===JSON.stringify(g.option);})||letters.some(function(letter){return JSON.stringify(letter.scope)===JSON.stringify(g.option);});});
    var rawBefore=affected.map(function(g){return guard.assertSafe(before.host.window,g.option,g.list).rawFingerprint;});
    // No host mutation occurs until every selected artifact has been downloaded and verified.
    var downloads=await Promise.all(changes.map(function(p){return client.download(p.latest);}));
    if(assertCurrent)assertCurrent();
    var now=scan();
    if(now.context!==before.context||now.fingerprint!==before.fingerprint)throw Error('角色、预设或正则在检查后发生变化，请重新检查更新');
    var expected=[], groups=now.lists.map(function(scope){return {option:scope.option,list:scope.list,changed:false};});
    for(var i=0;i<changes.length;i++){
      var installed=changes[i].installed[0], incoming=downloads[i].regex;
      var group=groups.find(function(g){return JSON.stringify(g.option)===JSON.stringify(installed.scope);});
      var old=group.list[installed.index];
      if(!old||old.id!==installed.regex.id)throw Error('目标正则发生变化，请重新检查');
      // Keep the user's enabled state, matcher, depth, placement and position. Upgrade only the loader.
      group.list[installed.index]=Object.assign({},old,{script_name:String(incoming.scriptName||old.script_name),replace_string:incoming.replaceString});group.changed=true;
      expected.push({repository:changes[i].repository,version:downloads[i].metadata.version,id:old.id,scope:group.option,replaceSha256:await client.sha256(new TextEncoder().encode(incoming.replaceString))});
    }
    for(var j=0;j<letters.length;j++){
      var letter=letters[j],letterGroup=groups.find(function(g){return JSON.stringify(g.option)===JSON.stringify(letter.scope);});
      var previous=letterGroup&&letterGroup.list[letter.index];
      if(!previous||previous.id!==letter.id)throw Error('轻量信件发生变化，请重新检查');
      letterGroup.list[letter.index]=Object.assign({},previous,{script_name:letter.scriptName,replace_string:letter.replaceString});letterGroup.changed=true;
      expected.push({repository:letter.repository,version:letter.version,id:letter.id,scope:letter.scope,replaceSha256:await client.sha256(new TextEncoder().encode(letter.replaceString))});
    }
    if(assertCurrent)assertCurrent();
    var finalSnapshot=scan();
    if(finalSnapshot.context!==before.context||finalSnapshot.fingerprint!==before.fingerprint)throw Error('正则设置在下载时发生变化，请重新检查');
    affected.forEach(function(g,index){
      var fresh=finalSnapshot.lists.find(function(s){return JSON.stringify(s.option)===JSON.stringify(g.option);});
      if(guard.assertSafe(before.host.window,g.option,fresh.list).rawFingerprint!==rawBefore[index])throw Error('正则原始设置已变化，请重新检查');
    });
    var receipt={schema:1,phase:'submitted',startedAt:Date.now(),context:before.context,expected:expected,backup:before.lists};
    // Saving the backup is a prerequisite; quota/private-mode errors abort before mutation.
    before.host.window.localStorage.setItem(RECEIPT,JSON.stringify(receipt));
    if(assertCurrent)assertCurrent();
    var jobs=[];
    groups.filter(function(g){return g.changed;}).forEach(function(g){
      // Start every host call in the same synchronous turn: refreshing reader may destroy this iframe.
      try{jobs.push(Promise.resolve(helper.replaceTavernRegexes(g.list,Object.assign({},g.option))));}catch(e){jobs.push(Promise.reject(e));}
    });
    var outcomes=await Promise.allSettled(jobs);
    var failed=outcomes.filter(function(r){return r.status==='rejected';});
    if(failed.length){receipt.phase='partial';receipt.errors=failed.map(function(r){return String(r.reason&&r.reason.message||r.reason);});before.host.window.localStorage.setItem(RECEIPT,JSON.stringify(receipt));throw Error('部分正则提交失败，备份已保留；请重新检查实际版本：'+receipt.errors.join('；'));}
    return receipt;
  }
  async function receiptStatus(){
    var current=scan(),raw=current.host.window.localStorage.getItem(RECEIPT);if(!raw)return null;
    var receipt=JSON.parse(raw);if(receipt.schema!==1||!Array.isArray(receipt.expected))throw Error('更新记录无法读取');
    var verified=[];
    for(var i=0;i<receipt.expected.length;i++){
      var e=receipt.expected[i],scope=current.lists.find(function(g){return JSON.stringify(g.option)===JSON.stringify(e.scope);});
      var found=scope&&scope.list.filter(function(r){return r.id===e.id;});
      var matches=!!found&&found.length===1&&await client.sha256(new TextEncoder().encode(found[0].replace_string))===e.replaceSha256;
      verified.push({repository:e.repository,version:e.version,matches:matches});
    }
    return {receipt:receipt,verified:verified,contextMatches:current.context===receipt.context};
  }
  function exportBackup(){
    var h=host(),raw=h.window.localStorage.getItem(RECEIPT);if(!raw)throw Error('没有可导出的更新备份');
    var doc=h.window.document,url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=doc.createElement('a');
    a.href=url;a.download='reader-booksea-regex-update-backup.json';doc.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},5000);
  }
  async function downloadRegex(project){
    var file=await client.download(project.latest),doc=host().window.document,url=URL.createObjectURL(new Blob([file.bytes],{type:'application/json'})),a=doc.createElement('a');
    a.href=url;a.download=(project.repository==='Adirm007/reader'?'reader':'protelysion')+'-fixed.regex.json';doc.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},5000);
  }
  root.DreamReleaseUpdates=Object.freeze({scan:scan,check:check,apply:apply,receiptStatus:receiptStatus,exportBackup:exportBackup});
  root.openDreamReleaseUpdates=function(e,toastFn){
    if(e&&e.stopPropagation)e.stopPropagation();
    var doc=getCustomPersonaHostDocument(),shell=createCustomPersonaLibraryShell(doc,'检查更新','');
    dreamAddonCss(doc);
    var box=doc.createElement('div');box.className='dad-form';var status=doc.createElement('div');status.className='dad-status';status.setAttribute('aria-live','polite');
    var info=doc.createElement('div');info.style.whiteSpace='pre-wrap';info.style.lineHeight='1.8';var buttons=doc.createElement('div');buttons.className='dad-row';box.appendChild(info);box.appendChild(status);box.appendChild(buttons);shell.card.appendChild(box);
    var busy=false;
    function setStatus(text,error){status.textContent=text;status.className='dad-status'+(error?' err':'');}
    function addButton(label,fn,primary){var b=customPersonaButton(doc,label,primary?'cpl-btn-primary':'',fn);buttons.appendChild(b);return b;}
    PROJECTS.forEach(function(p){var link=doc.createElement('a');link.href='https://github.com/'+p.repository+'/releases';link.target='_blank';link.rel='noopener noreferrer';link.textContent=p.label+'发布页';link.style.marginRight='16px';box.appendChild(link);});
    async function run(){
      if(busy)return;busy=true;buttons.textContent='';info.textContent='';setStatus('正在检查…');
      try{
        var checked=await check(), lines=[];
        checked.projects.forEach(function(p){
          var current=p.installed.length===1?'v'+p.installed[0].metadata.version+(p.installed[0].regex.enabled?'':'（已停用）'):p.installed.length>1?'发现重复安装':'未安装固定版';
          var detail=p.error?'检查失败：'+p.error:!p.latest?'仓库尚无不可变正式固定版':p.updatable?'可用更新 v'+p.latest.version:p.installed.length===1?'没有可用更新（仓库 v'+p.latest.version+'）':'仓库固定版 v'+p.latest.version+'，请先手动导入';
          if(p.invalid.length)detail='固定版设置无效：'+p.invalid.join('；');
          if(p.installed.length>1)detail='请先处理重复正则，再检查更新';
          lines.push(p.label+'：当前 '+current+'\n'+detail);
        });
        info.textContent=lines.join('\n\n');
        var candidates=checked.projects.filter(function(p){return p.updatable;});
        if(checked.snapshot.errors.length)setStatus('读取正则失败：'+checked.snapshot.errors.join('；'),true);
        else if(checked.projects.some(function(p){return p.error;}))setStatus('部分仓库检查失败，无法确认的项目不会更新。',true);
        else setStatus(candidates.length?'发现 '+candidates.length+' 项更新。更新会重新加载界面，原正则会先备份。':'检查完成。');
        if(candidates.length&&!checked.snapshot.errors.length){
          if(!helperReady(checked.snapshot.host.helper))setStatus('当前助手不支持安全替换，请升级至 4.9.3 或更新版本，或从发布页手动导入。',true);
          else addButton('一键更新（'+candidates.length+' 项）',async function(){
            if(busy)return;busy=true;buttons.textContent='';setStatus('正在下载并校验更新；校验完成后替换正则……');
            try{await apply(checked);setStatus('更新已提交，酒馆正在保存并重新加载界面。请重新打开此页核对结果。');}
            catch(err){setStatus(String(err&&err.message||err),true);addButton('重新检查',run);}
            finally{busy=false;}
          },true);
        }
        checked.projects.filter(function(p){return p.latest&&!p.error;}).forEach(function(p){addButton('下载'+p.label+'固定版',async function(){try{setStatus('正在校验下载……');await downloadRegex(p);setStatus('已下载经过校验的固定版；请在正则设置中导入。');}catch(e){setStatus(String(e.message||e),true);}});});
        var receipt=await receiptStatus();
        if(receipt&&receipt.contextMatches){var result=doc.createElement('div');result.className='dad-hint';result.textContent='上次更新核对：'+receipt.verified.map(function(v){var name=v.repository==='Adirm007/reader'?'读者':'书海';return name+' v'+v.version+(v.matches?' 已加载':' 尚未匹配，请重试或手动恢复');}).join('；');box.appendChild(result);addButton('导出更新备份',exportBackup);}
      }catch(err){setStatus(String(err&&err.message||err),true);}
      finally{busy=false;addButton('重新检查',run);addButton('关闭',function(){shell.close();});}
    }
    run();
  };
})(window);
/* DREAM_RELEASE_UPDATES_END */
