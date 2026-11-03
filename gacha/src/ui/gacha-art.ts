/** 命运抽卡的矢量美术：卡背、卡面纹章、书本封面、符文环。
 *  全部是代码绘制的 SVG（不依赖图片、不含文字），线条用金色，强调色跟随 CSS 变量 --c（星级色），所以卡背边缘会透出这张牌的星级光。
 *  只有固定字符串，没有任何外部内容拼进来。 */

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const polar = (cx: number, cy: number, r: number, deg: number) => {const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;};
/** 放射短线：n 条，从 r1 到 r2。 */
function ticks(cx: number, cy: number, r1: number, r2: number, n: number, offset = 0) {
  let d = '';
  for (let i = 0; i < n; i++) {const a = offset + i * 360 / n, [x1, y1] = polar(cx, cy, r1, a), [x2, y2] = polar(cx, cy, r2, a); d += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;}
  return d;
}
/** 四芒星：长臂 R、腰 r。 */
function star4(cx: number, cy: number, R: number, r: number, rot = 0) {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {const [x, y] = polar(cx, cy, i % 2 ? r : R, rot + i * 45); pts.push(`${f(x)} ${f(y)}`);}
  return 'M' + pts.join('L') + 'Z';
}
/** 波纹：从 x0 到 x1，振幅 a，周期 w。 */
function wave(x0: number, x1: number, y: number, a: number, w: number) {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += w) d += `q${f(w / 4)} ${f(-a)} ${f(w / 2)} 0t${f(w / 2)} 0`;
  return d;
}
/** 八角框（切角）。 */
const octo = (x: number, y: number, w: number, h: number, c: number) => `M${x + c} ${y}H${x + w - c}L${x + w} ${y + c}V${y + h - c}L${x + w - c} ${y + h}H${x + c}L${x} ${y + h - c}V${y + c}Z`;
const corner = (cls: string) => `<g class="${cls}"><path d="M24 44V24H44" /><path d="M30 52V30H52" opacity=".5"/><path d="M24 24l7 7" /><path d="${star4(24, 24, 7, 2.2, 45)}" class="gc-art-fill"/></g>`;

const GOLD = '#e4c88a', GOLD_DIM = '#b8955a';
/** 卡背（300×440）。 */
export const CARD_BACK_SVG = (() => {
  const cx = 150, cy = 198;
  const constellation: [number, number][] = [[86, 82], [108, 64], [131, 78], [150, 58], [171, 76], [194, 66], [214, 86]];
  const dots = constellation.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 3 ? 2.6 : 1.6}"/>`).join('');
  const line = 'M' + constellation.map(([x, y]) => `${x} ${y}`).join('L');
  return `<svg class="gc-art" viewBox="0 0 300 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="${GOLD}" stroke-linecap="round" stroke-linejoin="round">
<path d="${octo(8, 8, 284, 424, 14)}" stroke-width="2.4"/>
<path d="${octo(15, 15, 270, 410, 11)}" stroke-width="1" stroke="${GOLD_DIM}" opacity=".7"/>
<path d="${octo(21, 21, 258, 398, 9)}" stroke-width=".8" class="gc-art-accent" opacity=".55"/>
${corner('')}<g transform="translate(300 0) scale(-1 1)">${corner('')}</g><g transform="translate(0 440) scale(1 -1)">${corner('')}</g><g transform="translate(300 440) scale(-1 -1)">${corner('')}</g>
<path d="M118 21H182M126 15h48" stroke-width="1" opacity=".7"/><path d="${star4(150, 21, 6, 2, 45)}" class="gc-art-fill"/>
<path d="M118 419H182M126 425h48" stroke-width="1" opacity=".7"/><path d="${star4(150, 419, 6, 2, 45)}" class="gc-art-fill"/>
<g stroke-width=".9" opacity=".75">${''}<path d="${line}" stroke-dasharray="1 4" opacity=".7"/></g>
<g class="gc-art-fill" stroke="none" opacity=".9">${dots}</g>
<circle cx="${cx}" cy="${cy}" r="104" stroke-width="1" opacity=".45"/>
<circle cx="${cx}" cy="${cy}" r="96" stroke-width="1.4" class="gc-art-accent" stroke-dasharray="2 7" opacity=".85"/>
<path d="${ticks(cx, cy, 86, 92, 48)}" stroke-width=".9" opacity=".6"/>
<path d="${ticks(cx, cy, 80, 92, 8, 22.5)}" stroke-width="1.6" opacity=".9"/>
<circle cx="${cx}" cy="${cy}" r="76" stroke-width="1.2" opacity=".8"/>
<path d="${ticks(cx, cy, 30, 70, 16, 11.25)}" stroke-width=".7" opacity=".35"/>
<path d="${star4(cx, cy, 30, 8, 45)}" stroke-width="1" opacity=".7"/>
<path d="${star4(cx, cy, 62, 10)}" stroke-width="1.6" class="gc-art-glint"/>
<circle cx="${cx}" cy="${cy}" r="7" class="gc-art-fill"/>
<path d="M150 274c-14-12-38-16-62-9v24c24-7 48-3 62 9 14-12 38-16 62-9v-24c-24-7-48-3-62 9z" stroke-width="1.6" class="gc-art-fill-soft"/>
<path d="M88 293c24-7 48-3 62 9 14-12 38-16 62-9M90 297c23-6 46-2 60 9 14-11 37-15 60-9" stroke-width=".8" opacity=".55"/>
<path d="M150 274v24M100 272c16-3 32 0 42 7M100 280c16-3 32 0 42 7M200 272c-16-3-32 0-42 7M200 280c-16-3-32 0-42 7" stroke-width=".8" opacity=".6"/>
<path d="M150 262v-10M139 266l-6-8M161 266l6-8" stroke-width="1" class="gc-art-accent" opacity=".9"/>
<path d="${wave(34, 266, 338, 6, 28)}" stroke-width="1.2" opacity=".75"/>
<path d="${wave(48, 252, 356, 5, 24)}" stroke-width="1" class="gc-art-accent" opacity=".7"/>
<path d="${wave(62, 238, 372, 4, 20)}" stroke-width=".8" opacity=".5"/>
<path d="M128 394h44M138 400h24" stroke-width=".8" opacity=".5"/>
</g></svg>`;
})();

/** 书本封面（150×196），金角、扣带与中央星章。 */
export const TOME_COVER_SVG = (() => {
  const cx = 78, cy = 92;
  return `<svg class="gc-art" viewBox="0 0 150 196" preserveAspectRatio="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="${GOLD}" stroke-linecap="round" stroke-linejoin="round">
<path d="${octo(12, 10, 128, 176, 8)}" stroke-width="1.6"/>
<path d="${octo(18, 16, 116, 164, 6)}" stroke-width=".8" opacity=".6"/>
<path d="M12 30V10h20M140 30V10h-20M12 166v20h20M140 166v20h-20" stroke-width="3.2" stroke="${GOLD_DIM}"/>
<circle cx="${cx}" cy="${cy}" r="36" stroke-width="1.2" opacity=".85"/>
<circle cx="${cx}" cy="${cy}" r="30" stroke-width=".8" stroke-dasharray="1.5 4" opacity=".8"/>
<path d="${ticks(cx, cy, 36, 44, 8, 22.5)}" stroke-width="1.2" opacity=".8"/>
<path d="${star4(cx, cy, 27, 6)}" stroke-width="1.4" class="gc-art-fill-soft"/>
<circle cx="${cx}" cy="${cy}" r="3.2" class="gc-art-fill"/>
<path d="${wave(30, 126, 152, 3, 16)}" stroke-width=".9" opacity=".7"/>
<path d="${wave(38, 118, 162, 2.4, 14)}" stroke-width=".7" opacity=".5"/>
</g>
<rect x="138" y="84" width="12" height="18" rx="2" fill="#2b1a0c" stroke="${GOLD}" stroke-width="1.2"/><circle cx="144" cy="93" r="2" fill="${GOLD}"/>
</svg>`;
})();

/** 舞台底下的符文环（600×600）。 */
export const RUNE_RING_SVG = (() => {
  const c = 300;
  let glyphs = '';
  for (let i = 0; i < 24; i++) {
    const a = i * 15, [x, y] = polar(c, c, 262, a);
    const k = i % 4;
    const g = k === 0 ? 'M-5 -6L0 6L5 -6' : k === 1 ? 'M-5 0H5M0 -6V6' : k === 2 ? 'M-4 -6h8M0 -6v12M-4 6h8' : 'M-5 6L0 -6L5 6M-3 2h6';
    glyphs += `<path transform="translate(${f(x)} ${f(y)}) rotate(${a})" d="${g}"/>`;
  }
  return `<svg class="gc-art" viewBox="0 0 600 600" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="${GOLD}" stroke-linecap="round">
<circle cx="${c}" cy="${c}" r="290" stroke-width="1" opacity=".35"/>
<circle cx="${c}" cy="${c}" r="282" stroke-width="2" stroke-dasharray="2 10" opacity=".55"/>
<g stroke-width="1.4" opacity=".7">${glyphs}</g>
<circle cx="${c}" cy="${c}" r="242" stroke-width="1" opacity=".4"/>
<path d="${ticks(c, c, 230, 242, 72)}" stroke-width="1" opacity=".45"/>
<path d="${star4(c, c, 228, 60)}" stroke-width=".8" opacity=".25"/>
<path d="${star4(c, c, 228, 60, 45)}" stroke-width=".8" opacity=".18"/>
<circle cx="${c}" cy="${c}" r="150" stroke-width=".8" stroke-dasharray="1 6" opacity=".4"/>
</g></svg>`;
})();

/** 卡面纹章（100×100）：物品是切面宝石，命运是星轨与丝线。 */
export const KIND_EMBLEM: Readonly<Record<'item' | 'fate', string>> = {
  item: `<svg class="gc-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke-linecap="round" stroke-linejoin="round">
<circle cx="50" cy="50" r="44" class="gc-art-accent" stroke-width="1" opacity=".55"/><path d="${ticks(50, 50, 44, 49, 16)}" class="gc-art-accent" stroke-width="1.2" opacity=".7"/>
<path d="M50 16 76 40 50 84 24 40Z" class="gc-art-gem" stroke-width="1.6"/><path d="M24 40h52M36 28l14 12 14-12M50 40v44M36 40l14 44 14-44" stroke="${GOLD}" stroke-width="1" opacity=".75"/>
<path d="${star4(72, 24, 8, 1.8)}" fill="#fff" opacity=".85"/></g></svg>`,
  fate: `<svg class="gc-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke-linecap="round" stroke-linejoin="round">
<circle cx="50" cy="50" r="44" class="gc-art-accent" stroke-width="1" opacity=".55"/><path d="${ticks(50, 50, 44, 49, 16)}" class="gc-art-accent" stroke-width="1.2" opacity=".7"/>
<ellipse cx="50" cy="50" rx="34" ry="13" transform="rotate(-28 50 50)" stroke="${GOLD}" stroke-width="1.1" opacity=".8"/>
<ellipse cx="50" cy="50" rx="34" ry="13" transform="rotate(32 50 50)" class="gc-art-accent" stroke-width="1.1" opacity=".9"/>
<path d="M18 74c14-6 22-20 32-24s22 4 32-8" stroke="#fff" stroke-width="1" stroke-dasharray="1 3" opacity=".7"/>
<path d="${star4(50, 50, 15, 3.6)}" class="gc-art-gem" stroke-width="1.2"/><circle cx="24" cy="36" r="2" fill="${GOLD}"/><circle cx="79" cy="63" r="2.4" fill="${GOLD}"/><circle cx="66" cy="22" r="1.6" fill="#fff"/></g></svg>`,
};

/** 小星章（作品占位封面、页签用），金色。 */
export const SIGIL_URI = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="none" stroke="${GOLD}" stroke-width="1.2"><circle cx="20" cy="20" r="17" opacity=".6"/><path d="${star4(20, 20, 14, 3.4)}" fill="${GOLD}" fill-opacity=".35"/></g></svg>`);
