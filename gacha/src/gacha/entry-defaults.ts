/** 角色条目生成里随版本不同的默认值（读者版）。通用版（Reader-II）有自己的一份，entry.ts 两边相同。 */
/** 没有指定模板时优先用哪一个：读者模板系统自带的「常规命定角色生成」（source/template-system.js 的 DEFAULT_TEMPLATE_ID）。 */
export const PREFERRED_TEMPLATE_IDS: readonly string[] = ['reader-default-fated-character'];
/** 抽卡包自带的模板（模板库里存的那种形状）：读者版没有，一律从模板系统的模板库里取。 */
export const BUILTIN_ENTRY_TEMPLATES: readonly unknown[] = [];
/** 模板没有写目标世界书时写进哪一本：读者版不兜底（模板系统保存模板时一定带着）。 */
export const DEFAULT_ENTRY_BOOK = '';
/** 写条目时一并交给模型的世界观参考（世界书里名称包含这些字样的条目），用来把原作里的实力折算成这个世界的层级与品质。 */
export const DEFAULT_ENTRY_REFERENCES: readonly string[] = ['生命层级与社会阶级', '登神长阶', '品质效果限定'];
/** 设置页里说模板在哪里管理。 */
export const TEMPLATE_MANAGER_HINT = '模板在读者的「条目模仿 → 模板管理」里增删与修改';
