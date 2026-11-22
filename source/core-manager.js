/* DREAM_CORE_MANAGER_BEGIN */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'dream_core_manager';
  var OPEN_MACRO = '{' + '{';
  var CLOSE_MACRO = '}' + '}';
  var EJS_OPEN = '<' + '%';
  var EJS_CLOSE = '%' + '>';
  var SHARED_MACROS = [
    '系统核心', '系统核心名', '系统核心说明', '系统名', 'fp定义', '爆料风格',
    '登神长阶系统优势', '生命层级成长系统优势', '技能获取系统优势',
    '经验值获取系统优势', '复活机制'
  ];
  var SHARED_SET = {};
  for (var si = 0; si < SHARED_MACROS.length; si++) SHARED_SET[SHARED_MACROS[si]] = true;

  var PAYLOAD_FIELDS = ['content', 'prompt', 'text', 'body', 'output'];

  var SCRIPT_RUNTIME_CORES = {
    '九十九夜梦': 'tsukumo',
    '莉莉丝': 'lilith',
    '阿米娅核心': 'amiya',
    '堂吉诃德核心': 'quixote'
  };

  var DEFAULT_WAKE_MAP = {
    '九十九夜梦': ['夜梦', '九十九', '读者', '咖啡馆', '间章'],
    '莉莉丝': ['莉莉丝', '爱欲商铺', '爱欲狩猎'],
    '阿米娅核心': ['阿米娅', '源石终端', '罗德岛'],
    '堂吉诃德核心': ['堂吉诃德', '传奇之书', '骑士'],
    '艾莉亚': ['艾莉亚', '红花戏票', '车票'],
    '阿比盖尔核心-表': ['阿比盖尔', '阿比', '银钥之门'],
    '阿比盖尔核心-里': ['阿比盖尔', '阿比', '银钥之门'],
    '妲丽安': ['妲丽安', '黑之读姬', '命定之书'],
    '小夜莺核心': ['小夜莺', '夜莺', '飞鸟之诗'],
    '长颈鹿核心': ['长颈鹿', '舞台'],
    '奶龙核心': ['奶龙', '奶人之契'],
    '奥托·阿波卡利斯核心': ['奥托', '阿波卡利斯'],
    '类脑娘': ['类脑娘'],
    '梅林核心': ['梅林'],
    '茶茶': ['茶茶'],
    '莉莉': ['莉莉', '白祷'],
    '高文·塞西尔': ['高文', '琥珀'],
    'UNN演播室': ['UNN', '演播室', '多尼', '凯特'],
    '先祖': ['先祖', '铁王冠'],
    'null核心': ['null']
  };

  var HOOK_KEY = '__dreamCoreManagerWorldInfoHook';
  var DIVIDER_RE = /➡️系统(?:开始|结束)/;
  var CORE_ENTRY_NAME_RE = /(?:命定(?:系统|核心)|系统核心|核心组合载荷|核心载荷)/;
  var NON_CORE_NAME_RE = /(?:公共函数|命运抽卡|variables|变量更新|状态栏|地图|目录|说明文档)/i;
  var PAYLOAD_VAR_NAME_RE = /(?:payload|prompt|content|core|combo|bundle|template|system|lore)/i;
  var MAIN_BOOK_INFRA_RE = /(?:公共函数|destinyWiVar|➡️系统开始|\[本体\]\[变量\])/;
  var ANCHOR_PROTECT_RE = /(?:butterfly_anchor|history_anchor|记忆总结|事件日志|摘要归档)/i;

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

  function getTavernHelper(win) {
    var target = win || getHostWindow();
    return root.TavernHelper || target.TavernHelper || null;
  }

  function parseKeywords(input) {
    var list = Array.isArray(input) ? input : String(input == null ? '' : input).split(/[\n,，、;；]+/);
    var out = [], seen = {};
    for (var i = 0; i < list.length; i++) {
      var item = String(list[i] == null ? '' : list[i]).trim();
      if (!item || seen[item]) continue;
      seen[item] = true;
      out.push(item.slice(0, 60));
    }
    return out;
  }

  function cleanEntryTitle(entryName) {
    return String(entryName || '')
      .replace(/^(?:\[[^\]]+\]\s*)+/g, '')
      .replace(/^(?:命定系统|命定核心)[-—:：\s]*/g, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .trim();
  }

  function extractCoreStem(text) {
    return cleanEntryTitle(text)
      .replace(/(?:组合载荷|载荷|核心(?:[-—][^\s]+)?|系统)$/g, '')
      .trim();
  }

  function extractSetvars(content) {
    if (typeof content !== 'string' || !content) return [];
    var out = [];
    var prefix = OPEN_MACRO + 'setvar::';
    var pos = 0;
    while (pos < content.length) {
      var start = content.indexOf(prefix, pos);
      if (start < 0) break;
      var nameStart = start + prefix.length;
      var sep = content.indexOf('::', nameStart);
      if (sep < 0) break;
      var name = content.slice(nameStart, sep).trim();
      var valStart = sep + 2;
      var depth = 1;
      var end = -1;
      for (var i = valStart; i < content.length - 1; i++) {
        if (content.charAt(i) === '{' && content.charAt(i + 1) === '{') {
          depth++;
          i++;
        } else if (content.charAt(i) === '}' && content.charAt(i + 1) === '}') {
          depth--;
          if (depth === 0) {
            end = i + 2;
            break;
          }
          i++;
        }
      }
      if (end < 0) break;
      out.push({ start: start, end: end, name: name, value: content.slice(valStart, end - 2) });
      pos = end;
    }
    return out;
  }

  function readNestedVar(vars, pathKey) {
    if (!vars || typeof vars !== 'object' || !pathKey) return null;
    if (Object.prototype.hasOwnProperty.call(vars, pathKey)) return vars[pathKey];
    var parts = String(pathKey).split('.');
    var cur = vars;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, parts[i])) return null;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function extractPayloadText(rawValue) {
    if (typeof rawValue === 'string') return rawValue;
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return '';
    for (var i = 0; i < PAYLOAD_FIELDS.length; i++) {
      var val = rawValue[PAYLOAD_FIELDS[i]];
      if (typeof val === 'string' && val.length > 0) return val;
    }
    return '';
  }

  function extractEjsVarReads(content) {
    var out = [], seen = {};
    var re = /(?:getvar|getLocalVar)\(\s*['"`]([^'"`\r\n]+)['"`]/g;
    var match;
    while ((match = re.exec(content)) !== null) {
      var k = String(match[1] || '').trim();
      if (!k || SHARED_SET[k] || seen[k]) continue;
      seen[k] = true;
      out.push(k);
    }
    return out;
  }

  function detectDynamicPayloadInfo(content, entryName, win) {
    if (content.indexOf(EJS_OPEN) < 0) return null;
    if (!/<%[-=]/.test(content)) return null;
    var candidates = extractEjsVarReads(content);
    if (candidates.length === 0) return null;

    var ctx = getSTContext(win);
    var vars = ctx && ctx.chatMetadata && ctx.chatMetadata.variables ? ctx.chatMetadata.variables : null;

    // Pass 1: live inspection of chat variables — 100% architecture-driven, zero name hardcoding
    if (vars) {
      for (var i = 0; i < candidates.length; i++) {
        var varKey = candidates[i];
        var rawVal = readNestedVar(vars, varKey);
        var payloadText = extractPayloadText(rawVal);
        if (!payloadText) continue;
        var foundSv = extractSetvars(payloadText);
        var dynMap = {};
        var dynList = [];
        for (var j = 0; j < foundSv.length; j++) {
          if (SHARED_SET[foundSv[j].name]) {
            if (!Object.prototype.hasOwnProperty.call(dynMap, foundSv[j].name)) dynList.push(foundSv[j].name);
            dynMap[foundSv[j].name] = foundSv[j].value;
          }
        }
        if (dynList.length > 0) {
          return { payloadVar: varKey, sharedMap: dynMap, macros: dynList, liveMatched: true };
        }
      }
    }

    // Pass 2: static thin-loader fallback (fresh chat before the runtime writes the payload variable)
    if (content.length <= 4096 && CORE_ENTRY_NAME_RE.test(entryName) && !NON_CORE_NAME_RE.test(entryName)) {
      for (var c = 0; c < candidates.length; c++) {
        if (PAYLOAD_VAR_NAME_RE.test(candidates[c])) {
          var fallbackMap = {};
          var tagMatch = content.match(/<([^\s/>]{2,20})>/);
          var guessSys = tagMatch && !/^(?:user|char|script|style|div|span|p|br)$/i.test(tagMatch[1]) ? tagMatch[1] : '';
          var guessCore = extractCoreStem(entryName);
          if (guessSys) fallbackMap['系统名'] = guessSys;
          if (guessCore) fallbackMap['系统核心'] = guessCore;
          return { payloadVar: candidates[c], sharedMap: fallbackMap, macros: SHARED_MACROS.slice(), liveMatched: false };
        }
      }
    }

    return null;
  }

  function extractHandoffTokens(content) {
    if (typeof content !== 'string' || content.indexOf(EJS_OPEN) < 0) return [];
    if (!/(?:getChatMessage|lastUserMessage)/.test(content)) return [];
    var out = [], seen = {};
    var re = /['"`](【[^】'"`\r\n]{2,18}】)['"`]/g;
    var m;
    while ((m = re.exec(content)) !== null) {
      if (!seen[m[1]]) {
        seen[m[1]] = true;
        out.push(m[1]);
      }
      if (out.length >= 4) break;
    }
    return out;
  }

  function extractEntryTriggerKeys(entry) {
    if (!entry || typeof entry !== 'object') return [];
    var raw = Array.isArray(entry.key) ? entry.key
      : (entry.strategy && Array.isArray(entry.strategy.keys) ? entry.strategy.keys : []);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var k = String(raw[i] == null ? '' : raw[i]).trim();
      if (k.length < 2 || k.length > 18 || /^\d+$/.test(k) || /^\/.*\/[gimsuy]*$/.test(k)) continue;
      out.push(k);
    }
    return out;
  }

  function deriveDefaultWakeKeywords(coreKey, sharedMap, entryName, content, extraKeys) {
    if (DEFAULT_WAKE_MAP[coreKey]) return DEFAULT_WAKE_MAP[coreKey].slice();
    var raw = [];
    var map = sharedMap || {};
    var sysCore = String(map['系统核心'] || '').trim();
    var coreName = String(map['系统核心名'] || '').trim();
    var sysName = String(map['系统名'] || '').trim();

    if (coreKey && coreKey.indexOf('entry:') !== 0 && coreKey.indexOf('payload:') !== 0) {
      raw.push(coreKey);
      var keyStem = extractCoreStem(coreKey);
      if (keyStem) raw.push(keyStem);
    }
    if (sysCore) {
      var splitCores = sysCore.split(/[&＆/、,，]+/);
      for (var i = 0; i < splitCores.length; i++) {
        var part = splitCores[i].trim();
        if (part) {
          raw.push(part);
          var partStem = extractCoreStem(part);
          if (partStem && partStem !== part) raw.push(partStem);
        }
      }
    }
    if (coreName && coreName !== '命定之灵' && coreName !== '不明存在') raw.push(coreName);
    if (sysName && sysName !== '命定之诗') raw.push(sysName);
    if (entryName) {
      var cleaned = cleanEntryTitle(entryName);
      var entryStem = extractCoreStem(entryName);
      if (entryStem && entryStem.length >= 2) raw.push(entryStem);
      else if (cleaned && cleaned.length >= 2 && cleaned.length <= 16) raw.push(cleaned);
    }
    var handoffs = extractHandoffTokens(content);
    for (var h = 0; h < handoffs.length; h++) raw.push(handoffs[h]);
    if (Array.isArray(extraKeys)) {
      for (var ek = 0; ek < extraKeys.length && ek < 8; ek++) raw.push(extraKeys[ek]);
    }
    return parseKeywords(raw);
  }

  function deriveCoreAliases(coreKey, displayName, entryName, sharedMap) {
    var raw = [];
    var map = sharedMap || {};
    if (coreKey && coreKey.indexOf('entry:') !== 0 && coreKey.indexOf('payload:') !== 0) {
      raw.push(coreKey);
      raw.push(extractCoreStem(coreKey));
    }
    if (displayName) raw.push(extractCoreStem(displayName));
    if (entryName) raw.push(extractCoreStem(entryName));
    if (map['系统核心']) {
      String(map['系统核心']).split(/[&＆/、,，]+/).forEach(function (s) {
        raw.push(s.trim());
        raw.push(extractCoreStem(s));
      });
    }
    if (map['系统名'] && map['系统名'] !== '命定之诗') raw.push(String(map['系统名']).trim());
    if (map['系统核心名'] && map['系统核心名'] !== '命定之灵' && map['系统核心名'] !== '不明存在') {
      raw.push(String(map['系统核心名']).trim());
    }
    var out = [], seen = {};
    for (var i = 0; i < raw.length; i++) {
      var item = String(raw[i] || '').trim();
      if (item.length < 2 || seen[item]) continue;
      seen[item] = true;
      out.push(item);
    }
    return out;
  }

  function detectCoreFromEntry(entry, bookName, win, options) {
    if (!entry || typeof entry !== 'object') return null;
    var includeDisabled = !!(options && options.includeDisabled);
    var enabled = typeof entry.enabled === 'boolean' ? entry.enabled : entry.disable !== true;
    if (!includeDisabled && !enabled) return null;
    var entryName = String(entry.name || entry.comment || '').trim();
    if (DIVIDER_RE.test(entryName)) return null;
    var content = typeof entry.content === 'string' ? entry.content : '';
    if (!content) return null;

    var setvars = extractSetvars(content);
    var sharedMap = {};
    var sharedList = [];
    for (var i = 0; i < setvars.length; i++) {
      if (SHARED_SET[setvars[i].name]) {
        if (!Object.prototype.hasOwnProperty.call(sharedMap, setvars[i].name)) sharedList.push(setvars[i].name);
        sharedMap[setvars[i].name] = setvars[i].value;
      }
    }

    var isReader = /DREAM_WORLDBOOK\s+reader-core/.test(content)
      || /setLocalVar\(\s*['"`]系统核心['"`]\s*,\s*['"`]九十九夜梦['"`]/.test(content);
    var localShared = [];
    for (var j = 0; j < SHARED_MACROS.length; j++) {
      var m = SHARED_MACROS[j];
      var escM = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('(?:setLocalVar|setvar)\\(\\s*[\'"`]' + escM + '[\'"`]\\s*(?:,\\s*([\'"`])([^\\r\\n]*?)\\1)?');
      var matchLocal = content.match(re);
      if (matchLocal) {
        localShared.push(m);
        if (!sharedMap[m] && matchLocal[2] && matchLocal[2].trim()) {
          sharedMap[m] = matchLocal[2].trim();
        }
      }
    }

    var hasExplicitCore = isReader || sharedList.length > 0
      || /(?:setLocalVar|setvar)\(\s*['"`]系统核心['"`]/.test(content);

    // Type D: generic dynamic chat-variable payload loader core
    if (!hasExplicitCore) {
      var dynInfo = detectDynamicPayloadInfo(content, entryName, win);
      if (!dynInfo) return null;
      var dynKey = 'payload:' + dynInfo.payloadVar;
      var dynBaseTitle = cleanEntryTitle(entryName) || dynInfo.sharedMap['系统名'] || dynInfo.payloadVar;
      var dynSysName = String(dynInfo.sharedMap['系统名'] || '').trim();
      var dynDisplay = dynSysName && dynBaseTitle.indexOf(dynSysName) < 0
        ? dynBaseTitle + '（' + dynSysName + '）'
        : dynBaseTitle;
      return {
        key: dynKey,
        name: dynDisplay,
        entryName: entryName,
        bookName: String(bookName || entry.world || ''),
        uid: entry.uid != null ? entry.uid : null,
        coreType: 'dynamic-payload',
        isReader: false,
        isNullCore: false,
        blocksFpWipe: false,
        isScriptCore: false,
        isDynamicPayload: true,
        payloadVar: dynInfo.payloadVar,
        payloadLabel: dynSysName || extractCoreStem(entryName) || dynBaseTitle,
        fallbackMacros: Object.assign({}, dynInfo.sharedMap),
        macros: dynInfo.macros.length ? dynInfo.macros : SHARED_MACROS.slice(),
        sharedMap: dynInfo.sharedMap,
        aliases: deriveCoreAliases(dynKey, dynDisplay, entryName, dynInfo.sharedMap),
        defaultWakeKeywords: deriveDefaultWakeKeywords(dynKey, dynInfo.sharedMap, entryName, content, [])
      };
    }

    var key = '';
    if (isReader) {
      key = '九十九夜梦';
    } else if (sharedMap['系统核心'] && sharedMap['系统核心'].trim()) {
      key = sharedMap['系统核心'].trim();
    } else {
      key = 'entry:' + (entryName || String(entry.uid != null ? entry.uid : 'unknown'));
    }

    var displayName = isReader ? '读者核心（九十九夜梦）'
      : (sharedMap['系统核心'] && sharedMap['系统核心'].trim()
        ? sharedMap['系统核心'].trim()
        : (cleanEntryTitle(entryName) || entryName || key));

    var hasEjs = content.indexOf(EJS_OPEN) >= 0;
    var coreType = sharedList.length > 0 ? (hasEjs ? 'hybrid-ejs' : 'static-macro') : 'ejs-local';
    var blocksFpWipe = key === 'null核心'
      || /setMessageVar\(\s*['"`]stat_data\.命运点数['"`]\s*,\s*0\s*\)/.test(content);

    return {
      key: key,
      name: displayName,
      entryName: entryName,
      bookName: String(bookName || entry.world || ''),
      uid: entry.uid != null ? entry.uid : null,
      coreType: coreType,
      isReader: isReader,
      isNullCore: key === 'null核心',
      blocksFpWipe: blocksFpWipe,
      isScriptCore: !!SCRIPT_RUNTIME_CORES[key],
      isDynamicPayload: false,
      payloadVar: '',
      macros: sharedList.length ? sharedList : localShared,
      sharedMap: sharedMap,
      aliases: deriveCoreAliases(key, displayName, entryName, sharedMap),
      defaultWakeKeywords: deriveDefaultWakeKeywords(key, sharedMap, entryName, content, [])
    };
  }

  function normalizeConfig(raw) {
    var obj = raw;
    if (typeof raw === 'string' && raw.trim()) {
      try { obj = JSON.parse(raw); } catch (_) { obj = null; }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { version: 1, enabled: false, primary: '', activeCores: [], cores: {} };
    }
    var cores = {};
    if (obj.cores && typeof obj.cores === 'object' && !Array.isArray(obj.cores)) {
      Object.keys(obj.cores).forEach(function (k) {
        var c = obj.cores[k];
        if (!c || typeof c !== 'object') return;
        var item = {
          name: typeof c.name === 'string' ? c.name.trim() : k,
          entryName: typeof c.entryName === 'string' ? c.entryName.trim() : '',
          silent: c.silent === true,
          wakeKeywords: parseKeywords(c.wakeKeywords)
        };
        if (typeof c.dedicatedBook === 'string' && c.dedicatedBook.trim()) {
          item.dedicatedBook = c.dedicatedBook.trim();
        }
        if (Array.isArray(c.companionEntries) && c.companionEntries.length > 0) {
          item.companionEntries = c.companionEntries
            .filter(function (s) { return typeof s === 'string' && s.trim(); })
            .map(function (s) { return s.trim(); })
            .slice(0, 60);
        }
        if (Array.isArray(c.aliases) && c.aliases.length > 0) {
          item.aliases = parseKeywords(c.aliases).slice(0, 12);
        }
        cores[k] = item;
      });
    }
    var active = [];
    if (Array.isArray(obj.activeCores)) {
      obj.activeCores.forEach(function (k) {
        var s = String(k || '').trim();
        if (s && active.indexOf(s) < 0) active.push(s);
      });
    }
    var primary = typeof obj.primary === 'string' ? obj.primary.trim() : '';
    if (primary && active.indexOf(primary) < 0) active.unshift(primary);
    var primaryMacros = null;
    if (obj.primaryMacros && typeof obj.primaryMacros === 'object' && !Array.isArray(obj.primaryMacros)) {
      primaryMacros = {};
      Object.keys(obj.primaryMacros).forEach(function (mk) {
        if (SHARED_SET[mk] && typeof obj.primaryMacros[mk] === 'string') {
          primaryMacros[mk] = obj.primaryMacros[mk];
        }
      });
      if (Object.keys(primaryMacros).length === 0) primaryMacros = null;
    }
    var outCfg = {
      version: 1,
      enabled: obj.enabled === true,
      primary: primary,
      activeCores: active,
      cores: cores
    };
    if (primaryMacros) outCfg.primaryMacros = primaryMacros;
    return outCfg;
  }

  function loadConfig(win) {
    var ctx = getSTContext(win);
    var raw = ctx && ctx.chatMetadata && ctx.chatMetadata.variables ? ctx.chatMetadata.variables[STORAGE_KEY] : null;
    if (raw == null && typeof root.getSTVariable === 'function') {
      try { raw = root.getSTVariable(STORAGE_KEY); } catch (_) {}
    }
    return normalizeConfig(raw);
  }

  function saveConfig(config, win) {
    var normalized = normalizeConfig(config);
    var hostWin = win || getHostWindow();
    var ctx = getSTContext(hostWin);
    if (ctx && ctx.chatMetadata) {
      if (!ctx.chatMetadata.variables || typeof ctx.chatMetadata.variables !== 'object') {
        ctx.chatMetadata.variables = {};
      }
      if (!normalized.enabled) {
        delete ctx.chatMetadata.variables[STORAGE_KEY];
      } else {
        ctx.chatMetadata.variables[STORAGE_KEY] = JSON.stringify(normalized);
        if (normalized.primary && normalized.primary.indexOf('entry:') !== 0 && normalized.primary.indexOf('payload:') !== 0) {
          ctx.chatMetadata.variables['系统核心'] = normalized.primary;
        } else if (normalized.primaryMacros && normalized.primaryMacros['系统核心']) {
          ctx.chatMetadata.variables['系统核心'] = normalized.primaryMacros['系统核心'];
        }
        var readerCfg = normalized.cores['九十九夜梦'];
        if (readerCfg) {
          if (readerCfg.silent) ctx.chatMetadata.variables['dream_silent_mode'] = 'on';
          else delete ctx.chatMetadata.variables['dream_silent_mode'];
        }
      }
      try {
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
      } catch (_) {}
    } else if (typeof root.setSTVariable === 'function') {
      if (!normalized.enabled) {
        if (typeof root.delSTVariable === 'function') root.delSTVariable(STORAGE_KEY);
      } else {
        root.setSTVariable(STORAGE_KEY, JSON.stringify(normalized));
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
          target.dispatchEvent(new EventCtor('dream:core-manager-changed', { detail: normalized }));
        }
      } catch (_) {}
    }
    return normalized;
  }

  function matchesWakeKeywords(text, keywords) {
    var src = String(text == null ? '' : text);
    if (!src) return false;
    var list = parseKeywords(keywords);
    var lower = src.toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (lower.indexOf(list[i].toLowerCase()) >= 0) return true;
    }
    return false;
  }

  function getLatestUserText(win) {
    var ctx = getSTContext(win);
    var chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : [];
    for (var i = chat.length - 1; i >= 0; i--) {
      var msg = chat[i];
      if (!msg || msg.is_system) continue;
      if (msg.is_user === true) return String(msg.mes || '');
    }
    return '';
  }

  function replaceLocalGetvars(content, ownMacros) {
    var pattern = new RegExp(OPEN_MACRO + 'getvar::([^:}]+)' + CLOSE_MACRO, 'gi');
    return content.replace(pattern, function (full, rawKey) {
      var key = String(rawKey || '').trim();
      return Object.prototype.hasOwnProperty.call(ownMacros, key) ? ownMacros[key] : full;
    });
  }

  function escapeJsonForEjs(obj) {
    return 'JSON.parse(' + JSON.stringify(JSON.stringify(obj))
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/\{/g, '\\u007b')
      .replace(/\}/g, '\\u007d') + ')';
  }

  function buildDynamicScopeHelperCode() {
    return 'const _dmcScopeText = function(src) {\n'
      + '  if (typeof src !== "string" || !src) return src;\n'
      + '  const oM = "{" + "{", cM = "}" + "}", pfx = oM + "setvar::";\n'
      + '  const localOwn = {};\n'
      + '  const parts = [];\n'
      + '  let pos = 0, cur = 0;\n'
      + '  while (pos < src.length) {\n'
      + '    const st = src.indexOf(pfx, pos);\n'
      + '    if (st < 0) break;\n'
      + '    const ns = st + pfx.length;\n'
      + '    const sp = src.indexOf("::", ns);\n'
      + '    if (sp < 0) break;\n'
      + '    const nm = src.slice(ns, sp).trim();\n'
      + '    let dp = 1, en = -1;\n'
      + '    for (let i = sp + 2; i < src.length - 1; i++) {\n'
      + '      if (src.charAt(i) === "{" && src.charAt(i + 1) === "{") { dp++; i++; }\n'
      + '      else if (src.charAt(i) === "}" && src.charAt(i + 1) === "}") { dp--; if (dp === 0) { en = i + 2; break; } i++; }\n'
      + '    }\n'
      + '    if (en < 0) break;\n'
      + '    if (_dmcShared[nm]) {\n'
      + '      localOwn[nm] = src.slice(sp + 2, en - 2);\n'
      + '      parts.push(src.slice(cur, st));\n'
      + '      cur = en;\n'
      + '    }\n'
      + '    pos = en;\n'
      + '  }\n'
      + '  parts.push(src.slice(cur));\n'
      + '  const stripped = parts.join("");\n'
      + '  const gvRe = new RegExp(oM + "getvar::([^:}]+)" + cM, "gi");\n'
      + '  return stripped.replace(gvRe, function(f, rk) {\n'
      + '    const k = String(rk || "").trim();\n'
      + '    return Object.prototype.hasOwnProperty.call(localOwn, k) ? localOwn[k] : f;\n'
      + '  });\n'
      + '};\n'
      + 'const _dmcScopePayloadVal = function(rawP) {\n'
      + '  if (typeof rawP === "string") return _dmcScopeText(rawP);\n'
      + '  if (rawP && typeof rawP === "object" && !Array.isArray(rawP)) {\n'
      + '    const fields = ["content", "prompt", "text", "body", "output"];\n'
      + '    let cloned = null;\n'
      + '    for (let fi = 0; fi < fields.length; fi++) {\n'
      + '      const fn = fields[fi];\n'
      + '      if (typeof rawP[fn] === "string" && rawP[fn].indexOf("{" + "{setvar::") >= 0) {\n'
      + '        if (!cloned) cloned = Object.assign({}, rawP);\n'
      + '        cloned[fn] = _dmcScopeText(rawP[fn]);\n'
      + '      }\n'
      + '    }\n'
      + '    if (cloned) return cloned;\n'
      + '  }\n'
      + '  return rawP;\n'
      + '};\n';
  }

  function buildDynamicPrimarySilentEjs(payloadVar, label, fallbackMacros) {
    var sharedJson = escapeJsonForEjs(SHARED_SET);
    var fbJson = escapeJsonForEjs(fallbackMacros || {});
    var pvJson = escapeJsonForEjs(payloadVar);
    return EJS_OPEN + '_ {\n'
      + 'const _dmcShared = ' + sharedJson + ';\n'
      + 'const _dmcFb = ' + fbJson + ';\n'
      + 'const _dmcPv = ' + pvJson + ';\n'
      + 'const _dmcOpen = "{" + "{", _dmcClose = "}" + "}";\n'
      + 'const _dmcPfx = _dmcOpen + "setvar::";\n'
      + 'const _dmcRaw = typeof getvar === "function" ? getvar(_dmcPv, { scope: "local" }) : (typeof getLocalVar === "function" ? getLocalVar(_dmcPv) : null);\n'
      + 'let _dmcSrc = typeof _dmcRaw === "string" ? _dmcRaw : "";\n'
      + 'if (!_dmcSrc && _dmcRaw && typeof _dmcRaw === "object") {\n'
      + '  const flds = ["content", "prompt", "text", "body", "output"];\n'
      + '  for (let i = 0; i < flds.length; i++) { if (typeof _dmcRaw[flds[i]] === "string" && _dmcRaw[flds[i]]) { _dmcSrc = _dmcRaw[flds[i]]; break; } }\n'
      + '}\n'
      + 'const _dmcKept = [];\n'
      + 'let _dmcPos = 0;\n'
      + 'while (_dmcPos < _dmcSrc.length) {\n'
      + '  const st = _dmcSrc.indexOf(_dmcPfx, _dmcPos);\n'
      + '  if (st < 0) break;\n'
      + '  const ns = st + _dmcPfx.length;\n'
      + '  const sp = _dmcSrc.indexOf("::", ns);\n'
      + '  if (sp < 0) break;\n'
      + '  const nm = _dmcSrc.slice(ns, sp).trim();\n'
      + '  let dp = 1, en = -1;\n'
      + '  for (let i = sp + 2; i < _dmcSrc.length - 1; i++) {\n'
      + '    if (_dmcSrc.charAt(i) === "{" && _dmcSrc.charAt(i + 1) === "{") { dp++; i++; }\n'
      + '    else if (_dmcSrc.charAt(i) === "}" && _dmcSrc.charAt(i + 1) === "}") { dp--; if (dp === 0) { en = i + 2; break; } i++; }\n'
      + '  }\n'
      + '  if (en < 0) break;\n'
      + '  if (_dmcShared[nm]) _dmcKept.push(_dmcSrc.slice(st, en));\n'
      + '  _dmcPos = en;\n'
      + '}\n'
      + 'const _dmcOut = _dmcKept.length ? _dmcKept.join("") : Object.keys(_dmcFb).map(function(k){ return _dmcPfx + k + "::" + _dmcFb[k] + _dmcClose; }).join("");\n'
      + '_' + EJS_CLOSE + EJS_OPEN + '- _dmcOut ' + EJS_CLOSE + '\n<' + label + '>\n'
      + label + '当前处于静默观察状态，本轮不主动发言或进行干涉。\n</' + label + '>\n'
      + EJS_OPEN + '_ } _' + EJS_CLOSE;
  }

  function wrapEjsScope(content, ownMacros, blocksFpWipe, dynamicPayloadVar) {
    var lines = content.split(/\r?\n/);
    var head = [];
    var idx = 0;
    while (idx < lines.length && /^@@[A-Za-z0-9_]+(?:\s|$)/.test(lines[idx])) {
      head.push(lines[idx]);
      idx++;
    }
    var body = lines.slice(idx).join('\n');
    var ownJson = escapeJsonForEjs(ownMacros);
    var sharedJson = escapeJsonForEjs(SHARED_SET);
    var dynJson = dynamicPayloadVar ? escapeJsonForEjs(dynamicPayloadVar) : '""';
    var prelude = EJS_OPEN + '_ {\n'
      + 'const _dmcOwn = ' + ownJson + ';\n'
      + 'const _dmcShared = ' + sharedJson + ';\n'
      + (dynamicPayloadVar ? 'const _dmcDynVar = ' + dynJson + ';\n' + buildDynamicScopeHelperCode() : '')
      + 'const _dmcOrigGetvar = typeof getvar === "function" ? getvar : null;\n'
      + 'const _dmcOrigGetLocal = typeof getLocalVar === "function" ? getLocalVar : null;\n'
      + 'const _dmcOrigSetLocal = typeof setLocalVar === "function" ? setLocalVar : null;\n'
      + 'const _dmcOrigSetvar = typeof setvar === "function" ? setvar : null;\n'
      + (blocksFpWipe ? 'const _dmcOrigSetMsg = typeof setMessageVar === "function" ? setMessageVar : null;\n' : '')
      + '{\n'
      + 'const getvar = function(k, o) {\n'
      + (dynamicPayloadVar ? '  if (k === _dmcDynVar) return _dmcScopePayloadVal(_dmcOrigGetvar ? _dmcOrigGetvar(k, o) : null);\n' : '')
      + '  return Object.prototype.hasOwnProperty.call(_dmcOwn, k) ? _dmcOwn[k] : (_dmcOrigGetvar ? _dmcOrigGetvar(k, o) : "");\n'
      + '};\n'
      + 'const getLocalVar = function(k, o) {\n'
      + (dynamicPayloadVar ? '  if (k === _dmcDynVar) return _dmcScopePayloadVal(_dmcOrigGetLocal ? _dmcOrigGetLocal(k, o) : null);\n' : '')
      + '  return Object.prototype.hasOwnProperty.call(_dmcOwn, k) ? _dmcOwn[k] : (_dmcOrigGetLocal ? _dmcOrigGetLocal(k, o) : "");\n'
      + '};\n'
      + 'const setLocalVar = function(k, v) { if (_dmcShared[k]) { _dmcOwn[k] = v; return v; } return _dmcOrigSetLocal ? _dmcOrigSetLocal(k, v) : v; };\n'
      + 'const setvar = function(k, v, o) { if (_dmcShared[k]) { _dmcOwn[k] = v; return v; } return _dmcOrigSetvar ? _dmcOrigSetvar(k, v, o) : v; };\n'
      + (blocksFpWipe
        ? 'const setMessageVar = function(k, v, o) { if (k === "stat_data.命运点数") return v; return _dmcOrigSetMsg ? _dmcOrigSetMsg(k, v, o) : v; };\n'
          + 'const toastr = { info: function(){}, warning: function(){}, error: function(){}, success: function(){} };\n'
        : '')
      + '_' + EJS_CLOSE + '\n';
    var epilogue = '\n' + EJS_OPEN + '_ } } _' + EJS_CLOSE;
    return (head.length ? head.join('\n') + '\n' : '') + prelude + body + epilogue;
  }

  function transformWorldbookEntry(entry, rawConfig, lastUserMessage, win) {
    var config = normalizeConfig(rawConfig);
    if (!config.enabled || !entry || entry.disable === true || typeof entry.content !== 'string') {
      return { changed: false, mode: 'bypass' };
    }
    var core = detectCoreFromEntry(entry, entry.world, win);
    if (!core || core.isReader) {
      return { changed: false, mode: core && core.isReader ? 'reader-self' : 'not-core' };
    }

    var isPrimary = !!config.primary && core.key === config.primary;
    var coreCfg = config.cores[core.key] || null;
    var isSilent = !!(coreCfg && coreCfg.silent === true);
    var wakeKeywords = coreCfg && coreCfg.wakeKeywords && coreCfg.wakeKeywords.length
      ? coreCfg.wakeKeywords
      : core.defaultWakeKeywords;
    var isWoken = isSilent ? matchesWakeKeywords(lastUserMessage, wakeKeywords) : false;

    if (!isPrimary && isSilent && !isWoken) {
      entry.disable = true;
      entry.content = '';
      return { changed: true, mode: 'secondary-silent', core: core.key };
    }

    if (isPrimary && isSilent && !isWoken) {
      if (core.isDynamicPayload && core.payloadVar) {
        var dynLabel = (core.payloadLabel || core.sharedMap['系统名'] || core.name || core.key).trim();
        entry.content = buildDynamicPrimarySilentEjs(core.payloadVar, dynLabel, core.fallbackMacros);
        return { changed: true, mode: 'primary-silent', core: core.key };
      }
      var spans = extractSetvars(entry.content);
      var kept = [];
      for (var i = 0; i < spans.length; i++) {
        if (SHARED_SET[spans[i].name]) {
          kept.push(entry.content.slice(spans[i].start, spans[i].end));
        }
      }
      if (kept.length === 0 && core.sharedMap) {
        Object.keys(core.sharedMap).forEach(function (mk) {
          if (SHARED_SET[mk] && typeof core.sharedMap[mk] === 'string') {
            kept.push(OPEN_MACRO + 'setvar::' + mk + '::' + core.sharedMap[mk] + CLOSE_MACRO);
          }
        });
      }
      var label = (core.sharedMap['系统名'] || core.name || core.key).trim();
      entry.content = kept.join('') + '\n<' + label + '>\n'
        + label + '当前处于静默观察状态，本轮不主动发言或进行干涉。\n</' + label + '>';
      return { changed: true, mode: 'primary-silent', core: core.key };
    }

    if (!isPrimary) {
      if (core.isDynamicPayload && core.payloadVar) {
        entry.content = wrapEjsScope(entry.content, core.sharedMap || {}, false, core.payloadVar);
        return { changed: true, mode: 'secondary-scoped', core: core.key, ownMacros: core.sharedMap || {}, dynamicPayload: core.payloadVar };
      }
      var allSetvars = extractSetvars(entry.content);
      var ownMacros = {};
      var pieces = [];
      var cursor = 0;
      for (var j = 0; j < allSetvars.length; j++) {
        var sv = allSetvars[j];
        if (!SHARED_SET[sv.name]) continue;
        ownMacros[sv.name] = sv.value;
        pieces.push(entry.content.slice(cursor, sv.start));
        cursor = sv.end;
      }
      pieces.push(entry.content.slice(cursor));
      var rewritten = replaceLocalGetvars(pieces.join(''), ownMacros);
      if (rewritten.indexOf(EJS_OPEN) >= 0) {
        rewritten = wrapEjsScope(rewritten, ownMacros, core.blocksFpWipe, '');
      }
      entry.content = rewritten;
      return { changed: true, mode: 'secondary-scoped', core: core.key, ownMacros: ownMacros };
    }

    return { changed: false, mode: 'primary-active', core: core.key };
  }

  function findCompanionOwner(entry, config, activeCoreStems) {
    if (!entry || typeof entry !== 'object') return '';
    var entryName = String(entry.name || entry.comment || '').trim();
    var content = typeof entry.content === 'string' ? entry.content : '';
    if (ANCHOR_PROTECT_RE.test(entryName) || ANCHOR_PROTECT_RE.test(content)) return '';
    var worldName = String(entry.world || '').trim();
    var keys = Object.keys(config.cores || {});
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === '九十九夜梦') continue;
      var c = config.cores[k];
      if (!c) continue;
      if (worldName && c.dedicatedBook && worldName === c.dedicatedBook) return k;
      if (entryName && Array.isArray(c.companionEntries) && c.companionEntries.indexOf(entryName) >= 0) return k;
    }
    if (entryName && activeCoreStems) {
      for (var s = 0; s < activeCoreStems.length; s++) {
        var item = activeCoreStems[s];
        if (item.re.test(entryName)) return item.key;
      }
    }
    return '';
  }

  function hasSharedMacroReference(content) {
    if (typeof content !== 'string' || !content) return false;
    for (var i = 0; i < SHARED_MACROS.length; i++) {
      if (content.indexOf(SHARED_MACROS[i]) >= 0) return true;
    }
    return false;
  }

  function processLoadedWorldInfo(data, win) {
    if (!data || typeof data !== 'object') return [];
    var hostWin = win || getHostWindow();
    var config = loadConfig(hostWin);
    if (!config.enabled) return [];
    var lastUser = getLatestUserText(hostWin);
    var buckets = ['globalLore', 'characterLore', 'chatLore', 'personaLore'];
    var results = [];
    var coreEntryRefs = [];
    var coreOwnMacros = {};
    var silencedCores = {};

    // Precompute silent/woken state per configured core (needed for companion entries even if main core is in another bucket)
    Object.keys(config.cores || {}).forEach(function (k) {
      var c = config.cores[k];
      if (!c || c.silent !== true) return;
      var wake = c.wakeKeywords && c.wakeKeywords.length ? c.wakeKeywords : (DEFAULT_WAKE_MAP[k] || [extractCoreStem(k)]);
      if (!matchesWakeKeywords(lastUser, wake)) silencedCores[k] = true;
    });

    // Strict prefix stems for merged multi-entry cores (e.g. "<core>-companion")
    var activeCoreStems = [];
    (config.activeCores || []).forEach(function (k) {
      if (k === '九十九夜梦' || k.indexOf('entry:') === 0 || k.indexOf('payload:') === 0) return;
      var stem = extractCoreStem(k);
      if (stem && stem.length >= 2) {
        var esc = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        activeCoreStems.push({ key: k, re: new RegExp('^(?:\\[[^\\]]+\\]\\s*)*' + esc + '[-—·_:：\\s]') });
      }
    });

    // Pass 1: transform primary / secondary core entries
    for (var b = 0; b < buckets.length; b++) {
      var list = data[buckets[b]];
      if (!Array.isArray(list)) continue;
      for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        var res = transformWorldbookEntry(entry, config, lastUser, hostWin);
        if (res.mode !== 'not-core' && res.mode !== 'bypass') {
          coreEntryRefs.push(entry);
          if (res.core) {
            if (res.mode === 'secondary-silent' || res.mode === 'primary-silent') silencedCores[res.core] = true;
            else delete silencedCores[res.core];
            if (res.ownMacros) coreOwnMacros[res.core] = res.ownMacros;
          }
        }
        if (res.changed) results.push(res);
      }
    }

    // Pass 2: silence or macro-scope companion entries of multi-entry cores (dedicated DLC book or strict prefix)
    for (var b2 = 0; b2 < buckets.length; b2++) {
      var list2 = data[buckets[b2]];
      if (!Array.isArray(list2)) continue;
      for (var j = 0; j < list2.length; j++) {
        var comp = list2[j];
        if (!comp || comp.disable === true || typeof comp.content !== 'string') continue;
        if (coreEntryRefs.indexOf(comp) >= 0) continue;
        var ownerKey = findCompanionOwner(comp, config, activeCoreStems);
        if (!ownerKey) continue;
        if (silencedCores[ownerKey]) {
          comp.disable = true;
          comp.content = '';
          results.push({ changed: true, mode: 'companion-silent', core: ownerKey, entryName: String(comp.name || comp.comment || '') });
        } else if (ownerKey !== config.primary && coreOwnMacros[ownerKey] && hasSharedMacroReference(comp.content)) {
          var scoped = replaceLocalGetvars(comp.content, coreOwnMacros[ownerKey]);
          if (scoped.indexOf(EJS_OPEN) >= 0) {
            scoped = wrapEjsScope(scoped, coreOwnMacros[ownerKey], false, '');
          }
          if (scoped !== comp.content) {
            comp.content = scoped;
            results.push({ changed: true, mode: 'companion-scoped', core: ownerKey, entryName: String(comp.name || comp.comment || '') });
          }
        }
      }
    }

    return results;
  }

  function installWorldInfoHook(win) {
    var hostWin = win || getHostWindow();
    var ctx = getSTContext(hostWin);
    var source = ctx && ctx.eventSource;
    var types = ctx && (ctx.eventTypes || ctx.event_types);
    var eventName = types && types.WORLDINFO_ENTRIES_LOADED;
    if (!source || !eventName) return false;
    var slot = hostWin[HOOK_KEY];
    if (!slot) {
      slot = hostWin[HOOK_KEY] = { run: null };
      var listener = function (data) {
        if (typeof slot.run === 'function') {
          try { slot.run(data); } catch (err) { console.warn('[ReaderCoreManager] 世界书拦截出错:', err); }
        }
      };
      if (typeof source.makeFirst === 'function') source.makeFirst(eventName, listener);
      else if (typeof source.on === 'function') source.on(eventName, listener);
    }
    slot.run = function (data) { return processLoadedWorldInfo(data, hostWin); };
    return true;
  }

  function uninstallWorldInfoHook(win) {
    var hostWin = win || getHostWindow();
    if (hostWin && hostWin[HOOK_KEY]) hostWin[HOOK_KEY].run = null;
  }

  function isDedicatedSingleCoreBook(entries, allCoresCount, enabledCoresInBook) {
    if (allCoresCount !== 1 || enabledCoresInBook.length !== 1) return false;
    if (entries.length < 2 || entries.length > 60) return false;
    if (enabledCoresInBook[0].isReader) return false;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || typeof e !== 'object') continue;
      var name = String(e.name || e.comment || '');
      var body = typeof e.content === 'string' ? e.content : '';
      if (MAIN_BOOK_INFRA_RE.test(name) || MAIN_BOOK_INFRA_RE.test(body)) return false;
    }
    return true;
  }

  async function scanEnabledCores(win) {
    var hostWin = win || getHostWindow();
    var TH = getTavernHelper(hostWin);
    var books = [];
    var seenBook = {};
    function pushBook(name) {
      if (typeof name === 'string' && name.trim() && !seenBook[name.trim()]) {
        seenBook[name.trim()] = true;
        books.push(name.trim());
      }
    }
    try {
      if (TH && typeof TH.getCharWorldbookNames === 'function') {
        var charWb = await TH.getCharWorldbookNames('current');
        if (charWb) {
          pushBook(charWb.primary);
          if (Array.isArray(charWb.additional)) charWb.additional.forEach(pushBook);
        }
      }
      if (TH && typeof TH.getChatWorldbookName === 'function') {
        pushBook(await TH.getChatWorldbookName('current'));
      }
      if (TH && typeof TH.getGlobalWorldbookNames === 'function') {
        var globalWbs = await TH.getGlobalWorldbookNames();
        if (Array.isArray(globalWbs)) globalWbs.forEach(pushBook);
      }
    } catch (_) {}

    var ctx = getSTContext(hostWin);
    if (ctx) {
      var ch = ctx.characters && ctx.characters[ctx.characterId];
      if (ch && ch.data && ch.data.extensions && ch.data.extensions.world) pushBook(ch.data.extensions.world);
      if (ctx.chatMetadata && ctx.chatMetadata.world_info) pushBook(ctx.chatMetadata.world_info);
      var stGlobals = (ctx.worldInfo && Array.isArray(ctx.worldInfo.selected_world_info) ? ctx.worldInfo.selected_world_info : null)
        || (Array.isArray(hostWin.selected_world_info) ? hostWin.selected_world_info : null);
      if (stGlobals) stGlobals.forEach(pushBook);
    }

    var found = [];
    var seenKey = {};
    for (var b = 0; b < books.length; b++) {
      var bookName = books[b];
      var entries = null;
      try {
        if (TH && typeof TH.getWorldbook === 'function') {
          entries = await TH.getWorldbook(bookName);
        } else {
          var ctx2 = getSTContext(hostWin);
          if (ctx2 && typeof ctx2.loadWorldInfo === 'function') {
            var wi = await ctx2.loadWorldInfo(bookName);
            if (wi && wi.entries) entries = Object.keys(wi.entries).map(function (k) { return wi.entries[k]; });
          }
        }
      } catch (_) { entries = null; }
      if (!Array.isArray(entries)) continue;

      var allCoresInBook = 0;
      var enabledCoresInBook = [];
      var coreEntrySet = [];
      for (var i = 0; i < entries.length; i++) {
        var anyInfo = detectCoreFromEntry(entries[i], bookName, hostWin, { includeDisabled: true });
        if (anyInfo) allCoresInBook++;
        var enabledInfo = detectCoreFromEntry(entries[i], bookName, hostWin);
        if (enabledInfo) {
          enabledCoresInBook.push(enabledInfo);
          coreEntrySet.push(entries[i]);
        }
      }

      if (isDedicatedSingleCoreBook(entries, allCoresInBook, enabledCoresInBook)) {
        var soleCore = enabledCoresInBook[0];
        var companionNames = [];
        var companionKeys = [];
        for (var ci = 0; ci < entries.length; ci++) {
          var ce = entries[ci];
          if (!ce || coreEntrySet.indexOf(ce) >= 0) continue;
          var cEnabled = typeof ce.enabled === 'boolean' ? ce.enabled : ce.disable !== true;
          if (!cEnabled) continue;
          var cName = String(ce.name || ce.comment || '').trim();
          var cBody = typeof ce.content === 'string' ? ce.content : '';
          if (ANCHOR_PROTECT_RE.test(cName) || ANCHOR_PROTECT_RE.test(cBody)) continue;
          if (cName) companionNames.push(cName);
          var tKeys = extractEntryTriggerKeys(ce);
          for (var tk = 0; tk < tKeys.length; tk++) companionKeys.push(tKeys[tk]);
        }
        if (companionNames.length > 0) {
          soleCore.dedicatedBook = bookName;
          soleCore.companionEntries = companionNames;
          soleCore.defaultWakeKeywords = parseKeywords(soleCore.defaultWakeKeywords.concat(companionKeys.slice(0, 8)));
        }
      }

      for (var k = 0; k < enabledCoresInBook.length; k++) {
        var info = enabledCoresInBook[k];
        if (seenKey[info.key]) continue;
        seenKey[info.key] = true;
        found.push(info);
      }
    }
    return found;
  }

  function statusSummary(win) {
    var cfg = loadConfig(win);
    if (!cfg.enabled) return '未启用';
    var n = cfg.activeCores.length;
    var p = (cfg.primary && cfg.cores[cfg.primary] && cfg.cores[cfg.primary].name) || cfg.primary || '未设';
    return (n > 1 ? n + ' 核 · ' : '') + '主:' + p.slice(0, 6);
  }

  function openModal(e, toastFn) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    var hostWin = getHostWindow();
    var doc = hostWin.document || document;
    var toast = toastFn || (typeof root.pToast === 'function' ? root.pToast : (typeof root.showToast === 'function' ? root.showToast : function () {}));
    var old = doc.getElementById('dream-core-mgr-overlay');
    if (old) old.remove();

    if (typeof root.dreamAddonCss === 'function') {
      try { root.dreamAddonCss(doc); } catch (_) {}
    }

    var styleId = 'dream-core-mgr-style';
    if (!doc.getElementById(styleId)) {
      var st = doc.createElement('style');
      st.id = styleId;
      st.textContent = [
        '.dcm-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(12,8,6,.76);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:"Noto Serif SC","Songti SC",KaiTi,serif;}',
        '.dcm-box{width:min(680px,96vw);max-height:88vh;display:flex;flex-direction:column;background:linear-gradient(155deg,#241711 0%,#150d09 100%);border:1px solid rgba(197,157,95,.42);border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.78);color:#eadbc3;overflow:hidden;}',
        '.dcm-ov[data-theme="summer"] .dcm-box{background:linear-gradient(150deg,#fbfdf8 0%,#e7f6f2 100%);border-color:rgba(66,155,185,.42);color:#275365;}',
        '.dcm-ov[data-theme="ink"] .dcm-box{background:linear-gradient(155deg,#f6f1e6 0%,#ebe2d0 100%);border-color:rgba(120,98,74,.38);color:#2d251e;}',
        '.dcm-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(197,157,95,.25);}',
        '.dcm-hd h3{margin:0;font-size:17px;letter-spacing:2px;}',
        '.dcm-x{background:none;border:0;color:inherit;font-size:24px;line-height:1;cursor:pointer;opacity:.7;padding:4px 8px;}',
        '.dcm-x:hover{opacity:1;}',
        '.dcm-bd{padding:16px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:12px;}',
        '.dcm-tip{font-size:12.5px;line-height:1.65;opacity:.85;padding:10px 12px;border-radius:8px;background:rgba(197,157,95,.1);border:1px dashed rgba(197,157,95,.32);}',
        '.dcm-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}',
        '.dcm-card{padding:12px 14px;border-radius:8px;border:1px solid rgba(197,157,95,.28);background:rgba(0,0,0,.16);display:flex;flex-direction:column;gap:8px;}',
        '.dcm-ov[data-theme="summer"] .dcm-card,.dcm-ov[data-theme="ink"] .dcm-card{background:rgba(255,255,255,.55);border-color:rgba(110,120,125,.25);}',
        '.dcm-card.is-primary{border-color:#c59d5f;box-shadow:0 0 0 1px rgba(197,157,95,.35) inset;}',
        '.dcm-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}',
        '.dcm-nm{font-size:14.5px;font-weight:bold;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
        '.dcm-tag{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid rgba(197,157,95,.45);opacity:.9;font-weight:normal;}',
        '.dcm-tag.primary{background:rgba(197,157,95,.26);font-weight:bold;}',
        '.dcm-tag.script{border-color:rgba(92,174,158,.55);}',
        '.dcm-tag.warn{border-color:rgba(216,110,95,.6);color:#e88c7d;}',
        '.dcm-meta{font-size:11.5px;opacity:.72;}',
        '.dcm-ctrl{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;}',
        '.dcm-kw{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:6px;border:1px solid rgba(197,157,95,.32);background:rgba(0,0,0,.22);color:inherit;font-size:12.5px;font-family:inherit;}',
        '.dcm-ov[data-theme="summer"] .dcm-kw,.dcm-ov[data-theme="ink"] .dcm-kw{background:rgba(255,255,255,.85);}',
        '.dcm-ft{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 20px;border-top:1px solid rgba(197,157,95,.25);flex-wrap:wrap;}',
        '.dcm-btn{padding:7px 14px;border-radius:6px;border:1px solid rgba(197,157,95,.45);background:rgba(197,157,95,.16);color:inherit;font-size:13px;cursor:pointer;font-family:inherit;}',
        '.dcm-btn:hover{background:rgba(197,157,95,.3);}',
        '.dcm-btn.primary{background:#c59d5f;color:#1e130c;border-color:#c59d5f;font-weight:bold;}',
        '.dcm-btn.danger{border-color:rgba(210,100,90,.55);background:rgba(210,100,90,.12);}'
      ].join('');
      doc.head.appendChild(st);
    }

    var theme = typeof root.getVisualTheme === 'function' ? root.getVisualTheme() : 'cafe';
    var ov = doc.createElement('div');
    ov.id = 'dream-core-mgr-overlay';
    ov.className = 'dcm-ov';
    ov.setAttribute('data-theme', theme);
    ov.innerHTML = '<div class="dcm-box" role="dialog" aria-modal="true" aria-label="核心管理">'
      + '<div class="dcm-hd"><h3>核心管理 · 多核心与静默控制</h3><button type="button" class="dcm-x" data-dcm="close">×</button></div>'
      + '<div class="dcm-bd" id="dcm-body"><div class="dcm-tip">正在扫描角色卡、聊天与全局世界书中已启用的核心条目…</div></div>'
      + '<div class="dcm-ft">'
      + '<button type="button" class="dcm-btn" data-dcm="rescan">重新扫描</button>'
      + '<button type="button" class="dcm-btn danger" data-dcm="reset">停用并还原</button>'
      + '<button type="button" class="dcm-btn primary" data-dcm="save">保存并应用</button>'
      + '</div></div>';
    doc.body.appendChild(ov);

    var draft = loadConfig(hostWin);
    var detected = [];

    function syncDraftFromDom() {
      var body = ov.querySelector('#dcm-body');
      if (!body) return;
      var enEl = body.querySelector('#dcm-enabled');
      if (enEl) draft.enabled = !!enEl.checked;
      var pRadio = body.querySelector('input[name="dcm-primary"]:checked');
      if (pRadio) draft.primary = pRadio.value;
      var cards = body.querySelectorAll('[data-dcm-core]');
      var active = [];
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var key = card.getAttribute('data-dcm-core');
        if (!key) continue;
        active.push(key);
        var silentEl = card.querySelector('[data-dcm-silent]');
        var kwEl = card.querySelector('[data-dcm-kw]');
        var prev = draft.cores[key] || {};
        var det = detected.find(function (d) { return d.key === key; });
        var nextCore = {
          name: (det && det.name) || prev.name || key,
          entryName: (det && det.entryName) || prev.entryName || '',
          silent: !!(silentEl && silentEl.checked),
          wakeKeywords: parseKeywords(kwEl ? kwEl.value : '')
        };
        if (det && det.dedicatedBook) nextCore.dedicatedBook = det.dedicatedBook;
        else if (prev.dedicatedBook) nextCore.dedicatedBook = prev.dedicatedBook;
        if (det && det.companionEntries && det.companionEntries.length) nextCore.companionEntries = det.companionEntries.slice();
        else if (prev.companionEntries && prev.companionEntries.length) nextCore.companionEntries = prev.companionEntries.slice();
        if (det && det.aliases && det.aliases.length) nextCore.aliases = det.aliases.slice();
        else if (prev.aliases && prev.aliases.length) nextCore.aliases = prev.aliases.slice();
        draft.cores[key] = nextCore;
      }
      if (active.length) draft.activeCores = active;
      if (draft.primary && draft.activeCores.indexOf(draft.primary) < 0 && draft.activeCores.length) {
        draft.primary = draft.activeCores[0];
      }
      var primaryDetected = detected.find(function (d) { return d.key === draft.primary; });
      if (primaryDetected && !primaryDetected.isReader && !primaryDetected.isDynamicPayload
        && primaryDetected.sharedMap && Object.keys(primaryDetected.sharedMap).length > 0) {
        draft.primaryMacros = Object.assign({}, primaryDetected.sharedMap);
      } else {
        delete draft.primaryMacros;
      }
    }

    function render() {
      var body = ov.querySelector('#dcm-body');
      if (!body) return;
      var html = '<div class="dcm-tip">'
        + '仅拦截<b>主核心之外</b>的核心对共享宏（系统核心/系统名/复活机制/FP定义等）的全局写入，并把它们的宏限制在各自条目内部生效，防止出现“其他核心也被叫读者”或互相顶掉的问题。'
        + '同时可将<b>静默模式</b>扩展到任意受管理核心（含独立多条目核心的配套条目），并配置各自在用户最新输入中触发的<b>临时唤起关键词</b>。'
        + '</div>';
      html += '<div class="dcm-bar">'
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px;font-weight:bold;">'
        + '<input type="checkbox" id="dcm-enabled"' + (draft.enabled ? ' checked' : '') + ' />'
        + '<span>启用核心管理（当前聊天生效）</span></label>'
        + '<span class="dcm-meta">已检测到 ' + detected.length + ' 个已启用核心</span></div>';

      if (detected.length === 0) {
        html += '<div class="dcm-card"><div class="dcm-meta">未在当前角色卡绑定世界书、聊天世界书或全局世界书中检测到写入共享宏的已启用核心条目。请先在世界书中启用需要多开的核心后点击「重新扫描」。</div></div>';
      } else {
        for (var i = 0; i < detected.length; i++) {
          var item = detected[i];
          var c = draft.cores[item.key] || {
            name: item.name,
            entryName: item.entryName,
            silent: item.isReader && typeof root.getSilentState === 'function' ? !!root.getSilentState() : false,
            wakeKeywords: item.defaultWakeKeywords.slice(),
            dedicatedBook: item.dedicatedBook || '',
            companionEntries: item.companionEntries || [],
            aliases: item.aliases || []
          };
          draft.cores[item.key] = c;
          var isPrimary = draft.primary === item.key;
          var compCount = item.companionEntries ? item.companionEntries.length : 0;
          html += '<div class="dcm-card' + (isPrimary ? ' is-primary' : '') + '" data-dcm-core="' + escHtml(item.key) + '">';
          html += '<div class="dcm-top"><div class="dcm-nm">' + escHtml(item.name)
            + '<span class="dcm-tag' + (isPrimary ? ' primary' : '') + '">' + (isPrimary ? '主核心' : '次核心') + '</span>'
            + (item.isDynamicPayload ? '<span class="dcm-tag script">动态载荷核心</span>' : (item.isScriptCore ? '<span class="dcm-tag script">脚本核心</span>' : ''))
            + (compCount > 0 ? '<span class="dcm-tag">含 ' + compCount + ' 条配套</span>' : '')
            + (c.silent ? '<span class="dcm-tag">静默</span>' : '')
            + (item.blocksFpWipe && !isPrimary ? '<span class="dcm-tag warn">次核已隔离清空FP</span>' : '')
            + '</div>';
          html += '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;">'
            + '<input type="radio" name="dcm-primary" value="' + escHtml(item.key) + '"' + (isPrimary ? ' checked' : '') + ' />'
            + '<span>设为主核心</span></label></div>';
          html += '<div class="dcm-meta">来源：' + escHtml(item.bookName || '当前世界书') + ' / ' + escHtml(item.entryName || item.key)
            + ' · 宏：' + escHtml(item.macros.slice(0, 5).join('、')) + (item.macros.length > 5 ? ' 等 ' + item.macros.length + ' 项' : '') + '</div>';
          html += '<div class="dcm-ctrl">'
            + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">'
            + '<input type="checkbox" data-dcm-silent="1"' + (c.silent ? ' checked' : '') + ' />'
            + '<span>静默此核心（平时大幅降低 token / 不主动发言）</span></label></div>';
          html += '<div><div class="dcm-meta" style="margin-bottom:4px;">临时唤起关键词（逗号或换行分隔；用户最新输入含任一词时本轮临时激活）</div>'
            + '<input type="text" class="dcm-kw" data-dcm-kw="1" value="' + escHtml((c.wakeKeywords || []).join(', ')) + '" placeholder="例如：' + escHtml(item.defaultWakeKeywords.join(', ')) + '" /></div>';
          html += '</div>';
        }
      }
      body.innerHTML = html;
    }

    async function doScan() {
      detected = await scanEnabledCores(hostWin);
      if (detected.length > 0) {
        if (!draft.primary || !detected.some(function (d) { return d.key === draft.primary; })) {
          var readerFound = detected.find(function (d) { return d.isReader; });
          draft.primary = readerFound ? readerFound.key : detected[0].key;
        }
        if (detected.length > 1 && !loadConfig(hostWin).enabled) {
          draft.enabled = true;
        }
        draft.activeCores = detected.map(function (d) { return d.key; });
      }
      render();
    }

    function close() { ov.remove(); }

    ov.addEventListener('click', function (ev) {
      if (ev.target === ov) { close(); return; }
      var btn = ev.target.closest && ev.target.closest('[data-dcm]');
      if (!btn) return;
      var act = btn.getAttribute('data-dcm');
      if (act === 'close') { close(); return; }
      if (act === 'rescan') {
        syncDraftFromDom();
        void doScan();
        return;
      }
      if (act === 'reset') {
        saveConfig({ version: 1, enabled: false, primary: '', activeCores: [], cores: {} }, hostWin);
        if (typeof root.dlbSyncEggs === 'function') try { root.dlbSyncEggs(); } catch (_) {}
        if (root.__readerHostApi && typeof root.__readerHostApi.refresh === 'function') root.__readerHostApi.refresh();
        toast('已停用核心管理并还原默认单核心行为');
        close();
        return;
      }
      if (act === 'save') {
        syncDraftFromDom();
        if (detected.length > 0 && draft.enabled && !draft.primary) {
          draft.primary = detected[0].key;
        }
        saveConfig(draft, hostWin);
        installWorldInfoHook(hostWin);
        if (typeof root.dlbSyncEggs === 'function') try { root.dlbSyncEggs(); } catch (_) {}
        if (root.__readerHostApi && typeof root.__readerHostApi.refresh === 'function') root.__readerHostApi.refresh();
        var primaryLabel = (draft.primary && draft.cores[draft.primary] && draft.cores[draft.primary].name) || draft.primary || '未指定';
        toast(draft.enabled ? ('核心管理已生效 · 主核心：' + primaryLabel) : '核心管理已保存（当前未启用）');
        close();
      }
    });

    ov.addEventListener('change', function (ev) {
      if (ev.target && (ev.target.name === 'dcm-primary' || ev.target.hasAttribute('data-dcm-silent'))) {
        syncDraftFromDom();
        render();
      }
    });

    void doScan();
  }

  installWorldInfoHook();

  root.ReaderCoreManager = {
    STORAGE_KEY: STORAGE_KEY,
    SHARED_MACROS: SHARED_MACROS.slice(),
    SCRIPT_RUNTIME_CORES: Object.assign({}, SCRIPT_RUNTIME_CORES),
    extractSetvars: extractSetvars,
    detectCoreFromEntry: detectCoreFromEntry,
    normalizeConfig: normalizeConfig,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    matchesWakeKeywords: matchesWakeKeywords,
    transformWorldbookEntry: transformWorldbookEntry,
    processLoadedWorldInfo: processLoadedWorldInfo,
    installWorldInfoHook: installWorldInfoHook,
    uninstallWorldInfoHook: uninstallWorldInfoHook,
    scanEnabledCores: scanEnabledCores,
    statusSummary: statusSummary,
    openModal: openModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
/* DREAM_CORE_MANAGER_END */
