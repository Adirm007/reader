// Resources belong to this controller, including observers on the host document.
window.__readerControllerAlive = true;
(function () {
  var resources = [], listeners = [], owner = 'reader-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  var realHost = window.parent, realDoc = realHost.document;
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
    return new Proxy(target, { get: function (object, key) {
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
    var observer = realHost.__readerTemplateMenuObserverV1;
    if (observer) { observer.disconnect(); delete realHost.__readerTemplateMenuObserverV1; }
    realDoc.body.style.overflow = overflow;
    if (theme == null) realDoc.documentElement.removeAttribute('data-dream-theme');
    else realDoc.documentElement.setAttribute('data-dream-theme', theme);
    ['dfb','dfo','dfc','dream-hb','dream-p-toast','dlb-overlay','dlb-style','cp-overlay','cp-style','cpl-overlay','cpl-style','dgl-overlay','dgl-style-v2','chess-overlay','chess-styles','bs-overlay','bs-detail-ov','bs-styles','dream-addon-style-v3','dream-ink-native-v1','dream-theme-fix','reader-template-system-overlay','reader-template-system-style'].forEach(function (id) { realDoc.getElementById(id)?.remove(); });
    ['__dl','__dmid','__dread'].forEach(function (key) { delete realHost[key]; });
  };
})();
