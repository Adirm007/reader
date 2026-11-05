// Only the card's auto-regex uses this entry. Standalone reader modules keep their own lifecycle.
import { BUNDLED } from 'reader:bundled';

let restored = null, selected = null, moduleJob = null, moduleKey = null;
let active = null, starting = null, generation = 0, warnedOwner = false;

function host() {
  try { return window.parent || window; } catch { return window; }
}

function store() {
  return window.ReaderHostedRuntimeStore || host().ReaderHostedRuntimeStore;
}

function newer(a, b) {
  const valid = /^\d{1,8}(?:\.\d{1,8}){1,5}$/;
  if (!valid.test(a || '') || !valid.test(b || '')) return false;
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference > 0;
  }
  return false;
}

function notify(text) {
  console.warn('[读者]', text);
  try { (window.toastr || host().toastr)?.warning?.(text); } catch {}
}

function restore() {
  if (!restored) restored = (async () => {
    try {
      const storage = store();
      if (!storage?.read) throw Error('本地版本缓存不可用');
      const result = await storage.read();
      selected = result.artifact || null;
      if (result.error) notify(result.error);
    } catch (error) { notify(`已选读者版本无法读取，使用卡内版本：${error?.message || error}`); }
  })();
  return restored;
}

function cachedModule(artifact) {
  const key = `${artifact.metadata.version}:${artifact.spec.sha256}`;
  if (moduleKey !== key || !moduleJob) {
    moduleKey = key;
    const url = URL.createObjectURL(new Blob([artifact.bytes], { type: 'text/javascript' }));
    moduleJob = import(/* @vite-ignore */ url).then(module => {
      if (typeof module.start !== 'function' || typeof module.stop !== 'function') throw Error('本地读者版本缺少启动或停止接口');
      return module;
    }).finally(() => URL.revokeObjectURL(url));
  }
  return moduleJob;
}

function state() {
  const runningVersion = active?.api?.runtimeVersion || null;
  return { runningVersion, pendingVersion: selected && newer(selected.metadata.version, runningVersion || BUNDLED.version) ? selected.metadata.version : null };
}

function context() {
  const ctx = host().SillyTavern?.getContext?.();
  const core = ctx?.chatMetadata?.variables?.系统核心;
  return JSON.stringify([ctx?.characterId, ctx?.getCurrentChatId?.() ?? ctx?.chatId, core]);
}

function current(token, identity) {
  return token === generation && (identity === undefined || identity === context());
}

function canStart(token) {
  const win = host(), ctx = win.SillyTavern?.getContext?.();
  let core = ctx?.chatMetadata?.variables?.系统核心;
  try { core = win.TavernHelper?.getVariables?.({ type: 'chat' })?.系统核心 ?? core; } catch {}
  return current(token) && (!core || core === '九十九夜梦');
}

function stopAttempt(attempt) {
  if (attempt.api?.scriptOwner) return;
  // A cancelled import/start must not stop a later owner that has taken over the page.
  if (!attempt.api || !host().ReaderCore || host().ReaderCore === attempt.api) attempt.module.stop();
}

export function start(options = {}) {
  if (starting) return starting;
  if (active?.api?.isAlive !== false && active?.api) return Promise.resolve(active.api);
  const token = generation;
  const job = (async () => {
    await restore();
    if (!canStart(token)) return null;
    const candidate = selected && newer(selected.metadata.version, BUNDLED.version) ? selected : null;
    let module = BUNDLED;
    if (candidate) {
      try { module = await cachedModule(candidate); }
      catch (error) {
        if (selected === candidate) selected = null;
        notify(`已选读者版本无法启动，使用卡内版本：${error?.message || error}`);
      }
    }
    if (!canStart(token)) return null;
    async function activate(target, expectedVersion) {
      const attempt = { module: target, api: null };
      active = attempt;
      const updates = { ...options.updates, hostMode: 'auto-regex', getHostedRuntimeState: state,
        installRuntime: async (artifact, guard) => {
          // One hosted module can follow several chats. Bind persistence to the chat that
          // requested this update, rather than the chat in which the module first started.
          const identity = context();
          const check = () => {
            if (typeof guard === 'function') guard();
            if (!current(token, identity) || active !== attempt) throw Error('聊天或读者运行状态已变化，请重新检查更新');
          };
          check();
          const storage = store();
          if (!storage?.save) throw Error('本地版本缓存不可用，已保留原版本');
          const saved = await storage.save(artifact, check);
          selected = saved;
          return { version: saved.metadata.version, pending: true, detail: `已保存读者 v${saved.metadata.version}，下次启动读者时生效；当前播放继续` };
        } };
      try {
        attempt.api = await target.start({ ...options, updates });
        if (!canStart(token) || active !== attempt) { stopAttempt(attempt); return null; }
        if (!attempt.api) throw Error('读者未返回运行实例');
        if (attempt.api.scriptOwner) {
          if (!warnedOwner) { warnedOwner = true; notify('旧的读者常驻脚本仍在运行；停用它后，读者会由角色卡的自动正则托管'); }
          return attempt.api;
        }
        if (attempt.api.runtimeVersion !== expectedVersion) throw Error('本地读者版本与记录不符');
        const ready = attempt.api.ready === undefined || await attempt.api.ready;
        if (!canStart(token) || active !== attempt) { stopAttempt(attempt); return null; }
        if (!ready) throw Error('读者控制器未能启动');
        return attempt.api;
      } catch (error) {
        if (active === attempt) { stopAttempt(attempt); active = null; }
        throw error;
      }
    }
    try { return await activate(module, module === BUNDLED ? BUNDLED.version : candidate.metadata.version); }
    catch (error) {
      if (module === BUNDLED || !canStart(token)) throw error;
      if (selected === candidate) selected = null;
      notify(`已选读者版本无法启动，使用卡内版本：${error?.message || error}`);
      return activate(BUNDLED, BUNDLED.version);
    }
  })();
  starting = job;
  job.then(() => { if (starting === job) starting = null; }, () => { if (starting === job) starting = null; });
  return job;
}

export function stop() {
  generation++;
  starting = null;
  const previous = active;
  active = null;
  if (previous) stopAttempt(previous);
}
