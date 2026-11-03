/** 小池：一部作品被做成可以抽的卡池——物品（多与主角有关）与命运（令人印象深刻的篇章与剧情走向）。
 *  正常由模型依据资料编纂；连不上模型时，用资料直接拼出一份朴素的小池，保证随时都能抽。 */
import {STARS,toStar,type Star} from './rarity';
import {dossierText,type Dossier} from './dossier';
import {firstSentence,MEDIA_LABEL,type WorkCard} from './sources';

export type CardKind = 'item' | 'fate';
export const KIND_LABEL: Readonly<Record<CardKind, string>> = {item: '物品', fate: '命运'};
export type GachaCard = {id: string; kind: CardKind; star: Star; name: string; description: string; type?: string; owner?: string; use?: string; chapter?: string; hook?: string};
export type SmallPool = {version: 1; workKey: string; work: WorkCard; protagonist?: string; items: GachaCard[]; fates: GachaCard[]; by: 'model' | 'offline'; at: number; sources: string[]};
/** 每种卡 18 张：6★×1 5★×2 4★×3 3★×4 2★×4 1★×4。 */
export const POOL_SHAPE: Readonly<Record<Star, number>> = {6: 1, 5: 2, 4: 3, 3: 4, 2: 4, 1: 4};
export const POOL_SIZE = STARS.reduce((n, s) => n + POOL_SHAPE[s], 0);

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

export function poolPrompt(d: Dossier, shape: Readonly<Record<Star, number>> = POOL_SHAPE): {system: string; user: string} {
  const count = STARS.slice().reverse().map(s => `${s}★×${shape[s]}`).join('、'), total = STARS.reduce((n, s) => n + shape[s], 0);
  const system = [
    '你是「命运抽卡」的小池编纂人。玩家从书海里捞起了一部作品，要把它做成供角色扮演（AIRP）使用的卡池。卡牌分两种：',
    '一、物品：作品里真实出现的器物——武器、信物、服饰、书信、法器、日常小物、象征物等。大多数物品要与主角有关，少数可以属于重要配角或反派。',
    '二、命运：作品中令人印象深刻的篇章或剧情走向。写出这段剧情的走向与转折，并把它改写成可以降临在玩家身上的“命运”：保留原作情节的骨架与情感，不照搬原文。',
    '星级 1–6：6★ 是作品的象征与最高潮（主角的标志性宝物、全书最关键的命运转折）；5★ 核心名场面与主角的重要宝物；4★ 关键章节、重要配角的标志物；3★ 值得回味的情节、有故事的道具；2★ 日常插曲、常见但有特色的物品；1★ 细碎的小事、随处可见的小物。',
    '要求：只依据给出的资料与你确实了解的原作内容，不编造原作没有的角色、道具与情节；资料不足时宁可写得朴素。不要引用原作的大段文字，一律用你自己的话。名称 2–14 个字，同一池内不重复。物品描述写来历与特征（30–80 字），用途写它在故事里能起的作用（不写数值）；命运描述写剧情走向（40–100 字），契机写这段命运如何降临在玩家身上（20–60 字）。',
    '只输出一个 JSON 对象，不要解释、不要 Markdown 代码块。',
  ].join('\n');
  const user = [
    dossierText(d),
    '',
    `请为这部作品编纂小池：物品与命运各 ${total} 张，每种的星级数量为 ${count}。`,
    'JSON 格式：{"protagonist":"主角名","items":[{"name":"","star":6,"type":"武器/饰品/道具/服饰/文书/法器/信物/消耗品","owner":"所属角色","description":"","use":""}],"fates":[{"name":"","star":6,"chapter":"对应篇章或卷章","description":"","hook":""}]}',
  ].join('\n');
  return {system, user};
}
/** 从模型回复里取出 JSON（允许外面包了代码块或多余文字）。 */
export function extractJson(raw: string): unknown {
  const text = String(raw ?? '').replace(/^﻿/, '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw Error('回复里没有 JSON');
  const body = text.slice(start, end + 1);
  try {return JSON.parse(body);}
  catch {return JSON.parse(body.replace(/,\s*([}\]])/g, (_m: string, close: string) => close).replace(/[“”]/g, '"'));}
}
function cardFrom(v: unknown, kind: CardKind, index: number, workKey: string): GachaCard | undefined {
  const r = rec(v), name = clean(r.name, 16), description = clean(r.description, kind === 'item' ? 160 : 220);
  if (!name || !description) return undefined;
  const base: GachaCard = {id: `${workKey}#${kind}${index}`, kind, star: toStar(r.star ?? r.stars, 1), name, description};
  if (kind === 'item') {const type = clean(r.type, 8), owner = clean(r.owner, 16), use = clean(r.use, 120); return {...base, ...(type ? {type} : {}), ...(owner ? {owner} : {}), ...(use ? {use} : {})};}
  const chapter = clean(r.chapter, 24), hook = clean(r.hook, 120);
  return {...base, ...(chapter ? {chapter} : {}), ...(hook ? {hook} : {})};
}
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
export function parsePool(raw: string, work: WorkCard, sources: string[], at = Date.now()): SmallPool {
  const v = rec(extractJson(raw));
  const list = (x: unknown, kind: CardKind) => {
    const seen = new Set<string>(), out: GachaCard[] = [];
    (Array.isArray(x) ? x : []).forEach((y, i) => {const c = cardFrom(y, kind, i, work.key); if (c && !seen.has(c.name)) {seen.add(c.name); out.push(c);}});
    return fillTiers(out).sort((a, b) => b.star - a.star);
  };
  const items = list(v.items, 'item'), fates = list(v.fates, 'fate');
  if (items.length < 6 || fates.length < 6) throw Error(`小池太小（物品 ${items.length}、命运 ${fates.length}），请重新编纂`);
  const protagonist = clean(v.protagonist, 24);
  return {version: 1, workKey: work.key, work, ...(protagonist ? {protagonist} : {}), items, fates, by: 'model', at, sources};
}
/** 没有模型时的小池：角色 → 物品，剧情章节 → 命运。朴素，但每一张都来自资料本身。 */
export function offlinePool(d: Dossier, at = Date.now()): SmallPool {
  const w = d.work, key = w.key, hero = d.characters.find(c => c.role === '主角') ?? d.characters[0];
  const items: GachaCard[] = [], fates: GachaCard[] = [];
  const add = (list: GachaCard[], kind: CardKind, star: Star, name: string, description: string, extra: Partial<GachaCard> = {}) => {
    if (list.some(c => c.name === name)) return; list.push({id: `${key}#${kind}${list.length}`, kind, star, name: name.slice(0, 16), description: description.slice(0, 200), ...extra});
  };
  add(items, 'item', 6, `《${w.title}》原典之页`.slice(0, 16), `从书海深处捞起的《${w.title}》的一页原典，纸上的字还在缓缓流动。`, {type: '信物', use: '握着它时，故事会向《' + w.title + '》的世界倾斜。'});
  d.characters.slice(0, 8).forEach((c, i) => {
    const star: Star = c.role === '主角' ? (i === 0 ? 5 : 4) : c.role === '主要角色' ? 4 : c.role === '配角' ? 3 : 2;
    add(items, 'item', star, `${c.name}的信物`, c.description ? `属于${c.name}的随身之物。${firstSentence(c.description, 60)}` : `${c.name}留下的随身之物，带着那个人的气息。`, {type: '信物', owner: c.name});
  });
  for (const t of (w.tags ?? []).slice(0, 4)) add(items, 'item', 2, `「${t}」书签`, `夹在《${w.title}》里的书签，上面写着「${t}」。`, {type: '道具'});
  add(items, 'item', 1, '泛黄的书页残片', `《${w.title}》某一页的残片，边角已经卷起。`, {type: '道具'});
  add(items, 'item', 1, '书海的浮沫', '从书海里一起捞上来的细碎字句，很快就会消散。', {type: '消耗品'});
  const paragraphs = [d.synopsis, ...d.sections.filter(s => s.text).map(s => s.text)].join('\n').split(/\n+/).map(p => p.trim()).filter(p => p.length >= 30).slice(0, 14);
  add(fates, 'fate', 6, `《${w.title}》的命运`.slice(0, 16), d.synopsis ? firstSentence(d.synopsis, 100) : `${MEDIA_LABEL[w.media]}《${w.title}》的故事，将以你为主角重演。`, {hook: '翻开这一页，你会被卷进这部作品的主线。'});
  paragraphs.forEach((p, i) => {
    const star = (i === paragraphs.length - 1 ? 5 : i === 0 ? 2 : i < 3 ? 3 : 4) as Star;
    add(fates, 'fate', star, `第${i + 1}页的走向`, firstSentence(p, 110), {chapter: `资料第 ${i + 1} 段`, hook: '当相似的处境出现在你面前时，这一段命运便会降临。'});
  });
  if (hero) add(fates, 'fate', 4, `与${hero.name}相遇`, `你在某个转角遇见了${hero.name}，故事由此改变方向。`, {hook: '在陌生的地方迷路时。'});
  add(fates, 'fate', 1, '翻错的一页', `你以为翻到了下一章，其实只是《${w.title}》里一段平静的日常。`, {hook: '某个无事发生的午后。'});
  add(fates, 'fate', 1, '书签掉落', '一张书签从书里滑出，指向你还没读到的地方。', {hook: '整理行囊时。'});
  if (items.length < 6) for (const [n, s] of [['旧书的扉页', 2], ['褪色的封面', 3], ['卷首语', 3], ['读者留下的批注', 2]] as const) add(items, 'item', s, n, `《${w.title}》的${n}。`, {type: '道具'});
  if (fates.length < 6) for (const [n, s] of [['序章的雨', 2], ['擦肩而过', 3], ['意外的来信', 3], ['终章的预感', 4]] as const) add(fates, 'fate', s, n, `在《${w.title}》的故事里，${n}。`, {hook: '某个寻常的时刻。'});
  return {version: 1, workKey: key, work: w, ...(hero ? {protagonist: hero.name} : {}), items: fillTiers(items).sort((a, b) => b.star - a.star), fates: fillTiers(fates).sort((a, b) => b.star - a.star), by: 'offline', at, sources: d.sources};
}
/** 校验一份已保存的小池（读取缓存时用）。 */
export function normalizePool(raw: unknown): SmallPool | undefined {
  const v = rec(raw), work = rec(v.work);
  if (v.version !== 1 || typeof v.workKey !== 'string' || typeof work.key !== 'string' || typeof work.title !== 'string') return undefined;
  const list = (x: unknown, kind: CardKind) => (Array.isArray(x) ? x : []).map((y, i) => {const c = cardFrom(y, kind, i, String(v.workKey)); const id = rec(y).id; return c && typeof id === 'string' ? {...c, id} : c;}).filter((c): c is GachaCard => !!c);
  const items = list(v.items, 'item'), fates = list(v.fates, 'fate');
  if (!items.length || !fates.length) return undefined;
  return {version: 1, workKey: String(v.workKey), work: work as unknown as WorkCard, ...(typeof v.protagonist === 'string' ? {protagonist: clean(v.protagonist, 24)} : {}), items, fates, by: v.by === 'offline' ? 'offline' : 'model', at: Number(v.at) || 0, sources: (Array.isArray(v.sources) ? v.sources : []).map(s => clean(s, 24)).filter(Boolean)};
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
