/* Shared state writes for the persistent reader. No chat-level FP fallback. */
(function (globals) {
  'use strict';
  function createReaderTransactions(win, options) {
    options = options || {};
    var helper = win.TavernHelper || win;
    var host = win.SillyTavern ? win : win.parent;
    var context = function () { return host.SillyTavern.getContext(); };
    var pending = new Set(), queues = new Map(), sequence = 0;
    var clone = function (value) { return JSON.parse(JSON.stringify(value)); };
    function alive() {
      if (win.__readerControllerAlive === false || options.isAlive && !options.isAlive()) {
        throw new Error('读者已关闭，旧操作已取消');
      }
    }
    function capture() {
      alive();
      var ctx = context();
      var chatId = typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx.chatId;
      var messageId = typeof helper.getLastMessageId === 'function' ? helper.getLastMessageId() : ctx.chat.length - 1;
      if (chatId == null || chatId === '' || !Number.isSafeInteger(messageId) || messageId < 0) {
        throw new Error('请先打开有角色资料的聊天');
      }
      var native = ctx.chat && ctx.chat[messageId];
      return {chatId: String(chatId), characterId: String(ctx.characterId), messageId: messageId,
        native: native, swipeId: native && native.swipe_id, metadata: ctx.chatMetadata,
        id: 'reader-' + Date.now().toString(36) + '-' + (++sequence).toString(36)};
    }
    function assertCurrent(token) {
      alive();
      var ctx = context(), chatId = typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx.chatId;
      var last = typeof helper.getLastMessageId === 'function' ? helper.getLastMessageId() : ctx.chat.length - 1;
      if (!token || String(chatId) !== token.chatId || String(ctx.characterId) !== token.characterId ||
          last !== token.messageId || token.native && (ctx.chat[token.messageId] !== token.native || token.native.swipe_id !== token.swipeId)) {
        throw new Error('聊天或候选已变化，旧操作已取消，请在当前页面重试');
      }
      return ctx;
    }
    function read(token) {
      assertCurrent(token);
      if (typeof helper.getVariables !== 'function') throw new Error('缺少酒馆助手变量接口');
      return clone(helper.getVariables({type: 'message', message_id: token.messageId}) || {});
    }
    function fp(data) {
      var raw = data.stat_data && data.stat_data.命运点数;
      var value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      if (!Number.isFinite(value) || value < 0) throw new Error('还没有读到有效的命运点数，请等待角色资料就绪');
      return value;
    }
    function requireFp(token, cost) {
      var value = fp(read(token));
      if (!Number.isFinite(cost) || cost < 0) throw new Error('无效的FP费用');
      if (value < cost) throw new Error('FP不足，当前仅有 ' + value + 'FP');
      return value;
    }
    async function transact(token, id, mutate) {
      assertCurrent(token);
      if (typeof helper.updateVariablesWith !== 'function') throw new Error('缺少酒馆助手安全变量更新接口');
      var key = 'reader-write:' + token.characterId + ':' + token.chatId + ':' + token.messageId;
      var execute = async function () {
        assertCurrent(token);
        var result, applied = false;
        await helper.updateVariablesWith(function (current) {
          assertCurrent(token);
          var next = clone(current || {}), receipts = next.dream_reader_receipts || {};
          if (Object.prototype.hasOwnProperty.call(receipts, id)) { result = receipts[id].value; return current; }
          result = mutate(next);
          if (result && typeof result.then === 'function') throw new Error('状态提交内不能执行异步任务');
          var keys = Object.keys(receipts).slice(-127), kept = {};
          keys.forEach(function (name) { kept[name] = receipts[name]; });
          kept[id] = {value: result === undefined ? null : result};
          next.dream_reader_receipts = kept;
          applied = true;
          return next;
        }, {type: 'message', message_id: token.messageId});
        if (options.onCommit && applied) options.onCommit(token);
        return result;
      };
      var before = queues.get(key) || Promise.resolve();
      var job = before.catch(function () {}).then(function () {
        var locks = win.navigator && win.navigator.locks;
        return locks && typeof locks.request === 'function' ? locks.request(key, execute) : execute();
      });
      queues.set(key, job);
      try { return await job; } finally { if (queues.get(key) === job) queues.delete(key); }
    }
    function charge(data, cost) {
      var value = fp(data);
      if (!Number.isFinite(cost) || cost < 0) throw new Error('无效的FP费用');
      if (value < cost) throw new Error('FP不足，当前仅有 ' + value + 'FP');
      data.stat_data.命运点数 = value - cost;
      return value - cost;
    }
    async function run(key, action) {
      if (pending.has(key)) throw new Error('这项操作正在进行，请稍候');
      var token = capture();
      pending.add(key);
      if (key === 'paid-action') win.ReaderActiveTaskToken = token;
      try { return await action(token); } finally {
        pending.delete(key);
        if (win.ReaderActiveTaskToken === token) win.ReaderActiveTaskToken = null;
      }
    }
    function merge(target, patch) {
      Object.keys(patch).forEach(function (key) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('无效的变量字段');
        var value = patch[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
          merge(target[key], value);
        } else target[key] = clone(value);
      });
      return target;
    }
    function guardApi(api, token) {
      if (!token) return api;
      return new Proxy(api, {get: function (target, key) {
        var value = target[key];
        if (typeof value !== 'function') return value;
        return function () {
          assertCurrent(token);
          var args = Array.prototype.slice.call(arguments).map(function (arg) {
            if (typeof arg !== 'function') return arg;
            return function () { assertCurrent(token); return arg.apply(this, arguments); };
          });
          var result = value.apply(target, args);
          if (result && typeof result.then === 'function') return result.then(function (data) { assertCurrent(token); return data; });
          return result;
        };
      }});
    }
    return {capture: capture, assertCurrent: assertCurrent, read: read, fp: fp, requireFp: requireFp, guardApi: guardApi,
      transact: transact, charge: charge, run: run, merge: merge,
      write: function (token, patch, suffix) { return transact(token, token.id + ':' + (suffix || 'write'), function (data) { merge(data, patch); }); }};
  }
  globals.createReaderTransactions = createReaderTransactions;
  globals.ReaderTransactions = createReaderTransactions(globals);
})(window);
