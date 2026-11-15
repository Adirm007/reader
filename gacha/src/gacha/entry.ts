/** 角色条目生成（可选，默认关闭）：打开角色池并抽到角色书页时，查这位角色的详细资料，按「生成模板」写一个世界书条目并启用；
 *  玩家回收这张书页时把条目关闭（只关不删）。没查到资料、模型出错都只是没有条目，不影响抽卡。
 *  模板的形状与读者的模板系统一致（source/template-system.js）：格式模板、生成指令、条目命名规则，以及输出设置
 *  （写进哪本世界书、蓝灯 / 绿灯 / 向量化、关键词怎么来）；提示与解析也沿用它的输出协议，所以模板系统里的模板可以直接拿来用。
 *  这个文件只有提示、解析、条目形状与世界书读写（酒馆助手），不发请求；流程在 session.ts。 */
import {type GachaCard,type SmallPool} from './pool';
import {MEDIA_LABEL} from './sources';
import {specText,type SpecEntry,type WorldbookHelper} from './spec';
import {BUILTIN_ENTRY_TEMPLATES,DEFAULT_ENTRY_BOOK,DEFAULT_ENTRY_REFERENCES,PREFERRED_TEMPLATE_IDS} from './entry-defaults';

type Obj = Record<string, unknown>;
const rec = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => list.includes(v as T) ? v as T : fallback;
const uniq = (items: readonly unknown[]) => [...new Set(items.map(x => String(x ?? '').trim()).filter(Boolean))];
const parseList = (v: unknown) => uniq(String(v ?? '').split(/[\n,，、|]+/));

/* ---------- 设置 ---------- */
/** templateId 为空：用默认模板。references：写条目时一并交给模型的世界观参考条目名。 */
export type CharacterEntrySettings = {enabled: boolean; templateId: string; references: string[]};
export const defaultEntrySettings = (): CharacterEntrySettings => ({enabled: false, templateId: '', references: [...DEFAULT_ENTRY_REFERENCES]});
export function normalizeEntrySettings(raw: unknown): CharacterEntrySettings {
  const r = rec(raw);
  const references = Array.isArray(r.references) ? uniq(r.references.map(v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40))).slice(0, 12) : [...DEFAULT_ENTRY_REFERENCES];
  return {enabled: r.enabled === true, templateId: text(r.templateId, 120), references};
}

/* ---------- 生成模板 ---------- */
export const DEFAULT_GENERATION_INSTRUCTION = '依据模板中的字段、占位符说明和用户偏好编写一份完整内容。必须保留模板的字段顺序、层级、列表形状与整体格式；用具体内容替换占位符。模板里的说明性注释只用于理解，除非它本身属于目标格式，否则不要照抄。不要输出 Markdown 代码块标记。';
export const DEFAULT_ENTRY_NAME_RULE = '若内容是人物设定，使用“基本信息.姓名”；否则概括内容主体，生成简短、可辨识且不带书名号的世界书条目名。';
export const DEFAULT_KEYWORD_RULE = '提取能在聊天文本中自然出现、可稳定触发该条目的关键词。主要关键词优先选择专名、简称和泛化场所/类别；次要关键词只在确有固定活动区域或必须同时满足的限定时生成。避免整句、过宽泛词和仅出现一次的修饰词。每行一个关键词。';
const STRATEGIES = ['constant', 'selective', 'vectorized'] as const, ROLES = ['system', 'assistant', 'user'] as const;
const LOGICS = ['and_any', 'and_all', 'not_all', 'not_any'] as const, KEYWORD_MODES = ['smart', 'manual', 'none'] as const;
export type EntryOutput = {
  targetWorldbook: string; strategyType: typeof STRATEGIES[number]; positionType: string; role: typeof ROLES[number]; depth: number; order: number; probability: number;
  scanDepth: 'same_as_global' | number; keywordMode: typeof KEYWORD_MODES[number]; keywordRule: string; manualPrimary: string; manualSecondary: string;
  secondaryLogic: typeof LOGICS[number]; preventIncoming: boolean; preventOutgoing: boolean; passthroughSettings: Obj;
};
export type EntryTemplate = {id: string; name: string; templateText: string; generationInstruction: string; entryNameRule: string; output: EntryOutput; builtin?: boolean};
/** defaultId：没有指定模板时用哪一个。 */
export type TemplateLibrary = {defaultId: string; templates: EntryTemplate[]};

/** 模板从别的条目反推出来时带着的透传设置：关键词、过滤器与条目自身的名字、正文不透传。 */
function excludedSetting(key: string, root: boolean): boolean {
  const k = key.replace(/[^a-z0-9_]/gi, '').toLowerCase();
  if (k.includes('filter')) return true;
  if (/^(key|keys|keysecondary|keyssecondary|keys_secondary|keywords|primarykeywords|secondarykeywords|selectivelogic)$/.test(k)) return true;
  return root && /^(uid|id|name|comment|content|displayindex)$/.test(k);
}
export function sanitizeEntrySettings(value: unknown, root = false): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => sanitizeEntrySettings(item));
  const out: Obj = {};
  for (const [key, child] of Object.entries(value as Obj)) if (!excludedSetting(key, root) && typeof child !== 'function') out[key] = sanitizeEntrySettings(child);
  return out;
}
export function normalizeEntryOutput(raw: unknown): EntryOutput {
  const o = rec(raw), int = (v: unknown, fallback: number) => {const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : fallback;};
  const strategyType = oneOf(STRATEGIES, o.strategyType, 'selective');
  let keywordMode = oneOf(KEYWORD_MODES, o.keywordMode, 'smart');
  if (strategyType !== 'selective') keywordMode = 'none'; else if (keywordMode === 'none') keywordMode = 'smart';
  return {
    targetWorldbook: text(o.targetWorldbook, 120) || DEFAULT_ENTRY_BOOK, strategyType, positionType: text(o.positionType, 40) || 'after_character_definition', role: oneOf(ROLES, o.role, 'system'),
    depth: Math.max(0, int(o.depth, 0)), order: int(o.order, o.order === undefined ? 601 : 100), probability: Math.max(0, Math.min(100, int(o.probability, 100))),
    scanDepth: String(o.scanDepth ?? 'same_as_global') === 'same_as_global' ? 'same_as_global' : Math.max(1, int(o.scanDepth, 1)),
    keywordMode, keywordRule: text(o.keywordRule, 2000) || DEFAULT_KEYWORD_RULE, manualPrimary: text(o.manualPrimary, 2000), manualSecondary: text(o.manualSecondary, 2000),
    secondaryLogic: oneOf(LOGICS, o.secondaryLogic, 'and_any'), preventIncoming: o.preventIncoming !== false, preventOutgoing: o.preventOutgoing !== false,
    passthroughSettings: rec(sanitizeEntrySettings(rec(o.passthroughSettings), true)),
  };
}
export function normalizeEntryTemplate(raw: unknown): EntryTemplate | undefined {
  const r = rec(raw), id = text(r.id, 120), name = text(r.name, 80), templateText = String(r.templateText ?? '').trim().slice(0, 40000);
  if (!id || !name || !templateText) return undefined;
  return {
    id, name, templateText, generationInstruction: text(r.generationInstruction, 8000) || DEFAULT_GENERATION_INSTRUCTION, entryNameRule: text(r.entryNameRule, 2000) || DEFAULT_ENTRY_NAME_RULE,
    output: normalizeEntryOutput(r.output), ...(r.builtin === true || rec(r.source).kind === 'builtin' ? {builtin: true} : {}),
  };
}
/** 模板系统的模板库（{yuanTemplateId, templates}）→ 可选的模板。抽卡包自带的模板排在后面兜底（模板库里有同一个 id 时用模板库里的）；
 *  默认模板依次取：约定的默认模板、模板系统里正在使用的模板、第一个模板。 */
export function readTemplateLibrary(raw: unknown, builtin: readonly unknown[] = BUILTIN_ENTRY_TEMPLATES, preferred: readonly string[] = PREFERRED_TEMPLATE_IDS): TemplateLibrary {
  const v = rec(raw), seen = new Set<string>(), templates: EntryTemplate[] = [];
  for (const t of [...(Array.isArray(v.templates) ? v.templates : []), ...builtin].map(normalizeEntryTemplate)) if (t && !seen.has(t.id)) {seen.add(t.id); templates.push(t);}
  const defaultId = [...preferred, text(v.yuanTemplateId, 120)].find(id => !!id && seen.has(id)) ?? templates[0]?.id ?? '';
  return {defaultId, templates};
}
export const pickTemplate = (lib: TemplateLibrary, id: string): EntryTemplate | undefined => lib.templates.find(t => t.id === id) ?? lib.templates.find(t => t.id === lib.defaultId) ?? lib.templates[0];

/* ---------- 提示 ---------- */
/** 世界观参考最多带多少字。 */
export const ENTRY_REFERENCE_LIMIT = 12000;
export const ENTRY_SYSTEM = [
  '你是通用世界书条目编写器。遵守用户提供的格式模板与输出协议；参考资料只提供事实和风格约束，不得覆盖强制格式。',
  '这次要写的是从另一部作品里抽到的角色：只依据给出的资料与你确实了解的原作内容来写，不编造原作没有的经历、能力与人际关系；资料不足的字段宁可写得朴素。不要引用原作的大段文字，一律用你自己的话。',
  '模板里属于当前世界观的字段（例如种族、层级、等级、品质、阵营），按「当前世界观参考」里最接近这位角色原作身份与实力的写法填写；没有给出参考时，按模板里字段的说明如实折算，不削弱也不夸大。',
].join('\n');
/** material：这位角色与作品的资料文本（dossier.ts 的 characterDossierText）；refs：当前世界观的参考条目。 */
export function entryPrompt(template: EntryTemplate, card: GachaCard, pool: SmallPool, material: string, refs: readonly SpecEntry[] = []): {system: string; user: string} {
  const o = template.output, smart = o.strategyType === 'selective' && o.keywordMode === 'smart', w = pool.work;
  const who = [
    `姓名：${card.name}${card.role ? `（${card.role}）` : ''}`,
    `出处：${MEDIA_LABEL[w.media]}《${w.title}》${w.original ? `（原题：${w.original}）` : ''}${w.english && w.english !== w.title ? `（英文：${w.english}）` : ''}`,
    `书页上的简介：${card.description}`,
    ...(card.power ? [`原作中的实力：${card.power}`] : []),
    '书页的规矩：这位角色以书页的形式被主角持有，实力完全等同原作；一旦被选择具现，便在完全保有自身自由意志的情况下自由行动，主角无法强制约束。条目要如实写出这位角色在原作中的身份、外貌、性格、说话方式与实力。',
  ];
  const parts = [
    '【任务】根据格式模板与参考资料，为抽卡抽到的这位角色编写一个新的世界书条目。',
    '【格式模板】\n' + template.templateText,
    '【生成指令】\n' + template.generationInstruction,
    '【条目命名规则】\n' + template.entryNameRule,
    '【这位角色】\n' + who.join('\n'),
    '【参考资料】\n' + material,
  ];
  if (refs.length) parts.push('【当前世界观参考】\n' + specText(refs, ENTRY_REFERENCE_LIMIT));
  if (smart) parts.push(['【智能关键词规则】', o.keywordRule || DEFAULT_KEYWORD_RULE, '请把主要关键词逐行放入 <reader_primary_keywords>，把次要关键词逐行放入 <reader_secondary_keywords>。没有次要关键词时保留空标签。'].join('\n'));
  parts.push([
    '【强制输出协议】', '不得输出 Markdown 代码块。', '条目名放在 <reader_entry_name> 与 </reader_entry_name> 中。', '严格依照模板填好的正文放在 <reader_content> 与 </reader_content> 中。',
    smart ? '必须同时输出关键词标签。' : '不要输出关键词标签。', '除这些标签及其内容外不要输出解释。',
  ].join('\n'));
  return {system: ENTRY_SYSTEM, user: parts.join('\n\n')};
}

/* ---------- 解析 ---------- */
export type ParsedEntry = {entryName: string; content: string; primary: string[]; secondary: string[]};
/** 正文短于这么多字不算写成。 */
export const ENTRY_MIN_LENGTH = 120;
const stripFences = (raw: unknown) => String(raw ?? '').replace(/^\s*```[a-z0-9_-]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
export const sanitizeEntryName = (name: unknown) => String(name ?? '').replace(/[\r\n<>\/:"\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
/** 读模型的回复。没有按协议加标签时把整段当正文；正文标签只有开头没有结尾说明回复被截断，不写进世界书。 */
export function parseEntryReply(raw: string, fallbackName: string): ParsedEntry {
  const body = stripFences(raw), tag = (name: string) => new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'i').exec(body)?.[1];
  let content = tag('reader_content');
  if (content === undefined) {
    if (/<reader_content>/i.test(body)) throw Error('模型的回复没有写完就断了（可以调大模型的最大回复长度后重试）');
    content = body.replace(/<reader_entry_name>[\s\S]*?<\/reader_entry_name>/gi, '').replace(/<reader_(?:primary|secondary)_keywords>[\s\S]*?<\/reader_(?:primary|secondary)_keywords>/gi, '');
  }
  content = stripFences(content);
  if (content.length < ENTRY_MIN_LENGTH) throw Error(content ? '模型返回的条目太短' : '模型没有返回条目正文');
  const named = /(?:^|\n)\s*(?:姓名|名称|name)\s*[:：]\s*["']?([^"'\n#]+)/i.exec(content)?.[1];
  const entryName = sanitizeEntryName(tag('reader_entry_name')) || sanitizeEntryName(named) || sanitizeEntryName(fallbackName) || '未命名条目';
  return {entryName, content, primary: parseList(tag('reader_primary_keywords')), secondary: parseList(tag('reader_secondary_keywords'))};
}

/* ---------- 世界书条目 ---------- */
/** 条目上的记号（放在条目的 extra 里）：同一张角色卡的别的聊天再抽到这位角色时认得出来，不重复写。 */
export type EntryMarker = {key: string; work: string; character: string};
export const ENTRY_EXTRA_KEY = 'dream_gacha';
export const entryMarker = (pool: SmallPool, card: GachaCard): EntryMarker => ({key: `${pool.workKey}#${card.name}`, work: pool.work.title, character: card.name});
/** 模板的输出设置 + 模型写出的正文 → 酒馆助手的世界书条目。条目一律启用（书页还在手里）。 */
export function buildWorldbookEntry(template: EntryTemplate, result: ParsedEntry, marker: EntryMarker): Obj {
  const o = template.output, selective = o.strategyType === 'selective';
  let primary: string[] = [], secondary: string[] = [];
  if (selective) {
    if (o.keywordMode === 'manual') {primary = parseList(o.manualPrimary); secondary = parseList(o.manualSecondary);}
    else {primary = result.primary; secondary = result.secondary;}
    if (!primary.length) primary = uniq([result.entryName, marker.character]);
  }
  const entry = rec(sanitizeEntrySettings(o.passthroughSettings, true)), position = rec(entry.position);
  entry.name = result.entryName; entry.enabled = true;
  entry.strategy = {...rec(entry.strategy), type: o.strategyType, keys: selective ? uniq(primary) : [], keys_secondary: {logic: o.secondaryLogic, keys: selective ? uniq(secondary) : []}, scan_depth: o.scanDepth};
  entry.position = {...position, type: o.positionType, order: o.order};
  if (o.positionType === 'at_depth') Object.assign(entry.position as Obj, {role: o.role, depth: o.depth});
  else Object.assign(entry.position as Obj, {role: position.role ?? o.role, depth: position.depth ?? o.depth});
  entry.content = result.content; entry.probability = o.probability;
  entry.recursion = {delay_until: null, ...rec(entry.recursion), prevent_incoming: o.preventIncoming, prevent_outgoing: o.preventOutgoing};
  entry.effect = {sticky: null, cooldown: null, delay: null, ...rec(entry.effect)};
  entry.extra = {...rec(entry.extra), [ENTRY_EXTRA_KEY]: {v: 1, ...marker}};
  return entry;
}

/* ---------- 聊天里的记录 ---------- */
/** 世界书里的一条：哪本书、叫什么、编号（读不到编号时只按名字认）。 */
export type EntryRef = {book: string; name: string; uid?: number};
/** 背包里叫这个名字的角色书页对应世界书里的哪一条。held：书页还在（没有被回收）；enabled：我们最后一次把条目设成了什么。 */
export type EntryRecord = EntryRef & {marker: string; character: string; work: string; workKey: string; at: number; held: boolean; enabled: boolean};
export const ENTRY_RECORD_LIMIT = 300;
export function normalizeEntryRecords(raw: unknown): Record<string, EntryRecord> {
  const out: Record<string, EntryRecord> = {};
  for (const [key, value] of Object.entries(rec(raw)).slice(-ENTRY_RECORD_LIMIT)) {
    const r = rec(value), book = text(r.book, 120), name = text(r.name, 100), uid = Number(r.uid);
    if (!key || key.length > 160 || !book || !name) continue;
    out[key] = {
      book, name, ...(Number.isSafeInteger(uid) && r.uid !== null && r.uid !== undefined ? {uid} : {}), marker: text(r.marker, 200), character: text(r.character, 40), work: text(r.work, 60),
      workKey: text(r.workKey, 120), at: Number(r.at) || 0, held: r.held !== false, enabled: r.enabled !== false,
    };
  }
  return out;
}

/* ---------- 写世界书（酒馆助手） ---------- */
type Books = {primary?: string | null; additional?: string[]};
/** 酒馆助手里写世界书用到的部分（与模板系统用的是同一套接口）。 */
export type WorldbookWriter = WorldbookHelper & {
  getWorldbookNames?: () => unknown;
  createWorldbook?: (name: string) => unknown;
  createWorldbookEntries?: (name: string, entries: Obj[]) => unknown;
  updateWorldbookWith?: (name: string, updater: (entries: Obj[]) => Obj[]) => unknown;
  rebindCharWorldbooks?: (c: 'current', books: {primary: string | null; additional: string[]}) => unknown;
  setCurrentCharLorebooks?: (books: {primary: string | null; additional: string[]}) => unknown;
};
export const canWriteWorldbook = (h: WorldbookWriter | undefined): h is WorldbookWriter => !!h && typeof h.getWorldbook === 'function' && (typeof h.createWorldbookEntries === 'function' || typeof h.updateWorldbookWith === 'function');
const rowName = (e: Obj) => String(e.name ?? e.comment ?? '');
const rowMarker = (e: Obj) => {const m = rec(rec(e.extra)[ENTRY_EXTRA_KEY]).key; return typeof m === 'string' ? m : '';};
async function readRows(h: WorldbookWriter, book: string): Promise<Obj[]> {
  const rows: unknown = await h.getWorldbook!(book);
  return Array.isArray(rows) ? rows.map(rec) : [];
}
/** 目标世界书不存在就新建；没有挂在当前角色卡上就挂上（已有主世界书时挂成附加世界书）。 */
export async function ensureWorldbook(h: WorldbookWriter, target: string): Promise<string> {
  const book = target.trim();
  if (!book) throw Error('生成模板没有设置目标世界书');
  if (typeof h.getCharWorldbookNames !== 'function') throw Error('当前酒馆助手不支持读取角色卡绑定的世界书');
  const bound = rec(await Promise.resolve(h.getCharWorldbookNames('current'))) as Books;
  const primary = typeof bound.primary === 'string' && bound.primary ? bound.primary : null, additional = (Array.isArray(bound.additional) ? bound.additional : []).filter((n): n is string => typeof n === 'string' && !!n);
  if (primary === book || additional.includes(book)) return book;
  let exists = false;
  if (typeof h.getWorldbookNames === 'function') {try {const names: unknown = await Promise.resolve(h.getWorldbookNames()); exists = Array.isArray(names) && names.includes(book);} catch {/* 换个办法确认 */}}
  if (!exists) {try {await h.getWorldbook!(book); exists = true;} catch {/* 没有这本书 */}}
  if (!exists) {
    if (typeof h.createWorldbook !== 'function') throw Error('当前酒馆助手不支持创建世界书');
    await h.createWorldbook(book);
  }
  const next = {primary: primary ?? book, additional: primary ? uniq([...additional, book]) : additional};
  if (typeof h.rebindCharWorldbooks === 'function') await h.rebindCharWorldbooks('current', next);
  else if (typeof h.setCurrentCharLorebooks === 'function') await h.setCurrentCharLorebooks(next);
  else throw Error('世界书已创建，但当前酒馆助手不支持挂载到角色卡');
  return book;
}
/** 写进一个新条目。书里已有同名的别的条目时，名字后面加上作品名区分。 */
export async function writeWorldbookEntry(h: WorldbookWriter, target: string, entry: Obj): Promise<EntryRef> {
  const book = await ensureWorldbook(h, target), before = await readRows(h, book), taken = new Set(before.map(rowName)), work = text(rec(rec(entry.extra)[ENTRY_EXTRA_KEY]).work, 60);
  let name = rowName(entry) || '未命名条目';
  if (taken.has(name)) {const alt = work ? `${name}（《${work}》）` : `${name}（命运抽卡）`; name = alt; for (let i = 2; taken.has(name); i++) name = alt + i;}
  const row: Obj = {...entry, name};
  let created: unknown;
  if (typeof h.createWorldbookEntries === 'function') created = await h.createWorldbookEntries(book, [row]);
  else if (typeof h.updateWorldbookWith === 'function') await h.updateWorldbookWith(book, entries => {entries.push(row); return entries;});
  else throw Error('当前酒馆助手不支持写入世界书条目');
  // 取回编号：先看接口的返回值，再在书里找刚写进去的那一条。
  const fresh = rec((Array.isArray(rec(created).new_entries) ? rec(created).new_entries as unknown[] : [])[0]).uid, old = new Set(before.map(e => e.uid));
  let uid = typeof fresh === 'number' ? fresh : undefined;
  if (uid === undefined) {
    try {const mine = (await readRows(h, book)).filter(e => rowName(e) === name && e.content === row.content), hit = mine.filter(e => !old.has(e.uid)).at(-1) ?? mine.at(-1); if (typeof hit?.uid === 'number') uid = hit.uid;}
    catch {/* 读不回来就只按名字认 */}
  }
  return {book, name, ...(uid === undefined ? {} : {uid})};
}
/** 是不是我们写的那一条：记号对得上，或者编号与名字都对得上（没有编号时只看名字）。 */
const sameEntry = (e: Obj, ref: EntryRef, marker?: string) => (!!marker && rowMarker(e) === marker) || (rowName(e) === ref.name && (ref.uid === undefined || e.uid === ref.uid));
/** 启用 / 关闭一个条目（只改开关，不动内容）。返回书里还有没有这一条。 */
export async function setWorldbookEntryEnabled(h: WorldbookWriter, ref: EntryRef, enabled: boolean, marker?: string): Promise<boolean> {
  if (typeof h.updateWorldbookWith !== 'function') throw Error('当前酒馆助手不支持修改世界书条目');
  let found = false;
  await h.updateWorldbookWith(ref.book, entries => entries.map(e => {
    if (!sameEntry(rec(e), ref, marker)) return e;
    found = true;
    return e.enabled === enabled ? e : {...e, enabled};
  }));
  return found;
}
/** 这本世界书里带着这个记号的条目（书不存在时没有）。 */
export async function findMarkedEntry(h: WorldbookWriter, book: string, marker: string): Promise<(EntryRef & {enabled: boolean}) | undefined> {
  if (!book.trim() || !marker) return undefined;
  let rows: Obj[];
  try {rows = await readRows(h, book.trim());} catch {return undefined;}
  const hit = rows.find(e => rowMarker(e) === marker);
  return hit ? {book: book.trim(), name: rowName(hit), ...(typeof hit.uid === 'number' ? {uid: hit.uid} : {}), enabled: hit.enabled !== false} : undefined;
}

/* ---------- 宿主端口 ---------- */
/** 宿主提供的模板与世界书读写（读者：模板系统的模板库 + 酒馆助手）。 */
export type EntryPort = {
  templates(): TemplateLibrary;
  find(book: string, marker: string): Promise<(EntryRef & {enabled: boolean}) | undefined>;
  write(book: string, entry: Obj): Promise<EntryRef>;
  setEnabled(ref: EntryRef, enabled: boolean, marker?: string): Promise<boolean>;
};
/** guard：每次读写世界书前后都确认还在原来的聊天（聊天切换后旧的生成不落盘）。 */
export function worldbookEntryPort(helper: WorldbookWriter, templates: () => TemplateLibrary, guard: () => void = () => {}): EntryPort {
  const guarded = async <T>(run: () => Promise<T>): Promise<T> => {guard(); const out = await run(); guard(); return out;};
  return {
    templates,
    find: (book, marker) => guarded(() => findMarkedEntry(helper, book, marker)),
    write: (book, entry) => guarded(() => writeWorldbookEntry(helper, book, entry)),
    setEnabled: (ref, enabled, marker) => guarded(() => setWorldbookEntryEnabled(helper, ref, enabled, marker)),
  };
}
