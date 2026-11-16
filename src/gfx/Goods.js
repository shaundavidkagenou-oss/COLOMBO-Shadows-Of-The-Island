// Shop goods for the station kiosks and the vendors (55th request: "glass bottles must show the liquid inside, look like
// glass, and have realistic labels"; "the shelf unit near the waiting-room door needs hyper-quality items").
//
// One 512 × 512 canvas atlas of printed packaging (all brands invented — no real trademarks): biscuit and tea packets,
// snack bags, wrapped bars, bottle labels, newspaper front pages, plus flat swatches for liquids, caps and plastics.
// goodsMaterial() — one shared material for all of it (one draw call per kiosk group). Helpers add items to a MeshBuilder
// `G` (printed / solid parts) and a glass builder `GL` (bottle glass, display panes):
//   packet()   — a printed box / pouch          bottle()  — lathe-turned glass bottle with its liquid, label, cap
//   strip()    — a hanging strip of snack sachets clipped to a line (the Sri Lankan kiosk front)
//   paper()    — a folded newspaper lying on a rack
import * as THREE from 'three';
import { patchInterior } from './InteriorLight.js';

const W = 512;
const R = (x, y, w, h) => [x / W, 1 - (y + h) / W, (x + w) / W, 1 - y / W]; // canvas px → uv (flipY)
export const GOODS = {
  pack: (i) => R((i % 8) * 64, 0, 64, 128), // 8 tall packets (front faces)
  label: (i) => R((i % 4) * 128, 128 + Math.floor(i / 4) * 40, 128, 40), // 8 bottle labels (wrap-around)
  paper: (i) => R((i % 4) * 128, 208, 128, 128), // 4 newspaper front pages
  small: (i) => R((i % 8) * 64, 336, 64, 64), // 8 small packs / bars
  sachet: (i) => R((i % 8) * 64, 400, 64, 64), // 8 sachets / snack bags
  sw: (i) => { const x = (i % 16) * 32 + 8, y = 464 + 8; return [x / W, 1 - (y + 32) / W, (x + 16) / W, 1 - y / W]; }, // 16 flat swatches
};
// swatch indices
export const SW = { water: 0, cola: 1, orange: 2, ginger: 3, milk: 4, capRed: 5, capBlue: 6, capGreen: 7, capGold: 8, white: 9, crateRed: 10, crateBlue: 11, steel: 12, wire: 13, cardboard: 14, black: 15 };
const SWCOL = ['#bcd8e6', '#2a1206', '#f08a12', '#c9a04a', '#f3f1ea', '#c8161b', '#1d4fae', '#1f7a3a', '#c9a227', '#f6f6f2', '#b3201a', '#1f4e9a', '#b8bcbf', '#6a6d70', '#b58a5a', '#141414'];

let _tex = null, _mat = null;
function drawAtlas() {
  const c = document.createElement('canvas'); c.width = W; c.height = W; const x = c.getContext('2d');
  const F = (w, px, fam = '"Barlow Condensed", "Noto Sans", sans-serif') => `${w} ${px}px ${fam}`;
  const T = (s, cx, cy, f, col, maxW, al = 'center') => { x.font = f; x.fillStyle = col; x.textAlign = al; x.textBaseline = 'middle'; x.fillText(s, cx, cy, maxW); };
  const grad = (x0, y0, x1, y1, a, b) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, W);
  // tall packets: biscuits, crackers, tea, milk powder, wafers, cream crackers, chocolate biscuits, string hoppers flour
  const packs = [['RASA', 'CREAM', '#f4c430', '#7a1e12', 'රස ක්‍රීම්'], ['CEYLON', 'CRACKERS', '#1c4e9e', '#ffffff', 'ක්‍රැකර්'], ['HILL', 'TEA', '#0f5a2e', '#e8c96a', 'තේ කොළ'], ['KIRI', 'MILK POWDER', '#e9eef5', '#1d4fae', 'කිරි පිටි'],
    ['WAFER', 'VANILLA', '#f6e3b4', '#a0281a', 'වේෆර්'], ['GOLDEN', 'MARIE', '#d9a22a', '#3a1a08', 'මාරි'], ['CHOCO', 'NIGHTS', '#3a1d10', '#f0c060', 'චොකලට්'], ['ISURU', 'RICE FLOUR', '#f2f2ea', '#b3201a', 'සහල් පිටි']];
  packs.forEach(([a, b, bg, fg, si], i) => { const ox = i * 64; x.fillStyle = grad(ox, 0, ox + 64, 128, bg, shade(bg, -0.18)); x.fillRect(ox, 0, 64, 128);
    x.fillStyle = shade(bg, -0.3); x.fillRect(ox, 0, 64, 6); x.fillRect(ox, 122, 64, 6); // crimped seals
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(ox + 6, 8, 6, 112); // sheen
    T(a, ox + 32, 26, F(800, 17), fg, 58); T(b, ox + 32, 44, F(700, 11), fg, 58); T(si, ox + 32, 58, '600 9px "Noto Sans Sinhala", sans-serif', fg, 58);
    x.fillStyle = shade(bg, 0.25); x.beginPath(); x.ellipse(ox + 32, 88, 20, 14, 0, 0, 7); x.fill(); x.fillStyle = shade(fg, 0); for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(ox + 22 + k * 10, 88, 5, 0, 7); x.fill(); }
    T('NET 200g', ox + 32, 113, F(600, 8), fg, 58); });
  // bottle labels (wrap-around): water, cola, orange, ginger beer, king coconut, soda, milk, cream soda
  const labels = [['SPRING HILL', 'drinking water 500ml', '#e9f3fa', '#1d4fae'], ['KOLA FIZZ', 'carbonated drink', '#b3121a', '#ffffff'], ['ORANGE BURST', 'orange drink', '#f08a12', '#ffffff'], ['GINGER JOY', 'ginger beer', '#1d5a2a', '#f0d27a'],
    ['THAMBILI', 'king coconut water', '#f0a020', '#2a4a12'], ['CLUB SODA', 'soda water', '#2a6fb0', '#ffffff'], ['FRESH KIRI', 'flavoured milk', '#f4f0e6', '#b3201a'], ['CREAM SODA', 'soft drink', '#f2d24a', '#7a1e12']];
  labels.forEach(([a, b, bg, fg], i) => { const ox = (i % 4) * 128, oy = 128 + Math.floor(i / 4) * 40; x.fillStyle = bg; x.fillRect(ox, oy, 128, 40);
    x.fillStyle = shade(bg, -0.25); x.fillRect(ox, oy, 128, 3); x.fillRect(ox, oy + 37, 128, 3);
    T(a, ox + 64, oy + 17, F(800, 16), fg, 120); T(b, ox + 64, oy + 31, F(600, 9), fg, 120); x.fillStyle = fg; x.fillRect(ox + 8, oy + 8, 3, 24); x.fillRect(ox + 117, oy + 8, 3, 24); });
  // newspapers: masthead, headline block, columns of text, a photo
  const papers = [['THE ISLAND TIMES', 'Rail fares unchanged this year'], ['දිනපතා පුවත්', 'නව දුම්රිය කාලසටහන'], ['தினசரி செய்தி', 'புதிய ரயில் சேவை'], ['COLOMBO EVENING', 'Monsoon rains expected']];
  papers.forEach(([m, h], i) => { const ox = i * 128, oy = 208; x.fillStyle = '#efece2'; x.fillRect(ox, oy, 128, 128);
    const mf = i === 1 ? '700 15px "Noto Sans Sinhala", sans-serif' : i === 2 ? '700 13px "Noto Sans Tamil", sans-serif' : '"Cormorant Garamond", serif'; T(m, ox + 64, oy + 13, i === 0 || i === 3 ? `700 15px ${mf}` : mf, '#111', 120);
    x.fillStyle = '#222'; x.fillRect(ox + 4, oy + 24, 120, 1); x.fillRect(ox + 4, oy + 27, 120, 0.5);
    T(h, ox + 64, oy + 38, i === 1 ? '700 11px "Noto Sans Sinhala", sans-serif' : i === 2 ? '700 10px "Noto Sans Tamil", sans-serif' : F(800, 13), '#111', 120);
    x.fillStyle = grad(ox + 6, oy + 50, ox + 60, oy + 92, '#6d7d88', '#2d3a40'); x.fillRect(ox + 6, oy + 50, 56, 42); // photo
    x.fillStyle = '#9aa58e'; x.fillRect(ox + 6, oy + 78, 56, 14);
    x.fillStyle = '#555'; for (let r = 0; r < 14; r++) { x.fillRect(ox + 66, oy + 50 + r * 3, 56 - (r % 5 === 4 ? 20 : 0), 1); } for (let r = 0; r < 10; r++) for (let col = 0; col < 3; col++) x.fillRect(ox + 6 + col * 40, oy + 98 + r * 3, 36 - (r % 4 === 3 ? 12 : 0), 1); });
  // small packs: chocolate bar, toffees, soap, matches, chewing gum, cough lozenges, sesame bar, plaster box
  const smalls = [['CHOCO', '#4a1d0c', '#f2c14a'], ['TOFFEE', '#e6312a', '#ffffff'], ['SANDAL', '#e8dcc0', '#7a4a1a'], ['MATCH', '#1d4fae', '#f4c430'], ['MINT', '#24a35a', '#ffffff'], ['KOTHU', '#c8161b', '#f4e04a'], ['THALA', '#c99a3a', '#3a1a08'], ['CARE+', '#f6f6f2', '#c8161b']];
  smalls.forEach(([a, bg, fg], i) => { const ox = i * 64, oy = 336; x.fillStyle = grad(ox, oy, ox, oy + 64, shade(bg, 0.12), shade(bg, -0.15)); x.fillRect(ox, oy, 64, 64); x.fillStyle = fg; x.fillRect(ox, oy + 40, 64, 3); T(a, ox + 32, oy + 24, F(800, 15), fg, 60); T('Rs. ' + (20 + i * 10), ox + 32, oy + 53, F(700, 9), fg, 60); });
  // sachets / snack bags: chips, mixture, murukku, peanuts, cassava chips, shampoo sachet, tea sachet, coffee
  const sach = [['CHIPS', '#f4c430', '#c8161b'], ['MIXTURE', '#c8161b', '#f4e04a'], ['MURUKKU', '#7a3a12', '#ffd27a'], ['NUTS', '#1d5a2a', '#f0d27a'], ['MANIOC', '#f08a12', '#1d1d1d'], ['SILK', '#7a2a9a', '#ffffff'], ['TEA', '#0f5a2e', '#ffffff'], ['KOPI', '#3a1d10', '#f0c060']];
  sach.forEach(([a, bg, fg], i) => { const ox = i * 64, oy = 400; x.fillStyle = grad(ox, oy, ox + 64, oy + 64, shade(bg, 0.2), shade(bg, -0.2)); x.fillRect(ox, oy, 64, 64); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(ox + 4, oy + 4, 56, 5); x.fillStyle = shade(bg, -0.35); for (let k = 0; k < 8; k++) x.fillRect(ox + k * 8, oy, 4, 3); T(a, ox + 32, oy + 30, F(800, 14), fg, 60); x.fillStyle = shade(bg, 0.35); x.beginPath(); x.arc(ox + 32, oy + 48, 9, 0, 7); x.fill(); });
  SWCOL.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 32, 464, 32, 48); });
  return c;
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; }
export function goodsTexture() { if (_tex) return _tex; const t = new THREE.CanvasTexture(drawAtlas()); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return (_tex = t); }
export function goodsMaterial() {
  if (_mat) return _mat;
  _mat = new THREE.MeshStandardMaterial({ map: goodsTexture(), vertexColors: true, roughness: 0.42, metalness: 0.0 }); _mat.name = 'goods'; patchInterior(_mat); return _mat;
}
// bottle glass: a clear tinted glass with a strong edge reflection, separate from window glass so it reads as a bottle
let _glass = null;
export function bottleGlassMaterial() {
  if (_glass) return _glass;
  _glass = new THREE.MeshPhysicalMaterial({ color: 0xe8f2ee, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, side: THREE.DoubleSide }); _glass.name = 'bottleGlass'; patchInterior(_glass); return _glass;
}

const _m = new THREE.Matrix4();
function remap(B, v0, uv) { for (let v = v0; v < B.vcount; v++) { const u = B.uv[v * 2], w = B.uv[v * 2 + 1]; B.uv[v * 2] = uv[0] + (uv[2] - uv[0]) * Math.min(1, Math.max(0, u)); B.uv[v * 2 + 1] = uv[1] + (uv[3] - uv[1]) * Math.min(1, Math.max(0, w)); } }
function flat(B, v0, uv) { const u = (uv[0] + uv[2]) / 2, w = (uv[1] + uv[3]) / 2; for (let v = v0; v < B.vcount; v++) { B.uv[v * 2] = u; B.uv[v * 2 + 1] = w; } }
const WHITE = [1, 1, 1];
// printed box / pouch: front + back faces carry the print, the narrow sides and top a strip of it
export function packet(G, x, y, z, w, h, d, uv, rotY = 0) { const v0 = G.vcount; G.box(x, y + h / 2, z, w, h, d, { col: WHITE, rotY, uvRect: uv, bottom: false }); return v0; }
// a solid part in a flat swatch colour
export function solid(G, fn, sw) { const v0 = G.vcount; fn(); flat(G, v0, GOODS.sw(sw)); }
// bottle profiles (radius by height, metres): glass 'soda' (Kola / orange / ginger), PET 'water', 'milk' small
const PROF = {
  soda: [[0.0, 0.0], [0.029, 0.0], [0.031, 0.006], [0.031, 0.12], [0.027, 0.15], [0.016, 0.19], [0.013, 0.215], [0.0145, 0.222], [0.0145, 0.228], [0.0, 0.228]],
  water: [[0.0, 0.0], [0.03, 0.0], [0.033, 0.01], [0.033, 0.07], [0.031, 0.08], [0.033, 0.09], [0.033, 0.15], [0.026, 0.18], [0.0135, 0.205], [0.0135, 0.215], [0.0, 0.215]],
  milk: [[0.0, 0.0], [0.024, 0.0], [0.026, 0.006], [0.026, 0.1], [0.02, 0.12], [0.014, 0.135], [0.014, 0.142], [0.0, 0.142]],
};
const LATHE = {}; const lathe = (k, s) => { const key = k + s; if (!LATHE[key]) LATHE[key] = new THREE.LatheGeometry(PROF[k].map(([r, h]) => new THREE.Vector2(r * s, h)), 14); return LATHE[key]; };
// kinds: label index, liquid swatch, cap swatch, profile, fill level (0..1 of the body)
export const DRINKS = [
  { label: 0, liquid: SW.water, cap: SW.capBlue, prof: 'water', fill: 0.88 }, { label: 1, liquid: SW.cola, cap: SW.capRed, prof: 'soda', fill: 0.86 }, { label: 2, liquid: SW.orange, cap: SW.capGold, prof: 'soda', fill: 0.86 },
  { label: 3, liquid: SW.ginger, cap: SW.capGreen, prof: 'soda', fill: 0.85 }, { label: 4, liquid: SW.water, cap: SW.capGreen, prof: 'water', fill: 0.9 }, { label: 5, liquid: SW.water, cap: SW.capBlue, prof: 'soda', fill: 0.86 },
  { label: 6, liquid: SW.milk, cap: SW.capRed, prof: 'milk', fill: 0.92 }, { label: 7, liquid: SW.ginger, cap: SW.capGold, prof: 'soda', fill: 0.86 },
];
// a bottle standing at (x, y, z): glass shell into GL, liquid (inside, to the fill line), label band and cap into G
export function bottle(G, GL, x, y, z, kind = 0, s = 1) {
  const D = DRINKS[kind % DRINKS.length], P = PROF[D.prof], top = P[P.length - 1][1], body = P.reduce((m, [r, h]) => (r >= P[1][0] * 0.95 ? Math.max(m, h) : m), 0);
  _m.makeTranslation(x, y, z); GL.geometry(lathe(D.prof, s), _m, [1, 1, 1]);
  { const v0 = G.vcount; const g = lathe(D.prof, s * 0.9); const lim = body * D.fill; const pos = g.attributes.position; const m2 = new THREE.Matrix4().makeTranslation(x, y + 0.002, z);
    // the liquid: the inner lathe clipped to the fill line (its vertices above the line are pulled down onto it: a flat surface)
    const tmp = g.clone(); const p2 = tmp.attributes.position; for (let i = 0; i < p2.count; i++) if (p2.getY(i) > lim) p2.setY(i, lim); G.geometry(tmp, m2, WHITE); tmp.dispose(); flat(G, v0, GOODS.sw(D.liquid)); void pos; }
  { const r = P[2][0] * s + 0.0008, h0 = body * 0.3, h1 = body * 0.82; const v0 = G.vcount; G.cylinder(x, y + h0, z, r, r, h1 - h0, 16, { col: WHITE, caps: false }); // label band
    for (let v = v0; v < G.vcount; v++) { G.uv[v * 2] = G.uv[v * 2] / (Math.PI * 2 * r); G.uv[v * 2 + 1] = G.uv[v * 2 + 1] / (h1 - h0); } remap(G, v0, GOODS.label(D.label)); }
  { const rn = P[P.length - 2][0] * s + 0.0012; const v0 = G.vcount; G.cylinder(x, y + top - 0.012, z, rn, rn, 0.014, 10, { col: WHITE }); flat(G, v0, GOODS.sw(D.cap)); } // cap
  return top;
}
// a strip of sachets hanging from a clip line: n packets one under the other, slightly turned
export function strip(G, x, yTop, z, n, kind, face = 'z', seed = 0) {
  for (let k = 0; k < n; k++) { const y = yTop - 0.03 - k * 0.11; const tw = Math.sin(seed * 3.1 + k * 1.7) * 0.18; packet(G, x, y - 0.1, z, face === 'z' ? 0.09 : 0.012, 0.1, face === 'z' ? 0.012 : 0.09, GOODS.sachet(kind), tw); }
  solid(G, () => G.box(x, yTop - 0.01, z, 0.025, 0.03, 0.025, { col: WHITE }), SW.wire); // clip
}
// a folded newspaper lying flat (y = its underside), long side along x
export function paper(G, x, y, z, i, rotY = 0) { const v0 = G.vcount; G.box(x, y + 0.006, z, 0.3, 0.012, 0.42, { col: WHITE, rotY, uvRect: GOODS.paper(i), bottom: false }); return v0; }
