/** 命运抽卡：抽到的卡写进命定之诗主角背包的样子。
 *  物品按模型给的类型放入：按世界书细则写过属性的装备、消耗品、资产等带着格式化的标签与效果，抽到就能直接用；
 *  技能书页只写大概，在正文里研读时由正文模型按规则生成完整的技能（书页可以转赠）；命运是“命运”类型的一页，在正文里翻开就会降临；
 *  角色是一页角色书页：以书页的形式被主角持有，实力完全等同原作，一旦被选择具现便完全保有自身自由意志、自由行动，主角无法强制约束。
 *  只改动命运点数与主角背包，其余变量原样保留。 */
import {type GachaCard,type SmallPool} from './pool';
import {MEDIA_LABEL} from './sources';
import {starOfQuality,type QualityScale} from './rarity';
import {isSkillPage} from './spec';

type Obj = Record<string, unknown>;
const rec = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const own = (parent: Obj, key: string): Obj => {const v = parent[key]; if (v && typeof v === 'object' && !Array.isArray(v)) return v as Obj; const next: Obj = {}; parent[key] = next; return next;};
/** 背包物品上的来源标签：命定之诗与读者都用它认出这是命运抽卡抽来的东西。 */
export const BAG_TAG = '命运抽卡';

/** 角色书页上写给正文模型看的规矩（与设置里角色池的说明一致）。 */
export const CHARACTER_PAGE = {持有: '以书页的形式被主角持有', 具现: '一旦被选择具现，便在完全保有自身自由意志的情况下自由行动，主角无法强制约束'} as const;
export function gachaBagEntry(card: GachaCard, pool: SmallPool, scale: QualityScale): {name: string; item: Obj} {
  const work = pool.work, from = `${MEDIA_LABEL[work.media]}《${work.title}》`, quality = scale.label(card.star);
  if (card.kind === 'character') return {name: `角色·${card.name}`, item: {
    品质: quality, 类型: '角色书页', 数量: 1, 标签: [BAG_TAG, '角色', '书页', `作品:${work.title}`],
    效果: {身份: card.description, ...(card.role ? {定位: card.role} : {}), 实力: card.power ? `完全等同原作：${card.power}` : '完全等同原作', ...CHARACTER_PAGE},
    描述: `抽自${from}的${quality}角色书页${card.role ? `（${card.role}）` : ''}。`,
  }};
  if (card.kind === 'fate') return {name: `命运·${card.name}`, item: {
    品质: quality, 类型: '命运', 数量: 1, 标签: [BAG_TAG, '命运', `作品:${work.title}`],
    效果: {命运: card.description, ...(card.hook ? {契机: card.hook} : {}), 使用: '在故事中翻开这一页，这段命运便会降临。'},
    描述: `抽自${from}${card.chapter ? '·' + card.chapter : ''}的${quality}命运。`,
  }};
  const origin = `抽自${from}的${quality}${isSkillPage(card) ? '技能书页' : '物品'}${card.owner ? `，原属${card.owner}` : ''}。`, owner = card.owner ? [`原主:${card.owner}`] : [];
  if (isSkillPage(card)) return {name: card.name, item: {
    品质: quality, 类型: '技能书页', 数量: 1, 标签: [BAG_TAG, '物品', '书页', `作品:${work.title}`, ...owner],
    效果: {技能: card.description, ...(card.use ? {用途: card.use} : {}), 使用: '翻开研读即可习得这项技能，具体的消耗、标签与效果在习得时按世界规则生成；书页可以转赠他人。'},
    描述: origin,
  }};
  // 按世界书细则写过属性：带着格式化的标签与效果，抽到就能直接用；来历写进描述。
  if (card.spec) return {name: card.name, item: {
    品质: quality, 类型: card.spec.type || card.type || '道具', 数量: 1, 标签: [BAG_TAG, '物品', `作品:${work.title}`, ...owner, ...card.spec.tags],
    效果: {...card.spec.effects},
    描述: `${card.description}${card.use ? (/[。！？]$/.test(card.use) ? card.use : card.use + '。') : ''}${origin}`,
  }};
  return {name: card.name, item: {
    品质: quality, 类型: card.type || '道具', 数量: 1, 标签: [BAG_TAG, '物品', `作品:${work.title}`, ...owner],
    效果: {来历: card.description, ...(card.use ? {用途: card.use} : {})},
    描述: origin,
  }};
}
/** 同名、同品质、同效果的叠加数量；同名但不同的东西加上作品名区分，绝不覆盖已有物品。 */
export function addToBag(bag: Obj, entry: {name: string; item: Obj}, title: string): string {
  const same = (o: unknown) => !!o && typeof o === 'object' && (o as Obj).品质 === entry.item.品质 && (o as Obj).类型 === entry.item.类型 && JSON.stringify((o as Obj).效果) === JSON.stringify(entry.item.效果);
  let name = entry.name;
  if (bag[name] && !same(bag[name])) {
    const alt = `${entry.name}（《${title}》）`; name = alt;
    for (let i = 2; bag[name] && !same(bag[name]); i++) name = alt + i;
  }
  const old = rec(bag[name]), count = Math.floor(Number(old.数量) || 0);
  bag[name] = {...entry.item, 数量: Math.max(1, Math.min(9999, (count > 0 ? count : 0) + 1))};
  return name;
}
export type DrawWrite = {cost: number; cards: GachaCard[]; pool: SmallPool; bag: boolean; scale: QualityScale};
/** 在一份（可改写的）消息变量上扣命运点数并把抽到的东西放进主角背包。
 *  charge 负责校验与扣点（读者用 ReaderTransactions.charge）；花费为 0 时不碰命运点数。 */
export function applyGachaDraw(data: Obj, req: DrawWrite, charge: (data: Obj, cost: number) => number, readFp: (data: Obj) => number | null): {fp: number | null; added: string[]} {
  const fp = req.cost > 0 ? charge(data, req.cost) : readFp(data);
  const added: string[] = [];
  if (req.bag && req.cards.length) {
    const stat = own(data, 'stat_data'), player = own(stat, '主角'), bag = own(player, '背包');
    for (const card of req.cards) added.push(addToBag(bag, gachaBagEntry(card, req.pool, req.scale), req.pool.work.title));
  }
  return {fp, added};
}

/* ---------- 回收 ---------- */
/** 命定契约的基础价（读者世界书「命定契约」：一层级 200 | 二 500 | 三 2500 | 四 5000 | 五 50000 | 六 150000；七层级不能用命运点数缔结）。 */
export const CONTRACT_PRICE: Readonly<Record<number, number>> = {1: 200, 2: 500, 3: 2500, 4: 5000, 5: 50000, 6: 150000};
/** 命定之诗的品质与生命层级一一对应：普通＝第一层级 … 神话＝第六层级；唯一（角色书页）与神话同价。 */
export const QUALITY_TIER: Readonly<Record<string, number>> = {普通: 1, 优良: 2, 稀有: 3, 史诗: 4, 传说: 5, 神话: 6, 唯一: 6};
export const RECYCLE_QUALITIES = ['唯一', '神话', '传说', '史诗', '稀有', '优良', '普通'] as const;
/** 回收价 = 与对应层级的角色缔结命定契约的基础价 ÷ RECYCLE_DIVISOR：普通 8 · 优良 20 · 稀有 100 · 史诗 200 · 传说 2000 · 神话 6000 · 唯一 6000。
 *  回收掉的唯一角色也不会再抽到。
 *  按现行出货率与保底，抽一次（200）平均只能回收约 140，抽了再回收不会赚。不认识的品质不回收。 */
export const RECYCLE_DIVISOR = 25;
export function recyclePrice(quality: unknown): number {const tier = QUALITY_TIER[String(quality)]; return tier ? Math.floor((CONTRACT_PRICE[tier] ?? 0) / RECYCLE_DIVISOR) : 0;}
export type BagEntry = {name: string; quality: string; kind: 'item' | 'fate' | 'character'; type: string; count: number; price: number; work: string; star: number};
export type RecyclePick = {name: string; quality: string; count: number};
const isGachaItem = (v: unknown): v is Obj => !!v && typeof v === 'object' && Array.isArray((v as Obj).标签) && ((v as Obj).标签 as unknown[]).includes(BAG_TAG);
/** 读出主角背包里来自命运抽卡、品质可识别的东西（数量为正）。 */
export function listGachaBag(data: Obj): BagEntry[] {
  const bag = rec(rec(rec(data.stat_data).主角).背包), out: BagEntry[] = [];
  for (const [name, raw] of Object.entries(bag)) {
    if (!isGachaItem(raw)) continue;
    const count = Math.floor(Number(raw.数量) || 0), price = recyclePrice(raw.品质);
    if (count <= 0 || !price) continue;
    const tags = (raw.标签 as unknown[]).map(String), tag = (p: string) => tags.find(t => t.startsWith(p))?.slice(p.length) ?? '';
    out.push({name, quality: String(raw.品质), kind: raw.类型 === '命运' || tags.includes('命运') ? 'fate' : raw.类型 === '角色书页' || tags.includes('角色') ? 'character' : 'item', type: String(raw.类型 ?? ''), count, price, work: tag('作品:'), star: starOfQuality(String(raw.品质)) ?? 0});
  }
  return out.sort((a, b) => b.star - a.star || a.name.localeCompare(b.name, 'zh'));
}
/** 在一份（可改写的）消息变量上回收：逐件核对还在背包里、品质没变，再移出并加回命运点数。 */
export function applyRecycle(data: Obj, picks: RecyclePick[], readFp: (data: Obj) => number): {fp: number; gained: number; removed: number} {
  if (!picks.length) throw Error('没有选择要回收的东西');
  const fp = readFp(data), bag = rec(rec(rec(data.stat_data).主角).背包);
  let gained = 0, removed = 0;
  for (const pick of picks) {
    const raw = bag[pick.name], want = Math.floor(Number(pick.count) || 0);
    if (!isGachaItem(raw) || String(raw.品质) !== pick.quality) throw Error(`背包里的「${pick.name}」已经变了，请重新打开回收`);
    const have = Math.floor(Number(raw.数量) || 0), n = Math.min(have, want), price = recyclePrice(raw.品质);
    if (n <= 0 || !price) throw Error(`「${pick.name}」不能回收`);
    if (n >= have) delete bag[pick.name]; else bag[pick.name] = {...raw, 数量: have - n};
    gained += n * price; removed += n;
  }
  (data.stat_data as Obj).命运点数 = fp + gained;
  return {fp: fp + gained, gained, removed};
}
