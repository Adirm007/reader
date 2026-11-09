// TEMP_MAIN_CARD_43: finish only the reader release already accepted with this light rule.
// No latest lookup, polling, script-library entry or card change is involved.
(function(root){
  'use strict';
  var VERSION=__READER_LETTER_VERSION__,UPDATER=__READER_LEGACY_UPDATER_SOURCE__;
  root.ReaderLetterUpdaterBridge=function(api,assertLetter){
    var host=root.parent,options=api&&api.getUpdateOptions&&api.getUpdateOptions()||{};
    if(!api||api.scriptOwner||options.hostMode==='auto-regex'||typeof api.replaceRuntime!=='function')return;
    var controller;
    try{assertLetter();controller=host.document.getElementById('reader-core-controller').contentWindow;}catch(error){return;}
    var client=controller.DreamFixedReleaseClient;
    if(!client||client.compare(api.runtimeVersion,VERSION)>=0)return;
    var prior=host.__readerAcceptedLetterUpgrade;
    if(prior&&prior.api===api&&prior.version===VERSION&&prior.phase==='pending'){prior.guards.push(assertLetter);return prior.promise;}
    if(prior&&prior.phase==='pending')return;
    var job={api:api,version:VERSION,phase:'pending',guards:[assertLetter],promise:null};
    host.__readerAcceptedLetterUpgrade=job;
    function check(){
      if(host.ReaderCore!==api||api.isAlive===false||controller.__readerControllerAlive===false)throw Error('读者或聊天已变化，已取消旧信件更新');
      if(!job.guards.some(function(guard){try{guard();return true;}catch(error){return false;}}))throw Error('来信已不属于当前聊天，已取消旧信件更新');
    }
    job.promise=(async function(){
      check();
      if(typeof controller.ReaderUpdates?.completeAcceptedLetter!=='function'){
        var script=controller.document.createElement('script');script.textContent=UPDATER;
        controller.document.head.appendChild(script);script.remove();
      }
      if(typeof controller.ReaderUpdates?.completeAcceptedLetter!=='function')throw Error('读者更新入口未能修复，请重新显示这封信');
      await controller.ReaderUpdates.completeAcceptedLetter(VERSION,check);
      job.phase='complete';
    })().catch(function(error){
      job.phase='failed';job.error=String(error&&error.message||error);
      if(host.ReaderCore!==api||api.isAlive===false)return;
      api.updateRestoreError='读者脚本尚未完成更新：'+job.error+'；请重新打开检查更新后重试';
      try{controller.pToast(api.updateRestoreError);}catch(ignored){}
    });
    return job.promise;
  };
})(window);
