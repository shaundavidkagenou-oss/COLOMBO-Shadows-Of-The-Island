// Texture painter: a canvas editor used by the NPC editor (fabric / skin textures) and the map editor (textures for
// buildings, walls and placed objects). Brush, airbrush, eraser, flood fill, line, rectangle, ellipse, gradient, text, colour
// picker, smudge; size / opacity / hardness; pattern generators; image import; undo / redo; zoom. onChange fires as
// strokes land so the 3D texture updates live.
import { h, btn, num, color, select } from './ui.js';

const PATTERNS = {
  stripes: (g, w, hh, c1, c2, s) => { g.fillStyle = c1; g.fillRect(0, 0, w, hh); g.fillStyle = c2; for (let x = 0; x < w; x += s * 2) g.fillRect(x, 0, s, hh); },
  checks: (g, w, hh, c1, c2, s) => { for (let y = 0; y < hh; y += s) for (let x = 0; x < w; x += s) { g.fillStyle = ((x + y) / s) % 2 ? c2 : c1; g.fillRect(x, y, s, s); } },
  plaid: (g, w, hh, c1, c2, s) => { g.fillStyle = c1; g.fillRect(0, 0, w, hh); g.globalAlpha = 0.5; g.fillStyle = c2; for (let x = 0; x < w; x += s * 3) { g.fillRect(x, 0, s, hh); g.fillRect(0, x, w, s); } g.globalAlpha = 1; },
  dots: (g, w, hh, c1, c2, s) => { g.fillStyle = c1; g.fillRect(0, 0, w, hh); g.fillStyle = c2; for (let y = s / 2; y < hh; y += s) for (let x = ((y / s) % 2) * s / 2 + s / 2; x < w; x += s) { g.beginPath(); g.arc(x, y, s * 0.22, 0, 6.283); g.fill(); } },
  bricks: (g, w, hh, c1, c2, s) => { g.fillStyle = c2; g.fillRect(0, 0, w, hh); g.fillStyle = c1; const bh = s, bw = s * 2.2; for (let y = 0, r = 0; y < hh; y += bh, r++) for (let x = (r % 2) * -bw / 2; x < w; x += bw) g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3); },
  tiles: (g, w, hh, c1, c2, s) => { g.fillStyle = c2; g.fillRect(0, 0, w, hh); g.fillStyle = c1; for (let y = 0; y < hh; y += s) for (let x = 0; x < w; x += s) g.fillRect(x + 1, y + 1, s - 2, s - 2); },
  noise: (g, w, hh, c1, c2) => { g.fillStyle = c1; g.fillRect(0, 0, w, hh); const d = g.getImageData(0, 0, w, hh), a = d.data, b = hex(c2); for (let i = 0; i < a.length; i += 4) { const k = Math.random() * 0.5; a[i] += (b[0] - a[i]) * k; a[i + 1] += (b[1] - a[i + 1]) * k; a[i + 2] += (b[2] - a[i + 2]) * k; } g.putImageData(d, 0, 0); },
  batik: (g, w, hh, c1, c2, s) => { g.fillStyle = c1; g.fillRect(0, 0, w, hh); g.strokeStyle = c2; g.lineWidth = Math.max(1, s / 6); for (let y = 0; y < hh + s; y += s) for (let x = 0; x < w + s; x += s) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; g.ellipse(x, y, s * 0.4, s * 0.14, a, 0, 6.283); } g.stroke(); } },
  wood: (g, w, hh, c1, c2, s) => { g.fillStyle = c1; g.fillRect(0, 0, w, hh); g.strokeStyle = c2; g.globalAlpha = 0.45; for (let y = 0; y < hh; y += Math.max(2, s / 5)) { g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * s * 0.15); g.stroke(); } g.globalAlpha = 1; },
};
function hex(c) { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }

export class Painter {
  // canvas: the canvas to paint (painted in place); onChange(): called after changes (throttled to animation frames)
  constructor(parent, canvas, onChange = () => {}) {
    this.cv = canvas; this.g = canvas.getContext('2d', { willReadFrequently: true }); this.onChange = onChange; this.tool = 'brush'; this.col = '#c0392b'; this.col2 = '#f4e9d0'; this.size = 12; this.alpha = 1; this.hard = 0.7; this.zoom = 1; this.undo = []; this.redo = []; this.text = 'COLOMBO';
    const tools = [['brush', '🖌 Brush'], ['air', 'Airbrush'], ['erase', 'Eraser'], ['fill', 'Fill'], ['line', 'Line'], ['rect', 'Rect'], ['ellipse', 'Ellipse'], ['grad', 'Gradient'], ['text', 'Text'], ['pick', 'Picker'], ['smudge', 'Smudge']];
    this.toolBtns = tools.map(([id, t]) => { const b = btn(t, () => this.setTool(id)); b.dataset.t = id; return b; });
    this.view = h('canvas'); this.view.style.cssText = 'image-rendering:pixelated;cursor:crosshair;background:repeating-conic-gradient(#555 0 25%,#777 0 50%) 0/16px 16px;touch-action:none';
    const wrap = h('div', { style: { overflow: 'auto', flex: 1, minHeight: '160px', border: '1px solid #2c3340', borderRadius: '4px' } }, this.view);
    this.colRow = color('Colour', this.col, (v) => { this.col = v; }); this.col2Row = color('Colour 2', this.col2, (v) => { this.col2 = v; });
    const pat = select('Pattern', Object.keys(PATTERNS), 'stripes', (v) => { this.patName = v; }); this.patName = 'stripes'; this.patSize = 16;
    this.el = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', height: '100%', minHeight: 0 } },
      h('div', { cls: 'ed-tabs' }, this.toolBtns),
      this.colRow, this.col2Row,
      num('Size', this.size, { min: 1, max: 200, step: 1 }, (v) => { this.size = v; }), num('Opacity', this.alpha, { min: 0.02, max: 1, step: 0.01 }, (v) => { this.alpha = v; }), num('Hardness', this.hard, { min: 0, max: 1, step: 0.01 }, (v) => { this.hard = v; }),
      h('div', { cls: 'ed-row' }, h('label', {}, 'Text'), (() => { const t = h('input', { type: 'text', value: this.text, style: { flex: 1 } }); t.addEventListener('input', () => { this.text = t.value; }); return t; })()),
      h('div', { cls: 'ed-row' }, pat, num('Scale', 16, { min: 2, max: 128, step: 1 }, (v) => { this.patSize = v; })),
      h('div', { cls: 'ed-tabs' }, btn('Fill pattern', () => this.pattern()), btn('Fill colour', () => { this.snap(); this.g.globalAlpha = this.alpha; this.g.fillStyle = this.col; this.g.fillRect(0, 0, this.cv.width, this.cv.height); this.g.globalAlpha = 1; this.changed(); }),
        btn('Undo', () => this.doUndo()), btn('Redo', () => this.doRedo()), btn('Import image', () => this.importImage()), btn('Save PNG', () => { const a = h('a', { href: this.cv.toDataURL('image/png'), download: 'texture.png' }); a.click(); }),
        btn('−', () => this.setZoom(this.zoom / 1.5)), btn('+', () => this.setZoom(this.zoom * 1.5))),
      wrap);
    parent.append(this.el); this.setTool('brush'); this.setZoom(Math.min(1, 380 / canvas.width)); this.bind(); this.refresh();
  }
  setTool(t) { this.tool = t; for (const b of this.toolBtns) b.classList.toggle('on', b.dataset.t === t); }
  setZoom(z) { this.zoom = Math.max(0.1, Math.min(16, z)); this.view.style.width = this.cv.width * this.zoom + 'px'; this.view.style.height = this.cv.height * this.zoom + 'px'; }
  refresh() { if (this.view.width !== this.cv.width || this.view.height !== this.cv.height) { this.view.width = this.cv.width; this.view.height = this.cv.height; this.setZoom(this.zoom); } const v = this.view.getContext('2d'); v.clearRect(0, 0, this.view.width, this.view.height); v.drawImage(this.cv, 0, 0); if (this.preview) this.preview(v); }
  changed() { this.refresh(); if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.onChange(); }); }
  snap() { this.undo.push(this.g.getImageData(0, 0, this.cv.width, this.cv.height)); if (this.undo.length > 30) this.undo.shift(); this.redo.length = 0; }
  doUndo() { const d = this.undo.pop(); if (!d) return; this.redo.push(this.g.getImageData(0, 0, this.cv.width, this.cv.height)); this.g.putImageData(d, 0, 0); this.changed(); }
  doRedo() { const d = this.redo.pop(); if (!d) return; this.undo.push(this.g.getImageData(0, 0, this.cv.width, this.cv.height)); this.g.putImageData(d, 0, 0); this.changed(); }
  pattern() { this.snap(); const tmp = document.createElement('canvas'); tmp.width = this.cv.width; tmp.height = this.cv.height; PATTERNS[this.patName](tmp.getContext('2d'), tmp.width, tmp.height, this.col, this.col2, this.patSize); this.g.globalAlpha = this.alpha; this.g.drawImage(tmp, 0, 0); this.g.globalAlpha = 1; this.changed(); }
  async importImage() { const i = h('input', { type: 'file', accept: 'image/*' }); i.addEventListener('change', () => { const f = i.files[0]; if (!f) return; const img = new Image(); img.onload = () => { this.snap(); this.g.drawImage(img, 0, 0, this.cv.width, this.cv.height); this.changed(); URL.revokeObjectURL(img.src); }; img.src = URL.createObjectURL(f); }); i.click(); }
  pos(e) { const r = this.view.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * this.cv.width, (e.clientY - r.top) / r.height * this.cv.height]; }
  // one soft round dab (also used by the 3D paint mode through paintAt)
  dab(x, y, col = this.col, size = this.size, alpha = this.alpha, erase = this.tool === 'erase') {
    const g = this.g, r = size / 2; const gr = g.createRadialGradient(x, y, r * this.hard * 0.98, x, y, Math.max(r, 0.5)); const [R, G, B] = hex(col);
    gr.addColorStop(0, `rgba(${R},${G},${B},${alpha})`); gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.save(); if (erase) g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.beginPath(); g.arc(x, y, Math.max(r, 0.5), 0, 6.283); g.fill(); g.restore();
  }
  paintAt(x, y) { this.dab(x, y); this.changed(); } // external (3D) painting in canvas pixels
  bind() {
    let down = null, last = null; const V = this.view;
    V.addEventListener('pointerdown', (e) => { const p = this.pos(e); V.setPointerCapture(e.pointerId); const t = this.tool;
      if (t === 'pick') { const d = this.g.getImageData(Math.floor(p[0]), Math.floor(p[1]), 1, 1).data; this.col = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); this.colRow.set(this.col); return; }
      this.snap(); if (t === 'fill') { this.flood(p[0] | 0, p[1] | 0); this.changed(); return; }
      if (t === 'text') { this.g.save(); this.g.globalAlpha = this.alpha; this.g.fillStyle = this.col; this.g.font = `bold ${Math.max(6, this.size)}px system-ui,Arial`; this.g.textBaseline = 'middle'; this.g.fillText(this.text, p[0], p[1]); this.g.restore(); this.changed(); return; }
      down = p; last = p; if (t === 'brush' || t === 'erase' || t === 'air') { this.dab(p[0], p[1]); this.changed(); } });
    V.addEventListener('pointermove', (e) => { if (!down) return; const p = this.pos(e); const t = this.tool;
      if (t === 'brush' || t === 'erase') { const d = Math.hypot(p[0] - last[0], p[1] - last[1]), st = Math.max(1, this.size * 0.2); for (let s = st; s <= d; s += st) this.dab(last[0] + (p[0] - last[0]) * s / d, last[1] + (p[1] - last[1]) * s / d); if (d >= st) last = p; this.changed(); }
      else if (t === 'air') { for (let k = 0; k < 12; k++) { const a = Math.random() * 6.283, r = Math.random() * this.size; this.dab(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, this.col, Math.max(1, this.size * 0.12), this.alpha * 0.5, false); } this.changed(); }
      else if (t === 'smudge') { const s = Math.max(2, this.size | 0); const img = this.g.getImageData(last[0] - s / 2, last[1] - s / 2, s, s); const tmp = document.createElement('canvas'); tmp.width = tmp.height = s; tmp.getContext('2d').putImageData(img, 0, 0); this.g.globalAlpha = 0.5 * this.alpha; this.g.drawImage(tmp, p[0] - s / 2, p[1] - s / 2); this.g.globalAlpha = 1; last = p; this.changed(); }
      else { this.preview = (v) => this.shape(v, down, p); this.refresh(); } });
    V.addEventListener('pointerup', (e) => { if (!down) return; const p = this.pos(e); if (['line', 'rect', 'ellipse', 'grad'].includes(this.tool)) { this.shape(this.g, down, p); this.preview = null; this.changed(); } down = null; });
  }
  shape(g, a, b) { g.save(); g.globalAlpha = this.alpha; g.strokeStyle = g.fillStyle = this.col; g.lineWidth = this.size; g.lineCap = 'round';
    if (this.tool === 'line') { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    else if (this.tool === 'rect') g.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    else if (this.tool === 'ellipse') { g.beginPath(); g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, 6.283); g.fill(); }
    else if (this.tool === 'grad') { const gr = g.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, this.col); gr.addColorStop(1, this.col2); g.fillStyle = gr; g.fillRect(0, 0, this.cv.width, this.cv.height); }
    g.restore(); }
  flood(x, y) { const W = this.cv.width, H = this.cv.height; if (x < 0 || y < 0 || x >= W || y >= H) return; const d = this.g.getImageData(0, 0, W, H), a = d.data; const i0 = (y * W + x) * 4; const t = [a[i0], a[i0 + 1], a[i0 + 2], a[i0 + 3]]; const c = hex(this.col), al = Math.round(this.alpha * 255);
    const tol = 32, same = (i) => Math.abs(a[i] - t[0]) + Math.abs(a[i + 1] - t[1]) + Math.abs(a[i + 2] - t[2]) + Math.abs(a[i + 3] - t[3]) <= tol; const seen = new Uint8Array(W * H); const st = [x, y];
    while (st.length) { const yy = st.pop(), xx = st.pop(); const p = yy * W + xx; if (seen[p]) continue; const i = p * 4; if (!same(i)) continue; seen[p] = 1; const k = al / 255; a[i] += (c[0] - a[i]) * k; a[i + 1] += (c[1] - a[i + 1]) * k; a[i + 2] += (c[2] - a[i + 2]) * k; a[i + 3] = Math.max(a[i + 3], al);
      if (xx > 0) st.push(xx - 1, yy); if (xx < W - 1) st.push(xx + 1, yy); if (yy > 0) st.push(xx, yy - 1); if (yy < H - 1) st.push(xx, yy + 1); }
    this.g.putImageData(d, 0, 0); }
}
