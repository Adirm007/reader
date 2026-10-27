import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const text = JSON.parse(await readFile(new URL('../source/读者对话渲染.json', import.meta.url), 'utf8')).replaceString;
const gallery = text.slice(text.indexOf('function openDreamGallery('), text.indexOf('/* ---- 6. 额外人格库'));

// A DOM/event seam for the real gallery function. Events capture through window and
// bubble through document, as the host's keyboard and gesture listeners do.
class UIEvent {
  constructor(type, values = {}) { Object.assign(this, { type, bubbles: true, cancelable: true, stopped: false, immediate: false, defaultPrevented: false }, values); }
  stopPropagation() { this.stopped = true; }
  stopImmediatePropagation() { this.stopped = this.immediate = true; }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
}
class Node {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attributes = {}; this.style = {}; this.listeners = new Map(); this._text = ''; }
  set id(value) { this.attributes.id = value; } get id() { return this.attributes.id || ''; }
  set className(value) { this.attributes.class = value; } get className() { return this.attributes.class || ''; }
  get classList() { return { contains: name => this.className.split(/\s+/).includes(name), add: name => { this.className += ' ' + name; } }; }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { return this.tagName === '#window' || !!this.parentNode?.isConnected; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this._text = String(value); }
  set innerHTML(html) {
    this.textContent = '';
    const stack = [this], tokens = String(html).match(/<[^>]+>|[^<]+/g) || [];
    for (const token of tokens) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = /^<([\w-]+)/.exec(token)?.[1]; if (!tag) continue;
        const child = this.ownerDocument.createElement(tag);
        for (const [, key, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(key, value);
        stack.at(-1).appendChild(child);
        if (!['br', 'img', 'input'].includes(tag) && !token.endsWith('/>')) stack.push(child);
      } else stack.at(-1)._text += token;
    }
  }
  appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, before) { child.remove(); child.parentNode = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, child); return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  setAttribute(key, value) { this.attributes[key] = String(value); } getAttribute(key) { return this.attributes[key] ?? null; }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    return attribute ? this.getAttribute(attribute[1]) !== null && (attribute[2] === undefined || this.getAttribute(attribute[1]) === attribute[2]) : this.tagName === selector;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  querySelectorAll(selector) {
    const parts = selector.split(/\s+/), last = parts.pop(), out = [];
    for (const child of this.children) {
      if (child.matches(last) && (!parts.length || child.parentNode?.closest(parts.join(' ')))) out.push(child);
      out.push(...child.querySelectorAll(selector));
    }
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, fn, option) { const list = this.listeners.get(type) || []; list.push({ fn, capture: option === true || !!option?.capture }); this.listeners.set(type, list); }
  removeEventListener(type, fn, option) { const capture = option === true || !!option?.capture; this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.fn !== fn || entry.capture !== capture)); }
  dispatchEvent(event) {
    event.target ||= this;
    const path = []; for (let node = this; node; node = node.parentNode) path.push(node);
    const invoke = (node, capture) => {
      event.currentTarget = node;
      for (const entry of [...(node.listeners.get(event.type) || [])]) { if (entry.capture === capture) entry.fn.call(node, event); if (event.immediate) break; }
      if (!capture && !event.immediate && typeof node['on' + event.type] === 'function') node['on' + event.type](event);
    };
    for (const node of [...path].reverse()) { invoke(node, true); if (event.stopped) return !event.defaultPrevented; }
    for (const node of path) { invoke(node, false); if (event.stopped || !event.bubbles) break; }
    return !event.defaultPrevented;
  }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; } close() { this.open = false; }
}
function host({ deferred = false } = {}) {
  const win = new Node('#window'), doc = new Node('#document'); doc.ownerDocument = doc; doc.defaultView = win; win.document = doc;
  win.appendChild(doc); doc.documentElement = doc.appendChild(new Node('html', doc)); doc.head = doc.documentElement.appendChild(new Node('head', doc)); doc.body = doc.documentElement.appendChild(new Node('body', doc));
  doc.createElement = tag => new Node(tag, doc); doc.getElementById = id => doc.querySelector('#' + id);
  const items = Array.from({ length: 28 }, (_, i) => ({ title: 'Image ' + i, urls: ['image:' + i] }));
  const loads = [], leaked = { keys: 0, touches: 0, clicks: 0, swipes: 0 };
  doc.addEventListener('keydown', ev => { if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(ev.key)) leaked.keys++; });
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) doc.addEventListener(type, () => { leaked.touches++; });
  doc.addEventListener('click', () => { leaked.clicks++; }); doc.addEventListener('swiped-left', () => { leaked.swipes++; });
  const context = vm.createContext({ window: win, showToast() {}, getCustomPersonaHostDocument: () => doc, dreamGalleryCss() {}, dreamThemeFixCss() {}, getVisualTheme: () => 'cafe',
    dreamGalleryImg: d => d.createElement('img'), dreamGalleryDownload() {}, dreamGalleryLoad: () => deferred ? new Promise(resolve => loads.push(resolve)) : Promise.resolve(items) });
  vm.runInContext(gallery, context);
  const open = async () => { context.openDreamGallery(); await new Promise(resolve => setImmediate(resolve)); return doc.getElementById('dgl-overlay'); };
  return { win, doc, items, loads, leaked, open, click: node => node.dispatchEvent(new UIEvent('click')), key: (node, key) => node.dispatchEvent(new UIEvent('keydown', { key })) };
}

test('gallery arrows change one picture and never reach host message hotkeys', async () => {
  const h = host(), overlay = await h.open(); h.click(overlay.querySelector('.dgl-cell'));
  const right = new UIEvent('keydown', { key: 'ArrowRight' }); overlay.dispatchEvent(right);
  assert.match(overlay.querySelector('.dgl-cap2').textContent, /^2 \/ 28/); assert.equal(h.leaked.keys, 0); assert.equal(right.defaultPrevented, true);
  h.key(overlay, 'ArrowLeft'); assert.match(overlay.querySelector('.dgl-cap2').textContent, /^1 \/ 28/);
  h.key(overlay, 'Escape'); assert.equal(overlay.querySelector('.dgl-view'), null); assert.equal(h.leaked.keys, 0);
  h.key(overlay, 'ArrowRight'); assert.equal(h.leaked.keys, 0, 'an open grid must also protect host arrow shortcuts');
  h.key(overlay, 'Escape'); assert.equal(h.doc.getElementById('dgl-overlay'), null);
  h.key(h.doc.body, 'ArrowRight'); assert.equal(h.leaked.keys, 1, 'closing the gallery must restore host shortcuts');
});

test('gallery touch and derived swipe events stay local while native scrolling remains allowed', async () => {
  const h = host(), overlay = await h.open(); h.click(overlay.querySelector('.dgl-cell'));
  const target = overlay.querySelector('.dgl-stage'), touch = (x, y) => ({ clientX: x, clientY: y });
  const start = new UIEvent('touchstart', { touches: [touch(200, 100)] }); target.dispatchEvent(start);
  const move = new UIEvent('touchmove', { touches: [touch(100, 100)] }); target.dispatchEvent(move);
  target.dispatchEvent(new UIEvent('touchend', { changedTouches: [touch(100, 100)], touches: [] }));
  assert.match(overlay.querySelector('.dgl-cap2').textContent, /^2 \/ 28/); assert.equal(h.leaked.touches, 0); assert.equal(start.defaultPrevented, false); assert.equal(move.defaultPrevented, false);
  target.dispatchEvent(new UIEvent('swiped-left')); assert.equal(h.leaked.swipes, 0);
  h.click(overlay.querySelector('[data-v="back"]')); assert.equal(overlay.querySelector('.dgl-view'), null);
  const vertical = new UIEvent('touchmove', { touches: [touch(100, 300)] }); overlay.querySelector('.dgl-body').dispatchEvent(vertical);
  assert.equal(vertical.defaultPrevented, false, 'grid scrolling must retain its browser default');
});

test('buttons and repeated viewer back/page actions never leak clicks to host delegates', async () => {
  const h = host(), overlay = await h.open();
  for (let i = 0; i < 50; i++) {
    h.click(overlay.querySelector('.dgl-cell')); h.click(overlay.querySelector('[data-v="next"]'));
    assert.ok(overlay.querySelector('.dgl-view')); h.click(overlay.querySelector('[data-v="back"]'));
    assert.equal(overlay.querySelector('.dgl-view'), null);
    h.click(overlay.querySelectorAll('.dgl-pager button')[i % 3]);
  }
  assert.equal(h.leaked.clicks, 0);
});

test('reopening and closing the gallery removes its old window listeners', async () => {
  const h = host();
  for (let i = 0; i < 30; i++) await h.open();
  assert.equal((h.win.listeners.get('keydown') || []).length, 1);
  h.click(h.doc.getElementById('dgl-overlay').querySelector('[data-g="close"]'));
  assert.equal((h.win.listeners.get('keydown') || []).length, 0);
});

test('a slower initial listing cannot overwrite a completed manual refresh', async () => {
  const h = host({ deferred: true }), overlay = await h.open();
  h.click(overlay.querySelector('[data-g="refresh"]')); assert.equal(h.loads.length, 2);
  h.loads[1](h.items); await new Promise(resolve => setImmediate(resolve));
  assert.equal(overlay.querySelector('#dgl-count').textContent, '共 28 张');
  h.loads[0](h.items.slice(0, 1)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(overlay.querySelector('#dgl-count').textContent, '共 28 张');
  assert.equal(overlay.querySelectorAll('.dgl-pager button').length, 3);
});
