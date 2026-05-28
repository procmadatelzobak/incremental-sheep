// Minimální DOM stub (bez závislostí) pro testování UI v Node.
const registry = new Map();

class TextNode {
  constructor(t) { this.nodeType = 3; this._text = String(t); }
  get textContent() { return this._text; }
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.style = {};
    this.attributes = {};
    this._listeners = {};
    this.value = '';
    this.checked = false;
  }
  get className() { return this.attributes.class || ''; }
  set className(v) { this.attributes.class = v; }
  get disabled() { return !!this.attributes.disabled; }
  set disabled(v) { if (v) this.attributes.disabled = 'disabled'; else delete this.attributes.disabled; }
  setAttribute(k, v) {
    this.attributes[k] = v;
    if (k === 'id') registry.set(v, this);
    if (k === 'disabled') { /* keep */ }
    if (k === 'checked') this.checked = true;
    if (k === 'value') this.value = v;
  }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  get firstChild() { return this.children[0] || null; }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatch(type) { for (const fn of this._listeners[type] || []) fn({ target: this }); }
  click() { if (this.disabled) return; this.dispatch('click'); }
  get textContent() {
    if (this._textContent != null && this.children.length === 0) return this._textContent;
    let t = '';
    for (const c of this.children) t += (c.textContent || '');
    return t;
  }
  set textContent(v) { this.children = []; this._textContent = String(v); this.appendChild(new TextNode(v)); }
  set innerHTML(v) { this.children = []; this._textContent = ''; }
  contains(node) {
    if (node === this) return true;
    for (const c of this.children) { if (c === node) return true; if (c.contains && c.contains(node)) return true; }
    return false;
  }
  getContext() { return null; } // canvas → žádné kreslení
  _walk(out) { out.push(this); for (const c of this.children) if (c._walk) c._walk(out); }
  querySelectorAll(sel) {
    const all = []; this._walk(all); all.shift();
    if (sel.startsWith('#')) return all.filter(e => e.attributes && e.attributes.id === sel.slice(1));
    if (sel.startsWith('.')) return all.filter(e => (e.className || '').split(' ').includes(sel.slice(1)));
    const tag = sel.toUpperCase();
    return all.filter(e => e.tagName === tag);
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

const document = {
  createElement: (t) => new El(t),
  createTextNode: (t) => new TextNode(t),
  getElementById: (id) => registry.get(id) || null,
  activeElement: null,
  body: new El('body'),
};

export function installDom() {
  const app = new El('div');
  app.setAttribute('id', 'app');
  document.body.appendChild(app);
  globalThis.document = document;
  globalThis.window = { addEventListener() {} };
  return { document, app };
}

export function buttonsByText(rootEl, text) {
  return rootEl.querySelectorAll('button').filter(b => (b.textContent || '').includes(text));
}
export function allButtons(rootEl) { return rootEl.querySelectorAll('button'); }
