/** 读者正则 · 命运抽卡（读者大厅里的「命运抽卡」：主题、大池与小池、单抽与十连、大小保底与兑换、回收）。
 *  - 保底、各作品的抽取点数与抽卡记录：当前聊天的聊天变量 dream_gacha（chatMetadata.variables，按聊天＝按存档，不随楼层回退）；
 *  - 99 部作品、小池与览概缓存、设置（含角色池开关）：这台设备的站点存储（缓存按聊天分开，只留最近 6 个聊天）；
 *  - 扣命运点数与放进主角背包：ReaderTransactions 固定当前聊天、最新楼层与候选，在同一次变量提交里完成，与读者其他付费操作互斥；
 *    书海的旅程进行中不扣点、不入包、不回收（那段时间的命运点数与背包由书海结算）；
 *  - 模型：读者传入的 generate（读者“独立API”里的「命运抽卡」路由，未单独设置时跟随默认方案或酒馆插头）。
 *  这个文件由 gacha/build.mjs 打包成 source/reader-gacha.js，读者控制器里以 window.ReaderGacha 使用。 */
import {CAST_COST,DRAW_COST,TEN_COST,createGacha,deviceStore,SETTINGS_KEY,type CommitRequest,type GachaDurable,type GachaPort,type GachaService,type LlmOptions,type Wallet} from '../gacha/session';
import {applyGachaDraw,applyRecycle,listGachaBag,type RecyclePick} from '../gacha/bag';
import type {FetchLike} from '../gacha/net';
import {mountGachaPanel,type GachaArt} from '../ui/gacha-panel';

type Obj = Record<string, unknown>;
const rec = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const message = (e: unknown) => String((e as Error)?.message ?? e);
export const READER_GACHA_VERSION = '1.1.0';
export const DURABLE_KEY = 'dream_gacha';
/** 一次模型请求最多等多久（编纂小池分几次请求，每次最多这么久）。 */
export const GACHA_TIMEOUT_MS = 300000;
export const BOOKSEA_BUSY = '书海的旅程还没结束：这段时间的命运点数与背包由书海结算。回到书间结算后再换大池、抽卡或回收。';

/** ReaderTransactions 的这一部分（source/reader-transactions.js）。 */
export type ReaderToken = {chatId: string; characterId: string; messageId: number; id: string};
export type ReaderTx = {
  capture(): ReaderToken;
  read(token: ReaderToken): Obj;
  fp(data: Obj): number;
  charge(data: Obj, cost: number): number;
  transact<T>(token: ReaderToken, id: string, mutate: (data: Obj) => T): Promise<T>;
  run<T>(key: string, action: (token: ReaderToken) => Promise<T>): Promise<T>;
};
export type StContext = {characterId?: unknown; chatId?: unknown; getCurrentChatId?: () => unknown; chat?: {extra?: unknown}[]; chatMetadata?: {variables?: Obj}; saveMetadata?: () => unknown};
export type HelperLike = {getVariables?: (o: Obj) => unknown; getLastMessageId?: () => number};
export type ReaderGachaHost = {
  /** 面板挂在哪个文档（读者传入登记过的酒馆主文档，停止读者时随之清理）。 */
  document: Document;
  transactions: ReaderTx;
  context: () => StContext;
  helper?: HelperLike;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  fetch: FetchLike;
  /** 酒馆助手 generateRaw（读者已按「命运抽卡」路由套上独立API）；没有时只能用资料直出小池。 */
  generate?: (config: Obj) => Promise<unknown>;
  stop?: (id: string) => void;
  art?: () => GachaArt | undefined;
  /** 读者大厅当前主题（cafe / summer / ink），面板配色随之切换。 */
  theme?: () => string | undefined;
  onChange?: () => void;
  isAlive?: () => boolean;
  /** 酒馆站点（跨域资料库被拦时经 /proxy/ 重试）。 */
  proxyBase?: string;
  zIndex?: number;
};

export function chatIdentity(c: StContext): string {
  const chat = typeof c.getCurrentChatId === 'function' ? c.getCurrentChatId() : c.chatId;
  return `${String(c.characterId ?? '')}|${String(chat ?? '')}`;
}
/** 书海旅程是否还在进行：优先按最新楼层的书海进度引用找到存档（楼层回退后以存档为准），旧版没有引用时看聊天里的镜像。 */
export function bookseaActive(c: StContext, helper?: HelperLike): boolean {
  try {
    const running = (x: unknown) => {const a = rec(x); return !!a.run && a.mode !== 'ended';};
    const chat = rec(helper?.getVariables?.({type: 'chat'}) ?? c.chatMetadata?.variables), book = rec(chat.booksea);
    const rows = Array.isArray(c.chat) ? c.chat : [];
    const last = typeof helper?.getLastMessageId === 'function' ? Number(helper.getLastMessageId()) : rows.length - 1;
    const ref = rec(rec(Number.isSafeInteger(last) && last >= 0 ? helper?.getVariables?.({type: 'message', message_id: last}) : undefined).bookseaProgressRef);
    if (ref.version === 1) {
      if (typeof ref.token !== 'string') return false;
      const snapshot = (id: number) => {const snap = rec(rec(rows[id]?.extra).bookseaCheckpointV1); return snap.token === ref.token ? snap : undefined;};
      const index = Array.isArray(book.timelineIndex) ? book.timelineIndex.map(rec) : [];
      for (const entry of index) if (entry.token === ref.token) {const snap = snapshot(Number(entry.messageId)); if (snap) return running(rec(snap.progress).activeExpedition);}
      for (let i = Math.min(rows.length - 1, last); i >= 0; i--) {const snap = snapshot(i); if (snap) return running(rec(snap.progress).activeExpedition);}
      return false;
    }
    return running(book.activeExpedition);
  } catch {return false;}
}

export function readerGachaPort(host: ReaderGachaHost): GachaPort {
  const pinned = chatIdentity(host.context()), device = deviceStore(host.storage, pinned), T = host.transactions;
  const assert = () => {
    if (host.isAlive && !host.isAlive()) throw Error('读者已关闭，旧操作已取消');
    if (chatIdentity(host.context()) !== pinned) throw Error('聊天已切换，这次抽卡没有进行');
  };
  const vars = () => {const c = host.context(); if (!c.chatMetadata) return undefined; c.chatMetadata.variables ??= {}; return c.chatMetadata.variables;};
  const busy = () => bookseaActive(host.context(), host.helper);
  const port: GachaPort = {
    contextId: pinned, mode: 'host',
    readDurable() {assert(); return vars()?.[DURABLE_KEY];},
    async writeDurable(value: GachaDurable) {
      assert();
      const c = host.context(), v = vars(); if (!v) throw Error('读不到聊天资料');
      v[DURABLE_KEY] = JSON.parse(JSON.stringify(value));
      await c.saveMetadata?.();
    },
    readDevice: () => device.read(), writeDevice: v => device.write(v),
    readSettings() {try {const s = host.storage?.getItem(SETTINGS_KEY); return s ? JSON.parse(s) : undefined;} catch {return undefined;}},
    writeSettings(v) {try {host.storage?.setItem(SETTINGS_KEY, JSON.stringify(v));} catch {/* 本机空间不足 */}},
    wallet(): Wallet {
      let fp: number | null = null, blocked: string | undefined;
      try {assert(); fp = Math.max(0, Math.floor(T.fp(T.read(T.capture()))));} catch (e) {blocked = message(e);}
      if (!blocked && busy()) blocked = BOOKSEA_BUSY;
      return blocked ? {fp, blocked} : {fp};
    },
    async commit(req: CommitRequest): Promise<Wallet> {
      assert();
      const writes = req.cost > 0 || (req.bag && req.cards.length > 0);
      if (!writes) return port.wallet();
      if (busy()) throw Error(BOOKSEA_BUSY);
      return T.run('paid-action', async token => {
        assert();
        const done = await T.transact(token, token.id + (req.spark ? ':gacha-spark' : ':gacha'), data => {
          const r = applyGachaDraw(data, req, (d, cost) => T.charge(d, cost), d => {try {return T.fp(d);} catch {return null;}});
          return {fp: r.fp, count: r.added.length};
        });
        return {fp: done && typeof done.fp === 'number' ? done.fp : null};
      });
    },
    async commitCast(req: {cost: number; theme: string}): Promise<Wallet> {
      assert();
      if (req.cost <= 0) return port.wallet();
      if (busy()) throw Error(BOOKSEA_BUSY);
      return T.run('paid-action', async token => {
        assert();
        const fp = await T.transact(token, token.id + ':gacha-cast', data => T.charge(data, req.cost));
        return {fp: typeof fp === 'number' ? fp : null};
      });
    },
    bag() {
      try {assert(); return listGachaBag(T.read(T.capture()));} catch {return [];}
    },
    async recycle(picks: RecyclePick[]) {
      assert();
      if (busy()) throw Error(BOOKSEA_BUSY);
      return T.run('paid-action', async token => {
        assert();
        const r = await T.transact(token, token.id + ':gacha-recycle', data => applyRecycle(data, picks, d => T.fp(d)));
        return {fp: r && typeof r.fp === 'number' ? r.fp : null, gained: Number(r?.gained) || 0, removed: Number(r?.removed) || 0};
      });
    },
    fetch: host.fetch,
    ...(host.proxyBase ? {proxyBase: host.proxyBase} : {}),
  };
  if (host.generate) {
    const generate = host.generate;
    port.llm = async (system: string, user: string, options: LlmOptions) => {
      assert();
      if (options.signal?.aborted) throw Error('已取消');
      const id = 'dream-gacha-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const config: Obj = {generation_id: id, should_stream: false, should_silence: true, max_chat_history: 0, ordered_prompts: [{role: 'system', content: system}, {role: 'user', content: user}]};
      let timer: ReturnType<typeof setTimeout> | undefined, cancel: (() => void) | undefined;
      const stop = () => {try {host.stop?.(id);} catch {/* 尽力停止 */}};
      const onAbort = () => {stop(); cancel?.();};
      options.signal?.addEventListener('abort', onAbort, {once: true});
      try {
        const text = await Promise.race([generate(config), new Promise<never>((_, reject) => {
          cancel = () => reject(Error('已取消'));
          timer = setTimeout(() => {stop(); reject(Error('模型想得太久了（超时）'));}, Math.min(options.timeoutMs, GACHA_TIMEOUT_MS));
        })]);
        assert();
        return String(text ?? '');
      } finally {if (timer) clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort);}
    };
  }
  return port;
}

export type ReaderGachaApi = {
  version: string;
  /** 打开（或重新显示）当前聊天的命运抽卡；读者大厅里的「命运抽卡」调用它。 */
  open(host: ReaderGachaHost): boolean;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
  /** 大厅价签：换大池 / 单抽 / 十连的命运点数。 */
  price(): {cast: number; single: number; ten: number};
  /** 测试与排查：当前面板的服务。 */
  service(): GachaService | undefined;
  /** 测试与排查：只建端口、不建面板（不碰页面）。 */
  port(host: ReaderGachaHost): GachaPort;
};

export function createReaderGacha(): ReaderGachaApi {
  let current: {key: string; doc: Document; gacha: GachaService; panel: ReturnType<typeof mountGachaPanel>; host: ReaderGachaHost} | undefined;
  const dispose = () => {const c = current; current = undefined; try {c?.panel.dispose();} catch {/* 面板已随读者清理 */}};
  return {
    version: READER_GACHA_VERSION,
    open(host) {
      if (host.isAlive && !host.isAlive()) return false;
      const key = chatIdentity(host.context());
      if (current && (current.key !== key || current.doc !== host.document)) dispose();
      // 同一个页面里只留一个抽卡面板：旧完整版每封信各有一份读者，别的信留下的面板先撤掉。
      try {for (const old of Array.from(host.document.querySelectorAll('[data-dream-overlay="gacha"]'))) if (old !== current?.panel.element) old.remove();} catch {/* 没有页面（测试） */}
      if (!current) {
        const gacha = createGacha(readerGachaPort(host));
        const panel = mountGachaPanel(host.document, gacha, {title: '命运抽卡', art: () => current?.host.art?.(), theme: () => current?.host.theme?.(), zIndex: host.zIndex ?? 2147483647, onChange: () => {try {current?.host.onChange?.();} catch {/* 大厅刷新失败不影响抽卡 */}}});
        current = {key, doc: host.document, gacha, panel, host};
      } else current.host = host;
      current.panel.show();
      return true;
    },
    close() {current?.panel.close();},
    isOpen: () => !!current?.panel.open,
    dispose,
    price: () => ({cast: CAST_COST, single: DRAW_COST, ten: TEN_COST}),
    service: () => current?.gacha,
    port: host => readerGachaPort(host),
  };
}
