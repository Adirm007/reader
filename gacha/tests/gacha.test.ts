import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RULES,DESTINED_QUALITY,STARS,advancePity,chance6,drawStars,emptyPity,normalizePity,ratesText,rollStar,seededRng,DESTINED_SCALE,STAR_SCALE,starOfQuality,type Star} from '../src/gacha/rarity';
import {DEFAULT_THEMES,customTheme,normalizeThemes,themeSources} from '../src/gacha/themes';
import {createNet,mapLimit,plainText,NetError,type FetchLike} from '../src/gacha/net';
import {SOURCE_BY_ID,anilistCard,bangumiCard,balancedPick,dedupeWorks,firstSentence,gatherSpread,jikanCard,vndbCard,wikidataQuery,stripDisambiguation,type WorkCard,type SourceCtx} from '../src/gacha/sources';
import {buildDossier,dossierText,fandomRelevant,fandomSlugs,pickWikiSections,wikiSections} from '../src/gacha/dossier';
import {KIND_MIN,MYTHIC_ITEMS,POOL_MAX,POOL_MIN,extractJson,fillTiers,kindPrompt,liftMythics,normalizePlan,normalizePool,offlinePool,overviewPrompt,parseOverviews,parsePool,planPrompt,poolSize,readReply,salvageArray,type GachaCard} from '../src/gacha/pool';
import {CAST_COST,DRAW_COST,SPREAD_SIZE,TEN_COST,createGacha,deviceStore,localGachaPort,normalizeDurable,normalizeSettings,withPoints,type GachaDurable,type GachaPort} from '../src/gacha/session';
import {BAG_TAG,CONTRACT_PRICE,RECYCLE_DIVISOR,addToBag,applyGachaDraw,applyRecycle,gachaBagEntry,listGachaBag,recyclePrice} from '../src/gacha/bag';
import {BOOKSEA_BUSY,DURABLE_KEY,bookseaActive,createReaderGacha,readerGachaPort,type ReaderGachaHost,type ReaderTx} from '../src/reader/gacha-reader';

/* ---------- 假网络：按 URL 片段返回 JSON ---------- */
type Route = [RegExp, unknown | ((url: string, init?: RequestInit) => unknown)];
function fakeFetch(routes: Route[], log: string[] = []): FetchLike {
  return async (url, init) => {
    log.push((init?.method ?? 'GET') + ' ' + url);
    for (const [re, body] of routes) if (re.test(url)) {
      const v = typeof body === 'function' ? (body as (u: string, i?: RequestInit) => unknown)(url, init) : body;
      if (v instanceof Error) throw v;
      if (typeof v === 'number') return new Response('{}', {status: v});
      return new Response(JSON.stringify(v), {status: 200});
    }
    return new Response('{"error":"no route"}', {status: 404});
  };
}
const ctxOf = (fetcher: FetchLike, rng = seededRng(7)): SourceCtx => ({net: createNet(fetcher, {useProxy: false}), rng, nsfw: false, memo: new Map()});
const work = (key: string, title: string, extra: Partial<WorkCard> = {}): WorkCard => ({key, source: key.split(':')[0] as WorkCard['source'], sourceId: key.split(':').slice(1).join(':'), title, media: 'anime', ...extra});

test('抽卡概率：合计为 1；小保底 120 抽内必出 6★（没有逐抽提高、没有 5★ 保底）；十连至少一张 3★；大保底攒 200 点', () => {
  assert.ok(Math.abs(STARS.reduce((n, s) => n + DEFAULT_RULES.rates[s], 0) - 1) < 1e-9);
  assert.deepEqual(DEFAULT_RULES.rates, {1: .52, 2: .30, 3: .12, 4: .045, 5: .012, 6: .003});
  assert.deepEqual([DEFAULT_RULES.pity6, DEFAULT_RULES.spark, DEFAULT_RULES.tenFloor], [120, 200, 3]);
  assert.equal(chance6({since6: 119, total: 119}), 1, '第 120 抽必出');
  assert.equal(chance6({since6: 118, total: 118}), DEFAULT_RULES.rates[6], '第 119 抽还是基础概率');
  assert.equal(chance6({since6: 0, total: 0}), DEFAULT_RULES.rates[6]);
  assert.equal(rollStar(() => .999, {since6: 119, total: 0}), 6);
  assert.equal(rollStar(() => .999, {since6: 49, total: 0}), 1, '不再有 50 抽 5★ 保底');
  const rng = seededRng(123), counts: Record<Star, number> = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0};
  let pity = emptyPity(), maxGap = 0, gap = 0;
  for (let i = 0; i < 40000; i++) {const s = rollStar(rng, pity); counts[s]++; pity = advancePity(pity, s); gap = s === 6 ? 0 : gap + 1; maxGap = Math.max(maxGap, gap);}
  assert.ok(maxGap < 120, '最多 119 抽没有 6★');
  assert.ok(counts[1] > counts[2] && counts[2] > counts[3] && counts[3] > counts[4] && counts[4] > counts[5], JSON.stringify(counts));
  const effective6 = counts[6] / 40000; assert.ok(effective6 > .008 && effective6 < .012, '保底之后的综合 6★ 率 ' + effective6);
  for (let seed = 1; seed < 400; seed++) {
    const {stars, pity: p} = drawStars(10, seededRng(seed), emptyPity());
    assert.equal(stars.length, 10); assert.ok(Math.max(...stars) >= 3, 'seed ' + seed); assert.equal(p.total, 10);
  }
  const low = drawStars(10, () => 0.5, emptyPity(), {...DEFAULT_RULES, rates: {1: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}});
  assert.deepEqual(low.stars, [1, 1, 1, 1, 1, 1, 1, 1, 1, 3]);
  assert.deepEqual(normalizePity({since6: 7, since5: 3, total: 9}), {since6: 7, total: 9}, '旧存档里的 5★ 保底计数不再使用');
  assert.match(ratesText()[1]!, /小保底：120 抽内必出一张随机神话/); assert.match(ratesText()[1]!, /攒满 200 点可兑换这部作品小池里任选的一张神话；点数只能在这部作品的小池里使用，不跨池互通/);
  assert.match(ratesText()[1]!, /每次十连至少一张 3★/); assert.match(ratesText(DEFAULT_RULES, STAR_SCALE)[1]!, /随机6★/);
  assert.equal(DESTINED_SCALE.label(6), '神话'); assert.equal(DESTINED_SCALE.label(1), '普通'); assert.equal(STAR_SCALE.label(3), '3★'); assert.equal(starOfQuality('史诗'), 4);
});
test('主题：默认主题都有资料库；自定义主题生成查询；坏数据丢弃', () => {
  assert.ok(DEFAULT_THEMES.filter(t => t.direction === 'literature').length >= 12);
  assert.ok(DEFAULT_THEMES.filter(t => t.direction === 'acgn').length >= 15);
  for (const t of DEFAULT_THEMES) {assert.ok(themeSources(t).length, t.id); for (const id of themeSources(t)) assert.ok(SOURCE_BY_ID[id], id);}
  assert.equal(new Set(DEFAULT_THEMES.map(t => t.id)).size, DEFAULT_THEMES.length);
  const acg = customTheme({name: '赛博侦探', direction: 'acgn', zh: '侦探', en: 'detective'}, 1)!;
  assert.deepEqual(acg.query.bangumi, {tags: ['侦探']}); assert.deepEqual(acg.query.anilist, {tags: ['Detective']}); assert.deepEqual(acg.query.vndb, {tags: ['search:detective']});
  const lit = customTheme({name: '海盗', direction: 'literature', en: 'Pirate Stories'}, 2)!;
  assert.deepEqual(lit.query.openlibrary, {subjects: ['pirate_stories']});
  assert.equal(customTheme({name: '', direction: 'acgn', zh: 'x'}), undefined);
  assert.deepEqual(normalizeThemes([acg, {id: 'lit-myth', name: 'x'}, 'bad']).map(t => t.id), [acg.id]);
});
test('网络：超时、跨域改走酒馆代理、HTTP 错误说明、非 JSON', async () => {
  const slow = createNet(() => new Promise(() => {}), {timeoutMs: 20, useProxy: false});
  await assert.rejects(slow.json('https://x.test/a'), (e: Error) => e instanceof NetError && e.message === '超时');
  const log: string[] = [];
  const cors = createNet(async (url) => {log.push(url); if (!url.startsWith('http://st.local/proxy/')) throw new TypeError('Failed to fetch'); return new Response('{"ok":1}');}, {proxyBase: 'http://st.local/', timeoutMs: 1000});
  assert.deepEqual(await cors.json('https://api.example/x?y=1'), {ok: 1});
  assert.deepEqual(log, ['https://api.example/x?y=1', 'http://st.local/proxy/https://api.example/x?y=1']);
  assert.deepEqual(cors.proxied(), ['api.example']);
  const noProxy = createNet(async () => {throw new TypeError('Failed to fetch');}, {useProxy: false});
  await assert.rejects(noProxy.json('https://a.test'), /跨域/);
  const limited = createNet(async () => new Response('{}', {status: 429}), {useProxy: false});
  await assert.rejects(limited.json('https://a.test'), /HTTP 429（请求太频繁或额度已用完）/);
  const html = createNet(async () => new Response('<html>'), {useProxy: false});
  await assert.rejects(html.json('https://a.test'), /不是 JSON/);
  let running = 0, peak = 0;
  await mapLimit([1, 2, 3, 4, 5, 6], 2, async () => {running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 2)); running--;});
  assert.equal(peak, 2);
  assert.equal(plainText('A<br>b <i>c</i> [url=https://x]d[/url] [spoiler]秘密[/spoiler] ~!剧透!~ __e__ &amp;'), 'A\nb c d e &');
});
test('资料库字段映射：Bangumi / AniList / VNDB / Jikan', () => {
  const b = bangumiCard({id: 1960, type: 2, name: 'lain', name_cn: '玲音', summary: '少女岩仓玲音收到一封来自已死同学的邮件。故事由此展开。', date: '1998-07-06', platform: 'TV', images: {common: 'http://lain.bgm.tv/r/400/x.jpg', small: 'https://lain.bgm.tv/r/200/x.jpg'}, tags: [{name: '科幻', count: 9}], rating: {score: 8.3}, infobox: [{key: '导演', value: '中村隆太郎'}, {key: '别名', value: [{v: 'x'}]}]})!;
  assert.equal(b.title, '玲音'); assert.equal(b.original, 'lain'); assert.equal(b.cover, 'https://lain.bgm.tv/r/400/x.jpg'); assert.equal(b.thumb, 'https://lain.bgm.tv/r/200/x.jpg');
  assert.equal(b.media, 'anime'); assert.equal(b.year, 1998); assert.deepEqual(b.creators, ['中村隆太郎']); assert.equal(b.summaryLang, 'zh'); assert.equal(b.url, 'https://bgm.tv/subject/1960');
  assert.equal(bangumiCard({id: 2, type: 1, name: 'x', platform: '小说', tags: [{name: '轻小说'}]})!.media, 'lightnovel');
  assert.equal(bangumiCard({id: 3, type: 4, name: 'y', platform: 'Galgame', tags: []})!.media, 'vn');
  const a = anilistCard({id: 30, format: 'TV', title: {romaji: 'Shin Seiki Evangelion', english: 'Neon Genesis Evangelion', native: '新世紀エヴァンゲリオン'}, coverImage: {large: 'https://s4/a.jpg', medium: 'https://s4/m.jpg'}, description: 'In the year 2015...<br>(Source: X)', startDate: {year: 1995}, genres: ['Mecha'], tags: [{name: 'Super Robot', rank: 88}, {name: 'Spoiler', rank: 90, isMediaSpoiler: true}], averageScore: 83, siteUrl: 'https://anilist.co/anime/30', staff: {edges: [{role: 'Original Creator', node: {name: {full: 'Hideaki Anno', native: '庵野秀明'}}}]}})!;
  assert.equal(a.title, '新世紀エヴァンゲリオン', '含汉字的日文原题优先'); assert.equal(a.english, 'Neon Genesis Evangelion'); assert.deepEqual(a.tags, ['Mecha', 'Super Robot']); assert.equal(a.score, 8.3); assert.deepEqual(a.creators, ['庵野秀明']);
  assert.equal(anilistCard({id: 5, format: 'MANGA', title: {native: '화산귀환', english: 'Return of the Mount Hua Sect'}})!.title, 'Return of the Mount Hua Sect', '韩文原题不当标题');
  const v = vndbCard({id: 'v17', title: 'Ever17', alttitle: 'Ever17 -the out of infinity-', titles: [{lang: 'zh-Hans', title: '时空轮回'}], released: '2002-08-29', image: {url: 'https://t.vndb.org/cv/1.jpg', thumbnail: 'https://t.vndb.org/cvt/1.jpg', sexual: 0}, description: '[url=/c1]Takeshi[/url] wakes up in LeMU.', rating: 88.1, tags: [{name: 'Mystery', rating: 2.8, spoiler: 0}, {name: 'Twist', rating: 2.9, spoiler: 2}], developers: [{name: 'KID'}]}, false)!;
  assert.equal(v.title, '时空轮回'); assert.equal(v.summary, 'Takeshi wakes up in LeMU.'); assert.deepEqual(v.tags, ['Mystery']); assert.equal(v.thumb, 'https://t.vndb.org/cvt/1.jpg');
  const explicit = vndbCard({id: 'v9', title: 'x', image: {url: 'https://t/x.jpg', sexual: 2}}, false)!;
  assert.equal(explicit.cover, undefined); assert.equal(explicit.nsfw, true);
  const j = jikanCard({mal_id: 1, title: 'Cowboy Bebop', title_japanese: 'カウボーイビバップ', images: {jpg: {large_image_url: 'https://cdn.myanimelist.net/1.jpg'}}, synopsis: 'In the year 2071...', year: 1998, genres: [{name: 'Action'}], themes: [{name: 'Space'}], score: 8.75, url: 'https://myanimelist.net/anime/1'}, 'anime')!;
  assert.equal(j.title, 'Cowboy Bebop', '纯假名原题不当标题'); assert.equal(j.original, 'カウボーイビバップ'); assert.deepEqual(j.tags, ['Action', 'Space']);
});
test('Wikidata：查询只用合法 Q 号，结果带中文标题与维基封面', async () => {
  const q = wikidataQuery(['Q24925', 'bad', 'Q1;DROP'], ['Q9134'], 's;eed', 999);
  assert.match(q, /VALUES \?g \{ wd:Q24925 \}/); assert.match(q, /VALUES \?s \{ wd:Q9134 \}/); assert.match(q, /LIMIT 200$/); assert.match(q, /"seed"/); assert.doesNotMatch(q, /DROP/);
  assert.equal(stripDisambiguation('影子 (小说)'), '影子');
  const fetcher = fakeFetch([
    [/query\.wikidata\.org/, {results: {bindings: [
      {item: {value: 'http://www.wikidata.org/entity/Q1'}, zhwiki: {value: '三体 (小说)'}, hans: {value: '三体'}, en: {value: 'The Three-Body Problem'}, author: {value: '刘慈欣'}, year: {value: '2006'}},
      {item: {value: 'http://www.wikidata.org/entity/Q2'}, zhwiki: {value: '沙丘'}, year: {value: '1965'}},
      {item: {value: 'http://www.wikidata.org/entity/bad'}, zhwiki: {value: 'x'}},
    ]}}],
    [/zh\.wikipedia\.org\/w\/api\.php\?action=query&prop=pageimages/, {query: {normalized: [{from: '三体 (小说)', to: '三体 (小说)'}], redirects: [{from: '沙丘', to: '沙丘 (小说)'}], pages: {'1': {title: '三体 (小说)', thumbnail: {source: 'http://upload.wikimedia.org/a.jpg'}}, '2': {title: '沙丘 (小说)', thumbnail: {source: 'https://upload.wikimedia.org/b.jpg'}}}}}],
  ]);
  const cards = await SOURCE_BY_ID.wikidata.sample(DEFAULT_THEMES.find(t => t.id === 'lit-scifi')!, 54, ctxOf(fetcher));
  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0], {key: 'wikidata:Q1', source: 'wikidata', sourceId: 'Q1', title: '三体', english: 'The Three-Body Problem', creators: ['刘慈欣'], year: 2006, media: 'book', url: 'https://zh.wikipedia.org/wiki/' + encodeURIComponent('三体 (小说)'), wiki: {zh: '三体 (小说)'}, cover: 'https://upload.wikimedia.org/a.jpg'});
  assert.equal(cards[1]!.cover, 'https://upload.wikimedia.org/b.jpg', '跟随重定向找封面');
});
test('Bangumi 抽样：先取总数再随机翻页；条目不足时放宽排名；R18 默认排除', async () => {
  const bodies: unknown[] = [];
  const data = (n: number, offset = 0) => Array.from({length: n}, (_, i) => ({id: 1000 + offset + i, type: 2, name: 'n' + (offset + i), name_cn: '作品' + (offset + i), images: {}, tags: [], rating: {score: 7}, ...(i === 0 && offset > 0 ? {nsfw: true} : {})}));
  const fetcher = fakeFetch([[/api\.bgm\.tv\/v0\/search\/subjects/, (url: string, init?: RequestInit) => {const body = JSON.parse(String(init?.body)); bodies.push(body); const offset = Number(/offset=(\d+)/.exec(url)![1]); return {total: body.filter.rank ? 20 : 300, data: data(10, offset)};}]]);
  const ctx = ctxOf(fetcher);
  const cards = await SOURCE_BY_ID.bangumi.sample({id: 't', direction: 'acgn', name: 't', blurb: '', query: {bangumi: {tags: ['神话']}}}, 20, ctx);
  assert.equal((bodies[0] as {filter: {rank?: string[]}}).filter.rank?.[0], '>0');
  assert.equal((bodies[1] as {filter: {rank?: string[]}}).filter.rank, undefined, '排名条目不足 30 时放宽');
  assert.equal((bodies[0] as {filter: {nsfw: boolean}}).filter.nsfw, false);
  assert.ok(cards.length >= 10 && cards.every(c => !c.nsfw));
  assert.equal(ctx.memo.get('bgm:1,2,4:神话'), 300);
});
test('去重与均衡：跨库同一部作品只留资料最全的一份；主资料库每轮两部', () => {
  const merged = dedupeWorks([
    work('anilist:30', '新世紀エヴァンゲリオン', {english: 'Neon Genesis Evangelion', year: 1995, cover: 'https://a/c.jpg'}),
    work('bangumi:265', '新世纪福音战士', {original: '新世紀エヴァンゲリオン', year: 1995, summary: '简介', summaryLang: 'zh'}),
    work('vndb:v1', 'Evangelion', {year: 2005}),
    work('bangumi:9', '同名作品', {year: 1960}), work('anilist:9', '同名作品', {year: 2020}),
  ]);
  assert.equal(merged.length, 4);
  const eva = merged.find(w => w.key === 'bangumi:265')!;
  assert.equal(eva.cover, 'https://a/c.jpg', '缺的封面从另一份补上');
  assert.equal(merged.filter(w => w.title === '同名作品').length, 2, '年份相差太大不算同一部');
  const by = new Map([['bangumi', Array.from({length: 40}, (_, i) => work('bangumi:' + i, 'B' + i))], ['anilist', Array.from({length: 40}, (_, i) => work('anilist:' + i, 'A' + i))]] as const);
  const picked = balancedPick(new Map(by), 30, seededRng(3));
  assert.equal(picked.length, 30); assert.equal(picked.filter(w => w.source === 'bangumi').length, 20);
  assert.equal(firstSentence('少女岩仓玲音收到一封邮件。随后……'), '少女岩仓玲音收到一封邮件。');
});
test('撒网：一个资料库失败不影响其他库，报告里写明原因', async () => {
  const theme = DEFAULT_THEMES.find(t => t.id === 'acg-scifi')!;
  const fetcher = fakeFetch([
    [/api\.bgm\.tv/, (_u: string, init?: RequestInit) => ({total: 900, data: Array.from({length: 40}, (_, i) => ({id: i + 1 + Number(/offset/.test(String(init?.body)) ? 0 : 0) + Math.floor(Math.random() * 1e6), type: 2, name_cn: '科幻作品' + Math.random().toString(36).slice(2), images: {}, tags: []}))})],
    [/graphql\.anilist\.co/, new TypeError('Failed to fetch')],
    [/api\.vndb\.org\/kana\/vn/, {count: 3, results: [{id: 'v1', title: 'VN one'}, {id: 'v2', title: 'VN two'}]}],
  ]);
  const reports: string[] = [];
  const {works, reports: rs} = await gatherSpread(theme, ctxOf(fetcher), {want: 54, enabled: {...Object.fromEntries(Object.keys(SOURCE_BY_ID).map(k => [k, false])), bangumi: true, anilist: true, vndb: true} as never, onReport: r => reports.push(r.source)});
  assert.equal(works.length, 54);
  assert.deepEqual(rs.map(r => r.source), ['bangumi', 'anilist', 'vndb']);
  assert.match(rs.find(r => r.source === 'anilist')!.error!, /连不上/);
  assert.ok(works.some(w => w.source === 'vndb'));
  await assert.rejects(gatherSpread(theme, ctxOf(fetcher), {enabled: Object.fromEntries(Object.keys(SOURCE_BY_ID).map(k => [k, false])) as never}), /没有可用的资料库/);
});
test('维基章节：只挑剧情与人物，子章节跟随父章节，评价与制作跳过', () => {
  const text = '导言一句。\n== 剧情 ==\n第一部的故事。\n=== 第二部 ===\n第二部的故事。\n== 制作 ==\n制作细节。\n=== 剧情设计 ===\n不该收录。\n== 登场人物 ==\n主角甲。\n== 评价 ==\n好评。';
  const {intro, sections} = wikiSections(text);
  assert.equal(intro, '导言一句。'); assert.equal(sections.length, 6);
  const picked = pickWikiSections(text, '中文维基百科');
  assert.deepEqual(picked.sections.map(s => s.heading), ['剧情', '第二部', '登场人物']);
  assert.deepEqual(fandomSlugs('The Witcher 3: Wild Hunt'), ['witcher3wildhunt', 'witcher3', 'witcher']);
});
test('小池资料：Bangumi 条目、角色（主角优先、简体中文名）与维基剧情汇总', async () => {
  const fetcher = fakeFetch([
    [/api\.bgm\.tv\/v0\/subjects\/42\/characters/, [{id: 7, name: 'サブ', relation: '配角', type: 1}, {id: 8, name: 'ヒーロー', relation: '主角', type: 1}, {id: 9, name: '机体', relation: '主角', type: 2}]],
    [/api\.bgm\.tv\/v0\/subjects\/42$/, {summary: '完整简介。', infobox: [{key: '导演', value: '某人'}, {key: '官方网站', value: 'x'}]}],
    [/api\.bgm\.tv\/v0\/characters\/8/, {summary: '热血少年。', infobox: [{key: '简体中文名', value: '英雄'}]}],
    [/api\.bgm\.tv\/v0\/characters\/7/, {summary: '', infobox: []}],
    [/zh\.wikipedia\.org\/w\/api\.php\?action=query&list=search/, {query: {search: [{title: '测试作品'}]}}],
    [/zh\.wikipedia\.org\/w\/api\.php\?action=query&prop=extracts/, {query: {pages: {'1': {title: '测试作品', extract: '导言。\n== 剧情 ==\n英雄出发了。\n== 评价 ==\n不错。'}}}}],
  ]);
  const steps: string[] = [];
  const d = await buildDossier(work('bangumi:42', '测试作品', {summary: '短简介', summaryLang: 'zh', year: 2001}), {net: createNet(fetcher, {useProxy: false}), fandom: false}, s => steps.push(s));
  assert.equal(d.synopsis, '完整简介。');
  assert.deepEqual(d.characters.map(c => [c.name, c.role]), [['英雄', '主角'], ['サブ', '配角']], '机体等非人物条目不收');
  assert.equal(d.characters[0]!.original, 'ヒーロー');
  assert.ok(d.facts.includes('导演：某人')); assert.ok(!d.facts.some(f => f.includes('官方网站')));
  assert.deepEqual(d.sections.map(s => s.heading), ['剧情']);
  assert.deepEqual(d.sources, ['Bangumi', '中文维基百科']);
  assert.ok(steps.length >= 2);
  const text = dossierText(d);
  assert.match(text, /作品：《测试作品》/); assert.match(text, /英雄（ヒーロー）【主角】：热血少年。/); assert.match(text, /【剧情·中文维基百科】英雄出发了。/);
});
/** 一次回复里带着规划与三种卡：物品 40 件（只有 5 件 6★，要提 4 件 5★ 上来）、命运 24 张（没有 6★）、角色 20 位。 */
const ITEM_STARS = [6, 6, 6, 6, 6, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1];
const FATE_STARS = [5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1];
const CHARACTER_STARS = [6, 6, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1];
const MODEL_REPLY = '```json\n' + JSON.stringify({protagonist: '英雄', plan: {items: 40, fates: 24, characters: 20},
  items: [...ITEM_STARS.map((star, i) => ({name: '物品' + i, star, type: '武器', owner: '英雄', description: '来历' + i, use: '用途'})), {name: '物品0', star: 1, description: '重复'}],
  fates: FATE_STARS.map((star, i) => ({name: '命运' + i, star, chapter: '第' + i + '章', description: '走向' + i, hook: '契机'})),
  characters: CHARACTER_STARS.map((star, i) => ({name: '角色' + i, star, role: i ? '同伴' : '主角', description: '身份' + i, power: '实力' + i})),
}).replace(/}\]/, '},]') + '\n```';
test('小池解析：容忍代码块、多余逗号与截断；去重；物品补足 9 件神话；合计守在 54–99 张；规划与提示', () => {
  assert.deepEqual(extractJson('前言 {"a":[1,2,],} 后记'), {a: [1, 2]});
  const pool = parsePool(MODEL_REPLY, work('bangumi:42', '测试作品'), ['Bangumi'], 5);
  assert.equal(pool.version, 2); assert.equal(pool.items.length, 40, '同名物品只留一张'); assert.equal(pool.fates.length, 24); assert.equal(pool.protagonist, '英雄');
  assert.equal(pool.characters, undefined, '没开角色池就没有角色'); assert.equal(poolSize(pool), 64);
  assert.equal(pool.items.filter(c => c.star === 6).length, MYTHIC_ITEMS, '神话不足 9 件时把 5★ 提上来');
  assert.equal(pool.fates.filter(c => c.star === 6).length, 1, '没有 6★ 命运时提一张 5★');
  for (const list of [pool.items, pool.fates]) for (const s of STARS) assert.ok(list.some(c => c.star === s), 'star ' + s);
  assert.equal(pool.items[0]!.star, 6); assert.equal(pool.items[0]!.id, 'bangumi:42#item0');
  assert.throws(() => parsePool('{"items":[],"fates":[]}', work('a:1', 'x'), []), /小池太小/);
  const three = parsePool(MODEL_REPLY, work('bangumi:42', '测试作品'), [], 5, ['item', 'fate', 'character']);
  assert.equal(three.characters!.length, 20); assert.equal(poolSize(three), 84);
  assert.deepEqual([three.characters![0]!.role, three.characters![0]!.power, three.characters![0]!.kind], ['主角', '实力0', 'character']);
  const cut = readReply(MODEL_REPLY.slice(0, MODEL_REPLY.indexOf('"name":"物品30"')));
  assert.equal((cut.items as unknown[]).length, 30, '截断时取出每一张完整的卡'); assert.equal(cut.protagonist, '英雄'); assert.deepEqual(cut.plan, {items: 40, fates: 24, characters: 20});
  assert.deepEqual(salvageArray('{"items":[{"name":"a\\"}","description":"x"},{"name":"b"', 'items'), [{name: 'a"}', description: 'x'}], '字符串里的括号不算，没写完的那张丢掉');
  const card = (star: number, i: number) => ({id: 'c' + i, kind: 'item', star, name: 'c' + i, description: 'd'}) as GachaCard;
  assert.deepEqual(fillTiers([5, 5, 4, 3, 3, 2, 1].map(card)).map(c => c.star), [6, 5, 4, 3, 3, 2, 1], '缺 6★：提一张 5★');
  assert.deepEqual(fillTiers([6, 5, 4, 3, 2, 2].map(card)).map(c => c.star), [6, 5, 4, 3, 1, 2], '缺 1★：降一张 2★');
  assert.deepEqual(fillTiers([6, 5, 4, 3, 2, 1].map(card)).map(c => c.star), [6, 5, 4, 3, 2, 1], '齐全时不动');
  assert.deepEqual(liftMythics([6, 5, 5, 5, 4, 4, 1].map(card), 4).map(c => c.star), [6, 6, 6, 5, 6, 4, 1]);
  assert.deepEqual(liftMythics([6, 5, 5, 4, 3, 2, 1].map(card), 3).map(c => c.star), [6, 6, 5, 4, 3, 2, 1], '每个星级至少留一张');
  const again = normalizePool(JSON.parse(JSON.stringify(three)))!;
  assert.deepEqual(again.items.map(c => c.id), three.items.map(c => c.id)); assert.equal(again.characters!.length, 20);
  assert.equal(normalizePool({...JSON.parse(JSON.stringify(pool)), version: 1}), undefined, '旧版（各 18 张）的小池缓存要重新编纂');
  const big = normalizePlan({items: 80, fates: 60}, ['item', 'fate']); assert.equal(big.item + big.fate, POOL_MAX); assert.ok(big.item > big.fate);
  const tiny = normalizePlan({items: 3, fates: 2, characters: 1}, ['item', 'fate', 'character']);
  assert.deepEqual([tiny.item >= KIND_MIN.item, tiny.fate >= KIND_MIN.fate, tiny.character >= KIND_MIN.character, tiny.item + tiny.fate + tiny.character], [true, true, true, POOL_MIN]);
  assert.deepEqual(normalizePlan(undefined, ['item', 'fate']), {item: 32, fate: 28, character: 0}, '没给规划时按常见比例');
  const d0 = {work: work('bangumi:42', '测试作品'), synopsis: 's', characters: [], sections: [], facts: [], sources: [], notes: []};
  const p1 = planPrompt(d0, ['item', 'fate', 'character']), p2 = kindPrompt(d0, 'character', {item: 30, fate: 24, character: 18}, ['item', 'fate', 'character'], '英雄');
  assert.match(p1.system, /不要引用原作的大段文字/); assert.match(p1.user, /合计 54–99 张/); assert.match(p1.user, /物品池至少 9 件 6★，命运池与角色池各至少 1 张 6★/);
  assert.match(p1.user, /"plan":\{"items":0,"fates":0,"characters":0\}/); assert.match(planPrompt(d0, ['item', 'fate']).user, /命运池至少 1 张 6★/);
  assert.match(p2.system, /实力完全等同原作/); assert.match(p2.system, /完全保有自身自由意志的情况下自由行动，玩家无法强制约束/); assert.match(p2.user, /共 18 张/); assert.match(p2.user, /主角是英雄/);
  assert.doesNotMatch(p1.system + p1.user + p2.system + p2.user, /<user>|\{\{user\}\}/);
});
test('资料直出小池：没有模型也能抽——合计 54–99 张、物品至少 9 件神话、每个星级都有牌；角色只用资料里的人物', () => {
  const d = {work: work('wikidata:Q1', '三体', {media: 'book', tags: ['科幻', '外星文明']}), synopsis: '天文学家叶文洁向宇宙发出信号。三体文明收到了。', characters: [{name: '汪淼', role: '主角', description: '纳米材料科学家。'}, {name: '史强', role: '配角'}], sections: [{heading: '剧情', text: '第一段剧情走向，足够长的一段描述文字在这里。\n第二段剧情走向，同样足够长的一段描述文字在这里。', source: '中文维基百科'}], facts: [], sources: ['中文维基百科'], notes: []};
  const pool = offlinePool(d, 9);
  assert.equal(pool.by, 'offline'); assert.equal(pool.protagonist, '汪淼'); assert.equal(pool.characters, undefined);
  assert.ok(poolSize(pool) >= POOL_MIN && poolSize(pool) <= POOL_MAX, String(poolSize(pool)));
  assert.ok(pool.items.filter(c => c.star === 6).length >= MYTHIC_ITEMS);
  for (const list of [pool.items, pool.fates]) for (const s of STARS) assert.ok(list.some(c => c.star === s), 'star ' + s);
  assert.ok(pool.items.some(c => c.name === '汪淼的信物' && c.owner === '汪淼' && c.star === 6));
  for (const list of [pool.items, pool.fates]) assert.equal(new Set(list.map(c => c.id)).size, list.length, 'id 不重复');
  const thin = offlinePool({...d, characters: [], sections: [], synopsis: ''}, 9);
  assert.ok(poolSize(thin) >= POOL_MIN, String(poolSize(thin))); assert.ok(thin.items.filter(c => c.star === 6).length >= MYTHIC_ITEMS);
  const withPeople = offlinePool(d, 9, ['item', 'fate', 'character']);
  assert.deepEqual(withPeople.characters!.map(c => [c.name, c.star, c.role]), [['汪淼', 6, '主角'], ['史强', 3, '配角']], '角色只取资料里真有的人物，不凑数');
  assert.ok(poolSize(withPeople) <= POOL_MAX);
  assert.deepEqual(offlinePool({...d, characters: []}, 9, ['item', 'fate', 'character']).characters, [], '资料里没有人物时角色池是空的');
});
test('一句话览概：批量请求，只收资料里的作品', () => {
  const ws = [work('anilist:1', 'Cowboy Bebop', {summary: 'In 2071...'}), work('vndb:v2', 'VN')];
  const p = overviewPrompt(ws); assert.match(p.user, /anilist:1/);
  const got = parseOverviews('{"anilist:1":{"zh":"星际牛仔","overview":"赏金猎人在太阳系流浪。"},"other":{"overview":"x"}}', ws);
  assert.deepEqual(got, {'anilist:1': {zh: '星际牛仔', overview: '赏金猎人在太阳系流浪。'}});
});

/* ---------- 服务层与宿主 ---------- */
function memoryStorage() {const m = new Map<string, string>(); return {getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => {m.set(k, v);}, m};}
function fakePort(over: Partial<GachaPort> = {}, start = 10000) {
  let durable: unknown, device: unknown, settings: unknown, fp = start, blocked: string | undefined;
  const commits: unknown[] = [], casts: {cost: number; theme: string}[] = [], llmCalls: string[] = [];
  const pay = (cost: number) => {if (fp < cost) throw Error('FP不足，当前仅有 ' + fp + 'FP'); fp -= cost; return {fp};};
  const port: GachaPort = {
    contextId: 'c', mode: 'host',
    readDurable: () => durable, async writeDurable(v) {durable = structuredClone(v);},
    readDevice: () => device, writeDevice(v) {device = structuredClone(v);},
    readSettings: () => settings, writeSettings(v) {settings = structuredClone(v);},
    wallet: () => blocked ? {fp, blocked} : {fp},
    async commit(req) {commits.push(req); return pay(req.cost);},
    async commitCast(req) {casts.push(req); return pay(req.cost);},
    async llm(system, _user, o) {llmCalls.push(o.purpose + ':' + system.slice(0, 8)); return o.purpose === 'pool' ? MODEL_REPLY : '{}';},
    fetch: fakeFetch([
      [/api\.bgm\.tv\/v0\/search/, () => ({total: 500, data: Array.from({length: 40}, (_, i) => ({id: Math.floor(Math.random() * 1e9) + i, type: 2, name_cn: '作品' + Math.random().toString(36).slice(2), images: {}, tags: []}))})],
      [/api\.bgm\.tv\/v0\/subjects\/\d+\/characters/, [{id: 1, name: '主角', relation: '主角', type: 1}]],
      [/api\.bgm\.tv\/v0\/subjects\/\d+$/, {summary: '简介'}],
      [/api\.bgm\.tv\/v0\/characters/, {summary: '', infobox: []}],
      [/wikipedia/, {query: {search: [], pages: {}}}],
      [/anilist|vndb|jikan/, 500],
    ]),
    ...over,
  };
  return {port, commits, casts, llmCalls, get fp() {return fp;}, block(why?: string) {blocked = why;}, get durable() {return durable as GachaDurable;}, get device() {return device;}};
}
test('抽卡服务：换大池扣 1000 捞起 99 部 → 编纂小池（先规划并写物品，再写命运）→ 十连扣 2000 并入包 → 保底、抽取点数与记录写进聊天', async () => {
  const f = fakePort(), g = createGacha(f.port, {rng: seededRng(11), now: () => 1000});
  assert.equal(g.castCost(), 1000); assert.equal(CAST_COST, 1000); assert.equal(DRAW_COST, 200); assert.equal(TEN_COST, 2000); assert.equal(SPREAD_SIZE, 99);
  const spread = await g.cast('acg-fantasy');
  assert.equal(spread.works.length, 99); assert.equal(g.spread()!.themeName, '奇幻');
  assert.deepEqual(f.casts, [{cost: 1000, theme: '奇幻'}], '捞到作品之后扣一次'); assert.equal(f.fp, 9000);
  const target = spread.works[0]!;
  const pool = await g.compile(target);
  assert.equal(pool.by, 'model'); assert.equal(g.picked(), target.key);
  assert.equal(f.llmCalls.filter(c => c.startsWith('pool:')).length, 2, '规划与物品一次、命运一次（没开角色池）');
  assert.equal(pool.items.length, 40); assert.equal(pool.characters, undefined); assert.equal(g.poolSize(pool), 64);
  assert.equal(g.canDraw(10).cost, 2000); assert.equal(g.canDraw(1).cost, 200);
  const out = await g.draw(target.key, 'item', 10);
  assert.equal(out.cards.length, 10); assert.ok(Math.max(...out.stars) >= 3);
  assert.equal(out.wallet.fp, 7000); assert.equal((f.commits[0] as {cost: number}).cost, 2000);
  assert.ok(out.cards.every(c => c.kind === 'item'));
  assert.equal(f.durable.history.length, 1); assert.equal(f.durable.pity.total, 10); assert.equal(f.durable.history[0]!.bagged, true);
  assert.equal(f.durable.points[target.key]!.points, 10, '每抽攒 1 点抽取点数');
  const fate = await g.draw(target.key, 'fate', 1);
  assert.equal(fate.cards[0]!.kind, 'fate'); assert.equal(f.durable.pity.total, 11); assert.equal(f.durable.history[0]!.kind, 'fate');
  assert.equal(f.fp, 6800, '单抽 200'); assert.equal(g.points(target.key), 11, '物品池与命运池的点数都记在这部作品上');
  const again = createGacha(f.port, {rng: seededRng(12)});
  assert.equal(again.pool(target.key)!.items.length, 40, '小池缓存在这台设备');
  assert.equal(again.history().length, 2); assert.equal(again.points(target.key), 11);
  await again.cast('acg-scifi');
  assert.equal(f.fp, 5800); assert.equal(again.picked(), undefined, '换了大池，小池要重新挑'); assert.equal(again.pool(target.key)!.items.length, 40, '编纂过的小池仍在缓存里');
  assert.equal(again.points(target.key), 11, '换大池不清空抽取点数');
});
test('换大池：点数不足、旅程进行中不撒网；一部也没捞到、取消、扣点失败都不扣点也不换书海', async () => {
  const poor = fakePort({}, 999), p = createGacha(poor.port, {rng: seededRng(1)});
  assert.match(p.canCast().reason!, /命运点不足（需要 1,000，现有 999）/);
  await assert.rejects(p.cast('acg-fantasy'), /命运点不足/); assert.equal(p.spread(), undefined); assert.equal(poor.casts.length, 0);
  const empty = fakePort({fetch: fakeFetch([[/./, 500]])}), e = createGacha(empty.port, {rng: seededRng(2)});
  await assert.rejects(e.cast('acg-fantasy'), /什么也没捞到，没有扣命运点数/); assert.equal(empty.casts.length, 0); assert.equal(empty.fp, 10000);
  const f = fakePort(), g = createGacha(f.port, {rng: seededRng(3)});
  await g.cast('acg-fantasy');
  const done = new AbortController(); done.abort();
  await assert.rejects(g.cast('acg-scifi', {signal: done.signal}), /已取消/); assert.equal(f.casts.length, 1, '取消的那一网不扣点');
  f.block('旅程还没结束');
  assert.equal(g.canCast().ok, false); await assert.rejects(g.cast('acg-scifi'), /旅程还没结束/);
  f.block(undefined);
  const racing = fakePort({async commitCast() {throw Error('FP不足，当前仅有 3FP');}}), r = createGacha(racing.port, {rng: seededRng(4)});
  await assert.rejects(r.cast('acg-fantasy'), /FP不足/); assert.equal(r.spread(), undefined, '扣点失败不换书海');
  assert.equal(g.spread()!.themeId, 'acg-fantasy');
});
test('抽卡服务：点数不足、旅程进行中都不抽；价格固定，旧设置里的花费不生效；提交失败不推进保底', async () => {
  const poor = fakePort({}, 1150), g = createGacha(poor.port, {rng: seededRng(1)});
  await g.cast('acg-fantasy'); const w = g.spread()!.works[0]!; await g.compile(w);
  assert.equal(poor.fp, 150); assert.match(g.canDraw(1).reason!, /命运点不足（需要 200，现有 150）/);
  await assert.rejects(g.draw(w.key, 'item', 1), /命运点不足/); assert.equal(poor.commits.length, 0);
  const busy = fakePort(), b = createGacha(busy.port, {rng: seededRng(2)});
  await b.cast('acg-fantasy'); const w2 = b.spread()!.works[0]!; await b.compile(w2);
  busy.block('旅程还没结束');
  await assert.rejects(b.draw(w2.key, 'item', 1), /旅程还没结束/); assert.equal(busy.commits.length, 0);
  busy.block(undefined);
  b.saveSettings({...b.settings(), cost1: 0, cost10: 0, castCost: 0} as never);
  assert.equal(b.canDraw(10).cost, 2000); assert.equal(b.castCost(), 1000); assert.ok(!('cost1' in b.settings()));
  const broken = fakePort({async commit() {throw Error('写入失败');}}), c = createGacha(broken.port, {rng: seededRng(3)});
  await c.cast('acg-fantasy'); const w3 = c.spread()!.works[0]!; await c.compile(w3);
  await assert.rejects(c.draw(w3.key, 'item', 1), /写入失败/);
  assert.equal(c.pity().total, 0); assert.equal(broken.durable, undefined);
});
test('抽卡服务：没有模型时用资料直出；本机模式不扣任何东西', async () => {
  const storage = memoryStorage();
  const port = localGachaPort(storage, fakePort().port.fetch), g = createGacha(port, {rng: seededRng(5)});
  assert.equal(g.llmReady(), false);
  await g.cast('acg-mecha'); const w = g.spread()!.works[0]!;
  const pool = await g.compile(w); assert.equal(pool.by, 'offline');
  assert.equal(g.canDraw(10).cost, 0);
  const out = await g.draw(w.key, 'fate', 10); assert.equal(out.cards.length, 10); assert.equal(out.record.bagged, false);
  assert.ok(storage.m.has('dream_gacha_local_v1'));
  assert.equal(normalizeDurable(JSON.parse(storage.m.get('dream_gacha_local_v1')!)).pity.total, 10);
  assert.equal(g.castCost(), 0); assert.equal(g.canRecycle(), false); assert.deepEqual(g.bag(), []);
  await assert.rejects(g.recycle([{name: 'x', quality: '普通', count: 1}]), /没有背包/);
  const s = normalizeSettings({cost1: -5, cost10: 'x', sources: {bangumi: false}, scale: 'stars', api: {enabled: true, url: 'https://x', model: 'm'}});
  assert.ok(!('cost1' in s) && !('cost10' in s)); assert.equal(s.sources.bangumi, false); assert.equal(s.sources.vndb, true); assert.equal(s.scale, 'stars'); assert.equal(s.api.enabled, true);
  const ds = deviceStore(storage, 'chat-1'); ds.write({a: 1}); assert.deepEqual(ds.read(), {a: 1});
  for (let i = 2; i < 10; i++) deviceStore(storage, 'chat-' + i).write({i});
  assert.equal(deviceStore(storage, 'chat-1').read(), undefined, '只留最近 6 个聊天的缓存');
});
/** 与 source/reader-transactions.js 同样语义的最小替身（读者仓库的测试会用真的 ReaderTransactions 再验一次）。 */
type Obj = Record<string, unknown>;
function fakeReader(o: {fp?: unknown; chat?: Obj; messageVars?: Obj; extra?: Obj} = {}) {
  let data: Obj = {stat_data: {命运点数: o.fp ?? 3000, 主角: {背包: {}}}}, chatId = 'c1', runs = 0, transacts = 0, seq = 0;
  const ctx = {characterId: 'x', getCurrentChatId: () => chatId, chat: [{mes: '你好', extra: o.extra ?? {}}], chatMetadata: {variables: structuredClone(o.chat ?? {}) as Obj}, saves: 0, async saveMetadata() {ctx.saves++;}};
  const fp = (d: Obj) => {const v = Number((d.stat_data as Obj | undefined)?.命运点数); if (!Number.isFinite(v) || v < 0 || (d.stat_data as Obj | undefined)?.命运点数 === undefined) throw Error('还没有读到有效的命运点数，请等待角色资料就绪'); return v;};
  const tx: ReaderTx = {
    capture: () => ({chatId, characterId: 'x', messageId: 0, id: 'reader-' + ++seq}),
    read: () => structuredClone(data), fp,
    charge(d, cost) {const v = fp(d); if (v < cost) throw Error('FP不足，当前仅有 ' + v + 'FP'); (d.stat_data as Obj).命运点数 = v - cost; return v - cost;},
    async transact(_t, _id, mutate) {transacts++; const next = structuredClone(data), r = mutate(next); data = next; return r;},
    async run(_k, action) {runs++; return action(tx.capture());},
  };
  const helper = {getVariables: (q: Obj) => q.type === 'chat' ? ctx.chatMetadata.variables : o.messageVars ?? {}, getLastMessageId: () => 0};
  return {ctx, tx, helper, switchChat() {chatId = 'c2';}, get data() {return data;}, set data(v: Obj) {data = v;}, stats: () => ({runs, transacts})};
}
const readerHost = (r: ReturnType<typeof fakeReader>, over: Partial<ReaderGachaHost> = {}): ReaderGachaHost => ({document: undefined as never, transactions: r.tx, context: () => r.ctx, helper: r.helper, storage: memoryStorage(), fetch: async () => new Response('{}'), proxyBase: 'http://127.0.0.1:8017', ...over});
test('入包：物品与命运按命定之诗品质名进主角背包，同名不同物不覆盖，只改命运点数与背包', () => {
  const pool = parsePool(MODEL_REPLY, work('bangumi:42', '测试作品', {media: 'anime'}), []);
  const item = pool.items.find(c => c.star === 6)!, fate = pool.fates.find(c => c.star === 6)!;
  const e1 = gachaBagEntry(item, pool, DESTINED_SCALE), e2 = gachaBagEntry(fate, pool, DESTINED_SCALE);
  assert.equal(e1.item.品质, '神话'); assert.equal(e1.item.类型, '武器'); assert.ok((e1.item.标签 as string[]).includes('作品:测试作品')); assert.equal((e1.item.标签 as string[])[0], BAG_TAG); assert.match(String(e1.item.描述), /动画《测试作品》的6★物品，原属英雄/);
  assert.equal(e2.name, '命运·' + fate.name); assert.equal(e2.item.类型, '命运'); assert.ok((e2.item.效果 as Record<string, string>).使用);
  assert.ok(!(e1.item.标签 as string[]).includes('书海'), '不再冒充书海的物品（书海会按“书海”标签识别兑换券）');
  const bag: Record<string, unknown> = {[item.name]: {品质: '普通', 类型: '道具', 数量: 3, 效果: {}}};
  assert.equal(addToBag(bag, e1, '测试作品'), `${item.name}（《测试作品》）`);
  assert.equal(addToBag(bag, e1, '测试作品'), `${item.name}（《测试作品》）`);
  assert.equal((bag[`${item.name}（《测试作品》）`] as {数量: number}).数量, 2); assert.equal((bag[item.name] as {数量: number}).数量, 3);
  const charge = (d: Obj, cost: number) => {const st = d.stat_data as {命运点数: number}; if (st.命运点数 < cost) throw Error('FP不足'); st.命运点数 -= cost; return st.命运点数;};
  const data: Obj = {stat_data: {命运点数: 2500, 主角: {名字: '作家'}, 其他: {保持: true}}, dream_reader_receipts: {a: 1}};
  const done = applyGachaDraw(data, {cost: 1000, cards: [item, fate], pool, bag: true, scale: DESTINED_SCALE}, charge, () => null);
  assert.equal(done.fp, 1500); assert.deepEqual(done.added.sort(), [item.name, '命运·' + fate.name].sort());
  const st = data.stat_data as {主角: {名字: string; 背包: object}; 其他: object};
  assert.deepEqual(Object.keys(st.主角.背包).sort(), [item.name, '命运·' + fate.name].sort()); assert.equal(st.主角.名字, '作家'); assert.deepEqual(st.其他, {保持: true}); assert.deepEqual(data.dream_reader_receipts, {a: 1});
  assert.throws(() => applyGachaDraw(structuredClone(data), {cost: 3000, cards: [item], pool, bag: true, scale: DESTINED_SCALE}, charge, () => null), /FP不足/);
  const free: Obj = {stat_data: {命运点数: 7}}, r = applyGachaDraw(free, {cost: 0, cards: [item], pool, bag: false, scale: DESTINED_SCALE}, () => {throw Error('不该扣点');}, () => 7);
  assert.equal(r.fp, 7); assert.deepEqual(free, {stat_data: {命运点数: 7}}, '不入包且免费时什么也不写');
});
test('读者端口：钱包读最新楼层；扣点与入包在一次付费提交里完成；点数不足不写；保底写进聊天变量', async () => {
  const r = fakeReader(), port = readerGachaPort(readerHost(r));
  assert.deepEqual(port.wallet(), {fp: 3000}); assert.equal(port.mode, 'host'); assert.equal(port.contextId, 'x|c1'); assert.equal(port.proxyBase, 'http://127.0.0.1:8017');
  const pool = parsePool(MODEL_REPLY, work('bangumi:42', '测试作品'), []);
  const w = await port.commit!({cost: 200, cards: [pool.items[0]!], pool, kind: 'item', bag: true, scale: DESTINED_SCALE});
  assert.equal(w.fp, 2800); assert.deepEqual(r.stats(), {runs: 1, transacts: 1});
  assert.equal((r.data.stat_data as {命运点数: number}).命运点数, 2800);
  assert.ok((r.data.stat_data as {主角: {背包: Obj}}).主角.背包[pool.items[0]!.name]);
  const before = structuredClone(r.data);
  await assert.rejects(port.commit!({cost: 5000, cards: [pool.items[1]!], pool, kind: 'item', bag: true, scale: DESTINED_SCALE}), /FP不足/);
  assert.deepEqual(r.data, before, '点数不足时什么也不写');
  assert.deepEqual(await port.commit!({cost: 0, cards: [], pool, kind: 'item', bag: true, scale: DESTINED_SCALE}), {fp: 2800}); assert.equal(r.stats().transacts, 2, '免费且没有东西入包时不提交');
  assert.deepEqual(await port.commitCast!({cost: 1000, theme: '奇幻'}), {fp: 1800}); assert.deepEqual(r.stats(), {runs: 3, transacts: 3}, '换大池也是一次付费提交');
  const beforeCast = structuredClone(r.data);
  await assert.rejects(port.commitCast!({cost: 5000, theme: '奇幻'}), /FP不足/); assert.deepEqual(r.data, beforeCast);
  r.ctx.chatMetadata.variables.booksea = {other: 1};
  await port.writeDurable({version: 1, pity: emptyPity(), points: {}, history: [], updated: 1});
  assert.deepEqual(r.ctx.chatMetadata.variables[DURABLE_KEY], {version: 1, pity: emptyPity(), points: {}, history: [], updated: 1}); assert.equal(r.ctx.saves, 1);
  assert.deepEqual(r.ctx.chatMetadata.variables.booksea, {other: 1}, '不碰其他聊天变量'); assert.deepEqual(port.readDurable(), r.ctx.chatMetadata.variables[DURABLE_KEY]);
  const bad = readerGachaPort(readerHost(fakeReader({fp: '未知'})));
  assert.match(bad.wallet().blocked!, /还没有读到有效的命运点数/);
  r.switchChat();
  assert.match(port.wallet().blocked!, /聊天已切换/);
  await assert.rejects(port.commit!({cost: 200, cards: [pool.items[0]!], pool, kind: 'item', bag: true, scale: DESTINED_SCALE}), /聊天已切换/);
  await assert.rejects(port.commitCast!({cost: 1000, theme: '奇幻'}), /聊天已切换/);
  await assert.rejects(port.recycle!([{name: pool.items[0]!.name, quality: '神话', count: 1}]), /聊天已切换/);
  await assert.rejects(port.writeDurable({version: 1, pity: emptyPity(), points: {}, history: [], updated: 2}), /聊天已切换/);
});
test('读者端口：书海旅程进行中不扣点、不入包、不回收——按最新楼层的进度引用找存档，旧版看聊天镜像', async () => {
  const pool = parsePool(MODEL_REPLY, work('bangumi:42', '测试作品'), []), req = {cost: 200, cards: [pool.items[0]!], pool, kind: 'item' as const, bag: true, scale: DESTINED_SCALE};
  const mirror = fakeReader({chat: {booksea: {activeExpedition: {run: {id: 'r'}, mode: 'explore'}}}}), mp = readerGachaPort(readerHost(mirror));
  const untouched = structuredClone(mirror.data);
  assert.equal(mp.wallet().blocked, BOOKSEA_BUSY); await assert.rejects(mp.commit!(req), /书海的旅程还没结束/);
  await assert.rejects(mp.commit!({...req, cost: 0}), /书海的旅程还没结束/, '免费也不往背包里塞');
  await assert.rejects(mp.commitCast!({cost: 1000, theme: '奇幻'}), /书海的旅程还没结束/);
  await assert.rejects(mp.recycle!([{name: 'x', quality: '普通', count: 1}]), /书海的旅程还没结束/);
  assert.deepEqual(mirror.data, untouched); assert.deepEqual(mirror.stats(), {runs: 0, transacts: 0});
  const ended = fakeReader({chat: {booksea: {activeExpedition: {run: {id: 'r'}, mode: 'ended'}}}});
  assert.equal(readerGachaPort(readerHost(ended)).wallet().blocked, undefined);
  const snap = {token: 't1', progress: {activeExpedition: {run: {id: 'r'}, mode: 'battle'}}};
  const timeline = fakeReader({chat: {booksea: {timelineIndex: [{messageId: 0, token: 't1'}], activeExpedition: null}}, messageVars: {bookseaProgressRef: {version: 1, token: 't1'}}, extra: {bookseaCheckpointV1: snap}});
  assert.equal(bookseaActive(timeline.ctx, timeline.helper), true, '存档里的旅程还在进行');
  const rolledBack = fakeReader({chat: {booksea: {activeExpedition: {run: {id: 'r'}, mode: 'explore'}}}, messageVars: {bookseaProgressRef: {version: 1, token: null}}});
  assert.equal(bookseaActive(rolledBack.ctx, rolledBack.helper), false, '楼层回退到旅程之前：镜像过时，以引用为准');
  const removed = fakeReader({messageVars: {bookseaProgressRef: {version: 1, token: 'gone'}}});
  assert.equal(bookseaActive(removed.ctx, removed.helper), false, '找不到的存档不复活');
});
test('读者入口：价签是固定定价；没有独立生成时不给模型', () => {
  const g = createReaderGacha();
  assert.deepEqual(g.price(), {cast: 1000, single: 200, ten: 2000});
  assert.equal(g.isOpen(), false); assert.equal(g.service(), undefined);
  const r = fakeReader();
  assert.equal(readerGachaPort(readerHost(r)).llm, undefined);
  assert.equal(createGacha(readerGachaPort(readerHost(r))).llmReady(), false);
  assert.equal(g.open(readerHost(r, {isAlive: () => false})), false, '读者已关闭时不打开');
});
test('取消：撒网 / 编纂取消后不替换书海、不留下小池；读者模型调用立即中止', async () => {
  const f = fakePort(), g = createGacha(f.port, {rng: seededRng(21)});
  await g.cast('acg-fantasy');
  const done = new AbortController(); done.abort();
  await assert.rejects(g.cast('acg-scifi', {signal: done.signal}), /已取消/);
  assert.equal(g.spread()!.themeId, 'acg-fantasy', '取消的撒网不替换当前书海');
  const w = g.spread()!.works[0]!;
  await assert.rejects(g.compile(w, {signal: done.signal}), /已取消/);
  assert.equal(g.pool(w.key), undefined);
  const late = new AbortController();
  const slow = fakePort({async llm(_s, _u, o) {await new Promise(r => o.signal?.addEventListener('abort', r, {once: true})); return MODEL_REPLY;}});
  const h = createGacha(slow.port, {rng: seededRng(22)});
  await h.cast('acg-fantasy'); const w2 = h.spread()!.works[0]!;
  const job = h.compile(w2, {signal: late.signal, onStep: s => {if (s.includes('编纂小池')) setTimeout(() => late.abort(), 5);}});
  await assert.rejects(job, /已取消/);
  assert.equal(h.pool(w2.key), undefined, '模型在取消后才回话也不留下小池');
  const stops: string[] = [], configs: Obj[] = [];
  const port = readerGachaPort(readerHost(fakeReader(), {generate: c => {configs.push(c); return new Promise(() => {});}, stop: id => {stops.push(id);}})), stop = new AbortController();
  const call = port.llm!('s', 'u', {timeoutMs: 60000, purpose: 'pool', signal: stop.signal});
  setTimeout(() => stop.abort(), 5);
  await assert.rejects(call, /已取消/);
  assert.equal(stops.length, 1, '同时请酒馆停止这次生成'); assert.equal(stops[0], configs[0]!.generation_id);
  assert.deepEqual(configs[0]!.ordered_prompts, [{role: 'system', content: 's'}, {role: 'user', content: 'u'}]); assert.equal(configs[0]!.should_silence, true); assert.equal(configs[0]!.max_chat_history, 0);
  await assert.rejects(port.llm!('s', 'u', {timeoutMs: 60000, purpose: 'pool', signal: stop.signal}), /已取消/);
});
test('小池标题：补写览概得到的中文译名成为小池标题，原名保留', async () => {
  const f = fakePort({async llm(_s, user, o) {
    if (o.purpose === 'pool') return MODEL_REPLY;
    const rows = JSON.parse(user.slice(3, user.indexOf('\n'))) as {k: string}[];
    return JSON.stringify(Object.fromEntries(rows.map(r => [r.k, {zh: '中文译名', overview: '一句话览概。'}])));
  }});
  const g = createGacha(f.port, {rng: seededRng(31)});
  await g.cast('acg-fantasy'); const w = g.spread()!.works[0]!;
  assert.ok(await g.overview() > 0); assert.equal(g.overviewOf(w.key)!.zh, '中文译名');
  const pool = await g.compile(w);
  assert.equal(pool.work.title, '中文译名'); assert.equal(pool.work.original, w.title, '原来的标题留作原名');
  const out = await g.draw(w.key, 'item', 1); assert.equal(out.record.work, '中文译名');
});
test('Fandom：猜到的同名站点必须真的在讲这部作品，否则不收', async () => {
  assert.equal(fandomRelevant('Cowboy Bebop', 'Spike Spiegel', 'Spike Spiegel is the protagonist of Cowboy Bebop, a bounty hunter.'), true);
  assert.equal(fandomRelevant('Cowboy Bebop', 'Cowboy', 'A cowboy is an animal herder who tends cattle on ranches in North America.'), false);
  assert.equal(fandomRelevant('The Lord of the Rings', 'Frodo Baggins', 'Frodo is the Ring-bearer in The Lord of the Rings.'), true);
  assert.equal(fandomRelevant('The Witcher 3: Wild Hunt', 'Geralt of Rivia', 'Geralt is the protagonist of The Witcher 3 and earlier games.'), true);
  assert.equal(fandomRelevant('Lord', 'Lord', 'x'.repeat(200)), true, '页名本身就是作品名');
  const text = 'A cowboy is an animal herder who tends cattle on ranches. '.repeat(4);
  const fetcher = fakeFetch([
    [/cowboybebop\.fandom\.com/, 404],
    [/cowboy\.fandom\.com\/api\.php\?action=query/, {query: {search: [{title: 'Cowboy'}]}}],
    [/cowboy\.fandom\.com\/api\.php\?action=parse/, {parse: {text: {'*': '<p>' + text + '</p>'}}}],
    [/wikipedia/, {query: {search: [], pages: {}}}],
  ]);
  const d = await buildDossier(work('anilist:1', 'Cowboy Bebop', {english: 'Cowboy Bebop'}), {net: createNet(fetcher, {useProxy: false}), fandom: true});
  assert.equal(d.sections.length, 0, '同名但无关的维基不进小池资料'); assert.ok(!d.sources.includes('Fandom'));
});

test('回收：每件按同层级命定契约基础价的 1/25；只收命运抽卡的东西，逐件核对后移出并加回命运点数', () => {
  assert.equal(RECYCLE_DIVISOR, 25);
  assert.deepEqual(['普通', '优良', '稀有', '史诗', '传说', '神话'].map(recyclePrice), [8, 20, 100, 200, 2000, 6000]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(t => CONTRACT_PRICE[t]), [200, 500, 2500, 5000, 50000, 150000], '与世界书「命定契约」的基础价一致');
  assert.equal(recyclePrice('至高'), 0); assert.equal(recyclePrice(undefined), 0);
  const tag = (q: string, kind = '物品') => ({品质: q, 类型: kind === '命运' ? '命运' : '武器', 数量: 1, 标签: [BAG_TAG, kind, '作品:测试作品', '星级:' + starOfQuality(q)]});
  const data: Obj = {stat_data: {命运点数: 50, 主角: {名字: '作家', 背包: {
    圣剑: {...tag('神话'), 数量: 2}, '命运·重逢': tag('传说', '命运'), 木棍: tag('普通'), 旧物: {品质: '神话', 数量: 1}, 空壳: {...tag('史诗'), 数量: 0}, 怪东西: {...tag('普通'), 品质: '至高'},
  }}}, 其他: {保持: true}};
  const list = listGachaBag(data);
  assert.deepEqual(list.map(e => [e.name, e.quality, e.count, e.price, e.kind]), [['圣剑', '神话', 2, 6000, 'item'], ['命运·重逢', '传说', 1, 2000, 'fate'], ['木棍', '普通', 1, 8, 'item']], '不收别处来的、数量为 0 的、品质认不出的');
  assert.equal(list[0]!.work, '测试作品'); assert.equal(list[0]!.star, 6);
  const r = applyRecycle(data, [{name: '圣剑', quality: '神话', count: 1}, {name: '木棍', quality: '普通', count: 5}], d => Number((d.stat_data as Obj).命运点数));
  assert.deepEqual(r, {fp: 6058, gained: 6008, removed: 2});
  const bag = ((data.stat_data as Obj).主角 as {背包: Obj}).背包;
  assert.equal((bag.圣剑 as {数量: number}).数量, 1); assert.equal(bag.木棍, undefined); assert.ok(bag.旧物 && bag['命运·重逢']);
  assert.equal(((data.stat_data as Obj).主角 as Obj).名字, '作家'); assert.deepEqual(data.其他, {保持: true});
  assert.throws(() => applyRecycle(structuredClone(data), [{name: '旧物', quality: '神话', count: 1}], () => 0), /已经变了/, '不是命运抽卡抽来的不收');
  assert.throws(() => applyRecycle(structuredClone(data), [{name: '圣剑', quality: '传说', count: 1}], () => 0), /已经变了/, '品质对不上不收');
  assert.throws(() => applyRecycle(structuredClone(data), [], () => 0), /没有选择/);
});
test('回收：读者端口一次付费提交；服务层回收后通知界面', async () => {
  const r = fakeReader({fp: 100}), port = readerGachaPort(readerHost(r));
  (r.data.stat_data as {主角: {背包: Obj}}).主角.背包 = {星砂: {品质: '稀有', 类型: '材料', 数量: 3, 标签: [BAG_TAG, '物品', '作品:测试作品', '星级:3']}};
  assert.deepEqual(port.bag!().map(e => [e.name, e.count, e.price]), [['星砂', 3, 100]]);
  const g = createGacha(port, {rng: seededRng(9)});
  let changed = 0; g.subscribe(() => {changed++;});
  assert.equal(g.canRecycle(), true); assert.equal(g.bag().length, 1);
  assert.deepEqual(await g.recycle([{name: '星砂', quality: '稀有', count: 2}]), {fp: 300, gained: 200, removed: 2});
  assert.deepEqual(r.stats(), {runs: 1, transacts: 1}); assert.equal(changed, 1);
  assert.equal((r.data.stat_data as {命运点数: number}).命运点数, 300); assert.equal(g.bag()[0]!.count, 1);
  const before = structuredClone(r.data);
  await assert.rejects(g.recycle([{name: '星砂', quality: '史诗', count: 1}]), /已经变了/); assert.deepEqual(r.data, before, '核对不过时什么也不写');
});
test('经济：小保底平均约 101 抽一张神话；抽来的东西全部回收（算上大保底兑换的神话）也换不回抽卡花的命运点', () => {
  const rng = seededRng(42); let pity = emptyPity(), pulls = 0, sixes = 0, value = 0;
  for (let i = 0; i < 20000; i++) {
    const r = drawStars(10, rng, pity); pity = r.pity;
    for (const s of r.stars) {pulls++; if (s === 6) sixes++; value += recyclePrice(DESTINED_QUALITY[s]);}
  }
  const per6 = pulls / sixes, perPull = value / pulls, spark = recyclePrice('神话') / DEFAULT_RULES.spark;
  assert.ok(per6 > 92 && per6 < 110, '平均 ' + per6.toFixed(1) + ' 抽一张 6★');
  assert.ok(perPull + spark < DRAW_COST * .8, `每抽平均只能回收 ${perPull.toFixed(0)}，加上大保底兑换的神话也只有 ${(perPull + spark).toFixed(0)}，少于单抽 ${DRAW_COST}（还没算换大池的 ${CAST_COST}）`);
});
test('大保底：每部作品各攒各的抽取点数，攒满 200 点兑换这部作品小池里指定的神话；不花命运点、不动小保底；入包失败把点数退回', async () => {
  const f = fakePort({}, 100000), g = createGacha(f.port, {rng: seededRng(51), now: () => 2000});
  await g.cast('acg-fantasy'); const [a, b] = g.spread()!.works;
  const pa = await g.compile(a!), pb = await g.compile(b!);
  for (let i = 0; i < 19; i++) await g.draw(a!.key, 'item', 10);
  await g.draw(b!.key, 'fate', 10);
  assert.equal(g.points(a!.key), 190); assert.equal(g.points(b!.key), 10, '不跨池互通');
  assert.match(g.canExchange(a!.key).reason!, /还差 10/);
  const mythic = pa.items.find(c => c.star === 6)!;
  await assert.rejects(g.exchange(a!.key, mythic.id), /还差 10/);
  await g.draw(a!.key, 'fate', 10); assert.equal(g.points(a!.key), 200); assert.equal(g.canExchange(a!.key).ok, true);
  await assert.rejects(g.exchange(a!.key, pb.items[0]!.id), /不在这部作品的小池里/, '别的作品的神话不能兑换');
  await assert.rejects(g.exchange(a!.key, pa.items.find(c => c.star === 5)!.id), /不在这部作品的小池里/, '只能兑换神话');
  const commits = f.commits.length, fp = f.fp, since6 = g.pity().since6;
  const out = await g.exchange(a!.key, mythic.id);
  assert.equal(out.cards[0]!.name, mythic.name); assert.deepEqual(out.stars, [6]); assert.equal(out.record.spark, true); assert.equal(out.record.cost, 0);
  const req = f.commits.at(-1) as {cost: number; spark?: boolean; cards: {name: string}[]};
  assert.equal(f.commits.length, commits + 1); assert.deepEqual([req.cost, req.spark, req.cards[0]!.name], [0, true, mythic.name]); assert.equal(f.fp, fp, '不花命运点');
  assert.equal(g.points(a!.key), 0); assert.equal(f.durable.points[a!.key], undefined); assert.equal(g.pity().since6, since6, '小保底进度不受影响');
  assert.equal(f.durable.history[0]!.spark, true); assert.equal(normalizeDurable(JSON.parse(JSON.stringify(f.durable))).history[0]!.spark, true);
  const flaky = fakePort({async commit(req) {if (req.spark) throw Error('写入失败'); return {fp: 9000};}}), x = createGacha(flaky.port, {rng: seededRng(52)});
  await x.cast('acg-fantasy'); const w = x.spread()!.works[0]!, px = await x.compile(w);
  for (let i = 0; i < 20; i++) await x.draw(w.key, 'item', 10);
  await assert.rejects(x.exchange(w.key, px.items[0]!.id), /兑换没有完成：写入失败/);
  assert.equal(x.points(w.key), 200, '入包失败时点数退回'); assert.equal(flaky.durable.points[w.key]!.points, 200); assert.ok(!flaky.durable.history.some(r => r.spark));
  x.saveSettings({...x.settings(), autoBag: false});
  const kept = await x.exchange(w.key, px.items[0]!.id); assert.equal(kept.record.bagged, false); assert.equal(x.points(w.key), 0, '不入包时只记在抽卡记录里');
  assert.deepEqual(Object.keys(withPoints({}, 'k', '作品', 0, 1)), [], '点数用完就不留这一条');
});
test('角色池：默认关闭；打开后小池加上角色池（三者合计 54–99），角色以书页的形式进主角背包，实力完全等同原作、具现后自由行动', async () => {
  assert.equal(normalizeSettings({}).characterPool, false); assert.equal(normalizeSettings({characterPool: true}).characterPool, true);
  const f = fakePort(), g = createGacha(f.port, {rng: seededRng(61)});
  await g.cast('acg-fantasy'); const w = g.spread()!.works[0]!;
  const plain = await g.compile(w);
  assert.equal(plain.characters, undefined); assert.deepEqual(g.kinds(), ['item', 'fate']);
  await assert.rejects(g.draw(w.key, 'character', 1), /角色池没有打开/);
  g.saveSettings({...g.settings(), characterPool: true});
  assert.deepEqual(g.kinds(), ['item', 'fate', 'character']); assert.match(g.kindReady(plain, 'character')!, /重新编纂/);
  await assert.rejects(g.draw(w.key, 'character', 1), /重新编纂/);
  const calls = f.llmCalls.length, pool = await g.compile(w);
  assert.equal(f.llmCalls.length - calls, 3, '规划与物品、命运、角色各一次');
  assert.equal(pool.characters!.length, 20); assert.equal(g.poolSize(pool), 84); assert.ok(g.poolSize(pool) >= POOL_MIN && g.poolSize(pool) <= POOL_MAX);
  const out = await g.draw(w.key, 'character', 10);
  assert.ok(out.cards.every(c => c.kind === 'character'));
  for (const c of out.cards) assert.equal(c.star, pool.characters!.find(x => x.id === c.id)!.star, '角色按自己在原作里的星级入包');
  const entry = gachaBagEntry(pool.characters![0]!, pool, DESTINED_SCALE), effect = entry.item.效果 as Record<string, string>;
  assert.deepEqual([entry.name, entry.item.类型, entry.item.品质], ['角色·角色0', '角色书页', '神话']); assert.ok((entry.item.标签 as string[]).includes('书页'));
  assert.equal(effect.持有, '以书页的形式被主角持有'); assert.equal(effect.实力, '完全等同原作：实力0'); assert.equal(effect.定位, '主角');
  assert.equal(effect.具现, '一旦被选择具现，便在完全保有自身自由意志的情况下自由行动，主角无法强制约束');
  const bag: Record<string, unknown> = {}; addToBag(bag, entry, pool.work.title);
  assert.deepEqual(listGachaBag({stat_data: {主角: {背包: bag}}}).map(e => [e.kind, e.price]), [['character', 6000]], '角色书页也按品质回收');
  g.saveSettings({...g.settings(), characterPool: false});
  await assert.rejects(g.draw(w.key, 'character', 1), /角色池没有打开/);
});
