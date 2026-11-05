/** 命运抽卡的品质档位与概率。内部用 1–7 档：1–6 是命定之诗的 普通 / 优良 / 稀有 / 史诗 / 传说 / 神话，7 是「唯一」。
 *  唯一只给角色：角色池里的每个角色都是唯一，出货率与神话相同；同一部作品里抽到过的角色不会再出现。
 *  界面只显示命定之诗的品质名（星级显示已撤掉：背包不会把星级映射回品质，只会徒增风险；以后通用化时再加回来）。 */
export type Grade = 1 | 2 | 3 | 4 | 5 | 6;
export type Star = Grade | 7;
/** 物品与命运的六个档位（低 → 高）。 */
export const STARS: readonly Grade[] = [1, 2, 3, 4, 5, 6];
/** 唯一：角色专用的档位。 */
export const UNIQUE = 7 as const;
/** 全部档位（含唯一）。 */
export const TIERS: readonly Star[] = [1, 2, 3, 4, 5, 6, 7];
export const isStar = (n: unknown): n is Star => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 7;
export const toStar = (n: unknown, fallback: Star = 1): Star => {const v = Math.round(Number(n)); return isStar(v) ? v : fallback;};
/** 物品、命运只认 1–6（模型写了 7 也压回神话）。 */
export const toGrade = (n: unknown, fallback: Grade = 1): Grade => {const v = Math.round(Number(n)); return v >= 7 ? 6 : v >= 1 && v <= 6 ? v as Grade : fallback;};

export type QualityScale = {id: 'destined'; name: string; label(star: Star): string};
export const DESTINED_QUALITY: Readonly<Record<Star, string>> = {1: '普通', 2: '优良', 3: '稀有', 4: '史诗', 5: '传说', 6: '神话', 7: '唯一'};
export const DESTINED_SCALE: QualityScale = {id: 'destined', name: '命定之诗品质', label: s => DESTINED_QUALITY[s] ?? DESTINED_QUALITY[1]};
export const qualityOf = (s: Star) => DESTINED_SCALE.label(s);
/** 命定之诗的品质名 → 档位（反查，供外部数据对齐）。 */
export const starOfQuality = (quality: string): Star | undefined => TIERS.find(s => DESTINED_QUALITY[s] === quality);

export type GachaRules = {
  /** 基础概率（合计为 1）。7 是唯一：没有可抽的唯一时（没开角色池、角色都抽过了），这一份按比例分给 1–5 档。 */
  rates: Readonly<Record<Star, number>>;
  /** 小保底：前面连续 pity6 − 1 抽都没有神话时，第 pity6 抽必出神话（当前卡池里随机一张）。在各个池之间共用；唯一不算神话，也不清小保底。 */
  pity6: number;
  /** 十连至少一张这个档位。 */
  tenFloor: Grade;
  /** 大保底：在一部作品的小池里每抽攒 1 点抽取点数（只记在这部作品上，不跨池互通），攒满 spark 点可兑换这部作品小池里指定的一张神话。 */
  spark: number;
};
/** 神话基础 0.3%，120 抽内必出一张随机神话（小保底，平均约 101 抽一张）；唯一与神话同为 0.3%；
 *  每部作品攒满 200 点抽取点数可兑换这部作品小池里指定的神话（大保底）；十连至少一张稀有。 */
export const DEFAULT_RULES: GachaRules = {rates: {1: .517, 2: .30, 3: .12, 4: .045, 5: .012, 6: .003, 7: .003}, pity6: 120, tenFloor: 3, spark: 200};
/** since6：距离上一张神话已经抽了几次（不含即将进行的这一抽）；total：累计抽数。 */
export type PityState = {since6: number; total: number};
export const emptyPity = (): PityState => ({since6: 0, total: 0});
export function normalizePity(raw: unknown): PityState {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const n = (v: unknown) => {const x = Math.floor(Number(v)); return Number.isFinite(x) && x >= 0 ? x : 0;};
  return {since6: n(r.since6), total: n(r.total)};
}
/** 下一抽出神话的实际概率：到了小保底那一抽必出，其余都是基础概率。 */
export function chance6(pity: PityState, rules: GachaRules = DEFAULT_RULES): number {
  return pity.since6 + 1 >= rules.pity6 ? 1 : rules.rates[6];
}
/** 滚一抽的档位。unique：这一抽还有没有可抽的唯一；没有时唯一那一份不出现（按比例分给其余档位）。 */
export function rollStar(rng: () => number, pity: PityState, rules: GachaRules = DEFAULT_RULES, unique = false): Star {
  const p6 = chance6(pity, rules), r = Math.min(.999999999, Math.max(0, rng()));
  if (r < p6) return 6;
  // 其余档位按基础概率分配剩下的 1 − p6。
  const rest: Star[] = unique ? [7, 5, 4, 3, 2, 1] : [5, 4, 3, 2, 1], total = rest.reduce((s, k) => s + rules.rates[k], 0);
  let x = (r - p6) / (1 - p6) * total;
  for (const k of rest) {x -= rules.rates[k]; if (x < 0) return k;}
  return 1;
}
export function advancePity(p: PityState, star: Star): PityState {
  return {since6: star === 6 ? 0 : p.since6 + 1, total: p.total + 1};
}
/** 连抽：逐抽滚档位并推进保底；uniqueLeft 是这次还能抽到几个唯一（抽到一个少一个）。
 *  十连若没有 tenFloor 以上，把最后一张提到 tenFloor（保底重新按顺序计算）。 */
export function drawStars(count: number, rng: () => number, pity: PityState, rules: GachaRules = DEFAULT_RULES, uniqueLeft = 0): {stars: Star[]; pity: PityState} {
  const n = Math.max(1, Math.min(100, Math.floor(count)));
  const stars: Star[] = [];
  let p = {...pity}, left = Math.max(0, Math.floor(uniqueLeft));
  for (let i = 0; i < n; i++) {const s = rollStar(rng, p, rules, left > 0); if (s === UNIQUE) left--; stars.push(s); p = advancePity(p, s);}
  if (n >= 10 && Math.max(...stars) < rules.tenFloor) {
    stars[n - 1] = rules.tenFloor;
    p = {...pity}; for (const s of stars) p = advancePity(p, s);
  }
  return {stars, pity: p};
}
/** 界面用的概率说明。unique：正在使用角色池时才列出唯一。 */
export function ratesText(rules: GachaRules = DEFAULT_RULES, unique = false): string[] {
  const pct = (v: number) => (Math.round(v * 1000) / 10).toString().replace(/\.0$/, '') + '%', q = qualityOf;
  const order: Star[] = unique ? [7, 6, 5, 4, 3, 2, 1] : [6, 5, 4, 3, 2, 1];
  return [
    order.map(s => `${q(s)} ${pct(rules.rates[s])}`).join(' · '),
    `小保底：${rules.pity6} 抽内必出一张随机${q(6)}，在各个池之间共用，换小池、换大池都不清零。大保底：在一部作品的小池里每抽攒 1 点抽取点数，攒满 ${rules.spark} 点可兑换这部作品小池里任选的一张${q(6)}；点数只能在这部作品的小池里使用，不跨池互通。每次十连至少一张${q(rules.tenFloor)}。` +
      (unique ? `角色都是${q(7)}：与${q(6)}同为 ${pct(rules.rates[7])}，不计入小保底；同一部作品里抽到过的角色不会再出现，都抽到后这一份按比例分给其余品质。` : ''),
  ];
}
/** 浏览器里用 crypto 取随机数；拿不到时退回 Math.random。 */
export function cryptoRng(win?: {crypto?: Crypto}): () => number {
  const c = win?.crypto ?? (typeof crypto !== 'undefined' ? crypto : undefined);
  if (c?.getRandomValues) {const buf = new Uint32Array(1); return () => {c.getRandomValues(buf); return buf[0]! / 4294967296;};}
  return Math.random;
}
/** 可复现的随机数（测试、种子化洗牌）。 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;};
}
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!];}
  return out;
}
