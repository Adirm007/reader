/* DREAM_STANDALONE_BOOTSTRAP_BEGIN */
(function(root){
  'use strict';
  // Serialized into the installed module; only platform globals and start() are free variables.
  root.ReaderStandaloneBootstrap=function(config){
    var host=window.parent||window, alive=true, pending=false, again=false, failedKey=null, timer=null, stops=[];
    var previous=host.__readerStandaloneStatus;
    if(previous&&previous.id===config.id&&typeof previous.cancel==='function')previous.cancel();
    var instance=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    var status={id:config.id,token:config.token,instance:instance,version:config.version,phase:'pending',error:null};
    host.__readerStandaloneStatus=status;
    function owns(api){var owner=api&&api.scriptOwner;return !!owner&&owner.id===config.id&&owner.token===config.token&&owner.instance===instance;}
    function current(){
      var ctx=host.SillyTavern.getContext(),character=ctx.characters&&ctx.characters[ctx.characterId];
      var avatar=character&&character.avatar,chat=typeof ctx.getCurrentChatId==='function'?ctx.getCurrentChatId():ctx.chatId;
      var variables=ctx.chatMetadata&&ctx.chatMetadata.variables;
      try{
        var helper=window.TavernHelper||host.TavernHelper,read=window.getVariables||helper&&helper.getVariables;
        if(typeof read==='function')variables=read.call(helper,{type:'chat'});
      }catch(e){}
      var core=variables&&variables['系统核心'];
      var hasDream=Array.isArray(ctx.chat)&&ctx.chat.some(function(message){return typeof message.mes==='string'&&/<dream(?:\s|>)/i.test(message.mes);});
      var eligible=!!avatar&&chat!=null&&(!core||core==='九十九夜梦')
        &&(core==='九十九夜梦'||avatar===config.initialAvatar||config.scope==='global'&&hasDream)
        &&(config.scope!=='character'||avatar===config.initialAvatar);
      return {key:JSON.stringify([ctx.characterId,avatar,chat,core||'']),eligible:eligible};
    }
    function release(){var api=host.ReaderCore;if(owns(api)){try{api.stop();}catch(e){}}}
    function dispose(){
      if(!alive)return;alive=false;clearInterval(timer);stops.forEach(function(stop){try{stop();}catch(e){}});release();
      status.phase='stopped';window.removeEventListener('pagehide',dispose);
      if(host.__readerStandaloneStatus===status)delete host.__readerStandaloneStatus;
    }
    status.cancel=dispose;
    async function synchronize(){
      if(!alive)return;
      if(host.__readerStandaloneStatus!==status){dispose();return;}
      if(pending){again=true;return;}
      pending=true;
      try{
        var before=current();status.context=before.key;
        if(!before.eligible){release();status.phase='paused';failedKey=null;return;}
        var active=host.ReaderCore;
        if(active&&active.isAlive!==false&&!owns(active)&&active.scriptOwner&&active.scriptOwner.id===config.id){active.stop();active=host.ReaderCore;}
        if(active&&active.isAlive!==false&&!owns(active)){status.phase='delegated';failedKey=null;return;}
        if(active&&active.isAlive!==false&&owns(active)){status.phase='ready';failedKey=null;return;}
        if(failedKey===before.key)return;
        status.phase='starting';status.error=null;
        var api=await start({scriptOwner:{id:config.id,token:config.token,scope:config.scope,instance:instance}});
        if(!api||!owns(api)||api.runtimeVersion!==config.version)throw Error('常驻脚本身份或版本不符');
        if(!await api.ready)throw Error('读者控制器未能启动');
        var after=current();
        if(!alive||host.__readerStandaloneStatus!==status||!after.eligible||after.key!==before.key||host.ReaderCore!==api){
          if(owns(api)&&host.ReaderCore===api)api.stop();
          status.phase='paused';again=alive;return;
        }
        status.phase='ready';failedKey=null;
      }catch(error){
        release();status.phase='failed';status.error=String(error&&error.message||error);
        try{failedKey=current().key;}catch(e){}
        console.warn('[读者] 常驻脚本未启动',status.error);
      }finally{
        pending=false;
        if(again&&alive){again=false;void synchronize();}
      }
    }
    window.addEventListener('pagehide',dispose,{once:true});
    var events=window.tavern_events||host.tavern_events||{},listen=window.eventOn;
    if(typeof listen==='function'){
      ['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED','GENERATION_ENDED'].forEach(function(name){
        if(!events[name])return;var listener=listen(events[name],function(){void synchronize();});
        if(listener&&typeof listener.stop==='function')stops.push(function(){listener.stop();});
      });
    }
    // Core selection also changes chat metadata without a message event.
    timer=setInterval(function(){void synchronize();},1000);
    void synchronize();
    return {dispose:dispose};
  };
})(window);
/* DREAM_STANDALONE_BOOTSTRAP_END */
