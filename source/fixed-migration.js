/* DREAM_FIXED_MIGRATION_BEGIN */
(function(root){
  'use strict';
  var REPOSITORY='Adirm007/reader',FIXED='cfc0375e-3c5c-4ea1-8b7b-2093c7df0a11',LIGHT='b1c5a3f2-1007-4e0a-9d7e-5a1e0c0d1007';
  var KNOWN=[FIXED,LIGHT,'67cdbb11-48d4-4c04-80d3-8300d24935f7'];
  function host(){return root.parent||root;}
  function current(){var h=host(),c=h.SillyTavern&&h.SillyTavern.getContext();if(!c)throw Error('当前角色不可用');return {id:c.characterId,chat:typeof c.getCurrentChatId==='function'?c.getCurrentChatId():c.chatId,avatar:c.characters&&c.characters[c.characterId]&&c.characters[c.characterId].avatar};}
  function capture(){var identity=JSON.stringify(current()),preset=root.DreamRegexUpdateGuard&&JSON.stringify(root.DreamRegexUpdateGuard.identity(host()));return function(){if(root.__readerControllerAlive===false||JSON.stringify(current())!==identity||preset&&preset!==JSON.stringify(root.DreamRegexUpdateGuard.identity(host())))throw Error('聊天、角色或预设已变化，请重新检查更新');};}
  function scan(){if(!root.DreamReleaseUpdates)throw Error('固定版正则检查模块不可用');return root.DreamReleaseUpdates.scan();}
  function hasFixed(){try{return scan().projects.some(function(p){return p.repository===REPOSITORY&&p.installed.some(function(i){return i.regex.enabled;});});}catch(e){return false;}}
  function managed(r){return KNOWN.indexOf(r.id)>=0&&typeof r.find_regex==='string'&&r.find_regex.indexOf('<dream>')>=0;}
  function validateLight(regex,version){
    if(!regex||regex.id!==LIGHT||regex.scriptName!=='读者对话渲染-脚本版'||!regex.readerRuntime||regex.readerRuntime.version!==version||regex.readerRuntime.kind!=='light-letter'||typeof regex.replaceString!=='string'||regex.replaceString.length>200000||regex.replaceString.indexOf('ReaderLetter')<0||/<audio\b|function\s+openDreamLobby\b/i.test(regex.replaceString))throw Error('更新资源不是同版轻量信件');
    var marks=regex.replaceString.match(/<!-- READER_RUNTIME:\{[^\r\n]*?\} -->/g)||[];
    if(marks.length!==1)throw Error('轻量信件版本标记缺失或重复');
    var mark=JSON.parse(marks[0].slice('<!-- READER_RUNTIME:'.length,-' -->'.length));
    if(mark.schema!==1||mark.kind!=='light-letter'||mark.version!==version)throw Error('轻量信件版本不符');
  }
  function samePin(a,b){return a&&b&&a.repository===b.repository&&a.version===b.version&&a.sourceCommit===b.sourceCommit&&a.manifestSha256===b.manifestSha256;}
  async function check(selected){
    if(!selected||selected.repository!==REPOSITORY)throw Error('尚无可验证的读者脚本版');
    if(!root.ReaderScriptInstaller)throw Error('脚本安装模块不可用');
    var snapshot=scan(),project=snapshot.projects.find(function(p){return p.repository===REPOSITORY;});
    if(snapshot.errors.length||!project||project.invalid.length||project.installed.length!==1)throw Error('固定版缺失、重复或部分正则范围无法读取，请先检查安装');
    var target=project.installed[0];if(!target.regex.enabled)throw Error('当前固定版已停用，请先确认要迁移的版本');
    snapshot.lists.forEach(function(group){group.list.forEach(function(rule){
      if(rule.id===LIGHT&&!managed(rule))throw Error('轻量信件 ID 已被其他规则使用，已保留原规则');
      if(rule!==target.regex&&rule.id!==target.regex.id&&managed(rule)&&rule.enabled)throw Error('发现其他已启用读者正则，请先处理重复安装');
      if(group.option.type!==target.scope.type&&managed(rule)&&rule.enabled)throw Error('不同范围存在已启用读者规则，请先处理重复安装');
    });});
    if(!root.DreamRegexUpdateGuard)throw Error('正则设置保护模块不可用');
    var group=snapshot.lists.find(function(g){return JSON.stringify(g.option)===JSON.stringify(target.scope);});
    var protection=root.DreamRegexUpdateGuard.assertSafe(host(),target.scope,group.list);
    var scripts=root.ReaderScriptInstaller.inspect({scope:target.scope.type});
    return {status:'outdated',selected:selected,snapshot:snapshot,target:target,group:group,protection:protection,scripts:scripts,detail:'固定版可升级为常驻脚本；脚本就绪后切换轻量信件'};
  }
  async function install(plan,assertCurrent){
    var guard=assertCurrent||capture(),client=root.DreamFixedReleaseClient;
    guard();if(scan().context!==plan.snapshot.context)throw Error('聊天、角色或预设已变化，请重新检查更新');
    // Verify both sides before any script-library or regex mutation.
    var artifacts=await Promise.all([client.resource(plan.selected,'reader-runtime.js'),client.resource(plan.selected,'reader-letter.json')]);
    var runtime=artifacts[0],letter=artifacts[1],regex=JSON.parse(new TextDecoder().decode(letter.bytes));
    if(!samePin(runtime.metadata,letter.metadata)||runtime.metadata.repository!==REPOSITORY||runtime.metadata.version!==plan.selected.version)throw Error('脚本与轻量信件不是同一个固定版本');
    validateLight(regex,runtime.metadata.version);guard();
    var old=plan.target.regex,next=Object.assign({},old,{id:LIGHT,script_name:regex.scriptName,replace_string:regex.replaceString});
    var replacement=[];plan.group.list.forEach(function(rule,index){if(index===plan.target.index)replacement.push(next);else if(!managed(rule))replacement.push(rule);});
    var expected=JSON.stringify(plan.snapshot.lists.map(function(group){return {option:group.option,list:JSON.stringify(group.option)===JSON.stringify(plan.target.scope)?replacement:group.list};}));
    async function completed(fresh){
      if(fresh.fingerprint!==expected)return null;
      root.DreamRegexUpdateGuard.assertSafe(host(),plan.target.scope,replacement);
      var verified=await root.ReaderScriptInstaller.verify({scope:plan.target.scope.type},guard);
      if(verified.version!==runtime.metadata.version||!samePin(Object.assign({repository:REPOSITORY},verified.metadata),runtime.metadata)||verified.metadata.sourceSha256!==runtime.spec.sha256)throw Error('已安装脚本与本次更新来源不符，请重新检查');
      guard();if(scan().fingerprint!==expected)throw Error('正则在核对时已变化，请重新检查');
      return {detail:'已切换轻量信件 v'+runtime.metadata.version,version:runtime.metadata.version,id:verified.id};
    }
    var before=scan();
    if(before.fingerprint!==plan.snapshot.fingerprint){var done=await completed(before);if(done)return done;throw Error('正则在检查后已变化，请重新检查');}
    var installed=await root.ReaderScriptInstaller.install(runtime,guard,{scope:plan.target.scope.type,snapshot:plan.scripts.snapshot});
    guard();
    var fresh=scan();
    if(fresh.fingerprint!==plan.snapshot.fingerprint){
      var concurrent=await completed(fresh);if(concurrent)return concurrent;
      throw Error('脚本已安装，但正则发生变化；请重新检查');
    }
    var h=fresh.host.helper,group=fresh.lists.find(function(g){return JSON.stringify(g.option)===JSON.stringify(plan.target.scope);});
    if(root.DreamRegexUpdateGuard.assertSafe(host(),plan.target.scope,group.list).rawFingerprint!==plan.protection.rawFingerprint)throw Error('原始正则设置已变化，请重新检查');
    var currentRule=group.list[plan.target.index];if(!currentRule||currentRule.id!==plan.target.regex.id)throw Error('原固定版发生变化，请重新检查');
    host().localStorage.setItem('dream_reader_fixed_migration_backup_v1',JSON.stringify({schema:1,context:current(),scope:plan.target.scope,regexes:group.list,scriptId:installed.id,version:runtime.metadata.version}));
    guard();await h.replaceTavernRegexes(replacement,plan.target.scope);
    guard();var saved=h.getTavernRegexes(plan.target.scope),found=saved.filter(function(rule){return rule.id===LIGHT;});
    if(found.length!==1||found[0].replace_string!==regex.replaceString)throw Error('脚本已安装，轻量信件保存尚未确认；请重新检查');
    return {detail:'已切换轻量信件 v'+runtime.metadata.version,scriptDetail:'酒馆助手常驻脚本已安装并就绪 v'+runtime.metadata.version,version:runtime.metadata.version,id:installed.id};
  }
  async function autoStart(){
    var fixed=root.DREAM_READER_FIXED;
    if(root.__readerHostApi||!fixed||!fixed.manifest||fixed.manifest.installMode!=='script')return;
    var h=host(),identity=JSON.stringify(current()),key='__readerFixedMigrationPending';
    if(h[key]&&h[key].identity===identity){
      if(h[key].version===fixed.version)return h[key].promise;
      return h[key].promise.catch(function(){}).then(function(){return autoStart();});
    }
    var guard=capture(),job=(async function(){try{if(!hasFixed())return;var plan=await check({repository:REPOSITORY,version:fixed.version});guard();if(plan.target.metadata.version!==fixed.version)return;return await install(plan,guard);}catch(error){root.__readerMigrationError=String(error&&error.message||error);if(typeof root.showToast==='function')root.showToast('常驻脚本未完成安装：'+root.__readerMigrationError+'；原固定版已保留');throw error;}})();
    h[key]={identity:identity,version:fixed.version,promise:job};
    function finished(){if(h[key]&&h[key].promise===job)delete h[key];}
    job.then(finished,finished);return job;
  }
  root.ReaderFixedMigration=Object.freeze({check:check,install:install,hasFixed:hasFixed,autoStart:autoStart,validateLight:validateLight});
})(window);
/* DREAM_FIXED_MIGRATION_END */
