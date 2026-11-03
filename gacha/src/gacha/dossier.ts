/** 小池资料：选定作品后，从它所在的资料库补全简介、角色与设定，再到维基百科（中文优先）与 Fandom 找剧情与人物章节。
 *  这些资料只用来让模型编纂卡池时有据可依；不下载、不保存任何作品正文。 */
import {plainText,mapLimit,type Net} from './net';
import {normTitle,type WorkCard} from './sources';

export type DossierCharacter = {name: string; original?: string; role: string; description?: string};
export type DossierSection = {heading: string; text: string; source: string};
export type Dossier = {work: WorkCard; synopsis: string; characters: DossierCharacter[]; sections: DossierSection[]; facts: string[]; sources: string[]; notes: string[]};
export type DossierCtx = {net: Net; signal?: AbortSignal; fandom?: boolean};

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
        if (text.length > 120 && fandomRelevant(english, page, text)) {d.sections.push({heading: page, text, source: `Fandom（${slug}）`}); d.sources.push('Fandom'); return;}
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
  d.sources.push(lang === 'zh' ? '中文维基百科' : '英文维基百科');
}
const ENRICH: Partial<Record<WorkCard['source'], (w: WorkCard, d: Dossier, ctx: DossierCtx) => Promise<void>>> = {bangumi: fromBangumi, anilist: fromAniList, vndb: fromVndb, jikan: fromJikan, openlibrary: fromOpenLibrary};
/** 汇总一部作品的资料。每一步失败都只是少一份资料；最后至少有卡片上的标题与简介。 */
export async function buildDossier(work: WorkCard, ctx: DossierCtx, onStep?: (label: string) => void): Promise<Dossier> {
  const d: Dossier = {work, synopsis: work.summary ? plainText(work.summary, 2400) : '', characters: [], sections: [], facts: [], sources: [], notes: []};
  const step = (label: string) => {try {onStep?.(label);} catch {/* 只是进度提示 */}};
  const own = ENRICH[work.source];
  if (own) {step('正在翻阅原始条目'); try {await own(work, d, ctx);} catch (e) {d.notes.push('原始条目没能读取：' + String((e as Error)?.message ?? e).slice(0, 60));}}
  if (ctx.signal?.aborted) throw Error('已取消');
  step('正在查阅维基百科'); try {await fromWikipedia(work, d, ctx);} catch {/* 没有维基条目也可以 */}
  if (ctx.fandom !== false) {step('正在查找 Fandom 设定页'); try {await fromFandom(work, d, ctx);} catch {/* 没有 Fandom 站点很常见 */}}
  if (ctx.signal?.aborted) throw Error('已取消');
  const seen = new Set<string>();
  d.characters = d.characters.filter(c => {const k = normTitle(c.name); if (!k || seen.has(k)) return false; seen.add(k); return true;}).sort((a, b) => roleRank(a.role) - roleRank(b.role)).slice(0, 12);
  if (work.creators?.length) d.facts.unshift('作者 / 制作：' + work.creators.join('、'));
  if (work.year) d.facts.unshift('年份：' + work.year);
  d.facts = [...new Set(d.facts)].slice(0, 12);
  return d;
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
