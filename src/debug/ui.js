// Shared UI kit for the debug editors: floating windows, property widgets, a recursive property grid, a 3D preview
// viewport with orbit camera, and the editor session (freezes the game, frees the mouse, gives keys to the editor).
import * as THREE from 'three';
import { Input } from '../core/Input.js';

const CSS = `
.ed-win{position:fixed;z-index:9000;background:rgba(18,20,26,.97);color:#dde3ea;font:12px/1.35 system-ui,Segoe UI,Arial,sans-serif;border:1px solid #3a4250;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden;resize:both;min-width:240px;min-height:120px;user-select:none}
.ed-win *{box-sizing:border-box}
.ed-title{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#232835;cursor:move;font-weight:600;letter-spacing:.3px;border-bottom:1px solid #333b48;flex:none}
.ed-title .sp{flex:1}.ed-title button{background:none;border:0;color:#aab;cursor:pointer;font-size:15px;padding:0 4px}.ed-title button:hover{color:#fff}
.ed-body{flex:1;overflow:auto;padding:8px;min-height:0}
.ed-row{display:flex;align-items:center;gap:6px;margin:3px 0;min-height:22px}
.ed-row>label{flex:0 0 38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aeb7c4}
.ed-row input[type=range]{flex:1;min-width:40px;accent-color:#e0a030}
.ed-row input[type=number]{width:64px}
.ed-win input,.ed-win select,.ed-win textarea{background:#0f1116;color:#e8edf3;border:1px solid #3a4250;border-radius:4px;padding:2px 4px;font:inherit}
.ed-win input[type=color]{width:42px;height:22px;padding:0 1px}
.ed-win textarea{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:11px}
.ed-btn{background:#2d3442;color:#e8edf3;border:1px solid #465064;border-radius:4px;padding:3px 9px;cursor:pointer;font:inherit;white-space:nowrap}
.ed-btn:hover{background:#3a4458}.ed-btn.on{background:#b07818;border-color:#e0a030;color:#fff}.ed-btn.warn{background:#5a2428;border-color:#8a3a40}
.ed-sec{border:1px solid #2c3340;border-radius:5px;margin:5px 0}
.ed-sec>.h{padding:4px 7px;background:#1d222c;cursor:pointer;color:#e0a030;font-weight:600}
.ed-sec>.h:before{content:'▾ ';color:#778}.ed-sec.closed>.h:before{content:'▸ '}
.ed-sec>.b{padding:4px 7px}.ed-sec.closed>.b{display:none}
.ed-list{border:1px solid #2c3340;border-radius:4px;overflow:auto;background:#0f1116}
.ed-list div{padding:3px 7px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-list div:hover{background:#232a36}.ed-list div.sel{background:#6a4a12;color:#fff}
.ed-list div small{color:#8a93a0;margin-left:6px}
.ed-cols{display:flex;gap:8px;height:100%;min-height:0}.ed-col{display:flex;flex-direction:column;min-height:0;min-width:0}
.ed-tabs{display:flex;gap:2px;flex-wrap:wrap;margin-bottom:6px}.ed-tabs .ed-btn{border-radius:4px 4px 0 0}
.ed-hint{color:#8a93a0;font-size:11px;margin:4px 0}
.ed-vp{position:relative;background:#1a1d24;border:1px solid #2c3340;border-radius:5px;overflow:hidden;min-height:120px}
.ed-vp canvas{display:block;width:100%;height:100%}
.ed-toast{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);z-index:9500;background:#b07818;color:#fff;padding:7px 16px;border-radius:6px;font:13px system-ui,sans-serif;pointer-events:none}
`;
let cssDone = false;
export function css() { if (cssDone || typeof document === 'undefined') return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'style' && typeof v === 'object') Object.assign(e.style, v); else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'cls') e.className = v; else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export function toast(msg, ms = 1800) { css(); const t = h('div', { cls: 'ed-toast' }, msg); document.body.appendChild(t); setTimeout(() => t.remove(), ms); }

// a draggable, resizable floating window
export class Win {
  constructor(title, { x = 40, y = 40, w = 420, h: hh = 400, onClose = null } = {}) {
    css(); this.onClose = onClose;
    this.el = h('div', { cls: 'ed-win', style: { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' } });
    this.titleEl = h('span', {}, title); this.extra = h('span', { style: { display: 'flex', gap: '4px' } });
    const bar = h('div', { cls: 'ed-title' }, this.titleEl, h('span', { cls: 'sp' }), this.extra, h('button', { title: 'Close', onclick: () => this.close() }, '✕'));
    this.body = h('div', { cls: 'ed-body' }); this.el.append(bar, this.body); document.body.appendChild(this.el);
    let drag = null; bar.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; drag = [e.clientX - this.el.offsetLeft, e.clientY - this.el.offsetTop]; bar.setPointerCapture(e.pointerId); });
    bar.addEventListener('pointermove', (e) => { if (!drag) return; this.el.style.left = Math.max(0, e.clientX - drag[0]) + 'px'; this.el.style.top = Math.max(0, e.clientY - drag[1]) + 'px'; });
    bar.addEventListener('pointerup', () => { drag = null; });
    for (const ev of ['keydown', 'keyup', 'wheel']) this.el.addEventListener(ev, (e) => e.stopPropagation()); // typing in the editor never reaches the game
  }
  close() { if (this.closed) return; this.closed = true; this.el.remove(); if (this.onClose) this.onClose(); }
}

// ---- widgets (each returns its row element; onChange receives the new value)
const fmt = (v, st) => (st >= 1 ? String(Math.round(v)) : (+v).toFixed(st >= 0.1 ? 1 : st >= 0.01 ? 2 : 3));
export function num(label, value, { min = 0, max = 1, step = 0.01 } = {}, onChange) {
  const r = h('input', { type: 'range', min, max, step, value }), n = h('input', { type: 'number', step, value: fmt(value, step) });
  r.addEventListener('input', () => { n.value = fmt(+r.value, step); onChange(+r.value); });
  n.addEventListener('change', () => { const v = +n.value; if (!Number.isFinite(v)) return; if (v < +r.min) r.min = v; if (v > +r.max) r.max = v; r.value = v; onChange(v); });
  const row = h('div', { cls: 'ed-row' }, h('label', { title: label }, label), r, n); row.set = (v) => { r.value = v; n.value = fmt(v, step); }; return row;
}
export function color(label, value, onChange) { const c = h('input', { type: 'color', value: toHex(value) }), t = h('input', { type: 'text', value: toHex(value), style: { width: '72px' } });
  c.addEventListener('input', () => { t.value = c.value; onChange(c.value); }); t.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) { c.value = t.value; onChange(t.value); } });
  const row = h('div', { cls: 'ed-row' }, h('label', { title: label }, label), c, t); row.set = (v) => { c.value = t.value = toHex(v); }; return row; }
export function check(label, value, onChange) { const c = h('input', { type: 'checkbox' }); c.checked = !!value; c.addEventListener('change', () => onChange(c.checked)); const row = h('div', { cls: 'ed-row' }, h('label', { title: label }, label), c); row.set = (v) => { c.checked = !!v; }; return row; }
export function select(label, options, value, onChange) { const s = h('select', { style: { flex: 1 } }, options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; const e = h('option', { value: v }, t); if (String(v) === String(value)) e.selected = true; return e; }));
  s.addEventListener('change', () => onChange(s.value)); const row = h('div', { cls: 'ed-row' }, h('label', { title: label }, label), s); row.set = (v) => { s.value = v; }; return row; }
export function text(label, value, onChange) { const t = h('input', { type: 'text', value: value ?? '', style: { flex: 1 } }); t.addEventListener('change', () => onChange(t.value)); return h('div', { cls: 'ed-row' }, h('label', { title: label }, label), t); }
export function btn(label, onClick, { title, cls } = {}) { return h('button', { cls: 'ed-btn' + (cls ? ' ' + cls : ''), title, onclick: onClick }, label); }
export function section(title, open = true, ...kids) { const b = h('div', { cls: 'b' }, ...kids); const s = h('div', { cls: 'ed-sec' + (open ? '' : ' closed') }, h('div', { cls: 'h', onclick: () => s.classList.toggle('closed') }, title), b); s.b = b; return s; }
export function toHex(v) { if (typeof v === 'number') return '#' + v.toString(16).padStart(6, '0'); if (typeof v === 'string' && /^#[0-9a-f]{3}$/i.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join(''); return typeof v === 'string' && /^#[0-9a-f]{6}/i.test(v) ? v.slice(0, 7) : '#808080'; }
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v);

// Recursive property grid over a plain object: numbers → slider (range guessed from the value or given in hints),
// '#rrggbb' strings → colour, booleans → checkbox, strings with known options → dropdown, arrays → one row per item,
// nested objects → collapsible section. hints: { 'path.to.key': { min, max, step, options, hidden, readOnly } }
export function propGrid(obj, onChange, hints = {}, path = '') {
  const out = h('div');
  for (const k of Object.keys(obj)) {
    const p = path ? path + '.' + k : k, v = obj[k], H = hints[p] || hints[k] || {}; if (H.hidden || k.startsWith('_')) continue;
    const set = (nv) => { obj[k] = nv; onChange(p, nv); };
    if (H.options) out.append(select(k, H.options, v, (s) => set(typeof v === 'number' ? +s : s === 'true' ? true : s === 'false' ? false : s)));
    else if (typeof v === 'number') { const a = Math.abs(v); const rg = H.min !== undefined ? H : Number.isInteger(v) && a >= 2 ? { min: 0, max: Math.max(10, a * 3), step: 1 } : a <= 1.5 ? { min: v < 0 ? -1.5 : 0, max: 1.5, step: 0.005 } : { min: 0, max: a * 2.5, step: a > 20 ? 0.5 : 0.01 };
      out.append(num(k, v, rg, set)); }
    else if (typeof v === 'boolean') out.append(check(k, v, set));
    else if (isHex(v)) out.append(color(k, v, set));
    else if (typeof v === 'string') out.append(text(k, v, set));
    else if (Array.isArray(v)) { const sec = section(k + ` [${v.length}]`, false); v.forEach((it, i) => { if (typeof it === 'number') sec.b.append(num(`${k}[${i}]`, it, Math.abs(it) <= 1.5 ? { min: -1.5, max: 1.5, step: 0.005 } : { min: 0, max: Math.abs(it) * 2.5, step: 0.01 }, (nv) => { v[i] = nv; onChange(p, v); }));
      else if (isHex(it)) sec.b.append(color(`${k}[${i}]`, it, (nv) => { v[i] = nv; onChange(p, v); })); else if (it && typeof it === 'object') sec.b.append(section(`${k}[${i}]`, false, propGrid(it, () => onChange(p, v), hints, p + '.' + i))); }); out.append(sec); }
    else if (v && typeof v === 'object') out.append(section(k, false, propGrid(v, (pp, nv) => onChange(pp, nv), hints, p)));
    else if (v === null && H.nullable) out.append(h('div', { cls: 'ed-row' }, h('label', {}, k), btn('set', () => set(H.nullable))));
  }
  return out;
}

// 3D preview viewport: its own small WebGL renderer + scene, orbit camera (left-drag orbit, right-drag pan, wheel zoom)
export class Viewport {
  constructor(parent, { bg = 0x23272f, target = [0, 0.9, 0], dist = 3.2, yaw = 0.5, pitch = 0.15, grid = true } = {}) {
    this.el = h('div', { cls: 'ed-vp' }); parent.append(this.el); this.canvas = h('canvas'); this.el.append(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: false }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(bg); this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 200);
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a4036, 1.25); const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(3, 5, 4); const rim = new THREE.DirectionalLight(0xbcd0ff, 0.8); rim.position.set(-3, 2.5, -4); this.scene.add(hemi, sun, rim);
    if (grid) { const g = new THREE.GridHelper(10, 20, 0x556070, 0x343a46); this.scene.add(g); }
    this.target = new THREE.Vector3(...target); this.dist = dist; this.yaw = yaw; this.pitch = pitch; this.onFrame = null; this.alive = true;
    let drag = null; this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (e) => { if (this.onPointer && this.onPointer('down', e)) return; drag = { b: e.button, x: e.clientX, y: e.clientY }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.onPointer && this.onPointer('move', e)) return; if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.b === 0) { this.yaw -= dx * 0.01; this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + dy * 0.01)); } else { const r = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), u = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1); this.target.addScaledVector(r, -dx * this.dist * 0.002).addScaledVector(u, dy * this.dist * 0.002); } });
    this.canvas.addEventListener('pointerup', (e) => { if (this.onPointer) this.onPointer('up', e); drag = null; });
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.max(0.3, Math.min(60, this.dist * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });
    let last = performance.now(); const loop = () => { if (!this.alive) return; requestAnimationFrame(loop); const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; this.render(dt); }; requestAnimationFrame(loop);
  }
  render(dt) {
    const w = this.el.clientWidth, hh = this.el.clientHeight; if (w < 2 || hh < 2) return; if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(hh * this.renderer.getPixelRatio())) { this.renderer.setSize(w, hh, false); this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); }
    if (this.onFrame) this.onFrame(dt);
    const c = Math.cos(this.pitch); this.camera.position.set(this.target.x + Math.sin(this.yaw) * c * this.dist, this.target.y + Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * c * this.dist); this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }
  ray(e) { const r = this.canvas.getBoundingClientRect(); const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); const rc = new THREE.Raycaster(); rc.setFromCamera(v, this.camera); return rc; }
  dispose() { this.alive = false; this.renderer.dispose(); this.renderer.forceContextLoss?.(); this.el.remove(); }
}

// one editor at a time: the game is frozen (still drawn for the map editor, not drawn behind the others), the mouse is free
let current = null;
export function beginSession(game, name, { hook = null, hideGame = false, onEnd = null } = {}) {
  if (current) current.end();
  const prevNoRender = game.noRender; Input.releaseLock?.(); Input.typing = true; Input.down?.clear?.();
  game.editorHook = hook || (() => {}); if (hideGame) game.noRender = true; if (game.hud?.root) game.hud.root.classList.add('hidden');
  const s = { name, end() { if (current !== s) return; current = null; game.editorHook = null; game.noRender = prevNoRender; Input.typing = false; Input.down?.clear?.(); game.last = performance.now(); if (game.hud?.root) game.hud.root.classList.remove('hidden'); if (onEnd) onEnd(); } };
  current = s; return s;
}
export function download(name, data, type = 'application/json') { const a = h('a', { href: URL.createObjectURL(new Blob([data], { type })), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
export function pickFile(accept = '.json') { return new Promise((res) => { const i = h('input', { type: 'file', accept, style: { display: 'none' } }); i.addEventListener('change', () => { const f = i.files[0]; i.remove(); res(f || null); }); document.body.appendChild(i); i.click(); }); }
