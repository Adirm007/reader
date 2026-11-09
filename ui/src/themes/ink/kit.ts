/* 墨笺 — a scholar's desk on a rainy day, seen from straight above. Everything is written on one sheet of
 * xuan paper; she is the painting in a hanging scroll laid out beside it. Seals confirm, ink circles select. */
import type { LobbyState, ThemeKit } from '../../core/types';
import { act, esc, twoFrame, priceOf, nameOf, bookText } from '../../core/dom';
import lobbyCss from './lobby.css';
import pagesCss from './pages.css';
import popupsCss from './popups.css';
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
    + `<button type="button" class="u4i-obj o-coins"${act('gacha')}>${twoFrame('ink/prop-coins')}<span class="slip">命运抽卡${s.gachaPrice ? ' · ' + esc(s.gachaPrice) + ' FP' : ''}</span></button>`;
}

/* A turntable seen from straight above, like everything else on the desk. */
function player(s: LobbyState): string {
  return `<div class="u4i-phono"><button type="button" class="set"${act('jukeplay')} data-u4-jplay aria-pressed="${s.juke.playing}" aria-label="${s.juke.playing ? '暂停唱片' : '播放唱片'}">`
    + '<svg viewBox="0 0 120 100" aria-hidden="true"><rect x="2" y="4" width="116" height="92" rx="5" fill="#4a2c1e"/><rect x="2" y="4" width="116" height="92" rx="5" fill="none" stroke="#2a170e" stroke-width="2"/>'
    + '<g class="q-disc"><circle cx="50" cy="50" r="38" fill="#141210"/><circle cx="50" cy="50" r="30" fill="none" stroke="#2c2926" stroke-width=".8"/><circle cx="50" cy="50" r="22" fill="none" stroke="#2c2926" stroke-width=".8"/><circle cx="50" cy="50" r="11" fill="#b8322a"/><circle cx="50" cy="50" r="1.6" fill="#e9d6a0"/><path d="M28 32a30 30 0 0 1 12-9" stroke="#f0e6d0" stroke-width="1.4" opacity=".35" fill="none"/></g>'
    + '<g class="arm"><circle cx="102" cy="20" r="6" fill="#c9a24c"/><path d="M102 20L96 62l-14 10" stroke="#c9a24c" stroke-width="3" fill="none" stroke-linecap="round"/></g></svg></button>'
    + `<div class="slip"><p class="q-tt" data-u4-jtitle>${esc(s.juke.title)}</p><p class="q-row"><span data-u4-jno>${esc(s.juke.no)}</span> · <span data-u4-jstate>${s.juke.playing ? '暂停' : '播放'}</span> · <button type="button"${act('jukelist')}>唱片目录</button></p><i class="bar"><i id="dlb-jbar"></i></i></div>`
    + '<div class="u4i-tracks" id="dlb-trackpop" style="display:none"></div></div>';
}

export const ink: ThemeKit = {
  id: 'ink',
  css: lobbyCss + pagesCss + popupsCss,
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
      sea: '书海迷宫', toggles: '小机关', desk: '案头事务', tools: '唱片与笔墨' },
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
