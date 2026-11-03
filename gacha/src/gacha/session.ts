/** 命运抽卡的服务层：设置、主题、撒网（54 部）、小池编纂、抽卡与保底、记录。
 *  与宿主无关：读者通过 GachaPort 提供命运点数、背包写入与模型（见 src/reader/gacha-reader.ts）；本机演示用本机存储，不扣任何东西。 */
import {DEFAULT_RULES,drawStars,normalizePity,emptyPity,cryptoRng,scaleOf,toStar,type PityState,type Star,type GachaRules,type QualityScale} from './rarity';
import {DEFAULT_THEMES,DIRECTIONS,normalizeThemes,customTheme,type CustomThemeInput,type GachaTheme,type Direction,type SourceId} from './themes';
import {createNet,type FetchLike,type Net} from './net';
import {gatherSpread,defaultSourceSwitches,SOURCES,type WorkCard,type SourceReport} from './sources';
import {buildDossier,type Dossier} from './dossier';
import {poolPrompt,parsePool,offlinePool,normalizePool,overviewPrompt,parseOverviews,KIND_LABEL,type SmallPool,type GachaCard,type CardKind} from './pool';
import type {BagEntry,RecyclePick} from './bag';

export type ApiSettings = {enabled: boolean; url: string; model: string; key: string};
export type GachaSettings = {
  version: 1; autoBag: boolean; nsfw: boolean; proxy: boolean; fandom: boolean;
  sources: Record<SourceId, boolean>; googleKey: string; scale: 'destined' | 'stars'; themes: GachaTheme[]; api: ApiSettings;
};
/** 定价（固定，不在设置里改）：换一次大池（撒网捞起 54 部）1000 命运点；小池单抽 200、十连 2000。 */
export const CAST_COST = 1000, DRAW_COST = 200, TEN_COST = 2000;
export function defaultSettings(): GachaSettings {
  return {version: 1, autoBag: true, nsfw: false, proxy: true, fandom: true, sources: defaultSourceSwitches(), googleKey: '', scale: 'destined', themes: [], api: {enabled: false, url: '', model: '', key: ''}};
}
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const money = (v: unknown, fallback: number) => {const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : fallback;};
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
export function normalizeSettings(raw: unknown): GachaSettings {
  const v = rec(raw), d = defaultSettings(), s = rec(v.sources), api = rec(v.api);
  return {
    version: 1, autoBag: v.autoBag !== false, nsfw: v.nsfw === true, proxy: v.proxy !== false, fandom: v.fandom !== false,
    sources: Object.fromEntries(SOURCES.map(x => [x.id, typeof s[x.id] === 'boolean' ? s[x.id] as boolean : x.defaultOn])) as Record<SourceId, boolean>,
    googleKey: text(v.googleKey, 200), scale: v.scale === 'stars' ? 'stars' : 'destined', themes: normalizeThemes(v.themes),
    api: {enabled: api.enabled === true, url: text(api.url, 300), model: text(api.model, 120), key: text(api.key, 400)},
  };
}

export type DrawRecord = {id: string; at: number; workKey: string; work: string; kind: CardKind; count: number; cost: number; results: {name: string; kind: CardKind; star: Star}[]; bagged: boolean};
export type GachaDurable = {version: 1; pity: PityState; history: DrawRecord[]; updated: number};
export const HISTORY_LIMIT = 100;
export function normalizeDurable(raw: unknown): GachaDurable {
  const v = rec(raw), history: DrawRecord[] = [];
  for (const r of (Array.isArray(v.history) ? v.history : []).slice(0, HISTORY_LIMIT).map(rec)) {
    if (typeof r.id !== 'string' || typeof r.workKey !== 'string') continue;
    const results = (Array.isArray(r.results) ? r.results : []).map(rec).slice(0, 20).map(x => ({name: text(x.name, 24), kind: (x.kind === 'fate' ? 'fate' : 'item') as CardKind, star: toStar(x.star)})).filter(x => x.name);
    history.push({id: r.id.slice(0, 40), at: Number(r.at) || 0, workKey: r.workKey.slice(0, 120), work: text(r.work, 60), kind: r.kind === 'fate' ? 'fate' : 'item', count: Math.max(1, Math.min(20, Math.floor(Number(r.count)) || 1)), cost: money(r.cost, 0), results, bagged: r.bagged === true});
  }
  return {version: 1, pity: normalizePity(v.pity), history, updated: Number(v.updated) || 0};
}
export type GachaSpread = {themeId: string; themeName: string; direction: Direction; works: WorkCard[]; reports: SourceReport[]; at: number};
export type Overview = {zh?: string; overview: string};
export type GachaDevice = {spread?: GachaSpread; pools: Record<string, SmallPool>; overviews: Record<string, Overview>; picked?: string};
export const POOL_CACHE_LIMIT = 8;
export function normalizeDevice(raw: unknown): GachaDevice {
  const v = rec(raw), pools: Record<string, SmallPool> = {}, overviews: Record<string, Overview> = {};
  for (const p of Object.values(rec(v.pools))) {const x = normalizePool(p); if (x) pools[x.workKey] = x;}
  for (const [k, o] of Object.entries(rec(v.overviews)).slice(-300)) {const r = rec(o); if (typeof r.overview === 'string') overviews[k] = {overview: text(r.overview, 90), ...(typeof r.zh === 'string' && r.zh ? {zh: text(r.zh, 40)} : {})};}
  const sp = rec(v.spread), works = Array.isArray(sp.works) ? sp.works.filter(w => typeof rec(w).key === 'string' && typeof rec(w).title === 'string') as WorkCard[] : [];
  const spread: GachaSpread | undefined = works.length && typeof sp.themeId === 'string' ? {themeId: sp.themeId, themeName: text(sp.themeName, 24), direction: sp.direction === 'acgn' ? 'acgn' : 'literature', works: works.slice(0, 60), reports: Array.isArray(sp.reports) ? sp.reports as SourceReport[] : [], at: Number(sp.at) || 0} : undefined;
  return {...(spread ? {spread} : {}), pools, overviews, ...(typeof v.picked === 'string' ? {picked: v.picked} : {})};
}

export type Wallet = {fp: number | null; blocked?: string};
export type CommitRequest = {cost: number; cards: GachaCard[]; pool: SmallPool; kind: CardKind; bag: boolean; scale: QualityScale};
export type RecycleResult = {fp: number | null; gained: number; removed: number};
export type LlmOptions = {timeoutMs: number; signal?: AbortSignal; purpose: 'pool' | 'overview'};
export type GachaPort = {
  contextId: string; mode: 'host' | 'local';
  readDurable(): unknown; writeDurable(v: GachaDurable): Promise<void>;
  readDevice(): unknown; writeDevice(v: GachaDevice): void;
  readSettings(): unknown; writeSettings(v: GachaSettings): void;
  wallet(): Wallet;
  /** 宿主：一次提交里扣命运点数并把抽到的东西放进主角背包。 */
  commit?(req: CommitRequest): Promise<Wallet>;
  /** 宿主：换大池（撒网）扣命运点数；捞到作品之后才扣，失败或取消不扣。 */
  commitCast?(req: {cost: number; theme: string}): Promise<Wallet>;
  /** 宿主：主角背包里来自命运抽卡的东西（回收用）。 */
  bag?(): BagEntry[];
  /** 宿主：按品质回收，一次提交里移出物品并加回命运点数。 */
  recycle?(picks: RecyclePick[]): Promise<RecycleResult>;
  /** 宿主：经酒馆助手独立生成（读者“独立API”里的「命运抽卡」路由）。 */
  llm?(system: string, user: string, options: LlmOptions): Promise<string>;
  fetch: FetchLike; proxyBase?: string;
};
export type DrawOutcome = {cards: GachaCard[]; stars: Star[]; record: DrawRecord; wallet: Wallet; warning?: string};

/** 本机演示 / 没有宿主模型时：OpenAI 兼容的 /chat/completions。 */
export async function chatCompletion(fetcher: FetchLike, api: ApiSettings, system: string, user: string, options: LlmOptions): Promise<string> {
  if (options.signal?.aborted) throw Error('已取消');
  const base = api.url.trim().replace(/\/+$/, ''), url = /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';
  const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined;
  const abort = () => ctrl?.abort(); options.signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, options.timeoutMs);
  try {
    const res = await fetcher(url, {method: 'POST', headers: {'Content-Type': 'application/json', ...(api.key ? {Authorization: 'Bearer ' + api.key} : {})}, credentials: 'omit', body: JSON.stringify({model: api.model, temperature: options.purpose === 'pool' ? .85 : .4, messages: [{role: 'system', content: system}, {role: 'user', content: user}]}), ...(ctrl ? {signal: ctrl.signal} : {})});
    if (!res.ok) throw Error(`模型接口 HTTP ${res.status}`);
    const body = rec(await res.json()), choice = rec((Array.isArray(body.choices) ? body.choices : [])[0]);
    const content = rec(choice.message).content ?? choice.text;
    if (typeof content !== 'string' || !content.trim()) throw Error('模型没有返回内容');
    return content;
  } catch (e) {
    if (options.signal?.aborted) throw Error('已取消');
    if (ctrl?.signal.aborted) throw Error('模型想得太久了（超时）');
    throw e;
  } finally {clearTimeout(timer); options.signal?.removeEventListener('abort', abort);}
}

export type GachaService = ReturnType<typeof createGacha>;
export function createGacha(port: GachaPort, options: {rng?: () => number; now?: () => number; rules?: GachaRules} = {}) {
  const rng = options.rng ?? cryptoRng(globalThis as {crypto?: Crypto}), now = options.now ?? (() => Date.now()), rules = options.rules ?? DEFAULT_RULES;
  const listeners = new Set<() => void>(), memo = new Map<string, unknown>();
  const safe = <T>(fn: () => T, fallback: T): T => {try {return fn();} catch {return fallback;}};
  let settings = normalizeSettings(safe(() => port.readSettings(), undefined));
  let device = normalizeDevice(safe(() => port.readDevice(), undefined));
  let durable = normalizeDurable(safe(() => port.readDurable(), undefined));
  let net: Net = makeNet();
  function makeNet() {return createNet(port.fetch, {...(port.proxyBase ? {proxyBase: port.proxyBase} : {}), useProxy: settings.proxy});}
  const notify = () => {for (const fn of [...listeners]) {try {fn();} catch {/* 界面刷新失败不影响抽卡 */}}};
  const saveDevice = () => {
    const keys = Object.keys(device.pools);
    if (keys.length > POOL_CACHE_LIMIT) {const keep = new Set(keys.sort((a, b) => (device.pools[b]!.at || 0) - (device.pools[a]!.at || 0)).slice(0, POOL_CACHE_LIMIT)); if (device.picked) keep.add(device.picked); for (const k of keys) if (!keep.has(k)) delete device.pools[k];}
    try {port.writeDevice(device);} catch {/* 本机缓存写不进去：只影响下次打开 */}
  };
  const llmReady = () => port.mode === 'host' ? !!port.llm : settings.api.enabled && /^https?:\/\//i.test(settings.api.url) && !!settings.api.model;
  async function ask(system: string, user: string, o: LlmOptions): Promise<string> {
    if (port.mode === 'host' && port.llm) return port.llm(system, user, o);
    if (settings.api.enabled) return chatCompletion(port.fetch, settings.api, system, user, o);
    throw Error('没有可用的模型：请在设置里填写接口，或从读者大厅打开');
  }
  const allThemes = () => [...DEFAULT_THEMES, ...settings.themes];
  const findTheme = (id: string) => allThemes().find(t => t.id === id);
  function costFor(count: number) {return port.mode === 'host' ? (count >= 10 ? TEN_COST : DRAW_COST * count) : 0;}
  const castCost = () => port.mode === 'host' ? CAST_COST : 0;
  function pickCard(pool: SmallPool, kind: CardKind, star: Star): GachaCard {
    const list = kind === 'fate' ? pool.fates : pool.items;
    for (const d of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {const s = star + d, hit = list.filter(c => c.star === s); if (hit.length) return hit[Math.floor(rng() * hit.length)]!;}
    return list[Math.floor(rng() * list.length)]!;
  }
  const wallet = (): Wallet => port.mode === 'host' ? safe(() => port.wallet(), {fp: null, blocked: '读不到命运点数'}) : {fp: null};
  function canDraw(count: number): {ok: boolean; cost: number; reason?: string} {return canPay(costFor(count));}
  function canPay(cost: number): {ok: boolean; cost: number; reason?: string} {
    if (port.mode !== 'host' || cost === 0) return {ok: true, cost};
    const w = wallet();
    if (w.blocked) return {ok: false, cost, reason: w.blocked};
    if (w.fp === null) return {ok: false, cost, reason: '读不到命运点数'};
    return w.fp >= cost ? {ok: true, cost} : {ok: false, cost, reason: `命运点不足（需要 ${cost.toLocaleString('zh-CN')}，现有 ${w.fp.toLocaleString('zh-CN')}）`};
  }
  return {
    mode: port.mode, contextId: port.contextId, rules,
    settings: () => settings,
    scale: () => scaleOf(settings.scale),
    saveSettings(next: GachaSettings) {settings = normalizeSettings(next); try {port.writeSettings(settings);} catch {/* 只影响下次打开 */} net = makeNet(); notify();},
    llmReady,
    themes: (direction?: Direction) => allThemes().filter(t => !direction || t.direction === direction),
    directions: DIRECTIONS,
    addTheme(input: CustomThemeInput) {const t = customTheme(input, now()); if (!t) return undefined; settings = {...settings, themes: [...settings.themes, t].slice(-40)}; try {port.writeSettings(settings);} catch {/* 本机设置 */} notify(); return t;},
    removeTheme(id: string) {settings = {...settings, themes: settings.themes.filter(t => t.id !== id)}; try {port.writeSettings(settings);} catch {/* 本机设置 */} notify();},
    spread: () => device.spread,
    overviewOf: (key: string) => device.overviews[key],
    castCost,
    canCast: () => canPay(castCost()),
    /** 换大池：撒网捞起 54 部作品（替换当前这片书海）。捞到之后才扣命运点数；捞空、失败或取消都不扣。 */
    async cast(themeId: string, o: {onReport?: (r: SourceReport) => void; signal?: AbortSignal} = {}): Promise<GachaSpread> {
      const theme = findTheme(themeId); if (!theme) throw Error('没有这个主题');
      const pay = canPay(castCost()); if (!pay.ok) throw Error(pay.reason ?? '现在不能换大池');
      const {works, reports} = await gatherSpread(theme, {net, rng, nsfw: settings.nsfw, ...(settings.googleKey ? {googleKey: settings.googleKey} : {}), ...(o.signal ? {signal: o.signal} : {}), memo}, {want: 54, enabled: settings.sources, ...(o.onReport ? {onReport: o.onReport} : {}), now});
      if (o.signal?.aborted) throw Error('已取消');
      if (!works.length) {const why = reports.map(r => r.error ? `${r.name}：${r.error}` : '').filter(Boolean).join('；'); throw Error('这一网什么也没捞到，没有扣命运点数' + (why ? '（' + why + '）' : '。换个主题，或在设置里多开几个资料库。'));}
      // 扣点之后不再理会取消：已经付过的这一网一定留下。
      if (port.mode === 'host' && pay.cost > 0 && port.commitCast) await port.commitCast({cost: pay.cost, theme: theme.name});
      device = {...device, spread: {themeId, themeName: theme.name, direction: theme.direction, works, reports, at: now()}}; delete device.picked; saveDevice(); notify();
      return device.spread!;
    },
    /** 给没有中文简介的作品补一句中文览概（一次请求批量完成）。 */
    async overview(keys?: string[], o: {signal?: AbortSignal} = {}): Promise<number> {
      const works = (device.spread?.works ?? []).filter(w => (!keys || keys.includes(w.key)) && !device.overviews[w.key] && !(w.summaryLang === 'zh' && w.overview)).slice(0, 54);
      if (!works.length) return 0;
      const p = overviewPrompt(works), raw = await ask(p.system, p.user, {timeoutMs: 120000, purpose: 'overview', ...(o.signal ? {signal: o.signal} : {})});
      if (o.signal?.aborted) throw Error('已取消');
      const got = parseOverviews(raw, works);
      device = {...device, overviews: {...device.overviews, ...got}}; saveDevice(); notify();
      return Object.keys(got).length;
    },
    pool: (workKey: string) => device.pools[workKey],
    picked: () => device.picked,
    pick(workKey: string | undefined) {if (workKey) device = {...device, picked: workKey}; else {const {picked: _p, ...rest} = device; device = rest;} saveDevice(); notify();},
    /** 编纂小池：查资料 → 模型编纂（失败或没有模型时用资料直出）。 */
    async compile(work: WorkCard, o: {onStep?: (label: string) => void; signal?: AbortSignal; offline?: boolean} = {}): Promise<SmallPool> {
      const dossier: Dossier = await buildDossier(work, {net, fandom: settings.fandom, ...(o.signal ? {signal: o.signal} : {})}, o.onStep);
      if (o.signal?.aborted) throw Error('已取消');
      let pool: SmallPool, warning = '';
      if (!o.offline && llmReady()) {
        o.onStep?.('夜梦正在编纂小池');
        try {const p = poolPrompt(dossier), raw = await ask(p.system, p.user, {timeoutMs: 180000, purpose: 'pool', ...(o.signal ? {signal: o.signal} : {})}); pool = parsePool(raw, work, dossier.sources, now());}
        catch (e) {if (o.signal?.aborted) throw e; warning = String((e as Error)?.message ?? e); pool = offlinePool(dossier, now());}
      } else pool = offlinePool(dossier, now());
      if (o.signal?.aborted) throw Error('已取消');
      // 补写览概时得到的中文译名作为小池标题（物品与命运入包时也用它）；原来的标题留作原名 / 英文名。
      const ov = device.overviews[work.key], w0 = pool.work;
      if (ov?.zh && ov.zh !== w0.title) {
        const latin = !/[\u3040-\u30ff\u3400-\u9fff]/.test(w0.title), english = w0.english ?? (latin ? w0.title : undefined), original = w0.original ?? (latin ? undefined : w0.title);
        pool = {...pool, work: {...w0, title: ov.zh, ...(original ? {original} : {}), ...(english ? {english} : {})}};
      }
      device = {...device, pools: {...device.pools, [work.key]: pool}, picked: work.key}; saveDevice(); notify();
      if (warning) o.onStep?.('模型没能编纂（' + warning.slice(0, 60) + '），已改用资料直出');
      return pool;
    },
    wallet,
    pity: () => durable.pity,
    history: () => durable.history,
    refresh() {durable = normalizeDurable(safe(() => port.readDurable(), undefined)); notify();},
    cost: costFor,
    canDraw,
    /** 抽卡：先算星级与保底，宿主扣点 / 入包成功后才记下保底与记录。 */
    async draw(workKey: string, kind: CardKind, count: 1 | 10): Promise<DrawOutcome> {
      const pool = device.pools[workKey]; if (!pool) throw Error('先选一部作品编纂小池');
      const check = canDraw(count); if (!check.ok) throw Error(check.reason ?? '现在不能抽卡');
      durable = normalizeDurable(safe(() => port.readDurable(), durable));
      const {stars, pity} = drawStars(count, rng, durable.pity, rules), cards = stars.map(s => ({...pickCard(pool, kind, s), star: s}));
      let after = wallet();
      if (port.mode === 'host' && port.commit) after = await port.commit({cost: check.cost, cards, pool, kind, bag: settings.autoBag, scale: scaleOf(settings.scale)});
      const record: DrawRecord = {id: now().toString(36) + '-' + Math.floor(rng() * 1e6).toString(36), at: now(), workKey, work: pool.work.title, kind, count, cost: check.cost, results: cards.map(c => ({name: c.name, kind: c.kind, star: c.star})), bagged: port.mode === 'host' && settings.autoBag};
      durable = {version: 1, pity, history: [record, ...durable.history].slice(0, HISTORY_LIMIT), updated: now()};
      let warning: string | undefined;
      try {await port.writeDurable(durable);} catch (e) {warning = '抽卡已完成，但保底与记录没能写进聊天：' + String((e as Error)?.message ?? e).slice(0, 60);}
      notify();
      return {cards, stars, record, wallet: after, ...(warning ? {warning} : {})};
    },
    kindLabel: (k: CardKind) => KIND_LABEL[k],
    /** 主角背包里来自命运抽卡的东西（本机演示没有背包）。 */
    bag: (): BagEntry[] => port.mode === 'host' && port.bag ? safe(() => port.bag!(), []) : [],
    canRecycle: () => port.mode === 'host' && !!port.recycle,
    /** 按品质回收：回收价为同层级角色缔结命定契约基础价的 1/25（见 bag.ts）。 */
    async recycle(picks: RecyclePick[]): Promise<RecycleResult> {
      if (port.mode !== 'host' || !port.recycle) throw Error('这里没有背包可以回收');
      const out = await port.recycle(picks); notify(); return out;
    },
    subscribe(fn: () => void) {listeners.add(fn); return () => {listeners.delete(fn);};},
    /** 测试 / 设置页“清空缓存”。 */
    clearCache() {device = {pools: {}, overviews: {}}; memo.clear(); saveDevice(); notify();},
    proxied: () => net.proxied(),
    emptyPity,
  };
}

/** 本机演示 / 没有宿主：保底与记录、缓存、设置都存在这台设备。 */
export function localGachaPort(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, fetcher: FetchLike, proxyBase?: string): GachaPort {
  const read = (k: string) => {try {const raw = storage?.getItem(k); return raw ? JSON.parse(raw) : undefined;} catch {return undefined;}};
  const write = (k: string, v: unknown) => {try {storage?.setItem(k, JSON.stringify(v));} catch {/* 存不下就算了 */}};
  return {
    contextId: 'local', mode: 'local',
    readDurable: () => read('dream_gacha_local_v1'), async writeDurable(v) {if (!storage) throw Error('这台设备不能保存'); write('dream_gacha_local_v1', v);},
    readDevice: () => read('dream_gacha_device_local_v1'), writeDevice: v => write('dream_gacha_device_local_v1', v),
    readSettings: () => read(SETTINGS_KEY), writeSettings: v => write(SETTINGS_KEY, v),
    wallet: () => ({fp: null}), fetch: fetcher, ...(proxyBase ? {proxyBase} : {}),
  };
}
/** 设置与本机缓存放在这台设备（与读者其他本机设置同一个站点存储）。 */
export const SETTINGS_KEY = 'dream_gacha_settings_v1';
export const DEVICE_KEY = 'dream_gacha_device_v1';
/** 宿主模式的本机缓存：按聊天分开，只留最近 6 个聊天。 */
export function deviceStore(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, contextId: string, key = DEVICE_KEY) {
  const all = () => {try {const v = JSON.parse(storage?.getItem(key) ?? 'null'); return v && typeof v === 'object' && v.contexts && typeof v.contexts === 'object' ? v as {version: 1; contexts: Record<string, {at: number; data: unknown}>} : {version: 1 as const, contexts: {}};} catch {return {version: 1 as const, contexts: {}};}};
  return {
    read: () => all().contexts[contextId]?.data,
    write(data: unknown) {
      const v = all(), last = Math.max(0, ...Object.values(v.contexts).map(x => Number(x?.at) || 0)); v.contexts[contextId] = {at: Math.max(Date.now(), last + 1), data};
      const keys = Object.keys(v.contexts).sort((a, b) => (v.contexts[b]!.at || 0) - (v.contexts[a]!.at || 0));
      for (const k of keys.slice(6)) delete v.contexts[k];
      try {storage?.setItem(key, JSON.stringify(v));} catch {/* 本机空间不足：只影响缓存 */}
    },
  };
}
