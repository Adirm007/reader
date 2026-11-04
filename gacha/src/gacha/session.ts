/** 命运抽卡的服务层：设置、主题、撒网（99 部）、小池编纂、抽卡与保底、大保底兑换、记录。
 *  与宿主无关：读者通过 GachaPort 提供命运点数、背包写入与模型（见 src/reader/gacha-reader.ts）；本机演示用本机存储，不扣任何东西。 */
import {DEFAULT_RULES,advancePity,drawStars,normalizePity,emptyPity,cryptoRng,scaleOf,toStar,type PityState,type Star,type GachaRules,type QualityScale} from './rarity';
import {DEFAULT_THEMES,DIRECTIONS,normalizeThemes,customTheme,type CustomThemeInput,type GachaTheme,type Direction,type SourceId} from './themes';
import {createNet,type FetchLike,type Net} from './net';
import {gatherSpread,defaultSourceSwitches,SOURCES,type WorkCard,type SourceReport} from './sources';
import {buildDossier,type Dossier} from './dossier';
import {KIND_KEY,KIND_LABEL,assemblePool,kindPrompt,normalizePlan,normalizePool,offlineCards,offlinePool,overviewPrompt,parseCards,parseOverviews,planPrompt,poolKinds,poolList,poolMythics,poolSize,readReply,type CardKind,type GachaCard,type SmallPool} from './pool';
import type {BagEntry,RecyclePick} from './bag';

export type ApiSettings = {enabled: boolean; url: string; model: string; key: string};
export type GachaSettings = {
  version: 1; autoBag: boolean; nsfw: boolean; proxy: boolean; fandom: boolean;
  /** 角色池（默认关闭）：打开后小池在物品池、命运池之外再加一个角色池。 */
  characterPool: boolean;
  sources: Record<SourceId, boolean>; googleKey: string; scale: 'destined' | 'stars'; themes: GachaTheme[]; api: ApiSettings;
};
/** 定价（固定，不在设置里改）：换一次大池（撒网捞起 99 部）1000 命运点；小池单抽 200、十连 2000。 */
export const CAST_COST = 1000, DRAW_COST = 200, TEN_COST = 2000;
/** 一网（一片大池）捞起的作品数。 */
export const SPREAD_SIZE = 99;
/** 编纂小池时每次请求模型最多等多久（规划与物品、命运、角色各一次请求）。 */
export const POOL_TIMEOUT_MS = 300000;
/** 补写中文览概时一次请求的作品数。 */
export const OVERVIEW_BATCH = 50;
export function defaultSettings(): GachaSettings {
  return {version: 1, autoBag: true, nsfw: false, proxy: true, fandom: true, characterPool: false, sources: defaultSourceSwitches(), googleKey: '', scale: 'destined', themes: [], api: {enabled: false, url: '', model: '', key: ''}};
}
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const money = (v: unknown, fallback: number) => {const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : fallback;};
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const message = (e: unknown) => String((e as Error)?.message ?? e);
export function normalizeSettings(raw: unknown): GachaSettings {
  const v = rec(raw), s = rec(v.sources), api = rec(v.api);
  return {
    version: 1, autoBag: v.autoBag !== false, nsfw: v.nsfw === true, proxy: v.proxy !== false, fandom: v.fandom !== false, characterPool: v.characterPool === true,
    sources: Object.fromEntries(SOURCES.map(x => [x.id, typeof s[x.id] === 'boolean' ? s[x.id] as boolean : x.defaultOn])) as Record<SourceId, boolean>,
    googleKey: text(v.googleKey, 200), scale: v.scale === 'stars' ? 'stars' : 'destined', themes: normalizeThemes(v.themes),
    api: {enabled: api.enabled === true, url: text(api.url, 300), model: text(api.model, 120), key: text(api.key, 400)},
  };
}

/** spark：这一条是大保底兑换（用抽取点数换的指定神话，不花命运点）。 */
export type DrawRecord = {id: string; at: number; workKey: string; work: string; kind: CardKind; count: number; cost: number; results: {name: string; kind: CardKind; star: Star}[]; bagged: boolean; spark?: true};
/** 一部作品攒下的抽取点数（大保底）：在这部作品的小池里每抽 1 点，只能在这部作品的小池里兑换。 */
export type DrawPoints = {points: number; work: string; at: number};
export type GachaDurable = {version: 1; pity: PityState; points: Record<string, DrawPoints>; history: DrawRecord[]; updated: number};
export const HISTORY_LIMIT = 100;
/** 最多记多少部作品的抽取点数（超出时先丢点数最少、最久没动的）。 */
export const POINTS_LIMIT = 200;
const kindOf = (v: unknown): CardKind => v === 'fate' ? 'fate' : v === 'character' ? 'character' : 'item';
export function normalizePoints(raw: unknown): Record<string, DrawPoints> {
  const rows = Object.entries(rec(raw)).map(([k, x]) => [k, rec(x)] as const).filter(([k, x]) => k.length <= 120 && Number(x.points) >= 1);
  rows.sort((a, b) => Number(b[1].points) - Number(a[1].points) || (Number(b[1].at) || 0) - (Number(a[1].at) || 0));
  const out: Record<string, DrawPoints> = {};
  for (const [k, x] of rows.slice(0, POINTS_LIMIT)) out[k] = {points: Math.min(1_000_000, Math.floor(Number(x.points))), work: text(x.work, 60), at: Number(x.at) || 0};
  return out;
}
/** 改一部作品的抽取点数（用完了就去掉这一条）。 */
export function withPoints(map: Record<string, DrawPoints>, workKey: string, work: string, points: number, at: number): Record<string, DrawPoints> {
  const next = {...map};
  if (points >= 1) next[workKey] = {points: Math.floor(points), work, at}; else delete next[workKey];
  return normalizePoints(next);
}
export function normalizeDurable(raw: unknown): GachaDurable {
  const v = rec(raw), history: DrawRecord[] = [];
  for (const r of (Array.isArray(v.history) ? v.history : []).slice(0, HISTORY_LIMIT).map(rec)) {
    if (typeof r.id !== 'string' || typeof r.workKey !== 'string') continue;
    const results = (Array.isArray(r.results) ? r.results : []).map(rec).slice(0, 20).map(x => ({name: text(x.name, 24), kind: kindOf(x.kind), star: toStar(x.star)})).filter(x => x.name);
    history.push({id: r.id.slice(0, 40), at: Number(r.at) || 0, workKey: r.workKey.slice(0, 120), work: text(r.work, 60), kind: kindOf(r.kind), count: Math.max(1, Math.min(20, Math.floor(Number(r.count)) || 1)), cost: money(r.cost, 0), results, bagged: r.bagged === true, ...(r.spark === true ? {spark: true as const} : {})});
  }
  return {version: 1, pity: normalizePity(v.pity), points: normalizePoints(v.points), history, updated: Number(v.updated) || 0};
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
  const spread: GachaSpread | undefined = works.length && typeof sp.themeId === 'string' ? {themeId: sp.themeId, themeName: text(sp.themeName, 24), direction: sp.direction === 'acgn' ? 'acgn' : 'literature', works: works.slice(0, 120), reports: Array.isArray(sp.reports) ? sp.reports as SourceReport[] : [], at: Number(sp.at) || 0} : undefined;
  return {...(spread ? {spread} : {}), pools, overviews, ...(typeof v.picked === 'string' ? {picked: v.picked} : {})};
}

export type Wallet = {fp: number | null; blocked?: string};
/** spark：大保底兑换（不花命运点，只把兑换的神话放进背包）。 */
export type CommitRequest = {cost: number; cards: GachaCard[]; pool: SmallPool; kind: CardKind; bag: boolean; scale: QualityScale; spark?: boolean};
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
  /** 正在使用的卡池：物品、命运，打开角色池时还有角色。 */
  const kinds = () => poolKinds(settings.characterPool);
  function costFor(count: number) {return port.mode === 'host' ? (count >= 10 ? TEN_COST : DRAW_COST * count) : 0;}
  const castCost = () => port.mode === 'host' ? CAST_COST : 0;
  function pickCard(pool: SmallPool, kind: CardKind, star: Star): GachaCard {
    const list = poolList(pool, kind);
    for (const d of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {const s = star + d, hit = list.filter(c => c.star === s); if (hit.length) return hit[Math.floor(rng() * hit.length)]!;}
    return list[Math.floor(rng() * list.length)]!;
  }
  /** 这个卡池现在能不能抽（能抽时返回 undefined）：角色池要在设置里打开，小池编纂时也要打开过角色池。 */
  function kindReady(pool: SmallPool, kind: CardKind): string | undefined {
    if (!kinds().includes(kind)) return '角色池没有打开：在抽卡设置里打开后再抽';
    if (kind === 'character' && !pool.characters) return '这个小池编纂时还没有打开角色池：重新编纂后才有角色可抽';
    if (!poolList(pool, kind).length) return kind === 'character' ? '资料里没有找到这部作品的角色，角色池是空的' : '这个卡池是空的，请重新编纂';
    return undefined;
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
  const pointsOf = (workKey: string) => durable.points[workKey]?.points ?? 0;
  /** 大保底：这部作品攒满抽取点数、小池里有神话、（要入包时）背包写得进去，才能兑换。 */
  function canExchange(workKey: string): {ok: boolean; reason?: string} {
    const pool = device.pools[workKey]; if (!pool) return {ok: false, reason: '先选一部作品编纂小池'};
    const have = pointsOf(workKey);
    if (have < rules.spark) return {ok: false, reason: `抽取点数还差 ${rules.spark - have}（这部作品攒了 ${have}，满 ${rules.spark} 可兑换）`};
    if (!poolMythics(pool, kinds()).length) return {ok: false, reason: '这个小池里没有可以兑换的神话'};
    if (port.mode === 'host' && settings.autoBag) {const w = wallet(); if (w.blocked) return {ok: false, reason: w.blocked};}
    return {ok: true};
  }
  const recordId = (at: number) => at.toString(36) + '-' + Math.floor(rng() * 1e6).toString(36);
  /** 编纂：先规划张数并写物品，再每种卡各问一次；某种卡没写成时用资料直出的卡补上，整体仍守 54–99 张与神话下限。 */
  async function compileWithModel(work: WorkCard, dossier: Dossier, use: CardKind[], warnings: string[], o: {onStep?: (label: string) => void; signal?: AbortSignal}): Promise<SmallPool> {
    const opts: LlmOptions = {timeoutMs: POOL_TIMEOUT_MS, purpose: 'pool', ...(o.signal ? {signal: o.signal} : {})};
    o.onStep?.('夜梦正在编纂小池：先规划张数，再写物品');
    const first = planPrompt(dossier, use), reply = readReply(await ask(first.system, first.user, opts));
    if (o.signal?.aborted) throw Error('已取消');
    const items = parseCards(reply.items, 'item', work.key);
    if (items.length < 6) throw Error(`回复里只有 ${items.length} 件物品`);
    const plan = normalizePlan(reply.plan, use), protagonist = text(reply.protagonist, 24);
    const lists: Partial<Record<CardKind, GachaCard[]>> = {item: items};
    for (const k of use) {
      if (k === 'item') continue;
      o.onStep?.(`夜梦正在编纂${KIND_LABEL[k]}池（${plan[k]} 张）`);
      try {const p = kindPrompt(dossier, k, plan, use, protagonist || undefined); lists[k] = parseCards(readReply(await ask(p.system, p.user, opts))[KIND_KEY[k]], k, work.key);}
      catch (e) {if (o.signal?.aborted) throw Error('已取消'); lists[k] = []; warnings.push(`${KIND_LABEL[k]}池没能编纂（${message(e).slice(0, 60)}），已用资料补上`);}
      if (o.signal?.aborted) throw Error('已取消');
    }
    return assemblePool({work, ...(protagonist ? {protagonist} : {}), by: 'model', at: now(), sources: dossier.sources}, lists, use, k => offlineCards(dossier, k));
  }
  return {
    mode: port.mode, contextId: port.contextId, rules,
    settings: () => settings,
    scale: () => scaleOf(settings.scale),
    kinds,
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
    /** 换大池：撒网捞起 99 部作品（替换当前这片书海）。捞到之后才扣命运点数；捞空、失败或取消都不扣。 */
    async cast(themeId: string, o: {onReport?: (r: SourceReport) => void; signal?: AbortSignal} = {}): Promise<GachaSpread> {
      const theme = findTheme(themeId); if (!theme) throw Error('没有这个主题');
      const pay = canPay(castCost()); if (!pay.ok) throw Error(pay.reason ?? '现在不能换大池');
      const {works, reports} = await gatherSpread(theme, {net, rng, nsfw: settings.nsfw, ...(settings.googleKey ? {googleKey: settings.googleKey} : {}), ...(o.signal ? {signal: o.signal} : {}), memo}, {want: SPREAD_SIZE, enabled: settings.sources, ...(o.onReport ? {onReport: o.onReport} : {}), now});
      if (o.signal?.aborted) throw Error('已取消');
      if (!works.length) {const why = reports.map(r => r.error ? `${r.name}：${r.error}` : '').filter(Boolean).join('；'); throw Error('这一网什么也没捞到，没有扣命运点数' + (why ? '（' + why + '）' : '。换个主题，或在设置里多开几个资料库。'));}
      // 扣点之后不再理会取消：已经付过的这一网一定留下。
      if (port.mode === 'host' && pay.cost > 0 && port.commitCast) await port.commitCast({cost: pay.cost, theme: theme.name});
      device = {...device, spread: {themeId, themeName: theme.name, direction: theme.direction, works, reports, at: now()}}; delete device.picked; saveDevice(); notify();
      return device.spread!;
    },
    /** 给没有中文简介的作品补一句中文览概（每 50 部一次请求）。 */
    async overview(keys?: string[], o: {signal?: AbortSignal} = {}): Promise<number> {
      const works = (device.spread?.works ?? []).filter(w => (!keys || keys.includes(w.key)) && !device.overviews[w.key] && !(w.summaryLang === 'zh' && w.overview));
      let done = 0;
      for (let i = 0; i < works.length; i += OVERVIEW_BATCH) {
        const batch = works.slice(i, i + OVERVIEW_BATCH), p = overviewPrompt(batch);
        const raw = await ask(p.system, p.user, {timeoutMs: 120000, purpose: 'overview', ...(o.signal ? {signal: o.signal} : {})});
        if (o.signal?.aborted) throw Error('已取消');
        const got = parseOverviews(raw, batch);
        device = {...device, overviews: {...device.overviews, ...got}}; saveDevice(); notify();
        done += Object.keys(got).length;
      }
      return done;
    },
    pool: (workKey: string) => device.pools[workKey],
    /** 小池张数（只算正在使用的卡池）。 */
    poolSize: (pool: SmallPool) => poolSize(pool, kinds()),
    kindReady,
    picked: () => device.picked,
    pick(workKey: string | undefined) {if (workKey) device = {...device, picked: workKey}; else {const {picked: _p, ...rest} = device; device = rest;} saveDevice(); notify();},
    /** 编纂小池：查资料 → 模型分几次编纂（失败或没有模型时用资料直出）。 */
    async compile(work: WorkCard, o: {onStep?: (label: string) => void; signal?: AbortSignal; offline?: boolean} = {}): Promise<SmallPool> {
      const dossier: Dossier = await buildDossier(work, {net, fandom: settings.fandom, ...(o.signal ? {signal: o.signal} : {})}, o.onStep);
      if (o.signal?.aborted) throw Error('已取消');
      const use = kinds(), warnings: string[] = [];
      let pool: SmallPool;
      if (!o.offline && llmReady()) {
        try {pool = await compileWithModel(work, dossier, use, warnings, o);}
        catch (e) {if (o.signal?.aborted) throw Error('已取消'); warnings.unshift('模型没能编纂（' + message(e).slice(0, 60) + '），已改用资料直出'); pool = offlinePool(dossier, now(), use);}
      } else pool = offlinePool(dossier, now(), use);
      if (o.signal?.aborted) throw Error('已取消');
      // 补写览概时得到的中文译名作为小池标题（入包时也用它）；原来的标题留作原名 / 英文名。
      const ov = device.overviews[work.key], w0 = pool.work;
      if (ov?.zh && ov.zh !== w0.title) {
        const latin = !/[぀-ヿ㐀-鿿]/.test(w0.title), english = w0.english ?? (latin ? w0.title : undefined), original = w0.original ?? (latin ? undefined : w0.title);
        pool = {...pool, work: {...w0, title: ov.zh, ...(original ? {original} : {}), ...(english ? {english} : {})}};
      }
      device = {...device, pools: {...device.pools, [work.key]: pool}, picked: work.key}; saveDevice(); notify();
      for (const w of warnings) o.onStep?.(w);
      return pool;
    },
    wallet,
    pity: () => durable.pity,
    /** 这部作品攒下的抽取点数（大保底）。 */
    points: pointsOf,
    allPoints: () => durable.points,
    history: () => durable.history,
    refresh() {durable = normalizeDurable(safe(() => port.readDurable(), undefined)); notify();},
    cost: costFor,
    canDraw,
    /** 抽卡：先算星级与保底，宿主扣点 / 入包成功后才记下保底、抽取点数与记录。 */
    async draw(workKey: string, kind: CardKind, count: 1 | 10): Promise<DrawOutcome> {
      const pool = device.pools[workKey]; if (!pool) throw Error('先选一部作品编纂小池');
      const bad = kindReady(pool, kind); if (bad) throw Error(bad);
      const check = canDraw(count); if (!check.ok) throw Error(check.reason ?? '现在不能抽卡');
      durable = normalizeDurable(safe(() => port.readDurable(), durable));
      const rolled = drawStars(count, rng, durable.pity, rules);
      // 角色的星级就是这个人在原作里的分量与实力：抽到谁就按谁本来的星级入包，保底按实际抽到的星级推进。
      const cards = rolled.stars.map(s => {const c = pickCard(pool, kind, s); return kind === 'character' ? {...c} : {...c, star: s};});
      let pity = rolled.pity;
      if (cards.some((c, i) => c.star !== rolled.stars[i])) {pity = durable.pity; for (const c of cards) pity = advancePity(pity, c.star);}
      let after = wallet();
      if (port.mode === 'host' && port.commit) after = await port.commit({cost: check.cost, cards, pool, kind, bag: settings.autoBag, scale: scaleOf(settings.scale)});
      const at = now();
      const record: DrawRecord = {id: recordId(at), at, workKey, work: pool.work.title, kind, count, cost: check.cost, results: cards.map(c => ({name: c.name, kind: c.kind, star: c.star})), bagged: port.mode === 'host' && settings.autoBag};
      durable = {version: 1, pity, points: withPoints(durable.points, workKey, pool.work.title, pointsOf(workKey) + cards.length, at), history: [record, ...durable.history].slice(0, HISTORY_LIMIT), updated: at};
      let warning: string | undefined;
      try {await port.writeDurable(durable);} catch (e) {warning = '抽卡已完成，但保底、抽取点数与记录没能写进聊天：' + message(e).slice(0, 60);}
      notify();
      return {cards, stars: cards.map(c => c.star), record, wallet: after, ...(warning ? {warning} : {})};
    },
    canExchange,
    /** 大保底：用这部作品攒下的 200 点抽取点数兑换它小池里指定的一张神话。
     *  先在聊天里扣掉点数，再放进背包；入包失败就把点数退回去，不会白扣，也不会白拿。 */
    async exchange(workKey: string, cardId: string): Promise<DrawOutcome> {
      const pool = device.pools[workKey]; if (!pool) throw Error('先选一部作品编纂小池');
      durable = normalizeDurable(safe(() => port.readDurable(), durable));
      const card = poolMythics(pool, kinds()).find(c => c.id === cardId); if (!card) throw Error('这张神话不在这部作品的小池里');
      const check = canExchange(workKey); if (!check.ok) throw Error(check.reason ?? '现在不能兑换');
      const before = durable, at = now(), bag = port.mode === 'host' && settings.autoBag;
      const record: DrawRecord = {id: recordId(at), at, workKey, work: pool.work.title, kind: card.kind, count: 1, cost: 0, results: [{name: card.name, kind: card.kind, star: 6}], bagged: bag, spark: true};
      const spent: GachaDurable = {...before, points: withPoints(before.points, workKey, pool.work.title, pointsOf(workKey) - rules.spark, at), history: [record, ...before.history].slice(0, HISTORY_LIMIT), updated: at};
      await port.writeDurable(spent);
      durable = spent; notify();
      let after = wallet();
      if (bag && port.commit) {
        try {after = await port.commit({cost: 0, cards: [card], pool, kind: card.kind, bag: true, scale: scaleOf(settings.scale), spark: true});}
        catch (e) {
          durable = before; let note = '';
          try {await port.writeDurable({...before, updated: now()});} catch {note = '；抽取点数也没能退回，请检查聊天后再试';}
          notify(); throw Error('兑换没有完成：' + message(e) + note);
        }
      }
      notify();
      return {cards: [{...card}], stars: [6], record, wallet: after};
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

/** 本机演示 / 没有宿主：保底、抽取点数与记录、缓存、设置都存在这台设备。 */
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
