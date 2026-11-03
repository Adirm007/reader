/** 命运抽卡的大池主题：主题 = 若干资料库查询的组合，可增删、可在设置里自定义，不锁死在几个枚举上。
 *  每个资料库的查询键都经过实测（2026-11：Wikidata 体裁 Q 号、Bangumi 标签、AniList genre/tag、VNDB 标签号）。
 *  同一资料库里的多个键是“或”：分别查询再合并。 */
export type Direction = 'literature' | 'acgn';
export const DIRECTIONS: Readonly<Record<Direction, {name: string; blurb: string}>> = {
  literature: {name: '文学', blurb: '神话、史诗、推理、科幻……从古今书目里捞起'},
  acgn: {name: 'ACGN', blurb: '动画、漫画、轻小说、游戏与视觉小说'},
};
export type SourceId = 'wikidata' | 'openlibrary' | 'googlebooks' | 'archive' | 'bangumi' | 'anilist' | 'vndb' | 'jikan';
export type ThemeQuery = {
  /** Wikidata：体裁（P136）与主题（P921）的 Q 号；只取有中文维基条目的作品。 */
  wikidata?: {genres?: string[]; subjects?: string[]};
  /** Open Library / Google Books / Internet Archive：英文主题词。 */
  openlibrary?: {subjects: string[]};
  googlebooks?: {subjects: string[]};
  archive?: {subjects: string[]};
  /** Bangumi：中文标签；types 为条目类型（1 书籍 2 动画 4 游戏）。 */
  bangumi?: {tags: string[]; types?: number[]};
  /** AniList：genre 与 tag（英文）。 */
  anilist?: {genres?: string[]; tags?: string[]; types?: ('ANIME' | 'MANGA')[]};
  /** VNDB：标签号（g 开头）；空数组表示不按标签筛选。 */
  vndb?: {tags: string[]};
  /** Jikan（MyAnimeList）：genre 编号。 */
  jikan?: {genres: number[]; kinds?: ('anime' | 'manga')[]};
};
export type GachaTheme = {id: string; direction: Direction; name: string; blurb: string; query: ThemeQuery; custom?: boolean};

const lit = (id: string, name: string, blurb: string, query: ThemeQuery): GachaTheme => ({id: 'lit-' + id, direction: 'literature', name, blurb, query});
const acg = (id: string, name: string, blurb: string, query: ThemeQuery): GachaTheme => ({id: 'acg-' + id, direction: 'acgn', name, blurb, query});
export const DEFAULT_THEMES: readonly GachaTheme[] = [
  lit('myth', '神话', '诸神、英雄与史诗', {wikidata: {genres: ['Q37484', 'Q693', 'Q44342'], subjects: ['Q34726', 'Q128285', 'Q210677', 'Q9134']}, openlibrary: {subjects: ['mythology', 'greek_mythology', 'norse_mythology', 'legends']}, googlebooks: {subjects: ['mythology']}, archive: {subjects: ['mythology']}}),
  lit('fairy', '童话与民间故事', '口耳相传的奇遇', {wikidata: {genres: ['Q699', 'Q1221280', 'Q693']}, openlibrary: {subjects: ['fairy_tales', 'folklore', 'fables']}, googlebooks: {subjects: ['fairy tales']}, archive: {subjects: ['fairy tales']}}),
  lit('zhiguai', '志怪传奇', '鬼狐、异闻与传奇', {wikidata: {genres: ['Q14739201', 'Q16143859', 'Q1519335'], subjects: ['Q210677']}, openlibrary: {subjects: ['ghost_stories']}}),
  lit('wuxia', '武侠仙侠', '江湖、门派与修行', {wikidata: {genres: ['Q754803', 'Q24907097']}, openlibrary: {subjects: ['martial_arts_fiction']}}),
  lit('mystery', '推理', '谜题、侦探与罪案', {wikidata: {genres: ['Q186424', 'Q6585139', 'Q208505']}, openlibrary: {subjects: ['detective_and_mystery_stories', 'mystery_and_detective_stories']}, googlebooks: {subjects: ['detective and mystery stories']}}),
  lit('scifi', '科幻', '星海、机械与未来', {wikidata: {genres: ['Q24925', 'Q174526', 'Q468478', 'Q197949', 'Q223685']}, openlibrary: {subjects: ['science_fiction']}, googlebooks: {subjects: ['science fiction']}}),
  lit('fantasy', '奇幻', '魔法、异界与远征', {wikidata: {genres: ['Q132311', 'Q1057172', 'Q326439', 'Q794912', 'Q1188977']}, openlibrary: {subjects: ['fantasy', 'fantasy_fiction']}, googlebooks: {subjects: ['fantasy']}}),
  lit('horror', '恐怖与哥特', '古堡、幽灵与不可名状', {wikidata: {genres: ['Q193606', 'Q16575965', 'Q192782', 'Q1519335', 'Q7644030', 'Q111019576']}, openlibrary: {subjects: ['horror', 'horror_tales', 'ghost_stories', 'vampires']}, googlebooks: {subjects: ['horror']}}),
  lit('romance', '爱情', '相遇、错过与长相守', {wikidata: {genres: ['Q858330']}, openlibrary: {subjects: ['love_stories', 'romance']}, googlebooks: {subjects: ['love stories']}}),
  lit('history', '历史', '王朝、战事与时代群像', {wikidata: {genres: ['Q1196408']}, openlibrary: {subjects: ['historical_fiction']}, googlebooks: {subjects: ['historical fiction']}}),
  lit('adventure', '冒险', '航海、寻宝与远方', {wikidata: {genres: ['Q319226']}, openlibrary: {subjects: ['adventure_stories', 'sea_stories', 'pirates']}}),
  lit('dystopia', '乌托邦与反乌托邦', '理想国与它的阴影', {wikidata: {genres: ['Q15062348', 'Q15062360']}, openlibrary: {subjects: ['dystopias', 'utopias']}}),
  lit('war', '战争', '烽火中的人', {wikidata: {genres: ['Q908667']}, openlibrary: {subjects: ['war_stories']}}),
  lit('growth', '成长与校园', '少年、学园与告别', {wikidata: {genres: ['Q223945', 'Q7432631']}, openlibrary: {subjects: ['bildungsromans', 'school_stories', 'coming_of_age']}}),
  lit('satire', '讽刺与寓言', '笑声里的针', {wikidata: {genres: ['Q128758', 'Q693']}, openlibrary: {subjects: ['satire', 'humorous_stories']}}),
  lit('magic-real', '魔幻现实', '日常里长出的奇迹', {wikidata: {genres: ['Q147516']}, openlibrary: {subjects: ['magic_realism']}}),
  lit('spy', '间谍与惊悚', '暗号、追逃与反转', {wikidata: {genres: ['Q1426213', 'Q182015']}, openlibrary: {subjects: ['spy_stories', 'suspense_fiction']}}),
  lit('philosophy', '哲思与心理', '向内的旅程', {wikidata: {genres: ['Q2016518', 'Q101240581']}, openlibrary: {subjects: ['psychological_fiction']}}),
  acg('myth', '神话', '诸神降临的故事', {bangumi: {tags: ['神话', '宗教']}, anilist: {tags: ['Mythology', 'Gods']}, vndb: {tags: ['g438', 'g58', 'g57']}, jikan: {genres: [6]}}),
  acg('fantasy', '奇幻', '剑与魔法', {bangumi: {tags: ['奇幻']}, anilist: {genres: ['Fantasy']}, vndb: {tags: ['g2']}, jikan: {genres: [10]}}),
  acg('scifi', '科幻', '星舰、义体与赛博', {bangumi: {tags: ['科幻', '赛博朋克']}, anilist: {genres: ['Sci-Fi'], tags: ['Cyberpunk', 'Space']}, vndb: {tags: ['g105', 'g682']}, jikan: {genres: [24]}}),
  acg('mystery', '推理悬疑', '密室、真相与悬念', {bangumi: {tags: ['推理', '悬疑']}, anilist: {genres: ['Mystery'], tags: ['Detective']}, vndb: {tags: ['g19', 'g323']}, jikan: {genres: [7, 39]}}),
  acg('romance', '恋爱', '心动与告白', {bangumi: {tags: ['恋爱']}, anilist: {genres: ['Romance']}, vndb: {tags: ['g96']}, jikan: {genres: [22]}}),
  acg('school', '校园', '教室、社团与放学后', {bangumi: {tags: ['校园']}, anilist: {tags: ['School']}, vndb: {tags: ['g47']}, jikan: {genres: [23]}}),
  acg('isekai', '异世界', '转生、穿越与另一片天空', {bangumi: {tags: ['异世界', '穿越']}, anilist: {tags: ['Isekai', 'Reincarnation']}, vndb: {tags: ['g2180']}, jikan: {genres: [62]}}),
  acg('mecha', '机战', '钢铁巨人的咆哮', {bangumi: {tags: ['机战']}, anilist: {genres: ['Mecha'], tags: ['Super Robot', 'Real Robot']}, vndb: {tags: ['g377', 'g14']}, jikan: {genres: [18]}}),
  acg('horror', '恐怖', '深夜别回头', {bangumi: {tags: ['恐怖', '克苏鲁']}, anilist: {genres: ['Horror'], tags: ['Cosmic Horror']}, vndb: {tags: ['g7', 'g55']}, jikan: {genres: [14]}}),
  acg('history', '历史', '武士、王国与旧时代', {bangumi: {tags: ['历史']}, anilist: {tags: ['Historical', 'Samurai']}, jikan: {genres: [13]}}),
  acg('youkai', '妖怪与民俗', '百鬼夜行', {bangumi: {tags: ['妖怪', '民俗']}, anilist: {tags: ['Youkai', 'Ghost']}, vndb: {tags: ['g353']}}),
  acg('wuxia', '武侠仙侠', '御剑乘风', {bangumi: {tags: ['武侠', '仙侠']}, anilist: {tags: ['Wuxia', 'Cultivation', 'Martial Arts']}, jikan: {genres: [17]}}),
  acg('battle', '热血战斗', '燃烧吧', {bangumi: {tags: ['热血', '战斗']}, anilist: {genres: ['Action'], tags: ['Super Power']}, jikan: {genres: [1, 31]}}),
  acg('healing', '治愈日常', '平凡而温柔的一天', {bangumi: {tags: ['治愈', '日常']}, anilist: {genres: ['Slice of Life']}, jikan: {genres: [36]}}),
  acg('magical-girl', '魔法少女', '变身与契约', {bangumi: {tags: ['魔法少女']}, anilist: {genres: ['Mahou Shoujo']}, jikan: {genres: [66]}}),
  acg('vampire', '吸血鬼', '永夜的眷属', {bangumi: {tags: ['吸血鬼']}, anilist: {tags: ['Vampire']}, vndb: {tags: ['g5']}, jikan: {genres: [32]}}),
  acg('time', '时间与轮回', '回到那一天', {bangumi: {tags: ['时间旅行', '穿越']}, anilist: {tags: ['Time Manipulation', 'Time Loop']}, vndb: {tags: ['g249']}, jikan: {genres: [78]}}),
  acg('apocalypse', '末日', '废墟之后', {bangumi: {tags: ['末日']}, anilist: {tags: ['Post-Apocalyptic', 'Dystopian', 'Survival']}, vndb: {tags: ['g68']}, jikan: {genres: [76]}}),
  acg('fairy', '童话', '很久很久以前', {bangumi: {tags: ['童话']}, anilist: {tags: ['Fairy Tale']}, vndb: {tags: ['g1008']}}),
  acg('steampunk', '蒸汽朋克', '齿轮与飞艇', {bangumi: {tags: ['蒸汽朋克']}, anilist: {tags: ['Steampunk']}, vndb: {tags: ['g608']}}),
  acg('vn', '视觉小说', 'Galgame 与 AVG', {bangumi: {tags: ['galgame'], types: [4]}, vndb: {tags: []}}),
];

/** 自定义主题：中文关键词用于 Bangumi 标签，英文关键词用于 Open Library / Google Books / Internet Archive / AniList / VNDB。 */
export type CustomThemeInput = {name: string; direction: Direction; zh?: string; en?: string};
const clean = (v: unknown, max = 24) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
export function customTheme(input: CustomThemeInput, at = Date.now()): GachaTheme | undefined {
  const name = clean(input.name, 16), zh = clean(input.zh), en = clean(input.en, 40).toLowerCase();
  if (!name || (!zh && !en)) return undefined;
  const direction: Direction = input.direction === 'acgn' ? 'acgn' : 'literature';
  const subject = en.replace(/\s+/g, '_');
  const query: ThemeQuery = direction === 'literature'
    ? {...(en ? {openlibrary: {subjects: [subject]}, googlebooks: {subjects: [en]}, archive: {subjects: [en]}} : {})}
    : {...(zh ? {bangumi: {tags: [zh]}} : {}), ...(en ? {anilist: {tags: [en.replace(/\b\w/g, c => c.toUpperCase())]}, vndb: {tags: ['search:' + en]}} : {})};
  return {id: 'custom-' + at.toString(36), direction, name, blurb: [zh, en].filter(Boolean).join(' / '), query, custom: true};
}
export function normalizeThemes(raw: unknown): GachaTheme[] {
  const list = Array.isArray(raw) ? raw : [], out: GachaTheme[] = [];
  for (const v of list.slice(0, 40)) {
    const r = v && typeof v === 'object' ? v as Record<string, unknown> : {};
    if (typeof r.id !== 'string' || !/^custom-[a-z0-9]+$/.test(r.id) || typeof r.name !== 'string') continue;
    const q = r.query && typeof r.query === 'object' ? r.query as ThemeQuery : {};
    out.push({id: r.id, direction: r.direction === 'acgn' ? 'acgn' : 'literature', name: clean(r.name, 16), blurb: clean(r.blurb, 60), query: structuredClone(q), custom: true});
  }
  return out;
}
export const themeSources = (t: GachaTheme): SourceId[] => (Object.keys(t.query) as SourceId[]).filter(k => !!t.query[k]);
