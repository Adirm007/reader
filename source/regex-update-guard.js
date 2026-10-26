/* DREAM_REGEX_UPDATE_GUARD_BEGIN */
(function(root){
  'use strict';
  function context(w){if(!w.SillyTavern||typeof w.SillyTavern.getContext!=='function')throw Error('无法核对酒馆原始正则设置，请手动导入');return w.SillyTavern.getContext();}
  function stable(value){
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(function(k){return value[k]!==undefined;}).map(function(k){return JSON.stringify(k)+':'+stable(value[k]);}).join(',')+'}';
    return JSON.stringify(value);
  }
  function identity(w){
    var c=context(w),character=c.characters&&c.characters[c.characterId],preset=null,api=null;
    try{var manager=c.getPresetManager&&c.getPresetManager();if(manager&&typeof manager.getSelectedPresetName==='function')preset=manager.getSelectedPresetName();}catch(e){}
    if(typeof c.mainApi==='string')api=c.mainApi;
    return Object.freeze({characterId:c.characterId==null?null:String(c.characterId),characterAvatar:character&&character.avatar||null,presetName:typeof preset==='string'?preset:null,presetApi:api});
  }
  function rawScope(w,option){
    var c=context(w),value;
    if(option.type==='global')value=c.extensionSettings&&c.extensionSettings.regex;
    else if(option.type==='character'&&(!option.name||option.name==='current')){
      var character=c.characters&&c.characters[c.characterId];if(!character)throw Error('当前角色不可用，请重新检查');
      value=character.data&&character.data.extensions&&character.data.extensions.regex_scripts;
    }else if(option.type==='preset'&&(!option.name||option.name==='in_use')){
      if(!c.chatCompletionSettings)throw Error('无法核对当前预设，请手动导入');
      value=c.chatCompletionSettings.extensions&&c.chatCompletionSettings.extensions.regex_scripts;
      if(!identity(w).presetName)throw Error('无法确认当前预设身份，请手动导入');
    }else throw Error('不支持的正则范围');
    if(value==null)return [];
    if(!Array.isArray(value))throw Error('酒馆原始正则设置格式异常');return value;
  }
  function convert(r){
    if(!r||typeof r.id!=='string'||typeof r.script_name!=='string'||!r.script_name.trim()||typeof r.enabled!=='boolean'||typeof r.find_regex!=='string'||typeof r.replace_string!=='string'||!r.source||!r.destination)throw Error('正则字段不完整，不能安全一键更新');
    return {id:r.id,scriptName:r.script_name,disabled:!r.enabled,runOnEdit:r.run_on_edit,findRegex:r.find_regex,trimStrings:r.trim_strings||[],replaceString:r.replace_string,
      placement:[['user_input',1],['ai_output',2],['slash_command',3],['world_info',5],['reasoning',6]].filter(function(p){return r.source[p[0]];}).map(function(p){return p[1];}),
      substituteRegex:0,minDepth:r.min_depth,maxDepth:r.max_depth,markdownOnly:r.destination.display,promptOnly:r.destination.prompt};
  }
  function assertSafe(w,option,list){
    if(!Array.isArray(list))throw Error('正则列表格式异常');
    var raw=rawScope(w,option),ids=new Set();
    if(raw.length!==list.length)throw Error('正则设置发生变化，请重新检查');
    for(var i=0;i<list.length;i++){
      if(ids.has(list[i].id))throw Error('正则 ID 重复，请先处理重复安装');ids.add(list[i].id);
      if(!raw[i]||raw[i].id!==list[i].id||stable(raw[i])!==stable(convert(list[i])))throw Error('该范围包含助手无法完整保留的正则设置，请下载固定版后手动导入');
    }
    return Object.freeze({identity:identity(w),rawFingerprint:stable(raw)});
  }
  root.DreamRegexUpdateGuard=Object.freeze({assertSafe:assertSafe,identity:identity});
})(window);
/* DREAM_REGEX_UPDATE_GUARD_END */
