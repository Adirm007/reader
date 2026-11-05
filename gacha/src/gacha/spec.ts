/** 世界观物品生成细则：小池编纂的最后一步。
 *  装备、武器、消耗品、资产等抽进背包就要能直接用，所以编纂完物品后，再让模型读世界书里的生成细则，按细则给这些物品写出格式化的属性（类型、标签、效果）。
 *  技能书页、命运与角色书页不走这一步：它们在正文里使用时，由正文模型按规则生成完整属性（技能书页可以转赠，同理）。
 *  细则不内置在脚本里：编纂时按设置里的条目名去读当前角色卡、聊天与全局世界书里名称包含这些字样的条目，
 *  玩家改了世界书里的规则也照样适用；换别的宿主时只要改条目名。 */
import {MEDIA_LABEL,type WorkCard} from './sources';
import {qualityOf} from './rarity';
import {normalizeSpec,readReply,type GachaCard,type ItemSpec} from './pool';

/** 默认去读的条目（命定之诗世界书「额外设定」里的这几条）；设置里可以改。 */
export const DEFAULT_SPEC_ENTRIES: readonly string[] = ['技能装备道具生成规则', '品质效果限定', '核心数值表', '状态规则'];
export type SpecSettings = {enabled: boolean; entries: string[]};
export const defaultSpecSettings = (): SpecSettings => ({enabled: true, entries: [...DEFAULT_SPEC_ENTRIES]});
export function normalizeSpecSettings(raw: unknown): SpecSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
  if (!r) return defaultSpecSettings();
  const entries = (Array.isArray(r.entries) ? r.entries : []).map(v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean);
  return {enabled: r.enabled !== false, entries: [...new Set(entries)].slice(0, 12)};
}
/** 一次请求写多少件物品的属性。 */
export const SPEC_BATCH = 12;
/** 细则全文最多带多少字（太长时截掉后面的条目）。 */
export const SPEC_TEXT_LIMIT = 24000;

/** 要按细则写属性的物品：物品池里除技能书页以外的东西。 */
export const isSkillPage = (card: GachaCard) => card.kind === 'item' && /技能书|技能页|秘籍/.test(card.type ?? '');
export const needsSpec = (card: GachaCard) => card.kind === 'item' && !isSkillPage(card);

export type SpecEntry = {name: string; content: string};
/** 世界书条目原文里的模板语法（EJS 之类）不交给模型。 */
export function cleanSpecText(content: unknown): string {
  return String(content ?? '').replace(/<%[\s\S]*?%>/g, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function specText(entries: readonly SpecEntry[], limit = SPEC_TEXT_LIMIT): string {
  const out: string[] = [];
  let used = 0;
  for (const e of entries) {
    const block = `【${e.name}】\n${e.content}`;
    if (used + block.length > limit) {if (!out.length) out.push(block.slice(0, limit)); break;}
    out.push(block); used += block.length;
  }
  return out.join('\n\n');
}

export function specPrompt(entries: readonly SpecEntry[], work: WorkCard, cards: readonly GachaCard[]): {system: string; user: string} {
  const rows = cards.map(c => ({name: c.name, quality: qualityOf(c.star), type: c.type ?? '', ...(c.owner ? {owner: c.owner} : {}), description: c.description, ...(c.use ? {use: c.use} : {})}));
  return {
    system: '你是「命运抽卡」的物品规格编纂人。玩家从作品里抽到的物品会直接放进主角的背包，抽到就能用，所以每件物品都要有能直接结算的属性。下面给出世界书里的生成细则：严格照它的格式、品质区间与数值范围写；细则里与物品无关的部分（技能、角色、战斗流程等）忽略。只输出一个 JSON 对象，不要解释、不要 Markdown 代码块。',
    user: [
      '【世界书细则】',
      specText(entries),
      '',
      `【作品】${MEDIA_LABEL[work.media] ?? ''}《${work.title}》`,
      '【要写属性的物品】品质已经定好，不得更改；词条数与数值必须落在这个品质的区间内。',
      JSON.stringify(rows),
      '',
      '要求：',
      '- 按细则判断每件物品是装备、道具还是资产，用对应的格式；type 照细则的写法写具体类型（如单手剑、重甲、戒指、消耗品、材料、住宅、载具），不要写成技能。',
      '- tags 是标签数组（如 "攻击: 320"、"防御: 180"、"速度: 300km/天"）；effects 是“效果名: 效果”对象，一条一个效果。资产把总空间、结算、位置也写进 effects。',
      '- 效果要贴合物品在原作里的来历与作用，不要写成与原作无关的泛用属性。',
      '- name 照抄，不要改名，不要增删物品。',
      'JSON 格式：{"items":[{"name":"","type":"","tags":[""],"effects":{"效果名":"效果"}}]}',
    ].join('\n'),
  };
}
/** 读模型回复：按名字对回这一批物品，认不出的名字与空属性跳过。 */
export function parseSpecs(raw: string, cards: readonly GachaCard[]): Map<string, ItemSpec> {
  const v = readReply(raw), names = new Set(cards.map(c => c.name)), out = new Map<string, ItemSpec>();
  for (const row of Array.isArray(v.items) ? v.items : []) {
    const r = row && typeof row === 'object' ? row as Record<string, unknown> : {}, name = String(r.name ?? '').trim();
    if (!names.has(name) || out.has(name)) continue;
    const spec = normalizeSpec(r); if (spec) out.set(name, spec);
  }
  return out;
}

/* ---------- 读世界书（酒馆助手） ---------- */
type WbEntry = {name?: unknown; comment?: unknown; content?: unknown; enabled?: unknown; disable?: unknown};
/** 酒馆助手里读世界书用到的部分（新旧两套接口都认）。 */
export type WorldbookHelper = {
  getCharWorldbookNames?: (c: 'current') => {primary?: string | null; additional?: string[]} | null | undefined;
  getChatWorldbookName?: (c: 'current') => string | null | undefined;
  getGlobalWorldbookNames?: () => string[] | null | undefined;
  getWorldbook?: (name: string) => Promise<WbEntry[]> | WbEntry[];
  getCharLorebooks?: (o?: {type?: string}) => {primary?: string | null; additional?: string[]} | null | undefined;
  getChatLorebook?: () => string | null | undefined;
  getLorebookSettings?: () => {selected_global_lorebooks?: string[]} | null | undefined;
  getLorebookEntries?: (name: string) => Promise<WbEntry[]> | WbEntry[];
};
const tryCall = <T>(fn: () => T): T | undefined => {try {return fn();} catch {return undefined;}};
/** 当前角色卡（主、附加）→ 聊天 → 全局 的世界书名。 */
export function worldbookNames(h: WorldbookHelper): string[] {
  const char = tryCall(() => h.getCharWorldbookNames?.('current')) ?? tryCall(() => h.getCharLorebooks?.({type: 'all'}));
  const chat = tryCall(() => h.getChatWorldbookName?.('current')) ?? tryCall(() => h.getChatLorebook?.());
  const global = tryCall(() => h.getGlobalWorldbookNames?.()) ?? tryCall(() => h.getLorebookSettings?.()?.selected_global_lorebooks);
  const all = [char?.primary, ...(char?.additional ?? []), chat, ...(global ?? [])].filter((n): n is string => typeof n === 'string' && !!n.trim());
  return [...new Set(all)];
}
/** 按条目名读细则：每个名字取第一条名称包含它的条目（启用的优先，角色卡的世界书优先）。读不到就返回空数组。 */
export async function readSpecEntries(h: WorldbookHelper | undefined, wanted: readonly string[]): Promise<SpecEntry[]> {
  if (!h || !wanted.length) return [];
  const books: {book: string; entries: WbEntry[]}[] = [];
  for (const book of worldbookNames(h)) {
    let entries: unknown;
    try {entries = h.getWorldbook ? await h.getWorldbook(book) : h.getLorebookEntries ? await h.getLorebookEntries(book) : undefined;} catch {entries = undefined;}
    if (Array.isArray(entries)) books.push({book, entries: entries as WbEntry[]});
  }
  const out: SpecEntry[] = [], used = new Set<WbEntry>();
  const nameOf = (e: WbEntry) => String(e.name ?? e.comment ?? '');
  const on = (e: WbEntry) => e.enabled !== false && e.disable !== true;
  for (const want of wanted) {
    const hits = books.flatMap(b => b.entries.filter(e => !used.has(e) && nameOf(e).includes(want)));
    const pick = hits.find(on) ?? hits[0];
    if (!pick) continue;
    const content = cleanSpecText(pick.content);
    if (!content) continue;
    used.add(pick); out.push({name: nameOf(pick).slice(0, 80), content});
  }
  return out;
}
