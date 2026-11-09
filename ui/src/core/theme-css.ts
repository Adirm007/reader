/* The theme sheets (lobby, sub-pages, windows) ship deflated; this unpacks one theme the first time it is used.
 * Engines without DecompressionStream keep the legacy interface (ReaderUI.enabled() says no). */
import packed from 'virtual:theme-css';

const cache = new Map<string, Promise<string>>();

export function canUnpack(): boolean {
  try {
    return typeof DecompressionStream === 'function' && typeof Blob === 'function' && typeof Blob.prototype.stream === 'function' && typeof Response === 'function';
  } catch { return false; }
}

export function themeCss(theme: string): Promise<string> {
  let pending = cache.get(theme);
  if (!pending) {
    pending = (async () => {
      const b64 = packed[theme];
      if (!b64) throw new Error('no theme sheet: ' + theme);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      return await new Response(stream).text();
    })();
    pending.catch(() => cache.delete(theme));
    cache.set(theme, pending);
  }
  return pending;
}
