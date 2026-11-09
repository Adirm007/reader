/* Café Nocturne — a rainy-night café seen from a seat at the bar. Every surface is something the shop
 * itself would print or write: the chalkboard, the reservation book, a till receipt, a table tent. */
import type { LobbyState, ThemeKit } from '../../core/types';
import { act, esc, twoFrame, priceOf, nameOf, bookText, each } from '../../core/dom';
import envelopeCss from './envelope.css';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const BRASS = '<linearGradient id="u4cfBrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1d89a"/><stop offset=".45" stop-color="#b8894a"/><stop offset="1" stop-color="#6e4e26"/></linearGradient>';

/* Chalk grain for the large board heading only (small text stays crisp). */
const CHALK = '<filter id="u4cfChalk" x="-4%" y="-8%" width="108%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency="1.9" numOctaves="1" seed="9" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.2 0 0 0 -.55" result="ga"/><feComposite in="d" in2="ga" operator="in"/></filter>';

function clock(): string {
  return '<div class="u4c-clock" role="timer" aria-live="off"><svg viewBox="0 0 64 64" aria-hidden="true">'
    + '<circle cx="32" cy="32" r="30" fill="url(#u4cfBrass)"/><circle cx="32" cy="32" r="25.5" fill="#efe3c8"/>'
    + '<g stroke="#3a2614" stroke-linecap="round"><path d="M32 9v4M32 51v4M9 32h4M51 32h4" stroke-width="2"/><path d="M43.5 12.1l-1 1.7M51.9 20.5l-1.7 1M51.9 43.5l-1.7-1M43.5 51.9l-1-1.7M20.5 51.9l1-1.7M12.1 43.5l1.7-1M12.1 20.5l1.7 1M20.5 12.1l1 1.7" stroke-width="1.2"/></g>'
    + '<g stroke="#1d140c" stroke-linecap="round"><path data-u4-hh d="M32 32V19" stroke-width="2.6"/><path data-u4-mh d="M32 32V12.5" stroke-width="1.6"/></g><circle cx="32" cy="32" r="2" fill="#9e2a20"/></svg>'
    + '<div class="q-t"><b data-u4-time>--:--</b><small data-u4-date></small></div></div>';
}

function closed(): string {
  return `<button type="button" class="u4c-closed"${act('close')} aria-label="关上大厅"><svg viewBox="0 0 118 104" aria-hidden="true">`
    + '<circle cx="59" cy="6" r="3.5" fill="#c9a46a" stroke="#4a3018"/><path d="M59 6L22 46M59 6l37 40" stroke="#d7c4a0" stroke-width="1.4" fill="none"/>'
    + '<rect x="8" y="42" width="102" height="54" rx="5" fill="#4a2d1a" stroke="#2a170c" stroke-width="2"/><rect x="13" y="47" width="92" height="44" rx="3" fill="#24302a"/>'
    + '<text x="59" y="78" text-anchor="middle" class="u4c-chalkfont" font-size="25" font-weight="700" fill="#eee7d6" letter-spacing="7">打烊</text></svg></button>';
}

function back(): string {
  return `<button type="button" class="u4c-backarrow"${act('back')}><svg viewBox="0 0 120 40" aria-hidden="true"><path d="M112 22C80 20 50 20 18 22M30 10L14 22l16 12" fill="none" stroke="#eee7d6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>回吧台</span></button>`;
}

function fpMini(): string {
  return '<div class="u4c-fpmini" role="status" aria-label="命运点数"><b>FP</b><span data-u4-fp>——</span></div>';
}

const CUPS: { k: string; nm: string; ds: string; pr: number; art: string }[] = [
  { k: '缘', nm: '买一份缘', ds: '肉桂与低语', pr: 200, art: '<path d="M26 15.5c0-2 0-2.5 0 0M23 13.5c2 1 4 1 6 0M22 16.6c2.4 1 5.6 1 8 0M24 11.8c1.4.6 2.6.6 4 0" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>' },
  { k: '喜', nm: '买一份喜', ds: '拉花心事', pr: 200, art: '<path d="M23 18.2c-3.6-2.2-3.8-5-1.6-5.6 1.2-.3 1.6.6 1.6 1 0-.4.4-1.3 1.6-1 2.2.6 2 3.4-1.6 5.6z" fill="currentColor"/>' },
  { k: '险', nm: '买一份险', ds: '深焙险讯', pr: 200, art: '<path d="M25 11.5l-3 3.6h3.6l-3.4 4.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' },
  { k: '随机涟漪', nm: '随机涟漪', ds: '不贴标签的盲杯', pr: 100, art: '<path d="M20.6 13c.4-2 4.6-2.4 4.8-.2.2 1.8-2.4 1.8-2.4 3.6M23 19.2v.1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>' },
];
const CUP = '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h32c0 13-6 20-16 20S7 28 7 15z"/><path d="M39 18c6-1 8 3 6 6s-5 3-7 3"/><path d="M3 38c10 3 32 3 42 0"/><ellipse cx="23" cy="15" rx="16" ry="3.6"/></g>';
const RING = '<svg class="q-ring" aria-hidden="true" viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M12 32C10 12 60 5 108 6s86 8 84 25-56 26-104 24S6 50 14 28" fill="none" stroke="#eee7d6" stroke-width="1.6"/></svg>';

function specials(): string {
  return '<section class="u4c-board" aria-labelledby="u4cf-sp"><div class="slate">'
    + '<h2 id="u4cf-sp" class="u4c-chalkfont">今日特调<small>每杯是一份事件</small></h2><ul>'
    + CUPS.map(c => `<li><button type="button" class="u4c-cup"${act('special', { k: c.k })}><svg class="art" viewBox="0 0 52 44" aria-hidden="true">${CUP}${c.art}</svg>`
      + `<span class="q-nm u4c-chalkfont">${c.nm}</span><span class="q-ds">${c.ds}</span><span class="q-pr">${c.pr} FP</span>${RING}</button></li>`).join('')
    + '</ul><p class="foot">盲杯端上来，才知道是哪一杯。</p></div></section>';
}

const TICK = '<svg class="tick" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 11l4 4 10-11" stroke="#5a2418" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

function ledger(s: LobbyState): string {
  const slots = s.dailyOpts.map(o => {
    const on = o.k === s.daily;
    return `<li><button type="button" class="slot${on ? ' on' : ''}"${act('dailysel', { k: o.k, nm: o.nm, pr: o.pr })} aria-pressed="${on}"><span class="q-nm">${esc(o.nm)}</span><span class="lead"></span><span class="q-pr">${o.pr}<small>FP</small></span>${TICK}</button></li>`;
  }).join('');
  return '<section class="u4c-ledger" aria-labelledby="u4cf-dl"><div class="q-book"><div class="page q-l">'
    + '<h3 id="u4cf-dl" class="u4c-handfont">预约日常</h3><p class="q-sub">夜梦会为你留好这一桌下午茶，半日至一周，任选其一。</p>'
    + `<ul class="slots">${slots}</ul></div><div class="page q-r">`
    + `<span class="for">为你留座</span><span class="choice u4c-handfont" data-u4-dname>${esc(nameOf(s))}</span><span class="gift">附赠 · 黄油曲奇</span>`
    + `<button type="button" class="q-stamp"${act('dailyorder')}><svg viewBox="0 0 60 60" aria-hidden="true"><path d="M22 4h16l-2 22H24z" fill="#5b3a22"/><ellipse cx="30" cy="5" rx="9" ry="3.4" fill="#7a5130"/><path d="M12 26h36v8H12z" fill="url(#u4cfBrass)"/><path d="M10 34h40v6H10z" fill="#3a2416"/><path d="M10 40h40v3H10z" fill="#9e2a20"/></svg>`
    + `<span><span class="act">盖章预约</span><span class="tot"><b data-u4-dprice>${priceOf(s)}</b> FP</span></span></button>`
    + '<svg class="impress" viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="#a3261f" stroke-width="4"><circle cx="60" cy="60" r="50"/><circle cx="60" cy="60" r="41" stroke-width="1.6"/></g><text x="60" y="69" text-anchor="middle" font-size="27" font-weight="700" fill="#a3261f" letter-spacing="2">已预约</text><text x="60" y="34" text-anchor="middle" font-size="8.5" fill="#a3261f" class="u4c-latin" letter-spacing="1.5">CAFÉ NOCTURNE</text></svg>'
    + '</div></div><svg class="stand" viewBox="0 0 300 26" aria-hidden="true"><path d="M20 2h260l-12 12H32z" fill="url(#u4cfBrass)"/><path d="M40 14h10l-14 12h-8zM250 14h10l12 12h-8z" fill="#6e4e26"/></svg></section>';
}

function receiptNo(): string {
  const d = new Date();
  return String(((d.getMonth() + 1) * 100 + d.getDate()) % 10000).padStart(4, '0');
}

function printer(s: LobbyState): string {
  return '<div class="u4c-printer" aria-live="polite"><div class="receipt"><p class="shop u4c-latin">CAFÉ NOCTURNE</p>'
    + `<p>深夜场次 No.${receiptNo()}</p><hr><p>预约日常 · <span id="cf-rname">${esc(nameOf(s))}</span></p><p>附赠 · 黄油曲奇</p><hr>`
    + `<p class="q-sum"><span>合计</span><span><span id="cf-rtotal">${priceOf(s)}</span> FP</span></p><p class="more">请慢用</p>`
    + `<span id="cf-rprice" hidden>${priceOf(s)} FP</span></div><div class="q-body"><i></i></div></div>`;
}

function register(): string {
  return '<div class="u4c-register" role="status" aria-label="命运点数"><div class="reg-top"><span class="q-flag u4c-latin">FP</span><span class="drums" data-u4-fpdrums><i>–</i><i>–</i></span><span class="u4-vh" data-u4-fp>——</span></div>'
    + '<div class="reg-body"><svg viewBox="0 0 120 40" aria-hidden="true"><g fill="#efe2c4" stroke="#3a2614" stroke-width="1"><circle cx="12" cy="9" r="5"/><circle cx="30" cy="9" r="5"/><circle cx="48" cy="9" r="5"/><circle cx="66" cy="9" r="5"/><circle cx="84" cy="9" r="5"/><circle cx="102" cy="9" r="5"/><circle cx="21" cy="25" r="5"/><circle cx="39" cy="25" r="5"/><circle cx="57" cy="25" r="5"/><circle cx="75" cy="25" r="5"/><circle cx="93" cy="25" r="5"/></g><rect x="4" y="34" width="112" height="5" rx="1" fill="#3a2614"/></svg>'
    + '<span class="plate">收银</span></div></div>';
}

/* Everything that is not on the counter is on the menu card hanging from the shelf: one object, one list. */
interface Item { cls: string; attrs: string; name: string; note: string }
function items(s: LobbyState): Item[] {
  return [
    { cls: 'm-persona', attrs: act('page', { page: 'persona' }), name: '眼中的她', note: `<span data-u4-persona>${esc(s.persona.label)}</span> · <span data-u4-appearance>${esc(s.appearance.label)}</span>` },
    { cls: 'm-tuning', attrs: act('page', { page: 'tuning' }), name: '故事定调', note: `<span data-u4-books>${esc(bookText(s.books))}</span> · 1,000 起` },
    { cls: 'm-decouple', attrs: act('page', { page: 'decouple' }), name: '人格解耦', note: '镜子里的另一个她' },
    { cls: 'm-template', attrs: act('page', { page: 'template' }), name: '条目模仿', note: '照着世界书写一条' },
    { cls: 'm-eggs', attrs: act('page', { page: 'eggs' }), name: '彩蛋服务台', note: '显示 · 主题 · 信封' },
    { cls: 'm-news', attrs: act('order', { text: '更新新闻' }), name: '新闻更新', note: '今夜的报纸 · 免费' },
    { cls: 'm-nap', attrs: act('order', { text: '使用间章:小憩' }), name: '小憩片刻', note: '扶手椅上歇一会儿 · 免费' },
    { cls: 'm-chess', attrs: act('chess'), name: '下一盘棋', note: '窗边那张小桌' },
  ];
}

function menu(s: LobbyState): string {
  return '<nav class="u4c-menu" aria-labelledby="u4cf-mn"><svg class="string" viewBox="0 0 90 46" aria-hidden="true"><path d="M8 44L45 5l37 39" fill="none" stroke="#c9b48a" stroke-width="1.3"/><circle cx="45" cy="5" r="3.4" fill="url(#u4cfBrass)" stroke="#3a2614" stroke-width=".8"/></svg>'
    + '<div class="card"><p class="logo u4c-latin" id="u4cf-mn" aria-label="店里的其他服务">Café Nocturne</p><svg class="rule" viewBox="0 0 160 10" aria-hidden="true"><path d="M4 5h58M98 5h58" stroke="#9e2a20" stroke-width=".9"/><path d="M70 5c4-5 8-5 10 0s6 5 10 0" fill="none" stroke="#9e2a20" stroke-width="1.1"/></svg><ul>'
    + items(s).map(m => `<li><button type="button" class="${m.cls}"${m.attrs}><span class="q-nm">${m.name}</span><span class="q-ds">${m.note}</span></button></li>`).join('')
    + '</ul></div></nav>';
}

/* The two things that do stand on the counter besides the book and the till. */
function counterProps(s: LobbyState): string {
  return `<button type="button" class="u4c-obj o-jar"${act('prayer')}>${twoFrame('cafe/prop-jar')}<span class="q-tag"><b>祷诗</b><small>抽一张诗笺 · 免费</small></span></button>`
    + `<button type="button" class="u4c-obj o-fortune"${act('gacha')}>${twoFrame('cafe/prop-fortune')}<span class="q-tag"><b>命运抽卡</b><small>${s.gachaPrice ? '<span class="mini">' + esc(s.gachaPrice) + '</span> FP 一张' : '占卜卡匣'}</small></span></button>`;
}

function juke(s: LobbyState): string {
  return '<div class="u4c-juke"><svg class="deck" viewBox="0 0 200 128" aria-hidden="true"><defs>'
    + '<linearGradient id="u4cfWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4429"/><stop offset="1" stop-color="#2a170c"/></linearGradient>'
    + '<radialGradient id="u4cfVinyl"><stop offset="0" stop-color="#1a1a1a"/><stop offset=".3" stop-color="#0c0c0c"/><stop offset=".31" stop-color="#262626"/><stop offset=".6" stop-color="#101010"/><stop offset=".95" stop-color="#1b1b1b"/><stop offset="1" stop-color="#050505"/></radialGradient></defs>'
    + '<path d="M14 58h172l10 40H4z" fill="url(#u4cfWood)"/><path d="M4 98h192v16H4z" fill="#22130a"/><path d="M14 58h172" stroke="#c49a63" stroke-width="1.2" opacity=".6"/>'
    + '<g class="q-disc"><ellipse cx="86" cy="76" rx="70" ry="20" fill="url(#u4cfVinyl)"/><ellipse cx="86" cy="76" rx="52" ry="14.6" fill="none" stroke="#2c2c2c" stroke-width=".8"/><ellipse cx="86" cy="76" rx="38" ry="10.6" fill="none" stroke="#2a2a2a" stroke-width=".8"/><ellipse cx="86" cy="76" rx="16" ry="4.6" fill="#8e2a1f"/><ellipse class="glint" cx="78" cy="75" rx="5" ry="1.4" fill="#e8c88c" opacity=".7"/></g>'
    + '<g class="arm"><circle cx="174" cy="66" r="7" fill="url(#u4cfBrass)"/><path d="M174 66C170 74 150 82 118 84" stroke="url(#u4cfBrass)" stroke-width="3.4" fill="none" stroke-linecap="round"/><rect x="108" y="81" width="12" height="5" rx="1" fill="#2a2016"/></g></svg>'
    + `<div class="slip"><p class="q-tt" data-u4-jtitle>${esc(s.juke.title)}</p><div class="q-row"><span class="q-no" data-u4-jno>${esc(s.juke.no)}</span><span class="ctl">`
    + `<button type="button"${act('jukeplay')} data-u4-jplay aria-pressed="${s.juke.playing}"><span data-u4-jstate>${s.juke.playing ? '暂停' : '播放'}</span></button>`
    + `<button type="button"${act('jukelist')}>曲目单</button></span></div><i class="bar"><i id="dlb-jbar"></i></i></div>`
    + '<div class="u4c-tracks" id="dlb-trackpop" style="display:none"></div></div>';
}

function greeting(): string {
  return '<button type="button" class="u4c-tent" data-u4-greet aria-label="夜梦的桌卡，点一下换一句"><span class="face"><span class="line" data-u4-line></span><span class="sig u4c-latin">— Yume</span></span></button>';
}

export const cafe: ThemeKit = {
  id: 'cafe',
  envelopeCss,
  scene: s => '<div class="u4c-plate q-wide" data-u4-bg="cafe/plate-wide"></div><div class="u4c-plate q-tall" data-u4-bg="cafe/plate-tall"></div>'
    + '<div class="u4c-rain"></div><div class="u4c-pool"></div>'
    + `<figure class="u4c-her"><img alt="" data-u4-her data-u4-img="cafe/standing/${esc(s.appearance.id)}" data-u4-fallback="${esc(s.standing)}"></figure>`
    + '<div class="u4c-front q-wide" data-u4-bg="cafe/plate-wide"></div><div class="u4c-front q-tall" data-u4-bg="cafe/plate-tall"></div>',
  top: page => `<svg width="0" height="0" class="u4-vh" aria-hidden="true"><defs>${BRASS}${CHALK}</defs></svg>` + clock() + fpMini() + (page === 'main' ? '' : back()) + closed(),
  main: s => greeting() + ledger(s) + printer(s) + register() + specials() + menu(s) + counterProps(s) + juke(s),
  date: d => `${d.getMonth() + 1}月${d.getDate()}日 · ${WEEK[d.getDay()]}`,
  greetings(s, hour) {
    const you = s.address ? s.address + '，' : '';
    const late = hour >= 22 || hour < 5, day = hour >= 11 && hour < 18;
    return [
      late ? `${you}雨还没停。今晚想留多久，在本子上圈一个时段就行。` : day ? `${you}午后的店里人少，靠窗那张桌子空着。` : `${you}雨下得正好。想留多久，在本子上圈一个时段就行。`,
      '黑板上的四杯今天都能点。盲杯是我挑的，不告诉你是哪一杯。',
      '唱机里那张还没放完。想换一首的话，曲目单在唱片下面。',
      '诗笺罐里的诗是免费的，抽到不喜欢的也不许退。',
      '要打烊了也没关系，你在，这里就还开着。',
    ];
  },
  skin: {
    pages: {
      persona: { prop: 'cafe/prop-photowall', title: '眼中的她', lede: '吧台后面的照片墙。名牌是她的性子，相片是她今天穿的那身。' },
      tuning: { prop: 'cafe/prop-books', title: '故事定调', lede: '店角的书架。挑一本定调，故事就照着它的口吻往下写。' },
      decouple: { prop: 'cafe/prop-mirror', title: '人格解耦', lede: '镜子里的那一位，也可以有自己的名字和衣裳。' },
      template: { prop: 'cafe/prop-typewriter', title: '条目模仿', lede: '侧桌上的打字机，照着世界书的格式敲一条新的。' },
      eggs: { prop: 'cafe/prop-drawers', title: '彩蛋服务台', lede: '后场的药柜。一个抽屉放一样东西，拉开就能换。' },
    },
    words: { who: '她是谁', look: '今天穿哪一身', address: '称呼', custom: '自己写一个', shelf: '书架', services: '可以点的', pair: '主人格与镜中人',
      sea: '书海迷宫', toggles: '小开关', desk: '管理台', tools: '唱片与信纸', discs: '唱片管理',
      receiptShop: 'CAFÉ NOCTURNE', receiptVerb: '盖章下单', receiptCancel: '再想想' },
    ornament: () => '<i class="q-clip" aria-hidden="true"></i>',
  },
  sync(root, kind, s) {
    if (kind !== 'all' && kind !== 'fp') return;
    const digits = s.fp === '——' ? ['–', '–'] : s.fp.replace(/[^0-9]/g, '').split('');
    const html = digits.map(d => `<i>${d}</i>`).join('');
    each(root, '[data-u4-fpdrums]', el => { if (el.innerHTML !== html) el.innerHTML = html; });
  },
  celebrate(root, kind) {
    const cls = kind.indexOf('日常:') === 0 ? 'u4-fx-daily' : 'u4-fx-special';
    root.classList.remove('u4-fx-daily', 'u4-fx-special');
    void root.offsetWidth;
    root.classList.add(cls);
    if (cls === 'u4-fx-special') root.setAttribute('data-u4-cup', kind);
    window.setTimeout(() => root.classList.remove(cls), 2600);
  },
};
