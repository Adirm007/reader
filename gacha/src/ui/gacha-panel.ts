/** 命运抽卡界面（读者大厅打开）：择海（文学 / ACGN · 主题）→ 撒网捞起 54 部（换大池）→ 选一部编纂小池 → 物品池 / 命运池单抽、十连 → 用不上的按品质回收。
 *  抽卡动画：书海中的一本书蓄光、翻开，书页化作卡牌飞出，逐张翻开；6★ 带虹彩。
 *  配色跟随读者大厅当前主题（咖啡馆 / 盛夏 / 水墨）；夜梦的立绘、小人与背景图由宿主（读者）按当前外观传入，不随界面打包。 */
import {GACHA_STYLE} from './gacha-style';
import {CARD_BACK_SVG,KIND_EMBLEM,RUNE_RING_SVG,TOME_COVER_SVG,SIGIL_URI} from './gacha-art';
import {gameDom} from './game-dom';
import type {GachaService,GachaSettings,DrawOutcome} from '../gacha/session';
import {MEDIA_LABEL,SOURCES,SOURCE_BY_ID,type WorkCard,type SourceReport} from '../gacha/sources';
import {themeSources,type Direction,type GachaTheme} from '../gacha/themes';
import {ratesText,starText,STARS,starOfQuality,type Star} from '../gacha/rarity';
import {RECYCLE_DIVISOR,RECYCLE_QUALITIES,recyclePrice,type BagEntry,type RecyclePick} from '../gacha/bag';
import {KIND_LABEL,type GachaCard,type CardKind,type SmallPool} from '../gacha/pool';

const STYLE_ID = 'dream-gacha-style';
const ICON = {
  history: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.6h3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4.4l2.8 1.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  recycle: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.2 7.3 10.6 3.6a1.6 1.6 0 0 1 2.8 0l2 3.3M18.4 10.6l1.9 3.3a1.6 1.6 0 0 1-1.4 2.4h-4.4M9.4 16.3H5.1a1.6 1.6 0 0 1-1.4-2.4l2.1-3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="m15.6 4.9-.2 2.4-2.4-.3M20.2 18.4l-1.7-1.7 1.8-1.6M3.9 8.9l2 1.5-1.6 1.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 3-.7 2.4-2 .9L5 5.6 3 9l1.8 1.7v2.6L3 15l2 3.4 2.3-.7 2 .9L10 21h4l.7-2.4 2-.9 2.3.7 2-3.4-1.8-1.7v-2.6L21 9l-2-3.4-2.3.7-2-.9L14 3h-4Z" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.4"/></svg>',
};
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 17);
const fmt = (n: number) => Math.round(n).toLocaleString('zh-CN');
const when = (at: number) => {const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;};
const reduced = (win: Window | null) => {try {return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;} catch {return false;}};
type View = 'home' | 'spread' | 'pool';
/** 宿主传入的美术（都可省略）：figure 透明底立绘（首页右侧、撒网时的人影）；backdrop 抽卡舞台的模糊底图；title 首页横幅插画；chibi 小人（idle 平时，cheer 出 5★ 以上）。 */
export type GachaArt = {figure?: string; backdrop?: string; title?: string; chibi?: {idle?: string; cheer?: string}};
/** theme：读者大厅当前主题（cafe 咖啡馆 · summer 盛夏 · ink 水墨），面板配色随之切换；认不出时用咖啡馆。 */
export type GachaPanelOptions = {onChange?: () => void; title?: string; art?: GachaArt | (() => GachaArt | undefined); theme?: string | (() => string | undefined); zIndex?: number};
export const PANEL_THEMES = ['cafe', 'summer', 'ink'] as const;
export const panelTheme = (v: unknown): typeof PANEL_THEMES[number] => PANEL_THEMES.find(t => t === v) ?? 'cafe';
/** 只接受图片地址；引号与换行会被转义，不能拼出别的 CSS。 */
export const cssImage = (u: unknown) => typeof u === 'string' && /^(https?:\/\/|data:image\/|blob:)/i.test(u.trim()) ? `url("${u.trim().replace(/["\\\n\r\f]/g, c => encodeURIComponent(c))}")` : '';

export function mountGachaPanel(doc: Document, gacha: GachaService, options: GachaPanelOptions = {}) {
  const {el, button} = gameDom(doc), win = doc.defaultView;
  const ensureStyle = () => {if (!doc.getElementById(STYLE_ID)) {const css = el('style'); css.id = STYLE_ID; css.textContent = GACHA_STYLE; doc.head.append(css);}};
  ensureStyle();
  const root = el('section', 'bs-gacha'), shell = el('div', 'gc-shell'), head = el('header', 'gc-head'), body = el('div', 'gc-body');
  // 作品占位封面用星章；夜梦的美术每次打开时按宿主当前外观设置（applyArt）。
  root.style.setProperty('--gc-sigil', `url("${SIGIL_URI}")`);
  if (options.zIndex) root.style.zIndex = String(options.zIndex);
  const name = options.title || '命运抽卡';
  root.hidden = true; root.dataset.dreamOverlay = 'gacha'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'gc-title');
  const titleBox = el('div', 'gc-title'), title = el('h2', '', name), sub = el('p', '', '从书海里捞起一部作品，再从书页里抽出物品与命运'); title.id = 'gc-title'; titleBox.append(title, sub);
  const walletChip = el('span', 'gc-chip'), pityChip = el('span', 'gc-chip is-pity');
  const historyButton = button('', () => openHistory(), 'gc-icon'), recycleButton = button('', () => openRecycle(), 'gc-icon'), settingsButton = button('', () => openSettings(), 'gc-icon'), closeButton = button('×', () => close(), 'gc-icon gc-close');
  historyButton.innerHTML = ICON.history; historyButton.setAttribute('aria-label', '抽卡记录'); historyButton.title = '抽卡记录';
  recycleButton.innerHTML = ICON.recycle; recycleButton.setAttribute('aria-label', '回收'); recycleButton.title = '回收：把用不上的物品与命运按品质换回命运点数'; recycleButton.hidden = !gacha.canRecycle();
  settingsButton.innerHTML = ICON.gear; settingsButton.setAttribute('aria-label', '抽卡设置'); settingsButton.title = '抽卡设置';
  closeButton.setAttribute('aria-label', '关闭' + name);
  head.append(titleBox, walletChip, pityChip, historyButton, recycleButton, settingsButton, closeButton);
  const view = el('div', 'gc-view'), toastBox = el('div', 'gc-toast'); toastBox.hidden = true; toastBox.setAttribute('role', 'status');
  body.append(view, toastBox); shell.append(head, body); root.append(shell);
  // 点到面板里的空白处、或重绘移走了获得焦点的按钮时，焦点留在面板内（Esc 与 Tab 仍归面板处理）。
  shell.tabIndex = -1;
  const keepFocus = () => {if (!root.hidden && !root.contains(doc.activeElement)) shell.focus({preventScroll: true});};

  let mode: View = 'home', direction: Direction = 'acgn', themeId: string | undefined, kind: CardKind = 'item', opener: HTMLElement | null = null;
  let castAbort: AbortController | undefined, compileAbort: AbortController | undefined, overviewAbort: AbortController | undefined, drawing = false;
  let compileSteps: string[] = [], compileError = '', toastTimer: ReturnType<typeof setTimeout> | undefined, layer: HTMLElement | undefined, layerSheet = false, stageCleanup: (() => void) | undefined;
  const spread0 = gacha.spread(); if (spread0) {direction = spread0.direction; themeId = spread0.themeId;}
  let art: GachaArt = {}, entering = false;
  const setVar = (k: string, v: string) => {if (v) root.style.setProperty(k, v); else root.style.removeProperty(k);};
  /** 每次打开时重新读取宿主的美术与大厅主题（外观、主题可能在两次打开之间换过）。 */
  function applyArt() {
    let theme: unknown;
    try {theme = typeof options.theme === 'function' ? options.theme() : options.theme;} catch {theme = undefined;}
    root.dataset.theme = panelTheme(theme);
    let next: GachaArt | undefined;
    try {next = typeof options.art === 'function' ? options.art() : options.art;} catch {next = undefined;}
    art = next && typeof next === 'object' ? next : {};
    setVar('--gc-title', cssImage(art.title)); setVar('--gc-figure', cssImage(art.figure)); setVar('--gc-host', cssImage(art.figure));
    setVar('--gc-stage', cssImage(art.backdrop ?? art.title));
    setVar('--gc-chibi', cssImage(art.chibi?.idle)); setVar('--gc-chibi-cheer', cssImage(art.chibi?.cheer ?? art.chibi?.idle));
  }
  const hasChibi = () => !!cssImage(art.chibi?.idle ?? art.chibi?.cheer);

  function toast(text: string, bad = false) {
    toastBox.textContent = text; toastBox.classList.toggle('is-bad', bad); toastBox.hidden = false;
    if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => {toastBox.hidden = true;}, bad ? 7000 : 4500);
  }
  const message = (e: unknown) => String((e as Error)?.message ?? e);
  function renderHead() {
    const w = gacha.wallet(), pity = gacha.pity(), left = Math.max(1, gacha.rules.hardPity6 - pity.since6);
    walletChip.hidden = gacha.mode !== 'host';
    walletChip.replaceChildren(el('span', '', '命运点'), el('b', '', w.fp === null ? '—' : fmt(w.fp)));
    pityChip.replaceChildren(el('span', '', '大保底'), el('b', '', String(left)), el('span', '', '抽内'));
    pityChip.title = `大保底：已经 ${pity.since6} 抽没有 6★，${left} 抽内必出 6★；小保底：${Math.max(1, gacha.rules.pity5 - pity.since5)} 抽内必出 5★ 以上`;
    recycleButton.hidden = !gacha.canRecycle();
    keepFocus();
  }
  const costText = (n: number) => gacha.mode === 'host' ? (n ? `${fmt(n)} 命运点` : '免费') : '演示不扣点';
  /** 花命运点数或移出背包的按钮点两次才生效：第一次变成“再点一次确认”，4 秒内再点才执行。 */
  function confirmButton(label: string, note: string, armedNote: string, act: () => void, cls: string, disabled = false, armed = true) {
    const b = button('', () => {
      if (!armed || b.classList.contains('is-armed')) {if (timer) clearTimeout(timer); timer = undefined; b.classList.remove('is-armed'); act(); return;}
      b.classList.add('is-armed'); fill(armedNote, '再点一次确认');
      timer = setTimeout(() => {timer = undefined; b.classList.remove('is-armed'); fill(note, label);}, 4000);
    }, cls, disabled);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fill = (small: string, text: string) => {b.replaceChildren(el('span', '', text), ...(small ? [el('small', '', small)] : []));};
    fill(note, label);
    return b;
  }
  function coverEl(w: WorkCard, big = false) {
    const box = el('div', 'gc-work-cover');
    const ph = () => {const p = el('div', 'gc-ph'); p.style.setProperty('--h', String(hue(w.title))); p.append(el('i'), el('b', '', workTitle(w)), el('small', '', w.year ? String(w.year) : '')); return p;};
    const src = big ? w.cover ?? w.thumb : w.thumb ?? w.cover;
    if (src) {const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.draggable = false; img.onerror = () => {img.remove(); box.prepend(ph());}; img.src = src; box.append(img);}
    else box.append(ph());
    return box;
  }
  const workTitle = (w: WorkCard) => gacha.overviewOf(w.key)?.zh ?? w.title;
  const workOverview = (w: WorkCard) => gacha.overviewOf(w.key)?.overview ?? w.overview ?? '';

  /* ---------- 择海 ---------- */
  function renderHome() {
    mode = 'home'; sub.textContent = '从书海里捞起一部作品，再从书页里抽出物品与命运';
    const figure = !cssImage(art.title) && !!cssImage(art.figure), hero = el('div', 'gc-hero' + (figure ? ' has-fig' : ''));
    if (figure) {const ring = el('div', 'gc-hero-ring'); ring.innerHTML = RUNE_RING_SVG; ring.setAttribute('aria-hidden', 'true'); const fig = el('div', 'gc-hero-fig' + (entering ? ' is-enter' : '')); fig.setAttribute('aria-hidden', 'true'); hero.append(ring, fig);}
    entering = false;
    hero.append(el('h3', '', '把网撒进书海'), el('p', '', '先选文学或 ACGN，再选一个主题：书海会从多个公开资料库里随机捞起五十四部作品，这是你的大池。挑一部作为小池，夜梦会依据它的资料编纂出物品与命运，供你抽取。'));
    if (gacha.mode === 'host') {
      const prices = el('div', 'gc-prices'), price = (k: string, n: number) => {const x = el('span'); x.append(doc.createTextNode(k + ' '), el('b', '', n ? fmt(n) : '免费')); return x;};
      prices.append(price('换大池', gacha.castCost()), price('单抽', gacha.cost(1)), price('十连', gacha.cost(10)));
      if (gacha.canRecycle()) prices.append(el('span', '', '用不上的可按品质回收'));
      hero.append(prices);
    }
    const dirs = el('div', 'gc-dirs');
    for (const id of ['literature', 'acgn'] as const) {
      const d = gacha.directions[id], b = el('button', 'gc-dir'); b.type = 'button'; b.setAttribute('aria-pressed', String(direction === id));
      b.append(el('strong', '', d.name), el('span', '', d.blurb));
      b.onclick = () => {if (direction !== id) {direction = id; themeId = undefined;} renderHome();};
      dirs.append(b);
    }
    const themes = el('div', 'gc-themes'), list = gacha.themes(direction);
    themes.setAttribute('role', 'group'); themes.setAttribute('aria-label', '主题');
    for (const t of list) {
      const b = el('button', 'gc-theme' + (t.custom ? ' is-custom' : '')); b.type = 'button'; b.setAttribute('aria-pressed', String(themeId === t.id));
      b.append(el('b', '', t.name), el('small', '', t.blurb)); b.onclick = () => {themeId = t.id; renderHome();};
      themes.append(b);
    }
    const addTheme = el('button', 'gc-theme is-custom'); addTheme.type = 'button'; addTheme.append(el('b', '', '＋ 自定义'), el('small', '', '用自己的关键词')); addTheme.onclick = () => openSettings('themes');
    themes.append(addTheme);
    const theme = list.find(t => t.id === themeId), actions = el('div', 'gc-actions'), pay = gacha.canCast();
    actions.append(castButton('撒网 · 捞起 54 部', 'gc-btn is-primary', !theme || !pay.ok));
    const sp = gacha.spread();
    if (sp) actions.append(button(`回到上一片书海（${sp.themeName} · ${sp.works.length} 部）`, () => {direction = sp.direction; themeId = sp.themeId; renderSpread(false);}, 'gc-btn'));
    const picked = gacha.picked(), pp = picked ? gacha.pool(picked) : undefined;
    if (pp) actions.append(button(`继续抽《${pp.work.title}》`, () => renderPool(), 'gc-btn'));
    const blocks: HTMLElement[] = [hero, el('h3', 'gc-h3', '方向'), dirs, el('h3', 'gc-h3', '主题'), themes, actions];
    if (!pay.ok) blocks.push(el('p', 'gc-note is-bad', pay.reason ?? '现在不能换大池'));
    else if (sp && gacha.mode === 'host' && pay.cost) blocks.push(el('p', 'gc-note', `再撒一网会换掉现在这片书海（${sp.themeName} · ${sp.works.length} 部），扣 ${fmt(pay.cost)} 命运点；一部也没捞到时不扣点。`));
    if (theme) blocks.push(sourcesLine(theme));
    view.replaceChildren(...blocks); view.scrollTop = 0; renderHead();
  }
  function sourcesLine(theme: GachaTheme) {
    const box = el('div', 'gc-srcs'), on = gacha.settings().sources;
    box.append(el('span', 'gc-note', '这一网会询问：'));
    for (const id of themeSources(theme)) {const s = SOURCE_BY_ID[id]; if (!s) continue; const chip = el('span', 'gc-src' + (on[id] ? '' : ' is-off'), s.name); chip.title = on[id] ? s.note : s.name + '（已在设置里关闭）'; box.append(chip);}
    return box;
  }
  /** 换大池按钮：宿主模式要花命运点，点两次才撒网。 */
  function castButton(label: string, cls: string, disabled: boolean) {
    const cost = gacha.castCost();
    return confirmButton(label, costText(cost), `扣 ${fmt(cost)} 命运点`, () => void startCast(), cls, disabled, gacha.mode === 'host' && cost > 0);
  }
  /* ---------- 撒网 ---------- */
  async function startCast() {
    const theme = gacha.themes().find(t => t.id === themeId); if (!theme || castAbort) return;
    castAbort = new AbortController();
    const overlay = el('div', 'gc-cast'), sea = el('div', 'gc-sea'); sea.append(el('i'), el('i'), el('i'), el('b'));
    const reports = el('ul', 'gc-reports'), rows = new Map<string, HTMLElement>();
    for (const id of themeSources(theme).filter(id => gacha.settings().sources[id])) {const li = el('li', 'is-wait'); li.append(el('span', '', SOURCE_BY_ID[id]!.name), el('b', '', '……')); rows.set(id, li); reports.append(li);}
    const cancel = button('取消', () => castAbort?.abort(), 'gc-btn is-small');
    overlay.append(sea, el('h3', '', `正在${theme.name}的书海里撒网`), reports, cancel); overlay.setAttribute('role', 'status');
    body.append(overlay); cancel.focus({preventScroll: true});
    const onReport = (r: SourceReport) => {const li = rows.get(r.source); if (!li) return; li.className = r.error ? 'is-bad' : 'is-ok'; li.lastElementChild!.textContent = r.error ? '没捞到' : `${r.count} 部`; if (r.error) li.title = r.error;};
    try {
      await gacha.cast(theme.id, {onReport, signal: castAbort.signal});
      overlay.remove(); renderSpread(true); options.onChange?.();
      const bad = gacha.spread()!.reports.filter(r => r.error), cost = gacha.castCost();
      const paid = gacha.mode === 'host' && cost ? `换了大池，扣 ${fmt(cost)} 命运点。` : '';
      if (bad.length) toast(`${paid}${bad.map(r => r.name).join('、')} 这次没有回应（${bad[0]!.error}）。其余资料库照常。`);
      else if (paid) toast(paid + '挑一部作为小池吧。');
    } catch (e) {
      overlay.remove();
      if (!castAbort?.signal.aborted) toast(message(e), true);
    } finally {castAbort = undefined;}
  }
  /* ---------- 54 部 ---------- */
  function renderSpread(deal: boolean) {
    const sp = gacha.spread(); if (!sp) {renderHome(); return;}
    mode = 'spread'; sub.textContent = `${gacha.directions[sp.direction].name} · ${sp.themeName} · ${sp.works.length} 部`;
    const bar = el('div', 'gc-bar');
    bar.append(button('‹ 换主题', () => renderHome(), 'gc-back'), el('span', 'gc-grow', `${sp.themeName}的书海 · 捞起 ${sp.works.length} 部`));
    const missing = sp.works.filter(w => !workOverview(w) || !/[㐀-鿿]/.test(workOverview(w)));
    if (missing.length && gacha.llmReady()) bar.append(button(overviewAbort ? '正在补写……' : `补全中文览概（${missing.length}）`, () => void fillOverviews(), 'gc-btn is-small', !!overviewAbort));
    direction = sp.direction; themeId = sp.themeId;
    const again = castButton('换大池', 'gc-btn is-small', !gacha.canCast().ok || !gacha.themes().some(t => t.id === sp.themeId));
    again.title = gacha.themes().some(t => t.id === sp.themeId) ? `在${sp.themeName}的书海里再撒一网，换掉这 ${sp.works.length} 部` : '这个主题已经删除：回到首页换一个主题再撒网';
    bar.append(again);
    const grid = el('div', 'gc-grid' + (deal && !reduced(win) ? ' is-dealing' : ''));
    sp.works.forEach((w, i) => {
      const card = el('button', 'gc-work'); card.type = 'button'; card.style.setProperty('--i', String(i));
      card.style.setProperty('--dx', `${Math.round((4 - (i % 9)) * 40)}px`); card.style.setProperty('--dy', `${260 + Math.floor(i / 9) * 30}px`); card.style.setProperty('--rot', `${(i % 7) * 6 - 18}deg`);
      const cover = coverEl(w); cover.append(el('span', 'gc-work-media', MEDIA_LABEL[w.media]));
      const t = workTitle(w), meta = [w.year, w.creators?.[0]].filter(Boolean).join(' · ');
      card.append(cover, el('span', 'gc-work-title', t), el('span', 'gc-work-meta', meta || SOURCE_BY_ID[w.source]?.name || ''));
      card.setAttribute('aria-label', `${t}，${MEDIA_LABEL[w.media]}${w.year ? '，' + w.year : ''}`);
      card.title = workOverview(w) || t;
      card.onclick = () => openDetail(w);
      grid.append(card);
    });
    if (grid.classList.contains('is-dealing')) setTimeout(() => grid.classList.remove('is-dealing'), sp.works.length * 22 + 1200);
    view.replaceChildren(bar, grid); if (deal) view.scrollTop = 0; renderHead();
  }
  async function fillOverviews() {
    if (overviewAbort) return; overviewAbort = new AbortController(); renderSpread(false);
    try {const n = await gacha.overview(undefined, {signal: overviewAbort.signal}); toast(n ? `补写了 ${n} 句中文览概。` : '没有需要补写的作品。');}
    catch (e) {if (!overviewAbort.signal.aborted) toast('览概没能补写：' + message(e), true);}
    finally {overviewAbort = undefined; if (mode === 'spread') renderSpread(false);}
  }
  /* ---------- 作品详情 ---------- */
  function closeLayer() {layer?.remove(); layer = undefined; layerSheet = false; keepFocus();}
  function dismissLayer() {const wasSheet = layerSheet; closeLayer(); if (wasSheet) rerender();}
  function openDetail(w: WorkCard) {
    closeLayer();
    const drawer = el('div', 'gc-drawer'), card = el('div', 'gc-drawer-card'), inner = el('div', 'gc-drawer-body'), foot = el('div', 'gc-drawer-foot');
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-label', workTitle(w));
    const top = el('div', 'gc-detail-top'), info = el('div');
    info.append(el('h3', '', workTitle(w)));
    const alt = [w.title !== workTitle(w) ? w.title : '', w.original, w.english].filter((x, i, a) => x && a.indexOf(x) === i && x !== workTitle(w));
    if (alt.length) info.append(el('p', '', alt.join(' / ')));
    info.append(el('p', '', [MEDIA_LABEL[w.media], w.year, w.creators?.join('、')].filter(Boolean).join(' · ')));
    if (w.score) info.append(el('p', '', `评分 ${Math.round(w.score * 10) / 10} · 来自 ${SOURCE_BY_ID[w.source]?.name ?? w.source}`));
    if (w.tags?.length) {const tags = el('div', 'gc-tags'); for (const t of w.tags.slice(0, 10)) tags.append(el('span', '', t)); info.append(tags);}
    top.append(coverEl(w, true), info);
    inner.append(top);
    const ov = workOverview(w);
    if (ov) {inner.append(el('h3', 'gc-h3', '览概'), el('p', 'gc-text', ov));}
    if (w.summary && w.summary !== ov) inner.append(el('h3', 'gc-h3', w.summaryLang === 'zh' ? '简介' : '简介（原文）'), el('p', 'gc-text', w.summary));
    if (!ov && !w.summary) inner.append(el('p', 'gc-note', '资料库里没有这部作品的简介。'));
    if (w.url) {const a = el('a', 'gc-link', '在 ' + (SOURCE_BY_ID[w.source]?.name ?? '资料库') + ' 查看 ↗'); a.href = w.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; inner.append(a);}
    const cached = gacha.pool(w.key);
    foot.append(button(cached ? '去抽这部的小池' : '选为小池', () => {closeLayer(); void choose(w);}, 'gc-btn is-primary'));
    if (!ov && gacha.llmReady()) foot.append(button('补一句中文览概', async () => {
      try {await gacha.overview([w.key]); openDetail(w);} catch (e) {toast('览概没能补写：' + message(e), true);}
    }, 'gc-btn'));
    foot.append(button('关闭', () => closeLayer(), 'gc-btn'));
    card.append(inner, foot); drawer.append(card); drawer.addEventListener('click', e => {if (e.target === drawer) closeLayer();});
    body.append(drawer); layer = drawer;
    foot.querySelector<HTMLElement>('button')?.focus({preventScroll: true});
  }
  /* ---------- 小池 ---------- */
  async function choose(w: WorkCard) {
    gacha.pick(w.key);
    if (gacha.pool(w.key)) {renderPool(); return;}
    await compile(w);
  }
  async function compile(w: WorkCard) {
    if (compileAbort) return;
    compileAbort = new AbortController(); compileSteps = []; compileError = '';
    gacha.pick(w.key); renderPool();
    try {
      await gacha.compile(w, {signal: compileAbort.signal, onStep: s => {compileSteps.push(s); if (mode === 'pool') renderPool();}});
      const p = gacha.pool(w.key);
      if (p?.by === 'offline') toast(gacha.llmReady() ? '模型这次没能编纂，先用资料直出了一份小池；可以稍后“重新编纂”。' : gacha.mode === 'host' ? '当前酒馆助手不能独立生成，先用资料直出了一份小池；更新酒馆助手后可重新编纂。' : '没有可用的模型，先用资料直出了一份小池。在设置里填写接口后可重新编纂。');
    } catch (e) {compileError = compileAbort.signal.aborted ? '已取消编纂。' : message(e);}
    finally {compileAbort = undefined; if (mode === 'pool') renderPool();}
  }
  function mini(c: GachaCard, scale = gacha.scale()) {
    const m = el('div', 'gc-mini s' + c.star), emblem = el('span', 'gc-mini-emblem'), text = el('div', 'gc-mini-text');
    emblem.innerHTML = KIND_EMBLEM[c.kind];
    text.append(el('small', '', `${starText(c.star)} ${scale.id === 'destined' ? scale.label(c.star) : ''}`.trim()), el('b', '', c.name), el('p', '', c.description));
    m.append(emblem, text);
    m.title = [c.description, c.use ?? c.hook ?? ''].filter(Boolean).join('\n');
    return m;
  }
  function renderPool() {
    const key = gacha.picked(), pool = key ? gacha.pool(key) : undefined, w = pool?.work ?? gacha.spread()?.works.find(x => x.key === key);
    if (!w) {renderHome(); return;}
    mode = 'pool'; sub.textContent = `小池 · 《${w.title}》`;
    const headRow = el('div', 'gc-pool-head'), workBox = el('div', 'gc-pool-work'), wtext = el('div');
    wtext.append(el('b', '', w.title), el('small', '', [MEDIA_LABEL[w.media], w.year, pool ? (pool.by === 'model' ? '夜梦编纂' : '资料直出') + (pool.sources.length ? ' · 资料：' + pool.sources.join('、') : '') : ''].filter(Boolean).join(' · ')));
    workBox.append(coverEl(w), wtext);
    headRow.append(button(gacha.spread() ? '‹ 54 部' : '‹ 择海', () => {compileAbort?.abort(); gacha.spread() ? renderSpread(false) : renderHome();}, 'gc-back'), workBox);
    if (pool && !compileAbort) headRow.append(button('重新编纂', () => void compile(w), 'gc-btn is-small'));
    const blocks: HTMLElement[] = [headRow];
    if (compileAbort || !pool) {
      const box = el('div', 'gc-compile'), steps = el('ol', 'gc-steps');
      const all = compileSteps.length ? compileSteps : ['正在翻阅原始条目'];
      all.forEach((s, i) => steps.append(el('li', i === all.length - 1 && compileAbort ? 'is-now' : 'is-done', s)));
      if (compileAbort) {
        const sea = el('div', 'gc-sea'); sea.append(el('i'), el('i'), el('i'), el('b'));
        box.append(sea, el('h3', '', `夜梦正在翻阅《${workTitle(w)}》`), steps, button('取消编纂', () => compileAbort?.abort(), 'gc-btn is-small'));
      } else {
        box.append(el('h3', '', `为《${workTitle(w)}》编纂小池`), el('p', 'gc-note', '查阅资料库与维基百科里的条目，再由夜梦写成物品与命运各 18 张。'));
        if (compileSteps.length) box.append(steps);
        if (compileError) box.append(el('p', 'gc-note is-bad', compileError));
        box.append(button('编纂小池', () => void compile(w), 'gc-btn is-primary'));
      }
      blocks.push(box);
      view.replaceChildren(...blocks); renderHead(); return;
    }
    const tabs = el('div', 'gc-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '卡池');
    for (const k of ['item', 'fate'] as const) {
      const t = el('button', 'gc-tab', KIND_LABEL[k] + '池'); t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(kind === k));
      t.onclick = () => {kind = k; renderPool();}; tabs.append(t);
    }
    const list = kind === 'fate' ? pool.fates : pool.items, banner = el('div', 'gc-banner'), bg = el('div', 'gc-banner-bg');
    if (w.cover ?? w.thumb) bg.style.backgroundImage = `url("${String(w.cover ?? w.thumb).replace(/"/g, '%22')}")`;
    const left = el('div'), feature = el('div', 'gc-feature');
    left.append(el('h3', 'gc-h3', kind === 'fate' ? '本池命运 · 精选' : '本池物品 · 精选'));
    for (const c of list.filter(c => c.star >= 5).slice(0, 3)) feature.append(mini(c));
    left.append(feature);
    if (pool.protagonist) left.append(el('p', 'gc-note', `主角：${pool.protagonist}`));
    const side = el('div', 'gc-side'), rates = el('div', 'gc-rates'), pity = gacha.pity(), rules = gacha.rules;
    for (const line of ratesText(rules, gacha.scale())) rates.append(el('p', '', line));
    /** 大保底（6★）与小保底（5★ 以上）各一条进度。 */
    const meterRow = (name: string, since: number, max: number, goal: string, small: boolean, soft?: number) => {
      const row = el('div', 'gc-pity-row' + (small ? ' is-small' : '')), head = el('div', 'gc-pity-head'), track = el('div', 'gc-pity-bar'), bar = el('i');
      bar.style.width = `${Math.min(100, since / max * 100).toFixed(1)}%`; track.append(bar);
      if (soft) {const mark = el('em'); mark.style.left = `${((soft - 1) / max * 100).toFixed(1)}%`; mark.title = `第 ${soft} 抽起 6★ 概率逐抽提高`; track.append(mark);}
      track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', name + '进度'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(max)); track.setAttribute('aria-valuenow', String(since));
      head.append(el('em', '', name), el('b', '', String(Math.max(1, max - since))), el('span', '', goal));
      row.append(head, track); return row;
    };
    const meter = el('div', 'gc-pity');
    meter.append(meterRow('大保底', pity.since6, rules.hardPity6, '抽内必出 6★', false, rules.softPity6From), meterRow('小保底', pity.since5, rules.pity5, '抽内必出 5★ 以上', true),
      el('small', '', `已经 ${pity.since6} 抽没有 6★、${pity.since5} 抽没有 5★ 以上 · 物品池与命运池共用保底`));
    const draws = el('div', 'gc-draws'), one = gacha.canDraw(1), ten = gacha.canDraw(10);
    const b1 = button('', () => void startDraw(pool, 1), 'gc-btn', !one.ok || drawing), b10 = button('', () => void startDraw(pool, 10), 'gc-btn is-primary', !ten.ok || drawing);
    b1.append(el('span', '', '单抽'), el('small', '', costText(one.cost))); b10.append(el('span', '', '十连'), el('small', '', costText(ten.cost)));
    if (!one.ok) b1.title = one.reason ?? ''; if (!ten.ok) b10.title = ten.reason ?? '';
    draws.append(b1, b10);
    side.append(meter, draws, rates);
    const reason = !one.ok ? one.reason : !ten.ok ? ten.reason : '';
    if (reason) side.append(el('p', 'gc-note is-bad', reason));
    else if (gacha.mode === 'host') side.append(el('p', 'gc-note', gacha.settings().autoBag ? '抽到的物品与命运会放进主角背包，按命定之诗的品质记入。' : '抽到的结果只记在抽卡记录里（设置里可改为放进背包）。'));
    banner.append(bg, left, side);
    blocks.push(tabs, banner);
    const all = el('details', 'gc-list'), grid = el('div', 'gc-list-grid');
    all.append(el('summary', '', `池内一览（${KIND_LABEL[kind]} ${list.length} 张）`));
    for (const s of [...STARS].reverse()) for (const c of list.filter(c => c.star === s)) grid.append(mini(c));
    all.append(grid); blocks.push(all);
    view.replaceChildren(...blocks); renderHead();
  }
  /* ---------- 抽卡 ---------- */
  async function startDraw(pool: SmallPool, count: 1 | 10) {
    if (drawing) return; drawing = true; renderPool();
    let outcome: DrawOutcome | undefined;
    try {outcome = await gacha.draw(pool.workKey, kind, count);}
    catch (e) {toast(message(e), true);}
    finally {drawing = false;}
    if (!outcome) {renderPool(); return;}
    options.onChange?.();
    play(outcome, pool);
  }
  const STAR_COLOR: Record<Star, string> = {1: '#cfc8b8', 2: '#8fd19b', 3: '#7cb6f2', 4: '#c39cf2', 5: '#f5cb68', 6: '#ff7b72'};
  /** 抽卡演出：书本入场 → 蓄光（光点被吸进书页）→ 翻开（光柱、冲击环、闪光，颜色透露这一抽的最高星级）→ 卡牌沿弧线飞出 → 逐张翻开（4★ 以上有光环与碎光，6★ 有全屏“神话”）。 */
  function play(outcome: DrawOutcome, pool: SmallPool) {
    stageCleanup?.(); toastBox.hidden = true;
    type Slot = {card: HTMLButtonElement; c: GachaCard; open: boolean};
    const motion = !reduced(win), count = outcome.cards.length, max = Math.max(...outcome.stars) as Star, scale = gacha.scale();
    const timers: ReturnType<typeof setTimeout>[] = [], later = (ms: number, fn: () => void) => {timers.push(setTimeout(fn, ms));};
    const quality = (s: Star) => scale.id === 'destined' ? scale.label(s) : s + '★';
    const stage = el('div', 'gc-stage' + (max >= 6 ? ' is-mythic' : '')), ring = el('div', 'gc-stage-ring'), tome = el('div', 'gc-tome'), cover = el('div', 'gc-tome-cover'), face = el('div', 'gc-tome-face');
    ring.innerHTML = RUNE_RING_SVG; face.innerHTML = TOME_COVER_SVG; cover.append(face, el('div', 'gc-tome-inside'));
    tome.append(el('div', 'gc-tome-block'), el('div', 'gc-tome-light'), el('div', 'gc-tome-page p1'), el('div', 'gc-tome-page p2'), el('div', 'gc-tome-page p3'), cover);
    const flash = el('div', 'gc-flash'), sparks = el('div', 'gc-sparks'), splash = el('div', 'gc-splash'), slots = el('div', 'gc-slots' + (count === 1 ? ' is-single' : ''));
    const hint = el('p', 'gc-stage-hint'), sum = el('div', 'gc-stage-sum'), barEl = el('div', 'gc-stage-bar'), skip = button('跳过', () => finish(true), 'gc-btn is-small gc-stage-skip');
    stage.setAttribute('role', 'dialog'); stage.setAttribute('aria-modal', 'true'); stage.setAttribute('aria-label', count > 1 ? '十连抽签' : '单抽'); hint.setAttribute('aria-live', 'polite');
    stage.append(el('div', 'gc-stage-art'), el('div', 'gc-stage-sky'), ring, el('div', 'gc-beam'), tome, el('div', 'gc-shock'), slots, sparks, splash, flash, hint, sum, barEl, skip);
    if (outcome.warning) stage.append(el('p', 'gc-stage-warn', outcome.warning));
    const glow = (s: Star) => stage.style.setProperty('--glow', STAR_COLOR[s]);
    glow(1);
    const label = (x: Slot) => `${x.c.star}星${KIND_LABEL[x.c.kind]}「${x.c.name}」：${x.c.description}`;
    const cards: Slot[] = outcome.cards.map((c, i) => {
      const card = el('button', 'gc-card s' + c.star) as HTMLButtonElement; card.type = 'button'; card.style.setProperty('--i', String(i));
      card.setAttribute('aria-label', `第 ${i + 1} 张，点击翻开`);
      const inner = el('div', 'gc-card-inner'), back = el('div', 'gc-face gc-cardback'), front = el('div', 'gc-face gc-front'), top = el('div', 'gc-front-top'), emblem = el('div', 'gc-emblem');
      back.innerHTML = CARD_BACK_SVG; emblem.innerHTML = KIND_EMBLEM[c.kind];
      top.append(el('span', 'gc-stars', starText(c.star)), el('span', 'gc-quality', quality(c.star)));
      front.append(top, emblem, el('span', 'gc-kind', KIND_LABEL[c.kind] + (c.type ? ' · ' + c.type : c.chapter ? ' · ' + c.chapter : '')), el('b', '', c.name), el('p', '', c.description), el('small', '', `《${pool.work.title}》${c.owner ? ' · ' + c.owner : ''}`));
      if (c.star >= 6) {back.append(el('i', 'gc-foil')); front.append(el('i', 'gc-foil'));}
      inner.append(back, front); card.append(el('i', 'gc-card-ring'), inner);
      const slot: Slot = {card, c, open: false};
      card.onclick = () => flip(slot);
      slots.append(card); return slot;
    });
    const center = (node?: HTMLElement) => {const s = stage.getBoundingClientRect(), r = (node ?? stage).getBoundingClientRect(); return [r.left - s.left + r.width / 2, r.top - s.top + r.height / 2] as const;};
    /** 碎光：从 (x,y) 向外飞散；inward 时从外圈被吸向 (x,y)。 */
    function burst(at: readonly [number, number], color: string, n: number, spread: number, inward = false) {
      if (!motion) return;
      for (let i = 0; i < n; i++) {
        const s = el('i', 'gc-spark' + (inward ? ' is-in' : '') + (i % 3 === 0 ? ' is-star' : ''));
        const d = spread * (.35 + Math.random() * .8), size = (i % 3 === 0 ? 7 : 3) + Math.random() * (inward ? 4 : 7), t = (inward ? 760 : 680) + Math.random() * 640, dl = Math.random() * (inward ? 620 : 140);
        s.style.cssText = `--x:${at[0].toFixed(0)}px;--y:${at[1].toFixed(0)}px;--a:${(Math.random() * 360).toFixed(0)}deg;--d:${d.toFixed(0)}px;--s:${size.toFixed(1)}px;--t:${t.toFixed(0)}ms;--dl:${dl.toFixed(0)}ms;--sc:${color}`;
        sparks.append(s); later(t + dl + 80, () => s.remove());
      }
    }
    function pulse(strength: number) {flash.style.setProperty('--fl', String(strength)); flash.classList.remove('is-on'); void flash.offsetWidth; flash.classList.add('is-on');}
    let mythicShown = false, done = false;
    function mythic() {
      if (mythicShown || !motion) return; mythicShown = true;
      splash.replaceChildren(doc.createTextNode(quality(6)), el('small', '', '命运在书页之间苏醒'));
      splash.classList.remove('is-on'); void splash.offsetWidth; splash.classList.add('is-on');
      glow(6); pulse(1); stage.classList.add('is-quake'); later(520, () => stage.classList.remove('is-quake'));
    }
    function reveal(x: Slot) {
      x.card.classList.remove('is-held'); x.card.classList.add('is-open'); x.card.setAttribute('aria-label', label(x)); x.card.title = x.c.description;
      if (x.c.star >= 4) {
        burst(center(x.card), STAR_COLOR[x.c.star], x.c.star >= 6 ? 40 : x.c.star >= 5 ? 24 : 12, x.c.star >= 5 ? 180 : 110);
        if (x.c.star === 5) {glow(5); pulse(.45);}
      }
      if (cards.every(y => y.open && y.card.classList.contains('is-open'))) finish(false);
    }
    function flip(x: Slot) {
      if (x.open) return; x.open = true;
      // 第一张 6★：先停一拍——卡牌在原地蓄满虹光、全屏写出“神话”，再翻开。
      if (x.c.star >= 6 && !mythicShown && motion) {x.card.classList.add('is-held'); mythic(); later(950, () => reveal(x)); return;}
      reveal(x);
    }
    function revealAll() {
      let t = 0;
      for (const x of cards.filter(y => !y.open)) {later(t, () => flip(x)); t += x.c.star >= 5 ? 460 : 130;}
    }
    function finish(instant: boolean) {
      if (instant) {for (const t of timers) clearTimeout(t); timers.length = 0;}
      stage.classList.remove('is-charge'); stage.classList.add('is-open', 'is-cards', 'is-done'); glow(max);
      for (const x of cards) {
        if (instant) x.card.style.animation = 'none';
        x.card.classList.remove('is-held');
        if (!x.open || !x.card.classList.contains('is-open')) {x.open = true; x.card.classList.add('is-open'); x.card.setAttribute('aria-label', label(x)); x.card.title = x.c.description;}
      }
      if (instant && max >= 6) mythic();
      if (done) return; done = true;
      if (hasChibi()) {const chibi = el('div', 'gc-stage-chibi' + (max >= 5 ? ' is-cheer' : '')); chibi.setAttribute('aria-hidden', 'true'); stage.append(chibi);}
      skip.hidden = true; hint.textContent = max >= 6 ? `${quality(6)}降临` : max >= 5 ? `${quality(5)}之页` : '书页已经翻开';
      sum.replaceChildren(...[...STARS].reverse().map(s => [s, outcome.stars.filter(v => v === s).length] as const).filter(([, n]) => n).map(([s, n]) => el('span', 's' + s, `${s}★ ${scale.id === 'destined' ? quality(s) + ' ' : ''}×${n}`)));
      const bagged = outcome.record.bagged ? '已放进主角背包' : gacha.mode === 'host' ? '已记入抽签记录' : '';
      barEl.replaceChildren(button(bagged ? `收下（${bagged}）` : '收下', () => closeStage(), 'gc-btn is-primary'), button(count === 10 ? '再来十连' : '再来一次', () => {closeStage(); const p = gacha.pool(pool.workKey); if (p) void startDraw(p, count === 10 ? 10 : 1);}, 'gc-btn'));
      barEl.querySelector<HTMLElement>('button')?.focus({preventScroll: true});
    }
    function closeStage() {
      stageCleanup?.(); renderPool();
      if (!outcome.record.bagged) return;
      const best = [...outcome.cards].sort((a, b) => b.star - a.star).slice(0, 3).map(c => `${c.star}★${c.name}`).join('、');
      toast(count > 1 ? `${count} 张放进了主角背包：${best}${count > 3 ? ' 等' : ''}` : `放进了主角背包：${best}`);
    }
    body.append(stage);
    stageCleanup = () => {for (const t of timers) clearTimeout(t); stage.remove(); stageCleanup = undefined; keepFocus();};
    skip.focus({preventScroll: true});
    if (!motion) {finish(true); return;}
    // 一点击舞台（卡牌出来之前）就直接跳到结果。
    stage.addEventListener('click', e => {if (!stage.classList.contains('is-cards') && e.target !== skip) finish(true);});
    const charge = max >= 5 ? 1750 : 1200;
    hint.textContent = '书页在发光……';
    stage.classList.add('is-charge');
    later(80, () => burst(center(), '#f3dfa8', 26, 230, true));
    if (max >= 5) later(760, () => {glow(4); burst(center(), STAR_COLOR[4], 18, 210, true); hint.textContent = '……光在变强';});
    later(charge, () => {
      stage.classList.remove('is-charge'); glow(max); stage.classList.add('is-open');
      pulse(max >= 6 ? 1 : max >= 5 ? .8 : .5);
      burst(center(), STAR_COLOR[max], max >= 6 ? 52 : max >= 5 ? 36 : 22, max >= 5 ? 320 : 230);
      hint.textContent = max >= 6 ? '……！' : max >= 5 ? '金色的书页！' : '';
      later(720, () => {
        const s = stage.getBoundingClientRect(), cx = s.left + s.width / 2, cy = s.top + s.height / 2;
        for (const x of cards) {const r = x.card.getBoundingClientRect(); x.card.style.setProperty('--fx', `${Math.round(cx - (r.left + r.width / 2))}px`); x.card.style.setProperty('--fy', `${Math.round(cy - (r.top + r.height / 2))}px`);}
        stage.classList.add('is-cards'); hint.textContent = count > 1 ? '点击卡牌翻开' : '点击翻开';
        barEl.replaceChildren(button(count > 1 ? '全部翻开' : '翻开', () => revealAll(), 'gc-btn is-primary'));
        later(count * 75 + 740, () => {if (!done && !stage.contains(doc.activeElement)) cards[0]?.card.focus({preventScroll: true});});
      });
    });
  }
  /* ---------- 记录 ---------- */
  function sheet(titleText: string) {
    closeLayer();
    const box = el('div', 'gc-sheet'), headBox = el('div', 'gc-sheet-head'), inner = el('div', 'gc-view');
    headBox.append(el('h3', '', titleText), button('返回', () => dismissLayer(), 'gc-btn is-small'));
    box.append(headBox, inner); body.append(box); layer = box; layerSheet = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', titleText);
    headBox.querySelector<HTMLElement>('button')?.focus({preventScroll: true});
    return inner;
  }
  function openHistory() {
    const inner = sheet('抽卡记录'), list = el('ul', 'gc-history'), h = gacha.history(), pity = gacha.pity();
    inner.append(el('p', 'gc-note', `累计 ${fmt(pity.total)} 抽 · 已经 ${pity.since6} 抽没有 6★ · ${pity.since5} 抽没有 5★ 以上。${gacha.mode === 'host' ? '保底与记录随这个聊天保存' : '记录存在这台设备'}，最多保留最近 100 次。`));
    if (!h.length) inner.append(el('p', 'gc-note', '还没有抽过。'));
    for (const r of h) {
      const li = el('li'), top = el('div'), t = el('time', '', when(r.at)); t.dateTime = new Date(r.at).toISOString();
      top.append(t, el('b', '', `《${r.work}》`), el('span', '', `${KIND_LABEL[r.kind]}池 · ${r.count === 10 ? '十连' : '单抽'}${r.cost ? ` · ${fmt(r.cost)} 命运点` : ''}${r.bagged ? ' · 已入包' : ''}`));
      const res = el('div', 'gc-res');
      for (const x of [...r.results].sort((a, b) => b.star - a.star)) res.append(el('span', 's' + x.star, `${x.star}★ ${x.name}`));
      li.append(top, res); list.append(li);
    }
    inner.append(list);
  }
  /* ---------- 回收 ---------- */
  /** 按品质回收主角背包里来自命运抽卡的东西：每一档可整档回收，每一件可回收 1 件或全部；都要点两次。 */
  function openRecycle() {
    if (!gacha.canRecycle()) return;
    const inner = sheet('回收');
    let busy = false;
    const pick = (e: BagEntry, count: number): RecyclePick => ({name: e.name, quality: e.quality, count});
    function render() {
      const entries = gacha.bag(), blocked = gacha.wallet().blocked, off = !!blocked || busy, parts: HTMLElement[] = [];
      const prices = el('div', 'gc-prices');
      for (const q of RECYCLE_QUALITIES) {const x = el('span'); x.append(doc.createTextNode(q + ' '), el('b', '', fmt(recyclePrice(q)))); prices.append(x);}
      parts.push(el('p', 'gc-note gc-recycle-note', `把用不上的物品与命运换回命运点数。回收价是与同一层级的角色缔结命定契约基础价的 1/${RECYCLE_DIVISOR}（每件）：`), prices,
        el('p', 'gc-note', '只收命运抽卡抽来的东西；回收后从主角背包移除，不能撤销。'));
      if (blocked) parts.push(el('p', 'gc-note is-bad', blocked));
      if (!entries.length) parts.push(el('p', 'gc-note', '主角背包里还没有命运抽卡抽来的东西。'));
      for (const q of RECYCLE_QUALITIES) {
        const list = entries.filter(e => e.quality === q); if (!list.length) continue;
        const price = recyclePrice(q), count = list.reduce((n, e) => n + e.count, 0), group = el('section', 'gc-rgroup s' + (starOfQuality(q) ?? 1)), headRow = el('div', 'gc-rgroup-head');
        headRow.append(el('b', '', q), el('span', '', `${count} 件 · 每件 ${fmt(price)} 命运点`), confirmButton('回收这一档', `+${fmt(count * price)}`, `移出 ${count} 件 · +${fmt(count * price)}`, () => void run(list.map(e => pick(e, e.count))), 'gc-btn is-small', off));
        const items = el('ul', 'gc-ritems');
        for (const e of list) {
          const li = el('li'), info = el('div');
          info.append(el('b', '', e.name), el('small', '', [e.kind === 'fate' ? '命运' : e.type || '物品', e.work ? `《${e.work}》` : ''].filter(Boolean).join(' · ')));
          li.append(info, el('em', '', `×${e.count}`));
          if (e.count > 1) li.append(confirmButton('回收 1 件', `+${fmt(e.price)}`, `+${fmt(e.price)}`, () => void run([pick(e, 1)]), 'gc-btn is-small', off));
          li.append(confirmButton(e.count > 1 ? '全部回收' : '回收', `+${fmt(e.count * e.price)}`, `+${fmt(e.count * e.price)}`, () => void run([pick(e, e.count)]), 'gc-btn is-small', off));
          items.append(li);
        }
        group.append(headRow, items); parts.push(group);
      }
      inner.replaceChildren(...parts);
    }
    async function run(picks: RecyclePick[]) {
      if (busy) return; busy = true; render();
      try {const r = await gacha.recycle(picks); options.onChange?.(); toast(`回收了 ${r.removed} 件，命运点 +${fmt(r.gained)}${r.fp === null ? '' : `（现有 ${fmt(r.fp)}）`}。`);}
      catch (e) {toast(message(e), true);}
      finally {busy = false; if (inner.isConnected) render(); keepFocus();}
    }
    render();
  }
  /* ---------- 设置 ---------- */
  function openSettings(focus?: 'themes') {
    const inner = sheet('抽卡设置'), form = el('div', 'gc-form'), draft = JSON.parse(JSON.stringify(gacha.settings())) as GachaSettings;
    const sec = (heading: string) => {const s = el('section'); s.append(el('h3', 'gc-h3', heading)); form.append(s); return s;};
    const check = (parent: HTMLElement, label: string, note: string, value: boolean, set: (v: boolean) => void) => {
      const l = el('label', 'gc-check'), input = doc.createElement('input'), t = el('span', '', label); input.type = 'checkbox'; input.checked = value; input.onchange = () => set(input.checked);
      if (note) t.append(el('small', '', note)); l.append(input, t); parent.append(l); return input;
    };
    const field = (parent: HTMLElement, label: string, value: string, set: (v: string) => void, type = 'text', placeholder = '') => {
      const row = el('div', 'gc-row'), l = el('label', '', label), input = doc.createElement('input'); input.type = type; input.value = value; input.placeholder = placeholder; input.autocomplete = 'off'; input.spellcheck = false;
      const id = 'gc-' + Math.random().toString(36).slice(2, 8); input.id = id; l.htmlFor = id; input.oninput = () => set(input.value.trim());
      row.append(l, input); parent.append(row); return input;
    };
    if (gacha.mode === 'host') {
      const cost = sec('花费与入包');
      cost.append(el('p', 'gc-note', `换大池 ${fmt(gacha.castCost())} 命运点（捞到作品之后才扣）· 小池单抽 ${fmt(gacha.cost(1))} · 十连 ${fmt(gacha.cost(10))}。书海的旅程进行中不能花费命运点数。`));
      check(cost, '抽到的物品与命运放进主角背包', '物品按它的类型放入；命运是一页“命运”，在正文里翻开就会降临。关闭后只记在抽卡记录里，照样扣点。', draft.autoBag, v => {draft.autoBag = v;});
    }
    const look = sec('显示');
    const row = el('div', 'gc-row'), sel = doc.createElement('select'), lab = el('label', '', '品质名');
    for (const [v, t] of [['destined', '命定之诗（普通～神话）'], ['stars', '只显示星级']] as const) {const o = doc.createElement('option'); o.value = v; o.textContent = t; sel.append(o);}
    sel.value = draft.scale; sel.id = 'gc-scale'; lab.htmlFor = 'gc-scale'; sel.onchange = () => {draft.scale = sel.value === 'stars' ? 'stars' : 'destined';}; row.append(lab, sel); look.append(row);
    check(look, '包含成人向作品', '默认排除 Bangumi / AniList 的 R18 条目与 VNDB 含性内容标签的作品。', draft.nsfw, v => {draft.nsfw = v;});
    const src = sec('资料库');
    for (const s of SOURCES) check(src, `${s.name}（${s.direction === 'literature' ? '文学' : 'ACGN'}）`, s.note, draft.sources[s.id], v => {draft.sources[s.id] = v;});
    field(src, 'Google Books 密钥', draft.googleKey, v => {draft.googleKey = v;}, 'password', '可不填');
    check(src, '跨域被拦时经酒馆代理重试', '需要在酒馆 config.yaml 里开启 enableCorsProxy；没开也没关系，直连能用的资料库照常。', draft.proxy, v => {draft.proxy = v;});
    check(src, '编纂小池时查找 Fandom 设定页', '按英文标题猜对应的 Fandom 站点，找不到就跳过。', draft.fandom, v => {draft.fandom = v;});
    src.append(el('p', 'gc-note', '所有请求都从这台设备的浏览器直接发往这些公开资料库，不会带上聊天或角色内容。'));
    const themes = sec('自定义主题');
    const listBox = el('div');
    const renderThemes = () => {
      listBox.replaceChildren();
      const mine = gacha.settings().themes;
      if (!mine.length) listBox.append(el('p', 'gc-note', '还没有自定义主题。'));
      for (const t of mine) {const r = el('div', 'gc-row'); r.append(el('span', '', `${gacha.directions[t.direction].name} · ${t.name}（${t.blurb}）`), button('删除', () => {gacha.removeTheme(t.id); if (themeId === t.id) themeId = undefined; renderThemes();}, 'gc-btn is-small')); listBox.append(r);}
    };
    renderThemes(); themes.append(listBox);
    const add = {name: '', direction: direction as Direction, zh: '', en: ''};
    const nameInput = field(themes, '名称', '', v => {add.name = v;}, 'text', '例如：赛博侦探');
    const drow = el('div', 'gc-row'), dsel = doc.createElement('select'), dlab = el('label', '', '方向');
    for (const [v, t] of [['acgn', 'ACGN'], ['literature', '文学']] as const) {const o = doc.createElement('option'); o.value = v; o.textContent = t; dsel.append(o);}
    dsel.value = add.direction; dsel.id = 'gc-add-dir'; dlab.htmlFor = 'gc-add-dir'; dsel.onchange = () => {add.direction = dsel.value === 'literature' ? 'literature' : 'acgn';}; drow.append(dlab, dsel); themes.append(drow);
    field(themes, '中文标签', '', v => {add.zh = v;}, 'text', 'Bangumi 标签，如：侦探');
    field(themes, '英文关键词', '', v => {add.en = v;}, 'text', '如：detective（用于 Open Library / AniList / VNDB）');
    themes.append(el('p', 'gc-note', '主题添加、删除后立即生效。'), button('添加主题', () => {const t = gacha.addTheme(add); if (!t) {toast('名称，以及中文标签或英文关键词至少填一个。', true); return;} direction = t.direction; themeId = t.id; renderThemes(); toast(`已添加主题「${t.name}」，回到首页即可撒网。`);}, 'gc-btn is-small'));
    if (gacha.mode === 'local') {
      const api = sec('模型接口（本机演示）');
      api.append(el('p', 'gc-note', '从读者大厅打开时会自动使用酒馆的连接（或读者“独立API”里的「命运抽卡」）。本机演示需要自己填一个 OpenAI 兼容接口才能让夜梦编纂小池；不填时用资料直出。密钥只存在这台设备。'));
      check(api, '启用', '', draft.api.enabled, v => {draft.api.enabled = v;});
      field(api, '地址', draft.api.url, v => {draft.api.url = v;}, 'url', 'https://…/v1');
      field(api, '模型', draft.api.model, v => {draft.api.model = v;});
      field(api, '密钥', draft.api.key, v => {draft.api.key = v;}, 'password');
    }
    const cache = sec('缓存');
    cache.append(el('p', 'gc-note', '54 部作品、小池与览概缓存在这台设备；清空后需要重新撒网与编纂。保底与抽签记录不受影响。'));
    cache.append(button('清空本机缓存', () => {gacha.clearCache(); toast('已清空本机缓存。');}, 'gc-btn is-small'));
    const foot = el('div', 'gc-actions'); foot.append(button('保存设置', () => {gacha.saveSettings({...draft, themes: gacha.settings().themes}); closeLayer(); toast('设置已保存到这台设备。'); rerender();}, 'gc-btn is-primary'), button('不保存，返回', () => dismissLayer(), 'gc-btn'));
    inner.append(form, foot);
    if (focus === 'themes') {themes.scrollIntoView?.({block: 'start'}); nameInput.focus({preventScroll: true});}
  }
  /* ---------- 外壳 ---------- */
  function rerender() {if (root.hidden) return; if (mode === 'spread') renderSpread(false); else if (mode === 'pool') renderPool(); else renderHome();}
  function close() {
    castAbort?.abort(); compileAbort?.abort(); overviewAbort?.abort(); stageCleanup?.(); closeLayer();
    root.hidden = true; opener?.focus?.({preventScroll: true});
  }
  root.addEventListener('click', e => {if (e.target === root) close();});
  root.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (stageCleanup) {const skip = body.querySelector<HTMLButtonElement>('.gc-stage-skip:not([hidden])'); if (skip) skip.click(); else body.querySelector<HTMLButtonElement>('.gc-stage-bar .gc-btn')?.click(); return;}
      if (layer) {dismissLayer(); return;}
      if (body.querySelector('.gc-cast')) {castAbort?.abort(); return;}
      close(); return;
    }
    if (e.key !== 'Tab') return;
    const scope = (stageCleanup ? body.querySelector<HTMLElement>('.gc-stage') : layer) ?? shell;
    const items = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,summary,a[href]')).filter(x => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0]!, last = items.at(-1)!;
    if (e.shiftKey && doc.activeElement === first) {e.preventDefault(); last.focus();}
    else if (!e.shiftKey && doc.activeElement === last) {e.preventDefault(); first.focus();}
  });
  const off = gacha.subscribe(() => renderHead());
  return {
    element: root,
    get open() {return !root.hidden;},
    show(parent?: HTMLElement) {
      ensureStyle();
      // 每次打开都移到最后：与大厅等同层级的浮层之后打开的总在最上面（大厅重新打开会把自己放到后面）。
      (parent ?? doc.body).append(root);
      opener = doc.activeElement as HTMLElement | null; applyArt(); entering = true; gacha.refresh(); root.hidden = false;
      if (mode === 'home') renderHome(); else rerender();
      closeButton.focus({preventScroll: true});
    },
    close,
    dispose() {close(); off(); if (toastTimer) clearTimeout(toastTimer); root.remove();},
  };
}
