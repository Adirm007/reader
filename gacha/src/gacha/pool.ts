/** 小池：一部作品被做成可以抽的卡池——物品（多与主角有关）与命运（令人印象深刻的篇章与剧情走向）；设置里打开角色池时再加一个角色池。
 *  合计 54～99 张，各种卡的张数与品质分配由模型按作品决定，不定死；物品池里至少 9 件神话，命运池至少一张神话；角色池里的角色全部是「唯一」。
 *  抽卡时几种卡混在一个池子里抽，不能指定只抽哪一种（见 session.ts）。
 *  正常由模型分几次编纂（先规划张数并写物品，再写命运、角色，最后按世界书细则给物品写属性，见 spec.ts），写得不够时用资料直出的卡补足；
 *  连不上模型时用资料直接拼出一份朴素的小池，保证随时都能抽。 */
import {STARS,UNIQUE,toGrade,type Grade,type Star} from './rarity';
import {dossierText,type Dossier} from './dossier';
import {firstSentence,MEDIA_LABEL,type WorkCard} from './sources';

export type CardKind = 'item' | 'fate' | 'character';
export const CARD_KINDS: readonly CardKind[] = ['item', 'fate', 'character'];
export const KIND_LABEL: Readonly<Record<CardKind, string>> = {item: '物品', fate: '命运', character: '角色'};
/** 模型回复与存档里各种卡所在的字段。 */
export const KIND_KEY: Readonly<Record<CardKind, 'items' | 'fates' | 'characters'>> = {item: 'items', fate: 'fates', character: 'characters'};
/** 按世界书细则写成的物品属性（只有装备、武器、消耗品、资产等抽进背包就能直接用的物品才有；技能书页、命运、角色由正文模型使用时再生成）。 */
export type ItemSpec = {type?: string; tags: string[]; effects: Record<string, string>};
export type GachaCard = {id: string; kind: CardKind; star: Star; name: string; description: string; type?: string; owner?: string; use?: string; chapter?: string; hook?: string; role?: string; power?: string; spec?: ItemSpec};
/** characters：编纂时打开了角色池才有（资料里找不到角色时可能为空）；没有这一项的小池要重新编纂才会有角色池。 */
export type SmallPool = {version: 2; workKey: string; work: WorkCard; protagonist?: string; items: GachaCard[]; fates: GachaCard[]; characters?: GachaCard[]; by: 'model' | 'offline'; at: number; sources: string[]};
/** 小池合计张数（物品 + 命运 [+ 角色]）的下限与上限。 */
export const POOL_MIN = 54, POOL_MAX = 99;
/** 物品池至少这么多件神话（6★）。 */
export const MYTHIC_ITEMS = 9;
/** 每种卡的最少张数：物品、命运 1–6★ 各一张，物品还要放得下 9 件神话；角色至少 6 位（资料里人物不够时可以更少）。 */
export const KIND_MIN: Readonly<Record<CardKind, number>> = {item: MYTHIC_ITEMS + 5, fate: 6, character: 6};
/** 各种卡的张数（没用到的那种为 0）。 */
export type PoolPlan = Record<CardKind, number>;
export const poolKinds = (characters: boolean): CardKind[] => characters ? ['item', 'fate', 'character'] : ['item', 'fate'];
export const poolList = (pool: SmallPool, kind: CardKind): GachaCard[] => kind === 'fate' ? pool.fates : kind === 'character' ? pool.characters ?? [] : pool.items;
export const poolSize = (pool: SmallPool, kinds: readonly CardKind[] = CARD_KINDS) => kinds.reduce((n, k) => n + poolList(pool, k).length, 0);
/** 小池里可以用大保底兑换的神话（只算正在使用的卡池）。 */
export const poolMythics = (pool: SmallPool, kinds: readonly CardKind[] = CARD_KINDS) => kinds.flatMap(k => poolList(pool, k).filter(c => c.star === 6));

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

/* ---------- 编纂提示 ---------- */
const KIND_RULES: Readonly<Record<CardKind, string>> = {
  item: '物品：作品里真实出现的器物——武器、防具、饰品、消耗品（药剂、食物、符咒、弹药等）、材料、资产（住所、店铺、工坊、载具、坐骑、领地、产业等）、记载招式或法术的技能书页、信物、文书、日常小物等。大多数物品要与主角有关，少数可以属于重要配角或反派。star 是品质：1★ 普通、2★ 优良、3★ 稀有、4★ 史诗、5★ 传说、6★ 神话。6★ 神话是作品的象征、主角与关键人物的标志性宝物、与最高潮相连的器物（物品池至少 9 件 6★）；5★ 核心名场面里的重要宝物；4★ 关键章节、重要配角的标志物；3★ 有故事的道具；2★ 常见但有特色的物品；1★ 随处可见的小物。描述写来历与特征（20–60 字），用途写它在故事里能起的作用（10–40 字，不写数值）。技能书页记载作品里的一项招式、法术或技艺，翻开研读即可习得、也可以转赠他人：类型写“技能书页”，只写这项技能的大概。',
  fate: '命运：作品中令人印象深刻的篇章或剧情走向。写出这段剧情的走向与转折，并把它改写成可以降临在玩家身上的“命运”：保留原作情节的骨架与情感，不照搬原文。star 是品质：1★ 普通 … 6★ 神话。6★ 神话是全书最关键的命运转折与最高潮；5★ 核心名场面；4★ 关键章节；3★ 值得回味的情节；2★ 日常插曲；1★ 细碎的小事。描述写剧情走向（30–80 字），契机写这段命运如何降临在玩家身上（15–40 字）。',
  character: '角色：作品里真实登场的人物（有自我意识的非人角色也算）。抽到的角色以书页的形式由玩家持有，实力完全等同原作；一旦被选择具现，便在完全保有自身自由意志的情况下自由行动，玩家无法强制约束。所以要如实写出这个角色在原作中的身份、性格与实力，不削弱也不夸大。角色池里的角色全部是「唯一」品质：不分星级，每个角色只会被抽到一次。按角色在原作中的分量从主到次排列：主角、最终对手、作品里最强或最核心的人物在前，主要角色、重要配角居中，次要角色与龙套在后。定位写 2–8 字（如主角、宿敌、导师、同伴），描述写身份、性格与在故事里的位置（30–80 字），实力写原作中的能力与强弱（15–50 字，不写数值）。',
};
const KIND_FORMAT: Readonly<Record<CardKind, string>> = {
  item: '{"name":"","star":6,"type":"武器/防具/饰品/消耗品/材料/资产/技能书页/道具/信物/文书","owner":"所属角色","description":"","use":""}',
  fate: '{"name":"","star":6,"chapter":"对应篇章或卷章","description":"","hook":""}',
  character: '{"name":"","role":"定位","description":"","power":""}',
};
const COMMON_RULES = '要求：只依据给出的资料与你确实了解的原作内容，不编造原作没有的角色、道具与情节；资料不足时宁可写得朴素。不要引用原作的大段文字，一律用你自己的话。名称 2–14 个字，同一池内不重复。只输出一个 JSON 对象，不要解释、不要 Markdown 代码块。';
const kindNames = (kinds: readonly CardKind[]) => kinds.map(k => KIND_LABEL[k]).join('、');
function systemFor(kinds: readonly CardKind[], focus: CardKind): string {
  return [
    `你是「命运抽卡」的小池编纂人。玩家从书海里捞起了一部作品，要把它做成供角色扮演（AIRP）使用的卡池，卡牌分 ${kinds.length} 种：${kindNames(kinds)}。这一次只写其中的${KIND_LABEL[focus]}。`,
    KIND_RULES[focus],
    COMMON_RULES,
  ].join('\n');
}
/** 第一次请求：规划各种卡的张数，并写出全部物品。 */
export function planPrompt(d: Dossier, kinds: readonly CardKind[]): {system: string; user: string} {
  const others = kinds.filter(k => k !== 'item'), plan = kinds.map(k => `"${KIND_KEY[k]}":0`).join(',');
  return {
    system: systemFor(kinds, 'item'),
    user: [
      dossierText(d),
      '',
      `这个小池包含${kindNames(kinds)}，合计 ${POOL_MIN}–${POOL_MAX} 张，由你按这部作品的体量决定：篇幅长、名物多、名场面多、人物多的作品多一些，短篇少一些；各种卡的张数不必相同。物品与命运 1–6★ 各至少一张；物品池至少 ${MYTHIC_ITEMS} 件 6★，命运池至少 1 张 6★；其余星级怎么分配也由你按作品决定，一般星级越高越少。${kinds.includes('character') ? '角色全部是唯一品质，不分星级。' : ''}`,
      `先在 plan 里写出各种卡的张数，再写出全部物品（件数与 plan.items 一致）；${kindNames(others)}稍后另行编纂，这次不写。`,
      `JSON 格式：{"protagonist":"主角名","plan":{${plan}},"items":[${KIND_FORMAT.item}]}`,
    ].join('\n'),
  };
}
/** 之后每种卡一次请求：按规划的张数写出命运或角色。 */
export function kindPrompt(d: Dossier, kind: CardKind, plan: PoolPlan, kinds: readonly CardKind[], protagonist?: string): {system: string; user: string} {
  const total = kinds.reduce((n, k) => n + plan[k], 0), split = kinds.map(k => `${KIND_LABEL[k]} ${plan[k]} 张`).join('、');
  return {
    system: systemFor(kinds, kind),
    user: [
      dossierText(d),
      '',
      `这个小池合计 ${total} 张（${split}）${protagonist ? `，主角是${protagonist}` : ''}。` + (kind === 'character'
        ? `现在写出全部角色，共 ${plan[kind]} 位：全部是唯一品质，不写星级，按在原作中的分量从主到次排列。`
        : `现在写出全部${KIND_LABEL[kind]}，共 ${plan[kind]} 张：1–6★ 各至少一张，至少 1 张 6★，星级怎么分配由你按作品决定。`),
      `JSON 格式：{"${KIND_KEY[kind]}":[${KIND_FORMAT[kind]}]}`,
    ].join('\n'),
  };
}
/** 模型规划的张数：每种不少于下限，合计压到 54–99；没给的按常见比例补上。 */
export function normalizePlan(raw: unknown, kinds: readonly CardKind[]): PoolPlan {
  const r = rec(raw), plan: PoolPlan = {item: 0, fate: 0, character: 0};
  const usual: PoolPlan = kinds.includes('character') ? {item: 30, fate: 24, character: 18} : {item: 32, fate: 28, character: 0};
  for (const k of kinds) {const n = Math.round(Number(r[KIND_KEY[k]] ?? r[k])); plan[k] = Math.max(KIND_MIN[k], Number.isFinite(n) && n > 0 ? n : usual[k]);}
  const sum = () => kinds.reduce((n, k) => n + plan[k], 0);
  while (sum() > POOL_MAX) {const k = kinds.reduce((a, b) => plan[b] - KIND_MIN[b] > plan[a] - KIND_MIN[a] ? b : a); plan[k] -= 1;}
  while (sum() < POOL_MIN) {const k = kinds.reduce((a, b) => plan[b] / usual[b] < plan[a] / usual[a] ? b : a); plan[k] += 1;}
  return plan;
}

/* ---------- 解析 ---------- */
/** 从模型回复里取出 JSON（允许外面包了代码块或多余文字）。 */
export function extractJson(raw: string): unknown {
  const text = String(raw ?? '').replace(/^﻿/, '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw Error('回复里没有 JSON');
  const body = text.slice(start, end + 1);
  try {return JSON.parse(body);}
  catch {return JSON.parse(repairJson(body));}
}
const repairJson = (body: string) => body.replace(/,\s*([}\]])/g, (_m: string, close: string) => close).replace(/[“”]/g, '"');
/** 回复被截断时：取出某个数组字段里每一个完整的对象（字符串里的括号不算）。 */
export function salvageArray(raw: string, key: string): unknown[] {
  const text = String(raw ?? ''), m = new RegExp('"' + key + '"\\s*:\\s*\\[').exec(text), out: unknown[] = [];
  if (!m) return out;
  let i = m.index + m[0].length;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ']') break;
    if (ch !== '{') {i++; continue;}
    let depth = 0, quoted = false, escaped = false, j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (quoted) {if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue;}
      if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    if (j >= text.length) break;
    const body = text.slice(i, j + 1);
    try {out.push(JSON.parse(body));} catch {try {out.push(JSON.parse(repairJson(body)));} catch {/* 坏掉的一张跳过 */}}
    i = j + 1;
  }
  return out;
}
/** 读模型回复：完整的 JSON 直接解析；被截断时，能取出多少张完整的卡就取多少。 */
export function readReply(raw: string): Record<string, unknown> {
  try {return rec(extractJson(raw));} catch {
    const text = String(raw ?? ''), out: Record<string, unknown> = {};
    const hero = /"protagonist"\s*:\s*"([^"]{0,40})"/.exec(text); if (hero) out.protagonist = hero[1];
    const plan = /"plan"\s*:\s*(\{[^{}]*\})/.exec(text); if (plan) {try {out.plan = JSON.parse(repairJson(plan[1]!));} catch {/* 没有规划就按常见比例 */}}
    for (const k of Object.values(KIND_KEY)) {const list = salvageArray(text, k); if (list.length) out[k] = list;}
    if (!Object.keys(out).length) throw Error('回复里没有 JSON');
    return out;
  }
}
function cardFrom(v: unknown, kind: CardKind, index: number, workKey: string): GachaCard | undefined {
  const r = rec(v), name = clean(r.name, 16), description = clean(r.description, kind === 'fate' ? 220 : kind === 'character' ? 200 : 160);
  if (!name || !description) return undefined;
  // 角色全部是唯一；物品与命运只认 1–6。
  const base: GachaCard = {id: `${workKey}#${kind}${index}`, kind, star: kind === 'character' ? UNIQUE : toGrade(r.star ?? r.stars, 1), name, description};
  if (kind === 'item') {const type = clean(r.type, 8), owner = clean(r.owner, 16), use = clean(r.use, 120), spec = normalizeSpec(r.spec); return {...base, ...(type ? {type} : {}), ...(owner ? {owner} : {}), ...(use ? {use} : {}), ...(spec ? {spec} : {})};}
  if (kind === 'character') {const role = clean(r.role, 10), power = clean(r.power ?? r.ability, 120); return {...base, ...(role ? {role} : {}), ...(power ? {power} : {})};}
  const chapter = clean(r.chapter, 24), hook = clean(r.hook, 120);
  return {...base, ...(chapter ? {chapter} : {}), ...(hook ? {hook} : {})};
}
/** 存档或模型给的物品属性：类型、标签与“效果名: 效果”。什么都没有时不算。 */
export function normalizeSpec(raw: unknown): ItemSpec | undefined {
  const r = rec(raw), type = clean(r.type ?? r.类型, 12);
  const tags = (Array.isArray(r.tags ?? r.标签) ? (r.tags ?? r.标签) as unknown[] : []).map(t => clean(t, 60)).filter(Boolean).slice(0, 12);
  const effects: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(r.effects ?? r.效果)).slice(0, 16)) {
    const key = clean(k, 24), value = clean(typeof v === 'string' || typeof v === 'number' ? v : JSON.stringify(v), 400);
    if (key && value) effects[key] = value;
  }
  return Object.keys(effects).length ? {...(type ? {type} : {}), tags, effects} : undefined;
}
/** 一种卡的原始列表 → 卡牌（去掉缺名字、缺描述与重名的）。 */
export function parseCards(list: unknown, kind: CardKind, workKey: string): GachaCard[] {
  const seen = new Set<string>(), out: GachaCard[] = [];
  (Array.isArray(list) ? list : []).forEach((y, i) => {const c = cardFrom(y, kind, i, workKey); if (c && !seen.has(c.name)) {seen.add(c.name); out.push(c);}});
  return out;
}

/* ---------- 整理成小池 ---------- */
/** 保证每个星级都有牌：缺的星级从相邻且有富余的星级挪一张过来（高星从下往上借，低星从上往下借）。 */
export function fillTiers(cards: GachaCard[]): GachaCard[] {
  const out = cards.map(c => ({...c}));
  for (const s of [...STARS].reverse()) {
    if (out.some(c => c.star === s)) continue;
    const order = s >= 4 ? [s - 1, s - 2, s + 1, s - 3, s - 4, s + 2] : [s + 1, s - 1, s + 2, s + 3, s - 2, s + 4];
    for (const from of order) {
      const pool = out.filter(c => c.star === from);
      if (pool.length >= 2) {pool[0]!.star = s; break;}
    }
  }
  return out;
}
/** 神话不足 want 张时，依次把 5★、4★……的牌提上来（按原来的顺序，越靠前越先提）；每个星级至少留一张。 */
export function liftMythics(cards: GachaCard[], want: number): GachaCard[] {
  const out = cards.map(c => ({...c})), count = (s: Star) => out.filter(c => c.star === s).length;
  for (const from of [5, 4, 3, 2, 1] as const) for (const c of out) {
    if (count(6) >= want) return out;
    if (c.star === from && count(from) > 1) c.star = 6;
  }
  return out;
}
/** 整理一种卡：补齐星级；物品补足 9 件神话；没有 6★ 时把星级最高的那张提上来；按星级从高到低排（同星保持原顺序）。
 *  角色全部是唯一，保持模型给的顺序（从主到次）。 */
export function shapeCards(cards: GachaCard[], kind: CardKind): GachaCard[] {
  if (kind === 'character') return cards.map(c => ({...c, star: UNIQUE}));
  let out = fillTiers(cards);
  if (kind === 'item') out = liftMythics(out, MYTHIC_ITEMS);
  out.sort((a, b) => b.star - a.star);
  if (out.length && out[0]!.star !== 6) out[0] = {...out[0]!, star: 6};
  return out;
}
export type PoolBase = {work: WorkCard; protagonist?: string; by: 'model' | 'offline'; at: number; sources: string[]};
/** 把各种卡拼成小池：每种卡不少于下限、物品里至少 9 件神话、合计 54–99 张。
 *  写得不够时从 extra 给出的候选里补（资料直出的卡，按优先顺序；角色只用资料里真有的人物，不凑数）；
 *  写多了先去掉张数最多的那种里的低星卡，每个星级至少留一张。 */
export function assemblePool(base: PoolBase, lists: Partial<Record<CardKind, GachaCard[]>>, kinds: readonly CardKind[], extra: (kind: CardKind) => GachaCard[] = () => []): SmallPool {
  const out = {} as Record<CardKind, GachaCard[]>, spare = {} as Record<CardKind, GachaCard[]>;
  for (const k of kinds) {
    const names = new Set<string>(), list: GachaCard[] = [];
    for (const c of lists[k] ?? []) if (c.kind === k && !names.has(c.name)) {names.add(c.name); list.push(c);}
    out[k] = list; spare[k] = extra(k).filter(c => c.kind === k && !names.has(c.name));
  }
  const sum = () => kinds.reduce((n, k) => n + out[k].length, 0);
  const take = (k: CardKind) => {const c = spare[k].shift(); if (!c) return false; if (!out[k].some(x => x.name === c.name)) out[k].push(c); return true;};
  for (const k of kinds) while (out[k].length < KIND_MIN[k] && take(k)) {/* 补到这种卡的下限 */}
  while (sum() < POOL_MIN) {
    const k = kinds.filter(k => spare[k].length).sort((a, b) => out[a].length / KIND_MIN[a] - out[b].length / KIND_MIN[b])[0];
    if (!k || !take(k)) break;
  }
  for (const k of kinds) out[k] = shapeCards(out[k], k);
  while (sum() > POOL_MAX) {
    const k = kinds.filter(k => out[k].length > KIND_MIN[k]).sort((a, b) => out[b].length - out[a].length)[0];
    if (!k) break;
    const list = out[k], count = (s: Star) => list.filter(c => c.star === s).length;
    // 角色从主到次排，多了就去掉最后面的。
    if (k === 'character') {list.pop(); continue;}
    const star = STARS.find(s => count(s) > 1 && !(k === 'item' && s === 6 && count(6) <= MYTHIC_ITEMS));
    if (!star) break;
    let at = -1; for (let i = list.length - 1; i >= 0; i--) if (list[i]!.star === star) {at = i; break;}
    list.splice(at, 1);
  }
  return {version: 2, workKey: base.work.key, work: base.work, ...(base.protagonist ? {protagonist: base.protagonist} : {}), items: out.item, fates: out.fate,
    ...(kinds.includes('character') ? {characters: out.character} : {}), by: base.by, at: base.at, sources: base.sources};
}
/** 一次回复里同时带着各种卡时的解析（测试与手动导入用）；编纂时由服务层分几次请求再拼起来。 */
export function parsePool(raw: string, work: WorkCard, sources: string[], at = Date.now(), kinds: readonly CardKind[] = poolKinds(false), extra?: (kind: CardKind) => GachaCard[]): SmallPool {
  const v = readReply(raw), lists: Partial<Record<CardKind, GachaCard[]>> = {};
  for (const k of kinds) lists[k] = parseCards(v[KIND_KEY[k]], k, work.key);
  const items = lists.item?.length ?? 0, fates = lists.fate?.length ?? 0;
  if (items < 6 || fates < 6) throw Error(`小池太小（物品 ${items}、命运 ${fates}），请重新编纂`);
  const protagonist = clean(v.protagonist, 24);
  return assemblePool({work, ...(protagonist ? {protagonist} : {}), by: 'model', at, sources}, lists, kinds, extra);
}

/* ---------- 资料直出 ---------- */
type Filler = readonly [Star, string, string, string];
const ITEM_FILLERS = (t: string, author?: string): Filler[] => [
  [6, `《${t}》的封面`, `整部《${t}》都封存在这张封面之下，翻开它就能看见故事的开端。`, '道具'],
  [6, '终章手稿', `《${t}》最后一章的手稿，墨迹还没有干。`, '文书'],
  [6, '序章手稿', `《${t}》第一章的手稿，故事从这里起笔。`, '文书'],
  [6, author ? `${author}的笔` : '作者的笔', `写下《${t}》的那支笔，笔尖还留着最后一个句点。`, '信物'],
  [6, '书海罗盘', `指向《${t}》在书海中的位置，迷途时总能找回这部作品。`, '法器'],
  [6, '金色书签', `夹在《${t}》最精彩的那一页，会自己发出微光。`, '信物'],
  [6, '装帧之线', `把《${t}》的书页缝在一起的线，能把散落的情节重新串起来。`, '道具'],
  [6, '藏书印', `盖在《${t}》扉页上的藏书印，印下的人便成了这本书的主人。`, '信物'],
  [6, '书灵之烛', `点燃时，《${t}》里的场景会在烛光中浮现片刻。`, '法器'],
  [5, '初版之书', `《${t}》的初版，纸页里夹着最初的那份心意。`, '道具'],
  [5, '作者手札', `写《${t}》时留下的手札，记着没写进正文的设想。`, '文书'],
  [5, '书海的地图', `标出了《${t}》每一章所在海域的地图。`, '道具'],
  [4, '绝版插图', `《${t}》早已绝版的一张插图，画的是书里最动人的一幕。`, '道具'],
  [4, '书海的潮音', `贝壳里能听见《${t}》的书页翻动的声音。`, '法器'],
  [4, '签名页', `《${t}》签名本的扉页，签名旁还画了个小小的记号。`, '文书'],
  [4, '旧书箱', `装过《${t}》的旧书箱，木板上留着书的形状。`, '道具'],
  [3, '褪色的封面', `《${t}》的旧封面，颜色已经褪去大半。`, '道具'],
  [3, '卷首语', `《${t}》的卷首语，短短几行便定下了全书的调子。`, '文书'],
  [3, '借书卡', `《${t}》的借书卡，上面写满了历任读者的名字。`, '道具'],
  [3, '书脊烫金', `从《${t}》书脊上剥落的一小片烫金。`, '道具'],
  [3, '书顶的薄灰', `落在《${t}》书顶上的薄灰，吹开时能看见书名。`, '消耗品'],
  [2, '旧书的扉页', `《${t}》的扉页，边角有些发黄。`, '道具'],
  [2, '读者的批注', `某位读者写在《${t}》页边的批注。`, '文书'],
  [2, '夹页里的花', `夹在《${t}》书页间的一朵干花。`, '道具'],
  [2, '布书套', `护着《${t}》的布书套，洗得有些发白。`, '服饰'],
  [1, '泛黄的书页残片', `《${t}》某一页的残片，边角已经卷起。`, '道具'],
  [1, '书海的浮沫', '从书海里一起捞上来的细碎字句，很快就会消散。', '消耗品'],
  [1, '折角', `《${t}》某一页上的折角，标着上次读到的地方。`, '道具'],
  [1, '铅笔头', `读《${t}》时用来做记号的铅笔头。`, '道具'],
];
const FATE_FILLERS = (t: string): Filler[] => [
  [6, '终章之后', `合上《${t}》的最后一页，你会发现故事还在继续。`, '读完一部作品的那一刻。'],
  [5, '最高潮', '故事最激烈的那一夜，你也在场。', '当一切都被推到极限时。'],
  [5, '抉择', `你必须在两条路之间选一条，像《${t}》里的人物那样。`, '无路可退的时候。'],
  [5, '命运的伏笔', '很早以前埋下的一句话，此刻终于有了回响。', '旧物重新出现时。'],
  [4, '终章的预感', `你隐约感到，《${t}》的结局正在靠近。`, '夜深人静时。'],
  [4, '誓约', '一句郑重的承诺，把你和某个人的命运系在了一起。', '有人向你伸出手时。'],
  [4, '背叛', '信任的人转过身去，故事从此换了颜色。', '一切看似顺利时。'],
  [4, '群像', '许多人的命运在同一刻交汇，你也是其中一人。', '人群聚集的地方。'],
  [3, '擦肩而过', `在《${t}》的故事里，你与某人擦肩而过。`, '某个寻常的时刻。'],
  [3, '意外的来信', '一封不知从哪里寄来的信，落款是书里的人。', '整理信箱时。'],
  [3, '重逢', '多年不见的人又站在了你面前。', '回到旧地时。'],
  [3, '告别', '有人要走了，你还来得及说再见。', '车站、港口或城门前。'],
  [3, '谜题', '一个没有答案的问题，等着你去解开。', '发现奇怪的记号时。'],
  [3, '旧约', '很久以前的约定，今天到了兑现的时候。', '翻到旧日记时。'],
  [2, '序章的雨', `《${t}》开头的那场雨，也落在了你身上。`, '下雨的清晨。'],
  [2, '迷路的书页', '一页不属于任何章节的书页，把你带到了陌生的地方。', '走错路时。'],
  [2, '远行', '你收拾行囊，踏上了一段不算长的旅程。', '天气晴好的早上。'],
  [2, '归来', '你回到出发的地方，发现一切都有了一点不同。', '旅途结束时。'],
  [2, '雨夜', '雨下了一整夜，有人敲响了你的门。', '雨夜。'],
  [1, '翻错的一页', `你以为翻到了下一章，其实只是《${t}》里一段平静的日常。`, '某个无事发生的午后。'],
  [1, '书签掉落', '一张书签从书里滑出，指向你还没读到的地方。', '整理行囊时。'],
  [1, '夜读', '灯下多读了一页，第二天的事便有了一点不同。', '睡前。'],
  [1, '风起', '一阵风翻动了书页，停在某一章。', '窗边。'],
  [1, '茶凉了', '读得入神，茶已经凉了，故事却刚刚开始。', '午后。'],
];
/** 资料直出的候选卡（按优先顺序）：角色 → 物品与角色牌，剧情章节 → 命运，再用书海的通用器物与命运补足。朴素，但足够凑满一个小池。
 *  角色只取资料里真有的人物，不凑数。 */
export function offlineCards(d: Dossier, kind: CardKind): GachaCard[] {
  const w = d.work, t = w.title, out: GachaCard[] = [];
  const add = (star: Star, name: string, description: string, extra: Partial<GachaCard> = {}) => {
    const n = name.slice(0, 16); if (!n || out.some(c => c.name === n)) return;
    out.push({id: `${w.key}#${kind}x${out.length}`, kind, star, name: n, description: description.slice(0, 200), ...extra});
  };
  if (kind === 'character') {
    d.characters.forEach(c => {
      add(UNIQUE, c.name, c.description ? firstSentence(c.description, 80) : `《${t}》中的${c.role}。`, {role: c.role});
    });
    return out;
  }
  if (kind === 'item') {
    add(6, `《${t}》原典之页`, `从书海深处捞起的《${t}》的一页原典，纸上的字还在缓缓流动。`, {type: '信物', use: `握着它时，故事会向《${t}》的世界倾斜。`});
    d.characters.slice(0, 10).forEach((c, i) => {
      const star: Star = (c.role === '主角' || c.role === '主要角色') && i < 4 ? 6 : c.role === '主要角色' ? 5 : c.role === '配角' ? (i < 6 ? 4 : 3) : 2;
      add(star, `${c.name}的信物`, c.description ? `属于${c.name}的随身之物。${firstSentence(c.description, 60)}` : `${c.name}留下的随身之物，带着那个人的气息。`, {type: '信物', owner: c.name});
    });
    for (const s of d.sections.slice(0, 3)) add(4, `「${s.heading}」残页`, `《${t}》里写着「${s.heading}」的一页残稿。${firstSentence(s.text, 50)}`, {type: '文书'});
    for (const tag of (w.tags ?? []).slice(0, 4)) add(2, `「${tag}」书签`, `夹在《${t}》里的书签，上面写着「${tag}」。`, {type: '道具'});
    for (const [star, name, description, type] of ITEM_FILLERS(t, w.creators?.[0])) add(star, name, description, {type});
    return out;
  }
  const paragraphs = [d.synopsis, ...d.sections.filter(s => s.text).map(s => s.text)].join('\n').split(/\n+/).map(p => p.trim()).filter(p => p.length >= 30).slice(0, 14);
  add(6, `《${t}》的命运`, d.synopsis ? firstSentence(d.synopsis, 100) : `${MEDIA_LABEL[w.media]}《${t}》的故事，将以你为主角重演。`, {hook: '翻开这一页，你会被卷进这部作品的主线。'});
  paragraphs.forEach((p, i) => {
    const star: Star = i === paragraphs.length - 1 ? 5 : i === 0 ? 2 : i < 3 ? 3 : 4;
    add(star, `第${i + 1}页的走向`, firstSentence(p, 110), {chapter: `资料第 ${i + 1} 段`, hook: '当相似的处境出现在你面前时，这一段命运便会降临。'});
  });
  const hero = d.characters.find(c => c.role === '主角') ?? d.characters[0];
  if (hero) add(4, `与${hero.name}相遇`, `你在某个转角遇见了${hero.name}，故事由此改变方向。`, {hook: '在陌生的地方迷路时。'});
  for (const [star, name, description, hook] of FATE_FILLERS(t)) add(star, name, description, {hook});
  return out;
}
/** 资料直出小池的形状：物品 30（9 件神话）+ 命运 24 = 54 张；打开角色池时再加上资料里的人物。 */
export const OFFLINE_SHAPE: Readonly<Record<'item' | 'fate', Readonly<Record<Grade, number>>>> = {
  item: {6: 9, 5: 4, 4: 5, 3: 5, 2: 4, 1: 3},
  fate: {6: 2, 5: 3, 4: 4, 3: 5, 2: 6, 1: 4},
};
function pickShape(cands: GachaCard[], shape: Readonly<Record<Grade, number>>): GachaCard[] {
  const want = STARS.reduce((n, s) => n + shape[s], 0), picked: GachaCard[] = [];
  for (const s of [...STARS].reverse()) picked.push(...cands.filter(c => c.star === s).slice(0, shape[s]));
  for (const c of cands) {if (picked.length >= want) break; if (!picked.includes(c)) picked.push(c);}
  return picked;
}
/** 没有模型时的小池：朴素，但每一张都来自资料本身或书海，张数与神话也守着小池的规矩。 */
export function offlinePool(d: Dossier, at = Date.now(), kinds: readonly CardKind[] = poolKinds(false)): SmallPool {
  const hero = d.characters.find(c => c.role === '主角') ?? d.characters[0];
  const lists: Partial<Record<CardKind, GachaCard[]>> = {item: pickShape(offlineCards(d, 'item'), OFFLINE_SHAPE.item), fate: pickShape(offlineCards(d, 'fate'), OFFLINE_SHAPE.fate)};
  if (kinds.includes('character')) lists.character = offlineCards(d, 'character');
  return assemblePool({work: d.work, ...(hero ? {protagonist: hero.name} : {}), by: 'offline', at, sources: d.sources}, lists, kinds, k => offlineCards(d, k));
}
/** 校验一份已保存的小池（读取缓存时用）。旧版（物品与命运各 18 张）的缓存不再使用，需要重新编纂。 */
export function normalizePool(raw: unknown): SmallPool | undefined {
  const v = rec(raw), work = rec(v.work);
  if (v.version !== 2 || typeof v.workKey !== 'string' || typeof work.key !== 'string' || typeof work.title !== 'string') return undefined;
  const list = (x: unknown, kind: CardKind) => (Array.isArray(x) ? x : []).map((y, i) => {const c = cardFrom(y, kind, i, String(v.workKey)); const id = rec(y).id; return c && typeof id === 'string' ? {...c, id: id.slice(0, 160)} : c;}).filter((c): c is GachaCard => !!c);
  const items = list(v.items, 'item'), fates = list(v.fates, 'fate');
  if (!items.length || !fates.length) return undefined;
  return {version: 2, workKey: String(v.workKey), work: work as unknown as WorkCard, ...(typeof v.protagonist === 'string' ? {protagonist: clean(v.protagonist, 24)} : {}), items, fates,
    ...(Array.isArray(v.characters) ? {characters: list(v.characters, 'character')} : {}), by: v.by === 'offline' ? 'offline' : 'model', at: Number(v.at) || 0, sources: (Array.isArray(v.sources) ? v.sources : []).map(s => clean(s, 24)).filter(Boolean)};
}

/* ---------- 一句话览概（批量） ---------- */
export function overviewPrompt(works: readonly WorkCard[]): {system: string; user: string} {
  const rows = works.map(w => ({k: w.key, t: w.title, o: w.original ?? w.english ?? '', y: w.year ?? '', m: MEDIA_LABEL[w.media], s: (w.summary ?? '').slice(0, 320)}));
  return {
    system: '你为「命运抽卡」写作品卡片：给每部作品写一句中文览概（不超过 60 字，说清类型、主角与核心冲突，不剧透结局），并给出通行的中文译名（没有通行译名就留空）。只依据给出的资料与你确实了解的内容；不了解的作品就根据资料朴素地概括。只输出 JSON。',
    user: '作品：' + JSON.stringify(rows) + '\n输出格式：{"<k>":{"zh":"中文译名","overview":"一句话览概"}}',
  };
}
export function parseOverviews(raw: string, works: readonly WorkCard[]): Record<string, {zh?: string; overview: string}> {
  const v = rec(extractJson(raw)), out: Record<string, {zh?: string; overview: string}> = {};
  for (const w of works) {
    const r = rec(v[w.key]), overview = clean(r.overview, 90), zh = clean(r.zh, 40);
    if (overview) out[w.key] = {overview, ...(zh && zh !== w.title ? {zh} : {})};
  }
  return out;
}
