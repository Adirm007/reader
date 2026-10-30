// Resources belong to this controller, including observers on the host document.
window.__readerControllerAlive = true;
(function () {
  var resources = [], listeners = [], owner = 'reader-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  var realHost = window.parent, realDoc = realHost.document;
  var legacyIds = ['dfb','dfo','dfc','dream-hb','dream-p-toast','dlb-overlay','dlb-style','cp-overlay','cp-style','cpl-overlay','cpl-style','dgl-overlay','dgl-style-v2','chess-overlay','chess-styles','bs-overlay','bs-detail-ov','bs-styles','dream-addon-style-v3','dream-ink-native-v1','dream-theme-fix','reader-template-system-overlay','reader-template-system-style'];
  var inheritedNodes = new Map(legacyIds.map(function(id){return [id,realDoc.getElementById(id)];}));
  var ownedGlobals = new Map(), sharedKeys = ['__dl','__dmid','__dread','__readerTemplateMenuObserverV1'];
  var overflow = realDoc.body.style.overflow;
  var theme = realDoc.documentElement.getAttribute('data-dream-theme');
  function keep(resource, method) { resources.push(function () { try { resource[method](); } catch (_) {} }); return resource; }
  ['MutationObserver', 'ResizeObserver', 'Worker'].forEach(function (name) {
    var Original = window[name];
    if (!Original) return;
    window[name] = function () { return keep(Reflect.construct(Original, Array.prototype.slice.call(arguments)), name === 'Worker' ? 'terminate' : 'disconnect'); };
    window[name].prototype = Original.prototype;
  });
  function tracked(target, isDocument) {
    return new Proxy(target, { set: function (object,key,value) {
      if(!isDocument&&sharedKeys.indexOf(key)>=0){
        if(!ownedGlobals.has(key))ownedGlobals.set(key,{present:Object.prototype.hasOwnProperty.call(object,key),before:object[key],value:value});
        else ownedGlobals.get(key).value=value;
      }
      return Reflect.set(object,key,value,object);
    }, get: function (object, key) {
      if (key === 'addEventListener') return function (event, fn, options) { listeners.push([object, event, fn, options]); object.addEventListener(event, fn, options); };
      if (key === 'removeEventListener') return function (event, fn, options) {
        listeners = listeners.filter(function (item) { return item[0] !== object || item[1] !== event || item[2] !== fn; });
        object.removeEventListener(event, fn, options);
      };
      if (isDocument && key === 'defaultView') return window.__readerTrackedHost;
      if (isDocument && key === 'createElement') return function () { var node = object.createElement.apply(object, arguments); node.setAttribute('data-reader-owner', owner); return node; };
      if (!isDocument && key === 'document') return window.__readerTrackedDocument;
      if (!isDocument && (key === 'MutationObserver' || key === 'ResizeObserver' || key === 'Worker')) return window[key];
      var value = Reflect.get(object, key, object);
      return typeof value === 'function' && !/^[A-Z]/.test(String(key)) ? value.bind(object) : value;
    } });
  }
  window.__readerTrackedDocument = tracked(realDoc, true);
  window.__readerTrackedHost = tracked(realHost, false);
  window.__readerCleanup = function () {
    window.__readerControllerAlive = false;
    resources.splice(0).forEach(function (dispose) { dispose(); });
    listeners.splice(0).forEach(function (item) { item[0].removeEventListener(item[1], item[2], item[3]); });
    realDoc.querySelectorAll('[data-reader-owner="' + owner + '"]').forEach(function (node) { node.remove(); });
    ownedGlobals.forEach(function(record,key){
      if(realHost[key]!==record.value)return;
      if(key==='__readerTemplateMenuObserverV1'&&record.value!==record.before)record.value?.disconnect();
      if(record.present)realHost[key]=record.before;else delete realHost[key];
    });
    realDoc.body.style.overflow = overflow;
    if (theme == null) realDoc.documentElement.removeAttribute('data-dream-theme');
    else realDoc.documentElement.setAttribute('data-dream-theme', theme);
    legacyIds.forEach(function (id) { var node=realDoc.getElementById(id);if(node&&node!==inheritedNodes.get(id))node.remove(); });
  };
})();
