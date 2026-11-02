// Pettah / market pavement stalls: ten different, modelled stall types instead of one repeated table.
// Each type is ONE merged geometry with one material (a shared canvas atlas x vertex colours), plus a separate canopy
// part (tarp, umbrella or tin roof) whose colour varies per stall through instance colours, and an optional glass part.
// Placement, collider and the customer spot are unchanged (CityPlan.js): every type fits the same 2.2 x 1.24 m footprint,
// front (customer side) = local +z.
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { RNG } from '../core/rng.js';

const AW = 1024, AH = 1024;
const CELLS = {};
let ATLAS = null;
const C3 = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const jit = (rng, c, k = 0.08) => { const f = 1 + (rng.next() - 0.5) * 2 * k; return [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)]; };

// ------------------------------------------------------------------ atlas
function cell(name, x, y, w, h, draw, a) {
  a.save(); a.beginPath(); a.rect(x, y, w, h); a.clip(); a.translate(x, y); draw(a, w, h); a.restore();
  CELLS[name] = [(x + 1) / AW, 1 - (y + h - 1) / AH, (x + w - 1) / AW, 1 - (y + 1) / AH];
}
function sign(a, w, h, bg, fg, lines) {
  a.fillStyle = bg; a.fillRect(0, 0, w, h); a.strokeStyle = fg; a.lineWidth = 3; a.strokeRect(4, 4, w - 8, h - 8);
  a.fillStyle = fg; a.textAlign = 'center'; a.textBaseline = 'middle';
  // columns sized by text width, everything squeezed uniformly only if the whole line does not fit
  const ws = lines.map(([t, font]) => { a.font = font; return a.measureText(t).width; }); const pad = 26; const tot = ws.reduce((x, y) => x + y, 0) + pad * (lines.length + 1);
  const k = Math.min(1, w / tot); let x = (w - tot * k) / 2 + pad * k;
  lines.forEach(([t, font], i) => { a.font = font; a.save(); a.translate(x + ws[i] * k / 2, h / 2 + 2); a.scale(k, 1); a.fillText(t, 0, 0); a.restore(); x += (ws[i] + pad) * k; });
}
function buildAtlas() {
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH; const a = cv.getContext('2d');
  const R = new RNG(77); const r = () => R.next();
  a.fillStyle = '#fff'; a.fillRect(0, 0, AW, AH);
  cell('white', 0, 0, 128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }, a);
  cell('wood', 128, 0, 128, 128, (g, w, h) => {
    g.fillStyle = '#b08a62'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(70,45,25,${0.08 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 1.6; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 6, w * 0.7, y + (r() - 0.5) * 6, w, y + (r() - 0.5) * 4); g.stroke(); }
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(60,38,20,0.35)'; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 4, 1.5 + r() * 2, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 40; i++) g.fillRect(r() * w, r() * h, 6 + r() * 20, 1);
  }, a);
  cell('batik', 256, 0, 128, 128, (g, w, h) => {
    g.fillStyle = '#7a2a1a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { const x = (i % 3) * 43 + 21, y = Math.floor(i / 3) * 43 + 21; g.strokeStyle = '#e8b04a'; g.lineWidth = 3; g.beginPath(); for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; g.ellipse(x + Math.cos(t) * 9, y + Math.sin(t) * 9, 7, 3, t, 0, 7); } g.stroke(); g.fillStyle = '#2a1a3a'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(30,15,10,0.35)'; g.lineWidth = 1; for (let i = 0; i < 40; i++) { g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 18); g.stroke(); }
  }, a);
  cell('check', 384, 0, 128, 128, (g, w, h) => {
    g.fillStyle = '#1f3d6b'; g.fillRect(0, 0, w, h); g.globalAlpha = 0.55;
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#c9a23a' : '#2f6a9a'; g.fillRect(i * 16, 0, 6, h); g.fillRect(0, i * 16, w, 6); }
    g.globalAlpha = 0.8; g.fillStyle = '#e8e0d0'; for (let i = 0; i < 4; i++) { g.fillRect(i * 32 + 12, 0, 1.5, h); g.fillRect(0, i * 32 + 12, w, 1.5); } g.globalAlpha = 1;
  }, a);
  cell('jute', 512, 0, 128, 128, (g, w, h) => {
    g.fillStyle = '#b8955e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = (x + y) % 8 ? 'rgba(90,65,30,0.3)' : 'rgba(230,200,140,0.25)'; g.fillRect(x, y, 3, 3); }
    g.fillStyle = 'rgba(60,40,20,0.5)'; g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.fillText('50 KG', w / 2, h * 0.55);
  }, a);
  cell('basket', 640, 0, 128, 128, (g, w, h) => {
    g.fillStyle = '#9a7240'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) for (let x = 0; x < w; x += 10) { const o = (y / 10) % 2 ? 5 : 0; g.fillStyle = 'rgba(210,170,110,0.75)'; g.fillRect(x + o, y + 1, 7, 7); g.fillStyle = 'rgba(60,40,20,0.4)'; g.fillRect(x + o + 7, y, 2, 10); }
  }, a);
  cell('pine', 768, 0, 128, 128, (g, w, h) => {
    g.fillStyle = '#a8742a'; g.fillRect(0, 0, w, h);
    for (let y = -8; y < h + 8; y += 12) for (let x = -8; x < w + 8; x += 12) { const o = (y / 12) % 2 ? 6 : 0; g.fillStyle = '#c99a3a'; g.beginPath(); g.moveTo(x + o, y - 6); g.lineTo(x + o + 6, y); g.lineTo(x + o, y + 6); g.lineTo(x + o - 6, y); g.fill(); g.fillStyle = '#5a6a2a'; g.fillRect(x + o - 1, y - 1, 2, 2); }
  }, a);
  cell('paper', 896, 0, 128, 128, (g, w, h) => {
    g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.font = '700 16px "Barlow Condensed", sans-serif'; g.fillText('THE DAILY', 8, 18);
    g.fillStyle = '#9a9a9a'; g.fillRect(8, 26, 70, 40); for (let i = 0; i < 12; i++) { g.fillStyle = '#555'; g.fillRect(84, 28 + i * 6, 36, 2); g.fillRect(8, 72 + (i % 9) * 6, i < 9 ? 112 : 0, 2); }
  }, a);
  // lottery seller's board: rows of tickets, each with a number band (no real lottery names)
  cell('lottery', 0, 128, 256, 128, (g, w, h) => {
    g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, w, h);
    const cols = ['#f2c230', '#e85a3a', '#3a9ae8', '#5ac85a', '#e85ab8', '#f29a30', '#8a5ae8', '#e8e8e8'];
    for (let row = 0; row < 5; row++) for (let i = 0; i < 9; i++) { const x = 4 + i * 28, y = 4 + row * 25; g.fillStyle = cols[(row * 3 + i) % cols.length]; g.fillRect(x, y, 25, 22); g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x + 2, y + 13, 21, 6); g.fillStyle = '#fff'; g.font = '700 6px sans-serif'; g.fillText(String(1000 + ((row * 37 + i * 91) % 9000)), x + 4, y + 18.5); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 3, y + 3, 19, 3); }
  }, a);
  cell('covers', 256, 128, 128, 128, (g, w, h) => {
    g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) g.fillRect(x, y, 2, 2);
    const cols = ['#111', '#e83a5a', '#3a7ae8', '#f2d230', '#7ac8e8', '#c83ae8', '#fff', '#3ac87a'];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) { const x = 6 + i * 24, y = 6 + row * 40; g.fillStyle = '#ccc'; g.fillRect(x + 8, y, 4, 4); g.fillStyle = cols[(row * 5 + i) % 8]; g.fillRect(x, y + 4, 20, 32); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, y + 6, 16, 2); g.fillStyle = '#222'; g.fillRect(x + 3, y + 8, 5, 5); }
  }, a);
  cell('packets', 384, 128, 128, 128, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    const cols = ['#e83a2a', '#f2b230', '#3a8ae8', '#2aa85a', '#e86a2a', '#8a3ae8'];
    for (let c = 0; c < 4; c++) for (let i = 0; i < 6; i++) { const x = c * 32 + 3, y = i * 21 + 2; g.fillStyle = cols[(c + i) % 6]; g.fillRect(x, y, 26, 19); g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(x + 13, y + 9, 8, 5, 0, 0, 7); g.fill(); g.fillStyle = cols[(c + i + 2) % 6]; g.fillRect(x + 7, y + 7, 12, 3); }
  }, a);
  cell('shoebox', 512, 128, 128, 128, (g, w, h) => { g.fillStyle = '#c8b090'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a2a2a'; g.fillRect(0, h * 0.65, w, h * 0.12); g.fillStyle = '#fff'; g.fillRect(w * 0.6, h * 0.2, w * 0.3, h * 0.3); g.fillStyle = '#222'; for (let i = 0; i < 6; i++) g.fillRect(w * 0.63, h * 0.24 + i * 5, w * 0.24, 1.5); }, a);
  cell('carton', 640, 128, 128, 128, (g, w, h) => { g.fillStyle = '#b8925a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(80,55,25,0.35)'; g.fillRect(0, h * 0.48, w, 6); g.strokeStyle = 'rgba(60,40,20,0.6)'; g.lineWidth = 2; g.strokeRect(w * 0.15, h * 0.15, w * 0.3, w * 0.22); g.beginPath(); g.moveTo(w * 0.3, h * 0.17); g.lineTo(w * 0.3, h * 0.34); g.moveTo(w * 0.22, h * 0.24); g.lineTo(w * 0.3, h * 0.17); g.lineTo(w * 0.38, h * 0.24); g.stroke(); }, a);
  cell('stripe', 768, 128, 128, 128, (g, w, h) => { const cs = ['#1a5a3a', '#e8d8a8', '#9a2a2a', '#e8d8a8']; for (let i = 0; i < 16; i++) { g.fillStyle = cs[i % 4]; g.fillRect(0, i * 8, w, i % 2 ? 3 : 8); } }, a);
  cell('floral', 896, 128, 128, 128, (g, w, h) => { g.fillStyle = '#f2e8d0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, c = ['#d83a5a', '#3a6ad8', '#e8a030'][i % 3]; for (let k = 0; k < 5; k++) { const t = k / 5 * Math.PI * 2; g.fillStyle = c; g.beginPath(); g.arc(x + Math.cos(t) * 4, y + Math.sin(t) * 4, 3.4, 0, 7); g.fill(); } g.fillStyle = '#f2d23a'; g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); g.fillStyle = '#3a8a3a'; g.fillRect(x + 4, y + 5, 6, 2); } }, a);
  // trilingual stall boards (English / Sinhala / Tamil where the wording is certain)
  const S = '700 34px "Noto Sans Sinhala", sans-serif', T = '700 28px "Noto Sans Tamil", sans-serif', E = '700 36px "Barlow Condensed", sans-serif';
  const signs = [
    ['sFruit', '#1f6a2a', '#fff6c8', [['FRUITS', E], ['පලතුරු', S], ['பழங்கள்', T]]],
    ['sVeg', '#f2d23a', '#1f4a1a', [['VEGETABLES', E], ['එළවළු', S], ['காய்கறிகள்', T]]],
    ['sCloth', '#7a1a2a', '#fff', [['SARONGS · SHIRTS', E], ['රෙදි', S], ['துணிகள்', T]]],
    ['sShoe', '#1a3a7a', '#fff', [['FOOTWEAR', E], ['පාවහන්', S], ['காலணிகள்', T]]],
    ['sHome', '#e8e8e8', '#b82a2a', [['HOUSEWARE', E], ['ගෘහ භාණ්ඩ', S]]],
    ['sMobile', '#111', '#3ae8ff', [['MOBILE ACCESSORIES', E], ['REPAIRS · RELOAD', E]]],
    ['sLotto', '#f2c230', '#8a1a1a', [['ලොතරැයි', S], ['LOTTERY', E]]],
    ['sSpice', '#8a3a1a', '#ffe8b0', [['SPICES · RICE', E], ['කුළුබඩු', S], ['வாசனைப் பொருட்கள்', T]]],
    ['sBetel', '#2a5a2a', '#fff', [['බුලත්', S], ['BETEL · SWEETS', E]]],
    ['sFlower', '#f2f2ea', '#a82a6a', [['FLOWERS', E], ['මල්', S], ['பூக்கள்', T]]],
  ];
  signs.forEach(([name, bg, fg, lines], i) => cell(name, (i % 2) * 512, 256 + Math.floor(i / 2) * 64, 512, 64, (g, w, h) => sign(g, w, h, bg, fg, lines), a));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return t;
}

// ------------------------------------------------------------------ geometry helpers (all write into one builder)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const GEOS = {};
function protoGeo(key, make) { return GEOS[key] || (GEOS[key] = make()); }
function remapUV(g, cellName) {
  const c = CELLS[cellName]; const uv = g.attributes.uv; const out = g.clone(); const u2 = out.attributes.uv;
  for (let i = 0; i < uv.count; i++) u2.setXY(i, c[0] + (c[2] - c[0]) * uv.getX(i), c[1] + (c[3] - c[1]) * uv.getY(i));
  return out;
}
class SB {
  constructor(seed) { this.mb = new MeshBuilder(); this.cb = new MeshBuilder(); this.gb = new MeshBuilder(); this.rng = new RNG(seed); this.tint = true; }
  uv(cellName) { const c = CELLS[cellName || 'white']; return cellName && cellName !== 'white' ? c : [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2, (c[0] + c[2]) / 2, (c[1] + c[3]) / 2]; }
  box(x, y, z, sx, sy, sz, col, cellName, rotY = 0, b = this.mb) { b.box(x, y, z, sx, sy, sz, { col: typeof col === 'string' ? C3(col) : col, uvRect: this.uv(cellName), rotY, bottom: true }); return this; }
  // any THREE geometry, placed with position / euler / scale, uv squeezed into an atlas cell
  geo(key, make, x, y, z, rx, ry, rz, sx, sy, sz, col, cellName = 'white', b = this.mb) {
    const base = protoGeo(key + '|' + cellName, () => remapUV(make(), cellName));
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    b.geometry(base, _m, typeof col === 'string' ? C3(col) : col); return this;
  }
  cyl(x, y, z, r0, r1, h, col, { seg = 10, cellName = 'white', open = false, rx = 0, rz = 0, ry = 0, b } = {}) {
    return this.geo(`cyl${seg}${open ? 'o' : ''}${r0 === r1 ? 's' : (r1 / r0).toFixed(2)}`, () => new THREE.CylinderGeometry(r1 / r0, 1, 1, seg, 1, open), x, y, z, rx, ry, rz, r0, h, r0, col, cellName, b);
  }
  sph(x, y, z, r, col, { sy = 1, seg = 7, cellName = 'white', b } = {}) { return this.geo('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg - 2)), x, y, z, 0, this.rng.next() * 6, 0, r, r * sy, r, col, cellName, b); }
  tor(x, y, z, R, r, arc, col, rx = 0, ry = 0, rz = 0, b) { return this.geo(`tor${arc.toFixed(2)}${(r / R).toFixed(3)}`, () => new THREE.TorusGeometry(1, r / R, 5, 10, arc), x, y, z, rx, ry, rz, R, R, R, col, 'white', b); }
  cone(x, y, z, r, h, col, rx = 0, ry = 0, rz = 0, seg = 6) { return this.geo('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg), x, y, z, rx, ry, rz, r, h, r, col, 'white'); }
  pipe(a, b, r, col, seg = 6) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length(); d.normalize(); _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const base = protoGeo('pipe' + seg + '|white', () => remapUV(new THREE.CylinderGeometry(1, 1, 1, seg, 1, true), 'white'));
    _m.compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(r, L, r)); this.mb.geometry(base, _m, typeof col === 'string' ? C3(col) : col); return this;
  }
  // timber trestle table: planked top with gaps, apron, legs, cross brace
  table(w, d, h, z = 0, col = '#9a7a56') {
    const n = Math.max(3, Math.round(d / 0.16)); const pw = d / n;
    for (let i = 0; i < n; i++) this.box(0, h - 0.015, z - d / 2 + pw * (i + 0.5), w, 0.028, pw - 0.008, jit(this.rng, C3(col), 0.1), 'wood');
    for (const s of [-1, 1]) { this.box(0, h - 0.07, z + s * (d / 2 - 0.03), w - 0.1, 0.08, 0.022, C3(col), 'wood'); this.box(s * (w / 2 - 0.06), h - 0.07, z, 0.022, 0.08, d - 0.08, C3(col), 'wood'); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(sx * (w / 2 - 0.07), (h - 0.03) / 2, z + sz * (d / 2 - 0.06), 0.05, h - 0.03, 0.05, C3(col), 'wood');
    for (const sx of [-1, 1]) this.box(sx * (w / 2 - 0.07), 0.18, z, 0.03, 0.04, d - 0.14, C3(col), 'wood');
    return this;
  }
  // steel-pipe frame: four poles + top rails (front higher than back for rain run-off)
  frame(x0, x1, z0, z1, hb, hf, col = '#5a5e60') {
    for (const [x, z, h] of [[x0, z0, hb], [x1, z0, hb], [x0, z1, hf], [x1, z1, hf]]) { this.pipe([x, 0, z], [x, h, z], 0.022, col); this.cyl(x, 0.02, z, 0.05, 0.05, 0.04, '#3a3a3a', { seg: 8 }); }
    this.pipe([x0, hb, z0], [x1, hb, z0], 0.018, col); this.pipe([x0, hf, z1], [x1, hf, z1], 0.018, col);
    this.pipe([x0, hb, z0], [x0, hf, z1], 0.018, col); this.pipe([x1, hb, z0], [x1, hf, z1], 0.018, col);
    return this;
  }
  // tarp over the frame: sagging cloth with a hem valance at the front, ropes tied to the poles
  tarp(x0, x1, z0, z1, hb, hf, { sag = 0.07, val = 0.16, col = '#ffffff', stripes = null } = {}) {
    const nx = 10, nz = 5; const cb = this.cb; const ext = 0.12;
    const P = (i, k) => { const u = i / nx, v = k / nz; const x = x0 - ext + (x1 - x0 + 2 * ext) * u, z = z0 - ext + (z1 - z0 + 2 * ext) * v; const y = hb + (hf - hb) * v + 0.03 - sag * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 1.2 - (Math.sin(u * 23) * 0.008); return [x, y, z]; };
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { const c = stripes ? C3(stripes[i % stripes.length]) : C3(col); cb.quad(P(i, k), P(i + 1, k), P(i + 1, k + 1), P(i, k + 1), [i / nx * 3, k / nz * 2, (i + 1) / nx * 3, (k + 1) / nz * 2], c); }
    // front valance with scalloped hem (small hanging folds)
    for (let i = 0; i < nx; i++) { const a = P(i, nz), b = P(i + 1, nz); const c = stripes ? C3(stripes[i % stripes.length]) : C3(col); const d1 = val * (0.85 + 0.15 * Math.sin(i * 1.7)); cb.quad([a[0], a[1] - d1, a[2] + 0.005], [b[0], b[1] - d1, b[2] + 0.005], b, a, [0, 0, 1, 0.3], c); }
    for (const [x, z, h] of [[x0, z0, hb], [x1, z0, hb], [x0, z1, hf], [x1, z1, hf]]) this.pipe([x, h - 0.02, z], [x + Math.sign(x) * 0.12, h + 0.02, z + Math.sign(z) * 0.12], 0.005, '#d8d0b0', 4);
    return this;
  }
  // big market umbrella: eight panels alternating colour, ribs, pole in a weighted base
  umbrella(x, z, R, h, cA = '#ffffff', cB = '#e8e8e8') {
    const cb = this.cb; const n = 8; const top = [x, h + 0.32, z]; this.tint = false;
    for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; const p0 = [x + Math.cos(a0) * R, h, z + Math.sin(a0) * R], p1 = [x + Math.cos(a1) * R, h, z + Math.sin(a1) * R]; const m = [(p0[0] + p1[0] + top[0]) / 3, h + 0.14, (p0[2] + p1[2] + top[2]) / 3]; const c = C3(i % 2 ? cA : cB);
      void m; const pm = [(p0[0] + p1[0]) / 2, h + 0.03, (p0[2] + p1[2]) / 2];
      cb.quad(p0, pm, top, top, [0, 0, 1, 1], c); cb.quad(pm, p1, top, top, [0, 0, 1, 1], c);
      cb.quad([p0[0], h - 0.1, p0[2]], [pm[0], h - 0.06, pm[2]], pm, p0, [0, 0, 1, 0.3], c); cb.quad([pm[0], h - 0.06, pm[2]], [p1[0], h - 0.1, p1[2]], p1, pm, [0, 0, 1, 0.3], c);
      this.pipe([x, h - 0.35, z], [x + Math.cos(a0) * R * 0.55, h + 0.05, z + Math.sin(a0) * R * 0.55], 0.006, '#888', 4); }
    this.pipe([x, 0.1, z], [x, h + 0.36, z], 0.02, '#d8d8d8'); this.cyl(x, 0.05, z, 0.22, 0.2, 0.1, '#3a3a3a', { seg: 12 });
    return this;
  }
  // corrugated tin roof (on the canopy builder) with ridges
  tin(x0, x1, z0, z1, hb, hf, col = '#b8b8b0') {
    const n = 16; const cb = this.cb; this.tint = false;
    for (let i = 0; i < n; i++) { const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 0.5) / n, xc = x0 + (x1 - x0) * (i + 1) / n; const c = C3(col);
      cb.quad([xa, hb, z0], [xb, hb + 0.02, z0], [xb, hf + 0.02, z1], [xa, hf, z1], [0, 0, 1, 1], c); cb.quad([xb, hb + 0.02, z0], [xc, hb, z0], [xc, hf, z1], [xb, hf + 0.02, z1], [0, 0, 1, 1], c); }
    return this;
  }
  signBoard(name, x, y, z, w, h, rotY = 0) { this.box(x, y, z, w, h, 0.02, '#ffffff', name, rotY); this.box(x, y + h / 2 + 0.01, z, w + 0.03, 0.02, 0.03, '#5a4a3a', 'wood', rotY); return this; }
  crate(x, y, z, w, h, d, col = '#c8a070') {
    const c = jit(this.rng, C3(col), 0.12); const ns = 3;
    for (let i = 0; i < ns; i++) { const yy = y + h * (i + 0.5) / ns; this.box(x, yy, z + d / 2 - 0.006, w, h / ns - 0.025, 0.012, c, 'wood'); this.box(x, yy, z - d / 2 + 0.006, w, h / ns - 0.025, 0.012, c, 'wood'); this.box(x + w / 2 - 0.006, yy, z, 0.012, h / ns - 0.025, d, c, 'wood'); this.box(x - w / 2 + 0.006, yy, z, 0.012, h / ns - 0.025, d, c, 'wood'); }
    this.box(x, y + 0.008, z, w - 0.02, 0.016, d - 0.02, c, 'wood'); return this;
  }
  // a mound of round produce (onions, fruit) in a shallow pile
  heap(x, y, z, rx, rz, n, r, cols, { sy = 1, cellName = 'white', seg = 6 } = {}) {
    const R = this.rng;
    for (let i = 0; i < n; i++) { const a = R.next() * Math.PI * 2, d = Math.sqrt(R.next()); const px = x + Math.cos(a) * rx * d, pz = z + Math.sin(a) * rz * d; const py = y + r * sy + (1 - d) * r * 1.6 * Math.min(1, n / 12) + R.next() * r * 0.3; this.sph(px, py, pz, r * (0.85 + R.next() * 0.3), jit(R, C3(R.pick(cols)), 0.1), { sy, cellName, seg }); }
    return this;
  }
  basket(x, y, z, r, h, col = '#ffffff') { this.cyl(x, y + h / 2, z, r * 0.8, r, h, col, { seg: 12, cellName: 'basket', open: true }); this.tor(x, y + h, z, r, 0.012, Math.PI * 2, '#7a5a30', Math.PI / 2); this.cyl(x, y + 0.005, z, r * 0.8, r * 0.8, 0.01, '#7a5a30', { seg: 12 }); return this; }
  stool(x, z, col = '#2a6ab8') { this.cyl(x, 0.21, z, 0.16, 0.13, 0.42, col, { seg: 10, open: true }); this.cyl(x, 0.43, z, 0.17, 0.17, 0.025, col, { seg: 12 }); return this; }
  bulb(x, y, z) { this.pipe([x, y + 0.35, z], [x, y + 0.04, z], 0.003, '#222', 3); this.sph(x, y, z, 0.035, '#fff4d8', { seg: 6 }); return this; }
  build(mat, canopyMat, glassMat) {
    const parts = [{ geo: this.mb.build(), mat }]; const cg = this.cb.build(); if (cg) parts.push({ geo: cg, mat: canopyMat, tint: this.tint }); const gg = this.gb.build(); if (gg) parts.push({ geo: gg, mat: glassMat, noShadow: true });
    return parts;
  }
}

// ------------------------------------------------------------------ the ten stall types
const POLE = { x0: -1.04, x1: 1.04, z0: -0.56, z1: 0.56 };
const TYPES = [
  // 0 fruit: tiered crates, hanging banana bunches, pineapples, a pile of king coconuts (thambili), rambutan, mangoes
  (s) => {
    s.frame(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.15, 2.3).tarp(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.15, 2.3, { stripes: ['#ffffff', '#f2f2f2'] });
    s.table(1.9, 0.9, 0.62, 0.02);
    // stepped display: two rows of crates, back row raised
    for (let i = 0; i < 4; i++) { s.crate(-0.68 + i * 0.45, 0.62, 0.22, 0.42, 0.16, 0.36); s.crate(-0.68 + i * 0.45, 0.78, -0.22, 0.42, 0.2, 0.36); }
    s.heap(-0.68, 0.64, 0.22, 0.15, 0.13, 22, 0.032, ['#c81e1e', '#d8321e', '#b8141e'], { seg: 6 });
    s.heap(-0.23, 0.64, 0.22, 0.14, 0.12, 9, 0.055, ['#e8a830', '#d89a2a', '#b8b83a'], { sy: 1.3 });
    s.heap(0.22, 0.64, 0.22, 0.14, 0.12, 12, 0.042, ['#f2c83a', '#e8b030', '#e89a2a'], { sy: 0.9 });
    s.heap(0.67, 0.64, 0.22, 0.14, 0.12, 16, 0.03, ['#7a3a5a', '#6a2a4a', '#8a4a2a']);
    for (let i = 0; i < 4; i++) s.geo('pineB', () => new THREE.SphereGeometry(1, 8, 6), -0.78 + i * 0.16, 1.07, -0.24, 0, i, 0, 0.065, 0.11, 0.065, '#ffffff', 'pine');
    for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) s.cone(-0.78 + i * 0.16 + Math.cos(k) * 0.02, 1.22, -0.24 + Math.sin(k) * 0.02, 0.012, 0.14, '#3a6a2a', Math.cos(k) * 0.4, 0, Math.sin(k) * 0.4, 4);
    s.heap(0.4, 0.98, -0.22, 0.17, 0.13, 10, 0.05, ['#8a3a1a', '#9a4a1a', '#7a5a2a'], { sy: 1.1 });
    // hanging bunches of bananas from the back rail
    for (const bx of [-0.7, -0.15, 0.45]) {
      s.pipe([bx, 2.12, -0.5], [bx, 1.75, -0.5], 0.004, '#a89a70', 3); s.cyl(bx, 1.55, -0.5, 0.022, 0.018, 0.45, '#6a7a3a', { seg: 6 });
      for (let tier = 0; tier < 4; tier++) for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + tier * 0.4; s.tor(bx + Math.cos(a) * 0.045, 1.72 - tier * 0.1, -0.5 + Math.sin(a) * 0.045, 0.11, 0.019, 1.1, tier < 2 ? '#d8c83a' : '#a8b83a', 0, -a, -0.2); }
    }
    // king coconuts on the ground in front
    s.heap(0.55, 0, 0.42, 0.22, 0.12, 9, 0.095, ['#e88a2a', '#f29a3a', '#d87a1a'], { sy: 1.15, seg: 8 });
    s.signBoard('sFruit', 0, 2.03, 0.7, 1.3, 0.16).stool(-0.75, -0.48).bulb(0.1, 1.95, 0);
  },
  // 1 vegetables: woven baskets of onions, chillies, tomatoes, carrots, beans bundles, a hanging balance scale, umbrella
  (s) => {
    s.umbrella(0, 0, 1.25, 2.15, '#2a8a3a', '#f2f2ea'); s.table(1.9, 1.0, 0.55, 0);
    const B = [[-0.65, 0.25, ['#9a3a4a', '#a84a5a', '#8a2a3a'], 0.03, 1], [-0.22, 0.25, ['#2a8a2a', '#3a9a2a', '#1a7a1a'], 0.012, 2.8], [0.22, 0.25, ['#d8321e', '#c82a1a', '#e84a2a'], 0.04, 1], [0.65, 0.25, ['#e87a1a', '#f28a2a'], 0.018, 3.2],
      [-0.65, -0.22, ['#e8d8b8', '#d8c8a8'], 0.04, 1], [-0.22, -0.22, ['#7a6a3a', '#8a7a4a'], 0.035, 1.1], [0.22, -0.22, ['#3a7a2a', '#4a8a3a'], 0.05, 1.3], [0.65, -0.22, ['#e8e0d0', '#f2ead8'], 0.045, 1]];
    for (const [x, z, cols, r, sy] of B) { s.basket(x, 0.55, z, 0.19, 0.11); s.heap(x, 0.6, z, 0.13, 0.13, sy > 2 ? 26 : 14, r, cols, { sy, seg: 5 }); }
    // long beans bundles and a gotukola bunch at the front edge
    for (let i = 0; i < 5; i++) { const bx = -0.8 + i * 0.4; for (let j = 0; j < 9; j++) { const a = j / 9 * Math.PI * 2, rr = j ? 0.016 : 0; s.pipe([bx + Math.cos(a) * rr, 0.57 + Math.sin(a) * rr * 0.6, 0.33], [bx + Math.cos(a) * rr * 1.6 + (s.rng.next() - 0.5) * 0.03, 0.57 + Math.sin(a) * rr, 0.62], 0.005, j % 2 ? '#4a9a2a' : '#3a8a22', 4); } s.tor(bx, 0.57, 0.42, 0.024, 0.004, Math.PI * 2, '#c83a2a', 0, 0, 0); }
    // hanging balance scale with two pans
    s.pipe([0.85, 2.0, 0], [0.85, 1.6, 0], 0.004, '#888', 3); s.box(0.85, 1.6, 0, 0.36, 0.012, 0.012, '#9a9a9a');
    for (const dx of [-0.17, 0.17]) { for (const a of [0, 2.1, 4.2]) s.pipe([0.85 + dx, 1.6, 0], [0.85 + dx + Math.cos(a) * 0.07, 1.38, Math.sin(a) * 0.07], 0.002, '#888', 3); s.cyl(0.85 + dx, 1.37, 0, 0.08, 0.09, 0.02, '#b8b8b8', { seg: 12 }); }
    s.signBoard('sVeg', 0, 1.95, 0.0, 1.3, 0.16).stool(0.8, -0.48, '#c83a2a');
    s.box(-0.85, 0.15, -0.42, 0.34, 0.3, 0.28, '#ffffff', 'carton');
  },
  // 2 textiles: garment rail with hanging sarongs and shirts, folded stacks on the table, check and batik
  (s) => {
    s.frame(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.2, 2.3).tarp(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.2, 2.3, { col: '#ffffff', sag: 0.05 });
    s.table(1.9, 0.62, 0.75, 0.2);
    // back hanging rail with garments on hangers
    s.pipe([POLE.x0, 1.85, -0.5], [POLE.x1, 1.85, -0.5], 0.012, '#7a7a7a');
    const cl = ['batik', 'check', 'stripe', 'floral', 'check', 'batik', 'white', 'stripe', 'floral', 'check'];
    const tints = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#c8e0ff', '#ffe0c8', '#2a4a8a', '#ffffff', '#e8ffd8', '#ffd8d8'];
    for (let i = 0; i < 10; i++) { const x = -0.92 + i * 0.205; const sarong = i % 3 !== 2; s.tor(x, 1.88, -0.5, 0.025, 0.003, Math.PI, '#888', 0, Math.PI / 2, 0);
      s.box(x, 1.85, -0.5, 0.2, 0.012, 0.012, '#c8a070');
      if (sarong) s.box(x, 1.85 - 0.48, -0.5 + (i % 2) * 0.012, 0.19, 0.95, 0.006, tints[i], cl[i]);
      else { s.box(x, 1.55, -0.5, 0.19, 0.6, 0.006, tints[i], cl[i]); s.box(x, 1.75, -0.5, 0.36, 0.16, 0.005, tints[i], cl[i]); }
    }
    // side rail: a few shirts facing the street
    for (let i = 0; i < 3; i++) { const z = -0.3 + i * 0.25; s.box(1.0, 1.5, z, 0.006, 0.6, 0.2, ['#ffffff', '#e8e8ff', '#ffe8d8'][i], ['check', 'stripe', 'white'][i]); }
    // folded stacks (each fold a slightly offset slab)
    for (let k = 0; k < 6; k++) { const x = -0.75 + k * 0.3; const n = 4 + (k % 3); for (let j = 0; j < n; j++) s.box(x + (s.rng.next() - 0.5) * 0.015, 0.77 + j * 0.032, 0.22 + (s.rng.next() - 0.5) * 0.015, 0.26, 0.03, 0.2, '#ffffff', cl[(k + j) % cl.length]); }
    s.signBoard('sCloth', 0, 2.03, 0.7, 1.4, 0.16).stool(-0.8, -0.2, '#e8e8e8');
  },
  // 3 footwear: slippers in pairs on a sloped board, shoes, shoe boxes stacked, umbrella
  (s) => {
    s.umbrella(0.1, -0.05, 1.2, 2.1, '#1a3a8a', '#e8e8e8');
    // sloped display board on a trestle
    const tilt = -0.42; s.table(1.9, 0.8, 0.45, 0.05);
    s.geo('board', () => new THREE.BoxGeometry(1, 1, 1), 0, 0.68, 0.05, tilt, 0, 0, 1.86, 0.025, 0.8, '#ffffff', 'wood');
    const cols = ['#1a5ab8', '#e8e8e8', '#c82a2a', '#111111', '#f2c230', '#2a9a5a', '#e86aa8', '#8a5a3a'];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 7; i++) { const x = -0.78 + i * 0.26, zz = 0.38 - row * 0.19; const y = 0.68 + (0.05 - zz) * Math.tan(-tilt) + 0.03; const c = cols[(row * 3 + i) % cols.length];
      for (const dx of [-0.045, 0.045]) { s.geo('sole', () => new THREE.CylinderGeometry(1, 1, 1, 10), x + dx, y, zz, tilt, 0, 0, 0.04, 0.016, 0.115, row === 3 ? '#3a2a1a' : c);
        if (row < 3) s.tor(x + dx, y + 0.01, zz + 0.03, 0.03, 0.006, Math.PI, row === 1 ? '#111' : '#ffffff', tilt, 0, 0); else s.box(x + dx, y + 0.035, zz + 0.02, 0.07, 0.05, 0.12, '#4a3220'); }
    }
    for (let k = 0; k < 7; k++) s.box(-0.8 + (k % 4) * 0.33, 0.07 + Math.floor(k / 4) * 0.13, -0.42, 0.32, 0.12, 0.18, '#ffffff', 'shoebox');
    s.signBoard('sShoe', 0.1, 1.9, -0.05, 1.3, 0.16, Math.PI * 0).stool(0.85, -0.45, '#111');
  },
  // 4 plastic housewares: nested buckets, basins, mugs, ekel brooms, hanging basins on the frame
  (s) => {
    s.frame(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.1, 2.25).tarp(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.1, 2.25, { col: '#ffffff', sag: 0.09 });
    s.table(1.5, 0.8, 0.5, -0.05);
    const pc = ['#e83a3a', '#2a7ae8', '#2ac85a', '#f2c230', '#e86a1a', '#9a3ae8', '#f2f2f2', '#2ad8d8'];
    // nested bucket stacks
    for (let k = 0; k < 4; k++) { const x = -0.55 + k * 0.36; const c = pc[k * 2 % 8]; for (let j = 0; j < 4; j++) s.cyl(x, 0.5 + 0.13 + j * 0.06, -0.15, 0.12, 0.15, 0.26, pc[(k * 2 + j) % 8], { seg: 14, open: true }); s.tor(x, 0.82 + 0.06 * 3, -0.15, 0.15, 0.004, Math.PI, '#ddd', 0, 0, 0); void c; }
    // basins stacked at the front
    for (let k = 0; k < 3; k++) for (let j = 0; j < 5; j++) s.cyl(-0.5 + k * 0.5, 0.5 + 0.05 + j * 0.025, 0.2, 0.15, 0.22, 0.09, pc[(k + j * 3) % 8], { seg: 14, open: true });
    // mugs in a row
    for (let i = 0; i < 6; i++) { s.cyl(-0.65 + i * 0.12, 0.54, 0.34, 0.035, 0.035, 0.08, pc[i % 8], { seg: 10 }); s.tor(-0.62 + i * 0.12, 0.54, 0.34, 0.022, 0.006, Math.PI, pc[i % 8], 0, 0, -Math.PI / 2); }
    // ekel brooms (coconut midrib) leaning on the pole + a hanging row of basins
    for (let i = 0; i < 4; i++) { const x = 0.82 + i * 0.05; s.cone(x, 0.55, 0.45 - i * 0.02, 0.09, 1.0, '#c8a868', -0.1, 0, (i - 1.5) * 0.05, 8); s.tor(x, 0.88, 0.43 - i * 0.02, 0.03, 0.006, Math.PI * 2, '#c83a2a', Math.PI / 2, 0, 0); }
    for (let i = 0; i < 5; i++) s.cyl(-0.8 + i * 0.4, 1.78, 0.52, 0.12, 0.17, 0.07, pc[(i * 3) % 8], { seg: 14, open: true, rx: Math.PI / 2 });
    s.pipe([POLE.x0, 1.86, 0.53], [POLE.x1, 1.86, 0.53], 0.006, '#888');
    s.signBoard('sHome', 0, 1.96, 0.7, 1.2, 0.15).stool(-0.85, -0.45, '#f2c230');
  },
  // 5 mobile accessories: glass display cabinet, pegboard of phone covers, chargers, a small umbrella, a ring light
  (s) => {
    s.frame(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.15, 2.2).tarp(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.15, 2.2, { col: '#ffffff', sag: 0.04, val: 0.22 });
    // aluminium-framed glass counter
    const cx = 0, cz = 0.18, w = 1.6, d = 0.5, h = 0.95;
    s.box(cx, 0.06, cz, w, 0.12, d, '#2a2a2a'); s.box(cx, 0.4, cz, w - 0.02, 0.02, d - 0.02, '#e8e8e8');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.box(cx + sx * (w / 2 - 0.01), h / 2, cz + sz * (d / 2 - 0.01), 0.02, h, 0.02, '#c8ccd0');
    s.box(cx, h, cz, w, 0.02, d, '#c8ccd0'); s.box(cx, 0.12, cz, w, 0.02, d, '#c8ccd0');
    s.box(cx, h - 0.005, cz, w - 0.04, 0.008, d - 0.04, '#b8d0d8', 'white', 0, s.gb); s.box(cx, 0.55, cz + d / 2 - 0.01, w - 0.04, 0.82, 0.006, '#b8d0d8', 'white', 0, s.gb);
    for (const sx of [-1, 1]) s.box(cx + sx * (w / 2 - 0.012), 0.55, cz, 0.006, 0.82, d - 0.04, '#b8d0d8', 'white', 0, s.gb);
    // goods inside: boxed earphones, chargers, power banks on two shelves
    const gc = ['#ffffff', '#111111', '#2a6ae8', '#e83a3a', '#f2c230'];
    for (let i = 0; i < 9; i++) { s.box(-0.65 + i * 0.16, 0.47, cz + 0.05, 0.1, 0.1, 0.14, gc[i % 5]); s.box(-0.65 + i * 0.16, 0.18, cz, 0.12, 0.05, 0.08, gc[(i + 2) % 5]); }
    for (let i = 0; i < 7; i++) s.box(-0.55 + i * 0.18, 0.95 + 0.02, cz - 0.05, 0.075, 0.012, 0.15, '#151515');
    // back pegboard with phone covers + charger cables
    s.box(0, 1.35, -0.5, 1.9, 1.0, 0.02, '#ffffff', 'covers');
    for (let i = 0; i < 6; i++) s.tor(-0.8 + i * 0.32, 1.0, -0.48, 0.05, 0.004, Math.PI * 2, ['#fff', '#111'][i % 2], 0, 0, 0);
    // ring light on a stand and a small extension board
    s.pipe([0.85, 0.95, -0.2], [0.85, 1.65, -0.2], 0.008, '#222'); s.tor(0.85, 1.75, -0.2, 0.1, 0.012, Math.PI * 2, '#f2f2f2', 0, 0, 0);
    s.signBoard('sMobile', 0, 1.87, 0.7, 1.5, 0.16).stool(-0.8, -0.3, '#111');
  },
  // 6 lottery seller: two ticket boards on easels, a small folding table with a cash tin and ticket stacks, beach umbrella
  (s) => {
    s.umbrella(0.1, 0, 1.0, 2.0, '#f2c230', '#c83a2a');
    s.table(0.9, 0.55, 0.72, 0.1, '#7a5a3a');
    // easel boards: two tilted boards covered in tickets
    for (const [x, ry] of [[-0.55, 0.25], [0.6, -0.25]]) { s.geo('lottoB', () => new THREE.BoxGeometry(1, 1, 1), x, 1.25, 0.1, -0.12, ry, 0, 0.8, 0.85, 0.02, '#ffffff', 'lottery');
      s.pipe([x - 0.32, 0, 0.3], [x - 0.3, 1.6, 0.06], 0.012, '#5a4a3a'); s.pipe([x + 0.32, 0, 0.3], [x + 0.3, 1.6, 0.06], 0.012, '#5a4a3a'); s.pipe([x, 0, -0.3], [x, 1.5, 0.06], 0.012, '#5a4a3a'); }
    s.box(0.0, 0.78, 0.1, 0.2, 0.08, 0.14, '#3a6a3a'); s.box(0.0, 0.83, 0.1, 0.21, 0.01, 0.15, '#4a7a4a');
    for (let i = 0; i < 4; i++) s.box(-0.25 + i * 0.07, 0.74, 0.25, 0.06, 0.006 + i * 0.004, 0.11, ['#f2c230', '#e85a3a', '#3a9ae8', '#5ac85a'][i]);
    s.signBoard('sLotto', 0.05, 1.82, 0.12, 0.8, 0.16).stool(0.1, -0.35, '#c83a2a');
  },
  // 7 spices & dry goods: open jute sacks with rolled tops (dried chillies, dhal, rice, coriander), pan scale, tins
  (s) => {
    s.frame(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.1, 2.2).tarp(POLE.x0, POLE.x1, POLE.z0, POLE.z1, 2.1, 2.2, { stripes: ['#ffffff', '#ffffff', '#e8e8e8'], sag: 0.06 });
    const sacks = [[-0.75, 0.25, '#b8241a', 0.03, 1.4], [-0.25, 0.27, '#e8902a', 0.012, 0.6], [0.25, 0.25, '#f2eee0', 0.008, 0.6], [0.75, 0.26, '#8a6a3a', 0.014, 0.9], [-0.55, -0.25, '#3a2a1a', 0.012, 0.8], [0.0, -0.27, '#e8c870', 0.01, 0.6], [0.55, -0.25, '#c8a868', 0.016, 1]];
    for (const [x, z, c, r, sy] of sacks) { const h = 0.52 + s.rng.next() * 0.08; s.geo('sack', () => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.75 + Math.sin(t * Math.PI) * 0.25, t)); } return new THREE.LatheGeometry(pts, 12); }, x, 0, z, 0, s.rng.next(), 0, 0.2, h, 0.2, '#ffffff', 'jute');
      s.tor(x, h, z, 0.155, 0.03, Math.PI * 2, '#b8955e', Math.PI / 2, 0, 0);
      s.geo('mound', () => new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), x, h - 0.03, z, 0, 0, 0, 0.15, 0.07, 0.15, c);
      s.heap(x, h - 0.01, z, 0.09, 0.09, 8, r, [c], { sy, seg: 4 });
      s.cyl(x + 0.06, h + 0.06, z + 0.04, 0.035, 0.04, 0.05, '#c8c8c8', { seg: 8, open: true, rz: 0.6 }); }
    // pan scale on a crate, weights, a row of tins and packed bags
    s.crate(0.0, 0, 0.5, 0.36, 0.3, 0.2); s.box(0, 0.35, 0.5, 0.2, 0.08, 0.12, '#c83a2a'); s.cyl(-0.06, 0.42, 0.5, 0.08, 0.09, 0.015, '#d8d8d8', { seg: 12 }); s.cyl(0.07, 0.4, 0.5, 0.06, 0.06, 0.012, '#9a9a9a', { seg: 10 });
    for (let i = 0; i < 4; i++) s.cyl(0.25 + i * 0.05, 0.32, 0.52, 0.018, 0.018, 0.03 + i * 0.006, '#7a7a7a', { seg: 8 });
    s.pipe([POLE.x0, 1.7, -0.52], [POLE.x1, 1.7, -0.52], 0.006, '#888');
    for (let i = 0; i < 9; i++) s.box(-0.85 + i * 0.21, 1.55, -0.52, 0.14, 0.26, 0.04, ['#e8902a', '#b8241a', '#f2eee0', '#3a2a1a', '#8a6a3a'][i % 5]);
    s.signBoard('sSpice', 0, 1.94, 0.7, 1.5, 0.16).stool(0.9, -0.48, '#2a6ab8');
  },
  // 8 betel & sweets kiosk: boxed timber booth with tin roof, glass jars of sweets, betel leaves, areca nuts, snack strips
  (s) => {
    const w = 1.5, d = 0.9, z = -0.1;
    s.tin(-0.95, 0.95, -0.62, 0.6, 2.05, 2.25, '#a8aca8');
    for (const [x, zz] of [[-0.72, z - 0.42], [0.72, z - 0.42], [-0.72, z + 0.42], [0.72, z + 0.42]]) s.box(x, 1.05, zz, 0.06, 2.1, 0.06, '#5a3a22', 'wood');
    // lower cabinet: planked front, painted
    s.box(0, 0.45, z, w, 0.9, d, '#3a7a5a', 'wood'); for (let i = 0; i < 7; i++) s.box(-w / 2 + 0.1 + i * 0.217, 0.45, z + d / 2 + 0.006, 0.01, 0.86, 0.004, '#2a5a42');
    s.box(0, 0.92, z, w + 0.06, 0.04, d + 0.06, '#7a5a3a', 'wood');
    // glass jars of sweets on the counter (shell = glass part, sweets = coloured fill)
    const sc = ['#e83a5a', '#f2c230', '#3ac87a', '#e86a1a', '#8a3ae8', '#ffffff'];
    for (let i = 0; i < 6; i++) { const x = -0.6 + i * 0.24; s.cyl(x, 1.04, z + 0.25, 0.075, 0.075, 0.2, sc[i], { seg: 10 }); s.cyl(x, 1.035, z + 0.25, 0.085, 0.085, 0.24, '#d8eef2', { seg: 12, b: s.gb }); s.cyl(x, 1.16, z + 0.25, 0.06, 0.06, 0.03, '#c83a2a', { seg: 10 }); }
    // betel leaves stacked in a tray + areca nuts + lime tin
    s.box(0.25, 0.95, z - 0.15, 0.45, 0.03, 0.28, '#c8b08a', 'basket');
    for (let i = 0; i < 12; i++) s.geo('leaf', () => new THREE.CircleGeometry(1, 8), 0.12 + (i % 4) * 0.09, 0.975 + Math.floor(i / 4) * 0.006, z - 0.2 + Math.floor(i / 4) * 0.05, -Math.PI / 2, i * 0.5, 0, 0.055, 0.075, 1, i % 2 ? '#3a8a2a' : '#4a9a3a');
    s.heap(-0.3, 0.95, z - 0.15, 0.08, 0.06, 10, 0.016, ['#9a6a3a', '#8a5a2a']); s.cyl(-0.5, 0.97, z - 0.15, 0.04, 0.04, 0.06, '#c8c8c8', { seg: 10 });
    // strips of snack packets hanging from the roof edge
    for (let i = 0; i < 5; i++) s.box(-0.6 + i * 0.3, 1.6, z + 0.46, 0.13, 0.6, 0.006, '#ffffff', 'packets');
    s.box(0, 1.9, z + 0.47, 1.5, 0.02, 0.02, '#5a3a22', 'wood');
    s.signBoard('sBetel', 0, 2.0, z + 0.5, 1.2, 0.15).bulb(0, 1.85, z).stool(0.6, -0.5, '#2a6ab8');
  },
  // 9 flowers & pooja: buckets of lotus buds and water lilies, araliya (frangipani) on banana-leaf trays, clay lamps
  (s) => {
    s.umbrella(0, -0.05, 1.2, 2.05, '#e8e8e0', '#a8d8a8');
    s.table(1.8, 0.75, 0.6, 0.0, '#8a6a4a');
    // banana-leaf trays with frangipani (5 white petals, yellow centre)
    for (let t = 0; t < 3; t++) { const x = -0.55 + t * 0.55; s.geo('bleaf', () => new THREE.CircleGeometry(1, 10), x, 0.62, 0.15, -Math.PI / 2, 0, 0, 0.24, 0.16, 1, '#3a8a2a');
      for (let f = 0; f < 9; f++) { const fx = x + ((f % 3) - 1) * 0.1, fz = 0.15 + (Math.floor(f / 3) - 1) * 0.07; for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2 + f; s.geo('petal', () => new THREE.CircleGeometry(1, 6), fx + Math.cos(a) * 0.016, 0.63 + p * 0.0005, fz + Math.sin(a) * 0.016, -Math.PI / 2 + 0.3, a, 0, 0.012, 0.02, 1, '#f8f4ea'); } s.sph(fx, 0.635, fz, 0.007, '#f2c23a', { seg: 5 }); } }
    // buckets of lotus buds (pink, pointed) and blue water lilies on tall stems
    for (let k = 0; k < 4; k++) { const x = -0.7 + k * 0.46, z = -0.22; s.cyl(x, 0.6 + 0.12, z, 0.1, 0.12, 0.24, ['#2a7ae8', '#e83a3a', '#f2f2f2', '#2ac85a'][k], { seg: 12, open: true });
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, rr = i ? 0.06 : 0; const fx = x + Math.cos(a) * rr, fz = z + Math.sin(a) * rr, top = 1.12 + s.rng.next() * 0.12; s.pipe([x, 0.75, z], [fx, top, fz], 0.004, '#4a7a2a', 4);
        if (k % 2 === 0) { s.sph(fx, top + 0.04, fz, 0.032, '#f2a8c0', { sy: 1.5, seg: 6 }); s.cone(fx, top + 0.1, fz, 0.016, 0.04, '#e888a8'); }
        else for (let p = 0; p < 6; p++) { const b = p / 6 * Math.PI * 2; s.cone(fx + Math.cos(b) * 0.018, top + 0.02, fz + Math.sin(b) * 0.018, 0.012, 0.045, '#8aa8e8', Math.sin(b) * 0.7, 0, -Math.cos(b) * 0.7, 4); } } }
    // clay oil lamps (pahana) in rows and joss-stick bundles
    for (let i = 0; i < 10; i++) { const x = -0.8 + (i % 5) * 0.08, z = 0.38 + Math.floor(i / 5) * 0.08; s.cyl(x, 0.615, z, 0.03, 0.022, 0.025, '#a8542a', { seg: 8 }); s.cyl(x, 0.628, z, 0.026, 0.026, 0.004, '#3a2a1a', { seg: 8 }); }
    for (let i = 0; i < 4; i++) { s.cyl(0.45 + i * 0.1, 0.72, 0.38, 0.018, 0.018, 0.22, '#8a4a2a', { seg: 6 }); s.box(0.45 + i * 0.1, 0.66, 0.38, 0.04, 0.06, 0.04, ['#e83a5a', '#f2c230', '#3a7ae8', '#2ac85a'][i]); }
    s.signBoard('sFlower', 0, 1.9, -0.05, 1.2, 0.15).stool(0.85, -0.48, '#e8e8e8');
  },
];

let STALL_MAT = null, GLASS_MAT = null;
export const STALL_TYPES = TYPES.length;
export const STALL_CANOPY = ['#2f6fa8', '#c8382a', '#2a8a4a', '#e8b030', '#e8e4d8', '#6a3a8a', '#1f8a9a', '#d86a2a'];
// returns [[parts], ...] per type: parts = [{geo, mat, tint?, noShadow?}]
export function buildStallGeometries(canopyMat) {
  ATLAS = buildAtlas();
  STALL_MAT = new THREE.MeshStandardMaterial({ map: ATLAS, vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const out = TYPES.map((fn, i) => { const s = new SB(101 + i * 17); fn(s); return s.build(STALL_MAT, canopyMat, GLASS_MAT); });
  for (const k of Object.keys(GEOS)) { GEOS[k].dispose(); delete GEOS[k]; }
  return out;
}
// per-stall type, chosen so that neighbouring stalls (consecutive in the plan) never repeat
export function stallType(i, salt = 0) { return (i * 3 + salt) % TYPES.length; }
