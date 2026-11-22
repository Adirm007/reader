/* DREAM_EXTRA_SETTINGS_BEGIN */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'dream_extra_settings';
  var EJS_OPEN = '<' + '%';
  var EJS_CLOSE = '%' + '>';
  var KIND_LABELS = {
    mechanism: '机制',
    appearance: '外貌',
    personality: '性格'
  };
  var KIND_PLACEHOLDERS = {
    mechanism: '填写额外机制、规则或 EJS 条件逻辑（将并入核心机制区，与【章节起始】同处）…',
    appearance: '填写外貌细节、服饰或条件外观变化（将并入此刻形象处，支持 EJS）…',
    personality: '填写性格特质、口癖、习惯或互动偏好（将并入主人格人设处，支持 EJS）…'
  };

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getHostWindow() {
    try { return root.parent && root.parent !== root ? root.parent : root; }
    catch (_) { return root; }
  }

  function getSTContext(win) {
    var target = win || getHostWindow();
    try { return target.SillyTavern && typeof target.SillyTavern.getContext === 'function' ? target.SillyTavern.getContext() : null; }
    catch (_) { return null; }
  }

  function createId() {
    return 'es_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function sanitizeItem(item, index) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    var content = typeof item.content === 'string' ? item.content : '';
    var rawKind = item.kind === 'ejs' ? 'mechanism' : item.kind;
    var kind = rawKind === 'personality' || rawKind === 'appearance' || rawKind === 'mechanism'
      ? rawKind
      : 'mechanism';
    var name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '';
    var id = typeof item.id === 'string' && item.id.trim()
      ? item.id.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
      : '';
    return {
      id: id || createId(),
      name: name,
      kind: kind,
      enabled: item.enabled !== false,
      applyWhenSilent: item.applyWhenSilent === true,
      content: content
    };
  }

  function normalizeList(raw) {
    var parsed = raw;
    if (typeof raw === 'string' && raw.trim()) {
      try { parsed = JSON.parse(raw); } catch (_) { parsed = []; }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.items)) {
      parsed = parsed.items;
    }
    if (!Array.isArray(parsed)) return [];
    var out = [], seen = {};
    for (var i = 0; i < parsed.length; i++) {
      var clean = sanitizeItem(parsed[i], i);
      if (!clean) continue;
      if (seen[clean.id]) clean.id = createId();
      seen[clean.id] = true;
      out.push(clean);
    }
    return out;
  }

  function loadList(win) {
    var ctx = getSTContext(win);
    var raw = ctx && ctx.chatMetadata && ctx.chatMetadata.variables ? ctx.chatMetadata.variables[STORAGE_KEY] : null;
    if (raw == null && typeof root.getSTVariable === 'function') {
      try { raw = root.getSTVariable(STORAGE_KEY); } catch (_) {}
    }
    return normalizeList(raw);
  }

  function saveList(list, win) {
    var clean = normalizeList(list);
    var hostWin = win || getHostWindow();
    var ctx = getSTContext(hostWin);
    if (ctx && ctx.chatMetadata) {
      if (!ctx.chatMetadata.variables || typeof ctx.chatMetadata.variables !== 'object') {
        ctx.chatMetadata.variables = {};
      }
      if (clean.length === 0) delete ctx.chatMetadata.variables[STORAGE_KEY];
      else ctx.chatMetadata.variables[STORAGE_KEY] = JSON.stringify(clean);
      try { if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata(); } catch (_) {}
    } else if (typeof root.setSTVariable === 'function') {
      if (clean.length === 0) {
        if (typeof root.delSTVariable === 'function') root.delSTVariable(STORAGE_KEY);
      } else {
        root.setSTVariable(STORAGE_KEY, JSON.stringify(clean));
      }
    }
    var targets = [root, hostWin];
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      if (!target || typeof target.dispatchEvent !== 'function') continue;
      if (i > 0 && target === targets[0]) continue;
      try {
        var EventCtor = target.CustomEvent || root.CustomEvent;
        if (typeof EventCtor === 'function') {
          target.dispatchEvent(new EventCtor('dream:extra-settings-changed', { detail: clean }));
        }
      } catch (_) {}
    }
    return clean;
  }

  function compileEjsBody(template) {
    var src = String(template == null ? '' : template);
    var code = ['var __o = [];', 'with (__locals) {'];
    var pos = 0;
    var stripNextWs = '';
    while (pos < src.length) {
      var idx = src.indexOf(EJS_OPEN, pos);
      if (idx < 0) {
        var tail = src.slice(pos);
        if (stripNextWs === '_') tail = tail.replace(/^[ \t]*(?:\r?\n)?/, '');
        else if (stripNextWs === '-') tail = tail.replace(/^\r?\n/, '');
        stripNextWs = '';
        if (tail) code.push('__o.push(' + JSON.stringify(tail) + ');');
        break;
      }
      var text = src.slice(pos, idx);
      if (stripNextWs === '_') text = text.replace(/^[ \t]*(?:\r?\n)?/, '');
      else if (stripNextWs === '-') text = text.replace(/^\r?\n/, '');
      stripNextWs = '';
      var after = idx + 2;
      var ch = src.charAt(after);
      var mode = '';
      if (ch === '_' || ch === '-' || ch === '=' || ch === '#') { mode = ch; after++; }
      if (mode === '_') text = text.replace(/[ \t]+$/, '');
      if (text) code.push('__o.push(' + JSON.stringify(text) + ');');
      var end = src.indexOf(EJS_CLOSE, after);
      if (end < 0) {
        code.push('__o.push(' + JSON.stringify(src.slice(idx)) + ');');
        break;
      }
      var inner = src.slice(after, end);
      var closeTail = inner.slice(-1);
      if (closeTail === '_' || closeTail === '-') {
        stripNextWs = closeTail;
        inner = inner.slice(0, -1);
      }
      pos = end + 2;
      if (mode === '#') continue;
      if (mode === '-' || mode === '=') {
        var expr = inner.trim().replace(/;\s*$/, '');
        if (expr) code.push('__o.push((function(){ var __v = (' + expr + '); return __v == null ? "" : String(__v); })());');
      } else {
        code.push(inner);
      }
    }
    code.push('}', 'return __o.join("");');
    return code.join('\n');
  }

  function evalEjs(template, locals) {
    var src = String(template == null ? '' : template);
    if (src.indexOf(EJS_OPEN) < 0) return src;
    var body = compileEjsBody(src);
    var fn = new Function('__locals', body);
    return String(fn(locals || {}) || '');
  }

  function readPath(obj, pathStr) {
    var parts = String(pathStr || '').split('.').filter(Boolean);
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function buildPreviewLocals(win) {
    var hostWin = win || getHostWindow();
    var ctx = getSTContext(hostWin) || {};
    var chatVars = (ctx.chatMetadata && ctx.chatMetadata.variables && typeof ctx.chatMetadata.variables === 'object')
      ? ctx.chatMetadata.variables : {};
    var msgVars = {};
    try {
      var TH = root.TavernHelper || hostWin.TavernHelper;
      if (TH && typeof TH.getVariables === 'function') {
        msgVars = TH.getVariables({ type: 'message', message_id: 'latest' }) || {};
      }
    } catch (_) {}
    if (!msgVars || typeof msgVars !== 'object') msgVars = {};
    if (!msgVars.stat_data && root.ReaderCore && typeof root.ReaderCore.readFloor === 'function') {
      try { msgVars = root.ReaderCore.readFloor() || msgVars; } catch (_) {}
    }
    var merged = Object.assign({}, chatVars, msgVars);
    var chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    function filterMsgs(role) {
      return chat.filter(function (m) {
        if (!m || m.is_system) return false;
        if (role === 'user') return m.is_user === true;
        if (role === 'assistant') return m.is_user !== true;
        return true;
      });
    }
    function pickMsg(index, role) {
      var list = filterMsgs(role);
      var n = Math.trunc(Number(index));
      if (!Number.isFinite(n)) return '';
      var item = list[n < 0 ? list.length + n : n];
      return item ? String(item.mes || '') : '';
    }
    function matchMsgs(patterns, opts) {
      var o = opts || {};
      var list = filterMsgs(o.role);
      var from = o.start === undefined ? -1 : Math.trunc(Number(o.start));
      var to = o.end === undefined ? list.length : Math.trunc(Number(o.end));
      if (from < 0) from = Math.max(0, list.length + from);
      if (to < 0) to = list.length + to;
      var text = list.slice(from, Math.max(from, to)).map(function (m) { return String(m.mes || ''); }).join('\n');
      var arr = Array.isArray(patterns) ? patterns : [patterns];
      return arr.some(function (p) {
        if (p instanceof RegExp || (p && typeof p.test === 'function')) { p.lastIndex = 0; return p.test(text); }
        return p != null && String(p) !== '' && text.indexOf(String(p)) >= 0;
      });
    }
    var lastUserIdx = -1;
    for (var i = chat.length - 1; i >= 0; i--) {
      if (chat[i] && !chat[i].is_system && chat[i].is_user === true) { lastUserIdx = i; break; }
    }
    var theme = typeof root.getVisualTheme === 'function' ? root.getVisualTheme() : (chatVars.dream_visual_theme || 'cafe');
    var place = theme === 'summer' ? '海滨咖啡馆' : (theme === 'ink' ? '茶楼' : '咖啡馆');
    var persona = typeof chatVars.dream_persona === 'string' && chatVars.dream_persona.trim() ? chatVars.dream_persona.trim() : 'reader';
    var sysNameMap = { reader: '读者', shoujo: '心爱的少女', genki: '开朗的少女', weirdo: '怪人', kuromaku: '哀怜的少女' };
    return {
      getvar: function (key, opts) {
        var o = opts || {};
        var src = o.scope === 'local' ? chatVars : (o.scope === 'message' ? msgVars : merged);
        var val = readPath(src, key);
        return val === undefined ? o.defaults : val;
      },
      getLocalVar: function (key, opts) {
        var val = readPath(chatVars, key);
        return val === undefined ? (opts || {}).defaults : val;
      },
      getMessageVar: function (key, opts) {
        var val = readPath(msgVars, key);
        return val === undefined ? (opts || {}).defaults : val;
      },
      setLocalVar: function (key, value) { return value; },
      setMessageVar: function (key, value) { return value; },
      setvar: function (key, value) { return value; },
      getChatMessage: pickMsg,
      matchChatMessages: matchMsgs,
      stat_data: (msgVars && typeof msgVars.stat_data === 'object' && msgVars.stat_data) ? msgVars.stat_data : {},
      persona: persona,
      theme: theme,
      place: place,
      systemName: sysNameMap[persona] || '读者',
      lastUserMessage: pickMsg(-1, 'user'),
      lastCharMessage: pickMsg(-1, 'assistant'),
      lastUserMessageId: lastUserIdx,
      lastMessageId: chat.length - 1,
      SillyTavern: hostWin.SillyTavern,
      _: root._ || hostWin._
    };
  }

  function withDefaultHelpers(locals) {
    var base = locals && typeof locals === 'object' ? Object.assign({}, locals) : {};
    var statObj = base.stat_data && typeof base.stat_data === 'object' ? base.stat_data : {};
    var msgRoot = { stat_data: statObj };
    if (typeof base.getMessageVar !== 'function') {
      base.getMessageVar = function (key, opts) {
        var val = readPath(msgRoot, key);
        return val === undefined ? (opts || {}).defaults : val;
      };
    }
    if (typeof base.getLocalVar !== 'function') {
      base.getLocalVar = function (key, opts) {
        var val = readPath(base, key);
        return val === undefined ? (opts || {}).defaults : val;
      };
    }
    if (typeof base.getvar !== 'function') {
      base.getvar = function (key, opts) {
        var val = readPath(msgRoot, key);
        if (val === undefined) val = readPath(base, key);
        return val === undefined ? (opts || {}).defaults : val;
      };
    }
    if (typeof base.setLocalVar !== 'function') base.setLocalVar = function (_k, v) { return v; };
    if (typeof base.setMessageVar !== 'function') base.setMessageVar = function (_k, v) { return v; };
    if (typeof base.setvar !== 'function') base.setvar = function (_k, v) { return v; };
    if (typeof base.getChatMessage !== 'function') base.getChatMessage = function () { return String(base.lastUserMessage || ''); };
    if (typeof base.matchChatMessages !== 'function') base.matchChatMessages = function () { return false; };
    return base;
  }

  function renderItems(list, locals, options) {
    var opts = options || {};
    var items = normalizeList(list);
    var silent = opts.silent === true;
    var evalLocals = withDefaultHelpers(locals);
    var mechanisms = [];
    var appearances = [];
    var personalities = [];
    var errors = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item.enabled) continue;
      if (silent && !item.applyWhenSilent) continue;
      var raw = String(item.content || '').trim();
      if (!raw) continue;
      var text = raw;
      if (raw.indexOf(EJS_OPEN) >= 0) {
        try {
          text = String(evalEjs(raw, evalLocals) || '').trim();
        } catch (err) {
          errors.push({ id: item.id, name: item.name, error: String(err && err.message || err) });
          continue;
        }
      }
      if (!text) continue;
      var entry = { name: item.name, text: text };
      if (item.kind === 'personality') personalities.push(entry);
      else if (item.kind === 'appearance') appearances.push(entry);
      else mechanisms.push(entry);
    }
    var mechText = mechanisms.map(function (m) {
      var body = m.text.replace(/\r?\n/g, '\n       ');
      return m.name ? ('     【' + m.name + '】: ' + body) : ('     ' + body);
    }).join('\n');
    var persText = personalities.map(function (p) {
      var body = p.text.replace(/\r?\n/g, '\n      ');
      return p.name ? (p.name + '：' + body) : body;
    }).join('；');
    var appText = appearances.map(function (a) {
      var body = a.text.replace(/\r?\n/g, '\n           ');
      return a.name ? (a.name + '：' + body) : body;
    }).join('；');
    var text = [mechText, persText, appText].filter(Boolean).join('\n');
    return {
      text: text,
      mechanisms: mechanisms,
      appearances: appearances,
      personalities: personalities,
      personality: personalities,
      mechanismText: mechText,
      appearanceText: appText,
      personalityText: persText,
      errors: errors
    };
  }

  function statusSummary(win) {
    var list = loadList(win);
    var active = list.filter(function (it) { return it.enabled && String(it.content || '').trim(); }).length;
    if (!list.length) return '未设置';
    return active > 0 ? ('已启用 ' + active + ' 条') : ('共 ' + list.length + ' 条（未启用）');
  }

  function openModal(e, toastFn) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    var hostWin = getHostWindow();
    var doc = hostWin.document || document;
    var toast = toastFn || (typeof root.pToast === 'function' ? root.pToast : (typeof root.showToast === 'function' ? root.showToast : function () {}));
    var old = doc.getElementById('dream-extra-settings-overlay');
    if (old) old.remove();

    var styleId = 'dream-extra-settings-style';
    if (!doc.getElementById(styleId)) {
      var st = doc.createElement('style');
      st.id = styleId;
      st.textContent = [
        '.des-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(12,8,6,.76);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:"Noto Serif SC","Songti SC",KaiTi,serif;}',
        '.des-box{width:min(740px,96vw);max-height:90vh;display:flex;flex-direction:column;background:linear-gradient(155deg,#241711 0%,#150d09 100%);border:1px solid rgba(197,157,95,.42);border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.78);color:#eadbc3;overflow:hidden;}',
        '.des-ov[data-theme="summer"] .des-box{background:linear-gradient(150deg,#fbfdf8 0%,#e7f6f2 100%);border-color:rgba(66,155,185,.42);color:#275365;}',
        '.des-ov[data-theme="ink"] .des-box{background:linear-gradient(155deg,#f6f1e6 0%,#ebe2d0 100%);border-color:rgba(120,98,74,.38);color:#2d251e;}',
        '.des-hd{display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid rgba(197,157,95,.25);}',
        '.des-hd h3{margin:0;font-size:17px;letter-spacing:2px;}',
        '.des-x{background:none;border:0;color:inherit;font-size:24px;line-height:1;cursor:pointer;opacity:.7;padding:4px 8px;}',
        '.des-x:hover{opacity:1;}',
        '.des-bd{padding:16px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px;}',
        '.des-tip{font-size:12.5px;line-height:1.65;opacity:.86;padding:10px 12px;border-radius:8px;background:rgba(197,157,95,.1);border:1px dashed rgba(197,157,95,.32);}',
        '.des-item{padding:12px 14px;border-radius:8px;border:1px solid rgba(197,157,95,.28);background:rgba(0,0,0,.16);display:flex;flex-direction:column;gap:8px;}',
        '.des-ov[data-theme="summer"] .des-item,.des-ov[data-theme="ink"] .des-item{background:rgba(255,255,255,.58);border-color:rgba(110,120,125,.25);}',
        '.des-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
        '.des-in,.des-sel,.des-ta{padding:7px 9px;border-radius:6px;border:1px solid rgba(197,157,95,.32);background:rgba(0,0,0,.22);color:inherit;font-size:12.5px;font-family:inherit;box-sizing:border-box;}',
        '.des-ov[data-theme="summer"] .des-in,.des-ov[data-theme="summer"] .des-sel,.des-ov[data-theme="summer"] .des-ta,.des-ov[data-theme="ink"] .des-in,.des-ov[data-theme="ink"] .des-sel,.des-ov[data-theme="ink"] .des-ta{background:rgba(255,255,255,.88);}',
        '.des-in{flex:1;min-width:140px;}',
        '.des-ta{width:100%;min-height:84px;resize:vertical;font-family:ui-monospace,Consolas,monospace;line-height:1.5;}',
        '.des-prev{padding:8px 10px;border-radius:6px;background:rgba(0,0,0,.28);border:1px solid rgba(197,157,95,.25);font-size:12px;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow-y:auto;}',
        '.des-ov[data-theme="summer"] .des-prev,.des-ov[data-theme="ink"] .des-prev{background:rgba(255,255,255,.78);}',
        '.des-err{color:#ef7b72;}',
        '.des-ft{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 20px;border-top:1px solid rgba(197,157,95,.25);flex-wrap:wrap;}',
        '.des-ft-r{display:flex;gap:8px;flex-wrap:wrap;}',
        '.des-btn{padding:6px 12px;border-radius:6px;border:1px solid rgba(197,157,95,.45);background:rgba(197,157,95,.16);color:inherit;font-size:12.5px;cursor:pointer;font-family:inherit;}',
        '.des-btn:hover{background:rgba(197,157,95,.3);}',
        '.des-btn.primary{background:#c59d5f;color:#1e130c;border-color:#c59d5f;font-weight:bold;}',
        '.des-btn.danger{border-color:rgba(210,100,90,.55);background:rgba(210,100,90,.12);}'
      ].join('');
      doc.head.appendChild(st);
    }

    var theme = typeof root.getVisualTheme === 'function' ? root.getVisualTheme() : 'cafe';
    var ov = doc.createElement('div');
    ov.id = 'dream-extra-settings-overlay';
    ov.className = 'des-ov';
    ov.setAttribute('data-theme', theme);
    ov.innerHTML = '<div class="des-box" role="dialog" aria-modal="true" aria-label="附加设定">'
      + '<div class="des-hd"><h3>附加设定 · 跨人格持久生效</h3><button type="button" class="des-x" data-des="close">×</button></div>'
      + '<div class="des-bd" id="des-body"></div>'
      + '<div class="des-ft">'
      + '<div class="des-ft-r">'
      + '<button type="button" class="des-btn" data-des="add">+ 新增设定</button>'
      + '<button type="button" class="des-btn" data-des="import">导入 JSON</button>'
      + '<button type="button" class="des-btn" data-des="export">导出 JSON</button>'
      + '</div>'
      + '<div class="des-ft-r">'
      + '<button type="button" class="des-btn" data-des="close">取消</button>'
      + '<button type="button" class="des-btn primary" data-des="save">保存</button>'
      + '</div></div></div>';
    doc.body.appendChild(ov);

    var draft = loadList(hostWin);
    var previews = {};

    function syncFromDom() {
      var body = ov.querySelector('#des-body');
      if (!body) return;
      var cards = body.querySelectorAll('[data-des-idx]');
      for (var i = 0; i < cards.length; i++) {
        var idx = Number(cards[i].getAttribute('data-des-idx'));
        if (!draft[idx]) continue;
        var nm = cards[i].querySelector('[data-des-name]');
        var kd = cards[i].querySelector('[data-des-kind]');
        var en = cards[i].querySelector('[data-des-enabled]');
        var si = cards[i].querySelector('[data-des-silent]');
        var ct = cards[i].querySelector('[data-des-content]');
        draft[idx].name = nm ? nm.value.trim() : draft[idx].name;
        draft[idx].kind = kd ? kd.value : draft[idx].kind;
        draft[idx].enabled = !!(en && en.checked);
        draft[idx].applyWhenSilent = !!(si && si.checked);
        draft[idx].content = ct ? ct.value : '';
      }
    }

    function render() {
      var body = ov.querySelector('#des-body');
      if (!body) return;
      var html = '<div class="des-tip">'
        + '持久化保存在<b>当前聊天</b>中，<b>不随人格切换重置</b>，无论当前主人格是谁均按分类并入对应提示词区块：'
        + '<br>• <b>机制</b>：并入核心机制区（与【章节起始】同处）　• <b>外貌</b>：并入「此刻形象」处　• <b>性格</b>：并入主人格「人设」处'
        + '<br>三类均支持纯文本或适配本卡变量的 EJS 模板（可用 <code>stat_data</code> / <code>getMessageVar(...)</code> / <code>getLocalVar(...)</code> / <code>matchChatMessages(...)</code>）。'
        + '</div>';
      if (draft.length === 0) {
        html += '<div class="des-item"><div style="font-size:13px;opacity:.8;text-align:center;padding:18px 8px;">暂无附加设定，点击左下角「+ 新增设定」开始添加。</div></div>';
      } else {
        for (var i = 0; i < draft.length; i++) {
          var item = draft[i];
          var pv = previews[item.id];
          html += '<div class="des-item" data-des-idx="' + i + '">';
          html += '<div class="des-row">'
            + '<input type="text" class="des-in" data-des-name="1" value="' + escHtml(item.name) + '" placeholder="可选标题（机制类将作为【标题】显示）" />'
            + '<select class="des-sel" data-des-kind="1">'
            + '<option value="mechanism"' + (item.kind === 'mechanism' ? ' selected' : '') + '>' + KIND_LABELS.mechanism + '</option>'
            + '<option value="appearance"' + (item.kind === 'appearance' ? ' selected' : '') + '>' + KIND_LABELS.appearance + '</option>'
            + '<option value="personality"' + (item.kind === 'personality' ? ' selected' : '') + '>' + KIND_LABELS.personality + '</option>'
            + '</select>'
            + '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;"><input type="checkbox" data-des-enabled="1"' + (item.enabled ? ' checked' : '') + ' />启用</label>'
            + '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;"><input type="checkbox" data-des-silent="1"' + (item.applyWhenSilent ? ' checked' : '') + ' />静默生效</label>'
            + '<button type="button" class="des-btn" data-des="preview" data-i="' + i + '">试渲染</button>'
            + '<button type="button" class="des-btn danger" data-des="remove" data-i="' + i + '">删除</button>'
            + '</div>';
          html += '<textarea class="des-ta" data-des-content="1" placeholder="' + escHtml(KIND_PLACEHOLDERS[item.kind] || KIND_PLACEHOLDERS.mechanism) + '">' + escHtml(item.content) + '</textarea>';
          if (pv) {
            html += '<div class="des-prev' + (pv.error ? ' des-err' : '') + '">'
              + (pv.error ? ('EJS 报错：' + escHtml(pv.error)) : (pv.text ? escHtml(pv.text) : '（当前条件下输出为空）'))
              + '</div>';
          }
          html += '</div>';
        }
      }
      body.innerHTML = html;
    }

    function close() { ov.remove(); }

    ov.addEventListener('change', function (ev) {
      if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute('data-des-kind')) {
        syncFromDom();
        render();
      }
    });

    ov.addEventListener('click', function (ev) {
      if (ev.target === ov) { close(); return; }
      var btn = ev.target.closest && ev.target.closest('[data-des]');
      if (!btn) return;
      var act = btn.getAttribute('data-des');
      if (act === 'close') { close(); return; }
      if (act === 'add') {
        syncFromDom();
        draft.push({
          id: createId(),
          name: '',
          kind: 'mechanism',
          enabled: true,
          applyWhenSilent: false,
          content: ''
        });
        render();
        return;
      }
      if (act === 'remove') {
        syncFromDom();
        var rIdx = Number(btn.getAttribute('data-i'));
        if (draft[rIdx]) {
          delete previews[draft[rIdx].id];
          draft.splice(rIdx, 1);
          render();
        }
        return;
      }
      if (act === 'preview') {
        syncFromDom();
        var pIdx = Number(btn.getAttribute('data-i'));
        var target = draft[pIdx];
        if (!target) return;
        try {
          var locals = buildPreviewLocals(hostWin);
          var out = (target.kind === 'ejs' || target.content.indexOf(EJS_OPEN) >= 0)
            ? evalEjs(target.content, locals).trim()
            : target.content.trim();
          previews[target.id] = { text: out, error: '' };
        } catch (err) {
          previews[target.id] = { text: '', error: String(err && err.message || err) };
        }
        render();
        return;
      }
      if (act === 'export') {
        syncFromDom();
        var json = JSON.stringify({ version: 1, items: draft }, null, 2);
        try {
          if (hostWin.navigator && hostWin.navigator.clipboard && hostWin.navigator.clipboard.writeText) {
            hostWin.navigator.clipboard.writeText(json).then(function () {
              toast('已复制附加设定 JSON 到剪贴板');
            }, function () {
              (hostWin.prompt || root.prompt)('复制以下 JSON：', json);
            });
          } else {
            (hostWin.prompt || root.prompt)('复制以下 JSON：', json);
          }
        } catch (_) {
          (hostWin.prompt || root.prompt)('复制以下 JSON：', json);
        }
        return;
      }
      if (act === 'import') {
        syncFromDom();
        var pr = hostWin.prompt || root.prompt;
        var raw = pr ? pr('粘贴附加设定 JSON（单条对象或数组）：') : '';
        if (!raw || !raw.trim()) return;
        try {
          var parsed = JSON.parse(raw);
          var incoming = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : [parsed]);
          var added = normalizeList(incoming);
          if (!added.length) { toast('未识别到有效设定条目'); return; }
          for (var k = 0; k < added.length; k++) {
            added[k].id = createId();
            draft.push(added[k]);
          }
          render();
          toast('已导入 ' + added.length + ' 条附加设定，点击「保存」生效');
        } catch (err) {
          toast('JSON 解析失败：' + (err && err.message || err));
        }
        return;
      }
      if (act === 'save') {
        syncFromDom();
        var nonEmpty = draft.filter(function (it) { return String(it.content || '').trim().length > 0; });
        saveList(nonEmpty, hostWin);
        if (typeof root.dreamSyncAddonLabels === 'function') try { root.dreamSyncAddonLabels(); } catch (_) {}
        if (root.__readerHostApi && typeof root.__readerHostApi.refresh === 'function') root.__readerHostApi.refresh();
        toast(nonEmpty.length ? ('已保存 ' + nonEmpty.length + ' 条附加设定') : '已清空当前聊天附加设定');
        close();
      }
    });

    render();
  }

  root.ReaderExtraSettings = {
    STORAGE_KEY: STORAGE_KEY,
    normalizeList: normalizeList,
    loadList: loadList,
    saveList: saveList,
    compileEjsBody: compileEjsBody,
    evalEjs: evalEjs,
    renderItems: renderItems,
    statusSummary: statusSummary,
    openModal: openModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
/* DREAM_EXTRA_SETTINGS_END */
