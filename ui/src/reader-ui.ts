/* window.ReaderUI — the v4 presentation layer of the reader lobby, letters and floating envelope.
 * It only draws. Every object that does something carries the same data-dlb attributes the legacy
 * renderer used, so the existing dlbClick chain performs all actions, prices and state changes. The
 * switch layer (source/reader-ui-switch.js) decides when this layer draws and feeds it the state. */
import type { Hooks, LobbyState, Theme, ThemeKit } from './core/types';
import { hydrate, hydrateHover, load, has } from './core/assets';
import { fontFaceCss } from './core/fonts';
import { esc, nameOf, priceOf, bookText, setText, each, pad2 } from './core/dom';
import baseCss from './base.css';
import { cafe } from './themes/cafe/kit';
import { summer } from './themes/summer/kit';
import { ink } from './themes/ink/kit';

export const READER_UI_VERSION = '4.0.0';

const KITS: Record<Theme, ThemeKit> = { cafe, summer, ink };
const SHORT: Record<Theme, string> = { cafe: 'u4c', summer: 'u4s', ink: 'u4i' };
const themeOf = (t: unknown): Theme => (t === 'summer' || t === 'ink' ? t : 'cafe');
const kitOf = (t: unknown): ThemeKit => KITS[themeOf(t)];

type Root = HTMLElement & { __u4?: { hooks: Hooks; theme: Theme; line: number; minute: string; fxTimer?: number } };

function rootOf(ov: ParentNode | null | undefined): Root | null {
  return (ov?.querySelector?.('#u4r') as Root | null) ?? null;
}

function style(doc: Document, id: string, text: string): void {
  let node = doc.getElementById(id) as HTMLStyleElement | null;
  if (!text) { node?.remove(); return; }
  if (!node) { node = doc.createElement('style'); node.id = id; doc.head.appendChild(node); }
  if (node.textContent !== text) node.textContent = text;
}

function greet(root: Root, s: LobbyState, next: boolean): void {
  const state = root.__u4;
  if (!state) return;
  const lines = kitOf(state.theme).greetings(s, new Date().getHours());
  if (!lines.length) return;
  if (next) state.line = (state.line + 1) % lines.length;
  const text = lines[state.line % lines.length] ?? '';
  each(root, '[data-u4-line]', el => { if (el.textContent !== text) el.textContent = text; });
  if (next) {
    each(root, '[data-u4-greet]', el => { el.classList.remove('is-turn'); void el.offsetWidth; el.classList.add('is-turn'); });
  }
}

function syncClock(root: Root): void {
  const state = root.__u4;
  if (!state) return;
  const d = new Date(), minute = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  if (state.minute === minute) return;
  state.minute = minute;
  setText(root, '[data-u4-time]', minute);
  setText(root, '[data-u4-date]', kitOf(state.theme).date(d));
  const h = (d.getHours() % 12) * 30 + d.getMinutes() * 0.5, m = d.getMinutes() * 6;
  each(root, '[data-u4-hh]', el => el.setAttribute('transform', `rotate(${h} 32 32)`));
  each(root, '[data-u4-mh]', el => el.setAttribute('transform', `rotate(${m} 32 32)`));
}

function syncAll(root: Root, kind: string, s: LobbyState): void {
  if (kind === 'all' || kind === 'fp') {
    setText(root, '[data-u4-fp]', s.fp);
    root.setAttribute('aria-busy', s.fp === '——' ? 'true' : 'false');
  }
  if (kind === 'all' || kind === 'juke') {
    root.classList.toggle('u4-playing', s.juke.playing);
    setText(root, '[data-u4-jtitle]', s.juke.title);
    setText(root, '[data-u4-jno]', s.juke.no);
    each(root, '[data-u4-jplay]', el => {
      el.setAttribute('aria-pressed', String(s.juke.playing));
      el.setAttribute('aria-label', s.juke.playing ? '暂停唱片' : '播放唱片');
      const label = el.querySelector('[data-u4-jstate]');
      if (label) label.textContent = s.juke.playing ? '暂停' : '播放';
    });
  }
  if (kind === 'all' || kind === 'daily') {
    each(root, '[data-dlb="dailysel"]', el => {
      const on = el.getAttribute('data-k') === s.daily;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', String(on));
    });
    setText(root, '[data-u4-dname]', nameOf(s));
    setText(root, '[data-u4-dprice]', String(priceOf(s)));
  }
  if (kind === 'all' || kind === 'badges') {
    setText(root, '[data-u4-persona]', s.persona.label);
    setText(root, '[data-u4-appearance]', s.appearance.label);
    setText(root, '[data-u4-books]', bookText(s.books));
  }
  kitOf(root.__u4?.theme).sync?.(root, kind, s);
}

const envelopeArt = new Map<string, string | null>();

export function createReaderUI() {
  return {
    version: READER_UI_VERSION,

    /** Views drawn by this layer; the rest are still drawn by the legacy renderer inside its own skeleton. */
    supports(_theme: string, view: string): boolean {
      return view === 'main' || view === 'lobby';
    },

    /** localStorage.dream_ui_v4 = 'off' brings the legacy interface back. */
    enabled(store?: Storage | null): boolean {
      try { return (store || window.localStorage).getItem('dream_ui_v4') !== 'off'; } catch { return true; }
    },

    install(doc: Document, theme: string): void {
      const t = themeOf(theme);
      style(doc, 'dream-u4-style', fontFaceCss(t) + baseCss + kitOf(t).css);
    },

    uninstall(doc: Document): void {
      style(doc, 'dream-u4-style', '');
      style(doc, 'dream-u4-envelope', '');
    },

    skeleton(theme: string, s: LobbyState): string {
      const t = themeOf(theme), kit = kitOf(t);
      return `<div id="u4r" class="u4 ${SHORT[t]}" data-u4-theme="${t}" lang="zh-CN">`
        + `<div class="u4-amb" data-u4-bg="${t}/plate-wide" aria-hidden="true"></div>`
        + `<div class="u4-view"><div class="u4-scene" aria-hidden="true">${kit.scene(s)}</div>`
        + `<main id="dlb-main" class="u4-main"></main></div>`
        + `<header id="dlb-topbar" class="u4-top"></header>`
        + `<section id="dlb-sheet" class="dlb-sheet u4-sheet" style="display:none"></section></div>`;
    },

    top(theme: string, page: string, s: LobbyState): string { return kitOf(theme).top(page, s); },
    main(theme: string, s: LobbyState): string { return kitOf(theme).main(s); },

    /** After dlbGo filled the containers: bind display-only behaviour once, load art, sync. */
    mount(ov: HTMLElement, theme: string, hooks: Hooks): void {
      const root = rootOf(ov);
      if (!root) return;
      const t = themeOf(theme);
      if (!root.__u4) {
        root.__u4 = { hooks, theme: t, line: Math.floor(Math.random() * 4), minute: '' };
        const view0 = root.ownerDocument.defaultView;
        let timer = 0;
        const relayout = () => {
          if (!root.isConnected) { view0?.removeEventListener('resize', relayout); return; }
          window.clearTimeout(timer);
          timer = window.setTimeout(() => { void hydrate(root); }, 250);
        };
        view0?.addEventListener('resize', relayout);
        root.addEventListener('click', event => {
          const target = event.target as Element | null;
          const greeting = target?.closest?.('[data-u4-greet]');
          if (greeting && root.contains(greeting)) greet(root, hooks.state(), true);
          if (target?.closest?.('[data-dlb]')) window.setTimeout(() => { if (root.isConnected) syncAll(root, 'all', hooks.state()); }, 0);
        });
      }
      root.__u4.hooks = hooks;
      const s = hooks.state();
      greet(root, s, false);
      root.__u4.minute = '';
      syncClock(root);
      syncAll(root, 'all', s);
      const view = root.ownerDocument.defaultView || window;
      void hydrate(root).then(() => hydrateHover(root, view));
    },

    sync(ov: HTMLElement | null, kind: string, s?: LobbyState): void {
      const root = rootOf(ov);
      if (!root?.__u4) return;
      if (kind === 'clock') { syncClock(root); return; }
      syncAll(root, kind, s || root.__u4.hooks.state());
    },

    /** A paid order went through (handleRhythm resolved): play the theme's acknowledgement once. */
    notify(ov: HTMLElement | null, event: { type: string; kind?: string }): void {
      const root = rootOf(ov);
      if (!root?.__u4 || event.type !== 'paid' || !event.kind) return;
      let reduce = false;
      try { reduce = (root.ownerDocument.defaultView || window).matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
      root.classList.toggle('u4-reduce', reduce);
      kitOf(root.__u4.theme).celebrate?.(root, event.kind, root.__u4.hooks.state());
    },

    /** Floating envelope (#dfb) look for the theme; empty string removes it. */
    installEnvelope(doc: Document, theme: string | null): void {
      if (!theme) { style(doc, 'dream-u4-envelope', ''); return; }
      const t = themeOf(theme), id = `${t}/envelope`;
      const art = envelopeArt.get(id);
      let css = kitOf(t).envelopeCss;
      if (art) css = `#dfb.dream-fb{--u4-env:url("${art}")}` + css;
      style(doc, 'dream-u4-envelope', css);
      if (art === undefined && has(id)) {
        envelopeArt.set(id, null);
        void load(id).then(url => { envelopeArt.set(id, url); if (url && doc.getElementById('dream-u4-envelope')) this.installEnvelope(doc, t); });
      }
    },

    /** Art for the light letters; filled in asynchronously, returns what has already loaded. */
    letterArt(theme: string, appearance: string, refresh?: () => void): Record<string, string> {
      const t = themeOf(theme), out: Record<string, string> = {};
      const wanted: Record<string, string> = { scene: `${t}/letter-scene`, paper: `${t}/letter-paper`, avatar: `${t}/avatar/${appearance}` };
      if (!has(wanted.avatar!)) wanted.avatar = `${t}/avatar/default`;
      for (const [key, id] of Object.entries(wanted)) {
        if (!has(id)) continue;
        const known = letterCache.get(id);
        if (known) out[key] = known;
        else if (known === undefined) {
          letterCache.set(id, null);
          void load(id).then(url => { if (url) { letterCache.set(id, url); refresh?.(); } });
        }
      }
      return out;
    },

    /** For the preview stage and debugging. */
    esc,
  };
}

const letterCache = new Map<string, string | null>();
