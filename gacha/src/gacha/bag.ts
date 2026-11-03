/** 命运抽卡：抽到的卡写进命定之诗主角背包的样子。
 *  物品按模型给的类型放入；命运是“命运”类型的一页，在正文里翻开就会降临。
 *  只改动命运点数与主角背包，其余变量原样保留。 */
import {KIND_LABEL,type GachaCard,type SmallPool} from './pool';
import {MEDIA_LABEL} from './sources';
import type {QualityScale} from './rarity';

type Obj = Record<string, unknown>;
const rec = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const own = (parent: Obj, key: string): Obj => {const v = parent[key]; if (v && typeof v === 'object' && !Array.isArray(v)) return v as Obj; const next: Obj = {}; parent[key] = next; return next;};
/** 背包物品上的来源标签：命定之诗与读者都用它认出这是命运抽卡抽来的东西。 */
export const BAG_TAG = '命运抽卡';

export function gachaBagEntry(card: GachaCard, pool: SmallPool, scale: QualityScale): {name: string; item: Obj} {
  const work = pool.work, from = `${MEDIA_LABEL[work.media]}《${work.title}》`;
  if (card.kind === 'fate') return {name: `命运·${card.name}`, item: {
    品质: scale.label(card.star), 类型: '命运', 数量: 1, 标签: [BAG_TAG, '命运', `作品:${work.title}`, `星级:${card.star}`],
    效果: {命运: card.description, ...(card.hook ? {契机: card.hook} : {}), 使用: '在故事中翻开这一页，这段命运便会降临。'},
    描述: `抽自${from}${card.chapter ? '·' + card.chapter : ''}的${card.star}★命运。`,
  }};
  return {name: card.name, item: {
    品质: scale.label(card.star), 类型: card.type || '道具', 数量: 1, 标签: [BAG_TAG, '物品', `作品:${work.title}`, `星级:${card.star}`, ...(card.owner ? [`原主:${card.owner}`] : [])],
    效果: {来历: card.description, ...(card.use ? {用途: card.use} : {})},
    描述: `抽自${from}的${card.star}★${KIND_LABEL.item}${card.owner ? `，原属${card.owner}` : ''}。`,
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
/** 命定之诗的品质与生命层级一一对应：普通＝第一层级 … 神话＝第六层级。 */
export const QUALITY_TIER: Readonly<Record<string, number>> = {普通: 1, 优良: 2, 稀有: 3, 史诗: 4, 传说: 5, 神话: 6};
export const RECYCLE_QUALITIES = ['神话', '传说', '史诗', '稀有', '优良', '普通'] as const;
/** 回收价 = 与对应层级的角色缔结命定契约的基础价 ÷ RECYCLE_DIVISOR：普通 8 · 优良 20 · 稀有 100 · 史诗 200 · 传说 2000 · 神话 6000。
 *  按现行出货率与保底，抽一次（200）平均只能回收约 140，抽了再回收不会赚。不认识的品质不回收。 */
export const RECYCLE_DIVISOR = 25;
export function recyclePrice(quality: unknown): number {const tier = QUALITY_TIER[String(quality)]; return tier ? Math.floor((CONTRACT_PRICE[tier] ?? 0) / RECYCLE_DIVISOR) : 0;}
export type BagEntry = {name: string; quality: string; kind: 'item' | 'fate'; type: string; count: number; price: number; work: string; star: number};
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
    out.push({name, quality: String(raw.品质), kind: raw.类型 === '命运' || tags.includes('命运') ? 'fate' : 'item', type: String(raw.类型 ?? ''), count, price, work: tag('作品:'), star: Math.floor(Number(tag('星级:'))) || QUALITY_TIER[String(raw.品质)] || 0});
  }
  return out.sort((a, b) => (QUALITY_TIER[b.quality] ?? 0) - (QUALITY_TIER[a.quality] ?? 0) || a.name.localeCompare(b.name, 'zh'));
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
