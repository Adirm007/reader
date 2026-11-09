/* 墨笺 — a scholar's desk on a rainy day, seen from straight above. Everything is written on one sheet of
 * xuan paper; she is the painting in a hanging scroll laid out beside it. Seals confirm, ink circles select. */
import type { LobbyState, ThemeKit } from '../../core/types';
import { act, esc, twoFrame, priceOf, nameOf, bookText } from '../../core/dom';
import envelopeCss from './envelope.css';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const DAY_NOTE: Record<string, string> = { '日常:半日': '闲坐一个下午', '日常:一日': '从晨到暮', '日常:三日': '续一段旧事', '日常:一周': '七日长卷' };

function cnDay(n: number): string {
  if (n <= 10) return n === 10 ? '初十' : '初' + CN[n];
  if (n < 20) return '十' + CN[n - 10];
  if (n === 20) return '二十';
  if (n < 30) return '廿' + CN[n - 20];
  return n === 30 ? '三十' : '三十' + CN[n - 30];
}

function slip(): string {
  return '<div class="u4i-slip" role="timer" aria-live="off"><span class="q-t" data-u4-time>--:--</span><span class="q-d" data-u4-date></span>'
    + '<span class="q-fp" role="status" aria-label="命运点数"><i>点数</i><b data-u4-fp>——</b></span></div>';
}

function seal(): string {
  return `<button type="button" class="u4i-seal"${act('close')} aria-label="收起书案"><svg viewBox="0 0 60 60" aria-hidden="true"><rect x="3" y="3" width="54" height="54" rx="5" fill="#b8322a"/><rect x="8" y="8" width="44" height="44" rx="2" fill="none" stroke="#f3e3cf" stroke-width="2"/>`
    + '<text x="30" y="41" text-anchor="middle" class="u4i-brush" font-size="29" fill="#f6ead8">退</text></svg></button>';
}

function bookmark(): string {
  return `<button type="button" class="u4i-mark"${act('back')} aria-label="返回书案"><span class="u4i-brush">返</span></button>`;
}

const SLIPS: { k: string; nm: string; ds: string; pr: number; cls: string; art: string }[] = [
  { k: '缘', nm: '买一份缘', ds: '红线', pr: 200, cls: 'q-yuan', art: '<path d="M10 6c10 8-8 14 2 24s-8 14 2 22" fill="none" stroke="#b8322a" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="30" r="3" fill="none" stroke="#b8322a" stroke-width="1.4"/>' },
  { k: '喜', nm: '买一份喜', ds: '喜鹊登梅', pr: 200, cls: 'xi', art: '<path d="M2 50C12 40 18 24 30 8" fill="none" stroke="#3a3631" stroke-width="1.6"/><circle cx="20" cy="30" r="2.4" fill="#c85a6a"/><circle cx="26" cy="18" r="2" fill="#c85a6a"/><circle cx="12" cy="40" r="2.2" fill="#c85a6a"/><path d="M22 24c4-4 9-3 10 0-3 1-6 2-10 0z" fill="#1d1b18"/>' },
  { k: '险', nm: '买一份险', ds: '惊涛', pr: 200, cls: 'xian', art: '<path d="M2 40c6-8 12-8 16 0s10 8 14 0M2 50c6-8 12-8 16 0s10 8 14 0M8 28c4-6 9-6 12 0" fill="none" stroke="#2f4b6e" stroke-width="1.6" stroke-linecap="round"/>' },
];

function papers(): string {
  return '<section class="u4i-papers" aria-labelledby="u4jn-sp"><h2 id="u4jn-sp" class="u4i-brush">花笺<small>今日特调</small></h2><div class="q-row">'
    + SLIPS.map(p => `<button type="button" class="u4i-flower ${p.cls}"${act('special', { k: p.k })}><svg class="art" viewBox="0 0 34 56" aria-hidden="true">${p.art}</svg><span class="q-nm">${p.nm}</span><span class="q-ds">${p.ds}</span><span class="q-pr"><b>${p.pr}</b> FP</span></button>`).join('')
    + '</div></section>';
}

function almanac(s: LobbyState): string {
  const cols = s.dailyOpts.slice().reverse().map(o => {
    const on = o.k === s.daily;
    return `<li><button type="button" class="col${on ? ' on' : ''}"${act('dailysel', { k: o.k, nm: o.nm, pr: o.pr })} aria-pressed="${on}"><span class="q-nm u4i-brush">${esc(o.nm)}</span><span class="q-ds">${esc(DAY_NOTE[o.k] || '')}</span><span class="q-pr"><b>${o.pr}</b> FP</span><svg class="circle" viewBox="0 0 60 60" aria-hidden="true"><path d="M30 4C14 4 5 16 5 30s10 26 25 26 26-11 25-27C54 14 42 5 27 6" fill="none" stroke="#6f9c8f" stroke-width="2.6" stroke-linecap="round"/></svg></button></li>`;
  }).join('');
  return '<section class="u4i-almanac" aria-labelledby="u4jn-dl"><div class="frame"><span class="yi u4i-brush" aria-hidden="true">宜</span>'
    + `<h2 id="u4jn-dl" class="u4-vh">预约日常</h2><ul>${cols}</ul></div>`
    + `<div class="foot"><span class="q-picked">已选 · <b data-u4-dname>${esc(nameOf(s))}</b><small>夜梦会为你留好这一段时光</small></span>`
    + `<button type="button" class="q-order"${act('dailyorder')}><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="4" fill="#b8322a"/><rect x="7" y="7" width="34" height="34" rx="1.5" fill="none" stroke="#f3e3cf" stroke-width="1.6"/><text x="24" y="33" text-anchor="middle" class="u4i-brush" font-size="22" fill="#f6ead8">定</text></svg>`
    + `<span>钤印下单<b><b data-u4-dprice>${priceOf(s)}</b> FP</b></span></button></div>`
    + '<svg class="imprint" viewBox="0 0 80 80" aria-hidden="true"><rect x="6" y="6" width="68" height="68" rx="6" fill="none" stroke="#b8322a" stroke-width="4"/><text x="40" y="54" text-anchor="middle" class="u4i-brush" font-size="38" fill="#b8322a">定</text></svg></section>';
}

/* The other places of the study are thread-bound volumes laid in a row under the window: one object, one list. */
interface Vol { attrs: string; name: string; sub: string }
function volumes(s: LobbyState): Vol[] {
  return [
    { attrs: act('page', { page: 'persona' }), name: '眼中的她', sub: `<span data-u4-persona>${esc(s.persona.label)}</span>` },
    { attrs: act('page', { page: 'tuning' }), name: '故事定调', sub: `<span data-u4-books>${esc(bookText(s.books))}</span>` },
    { attrs: act('page', { page: 'decouple' }), name: '人格解耦', sub: '' },
    { attrs: act('page', { page: 'template' }), name: '条目模仿', sub: '' },
    { attrs: act('page', { page: 'eggs' }), name: '彩蛋服务台', sub: '' },
    { attrs: act('order', { text: '更新新闻' }), name: '新闻更新', sub: '免费' },
    { attrs: act('order', { text: '使用间章:小憩' }), name: '小憩片刻', sub: '免费' },
    { attrs: act('chess'), name: '下一盘棋', sub: '' },
  ];
}

function books(s: LobbyState): string {
  return '<nav class="u4i-books" aria-label="书斋里的其他地方">' + volumes(s).map(v =>
    `<button type="button" class="vol"${v.attrs}><span class="tt">${v.name}</span>${v.sub ? `<span class="sub">${v.sub}</span>` : ''}</button>`).join('') + '</nav>';
}

/* The painted inkstone is the pond: a pebble dropped in is the random ripple. */
function pond(): string {
  return `<button type="button" class="u4i-pond"${act('special', { k: '随机涟漪' })} aria-label="随机涟漪，100 FP"><svg class="ripple" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="16"/><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="44"/></svg>`
    + '<span class="slip">随机涟漪 · <b>100 FP</b></span></button>';
}

function props(s: LobbyState): string {
  return `<button type="button" class="u4i-obj o-sticks"${act('prayer')}>${twoFrame('ink/prop-sticks')}<span class="slip">祷诗 · 免费</span></button>`
    + `<button type="button" class="u4i-obj o-coins"${act('gacha')}>${twoFrame('ink/prop-coins')}<span class="slip">命运抽卡${s.gachaPrice ? ' · <span class="mini">' + esc(s.gachaPrice) + '</span> FP' : ''}</span></button>`;
}

/* A guqin lying along the lower edge of the desk, seen from straight above like everything else on it: seven
 * silk strings, thirteen mother-of-pearl hui, a cinnabar tassel at the head. Its scores are the track list. */
function player(s: LobbyState): string {
  return `<div class="u4i-phono"><button type="button" class="set"${act('jukeplay')} data-u4-jplay aria-pressed="${s.juke.playing}" aria-label="${s.juke.playing ? '暂停音乐' : '播放音乐'}">`
    + '<svg viewBox="0 0 304 72" aria-hidden="true"><defs><linearGradient id="u4jnQin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d2a1f"/><stop offset=".5" stop-color="#2a1b14"/><stop offset="1" stop-color="#1c120d"/></linearGradient></defs><path d="M14 15C8 15 5 19 5 24V40C5 45 8 49 14 49L150 51C192 51 216 52 238 58C246 60 254 60 260 56L266 53H292C298 53 301 49 301 44V20C301 15 298 11 292 11H266L260 8C254 4 246 4 238 6C216 12 192 13 150 13Z" fill="url(#u4jnQin)" stroke="rgba(255,236,200,.22)" stroke-width="1"/><path d="M30 20C80 18 140 17 200 19M40 44C100 46 170 46 230 45" stroke="rgba(255,236,200,.06)" stroke-width="5" fill="none"/><rect x="14" y="19" width="5" height="26" rx="1.5" fill="#bfa77c"/><rect x="256" y="12" width="5" height="40" rx="1.5" fill="#cdb68b"/><g class="q-strings" stroke="#efe6cf" stroke-width=".75" opacity=".85"><path d="M20 21.5L258 15.5"/><path d="M20 25.1L258 20.9"/><path d="M20 28.7L258 26.3"/><path d="M20 32.3L258 31.7"/><path d="M20 35.9L258 37.1"/><path d="M20 39.5L258 42.5"/><path d="M20 43.1L258 47.9"/></g><g fill="#f4f0e6"><circle cx="228.0" cy="50.6" r="1.3"/><circle cx="218.0" cy="50.6" r="1.3"/><circle cx="210.0" cy="50.6" r="1.3"/><circle cx="198.0" cy="50.6" r="1.3"/><circle cx="178.0" cy="50.6" r="1.3"/><circle cx="162.0" cy="50.6" r="1.3"/><circle cx="138.0" cy="50.6" r="1.9"/><circle cx="114.0" cy="50.6" r="1.3"/><circle cx="98.0" cy="50.6" r="1.3"/><circle cx="78.0" cy="50.6" r="1.3"/><circle cx="66.0" cy="50.6" r="1.3"/><circle cx="58.0" cy="50.6" r="1.3"/><circle cx="48.0" cy="50.6" r="1.3"/></g><path d="M294 54C296 60 297 64 296 70M298 54C301 60 303 64 303 70" stroke="#b8322a" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="296" cy="54" r="2.6" fill="#b8322a"/></svg></button>'
    + `<div class="slip"><p class="q-tt" data-u4-jtitle>${esc(s.juke.title)}</p><p class="q-row"><span data-u4-jno>${esc(s.juke.no)}</span> · <span data-u4-jstate>${s.juke.playing ? '暂停' : '播放'}</span> · <button type="button"${act('jukelist')}>琴谱</button></p><i class="bar"><i id="dlb-jbar"></i></i></div>`
    + '<div class="u4i-tracks" id="dlb-trackpop" style="display:none"></div></div>';
}

export const ink: ThemeKit = {
  id: 'ink',
  envelopeCss,
  scene: s => '<div class="u4i-plate q-wide" data-u4-bg="ink/plate-wide"></div><div class="u4i-plate q-tall" data-u4-bg="ink/plate-tall"></div><div class="u4i-rain"></div>'
    + '<div class="u4i-scroll"><i class="rod q-top"></i><div class="mount"><i class="band"></i><div class="painting" data-u4-bg="ink/scroll-bg">'
    + `<img class="her" alt="" data-u4-her data-u4-img="ink/standing/${esc(s.appearance.id)}" data-u4-fallback="${esc(s.standing)}"></div><i class="band"></i></div><i class="rod q-bottom"></i></div>`,
  top: page => slip() + (page === 'main' ? '' : bookmark()) + seal(),
  main: s => '<div class="u4i-sheet"><h1 class="u4i-title u4i-brush"><span class="q-tt">今日相伴</span><small>半日闲坐，或续一段未完的故事。</small></h1>'
    + almanac(s) + papers() + '</div>'
    + `<button type="button" class="u4i-inscribe" data-u4-greet aria-label="画上的题款，点一下换一句"><span class="line" data-u4-line></span><i class="chop" aria-hidden="true">梦</i></button>`
    + pond() + books(s) + props(s) + player(s),
  date: d => `${CN[d.getMonth() + 1]}月${cnDay(d.getDate())} · 周${WEEK[d.getDay()]}`,
  greetings(s, hour) {
    const you = s.address ? s.address + '，' : '';
    return [
      hour >= 18 || hour < 5 ? `${you}雨夜宜读书。想留多久，在黄历上圈一格。` : `${you}雨声正好，墨也研开了。`,
      '花笺三张，缘喜险各一。墨池里那颗石子，落下去才知道是什么。',
      '签筒里的诗不收钱，摇一支便是。',
      '茶还温着，累了就歇一歇。',
      '画轴里这个人，换了衣裳也还是我。',
    ];
  },
  skin: {
    pages: {
      persona: { prop: 'ink/prop-album', title: '眼中的她', lede: '一册十二开的画册，一开一身衣裳；画轴边的名签，是她的性子。' },
      tuning: { prop: 'ink/prop-bookcase', title: '故事定调', lede: '书匣里的线装书。取一部定下调子，故事便照着它的笔意写下去。' },
      decouple: { prop: 'ink/prop-seals', title: '人格解耦', lede: '一阴一阳两方印。另一方印下的她，可以另有名字与衣裳。' },
      template: { prop: 'ink/prop-typetray', title: '条目模仿', lede: '活字盘。照着世界书的格式，排一版新的条目。' },
      eggs: { prop: 'ink/prop-stationerybox', title: '彩蛋服务台', lede: '文具匣的抽屉。启用的格子钤一方朱印。' },
    },
    words: { who: '名签', look: '画册', address: '称呼', custom: '自拟', shelf: '书匣', services: '可取之物', pair: '主印与副印',
      sea: '书海迷宫', toggles: '小机关', desk: '案头事务', tools: '琴谱与笔墨', discs: '琴谱管理',
      receiptShop: '墨笺 · 回执', receiptVerb: '钤印', receiptCancel: '作罢' },
    ornament: () => '<i class="q-rod q-l" aria-hidden="true"></i><i class="q-rod q-r" aria-hidden="true"></i>',
  },
  celebrate(root, kind) {
    const cls = kind.indexOf('日常:') === 0 ? 'u4-fx-daily' : kind === '随机涟漪' ? 'u4-fx-ripple' : 'u4-fx-special';
    root.classList.remove('u4-fx-daily', 'u4-fx-special', 'u4-fx-ripple');
    void root.offsetWidth;
    root.classList.add(cls);
    root.setAttribute('data-u4-cup', kind);
    window.setTimeout(() => root.classList.remove(cls), 2800);
  },
};
