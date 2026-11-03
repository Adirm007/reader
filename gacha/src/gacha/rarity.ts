/** 命运抽卡的星级与概率。抽卡本身只认 1–6★；品质名由“刻度”决定：
 *  命定之诗用 普通 / 优良 / 稀有 / 史诗 / 传说 / 神话，以后接别的宿主时换一套刻度即可。 */
export type Star = 1 | 2 | 3 | 4 | 5 | 6;
export const STARS: readonly Star[] = [1, 2, 3, 4, 5, 6];
export const isStar = (n: unknown): n is Star => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6;
export const toStar = (n: unknown, fallback: Star = 1): Star => {const v = Math.round(Number(n)); return isStar(v) ? v : fallback;};
export const starText = (s: Star) => '★'.repeat(s);

export type QualityScale = {id: 'destined' | 'stars'; name: string; label(star: Star): string};
export const DESTINED_QUALITY: Readonly<Record<Star, string>> = {1: '普通', 2: '优良', 3: '稀有', 4: '史诗', 5: '传说', 6: '神话'};
export const DESTINED_SCALE: QualityScale = {id: 'destined', name: '命定之诗品质', label: s => DESTINED_QUALITY[s]};
export const STAR_SCALE: QualityScale = {id: 'stars', name: '星级', label: s => s + '★'};
export const scaleOf = (id: unknown): QualityScale => id === 'stars' ? STAR_SCALE : DESTINED_SCALE;
/** 命定之诗的品质名 → 星级（反查，供外部数据对齐）。 */
export const starOfQuality = (quality: string): Star | undefined => STARS.find(s => DESTINED_QUALITY[s] === quality);

export type GachaRules = {
  /** 基础概率（合计为 1）。 */
  rates: Readonly<Record<Star, number>>;
  /** 第 hardPity6 抽必出 6★；从第 softPity6From 抽起，每抽额外 +softPity6Step。 */
  hardPity6: number; softPity6From: number; softPity6Step: number;
  /** 连续 pity5 抽没有 5★ 以上时，这一抽至少 5★。 */
  pity5: number;
  /** 十连至少一张这个星级。 */
  tenFloor: Star;
};
/** 偏紧的出货：6★ 基础 0.3%，第 121 抽起逐抽 +4%，150 抽必出（大保底，平均约 105 抽一张）；
 *  5★ 基础 1.2%，50 抽内必出 5★ 以上（小保底）；十连至少一张 4★。 */
export const DEFAULT_RULES: GachaRules = {
  rates: {1: .52, 2: .30, 3: .12, 4: .045, 5: .012, 6: .003},
  hardPity6: 150, softPity6From: 121, softPity6Step: .04, pity5: 50, tenFloor: 4,
};
/** since6 / since5：距离上一张 6★ / 5★以上 已经抽了几次（不含即将进行的这一抽）。 */
export type PityState = {since6: number; since5: number; total: number};
export const emptyPity = (): PityState => ({since6: 0, since5: 0, total: 0});
export function normalizePity(raw: unknown): PityState {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const n = (v: unknown) => {const x = Math.floor(Number(v)); return Number.isFinite(x) && x >= 0 ? x : 0;};
  return {since6: n(r.since6), since5: n(r.since5), total: n(r.total)};
}
/** 下一抽出 6★ 的实际概率。 */
export function chance6(pity: PityState, rules: GachaRules = DEFAULT_RULES): number {
  const n = pity.since6 + 1;
  if (n >= rules.hardPity6) return 1;
  const soft = n >= rules.softPity6From ? (n - rules.softPity6From + 1) * rules.softPity6Step : 0;
  return Math.min(1, rules.rates[6] + soft);
}
export function rollStar(rng: () => number, pity: PityState, rules: GachaRules = DEFAULT_RULES): Star {
  const p6 = chance6(pity, rules), r = Math.min(.999999999, Math.max(0, rng()));
  if (r < p6) return 6;
  if (pity.since5 + 1 >= rules.pity5) return 5;
  // 其余五档按基础概率分配剩下的 1 − p6。
  const rest = ([5, 4, 3, 2, 1] as const), total = rest.reduce((s, k) => s + rules.rates[k], 0);
  let x = (r - p6) / (1 - p6) * total;
  for (const k of rest) {x -= rules.rates[k]; if (x < 0) return k;}
  return 1;
}
export function advancePity(p: PityState, star: Star): PityState {
  return {since6: star === 6 ? 0 : p.since6 + 1, since5: star >= 5 ? 0 : p.since5 + 1, total: p.total + 1};
}
/** 连抽：逐抽滚星级并推进保底；十连若没有 tenFloor 以上，把最后一张提到 tenFloor（保底重新按顺序计算）。 */
export function drawStars(count: number, rng: () => number, pity: PityState, rules: GachaRules = DEFAULT_RULES): {stars: Star[]; pity: PityState} {
  const n = Math.max(1, Math.min(100, Math.floor(count)));
  const stars: Star[] = [];
  let p = {...pity};
  for (let i = 0; i < n; i++) {const s = rollStar(rng, p, rules); stars.push(s); p = advancePity(p, s);}
  if (n >= 10 && Math.max(...stars) < rules.tenFloor) {
    stars[n - 1] = rules.tenFloor;
    p = {...pity}; for (const s of stars) p = advancePity(p, s);
  }
  return {stars, pity: p};
}
/** 界面用的概率说明。 */
export function ratesText(rules: GachaRules = DEFAULT_RULES, scale: QualityScale = DESTINED_SCALE): string[] {
  const pct = (v: number) => (Math.round(v * 1000) / 10).toString().replace(/\.0$/, '') + '%';
  return [
    STARS.slice().reverse().map(s => `${s}★ ${scale.id === 'destined' ? scale.label(s) + ' ' : ''}${pct(rules.rates[s])}`).join(' · '),
    `大保底：第 ${rules.softPity6From} 抽起 6★ 概率逐抽提高，${rules.hardPity6} 抽内必出 6★。小保底：${rules.pity5} 抽内必出 5★ 以上；每次十连至少一张 ${rules.tenFloor}★。保底在物品池与命运池之间共用，换小池、换大池都不清零。`,
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
