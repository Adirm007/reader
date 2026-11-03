/** 资料库请求：超时、跨域失败时走酒馆自带的 CORS 代理（/proxy/，需在酒馆 config.yaml 开启 enableCorsProxy）、统一的错误说明。
 *  只请求公开接口；不带 Cookie，不发送任何聊天或角色内容。 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export class NetError extends Error {constructor(message: string, readonly status = 0) {super(message);}}
export type Net = {
  json<T = unknown>(url: string, init?: RequestInit & {timeoutMs?: number; signal?: AbortSignal}): Promise<T>;
  /** 本次会话里经代理成功过的域名（界面提示用）。 */
  proxied(): string[];
};
export type NetOptions = {proxyBase?: string; useProxy?: boolean; timeoutMs?: number};

function describe(status: number): string {
  return status === 429 ? '请求太频繁或额度已用完' : status === 401 || status === 403 ? '拒绝访问' : status === 404 ? '没有找到' : status >= 500 ? '对方服务器出错' : '请求失败';
}
export function createNet(fetcher: FetchLike, options: NetOptions = {}): Net {
  const proxied = new Set<string>();
  const proxyUrl = (url: string) => options.proxyBase ? options.proxyBase.replace(/\/+$/, '') + '/proxy/' + url : '';
  async function once(url: string, init: RequestInit, timeoutMs: number, outer?: AbortSignal): Promise<Response> {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined;
    const abort = () => ctrl?.abort();
    if (outer) {if (outer.aborted) throw new NetError('已取消'); outer.addEventListener('abort', abort, {once: true});}
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fetcher(url, {...init, credentials: 'omit', ...(ctrl ? {signal: ctrl.signal} : {})}),
        new Promise<never>((_, reject) => {timer = setTimeout(() => {abort(); reject(new NetError('超时'));}, timeoutMs);}),
      ]);
    } finally {if (timer) clearTimeout(timer); outer?.removeEventListener('abort', abort);}
  }
  return {
    proxied: () => [...proxied],
    async json<T>(url: string, init: RequestInit & {timeoutMs?: number; signal?: AbortSignal} = {}): Promise<T> {
      const {timeoutMs = options.timeoutMs ?? 15000, signal, ...rest} = init;
      let res: Response;
      try {res = await once(url, rest, timeoutMs, signal);}
      catch (e) {
        if (signal?.aborted) throw new NetError('已取消');
        if (e instanceof NetError && e.message === '超时') throw e;
        // 浏览器把跨域拦截报成 TypeError：换酒馆代理再试一次。
        const via = options.useProxy !== false ? proxyUrl(url) : '';
        if (!via) throw new NetError('连不上（网络不通或被浏览器跨域拦截）');
        try {res = await once(via, rest, timeoutMs, signal);}
        catch {throw new NetError('连不上（跨域被拦截，酒馆代理也不可用）');}
        if (!res.ok) throw new NetError(`HTTP ${res.status}（经酒馆代理：${describe(res.status)}）`, res.status);
        try {proxied.add(new URL(url).host);} catch {/* 只是提示 */}
      }
      if (!res.ok) throw new NetError(`HTTP ${res.status}（${describe(res.status)}）`, res.status);
      const text = await res.text();
      try {return JSON.parse(text) as T;} catch {throw new NetError('返回的不是 JSON');}
    },
  };
}
/** 限制并发：同一资料库不要一次打太多请求。 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  const workers = Array.from({length: Math.max(1, Math.min(limit, items.length))}, async () => {
    while (next < items.length) {const i = next++; out[i] = await fn(items[i]!, i);}
  });
  await Promise.all(workers);
  return out;
}
/** 替换时只留第一个分组。用函数而不写 "$" 加数字：旧完整版把这份代码放进酒馆正则的替换文本，那种写法会被酒馆当成捕获组替换掉。 */
const keep = (_m: string, inner: string) => inner;
/** 去掉 HTML 标签、Markdown 强调、VNDB/BBCode 标记与多余空白。 */
export function plainText(raw: unknown, max = 4000): string {
  return String(raw ?? '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/\[url=[^\]]*\]([^[]*)\[\/url\]/gi, keep).replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi, '').replace(/\[\/?[a-z]+[^\]]*\]/gi, '')
    .replace(/~!([\s\S]*?)!~/g, '').replace(/__([^_]+)__/g, keep).replace(/\*\*([^*]+)\*\*/g, keep)
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim().slice(0, max);
}
