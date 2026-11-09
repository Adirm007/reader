/* 墨笺 — a scholar's desk on a rainy day, seen from straight above. Everything is written on one sheet of
 * xuan paper; she is the painting in a hanging scroll laid out beside it. Seals confirm, ink circles select. */
import type { LobbyState, ThemeKit } from '../../core/types';
import { act, esc, twoFrame, priceOf, nameOf, bookText } from '../../core/dom';
import css from './lobby.css';
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

interface Obj { id: string; cls: string; attrs: string; name: string; note: string }
function objects(s: LobbyState): Obj[] {
  return [
    { id: 'album', cls: 'o-album', attrs: act('page', { page: 'persona' }), name: '眼中的她', note: `<span data-u4-persona>${esc(s.persona.label)}</span> · <span data-u4-appearance>${esc(s.appearance.label)}</span>` },
    { id: 'bookcase', cls: 'o-books', attrs: act('page', { page: 'tuning' }), name: '故事定调', note: `<span data-u4-books>${esc(bookText(s.books))}</span>` },
    { id: 'seals', cls: 'o-seals', attrs: act('page', { page: 'decouple' }), name: '人格解耦', note: '一阴一阳两方印' },
    { id: 'typetray', cls: 'o-type', attrs: act('page', { page: 'template' }), name: '条目模仿', note: '排一版世界书' },
    { id: 'stationerybox', cls: 'o-box', attrs: act('page', { page: 'eggs' }), name: '彩蛋服务台', note: '显示 · 主题 · 美化' },
    { id: 'tea', cls: 'o-tea', attrs: act('order', { text: '使用间章:小憩' }), name: '小憩片刻', note: '一盏茶 · 免费' },
    { id: 'xiangqi', cls: 'o-chess', attrs: act('chess'), name: '下一盘棋', note: '残局还摆着' },
    { id: 'sticks', cls: 'o-sticks', attrs: act('prayer'), name: '祷诗抽取', note: '摇一支签 · 免费' },
    { id: 'coins', cls: 'o-coins', attrs: act('gacha'), name: '命运抽卡', note: s.gachaPrice ? `${esc(s.gachaPrice)} FP 一卦` : '三枚铜钱' },
    { id: 'inkpool', cls: 'o-ink', attrs: act('special', { k: '随机涟漪' }), name: '随机涟漪', note: '石子落进墨池 · 100 FP' },
  ];
}

function notice(): string {
  return `<button type="button" class="u4i-notice"${act('order', { text: '更新新闻' })}><span class="u4i-brush">告示</span><small>新闻更新 · 免费</small></button>`;
}

function player(s: LobbyState): string {
  return `<div class="u4i-phono"><button type="button" class="set"${act('jukeplay')} data-u4-jplay aria-pressed="${s.juke.playing}" aria-label="${s.juke.playing ? '暂停唱片' : '播放唱片'}">${twoFrame('ink/prop-gramophone')}<i class="q-disc" aria-hidden="true"></i></button>`
    + `<div class="q-label"><p class="q-tt" data-u4-jtitle>${esc(s.juke.title)}</p><p class="q-row"><span data-u4-jno>${esc(s.juke.no)}</span> · <span data-u4-jstate>${s.juke.playing ? '暂停' : '播放'}</span> · <button type="button"${act('jukelist')}>曲目</button></p><i class="bar"><i id="dlb-jbar"></i></i></div>`
    + '<div class="u4i-tracks" id="dlb-trackpop" style="display:none"></div></div>';
}

export const ink: ThemeKit = {
  id: 'ink',
  css,
  envelopeCss,
  scene: s => '<div class="u4i-plate q-wide" data-u4-bg="ink/plate-wide"></div><div class="u4i-plate q-tall" data-u4-bg="ink/plate-tall"></div><div class="u4i-rain"></div>'
    + '<div class="u4i-scroll"><i class="rod q-top"></i><div class="mount"><div class="painting" data-u4-bg="ink/scroll-bg">'
    + `<img class="her" alt="" data-u4-img="ink/standing/${esc(s.appearance.id)}" data-u4-fallback="${esc(s.standing)}"></div></div><i class="rod q-bottom"></i></div>`,
  top: page => slip() + (page === 'main' ? '' : bookmark()) + seal(),
  main: s => '<div class="u4i-sheet"><h1 class="u4i-title u4i-brush">今日相伴<small>半日闲坐，或续一段未完的故事。</small></h1>'
    + almanac(s) + papers() + '</div>'
    + `<button type="button" class="u4i-inscribe" data-u4-greet aria-label="画上的题款，点一下换一句"><span class="line" data-u4-line></span><i class="chop" aria-hidden="true">梦</i></button>`
    + notice()
    + '<nav class="u4i-objs" aria-label="书案上的东西">' + objects(s).map(o =>
      `<button type="button" class="u4i-obj ${o.cls}"${o.attrs}>${twoFrame('ink/prop-' + o.id)}<span class="q-tag"><b>${o.name}</b><small>${o.note}</small></span></button>`).join('') + '</nav>'
    + player(s),
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
  celebrate(root, kind) {
    const cls = kind.indexOf('日常:') === 0 ? 'u4-fx-daily' : kind === '随机涟漪' ? 'u4-fx-ripple' : 'u4-fx-special';
    root.classList.remove('u4-fx-daily', 'u4-fx-special', 'u4-fx-ripple');
    void root.offsetWidth;
    root.classList.add(cls);
    root.setAttribute('data-u4-cup', kind);
    window.setTimeout(() => root.classList.remove(cls), 2800);
  },
};
