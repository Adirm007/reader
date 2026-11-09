/* Bundled art lives in the reader repository (assets/ui/…, content-hashed names). Sources are tried
 * in the same order as the rest of the runtime: Pages, then raw.githubusercontent and jsDelivr at the
 * pinned commit. An image is shown only after it actually loaded, so a failed source never leaves a
 * broken image; without any source the CSS placeholder stays. A preview can put its own base first
 * through ReaderCoreConfig.uiAssetBase on the host window. */
import manifest from '../../assets.json';

export interface AssetEntry { path: string }
/* The build ships only id -> sha8; paths follow tools/export_ui_assets.py: theme/a/b -> assets/ui/theme/a-b.<sha8>.webp,
 * font/x -> assets/ui/fonts/x.<sha8>.woff2. */
interface Manifest { repository: string; commit: string | null; files: Record<string, string> }

const M = manifest as unknown as Manifest;
const files: Record<string, AssetEntry> = {};
for (const [id, sha] of Object.entries(M.files || {})) {
  const cut = id.indexOf('/'), theme = id.slice(0, cut), rest = id.slice(cut + 1).replace(/\//g, '-');
  files[id] = { path: theme === 'font' ? `assets/ui/fonts/${rest}.${sha}.woff2` : `assets/ui/${theme}/${rest}.${sha}.webp` };
}

let cachedBases: string[] | null = null;
let preferred = 0;
const loads = new Map<string, Promise<string | null>>();

function hostConfig(): { uiAssetBase?: unknown } | undefined {
  try { return (window.parent as unknown as { ReaderCoreConfig?: { uiAssetBase?: unknown } }).ReaderCoreConfig; } catch { return undefined; }
}

export function bases(): string[] {
  if (cachedBases) return cachedBases;
  const ref = M.commit || 'main', repo = M.repository || 'Adirm007/reader';
  const list: string[] = [];
  const dev = hostConfig()?.uiAssetBase;
  if (typeof dev === 'string' && dev) list.push(dev.endsWith('/') ? dev : dev + '/');
  list.push('https://adirm007.github.io/reader/', `https://raw.githubusercontent.com/${repo}/${ref}/`, `https://cdn.jsdelivr.net/gh/${repo}@${ref}/`);
  return (cachedBases = list);
}

export const has = (id: string): boolean => !!files[id];
export const entry = (id: string): AssetEntry | undefined => files[id];

function ordered(): string[] {
  const list = bases();
  return preferred > 0 && preferred < list.length ? [list[preferred]!, ...list.filter((_, i) => i !== preferred)] : list;
}

/** Every URL a file may come from, best first (for CSS @font-face src lists). */
export function urls(id: string): string[] {
  const e = files[id];
  return e ? ordered().map(base => base + e.path) : [];
}

function probe(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** Resolve a manifest id (or an absolute fallback URL) to a URL that has loaded, or null. */
export function load(id: string, fallback?: string): Promise<string | null> {
  const key = id + '|' + (fallback || '');
  let pending = loads.get(key);
  if (pending) return pending;
  pending = (async () => {
    const e = files[id];
    if (e) {
      const list = bases();
      for (const base of ordered()) {
        const url = base + e.path;
        if (await probe(url)) { preferred = list.indexOf(base); return url; }
      }
    }
    if (fallback && /^https:\/\//.test(fallback) && await probe(fallback)) return fallback;
    return null;
  })();
  loads.set(key, pending);
  // A miss is not remembered: the next hydrate (after any click in the lobby, a resize, a page change) tries again.
  void pending.then(url => { if (!url && loads.get(key) === pending) loads.delete(key); });
  return pending;
}

function apply(el: HTMLElement, url: string, attr: 'img' | 'bg'): void {
  if (attr === 'img') {
    const img = el as HTMLImageElement;
    if (img.getAttribute('src') !== url) img.src = url;
  } else {
    el.style.setProperty('--u4-img', `url("${url.replace(/"/g, '%22')}")`);
  }
  if (el.hasAttribute('data-u4-hover')) el.parentElement?.classList.add('has-f2');
  else el.classList.add('is-in');
}

function fill(el: HTMLElement): Promise<void> {
  const isImg = el.hasAttribute('data-u4-img');
  const id = el.getAttribute(isImg ? 'data-u4-img' : 'data-u4-bg') || '';
  el.setAttribute('data-u4-pending', '');
  return load(id, el.getAttribute('data-u4-fallback') || undefined).then(url => {
    if (url && el.isConnected) apply(el, url, isImg ? 'img' : 'bg');
    else if (!url) { el.classList.add('is-missing'); el.removeAttribute('data-u4-pending'); }
  });
}

/** Fill data-u4-img (img src) and data-u4-bg (--u4-img) inside root; data-u4-fallback gives an external URL.
 *  Only what the current layout renders is fetched (a phone never loads the wide plate); things far below
 *  the fold wait for an IntersectionObserver. Call again after a layout change. */
export function hydrate(root: ParentNode & Node): Promise<void> {
  const view = (root.ownerDocument || (root as unknown as Document)).defaultView;
  const height = view?.innerHeight || 800;
  const jobs: Promise<void>[] = [];
  let io: IntersectionObserver | null = null;
  root.querySelectorAll<HTMLElement>('[data-u4-img],[data-u4-bg]').forEach(el => {
    if (el.classList.contains('is-in') || el.hasAttribute('data-u4-pending')) return;
    const rects = el.getClientRects();
    if (!rects.length) return;
    if (rects[0]!.top > height * 1.6 && view && 'IntersectionObserver' in view) {
      io ||= new view.IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        io?.unobserve(entry.target);
        void fill(entry.target as HTMLElement);
      }), { rootMargin: '300px 0px' });
      io.observe(el);
      return;
    }
    jobs.push(fill(el));
  });
  return Promise.all(jobs).then(() => undefined);
}

/** Hover frames: fetched after the first frames, only where hover exists. */
export function hydrateHover(root: ParentNode, view: Window): void {
  let fine = false;
  try { fine = view.matchMedia('(hover:hover)').matches; } catch { /* old engines */ }
  if (!fine) return;
  root.querySelectorAll<HTMLElement>('[data-u4-hover]').forEach(el => {
    const id = el.getAttribute('data-u4-hover') || '';
    void load(id).then(url => { if (url && el.isConnected) apply(el, url, 'img'); });
  });
}
