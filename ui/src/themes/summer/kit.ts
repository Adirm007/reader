/* Summer Post — the sea-facing wall of a small seaside post office at noon. The interface is what gets
 * pinned to its cork board (ferry tickets, notes, a postage-meter stamp) and set out on the ledge below. */
import type { LobbyState, ThemeKit } from '../../core/types';
import { act, esc, twoFrame, priceOf, nameOf, bookText } from '../../core/dom';
import envelopeCss from './envelope.css';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const PIN = (c: string) => `<i class="pin" style="--pin:${c}"></i>`;

function clock(): string {
  return '<div class="u4s-clock" role="timer" aria-live="off"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#fbf8f0" stroke="#1f6f9a" stroke-width="4"/>'
    + '<g stroke="#12404c" stroke-linecap="round"><path d="M32 7v5M32 52v5M7 32h5M52 32h5" stroke-width="2.4"/></g>'
    + '<g stroke="#12404c" stroke-linecap="round"><path data-u4-hh d="M32 32V19" stroke-width="3"/><path data-u4-mh d="M32 32V11" stroke-width="2"/></g><circle cx="32" cy="32" r="2.6" fill="#c8372d"/></svg>'
    + '<div class="q-t"><b data-u4-time>--:--</b><small data-u4-date></small></div></div>';
}

function tide(): string {
  const h = new Date().getHours();
  return `<div class="u4s-tide" aria-hidden="true"><svg viewBox="0 0 120 18" preserveAspectRatio="none"><path d="M0 9C10 2 20 2 30 9S50 16 60 9 80 2 90 9 110 16 120 9" fill="none" stroke="#1f6f9a" stroke-width="2"/><circle cx="${(h / 24 * 120).toFixed(1)}" cy="9" r="3.2" fill="#f6c445" stroke="#12404c" stroke-width="1"/></svg><span>今日潮汐</span></div>`;
}

function flap(): string {
  return `<button type="button" class="u4s-flap"${act('close')} aria-label="封上信封，离开邮局"><svg viewBox="0 0 96 74" aria-hidden="true">`
    + '<rect x="3" y="3" width="90" height="68" rx="3" fill="#fbf8f0" stroke="#d9cdb4" stroke-width="1.5"/>'
    + '<path d="M3 6h90" stroke="url(#u4sxAir)" stroke-width="6"/><path d="M5 5l43 34 43-34" fill="#f3ead6" stroke="#cdbf9f" stroke-width="1.5"/>'
    + '<text x="48" y="62" text-anchor="middle" class="u4s-disp" font-size="15" fill="#12404c" letter-spacing="3">关 闭</text></svg></button>';
}

function back(): string {
  return `<button type="button" class="u4s-back"${act('back')}><svg viewBox="0 0 60 24" aria-hidden="true"><path d="M56 12H8M18 3L6 12l12 9" fill="none" stroke="#12404c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>回邮局</span></button>`;
}

function meter(): string {
  const d = new Date(), date = `${String(d.getMonth() + 1).padStart(2, '0')}·${String(d.getDate()).padStart(2, '0')}`;
  return `<div class="u4s-meter" role="status" aria-label="命运点数">${PIN('#1f6f9a')}<span class="frame"><span class="lbl u4s-latin">FP · POSTAGE</span><b data-u4-fp>——</b><span class="dt u4s-latin">${date}</span></span><span class="q-tag">邮资机</span></div>`;
}

function note(): string {
  return `<button type="button" class="u4s-note" data-u4-greet aria-label="夜梦留的便条，点一下换一句">${PIN('#c8372d')}<span class="line" data-u4-line></span><span class="sig u4s-latin">— Yume</span></button>`;
}

const PUNCH = '<svg class="punch" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="#1b2c33"/></svg>';
function tickets(s: LobbyState): string {
  const rows = s.dailyOpts.map((o, i) => {
    const on = o.k === s.daily;
    return `<li><button type="button" class="ticket${on ? ' on' : ''}"${act('dailysel', { k: o.k, nm: o.nm, pr: o.pr })} aria-pressed="${on}">`
      + `<span class="route">往返 · 海边日常</span><b class="q-nm u4s-disp">${esc(o.nm)}</b><span class="q-pr"><b>${o.pr}</b> FP</span>`
      + `<span class="stub u4s-latin">No.${String(811 + i * 1).padStart(4, '0')}</span>${PUNCH}<span class="mark">已打孔</span></button></li>`;
  }).join('');
  return '<section class="u4s-tickets" aria-labelledby="u4sx-dl"><h2 id="u4sx-dl" class="u4s-disp">预约日常<small>夜梦会为你留好这一段夏天，半日至一周，任选其一。</small></h2>'
    + `<ul>${rows}</ul><button type="button" class="u4s-go"${act('dailyorder')}><svg viewBox="0 0 40 24" aria-hidden="true"><path d="M2 14c6-6 12-6 18 0s12 6 18 0" fill="none" stroke="#fbf8f0" stroke-width="2.4" stroke-linecap="round"/><path d="M8 20h24" stroke="#fbf8f0" stroke-width="2" stroke-linecap="round"/></svg>`
    + `<span>检票出发 · <b data-u4-dname>${esc(nameOf(s))}</b></span><span class="tot"><b data-u4-dprice>${priceOf(s)}</b> FP</span></button>`
    + '<span class="u4s-check" aria-hidden="true"><svg viewBox="0 0 100 100"><g fill="none" stroke="#c8372d" stroke-width="3.4"><circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="31" stroke-width="1.4"/></g><text x="50" y="57" text-anchor="middle" font-size="19" font-weight="700" fill="#c8372d">已检票</text><text x="50" y="30" text-anchor="middle" font-size="7.5" fill="#c8372d" letter-spacing="1.2">SUMMER POST</text></svg></span>'
    + '<span class="u4s-stubfly" aria-hidden="true"></span></section>';
}

const BOTTLES: { k: string; nm: string; ds: string; pr: number; hue: number }[] = [
  { k: '缘', nm: '缘', ds: '汽水与偶遇', pr: 200, hue: 150 },
  { k: '喜', nm: '喜', ds: '晴天好事', pr: 200, hue: 200 },
  { k: '险', nm: '险', ds: '台风前夜', pr: 200, hue: 0 },
];
function cooler(): string {
  return '<section class="u4s-cooler" aria-labelledby="u4sx-sp"><h2 id="u4sx-sp" class="u4s-disp">今日特调<small>冰柜里的弹珠汽水</small></h2><div class="ice">'
    + BOTTLES.map(b => `<button type="button" class="u4s-bottle"${act('special', { k: b.k })} style="--hue:${b.hue}deg" aria-label="买一份${b.nm}，${b.ds}，${b.pr} FP">${twoFrame('summer/prop-ramune', 'glass')}<span class="tagp"><b class="u4s-disp">${b.nm}</b><em>${b.pr}</em><small>${b.ds}</small></span></button>`).join('')
    + `<button type="button" class="u4s-bottle drift"${act('special', { k: '随机涟漪' })} aria-label="随机涟漪，捡到的漂流瓶，100 FP">${twoFrame('summer/prop-driftbottle', 'glass')}<span class="tagp"><b class="u4s-disp">涟漪</b><em>100</em><small>捡到的漂流瓶</small></span></button>`
    + '</div></section>';
}

/* The other services are pinned in a row along the bottom of the board: postcards, a flyer, a key tag. */
const INK = '#1f6f9a';
interface Pin { cls: string; attrs: string; name: string; note: string; pic: string; pin: string }
function pinned(s: LobbyState): Pin[] {
  return [
    { cls: 'p-photo', attrs: act('page', { page: 'persona' }), name: '眼中的她', note: `<span data-u4-persona>${esc(s.persona.label)}</span>`, pin: '#c8372d',
      pic: `<span class="snap"><img alt="" data-u4-img="summer/avatar/${esc(s.appearance.id)}"></span>` },
    { cls: 'p-book', attrs: act('page', { page: 'tuning' }), name: '故事定调', note: `<span data-u4-books>${esc(bookText(s.books))}</span>`, pin: '#f6c445',
      pic: '<svg viewBox="0 0 60 60" aria-hidden="true"><rect x="12" y="6" width="36" height="50" rx="2" fill="#c9573f"/><rect x="12" y="6" width="5" height="50" fill="#a8432f"/><text x="33" y="27" text-anchor="middle" font-size="13" fill="#fbf8f0" font-weight="700">定</text><text x="33" y="44" text-anchor="middle" font-size="13" fill="#fbf8f0" font-weight="700">调</text></svg>' },
    { cls: 'p-card', attrs: act('page', { page: 'decouple' }), name: '人格解耦', note: '潮池里的倒影', pin: '#1f6f9a',
      pic: `<svg viewBox="0 0 60 60" aria-hidden="true"><rect x="4" y="10" width="52" height="40" fill="${INK}"/><circle cx="30" cy="27" r="8" fill="none" stroke="#fbf8f0" stroke-width="2"/><path d="M8 32h44" stroke="#fbf8f0" stroke-width="1.6"/><path d="M22 37a8 5 0 0 0 16 0" fill="none" stroke="#fbf8f0" stroke-width="1.6" stroke-dasharray="3 2"/></svg>` },
    { cls: 'p-stamp', attrs: act('page', { page: 'template' }), name: '条目模仿', note: '照着盖一条', pin: '#c8372d',
      pic: '<svg viewBox="0 0 60 60" aria-hidden="true"><rect x="8" y="10" width="44" height="40" fill="#fbf8f0"/><rect x="13" y="15" width="34" height="30" fill="none" stroke="#c8372d" stroke-width="2" stroke-dasharray="4 2"/><text x="30" y="37" text-anchor="middle" font-size="17" fill="#c8372d" font-weight="700">照</text></svg>' },
    { cls: 'p-key', attrs: act('page', { page: 'eggs' }), name: '彩蛋服务台', note: '储物柜 · 设置', pin: '#f6c445',
      pic: '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 4v12" stroke="#8a6b3e" stroke-width="1.4"/><circle cx="30" cy="34" r="18" fill="#e9c46a" stroke="#a07a32" stroke-width="2"/><circle cx="30" cy="34" r="13" fill="none" stroke="#a07a32" stroke-width="1"/><text x="30" y="40" text-anchor="middle" font-size="15" fill="#12404c" font-weight="700">07</text></svg>' },
    { cls: 'p-extra', attrs: act('order', { text: '更新新闻' }), name: '新闻更新', note: '号外 · 免费', pin: '#1f6f9a',
      pic: '<svg viewBox="0 0 60 60" aria-hidden="true"><rect x="8" y="6" width="44" height="50" fill="#fff3c4"/><text x="30" y="30" text-anchor="middle" font-size="16" fill="#c8372d" font-weight="700">号外</text><path d="M14 38h32M14 44h32M14 50h22" stroke="#4d6d74" stroke-width="1.4"/></svg>' },
    { cls: 'p-card', attrs: act('order', { text: '使用间章:小憩' }), name: '小憩片刻', note: '遮阳伞下', pin: '#c8372d',
      pic: `<svg viewBox="0 0 60 60" aria-hidden="true"><rect x="4" y="10" width="52" height="40" fill="${INK}"/><path d="M14 30a16 13 0 0 1 32 0z" fill="#fbf8f0"/><path d="M30 30v16M22 46h16" stroke="#fbf8f0" stroke-width="2" stroke-linecap="round"/></svg>` },
    { cls: 'p-card', attrs: act('chess'), name: '下一盘棋', note: '野餐垫上', pin: '#f6c445',
      pic: `<svg viewBox="0 0 60 60" aria-hidden="true"><rect x="4" y="10" width="52" height="40" fill="${INK}"/><g stroke="#fbf8f0" stroke-width="1.4"><path d="M16 18h28M16 26h28M16 34h28M16 42h28M16 18v24M30 18v24M44 18v24"/></g><circle cx="23" cy="26" r="4" fill="#c8372d" stroke="#fbf8f0"/><circle cx="37" cy="34" r="4" fill="#fbf8f0"/></svg>` },
  ];
}

function board(s: LobbyState): string {
  return '<nav class="u4s-pins" aria-label="布告板上的其他服务">' + pinned(s).map((p, i) =>
    `<button type="button" class="pinned ${p.cls}"${p.attrs} style="--r:${[-2.4, 1.6, -1, 2.2, -1.8, 1.2, -2, 1.8][i]}deg">${PIN(p.pin)}<span class="pic">${p.pic}</span><b class="u4s-disp">${p.name}</b><small>${p.note}</small></button>`).join('') + '</nav>';
}

function shore(s: LobbyState): string {
  return `<button type="button" class="u4s-obj o-gacha"${act('gacha')}>${twoFrame('summer/prop-gacha')}<span class="q-tag"><b class="u4s-disp">命运抽卡</b><small>${s.gachaPrice ? '<span class="mini">' + esc(s.gachaPrice) + '</span> FP 一颗' : '扭蛋机'}</small></span></button>`
    + `<button type="button" class="u4s-obj o-shell"${act('prayer')}>${twoFrame('summer/prop-shell')}<span class="q-tag"><b class="u4s-disp">祷诗</b><small>贝壳里的诗 · 免费</small></span></button>`;
}

function radio(s: LobbyState): string {
  return `<div class="u4s-radio"><button type="button" class="set"${act('jukeplay')} data-u4-jplay aria-pressed="${s.juke.playing}" aria-label="${s.juke.playing ? '暂停唱片' : '播放唱片'}">${twoFrame('summer/prop-radio')}<span class="reels" aria-hidden="true"><i></i><i></i></span></button>`
    + `<div class="q-card"><p class="q-tt" data-u4-jtitle>${esc(s.juke.title)}</p><div class="q-row"><span data-u4-jno>${esc(s.juke.no)}</span><span><span class="u4-vh">点唱机：</span><span data-u4-jstate>${s.juke.playing ? '暂停' : '播放'}</span>`
    + ` · <button type="button"${act('jukelist')}>卡带盒</button></span></div><i class="bar"><i id="dlb-jbar"></i></i></div>`
    + '<div class="u4s-tracks" id="dlb-trackpop" style="display:none"></div></div>';
}

export const summer: ThemeKit = {
  id: 'summer',
  envelopeCss,
  scene: s => '<div class="u4s-plate q-wide" data-u4-bg="summer/plate-wide"></div><div class="u4s-plate q-tall" data-u4-bg="summer/plate-tall"></div>'
    + `<figure class="u4s-her"><img alt="" data-u4-her data-u4-img="summer/standing/${esc(s.appearance.id)}" data-u4-fallback="${esc(s.standing)}"></figure>`
    + '<div class="u4s-front q-wide" data-u4-bg="summer/plate-wide"></div><div class="u4s-front q-tall" data-u4-bg="summer/plate-tall"></div><div class="u4s-cork"></div>',
  top: page => '<svg width="0" height="0" class="u4-vh" aria-hidden="true"><defs><linearGradient id="u4sxAir" x1="0" x2="1"><stop offset="0" stop-color="#c8372d"/><stop offset=".5" stop-color="#c8372d"/><stop offset=".5" stop-color="#1f6f9a"/></linearGradient><pattern id="u4sxAirP" width="16" height="6" patternUnits="userSpaceOnUse"><rect width="8" height="6" fill="#c8372d"/><rect x="8" width="8" height="6" fill="#1f6f9a"/></pattern></defs></svg>'
    + clock() + tide() + (page === 'main' ? '' : back()) + flap(),
  main: s => note() + meter() + tickets(s) + board(s) + '<i class="u4s-shade" aria-hidden="true"></i>' + cooler() + shore(s) + radio(s),
  date: d => `${d.getMonth() + 1}月${d.getDate()}日 · ${WEEK[d.getDay()]}`,
  greetings(s, hour) {
    const you = s.address ? s.address + '，' : '';
    return [
      hour >= 18 || hour < 5 ? `${you}海风凉下来了。想留几天，就挑一张船票。` : `${you}风有点大，纸片会飞。今天想坐哪一班船？`,
      '冰柜里的汽水刚换过冰。漂流瓶是今早捡的，里面写了什么我也不知道。',
      '贝壳里的诗不要钱，翻开就是你的。',
      '收音机里那盘卡带快放完了，卡带盒在旁边。',
      '储物柜的钥匙在板子上挂着，想改设置就去开 07 号。',
    ];
  },
  skin: {
    pages: {
      persona: { prop: 'summer/prop-polaroids', title: '眼中的她', lede: '晾在绳上的拍立得。行李牌上写着她的性子，相片是她今天的打扮。' },
      tuning: { prop: 'summer/prop-bookrack', title: '故事定调', lede: '小店门口的平装书转架。挑一本定调，故事就照它的口吻往下写。' },
      decouple: { prop: 'summer/prop-tidepool', title: '人格解耦', lede: '潮池里有两个倒影。另一个她，也可以有自己的名字和衣裳。' },
      template: { prop: 'summer/prop-stamps', title: '条目模仿', lede: '柜台上的橡皮章和印台，照着世界书的格式盖一条新的。' },
      eggs: { prop: 'summer/prop-lockers', title: '彩蛋服务台', lede: '邮局墙边的储物柜。一格放一样东西，开着的门挂着黄钥匙牌。' },
    },
    words: { who: '她是谁', look: '今天的打扮', address: '称呼', custom: '自己写一个', shelf: '书架', services: '柜台业务', pair: '主人格与倒影',
      sea: '书海迷宫', toggles: '小开关', desk: '管理台', tools: '卡带与信纸',
      receiptShop: '海边邮局 · 船票', receiptVerb: '检票', receiptCancel: '先不了' },
    ornament: () => '<i class="q-tape q-a" aria-hidden="true"></i><i class="q-tape q-b" aria-hidden="true"></i>',
  },
  celebrate(root, kind) {
    const cls = kind.indexOf('日常:') === 0 ? 'u4-fx-daily' : 'u4-fx-special';
    root.classList.remove('u4-fx-daily', 'u4-fx-special');
    void root.offsetWidth;
    root.classList.add(cls);
    root.setAttribute('data-u4-cup', kind);
    window.setTimeout(() => root.classList.remove(cls), 2600);
  },
};
