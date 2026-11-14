// Shared kit for the 43rd-request shop interiors / frontages: small procedural textures (≤ 512², drawn once, cached) and a
// textured MultiBuilder whose material slots are created on demand. Everything is plain MeshStandardMaterial (maps +
// vertex colours) so it shares programs with the rest of the game. Node-safe: without a canvas the textured slots fall back
// to flat-colour materials (the smoke test builds shops headless).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';

export const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const hasCanvas = () => typeof document !== 'undefined' && !!document.createElement;
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const TEX = new Map();
export function canvasTex(key, w, h, draw, { repeat = true, srgb = true, aniso = 4 } = {}) {
  if (TEX.has(key)) return TEX.get(key); if (!hasCanvas()) { TEX.set(key, null); return null; }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const a = cv.getContext('2d'); if (!a) { TEX.set(key, null); return null; }
  seed = [...key].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7; draw(a, w, h, rnd);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = aniso; t.generateMipmaps = true; TEX.set(key, t); return t;
}
// ---- surfaces
const grain = (a, w, h, r, base, dark, light, rings = 40) => { a.fillStyle = base; a.fillRect(0, 0, w, h);
  for (let i = 0; i < rings; i++) { const y = r() * h, amp = 2 + r() * 8, f = 0.004 + r() * 0.01, ph = r() * 9; a.strokeStyle = r() < 0.6 ? dark : light; a.globalAlpha = 0.18 + r() * 0.3; a.lineWidth = 0.6 + r() * 2.2; a.beginPath();
    for (let x = 0; x <= w; x += 4) { const yy = y + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * 0.3; if (x === 0) a.moveTo(x, yy); else a.lineTo(x, yy); } a.stroke(); }
  a.globalAlpha = 1; for (let i = 0; i < 2600; i++) { a.fillStyle = r() < 0.5 ? dark : light; a.globalAlpha = 0.05 + r() * 0.08; a.fillRect(r() * w, r() * h, 1 + r() * 6, 1); } a.globalAlpha = 1; };
export const TEXTURES = {
  oak: () => canvasTex('oak', 512, 256, (a, w, h, r) => grain(a, w, h, r, '#9a7148', '#5e3f22', '#c49a6a', 46)),
  walnut: () => canvasTex('walnut', 512, 256, (a, w, h, r) => grain(a, w, h, r, '#4e3220', '#2a170c', '#7a5236', 52)),
  ebony: () => canvasTex('ebony', 512, 256, (a, w, h, r) => grain(a, w, h, r, '#211814', '#0d0907', '#3c2c22', 40)),
  marble: () => canvasTex('marble', 512, 512, (a, w, h, r) => { a.fillStyle = '#e9e5de'; a.fillRect(0, 0, w, h);
    for (let i = 0; i < 70000; i++) { const g = 220 + r() * 30; a.fillStyle = `rgba(${g},${g - 3},${g - 8},0.12)`; a.fillRect(r() * w, r() * h, 2, 2); }
    for (let v = 0; v < 9; v++) { let x = r() * w, y = 0; a.strokeStyle = v < 3 ? 'rgba(120,112,104,0.55)' : 'rgba(160,150,140,0.35)'; a.lineWidth = v < 3 ? 1.6 : 0.8; a.beginPath(); a.moveTo(x, y);
      while (y < h) { x += (r() - 0.5) * 26; y += 6 + r() * 14; a.lineTo(x, y); } a.stroke(); } }),
  marbleDark: () => canvasTex('marbleDark', 512, 512, (a, w, h, r) => { a.fillStyle = '#1d1c1b'; a.fillRect(0, 0, w, h);
    for (let v = 0; v < 12; v++) { let x = r() * w, y = 0; a.strokeStyle = v < 4 ? 'rgba(214,200,170,0.55)' : 'rgba(150,140,120,0.3)'; a.lineWidth = v < 4 ? 1.3 : 0.7; a.beginPath(); a.moveTo(x, y); while (y < h) { x += (r() - 0.5) * 30; y += 6 + r() * 12; a.lineTo(x, y); } a.stroke(); } }),
  brick: () => canvasTex('brick', 512, 512, (a, w, h, r) => { a.fillStyle = '#6b6158'; a.fillRect(0, 0, w, h); const bw = 64, bh = 24;
    for (let y = 0, row = 0; y < h; y += bh, row++) for (let x = -(row % 2) * bw / 2; x < w; x += bw) { const t = 0.75 + r() * 0.35; a.fillStyle = `rgb(${Math.round(128 * t)},${Math.round(62 * t)},${Math.round(44 * t)})`; a.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      for (let k = 0; k < 30; k++) { a.fillStyle = `rgba(${r() < 0.5 ? '40,20,12' : '190,140,110'},${0.1 + r() * 0.15})`; a.fillRect(x + 2 + r() * (bw - 6), y + 2 + r() * (bh - 6), 1 + r() * 3, 1 + r() * 2); } } }),
  plaster: (tone = '#d8d2c6') => canvasTex('plaster' + tone, 256, 256, (a, w, h, r) => { a.fillStyle = tone; a.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { a.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)'; a.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); } }),
  leather: (tone = '#3a1e14') => canvasTex('leather' + tone, 256, 256, (a, w, h, r) => { a.fillStyle = tone; a.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { a.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,230,210,0.05)'; const s = 1 + r() * 2.5; a.beginPath(); a.arc(r() * w, r() * h, s, 0, 7); a.fill(); } }),
  velvet: (tone = '#4a1420') => canvasTex('velvet' + tone, 128, 128, (a, w, h, r) => { a.fillStyle = tone; a.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { a.fillStyle = `rgba(255,255,255,${r() * 0.04})`; a.fillRect(r() * w, r() * h, 1, 2); } }),
  concrete: () => canvasTex('concreteWall', 256, 256, (a, w, h, r) => { a.fillStyle = '#8d8b86'; a.fillRect(0, 0, w, h); for (let i = 0; i < 14000; i++) { const g = 100 + r() * 70; a.fillStyle = `rgba(${g},${g},${g - 4},0.18)`; a.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } for (let i = 0; i < 18; i++) { a.fillStyle = 'rgba(60,58,55,0.12)'; a.beginPath(); a.arc(r() * w, r() * h, 2 + r() * 3, 0, 7); a.fill(); } }),
  pegboard: () => canvasTex('pegboard', 256, 256, (a, w, h) => { a.fillStyle = '#c9b48d'; a.fillRect(0, 0, w, h); a.fillStyle = '#3a3024'; for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { a.beginPath(); a.arc(x, y, 2.2, 0, 7); a.fill(); } }),
};

// ---- a MultiBuilder whose extra slots are textured materials: slot name → { tex, rough, metal, … }
const MATS = new Map();
export function kitMaterial(name, spec) {
  if (MATS.has(name)) return MATS.get(name);
  const t = spec.tex ? spec.tex() : null; const m = new THREE.MeshStandardMaterial({ map: t || null, color: t ? 0xffffff : (spec.color ?? 0xcccccc), vertexColors: true, roughness: spec.rough ?? 0.6, metalness: spec.metal ?? 0, envMapIntensity: spec.env ?? 1 });
  if (spec.emissive) { m.emissive = new THREE.Color(spec.emissive); m.emissiveIntensity = spec.ei ?? 1; }
  if (spec.side) m.side = spec.side; MATS.set(name, m); return m;
}
export const KIT = {
  oak: { tex: TEXTURES.oak, rough: 0.5 }, walnut: { tex: TEXTURES.walnut, rough: 0.42 }, ebony: { tex: TEXTURES.ebony, rough: 0.35 },
  marble: { tex: TEXTURES.marble, rough: 0.12, env: 1.2 }, marbleDark: { tex: TEXTURES.marbleDark, rough: 0.14, env: 1.2 },
  brick: { tex: TEXTURES.brick, rough: 0.92 }, plaster: { tex: () => TEXTURES.plaster(), rough: 0.93 }, concreteW: { tex: TEXTURES.concrete, rough: 0.9 },
  leather: { tex: () => TEXTURES.leather(), rough: 0.45 }, leatherBlk: { tex: () => TEXTURES.leather('#161312'), rough: 0.4 }, velvet: { tex: () => TEXTURES.velvet(), rough: 0.95 },
  pegboard: { tex: TEXTURES.pegboard, rough: 0.85 }, chrome: { rough: 0.12, metal: 1, color: 0xffffff }, brass: { rough: 0.25, metal: 1, color: 0xffffff },
  fabric: { rough: 0.95 }, mirror: { rough: 0.03, metal: 1, color: 0xffffff, env: 1.6 },
};
export class Kit {
  constructor() { this.mb = new MultiBuilder(); this.extra = {}; }
  get(name) { if (!MAT[name] && KIT[name] && !this.extra[name]) this.extra[name] = kitMaterial(name, KIT[name]); return this.mb.get(name); }
  meshes(opts = { cast: false, receive: true }) { const mats = Object.assign({}, MAT, this.extra); return this.mb.toMeshes(mats, opts); }
  into(group, opts) { for (const m of this.meshes(opts)) group.add(m); return group; }
}

// ---- flat image planes (posters, signs, mirrors' frames…) — canvas → plane mesh (null headless)
export function imagePlane(key, pw, ph, cw, chh, draw, { emissive = 0, rough = 0.7, transparent = false } = {}) {
  const t = canvasTex(key, cw, chh, draw, { repeat: false }); if (!t) return null;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: rough, transparent, alphaTest: transparent ? 0.02 : 0 }); if (emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = t; m.emissiveIntensity = emissive; }
  m.userData.own = true; return new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), m);
}
// a lathe solid (bottles, vases, mannequin forms, lamp shades) appended to a MeshBuilder at (x, y, z)
export function lathe(mb, x, y, z, profile, seg = 16, col) {
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(0.0005, r), h)), seg); mb.geometry(g, new THREE.Matrix4().makeTranslation(x, y, z), col); g.dispose();
}
// a hanging garment silhouette on a hanger (front at +z): shoulders, body, sleeves; w = chest width
export function garment(mb, x, y, z, rotY, col, { w = 0.46, len = 0.72, sleeve = 0.55, coat = false } = {}) {
  const c = Math.cos(rotY), s = Math.sin(rotY); const P = (u, v, d) => [x + u * c + d * s, y + v, z - u * s + d * c];
  const dk = col.map((q) => q * 0.82); const t = coat ? 0.07 : 0.035; const hw = w / 2;
  mb.box(x, y - len / 2 - 0.04, z, w, len, t, { col, rotY }); // body
  for (const sx of [-1, 1]) { const p = P(sx * (hw + 0.035), -0.05 - sleeve / 2, 0); mb.box(p[0], p[1], p[2], 0.07, sleeve, t * 0.9, { col: dk, rotY }); } // sleeves hang at the sides
  const sh = P(0, -0.02, 0); mb.box(sh[0], sh[1], sh[2], w + 0.06, 0.05, t, { col, rotY }); // shoulder line
  if (coat) { const l = P(0, -0.2, t / 2 + 0.004); mb.box(l[0], l[1], l[2], 0.012, 0.36, 0.006, { col: dk, rotY }); }
}
