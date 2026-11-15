/** 小池资料：选定作品后，从它所在的资料库补全简介、角色与设定，再到维基百科（中文优先）与 Fandom 找剧情与人物章节。
 *  这些资料只用来让模型编纂卡池时有据可依；不下载、不保存任何作品正文。 */
import {plainText,mapLimit,type Net} from './net';
import {normTitle,type WorkCard} from './sources';

export type DossierCharacter = {name: string; original?: string; role: string; description?: string};
export type DossierSection = {heading: string; text: string; source: string};
export type Dossier = {work: WorkCard; synopsis: string; characters: DossierCharacter[]; sections: DossierSection[]; facts: string[]; sources: string[]; notes: string[]};
/** memo：会话里的缓存（角色条目生成时留着作品资料，同一部作品不重查）。 */
export type DossierCtx = {net: Net; signal?: AbortSignal; fandom?: boolean; memo?: Map<string, unknown>};

const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown, max = 200) => {const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : undefined;};
const CJK = /[㐀-鿿]/;
const opt = (ctx: DossierCtx, timeoutMs: number) => ({timeoutMs, ...(ctx.signal ? {signal: ctx.signal} : {})});
const ROLE_ORDER = ['主角', '主要角色', '配角', '客串', '登场'];
const roleRank = (r: string) => {const i = ROLE_ORDER.indexOf(r); return i < 0 ? 9 : i;};

/* ---------- 维基百科：按章节拆开，挑剧情与人物 ---------- */
const PLOT = /剧情|情节|故事|概要|大纲|简介|梗概|内容|主线|本篇|plot|synopsis|story|summary/i;
const CAST = /人物|角色|登场|主要人物|主角|世界观|设定|characters|cast|setting/i;
const SKIP = /评价|反响|销量|制作|音乐|演员|配音|参考|外部链接|注释|改编|奖项|出版|发行|reception|production|references|release|adaptation|notes/i;
export function wikiSections(text: string): {intro: string; sections: {heading: string; level: number; text: string}[]} {
  const lines = String(text ?? '').split('\n'), sections: {heading: string; level: number; text: string}[] = [];
  let intro = '', cur: {heading: string; level: number; text: string} | undefined;
  for (const line of lines) {
    const m = /^(={2,5})\s*(.+?)\s*\1\s*$/.exec(line.trim());
    if (m) {cur = {heading: m[2]!, level: m[1]!.length, text: ''}; sections.push(cur); continue;}
    if (cur) cur.text += line + '\n'; else intro += line + '\n';
  }
  return {intro: intro.trim(), sections: sections.map(s => ({...s, text: s.text.trim()}))};
}
/** 从整篇条目里挑出剧情、人物章节，各自截到预算以内；子章节跟着父章节走。 */
export function pickWikiSections(text: string, source: string, budget = {intro: 600, plot: 3200, cast: 1600}): {intro: string; sections: DossierSection[]} {
  const {intro, sections} = wikiSections(text), out: DossierSection[] = [];
  // 被跳过的章节（评价、制作……）连同子章节一起跳过；中性章节（背景……）的子章节各自判断。
  let mode: 'plot' | 'cast' | undefined, anchor = 0, skipAt = 0, plotLeft = budget.plot, castLeft = budget.cast;
  for (const s of sections) {
    if (skipAt && s.level > skipAt) continue;
    skipAt = 0;
    if (!mode || s.level <= anchor) {
      if (SKIP.test(s.heading)) {mode = undefined; anchor = 0; skipAt = s.level; continue;}
      mode = PLOT.test(s.heading) ? 'plot' : CAST.test(s.heading) ? 'cast' : undefined; anchor = mode ? s.level : 0;
    }
    if (!mode || !s.text) continue;
    const left = mode === 'plot' ? plotLeft : castLeft; if (left <= 40) continue;
    const t = s.text.slice(0, left); out.push({heading: s.heading, text: t, source});
    if (mode === 'plot') plotLeft -= t.length; else castLeft -= t.length;
  }
  return {intro: intro.slice(0, budget.intro), sections: out};
}
async function wikiFindTitle(lang: 'zh' | 'en', query: string, ctx: DossierCtx): Promise<string | undefined> {
  const b = rec(await ctx.net.json(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*${lang === 'zh' ? '&variant=zh-cn' : ''}`, opt(ctx, 12000)));
  const hits = arr(rec(b.query).search).map(r => String(rec(r).title ?? '')).filter(Boolean), want = normTitle(query.split(' ')[0] ?? query);
  return hits.find(t => normTitle(t).includes(want) || want.includes(normTitle(t).slice(0, Math.max(2, want.length)))) ?? undefined;
}
async function wikiText(lang: 'zh' | 'en', title: string, ctx: DossierCtx): Promise<{title: string; text: string; url: string} | undefined> {
  const b = rec(await ctx.net.json(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}${lang === 'zh' ? '&variant=zh-cn' : ''}`, opt(ctx, 15000)));
  const page = Object.values(rec(rec(b.query).pages)).map(rec)[0];
  const text = typeof page?.extract === 'string' ? page.extract : '';
  if (!page || page.missing !== undefined || !text) return undefined;
  const t = String(page.title ?? title);
  return {title: t, text: text.slice(0, 60000), url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t)}`};
}

/* ---------- 各资料库的补全 ---------- */
async function fromBangumi(work: WorkCard, d: Dossier, ctx: DossierCtx) {
  const id = work.sourceId;
  const subject = rec(await ctx.net.json(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(id)}`, opt(ctx, 15000)));
  const summary = plainText(subject.summary, 2400); if (summary) d.synopsis = summary;
  for (const row of arr(subject.infobox).map(rec).slice(0, 18)) {
    const k = str(row.key, 12), v = Array.isArray(row.value) ? row.value.map(x => str(rec(x).v, 40)).filter(Boolean).slice(0, 2).join(' / ') : str(row.value, 60);
    if (k && v && !/链接|官方网站|网址|ISBN|价格|页数/.test(k)) d.facts.push(`${k}：${v}`);
  }
  const list = arr(await ctx.net.json(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(id)}/characters`, opt(ctx, 15000))).map(rec)
    .filter(c => Number(c.type) === 1 || c.type === undefined).sort((a, b) => roleRank(String(a.relation)) - roleRank(String(b.relation))).slice(0, 10);
  const detailed = await mapLimit(list.slice(0, 5), 3, async c => {
    try {return rec(await ctx.net.json(`https://api.bgm.tv/v0/characters/${encodeURIComponent(String(c.id))}`, opt(ctx, 12000)));} catch {return {};}
  });
  list.forEach((c, i) => {
    const det = detailed[i] ?? {}, zh = arr(det.infobox).map(rec).find(r => r.key === '简体中文名')?.value, name = str(zh, 40) ?? str(c.name, 40);
    if (!name) return;
    const description = plainText(det.summary ?? c.summary, 220);
    d.characters.push({name, ...(str(c.name, 40) && str(c.name, 40) !== name ? {original: str(c.name, 40)} : {}), role: str(c.relation, 8) ?? '登场', ...(description ? {description} : {})});
  });
  d.sources.push('Bangumi');
}
async function fromAniList(work: WorkCard, d: Dossier, ctx: DossierCtx) {
  const query = 'query($id:Int){Media(id:$id){description(asHtml:false) characters(sort:[ROLE,RELEVANCE],perPage:10){edges{role node{name{full native} description(asHtml:false)}}}}}';
  const b = rec(await ctx.net.json('https://graphql.anilist.co', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({query, variables: {id: Number(work.sourceId)}}), ...opt(ctx, 20000)}));
  const m = rec(rec(b.data).Media), desc = plainText(m.description, 2400); if (desc && !d.synopsis) d.synopsis = desc; else if (desc) d.notes.push('AniList 简介：' + desc.slice(0, 800));
  for (const e of arr(rec(m.characters).edges).map(rec)) {
    const n = rec(rec(e.node).name), name = str(n.native, 40) ?? str(n.full, 40); if (!name) continue;
    const description = plainText(rec(e.node).description, 220);
    d.characters.push({name, ...(str(n.full, 40) && str(n.full, 40) !== name ? {original: str(n.full, 40)} : {}), role: e.role === 'MAIN' ? '主角' : e.role === 'SUPPORTING' ? '配角' : '登场', ...(description ? {description} : {})});
  }
  d.sources.push('AniList');
}
async function fromVndb(work: WorkCard, d: Dossier, ctx: DossierCtx) {
  const post = (path: string, body: unknown) => ctx.net.json(`https://api.vndb.org/kana/${path}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), ...opt(ctx, 15000)}).then(rec);
  const vn = arr((await post('vn', {filters: ['id', '=', work.sourceId], fields: 'description'})).results).map(rec)[0];
  const desc = plainText(vn?.description, 2400); if (desc) d.synopsis = d.synopsis || desc;
  const chars = arr((await post('character', {filters: ['vn', '=', ['id', '=', work.sourceId]], fields: 'name, original, description, vns.role, vns.id', results: 15})).results).map(rec);
  const role = (c: Record<string, unknown>) => String(arr(c.vns).map(rec).find(v => v.id === work.sourceId)?.role ?? '');
  for (const c of chars.sort((a, b) => ['main', 'primary', 'side', 'appears'].indexOf(role(a)) - ['main', 'primary', 'side', 'appears'].indexOf(role(b))).slice(0, 10)) {
    const name = str(c.original, 40) ?? str(c.name, 40); if (!name) continue;
    const r = role(c), description = plainText(c.description, 220);
    d.characters.push({name, ...(str(c.name, 40) && str(c.name, 40) !== name ? {original: str(c.name, 40)} : {}), role: r === 'main' ? '主角' : r === 'primary' ? '主要角色' : r === 'side' ? '配角' : '登场', ...(description ? {description} : {})});
  }
  d.sources.push('VNDB');
}
async function fromJikan(work: WorkCard, d: Dossier, ctx: DossierCtx) {
  const [kind, id] = work.sourceId.split(':');
  const b = rec(await ctx.net.json(`https://api.jikan.moe/v4/${kind}/${id}/characters`, opt(ctx, 15000)));
  for (const c of arr(b.data).map(rec).slice(0, 10)) {
    const name = str(rec(c.character).name, 40); if (!name) continue;
    d.characters.push({name, role: c.role === 'Main' ? '主角' : '配角'});
  }
  d.sources.push('MyAnimeList');
}
async function fromOpenLibrary(work: WorkCard, d: Dossier, ctx: DossierCtx) {
  const b = rec(await ctx.net.json(`https://openlibrary.org${work.sourceId}.json`, opt(ctx, 15000)));
  const desc = plainText(typeof b.description === 'string' ? b.description : rec(b.description).value, 2400); if (desc) d.synopsis = d.synopsis || desc;
  const subjects = arr(b.subjects).map(x => str(x, 40)).filter(Boolean).slice(0, 10); if (subjects.length) d.facts.push('主题：' + subjects.join('、'));
  const people = arr(b.subject_people).map(x => str(x, 40)).filter((x): x is string => !!x).slice(0, 8);
  for (const name of people) d.characters.push({name, role: '登场'});
  d.sources.push('Open Library');
}
/** Fandom：按英文标题猜站点（如 harrypotter.fandom.com），找主角或作品条目的导言。找不到就算了。 */
export function fandomSlugs(english: string): string[] {
  const base = english.toLowerCase().replace(/[’'"]/g, '').replace(/^the\s+/, ''), words = base.split(/[^a-z0-9]+/).filter(Boolean);
  return [...new Set([words.join(''), words.slice(0, 2).join(''), words[0] ?? ''].filter(s => s.length >= 3 && s.length <= 40))].slice(0, 3);
}
/** Fandom 页面是否真的在讲这部作品：导言（或页名）里要出现作品英文名的主干（冒号 / 破折号前、去掉开头的 The）。
 *  按英文名猜出来的站点可能是同名的别的维基（如 cowboy.fandom.com），不相关的设定绝不能混进小池资料。 */
export function fandomRelevant(english: string, page: string, text: string): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[’'"]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const core = norm(english.split(/\s*[:：]\s*|\s+[-–—]\s+/)[0]!.replace(/^\s*the\s+/i, ''));
  if (core.length < 3) return false;
  const hay = ' ' + norm(page + ' ' + text) + ' ';
  return hay.includes(' ' + core + ' ');
}
async function fromFandom(work: WorkCard, d: Dossier, ctx: DossierCtx) {
  const english = work.english ?? (!CJK.test(work.title) ? work.title : undefined); if (!english) return;
  const hero = d.characters.find(c => c.role === '主角')?.original ?? d.characters[0]?.original;
  const queries = [...new Set([hero, english].filter((x): x is string => !!x))];
  for (const slug of fandomSlugs(english)) {
    try {
      const api = `https://${slug}.fandom.com/api.php`;
      for (const q of queries) {
        const found = rec(await ctx.net.json(`${api}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json&origin=*`, opt(ctx, 8000)));
        // 站点首页（Main Page）与分类、文件页只是导航，不收。
        const page = arr(rec(found.query).search).map(x => str(rec(x).title, 120)).find(t => !!t && !/^(main page|首页|メインページ)$/i.test(t) && !/^(category|file|user|template|分类|文件|用户|模板)\s*:/i.test(t)); if (!page) continue;
        const parsed = rec(await ctx.net.json(`${api}?action=parse&page=${encodeURIComponent(page)}&prop=text&section=0&disabletoc=1&format=json&origin=*`, opt(ctx, 8000)));
        const text = plainText(rec(rec(parsed.parse).text)['*'], 1600).replace(/\n{2,}/g, '\n');
        if (text.length > 120 && fandomRelevant(english, page, text)) {d.sections.push({heading: page, text, source: `Fandom（${slug}）`}); d.sources.push('Fandom'); return slug;}
      }
    } catch {/* 下一个候选站点 */}
  }
}
async function fromWikipedia(work: WorkCard, d: Dossier, ctx: DossierCtx) {
  let page: {title: string; text: string; url: string} | undefined, lang: 'zh' | 'en' = 'zh';
  const zhTitle = work.wiki?.zh ?? (CJK.test(work.title) ? await wikiFindTitle('zh', work.title, ctx).catch(() => undefined) : undefined);
  if (zhTitle) page = await wikiText('zh', zhTitle, ctx).catch(() => undefined);
  if (!page) {
    const en = work.wiki?.en ?? work.english ?? (!CJK.test(work.title) ? work.title : undefined);
    const enTitle = en ? await wikiFindTitle('en', en, ctx).catch(() => undefined) : undefined;
    if (enTitle) {page = await wikiText('en', enTitle, ctx).catch(() => undefined); lang = 'en';}
  }
  if (!page) return;
  const picked = pickWikiSections(page.text, lang === 'zh' ? '中文维基百科' : '英文维基百科');
  if (picked.intro && !d.synopsis) d.synopsis = picked.intro;
  else if (picked.intro) d.notes.push(`维基导言：${picked.intro}`);
  d.sections.push(...picked.sections);
  const source = lang === 'zh' ? '中文维基百科' : '英文维基百科';
  d.sources.push(source);
  return {text: page.text, lang, source};
}
const ENRICH: Partial<Record<WorkCard['source'], (w: WorkCard, d: Dossier, ctx: DossierCtx) => Promise<void>>> = {bangumi: fromBangumi, anilist: fromAniList, vndb: fromVndb, jikan: fromJikan, openlibrary: fromOpenLibrary};
/** 汇总时顺手留下的东西：整篇维基条目（找某位角色的段落用）与确认过的 Fandom 站点。 */
type Gathered = {dossier: Dossier; wiki?: {text: string; lang: 'zh' | 'en'; source: string}; fandom?: string};
async function gather(work: WorkCard, ctx: DossierCtx, onStep?: (label: string) => void): Promise<Gathered> {
  const d: Dossier = {work, synopsis: work.summary ? plainText(work.summary, 2400) : '', characters: [], sections: [], facts: [], sources: [], notes: []};
  const step = (label: string) => {try {onStep?.(label);} catch {/* 只是进度提示 */}};
  const own = ENRICH[work.source];
  if (own) {step('正在翻阅原始条目'); try {await own(work, d, ctx);} catch (e) {d.notes.push('原始条目没能读取：' + String((e as Error)?.message ?? e).slice(0, 60));}}
  if (ctx.signal?.aborted) throw Error('已取消');
  let wiki: Gathered['wiki'], fandom: string | undefined;
  step('正在查阅维基百科'); try {wiki = await fromWikipedia(work, d, ctx);} catch {/* 没有维基条目也可以 */}
  if (ctx.fandom !== false) {step('正在查找 Fandom 设定页'); try {fandom = await fromFandom(work, d, ctx);} catch {/* 没有 Fandom 站点很常见 */}}
  if (ctx.signal?.aborted) throw Error('已取消');
  const seen = new Set<string>();
  d.characters = d.characters.filter(c => {const k = normTitle(c.name); if (!k || seen.has(k)) return false; seen.add(k); return true;}).sort((a, b) => roleRank(a.role) - roleRank(b.role)).slice(0, 12);
  if (work.creators?.length) d.facts.unshift('作者 / 制作：' + work.creators.join('、'));
  if (work.year) d.facts.unshift('年份：' + work.year);
  d.facts = [...new Set(d.facts)].slice(0, 12);
  return {dossier: d, ...(wiki ? {wiki} : {}), ...(fandom ? {fandom} : {})};
}
/** 汇总一部作品的资料。每一步失败都只是少一份资料；最后至少有卡片上的标题与简介。 */
export async function buildDossier(work: WorkCard, ctx: DossierCtx, onStep?: (label: string) => void): Promise<Dossier> {
  return (await gather(work, ctx, onStep)).dossier;
}
/** 交给模型的资料文本（有长度上限）。 */
export function dossierText(d: Dossier, max = 9000): string {
  const w = d.work, lines: string[] = [];
  lines.push(`作品：《${w.title}》${w.original ? `（原题：${w.original}）` : ''}${w.english && w.english !== w.title ? `（英文：${w.english}）` : ''}`);
  if (d.facts.length) lines.push(...d.facts.map(f => '· ' + f));
  if (w.tags?.length) lines.push('标签：' + w.tags.join('、'));
  if (d.synopsis) lines.push('简介：' + d.synopsis);
  if (d.characters.length) lines.push('角色：' + d.characters.map(c => `${c.name}${c.original ? `（${c.original}）` : ''}【${c.role}】${c.description ? '：' + c.description : ''}`).join('；'));
  for (const s of d.sections) lines.push(`【${s.heading}·${s.source}】${s.text}`);
  for (const n of d.notes) lines.push('（' + n + '）');
  const text = lines.join('\n');
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/* ---------- 角色的详细资料（角色条目生成用） ---------- */
/** 一位角色在资料库里的记录：names 是它的各种写法（原名、中文名、别名）。 */
export type CharacterNote = {names: string[]; role?: string; description: string; facts: string[]; source: string};
export type CharacterQuery = {name: string; role?: string; description?: string};
/** others：资料库里有这部作品的角色资料、但没能自动对上名字时，留给模型自己辨认的几条。 */
export type CharacterProfile = {name: string; names: string[]; role?: string; description: string; facts: string[]; passages: DossierSection[]; others: CharacterNote[]; sources: string[]};
export type CharacterDossier = {dossier: Dossier; profile: CharacterProfile};
/** 查角色详细资料时最多看资料库里的前多少位角色。 */
export const CHARACTER_CANDIDATES = 12;
const uniq = (items: readonly (string | undefined)[]) => [...new Set(items.map(x => (x ?? '').trim()).filter(Boolean))];
/** 两组名字里有没有指同一个人的：去掉空白与标点后相同，或一个包含另一个（中日文至少两个字，拉丁字母至少四个）。 */
export function sameCharacter(a: readonly string[], b: readonly string[]): boolean {
  const A = a.map(normTitle).filter(Boolean), B = b.map(normTitle).filter(Boolean), long = (s: string) => /[぀-ヿ㐀-鿿]/.test(s) ? s.length >= 2 : s.length >= 4;
  return A.some(x => B.some(y => x === y || (long(x.length <= y.length ? x : y) && (x.includes(y) || y.includes(x)))));
}
const NAME_ROW = /^(简体中文名|中文名|别名|本名|真名|原名|全名|姓名|英文名|日文名|罗马字|罗马音|假名|纯假名|平假名|片假名|昵称)$/;
function bangumiNote(c: Record<string, unknown>, det: Record<string, unknown>): CharacterNote {
  const names = [str(c.name, 60), str(det.name, 60)], facts: string[] = [];
  for (const row of arr(det.infobox).map(rec).slice(0, 24)) {
    const key = str(row.key, 12), values = (Array.isArray(row.value) ? row.value.map(x => str(rec(x).v, 60)) : [str(row.value, 160)]).filter((v): v is string => !!v).slice(0, 6);
    if (!key || !values.length) continue;
    if (NAME_ROW.test(key)) names.push(...values);
    if (!/引用|链接|网址|来源/.test(key)) facts.push(`${key}：${values.join(' / ')}`);
  }
  return {names: uniq(names), role: str(c.relation, 8) ?? '登场', description: plainText(det.summary ?? c.summary, 3000), facts: facts.slice(0, 18), source: 'Bangumi'};
}
async function notesFromBangumi(work: WorkCard, known: readonly string[], ctx: DossierCtx): Promise<CharacterNote[]> {
  const detail = async (c: Record<string, unknown>) => {try {return rec(await ctx.net.json(`https://api.bgm.tv/v0/characters/${encodeURIComponent(String(c.id))}`, opt(ctx, 12000)));} catch {return {};}};
  const list = arr(await ctx.net.json(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(work.sourceId)}/characters`, opt(ctx, 15000))).map(rec)
    .filter(c => Number(c.type) === 1 || c.type === undefined).sort((a, b) => roleRank(String(a.relation)) - roleRank(String(b.relation))).slice(0, CHARACTER_CANDIDATES);
  // 名单上的原名就对得上时只取这一位的详情；对不上（书页上写的是中文名）才逐个取详情，从里面的中文名与别名里找。
  const direct = list.find(c => sameCharacter(known, [str(c.name, 60) ?? '']));
  if (direct) return [bangumiNote(direct, await detail(direct))];
  const details = await mapLimit(list, 3, detail);
  return list.map((c, i) => bangumiNote(c, details[i] ?? {}));
}
async function notesFromAniList(work: WorkCard, _known: readonly string[], ctx: DossierCtx): Promise<CharacterNote[]> {
  const query = 'query($id:Int){Media(id:$id){characters(sort:[ROLE,RELEVANCE],perPage:25){edges{role node{name{full native alternative} description(asHtml:false) gender age}}}}}';
  const b = rec(await ctx.net.json('https://graphql.anilist.co', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({query, variables: {id: Number(work.sourceId)}}), ...opt(ctx, 20000)}));
  return arr(rec(rec(rec(b.data).Media).characters).edges).map(rec).map(e => {
    const node = rec(e.node), n = rec(node.name), gender = str(node.gender, 20), age = str(node.age, 20);
    return {names: uniq([str(n.native, 60), str(n.full, 60), ...arr(n.alternative).map(x => str(x, 60))]), role: e.role === 'MAIN' ? '主角' : e.role === 'SUPPORTING' ? '配角' : '登场', description: plainText(node.description, 3000), facts: [gender ? `性别：${gender}` : '', age ? `年龄：${age}` : ''].filter(Boolean), source: 'AniList'};
  }).filter(c => c.names.length);
}
async function notesFromVndb(work: WorkCard, _known: readonly string[], ctx: DossierCtx): Promise<CharacterNote[]> {
  const b = rec(await ctx.net.json('https://api.vndb.org/kana/character', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({filters: ['vn', '=', ['id', '=', work.sourceId]], fields: 'name, original, aliases, description, age, height, vns.role, vns.id, traits.name, traits.group_name, traits.spoiler', results: 25}), ...opt(ctx, 15000)}));
  const rank = (c: Record<string, unknown>) => {const i = ['main', 'primary', 'side', 'appears'].indexOf(String(arr(c.vns).map(rec).find(v => v.id === work.sourceId)?.role ?? '')); return i < 0 ? 9 : i;};
  return arr(b.results).map(rec).sort((x, y) => rank(x) - rank(y)).map(c => {
    const groups = new Map<string, string[]>(), age = Number(c.age), height = Number(c.height), r = rank(c);
    for (const t of arr(c.traits).map(rec)) {const g = str(t.group_name, 20), n = str(t.name, 40); if (g && n && !(Number(t.spoiler) > 0)) groups.set(g, [...(groups.get(g) ?? []), n]);}
    const facts = [age > 0 ? `年龄：${age}` : '', height > 0 ? `身高：${height}cm` : '', ...[...groups].map(([g, list]) => `${g}：${list.slice(0, 10).join('、')}`)].filter(Boolean);
    return {names: uniq([str(c.original, 60), str(c.name, 60), ...arr(c.aliases).map(x => str(x, 60))]), role: r === 0 ? '主角' : r === 1 ? '主要角色' : r === 2 ? '配角' : '登场', description: plainText(c.description, 3000), facts: facts.slice(0, 16), source: 'VNDB'};
  }).filter(c => c.names.length);
}
const NOTES: Partial<Record<WorkCard['source'], (w: WorkCard, known: readonly string[], ctx: DossierCtx) => Promise<CharacterNote[]>>> = {bangumi: notesFromBangumi, anilist: notesFromAniList, vndb: notesFromVndb};

/** 从整篇维基条目里找出讲这位角色的文字：以他为标题的小节整节收下；其余章节里收提到他的段落（人物章节优先；
 *  名字单独成行时连同后面几行说明一起收）。 */
export function characterPassages(text: string, names: readonly string[], source: string, budget = 2400): DossierSection[] {
  const keys = names.map(n => n.trim().toLowerCase()).filter(n => n.length >= 2), out: DossierSection[] = [];
  if (!keys.length) return out;
  const has = (s: string) => {const low = s.toLowerCase(); return keys.some(k => low.includes(k));};
  const sections = wikiSections(text).sections.filter(s => s.text && !SKIP.test(s.heading));
  let left = budget;
  for (const s of sections) {
    if (left <= 80 || !has(s.heading)) continue;
    const t = s.text.slice(0, Math.min(left, 1600)); out.push({heading: s.heading, text: t, source}); left -= t.length;
  }
  for (const s of [...sections].sort((a, b) => Number(CAST.test(b.heading)) - Number(CAST.test(a.heading)))) {
    if (left <= 80) break;
    if (has(s.heading)) continue;
    const lines = s.text.split('\n').map(x => x.trim()), picked: string[] = [];
    for (let i = 0; i < lines.length && left > 80; i++) {
      const line = lines[i]!;
      if (!line || !has(line)) continue;
      let block = line;
      if (line.length < 60) while (i + 1 < lines.length && lines[i + 1] && block.length < 700 && block.split('\n').length < 5) block += '\n' + lines[++i]!;
      block = block.slice(0, Math.min(700, left)); picked.push(block); left -= block.length;
    }
    if (picked.length) out.push({heading: s.heading, text: picked.join('\n'), source});
  }
  return out;
}
/** 这位角色自己的维基条目（有名的角色才有）：条目里要提到这部作品，免得收进同名的别人；消歧义页不收。 */
async function characterWikiPage(work: WorkCard, p: CharacterProfile, ctx: DossierCtx, lang: 'zh' | 'en'): Promise<void> {
  const cjk = p.names.find(n => CJK.test(n)), latin = p.names.find(n => !/[^ -~]/.test(n) && /[a-z]/i.test(n)), query = lang === 'zh' ? cjk ?? latin : latin;
  if (!query) return;
  const title = await wikiFindTitle(lang, query, ctx);
  if (!title) return;
  const works = uniq([work.title, work.original, work.english, work.wiki?.zh, work.wiki?.en]).map(normTitle).filter(t => t.length >= 2);
  if (works.includes(normTitle(title))) return;
  const page = await wikiText(lang, title, ctx);
  if (!page || /可以指|可能是指|may refer to/i.test(page.text.slice(0, 200))) return;
  const head = normTitle(page.text.slice(0, 8000));
  if (!works.some(t => head.includes(t))) return;
  const {intro, sections} = wikiSections(page.text), source = `${lang === 'zh' ? '中文' : '英文'}维基百科「${page.title}」`;
  let left = 2000;
  if (intro) {const t = intro.slice(0, 900); p.passages.push({heading: page.title, text: t, source}); left -= t.length;}
  for (const s of sections) {
    if (left <= 80) break;
    if (!s.text || SKIP.test(s.heading)) continue;
    const t = s.text.slice(0, Math.min(left, 700)); p.passages.push({heading: s.heading, text: t, source}); left -= t.length;
  }
  p.sources.push(source);
}
/** 作品的 Fandom 站点（汇总作品资料时已经确认过是讲这部作品的）里这位角色的页面导言。 */
async function characterFandom(slug: string, d: Dossier, p: CharacterProfile, ctx: DossierCtx): Promise<void> {
  const api = `https://${slug}.fandom.com/api.php`, source = `Fandom（${slug}）`;
  for (const q of p.names.filter(n => !/[^ -~]/.test(n) && /[a-z]/i.test(n)).slice(0, 2)) {
    const found = rec(await ctx.net.json(`${api}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json&origin=*`, opt(ctx, 8000)));
    const page = arr(rec(found.query).search).map(x => str(rec(x).title, 120)).find(t => !!t && sameCharacter([q], [t]));
    if (!page || d.sections.some(s => s.heading === page && s.source === source)) continue;
    const parsed = rec(await ctx.net.json(`${api}?action=parse&page=${encodeURIComponent(page)}&prop=text&section=0&disabletoc=1&format=json&origin=*`, opt(ctx, 8000)));
    const text = plainText(rec(rec(parsed.parse).text)['*'], 2000).replace(/\n{2,}/g, '\n');
    if (text.length > 120) {p.passages.push({heading: page, text, source}); p.sources.push('Fandom'); return;}
  }
}
/** 汇总一位角色的详细资料：作品资料（同 buildDossier）＋资料库里这位角色的条目＋维基里讲他的段落与他自己的条目＋Fandom 页面。
 *  每一步失败都只是少一份资料。ctx.memo 里留着作品资料，同一部作品的下一位角色不用重查。 */
export async function buildCharacterDossier(work: WorkCard, who: CharacterQuery, ctx: DossierCtx, onStep?: (label: string) => void): Promise<CharacterDossier> {
  const step = (label: string) => {try {onStep?.(label);} catch {/* 只是进度提示 */}};
  const memoKey = 'dossier:' + work.key;
  let g = ctx.memo?.get(memoKey) as Gathered | undefined;
  if (!g) {g = await gather(work, ctx, onStep); ctx.memo?.set(memoKey, g);}
  const d = g.dossier, base = d.characters.find(c => sameCharacter([who.name], [c.name, ...(c.original ? [c.original] : [])])), role = who.role ?? base?.role;
  const p: CharacterProfile = {name: who.name, names: uniq([who.name, base?.name, base?.original]), ...(role ? {role} : {}), description: '', facts: [], passages: [], others: [], sources: []};
  step(`正在查找「${who.name}」的角色资料`);
  const own = NOTES[work.source];
  let notes: CharacterNote[] = [];
  if (own) {try {notes = await own(work, p.names, ctx);} catch {/* 资料库里查不到角色也可以 */}}
  if (ctx.signal?.aborted) throw Error('已取消');
  const hit = notes.find(n => sameCharacter(p.names, n.names));
  if (hit) {p.description = hit.description; p.facts = hit.facts; p.names = uniq([...p.names, ...hit.names]).slice(0, 8); if (!p.role && hit.role) p.role = hit.role; p.sources.push(hit.source);}
  else {
    if (base?.description) p.description = base.description;
    p.others = notes.filter(n => n.description).slice(0, 8).map(n => ({...n, names: n.names.slice(0, 3), description: n.description.slice(0, 500), facts: n.facts.slice(0, 6)}));
  }
  if (g.wiki) {const found = characterPassages(g.wiki.text, p.names, g.wiki.source); if (found.length) {p.passages.push(...found); p.sources.push(g.wiki.source);}}
  try {await characterWikiPage(work, p, ctx, g.wiki?.lang ?? (CJK.test(work.title) ? 'zh' : 'en'));} catch {/* 没有自己的条目很常见 */}
  if (ctx.signal?.aborted) throw Error('已取消');
  if (ctx.fandom !== false && g.fandom) {try {await characterFandom(g.fandom, d, p, ctx);} catch {/* 没有页面也可以 */}}
  if (ctx.signal?.aborted) throw Error('已取消');
  p.sources = uniq(p.sources);
  return {dossier: d, profile: p};
}
/** 有没有任何可以依据的资料（作品的或这位角色的）。一点都没有时不生成条目。 */
export function hasCharacterMaterial(cd: CharacterDossier): boolean {
  const p = cd.profile, d = cd.dossier;
  return !!(p.description || p.passages.length || p.others.length || d.synopsis || d.sections.length || d.characters.length);
}
/** 交给模型的角色资料文本：先是这位角色的，再是作品的（有长度上限）。 */
export function characterDossierText(cd: CharacterDossier, max = 12000): string {
  const p = cd.profile, lines: string[] = [], alias = p.names.filter(n => n !== p.name);
  lines.push(`〔这位角色〕${p.name}${alias.length ? `（又作：${alias.join(' / ')}）` : ''}${p.role ? `【${p.role}】` : ''}`);
  for (const f of p.facts) lines.push('· ' + f);
  if (p.description) lines.push('资料库里的介绍：' + p.description);
  for (const s of p.passages) lines.push(`【${s.heading}·${s.source}】${s.text}`);
  if (p.others.length) {
    lines.push('（资料库没能自动对上这位角色的名字。下面是同一部作品里几位角色的资料，请自行辨认哪一条是他；都不是就不要套用。）');
    for (const o of p.others) lines.push(`· ${o.names.join(' / ')}【${o.role ?? '登场'}】${o.facts.length ? `（${o.facts.join('；')}）` : ''}：${o.description}`);
  }
  if (!p.description && !p.passages.length && !p.others.length) lines.push('（资料库里没有查到专门讲这位角色的资料，请依据下面的作品资料与你确实了解的原作内容。）');
  const own = lines.join('\n'), cap = Math.max(1000, max - 2500), mine = own.length > cap ? own.slice(0, cap) + '…' : own;
  return mine + '\n\n〔作品资料〕\n' + dossierText(cd.dossier, Math.max(2000, max - mine.length - 12));
}
