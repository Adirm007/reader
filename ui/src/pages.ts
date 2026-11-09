/* The five sub-pages (眼中的她, 故事定调, 人格解耦, 条目模仿, 彩蛋服务台). One markup for all themes: every
 * control keeps the data-dlb action, the .on/.cur state class, the .sv2 status text and the ids the legacy
 * handlers and sync functions read (契约表 §3–§5). What each theme draws — a menu book on the counter, a
 * cork board, a handscroll — lives in its pages.css and its PageSkin words. */
import type { Fragments, LobbyState, PageId, PageSkin, Theme } from './core/types';
import { act, esc, twoFrame, bookText } from './core/dom';

const THEMES: { id: Theme; name: string; note: string }[] = [
  { id: 'cafe', name: '咖啡馆', note: '雨夜的吧台' },
  { id: 'summer', name: '盛夏', note: '海边的邮局' },
  { id: 'ink', name: '水墨', note: '落雨的书案' },
];

const sv = (on: boolean, yes: string, no: string, id = ''): string =>
  `<span class="sv2${on ? '' : ' dim'}"${id ? ` id="${id}"` : ''}>${on ? yes : no}</span>`;

/** A row that opens something: name, one line of what it does, an optional value or price on the right. */
function row(attrs: string, name: string, desc: string, right = '', cls = ''): string {
  return `<button type="button" class="q-row${cls ? ' ' + cls : ''}"${attrs}><b class="q-nm">${name}</b><small class="q-ds">${desc}</small>${right}<i class="q-go" aria-hidden="true"></i></button>`;
}

/** A switch: the whole object toggles; .on and the .sv2 text are what dlbSyncEggs keeps up to date. */
function sw(action: string, no: number, name: string, desc: string, on: boolean, yes: string, nope: string, id = ''): string {
  return `<button type="button" class="q-sw${on ? ' on' : ''}"${act(action)} aria-pressed="${on}"><span class="q-no">${String(no).padStart(2, '0')}</span>`
    + `<b class="q-nm">${name}</b><small class="q-ds">${desc}</small>${sv(on, yes, nope, id)}<i class="q-knob" aria-hidden="true"></i></button>`;
}

function fold(action: string, k: string, name: string, desc: string, open: boolean, value: string, valueId: string, dim = false): string {
  const attrs = k ? act(action, { k }) : act(action);
  return `<button type="button" class="q-fold${open ? ' on' : ''}"${attrs}><b class="q-nm">${name}</b><small class="q-ds">${desc}</small>`
    + `<span class="sv2${dim ? ' dim' : ''}"${valueId ? ` id="${valueId}"` : ''}>${value}</span><i class="q-chev" aria-hidden="true"></i></button>`;
}

const hide = (open?: boolean): string => (open ? '' : ' style="display:none"');

function sec(key: string, w: Record<string, string>, body: string, cls = ''): string {
  return `<section class="q-sec q-sec-${key}${cls ? ' ' + cls : ''}"><h3 class="q-h">${w[key] || ''}</h3>${body}</section>`;
}

function persona(t: Theme, s: LobbyState, w: Record<string, string>): string {
  const cur = s.persona.id;
  const picks = `<button type="button" class="q-pick${cur === 'custom' ? ' cur' : ''}"${act('custompersona')}><b class="q-nm">${w.custom || '创作'}</b><small class="q-ds">只属于你的她</small></button>`
    + s.personas.map(p => `<button type="button" class="q-pick${p.id === cur ? ' cur' : ''}"${act('persona', { id: p.id })}><b class="q-nm">${esc(p.name)}</b><small class="q-ds">${esc(p.hint)}</small></button>`).join('');
  const photos = s.appearances.map((a, i) => `<button type="button" class="q-photo${a.id === s.appearance.id ? ' cur' : ''}"${act('appearance', { id: a.id })} style="--i:${i}">`
    + `<span class="q-pic"><img alt="" data-u4-img="${t}/avatar/${esc(a.id)}"></span><b class="q-nm">${esc(a.name)}</b></button>`).join('');
  return sec('who', w, `<div class="q-picks">${picks}</div>`
      + row(act('useraddress'), w.address || '称呼', '她怎么叫你；所有人格通用，空着就是原来的叫法', `<span class="sv2" id="dlb-user-address">${esc(s.address || '默认')}</span>`, 'q-addr'))
    + sec('look', w, `<div class="q-photos">${photos}</div><p class="q-note">换了打扮，大厅、信封和各处的她会一起换。</p>`);
}

function tuning(s: LobbyState, w: Record<string, string>): string {
  return `<p class="q-status" id="dlb-bookstatus"><span class="q-k">${w.shelf || '书架'}</span><b id="dlb-bookstat">${esc(bookText(s.books))}</b></p>`
    + sec('services', w,
      row(act('order', { text: '前往咖啡馆查看书架' }), '定调获取', '从书架上抽一本新的定调书目', '<span class="q-pr">1000 FP</span>')
      + row(act('order', { text: '写入主题' }), '主题写入', '把选定的主题写进故事', '<span class="q-pr">9999 FP</span>')
      + row(act('bookshelf'), '书架一瞥', '翻看已有的书目，或请夜梦当场写一本新的定调', '<span class="q-pr">3000 / 1500 FP</span>', 'q-shelf'));
}

function decouple(f: Fragments, w: Record<string, string>): string {
  return sec('pair', w, `<div class="q-paper"><div class="dlb-paper" id="dlb-decouple-ct">${f.decouple || ''}</div></div>`
    + '<p class="q-note">次人格的形象和主人格分开记；启用之前，先替它选一套形象。</p>');
}

function template(w: Record<string, string>): string {
  return sec('services', w,
    row(act('rts', { a: 'write' }), '编写', '选模板和参考资料，生成内容，按设置写进世界书', '<span class="q-chip">生成并写入</span>')
    + row(act('rts', { a: 'reverse' }), '从世界书反推模板', '读当前角色卡的主世界书和额外世界书，挑条目交给反推提示词', '<span class="q-chip">AI</span>')
    + row(act('rts', { a: 'manage' }), '模板管理', '保存、导入、导出、改名、删除，指定缘加强用哪一份', '<span class="q-chip">JSON</span>'));
}

function eggs(t: Theme, s: LobbyState, f: Fragments, w: Record<string, string>): string {
  const e = s.eggs, o = e.open || {};
  const sea = `<button type="button" class="q-door"${act('eggbooksea')}><b class="q-nm">进入普罗泰利西翁</b><small class="q-ds">书海迷宫。眼下的对话会留着；输入框里有草稿的话先存好。</small><span class="sv2">进入</span></button>`;
  const toggles = `<button type="button" class="q-sw q-mode${e.display === '悬浮' ? ' on' : ''}"${act('eggdisplay')}><span class="q-no">01</span><b class="q-nm">显示模式</b>`
      + `<small class="q-ds">默认：信嵌在聊天里。悬浮：收进屏幕右下角的信封。</small><span class="sv2" id="dlb-egg-dm">${esc(e.display)}</span><i class="q-knob" aria-hidden="true"></i></button>`
    + sw('eggunseal', 2, '自动拆信', '新信到了直接拆开，露出信纸', e.unseal, 'ON', 'OFF')
    + sw('eggsilent', 3, '静默模式', '占用降到最低；临时要用，就在输入里喊一声「夜梦」', e.silent, '已开启', '已关闭')
    + sw('eggbeautify', 4, '信封美化', '咖啡馆里的对话也装进信封；关掉回到「」格式', e.beautify, '已启用', '已禁用')
    + sw('eggletterlimit', 5, '发言限制', '每天只主动来一封信', e.letterLimit, '已启用', '已禁用')
    + sw('egghidefloat', 6, '隐藏常驻悬浮窗', '平时收起右下角的信封，有信时才出来', e.hideFloat, '已开启', '已关闭');
  const themeCards = THEMES.map(x => x.id === t
    ? `<div class="q-theme cur" aria-current="true"><span class="q-thumb" data-u4-bg="${x.id}/plate-wide"></span><b>${x.name}</b><small>${x.note} · 正在用</small></div>`
    : `<button type="button" class="q-theme"${act('eggtheme', { v: x.id })}><span class="q-thumb" data-u4-bg="${x.id}/plate-wide"></span><b>${x.name}</b><small>${x.note}</small></button>`).join('');
  const label = THEMES.find(x => x.id === t)?.name || '';
  const desk = fold('eggfold', 'theme', '主题', '信件、大厅和悬浮信封一起换', !!o.theme, label, 'dlb-fold-theme-sv')
    + `<div class="q-foldbody" id="dlb-fold-theme"${hide(o.theme)}><div class="q-themes">${themeCards}</div></div>`
    + fold('eggfold', 'yuan', '缘加强', '「买一份缘」按你的偏好生成邂逅对象', !!o.yuan, e.yuan ? '已启用' : '已禁用', 'dlb-fold-yuan-sv', !e.yuan)
    + `<div class="q-foldbody" id="dlb-fold-yuan"${hide(o.yuan)}>`
    + sw('eggyuan', 7, '功能开关', '开启后，「买一份缘」生成的角色直接写进世界书，不必再存一遍', e.yuan, '已启用', '已禁用', 'dlb-egg-yp')
    + `<label class="q-pref"><span class="q-k">偏好</span><textarea class="dlb-ta" id="dlb-yuan-pref" placeholder="写下你对角色的偏好或要求">${esc(e.yuanPref)}</textarea></label>`
    + `<div class="q-prefbar"><button type="button" class="q-save"${act('eggyuansave')}>保存偏好</button>`
    + `<button type="button" class="q-mini"${act('eggyuanstream')}>流式生成 <b id="dlb-egg-yps">${e.yuanStream ? '已启用' : '已禁用'}</b><i class="dlb-minisw${e.yuanStream ? ' on' : ''}"></i></button></div></div>`
    + row(act('eggpmgr'), '人格管理', '创作、保存、导入，或带走属于你的她')
    + row(act('eggdlc'), '额外人格库', '作者在线发布的人格，启用后收进你的人格库')
    + row(act('eggapi'), '独立 API', '几套方案一键切换；不设就走酒馆的连接', `<span class="sv2" id="dlb-egg-api">${esc(e.api)}</span>`)
    + row(act('eggwb'), '检查更新', '分别检查正则、脚本和世界书')
    + row(act('egggallery'), '相册', '作者发布的图，可以下载原图');
  const tools = fold('eggdisc', '', '唱片管理', '换专辑、播放顺序、增删歌曲', !!o.disc, o.disc ? '已展开' : '展开', '', !o.disc)
    + `<div class="q-paper" id="dlb-disc-wrap"${hide(o.disc)}><div class="dlb-paper" id="dlb-disc-ct">${o.disc ? f.disc || '' : ''}</div></div>`
    + fold('eggfont', '', '笔迹变更', '换信纸上的字', !!o.font, o.font ? '已展开' : '展开', '', !o.font)
    + `<div class="q-paper" id="dlb-font-wrap"${hide(o.font)}><div class="dlb-paper" id="dlb-font-ct">${o.font ? f.font || '' : ''}</div></div>`
    + fold('eggfsz', '', '大小调整', '信封卡片整体缩放', !!o.fsz, o.fsz ? '已展开' : '展开', '', !o.fsz)
    + `<div class="q-paper" id="dlb-fsz-wrap"${hide(o.fsz)}><div class="dlb-paper" id="dlb-fsz-ct">${o.fsz ? f.fsz || '' : ''}</div></div>`;
  return sec('sea', w, sea) + sec('toggles', w, `<div class="q-switches">${toggles}</div>`) + sec('desk', w, desk) + sec('tools', w, tools);
}

export function pageHTML(t: Theme, page: string, s: LobbyState, skin: PageSkin, f: Fragments): string {
  const id = (['persona', 'tuning', 'decouple', 'template', 'eggs'].indexOf(page) >= 0 ? page : 'persona') as PageId;
  const meta = skin.pages[id], w = skin.words;
  const body = id === 'persona' ? persona(t, s, w) : id === 'tuning' ? tuning(s, w) : id === 'decouple' ? decouple(f, w) : id === 'template' ? template(w) : eggs(t, s, f, w);
  return `<div class="u4-page q-p-${id}" data-u4-page="${id}" role="region" aria-labelledby="u4-pt">`
    + `<div class="q-sheet">${skin.ornament ? skin.ornament(id) : ''}<header class="q-head"><span class="q-mark" aria-hidden="true">${twoFrame(meta.prop)}</span>`
    + `<h2 class="q-title" id="u4-pt">${meta.title}</h2><p class="q-lede">${meta.lede}</p></header><div class="q-body">${body}</div></div></div>`;
}
