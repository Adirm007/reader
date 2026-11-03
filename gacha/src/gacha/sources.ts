/** 大池：从多个公开资料库里按主题随机捞作品，统一成“作品卡”，跨库去重后均衡抽出 54 部。
 *  文学：Wikidata（只取有中文维基条目的作品）、Open Library、Google Books、Internet Archive；
 *  ACGN：Bangumi（中文条目、简介与标签）、AniList、VNDB、Jikan（MyAnimeList）。
 *  所有请求都在玩家的浏览器里直接发出（这些接口都允许跨域），失败的资料库只是少一些作品，不影响其他库。 */
import {themeSources,type GachaTheme,type SourceId,type Direction} from './themes';
import {plainText,type Net} from './net';
import {shuffle} from './rarity';

export type WorkMedia = 'book' | 'novel' | 'poem' | 'play' | 'manga' | 'lightnovel' | 'anime' | 'game' | 'vn' | 'other';
export const MEDIA_LABEL: Readonly<Record<WorkMedia, string>> = {book: '书籍', novel: '小说', poem: '诗歌', play: '戏剧', manga: '漫画', lightnovel: '轻小说', anime: '动画', game: '游戏', vn: '视觉小说', other: '作品'};
export type WorkCard = {
  key: string; source: SourceId; sourceId: string;
  /** 显示用标题（优先中文）。 */
  title: string; original?: string; english?: string;
  creators?: string[]; year?: number; media: WorkMedia;
  cover?: string; thumb?: string; summary?: string; summaryLang?: 'zh' | 'en' | 'other';
  tags?: string[]; url?: string; score?: number; nsfw?: boolean;
  /** 维基条目名（找剧情与人物用）。 */
  wiki?: {zh?: string; en?: string};
  /** 中文一句话览概（模型补写或由中文简介截取）。 */
  overview?: string;
};
export type SourceCtx = {net: Net; rng: () => number; nsfw: boolean; googleKey?: string; signal?: AbortSignal; memo: Map<string, unknown>};
export type SourceDef = {id: SourceId; name: string; site: string; direction: Direction; note: string; defaultOn: boolean; primary?: boolean; sample(theme: GachaTheme, want: number, ctx: SourceCtx): Promise<WorkCard[]>};
export type SourceReport = {source: SourceId; name: string; count: number; ms: number; error?: string};

const CJK = /[㐀-鿿豈-﫿]/, HANGUL = /[가-힯]/, KANA = /[぀-ヿ]/;
const pickInt = (rng: () => number, n: number) => Math.max(0, Math.floor(rng() * Math.max(0, n)));
const take = <T>(list: readonly T[], n: number) => list.slice(0, Math.max(0, n));
const year = (v: unknown) => {const m = /(\d{3,4})/.exec(String(v ?? '')); const y = m ? Number(m[1]) : NaN; return y > 0 && y < 2100 ? y : undefined;};
const str = (v: unknown, max = 200) => {const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : undefined;};
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const https = (u: unknown) => {const s = str(u, 600); return s ? s.replace(/^http:\/\//, 'https://') : undefined;};
/** 东亚原题里能读懂的优先当标题：含汉字且不是韩文时用原题。 */
const readable = (native?: string) => !!native && CJK.test(native) && !HANGUL.test(native);
const shortSummary = (s: string | undefined) => s ? plainText(s, 900) : undefined;

/* ---------- 文学 ---------- */
const WD_TYPES = ['Q7725634', 'Q47461344', 'Q571', 'Q8261', 'Q1667921', 'Q49084', 'Q25379', 'Q5185279', 'Q37484', 'Q149537'];
const qid = (v: string) => /^Q\d+$/.test(v) ? 'wd:' + v : '';
export function wikidataQuery(genres: string[], subjects: string[], seed: string, limit: number): string {
  const g = genres.map(qid).filter(Boolean), s = subjects.map(qid).filter(Boolean);
  const parts = [g.length ? `{ VALUES ?g { ${g.join(' ')} } ?item wdt:P136 ?g . }` : '', s.length ? `{ VALUES ?s { ${s.join(' ')} } ?item wdt:P921 ?s . }` : ''].filter(Boolean);
  return `SELECT ?item (SAMPLE(?zht) AS ?zhwiki) (SAMPLE(?zhs) AS ?hans) (SAMPLE(?zhl) AS ?zh) (SAMPLE(?enl) AS ?en) (SAMPLE(?al) AS ?author) (MIN(?y) AS ?year) WHERE {
 ${parts.join(' UNION ')}
 VALUES ?type { ${WD_TYPES.map(qid).join(' ')} } ?item wdt:P31 ?type .
 ?art schema:about ?item ; schema:isPartOf <https://zh.wikipedia.org/> ; schema:name ?zht .
 OPTIONAL { ?item rdfs:label ?zhs FILTER(LANG(?zhs) = "zh-hans") }
 OPTIONAL { ?item rdfs:label ?zhl FILTER(LANG(?zhl) = "zh") }
 OPTIONAL { ?item rdfs:label ?enl FILTER(LANG(?enl) = "en") }
 OPTIONAL { ?item wdt:P50 ?a . OPTIONAL { ?a rdfs:label ?al FILTER(LANG(?al) = "zh-hans" || LANG(?al) = "zh") } }
 OPTIONAL { ?item wdt:P577 ?d . BIND(YEAR(?d) AS ?y) }
} GROUP BY ?item ORDER BY MD5(CONCAT(STR(?item), "${seed.replace(/[^a-z0-9]/gi, '')}")) LIMIT ${Math.max(1, Math.min(200, Math.floor(limit)))}`;
}
/** 维基条目名去掉消歧义括注：「影子 (小说)」→「影子」。 */
export const stripDisambiguation = (t: string) => t.replace(/\s*[（(][^（）()]*[)）]\s*$/, '').trim() || t;
export async function zhwikiThumbs(titles: string[], ctx: Pick<SourceCtx, 'net' | 'signal'>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    try {
      const b = rec(await ctx.net.json('https://zh.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=320&pilimit=50&redirects=1&format=json&origin=*&titles=' + encodeURIComponent(batch.join('|')), {timeoutMs: 12000, ...(ctx.signal ? {signal: ctx.signal} : {})}));
      const q = rec(b.query), alias = new Map<string, string>();
      for (const n of [...arr(q.normalized), ...arr(q.redirects)]) {const r = rec(n); if (typeof r.from === 'string' && typeof r.to === 'string') alias.set(r.from, r.to);}
      const thumbs = new Map<string, string>();
      for (const p of Object.values(rec(q.pages))) {const r = rec(p), src = https(rec(r.thumbnail).source); if (typeof r.title === 'string' && src) thumbs.set(r.title, src);}
      for (const t of batch) {let k = t; for (let hop = 0; hop < 3 && alias.has(k); hop++) k = alias.get(k)!; const src = thumbs.get(k); if (src) out.set(t, src);}
    } catch {/* 封面只是锦上添花 */}
  }
  return out;
}
const wikidata: SourceDef = {
  id: 'wikidata', name: 'Wikidata', site: 'https://www.wikidata.org', direction: 'literature', defaultOn: true, primary: true,
  note: '按体裁 / 主题查询，只取有中文维基条目的作品；中文标题、作者与年份最全。',
  async sample(theme, want, ctx) {
    const q = theme.query.wikidata; if (!q || !(q.genres?.length || q.subjects?.length)) return [];
    const seed = Math.floor(ctx.rng() * 1e9).toString(36);
    const b = rec(await ctx.net.json('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(wikidataQuery(q.genres ?? [], q.subjects ?? [], seed, want)), {timeoutMs: 25000, ...(ctx.signal ? {signal: ctx.signal} : {})}));
    const rows = arr(rec(b.results).bindings).map(rec), val = (r: Record<string, unknown>, k: string) => str(rec(r[k]).value);
    const cards: WorkCard[] = [];
    for (const r of rows) {
      const id = (val(r, 'item') ?? '').split('/').pop() ?? '', zhwiki = val(r, 'zhwiki');
      if (!/^Q\d+$/.test(id) || !zhwiki) continue;
      const title = val(r, 'hans') ?? stripDisambiguation(zhwiki), en = val(r, 'en'), author = val(r, 'author'), y = year(val(r, 'year'));
      cards.push({key: 'wikidata:' + id, source: 'wikidata', sourceId: id, title, ...(en && en !== title ? {english: en} : {}), ...(author ? {creators: [author]} : {}), ...(y ? {year: y} : {}),
        media: 'book', url: 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(zhwiki), wiki: {zh: zhwiki}});
    }
    const thumbs = await zhwikiThumbs(cards.map(c => c.wiki!.zh!), ctx);
    for (const c of cards) {const t = thumbs.get(c.wiki!.zh!); if (t) c.cover = t;}
    return cards;
  },
};
const openlibrary: SourceDef = {
  id: 'openlibrary', name: 'Open Library', site: 'https://openlibrary.org', direction: 'literature', defaultOn: true,
  note: '互联网档案馆的开放书目，按英文主题词抽书；公版书可在线阅读。',
  async sample(theme, want, ctx) {
    const subjects = take(shuffle(theme.query.openlibrary?.subjects ?? [], ctx.rng), 3); if (!subjects.length) return [];
    const per = Math.ceil(want / subjects.length) + 6, out: WorkCard[] = [];
    await Promise.all(subjects.map(async subject => {
      const memoKey = 'ol:' + subject, known = Number(ctx.memo.get(memoKey)) || 0;
      const limit = Math.min(50, per), offset = known > limit ? pickInt(ctx.rng, Math.min(known, 480) - limit) : pickInt(ctx.rng, 60);
      const url = (o: number) => `https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?limit=${limit}&offset=${o}`;
      let b = rec(await ctx.net.json(url(offset), {timeoutMs: 20000, ...(ctx.signal ? {signal: ctx.signal} : {})}));
      if (!arr(b.works).length && offset > 0) b = rec(await ctx.net.json(url(0), {timeoutMs: 20000, ...(ctx.signal ? {signal: ctx.signal} : {})}));
      if (Number(b.work_count) > 0) ctx.memo.set(memoKey, Number(b.work_count));
      for (const w of arr(b.works).map(rec)) {
        const key = str(w.key, 60); if (!key || !/^\/works\/OL\d+W$/.test(key)) continue;
        const title = str(w.title, 120); if (!title) continue;
        const authors = arr(w.authors).map(a => str(rec(a).name, 60)).filter((x): x is string => !!x).slice(0, 3);
        const cover = Number(w.cover_id) > 0 ? `https://covers.openlibrary.org/b/id/${Number(w.cover_id)}-M.jpg` : undefined, y = year(w.first_publish_year);
        out.push({key: 'openlibrary:' + key.slice(7), source: 'openlibrary', sourceId: key, title, ...(authors.length ? {creators: authors} : {}), ...(y ? {year: y} : {}),
          media: 'book', ...(cover ? {cover} : {}), tags: arr(w.subject).map(x => str(x, 40)).filter((x): x is string => !!x).slice(0, 6), url: 'https://openlibrary.org' + key});
      }
    }));
    return out;
  },
};
const googlebooks: SourceDef = {
  id: 'googlebooks', name: 'Google Books', site: 'https://books.google.com', direction: 'literature', defaultOn: false,
  note: '覆盖面广，含不少中文书；匿名额度经常用完，建议在设置里填写自己的 API 密钥。',
  async sample(theme, want, ctx) {
    const subjects = take(shuffle(theme.query.googlebooks?.subjects ?? [], ctx.rng), 2); if (!subjects.length) return [];
    const out: WorkCard[] = [], key = ctx.googleKey ? '&key=' + encodeURIComponent(ctx.googleKey) : '';
    await Promise.all(subjects.flatMap(subject => [true, false].map(async zh => {
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('subject:"' + subject + '"')}&maxResults=40&startIndex=${pickInt(ctx.rng, 120)}&printType=books${zh ? '&langRestrict=zh' : ''}${key}`;
      const b = rec(await ctx.net.json(url, {timeoutMs: 15000, ...(ctx.signal ? {signal: ctx.signal} : {})}));
      for (const it of arr(b.items).map(rec)) {
        const id = str(it.id, 40), v = rec(it.volumeInfo), title = str(v.title, 120); if (!id || !title) continue;
        const cover = https(rec(v.imageLinks).thumbnail ?? rec(v.imageLinks).smallThumbnail), y = year(v.publishedDate), summary = shortSummary(str(v.description, 2000));
        out.push({key: 'googlebooks:' + id, source: 'googlebooks', sourceId: id, title: str(v.subtitle) ? `${title}：${str(v.subtitle, 60)}` : title,
          creators: arr(v.authors).map(a => str(a, 60)).filter((x): x is string => !!x).slice(0, 3), ...(y ? {year: y} : {}), media: 'book', ...(cover ? {cover} : {}),
          ...(summary ? {summary, summaryLang: CJK.test(summary) ? 'zh' : 'en'} : {}), tags: arr(v.categories).map(x => str(x, 40)).filter((x): x is string => !!x), ...(str(v.infoLink, 400) ? {url: https(v.infoLink)} : {})});
      }
    })).map(p => p.catch(() => undefined)));
    return take(out, want * 2);
  },
};
const archive: SourceDef = {
  id: 'archive', name: 'Internet Archive', site: 'https://archive.org', direction: 'literature', defaultOn: false,
  note: '数字馆藏里的文本（多为公版与扫描本），可直接在线阅读；条目多为馆藏著录，作品知名度参差。',
  async sample(theme, want, ctx) {
    const subjects = take(shuffle(theme.query.archive?.subjects ?? [], ctx.rng), 2); if (!subjects.length) return [];
    const out: WorkCard[] = [];
    await Promise.all(subjects.map(async subject => {
      const q = `subject:("${subject.replace(/"/g, '')}") AND mediatype:texts`;
      const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=description&rows=${Math.min(60, want)}&page=${1 + pickInt(ctx.rng, 6)}&sort%5B%5D=${encodeURIComponent('downloads desc')}&output=json`;
      const b = rec(await ctx.net.json(url, {timeoutMs: 15000, ...(ctx.signal ? {signal: ctx.signal} : {})}));
      for (const d of arr(rec(b.response).docs).map(rec)) {
        const id = str(d.identifier, 100), title = str(Array.isArray(d.title) ? d.title[0] : d.title, 140); if (!id || !title) continue;
        const creator = Array.isArray(d.creator) ? d.creator : d.creator ? [d.creator] : [], y = year(d.year), desc = shortSummary(str(Array.isArray(d.description) ? d.description.join(' ') : d.description, 1500));
        out.push({key: 'archive:' + id, source: 'archive', sourceId: id, title, creators: creator.map(c => str(c, 60)).filter((x): x is string => !!x).slice(0, 2), ...(y ? {year: y} : {}),
          media: 'book', cover: `https://archive.org/services/img/${encodeURIComponent(id)}`, ...(desc && desc.length > 40 ? {summary: desc, summaryLang: CJK.test(desc) ? 'zh' : 'en'} : {}), url: `https://archive.org/details/${encodeURIComponent(id)}`});
      }
    }));
    return out;
  },
};

/* ---------- ACGN ---------- */
const BGM_PAGE = 20;
const BGM_CREATOR_KEYS = ['作者', '原作', '导演', '监督', '开发', '游戏制作', '制作', '脚本', '剧本', '作画', '出版社'];
function bangumiCreators(infobox: unknown): string[] {
  const out: string[] = [];
  for (const row of arr(infobox).map(rec)) {
    if (!BGM_CREATOR_KEYS.includes(String(row.key))) continue;
    const vals = Array.isArray(row.value) ? row.value.map(v => rec(v).v) : [row.value];
    for (const v of vals) {const s = str(v, 40); if (s && !out.includes(s)) out.push(s);}
    if (out.length >= 3) break;
  }
  return out;
}
export function bangumiMedia(d: Record<string, unknown>): WorkMedia {
  const type = Number(d.type), platform = String(d.platform ?? ''), tags = arr(d.tags).map(t => String(rec(t).name ?? ''));
  if (type === 2) return 'anime';
  if (type === 4) return /galgame|视觉小说|AVG|ADV/i.test(platform + ' ' + tags.join(' ')) ? 'vn' : 'game';
  if (type === 1) return /漫画/.test(platform) ? 'manga' : /小说/.test(platform) ? (tags.includes('轻小说') ? 'lightnovel' : 'novel') : 'book';
  return 'other';
}
export function bangumiCard(d: Record<string, unknown>): WorkCard | undefined {
  const id = Number(d.id); if (!(id > 0)) return undefined;
  const name = str(d.name, 120), cn = str(d.name_cn, 120), title = cn ?? name; if (!title) return undefined;
  const images = rec(d.images), cover = https(images.common ?? images.large ?? images.medium), thumb = https(images.small ?? images.grid), summary = shortSummary(str(d.summary, 3000)), y = year(d.date), score = Number(rec(d.rating).score);
  const creators = bangumiCreators(d.infobox);
  return {key: 'bangumi:' + id, source: 'bangumi', sourceId: String(id), title, ...(name && name !== title ? {original: name} : {}), ...(creators.length ? {creators} : {}), ...(y ? {year: y} : {}),
    media: bangumiMedia(d), ...(cover ? {cover} : {}), ...(thumb ? {thumb} : {}), ...(summary ? {summary, summaryLang: 'zh' as const} : {}),
    tags: arr(d.tags).map(t => str(rec(t).name, 20)).filter((x): x is string => !!x).slice(0, 8), url: 'https://bgm.tv/subject/' + id,
    ...(score > 0 ? {score} : {}), ...(d.nsfw === true ? {nsfw: true} : {})};
}
const bangumi: SourceDef = {
  id: 'bangumi', name: 'Bangumi 番组计划', site: 'https://bgm.tv', direction: 'acgn', defaultOn: true, primary: true,
  note: '中文圈 ACGN 首选：动画、书籍（漫画 / 轻小说）、游戏都有中文标题、简介、标签与角色。',
  async sample(theme, want, ctx) {
    const q = theme.query.bangumi; if (!q?.tags.length) return [];
    const tags = take(shuffle(q.tags, ctx.rng), 3), per = Math.ceil(want / tags.length) + 8, out: WorkCard[] = [];
    await Promise.all(tags.map(async tag => {
      const types = q.types?.length ? q.types : [1, 2, 4];
      const filter = (ranked: boolean) => ({type: types, tag: [tag], ...(ranked ? {rank: ['>0']} : {}), ...(ctx.nsfw ? {} : {nsfw: false})});
      const call = (offset: number, limit: number, ranked: boolean) => ctx.net.json(`https://api.bgm.tv/v0/search/subjects?limit=${limit}&offset=${offset}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({keyword: '', sort: 'rank', filter: filter(ranked)}), timeoutMs: 20000, ...(ctx.signal ? {signal: ctx.signal} : {})}).then(rec);
      const memoKey = 'bgm:' + types.join(',') + ':' + tag;
      let total = Number(ctx.memo.get(memoKey)) || 0, ranked = ctx.memo.get(memoKey + ':ranked') !== false, rows: unknown[] = [];
      // 实测（2026-11）：搜索接口每页最多回 20 条，limit 再大也一样；不够就随机多翻几页（不同页码，最多 3 页）。
      const limit = BGM_PAGE, pages = (n: number) => {const last = Math.max(0, Math.floor((total - 1) / limit)), picked = new Set<number>(); for (let i = 0; i < 12 && picked.size < Math.min(n, last); i++) picked.add(1 + pickInt(ctx.rng, last)); return [...picked];};
      if (!total) {
        let first = await call(0, limit, true);
        if (Number(first.total) < 30) {first = await call(0, limit, false); ranked = false;}
        total = Math.min(1000, Number(first.total) || 0); ctx.memo.set(memoKey, total); ctx.memo.set(memoKey + ':ranked', ranked);
        rows = arr(first.data);
        if (total > limit * 2) {
          rows = rows.slice(0, Math.ceil(limit / 3));
          for (const page of pages(Math.min(3, Math.ceil((per - rows.length) / limit)))) rows.push(...arr((await call(page * limit, limit, ranked)).data));
        } else if (total > limit) rows.push(...arr((await call(limit, limit, ranked)).data));
      } else for (const page of total > limit ? pages(Math.min(3, Math.ceil(per / limit))) : [0]) rows.push(...arr((await call(page * limit, limit, ranked)).data));
      for (const d of rows.map(rec)) {const c = bangumiCard(d); if (c && (ctx.nsfw || !c.nsfw)) out.push(c);}
    }));
    return out;
  },
};
const ANILIST_FIELDS = 'id idMal type format title{romaji english native} coverImage{large medium} description(asHtml:false) startDate{year} genres tags{name rank isMediaSpoiler} averageScore siteUrl isAdult staff(perPage:3,sort:RELEVANCE){edges{role node{name{full native}}}}';
export function anilistMedia(format: unknown): WorkMedia {
  const f = String(format ?? ''); return f === 'NOVEL' ? 'lightnovel' : f === 'MANGA' || f === 'ONE_SHOT' ? 'manga' : f ? 'anime' : 'other';
}
export function anilistCard(m: Record<string, unknown>): WorkCard | undefined {
  const id = Number(m.id); if (!(id > 0)) return undefined;
  const t = rec(m.title), native = str(t.native, 120), english = str(t.english, 120) ?? str(t.romaji, 120), title = readable(native) ? native! : english ?? native;
  if (!title) return undefined;
  const summary = shortSummary(str(m.description, 4000)), y = year(rec(m.startDate).year), score = Number(m.averageScore);
  const creators = arr(rec(m.staff).edges).map(rec).filter(e => /Original|Creator|Story|Director|Author/i.test(String(e.role))).map(e => str(rec(rec(e.node).name).native ?? rec(rec(e.node).name).full, 40)).filter((x): x is string => !!x).slice(0, 3);
  const tags = [...arr(m.genres).map(x => str(x, 24)), ...arr(m.tags).map(rec).filter(x => !x.isMediaSpoiler && Number(x.rank) >= 60).map(x => str(x.name, 24))].filter((x): x is string => !!x).slice(0, 8);
  const cover = https(rec(m.coverImage).large), thumb = https(rec(m.coverImage).medium);
  return {key: 'anilist:' + id, source: 'anilist', sourceId: String(id), title, ...(native && native !== title ? {original: native} : {}), ...(english && english !== title ? {english} : {}),
    ...(creators.length ? {creators} : {}), ...(y ? {year: y} : {}), media: anilistMedia(m.format), ...(cover ? {cover} : {}), ...(thumb ? {thumb} : {}), ...(summary ? {summary, summaryLang: 'en' as const} : {}),
    tags, ...(str(m.siteUrl, 200) ? {url: str(m.siteUrl, 200)} : {}), ...(score > 0 ? {score: score / 10} : {}), ...(m.isAdult === true ? {nsfw: true} : {})};
}
const anilist: SourceDef = {
  id: 'anilist', name: 'AniList', site: 'https://anilist.co', direction: 'acgn', defaultOn: true,
  note: '动画 / 漫画 / 轻小说，英文体裁与细分标签很全，与 Bangumi 互补。',
  async sample(theme, want, ctx) {
    const q = theme.query.anilist; if (!q || !(q.genres?.length || q.tags?.length)) return [];
    const types = q.types?.length ? q.types : ['ANIME', 'MANGA'] as const, filters: Record<string, string[]>[] = [];
    if (q.genres?.length) filters.push({genres: q.genres}); if (q.tags?.length) filters.push({tags: q.tags});
    const out: WorkCard[] = [], per = Math.min(40, Math.ceil(want / filters.length) + 6);
    await Promise.all(filters.map(async f => {
      const type = types[pickInt(ctx.rng, types.length)]!, query = `query($page:Int,$perPage:Int,$genres:[String],$tags:[String],$type:MediaType${ctx.nsfw ? '' : ',$adult:Boolean'}){Page(page:$page,perPage:$perPage){media(type:$type,genre_in:$genres,tag_in:$tags,sort:POPULARITY_DESC${ctx.nsfw ? '' : ',isAdult:$adult'}){${ANILIST_FIELDS}}}}`;
      const call = (page: number) => ctx.net.json('https://graphql.anilist.co', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({query, variables: {page, perPage: per, type, ...f, ...(ctx.nsfw ? {} : {adult: false})}}), timeoutMs: 20000, ...(ctx.signal ? {signal: ctx.signal} : {})}).then(rec);
      const page = 1 + pickInt(ctx.rng, 6);
      let media = arr(rec(rec(rec(await call(page)).data).Page).media);
      if (!media.length && page > 1) media = arr(rec(rec(rec(await call(1)).data).Page).media);
      for (const m of media.map(rec)) {const c = anilistCard(m); if (c && (ctx.nsfw || !c.nsfw)) out.push(c);}
    }));
    return out;
  },
};
const VNDB_FIELDS = 'id, title, alttitle, titles.title, titles.lang, released, image.url, image.thumbnail, image.sexual, description, rating, tags.name, tags.rating, tags.spoiler, developers.name';
export function vndbCard(v: Record<string, unknown>, nsfw: boolean): WorkCard | undefined {
  const id = str(v.id, 20); if (!id || !/^v\d+$/.test(id)) return undefined;
  const titles = arr(v.titles).map(rec), zh = titles.find(t => /^zh(-Hans)?$/i.test(String(t.lang)))?.title ?? titles.find(t => /^zh/i.test(String(t.lang)))?.title;
  const alt = str(v.alttitle, 120), romaji = str(v.title, 120), title = str(zh, 120) ?? (readable(alt) || (alt && KANA.test(alt)) ? alt : romaji) ?? alt;
  if (!title) return undefined;
  const image = rec(v.image), sexual = Number(image.sexual) || 0, cover = nsfw || sexual < 1 ? https(image.url) : undefined, thumb = cover ? https(image.thumbnail) : undefined, y = year(v.released), summary = shortSummary(str(v.description, 4000)), rating = Number(v.rating);
  const tags = arr(v.tags).map(rec).filter(t => Number(t.spoiler) === 0 && Number(t.rating) >= 2).map(t => str(t.name, 24)).filter((x): x is string => !!x).slice(0, 8);
  const devs = arr(v.developers).map(d => str(rec(d).name, 40)).filter((x): x is string => !!x).slice(0, 2);
  return {key: 'vndb:' + id, source: 'vndb', sourceId: id, title, ...(alt && alt !== title ? {original: alt} : {}), ...(romaji && romaji !== title ? {english: romaji} : {}), ...(devs.length ? {creators: devs} : {}),
    ...(y ? {year: y} : {}), media: 'vn', ...(cover ? {cover} : {}), ...(thumb ? {thumb} : {}), ...(summary ? {summary, summaryLang: 'en' as const} : {}), tags, url: 'https://vndb.org/' + id, ...(rating > 0 ? {score: rating / 10} : {}), ...(sexual >= 1.5 ? {nsfw: true} : {})};
}
async function vndbTagIds(tags: string[], ctx: SourceCtx): Promise<string[]> {
  const out: string[] = [];
  for (const t of tags) {
    if (/^g\d+$/.test(t)) {out.push(t); continue;}
    const name = t.replace(/^search:/, '').trim(); if (!name) continue;
    const memoKey = 'vndb-tag:' + name.toLowerCase(); let id = ctx.memo.get(memoKey) as string | undefined;
    if (id === undefined) {
      const b = rec(await ctx.net.json('https://api.vndb.org/kana/tag', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({filters: ['search', '=', name], fields: 'id, name, vn_count', results: 5}), timeoutMs: 12000, ...(ctx.signal ? {signal: ctx.signal} : {})}));
      const rows = arr(b.results).map(rec), exact = rows.find(r => String(r.name).toLowerCase() === name.toLowerCase()) ?? rows[0];
      id = typeof exact?.id === 'string' ? exact.id : ''; ctx.memo.set(memoKey, id);
    }
    if (id) out.push(id);
  }
  return out;
}
const vndb: SourceDef = {
  id: 'vndb', name: 'VNDB', site: 'https://vndb.org', direction: 'acgn', defaultOn: true,
  note: '视觉小说最深的资料库：故事简介、标签与角色；默认排除含性内容标签的作品。',
  async sample(theme, want, ctx) {
    const q = theme.query.vndb; if (!q) return [];
    const ids = await vndbTagIds(q.tags, ctx);
    if (q.tags.length && !ids.length) return [];
    const tagFilter = ids.length === 0 ? undefined : ids.length === 1 ? ['tag', '=', ids[0]] : ['or', ...ids.map(id => ['tag', '=', id])];
    const filters = ctx.nsfw ? tagFilter ?? ['id', '>=', 'v1'] : tagFilter ? ['and', tagFilter, ['tag', '!=', 'g23']] : ['tag', '!=', 'g23'];
    const call = (page: number, count: boolean) => ctx.net.json('https://api.vndb.org/kana/vn', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({filters, fields: VNDB_FIELDS, sort: 'votecount', reverse: true, results: Math.min(40, want), page, ...(count ? {count: true} : {})}), timeoutMs: 20000, ...(ctx.signal ? {signal: ctx.signal} : {})}).then(rec);
    const memoKey = 'vndb:' + JSON.stringify(filters); let pages = Number(ctx.memo.get(memoKey)) || 0, rows: unknown[];
    if (!pages) {const first = await call(1, true); pages = Math.max(1, Math.min(10, Math.ceil((Number(first.count) || 0) / Math.min(40, want)))); ctx.memo.set(memoKey, pages); rows = arr(first.results); if (pages > 1) rows = [...rows.slice(0, 12), ...arr((await call(1 + pickInt(ctx.rng, pages), false)).results)];}
    else rows = arr((await call(1 + pickInt(ctx.rng, pages), false)).results);
    return rows.map(rec).map(v => vndbCard(v, ctx.nsfw)).filter((c): c is WorkCard => !!c && (ctx.nsfw || !c.nsfw));
  },
};
export function jikanCard(d: Record<string, unknown>, kind: 'anime' | 'manga'): WorkCard | undefined {
  const id = Number(d.mal_id); if (!(id > 0)) return undefined;
  const ja = str(d.title_japanese, 120), en = str(d.title_english, 120) ?? str(d.title, 120), title = readable(ja) ? ja! : en ?? ja; if (!title) return undefined;
  const cover = https(rec(rec(d.images).jpg).large_image_url ?? rec(rec(d.images).jpg).image_url), summary = shortSummary(str(d.synopsis, 3000));
  const y = year(d.year ?? rec(rec(rec(d.aired).prop).from).year ?? rec(rec(rec(d.published).prop).from).year), score = Number(d.score), type = String(d.type ?? '');
  return {key: `jikan:${kind}:${id}`, source: 'jikan', sourceId: `${kind}:${id}`, title, ...(ja && ja !== title ? {original: ja} : {}), ...(en && en !== title ? {english: en} : {}), ...(y ? {year: y} : {}),
    media: kind === 'anime' ? 'anime' : /novel/i.test(type) ? 'lightnovel' : 'manga', ...(cover ? {cover} : {}), ...(summary ? {summary, summaryLang: 'en' as const} : {}),
    tags: [...arr(d.genres), ...arr(d.themes)].map(g => str(rec(g).name, 24)).filter((x): x is string => !!x).slice(0, 8), ...(str(d.url, 200) ? {url: str(d.url, 200)} : {}), ...(score > 0 ? {score} : {})};
}
const jikan: SourceDef = {
  id: 'jikan', name: 'Jikan · MyAnimeList', site: 'https://jikan.moe', direction: 'acgn', defaultOn: false,
  note: 'MyAnimeList 的非官方开放接口；部分网络环境下连接很慢，默认不开启。',
  async sample(theme, want, ctx) {
    const q = theme.query.jikan; if (!q?.genres.length) return [];
    const genres = take(shuffle(q.genres, ctx.rng), 2), kinds = q.kinds?.length ? q.kinds : ['anime', 'manga'] as const, out: WorkCard[] = [];
    await Promise.all(genres.map(async g => {
      const kind = kinds[pickInt(ctx.rng, kinds.length)]!;
      const b = rec(await ctx.net.json(`https://api.jikan.moe/v4/${kind}?genres=${g}&order_by=members&sort=desc&limit=${Math.min(25, Math.max(10, Math.ceil(want / genres.length)))}&page=${1 + pickInt(ctx.rng, 5)}${ctx.nsfw ? '' : '&sfw=true'}`, {timeoutMs: 15000, ...(ctx.signal ? {signal: ctx.signal} : {})}));
      for (const d of arr(b.data).map(rec)) {const c = jikanCard(d, kind); if (c) out.push(c);}
    }));
    return out;
  },
};

export const SOURCES: readonly SourceDef[] = [wikidata, openlibrary, googlebooks, archive, bangumi, anilist, vndb, jikan];
export const SOURCE_BY_ID: Readonly<Record<SourceId, SourceDef>> = Object.fromEntries(SOURCES.map(s => [s.id, s])) as Record<SourceId, SourceDef>;
export const defaultSourceSwitches = (): Record<SourceId, boolean> => Object.fromEntries(SOURCES.map(s => [s.id, s.defaultOn])) as Record<SourceId, boolean>;

/* ---------- 合并、去重、均衡抽取 ---------- */
export const normTitle = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
export function workKeys(w: Pick<WorkCard, 'title' | 'original' | 'english'>): string[] {
  return [...new Set([w.title, w.original, w.english].filter((x): x is string => !!x).map(normTitle).filter(k => k.length >= 2))];
}
export function richness(w: WorkCard): number {
  return (CJK.test(w.title) ? 3 : 0) + (w.summary ? 2 : 0) + (w.cover ? 2 : 0) + (w.year ? 1 : 0) + (w.creators?.length ? 1 : 0) + (SOURCE_BY_ID[w.source]?.primary ? 1 : 0);
}
/** 同一部作品在不同资料库里出现多次时只留资料最全的一份（标题 / 原题 / 英文题任一相同即视为同一部；年份相差超过 1 年不算）。 */
export function dedupeWorks(works: readonly WorkCard[]): WorkCard[] {
  const out: WorkCard[] = [], index = new Map<string, number>();
  for (const w of works) {
    const keys = workKeys(w);
    const hit = keys.map(k => index.get(k)).find(i => i !== undefined && (!out[i]!.year || !w.year || Math.abs(out[i]!.year! - w.year) <= 1));
    if (hit === undefined) {out.push(w); for (const k of keys) if (!index.has(k)) index.set(k, out.length - 1); continue;}
    const old = out[hit]!, keep = richness(w) > richness(old) ? w : old, other = keep === w ? old : w;
    out[hit] = {...keep, ...(!keep.cover && other.cover ? {cover: other.cover} : {}), ...(!keep.summary && other.summary ? {summary: other.summary, summaryLang: other.summaryLang!} : {}),
      ...(!keep.year && other.year ? {year: other.year} : {}), ...(!keep.creators?.length && other.creators?.length ? {creators: other.creators} : {})};
    for (const k of keys) if (!index.has(k)) index.set(k, hit);
  }
  return out;
}
/** 轮流从各资料库取作品，主资料库每轮取两部，避免一个库占满整片书海。 */
export function balancedPick(bySource: ReadonlyMap<SourceId, WorkCard[]>, want: number, rng: () => number): WorkCard[] {
  const lists = [...bySource.entries()].map(([id, list]) => ({id, list: shuffle(list, rng), weight: SOURCE_BY_ID[id]?.primary ? 2 : 1}));
  const seen = new Set<string>(), picked: WorkCard[] = [];
  while (picked.length < want && lists.some(l => l.list.length)) {
    for (const l of lists) for (let k = 0; k < l.weight && l.list.length && picked.length < want; k++) {
      const w = l.list.shift()!; const keys = workKeys(w); if (keys.some(x => seen.has(x)) || seen.has(w.key)) {k--; continue;}
      seen.add(w.key); for (const x of keys) seen.add(x); picked.push(w);
    }
  }
  return shuffle(picked, rng);
}
export type SpreadOptions = {want?: number; enabled: Readonly<Record<SourceId, boolean>>; onReport?(r: SourceReport): void; now?: () => number};
/** 撒网：同时询问这个主题用到的全部资料库，返回去重后的作品与每个库的结果。 */
export async function gatherSpread(theme: GachaTheme, ctx: SourceCtx, options: SpreadOptions): Promise<{works: WorkCard[]; reports: SourceReport[]}> {
  const want = options.want ?? 54, now = options.now ?? (() => Date.now());
  const ids = themeSources(theme).filter(id => options.enabled[id] && SOURCE_BY_ID[id]), reports: SourceReport[] = [], found = new Map<SourceId, WorkCard[]>();
  if (!ids.length) throw Error('这个主题没有可用的资料库：请在设置里打开至少一个资料库');
  // 每个库都按“只有它能用”来要候选：有的库会失败，剩下的也要凑得出一整片。
  const perSource = Math.ceil(want * 1.25);
  await Promise.all(ids.map(async id => {
    const def = SOURCE_BY_ID[id], t0 = now();
    try {
      const list = (await def.sample(theme, perSource, ctx)).filter(w => ctx.nsfw || !w.nsfw);
      found.set(id, dedupeWorks(list));
      const r = {source: id, name: def.name, count: list.length, ms: now() - t0}; reports.push(r); options.onReport?.(r);
    } catch (e) {
      const r = {source: id, name: def.name, count: 0, ms: now() - t0, error: String((e as Error)?.message ?? e).slice(0, 80)}; reports.push(r); options.onReport?.(r);
    }
  }));
  if (ctx.signal?.aborted) throw Error('已取消');
  const merged = dedupeWorks([...found.values()].flat()), bySource = new Map<SourceId, WorkCard[]>();
  for (const w of merged) {const list = bySource.get(w.source) ?? []; list.push(w); bySource.set(w.source, list);}
  const works = balancedPick(bySource, want, ctx.rng);
  for (const w of works) if (!w.overview && w.summaryLang === 'zh' && w.summary) w.overview = firstSentence(w.summary);
  return {works, reports: reports.sort((a, b) => ids.indexOf(a.source) - ids.indexOf(b.source))};
}
/** 中文简介的第一句（最多 70 字），当作卡片上的一句话览概。 */
export function firstSentence(text: string, max = 70): string {
  const t = text.replace(/\s+/g, ' ').trim(), m = /^(.{8,}?[。！？!?])/.exec(t);
  const s = (m ? m[1]! : t);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
