const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ESC[c] ?? c);

/** data-dlb plus its parameters, exactly as dlbClick reads them. */
export function act(name: string, params: Record<string, string | number> = {}): string {
  let out = ` data-dlb="${esc(name)}"`;
  for (const [key, value] of Object.entries(params)) out += ` data-${key}="${esc(value)}"`;
  return out;
}

export const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;

export function priceOf(s: { dailyOpts: { k: string; pr: number }[]; daily: string }): number {
  return s.dailyOpts.find(o => o.k === s.daily)?.pr ?? 80;
}

export function nameOf(s: { dailyOpts: { k: string; nm: string }[]; daily: string }): string {
  return s.dailyOpts.find(o => o.k === s.daily)?.nm ?? '';
}

export function bookText(n: number): string {
  return n === -2 ? '书架读取中' : n === -1 ? '书架未建' : n === 0 ? '书架空着' : `书架 ${n} 本`;
}

/** A frame pair for a Codex prop: f1 always, f2 swapped in on hover/focus once loaded. */
export function twoFrame(id: string, cls = ''): string {
  return `<span class="u4-2f${cls ? ' ' + cls : ''}"><img class="f1" alt="" data-u4-img="${esc(id)}-f1"><img class="f2" alt="" data-u4-hover="${esc(id)}-f2"></span>`;
}

export function q<T extends Element = HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector<T>(sel as never) as T | null;
}

export function each(root: ParentNode, sel: string, fn: (el: HTMLElement) => void): void {
  root.querySelectorAll<HTMLElement>(sel).forEach(fn);
}

export function setText(root: ParentNode, sel: string, text: string): void {
  each(root, sel, el => { if (el.textContent !== text) el.textContent = text; });
}
