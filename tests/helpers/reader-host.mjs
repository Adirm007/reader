import { readFile } from 'node:fs/promises';
import ejs from 'ejs';

const coreUrl = new URL('../../worldbook/读者核心本体.txt', import.meta.url);
const coreSource = await readFile(coreUrl, 'utf8');
const profile = await readFile(new URL('../../source/black-author.prompt.json', import.meta.url), 'utf8');
const compile = source => ejs.compile(source, { async: true, filename: coreUrl.pathname });
const renderCore = compile(coreSource);
const clone = value => value === undefined ? undefined : structuredClone(value);

function readPath(object, path) {
  if (path === '' || path == null) return object;
  return String(path).split('.').reduce((value, key) => value?.[key], object);
}

function writePath(object, path, value) {
  const keys = String(path).split('.');
  let owner = object;
  for (const key of keys.slice(0, -1)) {
    if (owner[key] === null || typeof owner[key] !== 'object') owner[key] = {};
    owner = owner[key];
  }
  owner[keys.at(-1)] = value;
  return value;
}

/**
 * Minimal prompt-template host, not an MVU or model simulator.
 * Matches ST-Prompt-Template v1.17.9's relevant variable semantics:
 * - cache = shallow merge(global, initial, local, selected-message variables), then clone;
 * - getMessageVar without withMsg reads that cache; getLocalVar reads chat metadata;
 * - explicit message selection uses withMsg, not the unsupported `index` option;
 * - preview writes are suppressed unless dryRun:true was explicitly requested.
 * Unrelated worldbook keyword activation is kept off by matchChatMessages=false.
 */
export function createReaderHost({
  local = {},
  statData = {},
  global = {},
  initial = {},
  fetch: fetchImpl = async () => { throw new Error('Unexpected network request in reader-core test'); },
} = {}) {
  const localVariables = {
    dream_persona: 'kuromaku', dream_seed: 3,
    dream_black_author_prompt: JSON.stringify(JSON.parse(profile)), ...clone(local),
  };
  const globalVariables = clone(global);
  const initialVariables = clone(initial);
  const chat = [
    { is_user: false, mes: '', swipe_id: 0, variables: [{ stat_data: clone(statData) }] },
    { is_user: true, mes: '继续当前剧情。', swipe_id: 0 },
  ];
  const writes = [];
  const requests = [];
  let selectedMessage = 1;
  let cache = {};
  let preview = false;

  function messageVariables(id, swipe) {
    let index = Number(id);
    if (index < 0) index += chat.length;
    const message = chat[index];
    if (!message) return undefined;
    const swipeIndex = swipe ?? message.swipe_id ?? 0;
    if (!Array.isArray(message.variables)) message.variables = [];
    if (message.variables[swipeIndex] === undefined) {
      for (let previous = index - 1; previous >= 0; previous--) {
        const source = chat[previous];
        const variables = source.variables?.[source.swipe_id ?? 0];
        if (variables !== undefined) {
          message.variables[swipeIndex] = clone(variables);
          break;
        }
      }
      message.variables[swipeIndex] ??= {};
    }
    return message.variables[swipeIndex];
  }

  function rebuildCache() {
    cache = clone(Object.assign({}, globalVariables, initialVariables, localVariables,
      messageVariables(selectedMessage)));
  }

  function getvar(path, options = {}) {
    let variables = cache;
    if (options.scope === 'local') variables = localVariables;
    else if (options.scope === 'global') variables = globalVariables;
    else if (options.scope === 'message' && options.withMsg) {
      variables = messageVariables(options.withMsg.id, options.withMsg.swipe_id ?? options.withMsg.swipe);
    }
    const value = readPath(variables, path);
    const result = value === undefined ? options.defaults : value;
    return options.clone ? clone(result) : result;
  }

  function setvar(path, value, options = {}) {
    if (preview && options.dryRun !== true) return value;
    const scope = options.scope ?? 'local';
    const variables = scope === 'local' ? localVariables
      : scope === 'global' ? globalVariables
        : messageVariables(options.withMsg?.id ?? selectedMessage,
          options.withMsg?.swipe_id ?? options.withMsg?.swipe);
    writePath(variables, path, clone(value));
    writePath(cache, path, clone(value));
    writes.push({ scope, path, value: clone(value) });
    return value;
  }

  const context = {
    chat,
    chat_metadata: { variables: localVariables },
    getCurrentChatId: () => 'reader-test-chat',
    saveMetadata: async () => {},
    saveChat: async () => {},
  };
  context.getContext = () => context;

  const host = {
    local: localVariables,
    chat,
    writes,
    requests,
    get cache() { return cache; },
    setLocal(path, value) { writePath(localVariables, path, clone(value)); },
    setStatData(data, { message = selectedMessage, swipe = 0 } = {}) {
      while (chat.length <= message) chat.push({ is_user: false, mes: '', swipe_id: 0, variables: [] });
      chat[message].variables ??= [];
      chat[message].variables[swipe] = { stat_data: clone(data) };
      chat[message].swipe_id = swipe;
    },
    selectMessage(message, swipe = 0) {
      selectedMessage = message < 0 ? chat.length + message : message;
      if (!chat[selectedMessage]) throw new Error(`Missing test message ${selectedMessage}`);
      chat[selectedMessage].swipe_id = swipe;
    },
    async render({ dryRun = false, generateType = 'normal', suffix = '', extra = {} } = {}) {
      preview = dryRun;
      rebuildCache();
      const locals = {
        message_id: selectedMessage,
        generateType,
        isDryRun: dryRun,
        runType: dryRun ? 'preview' : 'prepare',
        getvar,
        setvar,
        getLocalVar: (path, options = {}) => getvar(path, { ...options, scope: 'local' }),
        setLocalVar: (path, value, options = {}) => setvar(path, value, { ...options, scope: 'local' }),
        getMessageVar: (path, options = {}) => getvar(path, { ...options, scope: 'message' }),
        setMessageVar: (path, value, options = {}) => setvar(path, value, { ...options, scope: 'message' }),
        getChatMessage(index = -1, role) {
          const messages = role ? chat.filter(message => role === (message.is_user ? 'user' : 'assistant')) : chat;
          return messages[index < 0 ? messages.length + index : index]?.mes ?? '';
        },
        matchChatMessages: () => false,
        getCurrentChatId: context.getCurrentChatId,
        SillyTavern: context,
        fetch: async (...args) => { requests.push(args); return fetchImpl(...args); },
        ...extra,
      };
      const rendered = await (suffix ? compile(coreSource + suffix) : renderCore)(locals);
      return rendered.replace(/\{\{getvar::([^{}]+)\}\}/g,
        (_, path) => String(getvar(path.trim(), { scope: 'local', defaults: '' })));
    },
  };
  return host;
}

export function makeStatData({ relations = {}, progress = 0, heroStatuses = {} } = {}) {
  return {
    事件: { 进度: progress },
    世界: { 地点: '测试城镇的旅店', 时间: '测试日' },
    主角: { 状态效果: clone(heroStatuses) },
    关系列表: clone(relations),
  };
}

export function makeRelation({ favor = 70, hp = 1, statuses = {} } = {}) {
  return { 好感度: favor, 生命值: { 当前: hp }, 状态效果: clone(statuses) };
}
