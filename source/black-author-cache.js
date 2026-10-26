/* DREAM_AUTHOR_CACHE_BEGIN */
(function () {
  'use strict';
  // Build-time data, downloaded with the hash-verified reader.js. Never executable.
  var profile = __DREAM_AUTHOR_PROFILE__;
  var key = 'dream_black_author_prompt';
  try {
    if (window.frameElement && !window.frameElement.isConnected) return;
    var owner = window.parent && window.parent.SillyTavern ? window.parent : window;
    var context = owner.SillyTavern && owner.SillyTavern.getContext();
    if (!context || !context.chatMetadata || typeof context.saveMetadata !== 'function') return;
    var id = typeof context.getCurrentChatId === 'function' ? context.getCurrentChatId() : context.chatId;
    if (id == null || id === '') return;
    var metadata = context.chatMetadata;
    var variables = metadata.variables || (metadata.variables = {});
    var serialized = JSON.stringify(profile);
    var previousValue = variables[key];
    // A string is replaced atomically; no deep merge with a retired payload.
    if (variables[key] === serialized) return;
    try {
      var previous = JSON.parse(variables[key]);
      if (previous && previous.schema === profile.schema && previous.name === profile.name &&
          Number(previous.revision) > profile.revision &&
          ['definition', 'persona', 'execution', 'curse', 'publicRecord', 'revival', 'systemName', 'fpDefinition', 'revealStyle', 'learning'].every(function (field) {
            return typeof previous[field] === 'string' && previous[field].length > 0;
          })) return;
    } catch (_) {}
    variables[key] = serialized;
    // Start the save synchronously, before yielding to chat-switch events.
    var failed = function (error) {
      if (variables[key] === serialized) {
        if (previousValue === undefined) delete variables[key];
        else variables[key] = previousValue;
      }
      console.error('[Reader] 人格资料保存失败', error);
    };
    try {
      Promise.resolve(context.saveMetadata()).catch(failed);
    } catch (error) {
      failed(error);
    }
  } catch (error) {
    console.error('[Reader] 人格资料初始化失败', error);
  }
})();
/* DREAM_AUTHOR_CACHE_END */
