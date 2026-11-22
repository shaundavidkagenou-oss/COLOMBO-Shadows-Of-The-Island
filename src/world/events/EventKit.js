// 81st request — DYNAMIC CITY EVENTS: the temporary event structures and props (stage, truss, PA, lighting, barriers, tents,
// furniture, desks, generator, toilets, signage, decorations, cables). Everything is procedural geometry on a small set of
// SHARED PBR materials (MeshStandardMaterial: albedo + normal / roughness / metalness, vertex colours for tints) so a whole
// event site merges into one mesh per material (≈ 12–16 draw calls) plus one InstancedMesh for the chairs and one for the
// barrier sections. Textures are 1024² canvases drawn once (lazy, cached — CityEvents.prewarm() draws them on the loading
// screen); the per-event print atlas (banners, LED screen, signs, info poster) is the one 2048×1024 texture, made for the site
// in front of the player and disposed when the site is dropped. Node-safe: without a canvas every material falls back to a
// flat colour (headless tests build sites too).
import * as THREE from 'three';
import { MeshBuilder } from '../../gfx/MeshBuilder.js';
import { heightToNormal } from '../../gfx/Textures.js';

const hasCanvas = () => typeof document !== 'undefined' && !!document.createElement;
const TEXC = new Map();
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const hash = (x, y, s) => { let q = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; q = Math.imul(q ^ (q >>> 13), 1274126177); return ((q ^ (q >>> 16)) >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, p, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const X0 = ((xi % p) + p) % p, X1 = (X0 + 1) % p, Y0 = ((yi % p) + p) % p, Y1 = (Y0 + 1) % p;
  const a = hash(X0, Y0, s), b = hash(X1, Y0, s), c = hash(X0, Y1, s), d = hash(X1, Y1, s); const u = smooth(xf), v = smooth(yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, p, s, o = 4) { let t = 0, a = 0.5, n = 0, f = 1; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, p * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return t / n; }
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// after the one GPU upload the 1024² source canvas is no longer needed: drop it (≈ 4 MB of RAM per texture) — these textures are
// drawn once and never edited, so nothing asks for a re-upload
export function freeAfterUpload(t) { if (!t) return t; t.onUpdate = () => { t.onUpdate = null; const c = t.image; if (c && c.width) t.image = { width: c.width, height: c.height }; }; return t; }
function toTex(c, srgb = true, repeat = true) { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; }
// a per-pixel painter: f(u, v) → [r, g, b, a?] in 0..1 (u, v in pixels)
function paint(w, h, f) { const c = cv(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const p = f(i, j), k = (j * w + i) * 4; d[k] = Math.max(0, Math.min(255, p[0] * 255)); d[k + 1] = Math.max(0, Math.min(255, p[1] * 255)); d[k + 2] = Math.max(0, Math.min(255, p[2] * 255)); d[k + 3] = p.length > 3 ? Math.max(0, Math.min(255, p[3] * 255)) : 255; }
  x.putImageData(img, 0, 0); return c; }
function texPair(key, draw) { // albedo + normal from one generator: draw() → { albedo: canvas, height?: canvas, strength }
  if (TEXC.has(key)) return TEXC.get(key); if (!hasCanvas()) { TEXC.set(key, null); return null; }
  seed = [...key].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7; const r = draw();
  const out = { map: freeAfterUpload(toTex(r.albedo, true)), normal: r.height ? freeAfterUpload(heightToNormal(r.height, { strength: r.strength || 2 })) : null }; TEXC.set(key, out); return out;
}
const N = 1024; // default texture size (1K); the print atlas is the only 2K texture
// ---------------------------------------------------------------------------------------------- surfaces (tileable)
const SURF = {
  // black painted plywood (speaker cabinets, cases, stage risers): fine grain, scuffs, edge wear
  ply: () => texPair('ev.ply', () => { const albedo = paint(N, N, (i, j) => { const g = fbm(i / 64, j / 9, 16, 3, 3), n = hash(i, j, 5) * 0.04, sc = fbm(i / 40, j / 40, 26, 9, 4); const s = sc > 0.68 ? (sc - 0.68) * 0.5 : 0; const v = 0.075 + g * 0.035 + n + s; return [v, v, v * 1.02]; }); return { albedo }; }),
  // stage deck: brown-black hexagon anti-slip phenolic film, 2 m × 2 m tile with the board joint across the middle
  deck: () => texPair('ev.deck', () => { const hx = 10; const H = (i, j) => { const y = j / (hx * 0.866), row = Math.floor(y), x = i / hx + (row % 2) * 0.5, fx = x - Math.floor(x) - 0.5, fy = y - row - 0.5; const d = Math.max(Math.abs(fx) * 1.15 + Math.abs(fy) * 0.58, Math.abs(fy) * 1.15); return d < 0.42 ? 1 : 0.35; };
    const joint = (i, j) => (Math.abs(j - N / 2) < 2 || j < 2 || i < 2 ? 0 : 1);
    const albedo = paint(N, N, (i, j) => { const h = H(i, j), w = fbm(i / 90, j / 90, 11, 4, 4), sc = hash(i >> 2, j >> 2, 7) < 0.004 ? 0.08 : 0; const v = (0.11 + h * 0.03 + w * 0.05 + sc) * joint(i, j); return [v * 1.08, v * 0.98, v * 0.9]; });
    const height = paint(N, N, (i, j) => { const v = H(i, j) * 0.6 * joint(i, j) + 0.2; return [v, v, v]; }); return { albedo, height, strength: 1.6 }; }),
  // stage skirt: black pleated wool serge, vertical folds
  skirt: () => texPair('ev.skirt', () => { const f = (i) => 0.5 + 0.5 * Math.sin((i / N) * Math.PI * 2 * 14 + Math.sin((i / N) * Math.PI * 2 * 3) * 0.8);
    const albedo = paint(N, N, (i, j) => { const v = 0.03 + f(i) * 0.035 + hash(i, j, 3) * 0.02 + fbm(i / 30, j / 120, 34, 2, 3) * 0.02; return [v, v, v * 1.05]; });
    const height = paint(N, N, (i, j) => { const v = f(i) * 0.8 + hash(i, j, 3) * 0.06; return [v, v, v]; }); return { albedo, height, strength: 3 }; }),
  // truss aluminium: brushed along the tube, faint oxidation
  alu: () => texPair('ev.alu', () => { const albedo = paint(N, N, (i, j) => { const b = fbm(i / 400, j / 1.5, 3, 6, 3), o = fbm(i / 70, j / 70, 15, 8, 4); const v = 0.68 + b * 0.16 - (o > 0.66 ? (o - 0.66) * 0.5 : 0); return [v, v * 1.005, v * 1.02]; }); return { albedo }; }),
  // speaker grille: black perforated steel (hex holes) — albedo + relief
  grille: () => texPair('ev.grille', () => { const p = 16; const hole = (i, j) => { const row = Math.floor(j / (p * 0.866)), x = i / p + (row % 2) * 0.5, y = j / (p * 0.866); const fx = x - Math.floor(x) - 0.5, fy = y - Math.floor(y) - 0.5; return Math.hypot(fx, fy * 0.866) < 0.3 ? 1 : 0; };
    const albedo = paint(N, N, (i, j) => { const v = hole(i, j) ? 0.012 : 0.07 + hash(i, j, 2) * 0.02; return [v, v, v]; });
    const height = paint(N, N, (i, j) => { const v = hole(i, j) ? 0.1 : 0.8; return [v, v, v]; }); return { albedo, height, strength: 2.4 }; }),
  // canopy / marquee PVC fabric: fine weave, soft soiling streaks (white — vertex colours tint it)
  fabric: () => texPair('ev.fabric', () => { const wv = (i, j) => 0.5 + 0.25 * Math.sin(i * Math.PI / 2) * Math.sin(j * Math.PI / 2);
    const albedo = paint(N, N, (i, j) => { const s = fbm(i / 200, j / 26, 5, 12, 3), d = fbm(i / 60, j / 60, 17, 14, 4); const v = 0.9 + wv(i, j) * 0.05 - (s > 0.62 ? (s - 0.62) * 0.35 : 0) - d * 0.06; return [v, v * 0.995, v * 0.98]; });
    const height = paint(N, N, (i, j) => { const v = wv(i, j); return [v, v, v]; }); return { albedo, height, strength: 0.9 }; }),
  // hot-dip galvanised steel: spangle crystals, dull grey
  steel: () => texPair('ev.steel', () => { const cells = []; for (let k = 0; k < 420; k++) cells.push([rnd() * N, rnd() * N, 0.6 + rnd() * 0.18]);
    const grid = new Map(); const G = 64; for (const c of cells) { const key = (Math.floor(c[0] / G)) * 100 + Math.floor(c[1] / G); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(c); }
    const near = (i, j) => { const gi = Math.floor(i / G), gj = Math.floor(j / G); let best = null, bd = 1e9; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = grid.get(((gi + a + 16) % 16) * 100 + ((gj + b + 16) % 16)); if (!L) continue; for (const c of L) { let dx = Math.abs(c[0] - i), dy = Math.abs(c[1] - j); if (dx > N / 2) dx = N - dx; if (dy > N / 2) dy = N - dy; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } } } return best ? best[2] : 0.66; };
    const albedo = paint(N, N, (i, j) => { const v = near(i, j) + hash(i, j, 4) * 0.03 - fbm(i / 80, j / 80, 12, 21, 3) * 0.08; return [v, v * 1.01, v * 1.03]; }); return { albedo }; }),
  // moulded plastic (chairs, bins, cabins, barriers): subtle speckle and moulding swirl (white — tinted by vertex colour)
  plastic: () => texPair('ev.plastic', () => { const albedo = paint(N, N, (i, j) => { const v = 0.93 + fbm(i / 120, j / 120, 8, 31, 3) * 0.05 + hash(i, j, 9) * 0.02 - (hash(i >> 1, j >> 1, 33) < 0.002 ? 0.2 : 0); return [v, v, v]; }); return { albedo }; }),
  // flight-case laminate: black pebble-grain
  caseLam: () => texPair('ev.case', () => { const albedo = paint(N, N, (i, j) => { const v = 0.06 + hash(i >> 1, j >> 1, 41) * 0.035 + fbm(i / 50, j / 50, 20, 42, 3) * 0.02; return [v, v, v]; }); return { albedo }; }),
  // temporary fence wire mesh (alpha-tested): 75 × 250 mm cells over a 1 m tile
  mesh: () => texPair('ev.mesh', () => { const albedo = paint(N, N, (i, j) => { const a = i % 77 < 4 || j % 256 < 5 ? 1 : 0; const v = 0.62 + hash(i, j, 6) * 0.05; return [v, v, v * 1.02, a]; }); return { albedo }; }),
  // rubber (cable ramps, cable jackets, feet): fine tread ribs
  rubber: () => texPair('ev.rubber', () => { const albedo = paint(N, N, (i, j) => { const rib = (j % 32) < 6 ? 0.05 : 0; const v = 0.86 - rib * 2 + hash(i, j, 12) * 0.06; return [v, v, v]; }); const height = paint(N, N, (i, j) => { const v = (j % 32) < 6 ? 0.2 : 0.7; return [v, v, v]; }); return { albedo, height, strength: 1.2 }; }),
  // table cloth / dressing fabric: woven cotton with soft folds (white — tinted per table)
  cloth: () => texPair('ev.cloth', () => { const albedo = paint(N, N, (i, j) => { const fold = 0.5 + 0.5 * Math.sin(i / N * Math.PI * 2 * 9 + fbm(i / 200, j / 200, 5, 5, 2) * 4); const v = 0.86 + fold * 0.07 + ((i + j) % 3 === 0 ? 0.02 : 0) + hash(i, j, 13) * 0.02; return [v, v, v * 0.985]; }); return { albedo }; }),
  // plywood / timber (table tops, staging boards backstage, sign frames)
  wood: () => texPair('ev.wood', () => { const albedo = paint(N, N, (i, j) => { const g = fbm(i / 300, j / 6, 4, 51, 4), k = Math.sin((j / N) * 40 + g * 9) * 0.5 + 0.5; const v = 0.55 + k * 0.12 + hash(i, j, 52) * 0.03; return [v * 1.0, v * 0.78, v * 0.55]; }); return { albedo }; }),
};
// ---------------------------------------------------------------------------------------------- shared materials
const MDEF = {
  evBlack: { s: 'ply', rough: 0.8, color: 0xffffff }, evDeck: { s: 'deck', rough: 0.72 }, evSkirt: { s: 'skirt', rough: 0.97 }, evAlu: { s: 'alu', rough: 0.34, metal: 1 },
  evGrille: { s: 'grille', rough: 0.62, metal: 0.35 }, evFabric: { s: 'fabric', rough: 0.88, side: THREE.DoubleSide }, evSteel: { s: 'steel', rough: 0.42, metal: 0.85 },
  evPlastic: { s: 'plastic', rough: 0.48 }, evCase: { s: 'caseLam', rough: 0.55 }, evMesh: { s: 'mesh', rough: 0.45, metal: 0.8, alphaTest: 0.5, side: THREE.DoubleSide },
  evRubber: { s: 'rubber', rough: 0.9 }, evCloth: { s: 'cloth', rough: 0.95, side: THREE.DoubleSide }, evWood: { s: 'wood', rough: 0.68 },
  evPaint: { rough: 0.5, metal: 0.2 }, // painted steel / plant (generator, hoist bodies): flat vertex colour
};
const MATS = new Map();
export function evMaterial(name) {
  if (MATS.has(name)) return MATS.get(name);
  let m;
  if (name === 'evLens') { m = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.15, metalness: 0, emissive: new THREE.Color(0xfff2d8), emissiveIntensity: 0.0, vertexColors: true }); }
  else if (name === 'evGlow') { m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true, side: THREE.DoubleSide }); m.color.setScalar(0.85); }
  else if (name === 'evFlag') { m = new THREE.MeshStandardMaterial({ map: buddhistFlagTex() || null, color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }); }
  else if (name === 'evBeam') { m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }); }
  else { const d = MDEF[name] || {}; const T = d.s && SURF[d.s] ? SURF[d.s]() : null;
    m = new THREE.MeshStandardMaterial({ map: T ? T.map : null, normalMap: T && T.normal ? T.normal : null, color: d.color ?? 0xffffff, vertexColors: true, roughness: d.rough ?? 0.7, metalness: d.metal ?? 0 });
    if (T && T.normal) m.normalScale = new THREE.Vector2(0.8, 0.8); if (d.side) m.side = d.side; if (d.alphaTest) { m.alphaTest = d.alphaTest; m.transparent = false; } }
  m.name = name; MATS.set(name, m); return m;
}
export const EV_MAT_NAMES = () => [...Object.keys(MDEF), 'evLens', 'evGlow', 'evBeam', 'evFlag'];
export function prewarmMaterials() { const out = []; for (const k of [...Object.keys(MDEF), 'evLens', 'evGlow', 'evBeam', 'evFlag']) out.push(evMaterial(k)); return out; }
export const MAT_NAMES = () => [...MATS.keys()];
// the Buddhist flag (blue, yellow, red, white, orange bands + the combined sixth band) — shared, small
let BFLAG = null;
export function buddhistFlagTex() {
  if (BFLAG !== null) return BFLAG; if (!hasCanvas()) return (BFLAG = undefined);
  const c = cv(512, 256), a = c.getContext('2d'); const cols = ['#0050a4', '#ffcc00', '#d40000', '#ffffff', '#ff7f00']; const bw = 512 / 6;
  for (let i = 0; i < 5; i++) { a.fillStyle = cols[i]; a.fillRect(i * bw, 0, bw + 1, 256); } for (let i = 0; i < 5; i++) { a.fillStyle = cols[i]; a.fillRect(5 * bw, i * 256 / 5, bw, 256 / 5 + 1); }
  BFLAG = toTex(c, true, false); return BFLAG;
}

// ---------------------------------------------------------------------------------------------- geometry helpers
// a cylinder between two points (truss chords / braces, poles, cables). col: vertex colour
export function tube(mb, ax, ay, az, bx, by, bz, r, seg = 6, col, caps = false) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1; const ux = dx / L, uy = dy / L, uz = dz / L;
  let hx = 0, hy = 1, hz = 0; if (Math.abs(uy) > 0.9) { hx = 1; hy = 0; } let px = uy * hz - uz * hy, py = uz * hx - ux * hz, pz = ux * hy - uy * hx; const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px; const base = mb.vcount; const C = 2 * Math.PI * r;
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); const nx = px * c + qx * s, ny = py * c + qy * s, nz = pz * c + qz * s;
    mb.vert(ax + nx * r, ay + ny * r, az + nz * r, nx, ny, nz, (i / seg) * C, 0, col); mb.vert(bx + nx * r, by + ny * r, bz + nz * r, nx, ny, nz, (i / seg) * C, L, col); }
  for (let i = 0; i < seg; i++) { const a = base + i * 2; mb.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  if (caps) for (const [cx, cy, cz, sg] of [[ax, ay, az, -1], [bx, by, bz, 1]]) { const ct = mb.vert(cx, cy, cz, ux * sg, uy * sg, uz * sg, 0.5, 0.5, col); const s0 = mb.vcount;
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); mb.vert(cx + (px * c + qx * s) * r, cy + (py * c + qy * s) * r, cz + (pz * c + qz * s) * r, ux * sg, uy * sg, uz * sg, 0.5 + c * 0.5, 0.5 + s * 0.5, col); }
    for (let i = 0; i < seg; i++) { if (sg > 0) mb.idx.push(ct, s0 + i, s0 + i + 1); else mb.idx.push(ct, s0 + i + 1, s0 + i); } }
  return mb;
}
// sphere-ish knob (ball corners, mic heads, lamp bulbs)
export function knob(mb, x, y, z, r, col, seg = 6) { const base = mb.vcount; const rows = 4;
  for (let j = 0; j <= rows; j++) { const v = j / rows, ph = v * Math.PI, sy = Math.cos(ph), sr = Math.sin(ph); for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; const nx = Math.cos(a) * sr, nz = Math.sin(a) * sr; mb.vert(x + nx * r, y + sy * r, z + nz * r, nx, sy, nz, i / seg, v, col); } }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, b = a + seg + 1; mb.idx.push(a, a + 1, b, a + 1, b + 1, b); } return mb; }
const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const COL = { white: [1, 1, 1], black: C('#1a1a1a'), grey: C('#8a8d90'), dark: C('#2b2d30'), yellow: C('#e8b417'), red: C('#b8231c'), blue: C('#1f4fa0'), green: C('#1f7a3c'), orange: C('#e06a12'), cream: C('#efe6d2'), navy: C('#1b2a4a'), maroon: C('#6d1420'), gold: C('#c9952b'), teal: C('#1e7f86') };

// ---------------------------------------------------------------------------------------------- parts (built once, cached)
// each part: Map(material → BufferGeometry), local frame: +z = front, y = 0 on the ground
const PARTS = new Map();
function part(name, build) { if (PARTS.has(name)) return PARTS.get(name); const bs = new Map(); const get = (m) => { let b = bs.get(m); if (!b) bs.set(m, (b = new MeshBuilder())); return b; };
  build(get); const out = new Map(); let tris = 0; for (const [m, b] of bs) { const g = b.build(); if (g) { out.set(m, g); tris += g.index.count / 3; } } out.tris = tris; PARTS.set(name, out); return out; }
// box truss segment (290 mm, 4 chords Ø48, zig-zag lacing Ø16 on all four faces), along +x from 0 to len, centred on y/z
function trussGeo(get, len) { const A = get('evAlu'), h = 0.145, r = 0.024, rl = 0.008; const P = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (const [y, z] of P) tube(A, 0, y, z, len, y, z, r, 8, COL.white);
  const n = Math.max(1, Math.round(len / 0.29)), st = len / n;
  for (let f = 0; f < 4; f++) { const a = P[f], b = P[(f + 1) % 4]; for (let i = 0; i < n; i++) { const x0 = i * st, x1 = x0 + st; const s = i % 2; const pa = s ? a : b, pb = s ? b : a; tube(A, x0, pa[0], pa[1], x1, pb[0], pb[1], rl, 5, COL.white); } }
  for (const x of [0.02, len - 0.02]) { for (let f = 0; f < 4; f++) { const a = P[f], b = P[(f + 1) % 4]; tube(A, x, a[0], a[1], x, b[0], b[1], 0.012, 5, COL.white); } // end frames + conical couplers
    for (const [y, z] of P) tube(A, x - 0.02, y, z, x + 0.02, y, z, 0.03, 8, COL.white); } }
export const PART = {
  truss2: () => part('truss2', (g) => trussGeo(g, 2)), truss1: () => part('truss1', (g) => trussGeo(g, 1)), truss05: () => part('truss05', (g) => trussGeo(g, 0.5)),
  trussCorner: () => part('trussCorner', (g) => { const A = g('evAlu'); const h = 0.145; for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]]) tube(A, x, y - 0.17, -h, x, y + 0.17, -h, 0.026, 8, COL.white); A.box(0, 0, 0, 0.32, 0.32, 0.32, { col: [0.9, 0.9, 0.92], uvScale: 0.3 }); }),
  // base plate with four outriggers and levelling feet (tower foot)
  trussBase: () => part('trussBase', (g) => { const S = g('evSteel'), R = g('evRubber'); S.box(0, 0.012, 0, 0.8, 0.024, 0.8, { col: [0.75, 0.75, 0.75], uvScale: 0.6 }); for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { tube(S, 0, 0.05, 0, x * 0.75, 0.03, z * 0.75, 0.02, 6, [0.7, 0.7, 0.7]); R.cylinder(x * 0.75, 0, z * 0.75, 0.06, 0.06, 0.03, 8, { col: [0.2, 0.2, 0.2] }); } }),
  // line-array hang: bumper frame, 6 boxes curving into a J, hoist chain up to the truss (top at y = 0, hangs downward)
  lineArray: () => part('lineArray', (g) => { const B = g('evBlack'), G = g('evGrille'), S = g('evSteel'); S.box(0, -0.06, 0, 1.0, 0.08, 0.62, { col: [0.25, 0.25, 0.26], uvScale: 0.4 }); tube(S, 0, 0, 0, 0, 0.9, 0, 0.012, 4, [0.3, 0.3, 0.3]);
    let y = -0.12, ang = 0, zf = 0; for (let i = 0; i < 6; i++) { const hgt = 0.33, a = ang; const cy = y - hgt / 2 * Math.cos(a), cz = zf + hgt / 2 * Math.sin(a);
      const box = new MeshBuilder(); box.box(0, 0, 0, 0.92, hgt - 0.01, 0.56, { col: [1, 1, 1], uvScale: 0.5 }); const gr = new MeshBuilder(); gr.quad([-0.44, -hgt / 2 + 0.02, 0.281], [0.44, -hgt / 2 + 0.02, 0.281], [0.44, hgt / 2 - 0.02, 0.281], [-0.44, hgt / 2 - 0.02, 0.281], [0, 0, 1.6, 0.6]);
      const m = new THREE.Matrix4().makeRotationX(-a).setPosition(0, cy, cz); B.geometry(box.build(), m); G.geometry(gr.build(), m);
      y -= hgt * Math.cos(a); zf += hgt * Math.sin(a); ang += 0.06 + i * 0.035; } }),
  // ground-stacked PA: double-18" sub with a two-way top on a pole-free stack
  sub: () => part('sub', (g) => { const B = g('evBlack'), G = g('evGrille'), S = g('evSteel'), R = g('evRubber'); B.box(0, 0.36, 0, 1.2, 0.68, 0.78, { col: [1, 1, 1], uvScale: 0.6 }); G.quad([-0.57, 0.06, 0.392], [0.57, 0.06, 0.392], [0.57, 0.66, 0.392], [-0.57, 0.66, 0.392], [0, 0, 2.2, 1.2]);
    for (const x of [-0.45, 0.45]) R.box(x, 0.012, 0.25, 0.12, 0.024, 0.12, { col: [0.2, 0.2, 0.2] }), R.box(x, 0.012, -0.25, 0.12, 0.024, 0.12, { col: [0.2, 0.2, 0.2] }); for (const x of [-0.6, 0.6]) S.box(x + Math.sign(x) * 0.008, 0.5, 0, 0.016, 0.06, 0.22, { col: [0.5, 0.5, 0.5] }); }),
  top: () => part('top', (g) => { const B = g('evBlack'), G = g('evGrille'); const T = new MeshBuilder(); T.box(0, 0, 0, 0.56, 0.96, 0.48, { col: [1, 1, 1], uvScale: 0.5 }); const F = new MeshBuilder(); F.quad([-0.26, -0.45, 0.241], [0.26, -0.45, 0.241], [0.26, 0.45, 0.241], [-0.26, 0.45, 0.241], [0, 0, 1, 1.8]);
    const m = new THREE.Matrix4().makeRotationX(-0.08).setPosition(0, 0.48, 0); B.geometry(T.build(), m); G.geometry(F.build(), m); }),
  // floor wedge monitor (sloped grille face toward the performer = +z)
  monitor: () => part('monitor', (g) => { const B = g('evBlack'), G = g('evGrille'); const w = 0.62, d = 0.48; const P = (x, y, z) => [x, y, z];
    B.quad(P(w / 2, 0, -d / 2), P(-w / 2, 0, -d / 2), P(-w / 2, 0.42, -d / 2), P(w / 2, 0.42, -d / 2)); // back (−z)
    for (const sx of [-1, 1]) { const x = sx * w / 2; const pts = sx > 0 ? [P(x, 0, d / 2), P(x, 0, -d / 2), P(x, 0.42, -d / 2), P(x, 0.16, d / 2)] : [P(x, 0, -d / 2), P(x, 0, d / 2), P(x, 0.16, d / 2), P(x, 0.42, -d / 2)]; B.planar(pts, [1, 1, 1], 2); } // sides (outward)
    G.quad(P(-w / 2, 0.16, d / 2), P(w / 2, 0.16, d / 2), P(w / 2, 0.42, -d / 2), P(-w / 2, 0.42, -d / 2), [0, 0, 1.3, 1.1]); B.quad(P(-w / 2, 0, d / 2), P(w / 2, 0, d / 2), P(w / 2, 0.16, d / 2), P(-w / 2, 0.16, d / 2)); }),
  // tripod mic stand with boom and a vocal mic (boom toward +z)
  micStand: () => part('micStand', (g) => { const B = g('evBlack'), S = g('evSteel'); for (let i = 0; i < 3; i++) { const a = i * 2.094; tube(B, 0, 0.32, 0, Math.sin(a) * 0.3, 0.01, Math.cos(a) * 0.3, 0.008, 4, [0.2, 0.2, 0.2]); }
    tube(B, 0, 0.0, 0, 0, 1.25, 0, 0.011, 6, [0.15, 0.15, 0.15]); knob(S, 0, 1.25, 0, 0.022, [0.4, 0.4, 0.4]); tube(B, 0, 1.25, -0.25, 0, 1.42, 0.38, 0.008, 5, [0.15, 0.15, 0.15]); tube(B, 0, 1.42, 0.38, 0, 1.4, 0.5, 0.012, 6, [0.08, 0.08, 0.08]); knob(S, 0, 1.4, 0.52, 0.026, [0.55, 0.55, 0.58]); }),
  // PAR can on its yoke with a hook clamp (hangs from y = 0 down; lens toward +z, tilted down)
  par: () => part('par', (g) => { const B = g('evBlack'), Ln = g('evLens'), S = g('evSteel'); S.box(0, -0.04, 0, 0.06, 0.08, 0.1, { col: [0.3, 0.3, 0.3] }); tube(B, -0.13, -0.1, 0, -0.13, -0.24, 0, 0.01, 4, [0.12, 0.12, 0.12]); tube(B, 0.13, -0.1, 0, 0.13, -0.24, 0, 0.01, 4, [0.12, 0.12, 0.12]); tube(B, -0.13, -0.1, 0, 0.13, -0.1, 0, 0.01, 4, [0.12, 0.12, 0.12]);
    const can = new MeshBuilder(); tube(can, 0, 0, -0.18, 0, 0, 0.16, 0.11, 10, [1, 1, 1], true); const m = new THREE.Matrix4().makeRotationX(0.55).setPosition(0, -0.24, 0); B.geometry(can.build(), m);
    const lens = new MeshBuilder(); lens.cylinder(0, 0, 0, 0.095, 0.095, 0.004, 10, { col: [1, 0.95, 0.85] }); const m2 = new THREE.Matrix4().makeRotationX(Math.PI / 2 + 0.55); m2.setPosition(0, -0.24 - Math.sin(0.55) * 0.162, Math.cos(0.55) * 0.162); Ln.geometry(lens.build(), m2); }),
  // moving head on the deck / truss top (base box, yoke, head; lens toward +z)
  movHead: () => part('movHead', (g) => { const B = g('evBlack'), Ln = g('evLens'); B.box(0, 0.09, 0, 0.42, 0.18, 0.34, { col: [1, 1, 1], uvScale: 0.4 }); for (const x of [-0.17, 0.17]) B.box(x, 0.32, 0, 0.05, 0.3, 0.12, { col: [0.9, 0.9, 0.9] }); B.box(0, 0.2, 0, 0.36, 0.04, 0.14, { col: [0.9, 0.9, 0.9] });
    const hd = new MeshBuilder(); tube(hd, 0, 0, -0.15, 0, 0, 0.17, 0.13, 10, [1, 1, 1], true); B.geometry(hd.build(), new THREE.Matrix4().makeRotationX(-0.35).setPosition(0, 0.4, 0));
    const lens = new MeshBuilder(); lens.cylinder(0, 0, 0, 0.11, 0.11, 0.004, 12, { col: [1, 1, 1] }); const m2 = new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.35); m2.setPosition(0, 0.4 + Math.sin(0.35) * 0.172, Math.cos(0.35) * 0.172); Ln.geometry(lens.build(), m2); }),
  // road case on castors: laminate panels, aluminium edge extrusion, ball corners, butterfly latches, recessed handles
  case: () => part('case', (g) => { const K = g('evCase'), A = g('evAlu'), R = g('evRubber'), S = g('evSteel'); const w = 0.62, d = 0.62, h = 0.95, y0 = 0.12; K.box(0, y0 + h / 2, 0, w, h, d, { col: [1, 1, 1], uvScale: 0.6, bottom: true });
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { tube(A, x * w / 2, y0, z * d / 2, x * w / 2, y0 + h, z * d / 2, 0.012, 4, [0.85, 0.85, 0.85]); knob(S, x * w / 2, y0 + h, z * d / 2, 0.02, [0.7, 0.7, 0.7]); knob(S, x * w / 2, y0, z * d / 2, 0.02, [0.7, 0.7, 0.7]); R.cylinder(x * 0.24, 0.0, z * 0.24, 0.05, 0.05, 0.07, 8, { col: [0.25, 0.25, 0.25] }); S.box(x * 0.24, 0.09, z * 0.24, 0.07, 0.04, 0.07, { col: [0.5, 0.5, 0.5] }); }
    for (const y of [y0, y0 + h, y0 + h * 0.62]) { tube(A, -w / 2, y, d / 2, w / 2, y, d / 2, 0.01, 4, [0.85, 0.85, 0.85]); tube(A, -w / 2, y, -d / 2, w / 2, y, -d / 2, 0.01, 4, [0.85, 0.85, 0.85]); tube(A, w / 2, y, -d / 2, w / 2, y, d / 2, 0.01, 4, [0.85, 0.85, 0.85]); tube(A, -w / 2, y, -d / 2, -w / 2, y, d / 2, 0.01, 4, [0.85, 0.85, 0.85]); }
    for (const x of [-0.2, 0.2]) S.box(x, y0 + h * 0.62, d / 2 + 0.006, 0.06, 0.05, 0.012, { col: [0.7, 0.7, 0.7] }); for (const x of [-w / 2 - 0.006, w / 2 + 0.006]) S.box(x, y0 + h * 0.8, 0, 0.012, 0.06, 0.16, { col: [0.6, 0.6, 0.6] }); }),
  // crowd-control barrier ("bike rack") 2.3 m: galvanised tube frame, vertical infill, flat feet (front = +z face)
  barrier: () => part('barrier', (g) => { const S = g('evSteel'); const w = 2.3, h = 1.1; tube(S, -w / 2, 0.12, 0, -w / 2, h, 0, 0.021, 6, [1, 1, 1]); tube(S, w / 2, 0.12, 0, w / 2, h, 0, 0.021, 6, [1, 1, 1]); tube(S, -w / 2, h, 0, w / 2, h, 0, 0.021, 6, [1, 1, 1]); tube(S, -w / 2, 0.2, 0, w / 2, 0.2, 0, 0.018, 6, [1, 1, 1]);
    for (let i = 1; i < 14; i++) { const x = -w / 2 + (i / 14) * w; tube(S, x, 0.2, 0, x, h, 0, 0.008, 4, [1, 1, 1]); } for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) { S.box(x, 0.008, 0, 0.05, 0.016, 0.62, { col: [0.9, 0.9, 0.9] }); tube(S, x, 0.016, 0, x, 0.2, 0, 0.012, 4, [1, 1, 1]); } }),
  // front-of-stage "mojo" barrier section 1 m: sloped deck plate the crowd stands on, upright frame, step for security
  mojo: () => part('mojo', (g) => { const S = g('evSteel'), B = g('evPaint'); B.box(0, 0.6, 0, 1.0, 1.2, 0.05, { col: C('#2a2c2f'), uvScale: 0.5 }); B.box(0, 1.22, 0.04, 1.0, 0.06, 0.16, { col: C('#202224') }); S.quad([-0.5, 0.02, 1.15], [0.5, 0.02, 1.15], [0.5, 0.06, 0.03], [-0.5, 0.06, 0.03], [0, 0, 1, 1]); for (const x of [-0.46, 0.46]) tube(S, x, 0.06, 0.02, x, 0.04, -0.55, 0.02, 5, [0.8, 0.8, 0.8]), S.box(x, 0.2, -0.45, 0.04, 0.4, 0.04, { col: [0.8, 0.8, 0.8] }); S.box(0, 0.35, -0.4, 0.9, 0.04, 0.22, { col: [0.75, 0.75, 0.75] }); }),
  // Heras-type temporary fence panel 3.5 × 2 m on two concrete-filled plastic feet (mesh alpha-tested)
  fence: () => part('fence', (g) => { const S = g('evSteel'), M = g('evMesh'), P = g('evPlastic'); const w = 3.4, h = 1.95; for (const x of [-w / 2, w / 2]) tube(S, x, 0.12, 0, x, 0.12 + h, 0, 0.021, 6, [1, 1, 1]); tube(S, -w / 2, 0.12, 0, w / 2, 0.12, 0, 0.021, 6, [1, 1, 1]); tube(S, -w / 2, 0.12 + h, 0, w / 2, 0.12 + h, 0, 0.021, 6, [1, 1, 1]);
    M.quad([-w / 2, 0.12, 0], [w / 2, 0.12, 0], [w / 2, 0.12 + h, 0], [-w / 2, 0.12 + h, 0], [0, 0, w, h]); for (const x of [-w / 2, w / 2]) P.box(x, 0.07, 0, 0.22, 0.14, 0.62, { col: C('#d8d8d4') }); }),
  // 3 × 3 m pop-up gazebo: four legs with foot plates and weights, scissor frame, peaked canopy + valance (canopy tinted per use)
  gazebo: () => part('gazebo', (g) => { const S = g('evAlu'), F = g('evFabric'), W = g('evPlastic'); const h = 2.3, s = 1.5;
    for (const [x, z] of [[s, s], [-s, s], [s, -s], [-s, -s]]) { tube(S, x, 0, z, x, h, z, 0.022, 6, [1, 1, 1]); S.box(x, 0.004, z, 0.16, 0.008, 0.16, { col: [0.8, 0.8, 0.8] }); W.box(x, 0.06, z + (z > 0 ? -0.14 : 0.14), 0.18, 0.12, 0.12, { col: C('#3c3c3c') }); }
    for (const [ax, az, bx, bz] of [[-s, s, s, s], [-s, -s, s, -s], [s, -s, s, s], [-s, -s, -s, s]]) { tube(S, ax, h - 0.32, az, bx, h, bz, 0.01, 4, [0.95, 0.95, 0.95]); tube(S, ax, h, az, bx, h - 0.32, bz, 0.01, 4, [0.95, 0.95, 0.95]); tube(S, ax, h, az, bx, h, bz, 0.014, 4, [0.95, 0.95, 0.95]); }
    for (const [x, z] of [[s, s], [-s, s], [s, -s], [-s, -s]]) tube(S, x, h, z, 0, h + 0.75, 0, 0.012, 4, [0.95, 0.95, 0.95]);
    const pk = [0, h + 0.8, 0], E = [[-s - 0.05, h + 0.02, s + 0.05], [s + 0.05, h + 0.02, s + 0.05], [s + 0.05, h + 0.02, -s - 0.05], [-s - 0.05, h + 0.02, -s - 0.05]];
    for (let i = 0; i < 4; i++) { const a = E[i], b = E[(i + 1) % 4]; F.planar([a, b, pk], [1, 1, 1], 0.5); F.quad([a[0], a[1] - 0.22, a[2]], [b[0], b[1] - 0.22, b[2]], b, a, [0, 0, 1.5, 0.12]); } }),
  // 6 × 9 m marquee: frame poles, ridge, pitched roof and gable ends; sidewalls rolled up at the eaves
  marquee: () => part('marquee', (g) => { const S = g('evAlu'), F = g('evFabric'), W = g('evSteel'); const hx = 3, hz = 4.5, eave = 2.5, ridge = 3.7;
    for (const z of [-hz, -hz / 2, 0, hz / 2, hz]) { for (const x of [-hx, hx]) { tube(S, x, 0, z, x, eave, z, 0.04, 8, [1, 1, 1]); W.box(x, 0.006, z, 0.25, 0.012, 0.25, { col: [0.7, 0.7, 0.7] }); tube(S, x, eave, z, 0, ridge, z, 0.035, 6, [1, 1, 1]); } }
    tube(S, 0, ridge, -hz, 0, ridge, hz, 0.035, 6, [1, 1, 1]); for (const x of [-hx, hx]) tube(S, x, eave, -hz, x, eave, hz, 0.03, 6, [1, 1, 1]);
    const r = 0.06; F.planar([[-hx - r, eave - 0.02, hz + r], [-hx - r, eave - 0.02, -hz - r], [0, ridge + 0.04, -hz - r], [0, ridge + 0.04, hz + r]], [1, 1, 1], 0.5); F.planar([[hx + r, eave - 0.02, -hz - r], [hx + r, eave - 0.02, hz + r], [0, ridge + 0.04, hz + r], [0, ridge + 0.04, -hz - r]], [1, 1, 1], 0.5);
    for (const z of [-hz - r, hz + r]) { const sg = z > 0 ? 1 : -1; F.planar(sg > 0 ? [[-hx - r, eave - 0.02, z], [hx + r, eave - 0.02, z], [0, ridge + 0.04, z]] : [[hx + r, eave - 0.02, z], [-hx - r, eave - 0.02, z], [0, ridge + 0.04, z]], [1, 1, 1], 0.5); }
    for (const x of [-hx - 0.08, hx + 0.08]) tube(F, x, eave - 0.18, -hz, x, eave - 0.18, hz, 0.12, 8, [0.96, 0.96, 0.96]); }),
  // folding table 1.8 × 0.75 (top only; a cloth is added per use)
  table: () => part('table', (g) => { const Wd = g('evWood'), S = g('evSteel'); Wd.box(0, 0.73, 0, 1.8, 0.03, 0.75, { col: [1, 1, 1], uvScale: 1 }); for (const x of [-0.8, 0.8]) { tube(S, x, 0, -0.3, x, 0.72, -0.3, 0.014, 5, [0.6, 0.6, 0.6]); tube(S, x, 0, 0.3, x, 0.72, 0.3, 0.014, 5, [0.6, 0.6, 0.6]); tube(S, x, 0.12, -0.3, x, 0.12, 0.3, 0.01, 4, [0.6, 0.6, 0.6]); } }),
  // fitted table cloth to the floor (front +z), colour per use
  tableCloth: () => part('tableCloth', (g) => { const Cl = g('evCloth'); const w = 1.86, d = 0.81, h = 0.76; Cl.box(0, h - 0.005, 0, w, 0.012, d, { col: [1, 1, 1], uvScale: 1 }); Cl.box(0, h / 2 + 0.01, 0, w, h - 0.02, d, { col: [1, 1, 1], uvScale: 1, top: false }); }),
  // registration desk: modular counter with a print panel slot (front +z), worktop, laptop, papers, two stools behind
  desk: () => part('desk', (g) => { const B = g('evBlack'), Wd = g('evWood'), P = g('evPlastic'), S = g('evSteel'); B.box(0, 0.5, 0.2, 2.0, 1.0, 0.06, { col: [1, 1, 1], uvScale: 1 }); for (const x of [-0.97, 0.97]) B.box(x, 0.5, -0.1, 0.06, 1.0, 0.6, { col: [1, 1, 1], uvScale: 1 }); Wd.box(0, 1.03, 0.05, 2.1, 0.04, 0.42, { col: [0.95, 0.9, 0.85] }); Wd.box(0, 0.74, -0.15, 1.9, 0.03, 0.55, { col: [0.9, 0.86, 0.8] });
    P.box(-0.4, 0.77, -0.2, 0.34, 0.02, 0.24, { col: C('#2b2b2e') }); const scr = new MeshBuilder(); scr.box(0, 0.11, 0, 0.34, 0.22, 0.012, { col: [0.17, 0.17, 0.19] }); P.geometry(scr.build(), new THREE.Matrix4().makeRotationX(-0.25).setPosition(-0.4, 0.78, -0.31)); for (let i = 0; i < 4; i++) P.box(0.35 + i * 0.012, 0.76 + i * 0.003, -0.15 - i * 0.01, 0.21, 0.003, 0.297, { col: [0.97, 0.97, 0.95] });
    for (const x of [-0.45, 0.45]) { P.cylinder(x, 0.72, -0.62, 0.17, 0.17, 0.05, 12, { col: C('#262626') }); tube(S, x, 0, -0.62, x, 0.72, -0.62, 0.025, 6, [0.6, 0.6, 0.6]); S.cylinder(x, 0, -0.62, 0.22, 0.2, 0.02, 12, { col: [0.5, 0.5, 0.5] }); S.cylinder(x, 0.3, -0.62, 0.2, 0.2, 0.015, 12, { col: [0.55, 0.55, 0.55] }); } }),
  // super-silent towable generator (canopy, wheels, drawbar, exhaust, control door), body colour per use
  generator: () => part('generator', (g) => { const Pn = g('evPaint'), R = g('evRubber'), S = g('evSteel'), B = g('evBlack'); Pn.box(0, 0.86, 0, 2.3, 1.2, 1.05, { col: C('#d8d6cf'), uvScale: 1 }); Pn.box(0, 1.5, 0, 2.2, 0.08, 1.0, { col: C('#cfcdc6') }); B.box(-0.6, 0.95, 0.53, 0.5, 0.6, 0.012, { col: [0.25, 0.25, 0.25] }); B.box(0.5, 0.86, 0.53, 0.9, 0.9, 0.006, { col: [0.6, 0.6, 0.6] });
    for (let i = 0; i < 8; i++) B.box(0.5, 0.5 + i * 0.1, 0.536, 0.82, 0.03, 0.01, { col: [0.15, 0.15, 0.15] }); S.cylinder(0.8, 1.54, -0.2, 0.06, 0.06, 0.25, 8, { col: [0.35, 0.33, 0.3] }); S.box(0, 0.22, 0, 2.0, 0.12, 0.9, { col: [0.3, 0.3, 0.3] });
    for (const z of [-0.6, 0.6]) { const w = new MeshBuilder(); tube(w, 0, 0, -0.09, 0, 0, 0.09, 0.27, 12, [0.15, 0.15, 0.15], true); R.geometry(w.build(), new THREE.Matrix4().makeRotationY(0).setPosition(0, 0.27, z)); }
    tube(S, -1.15, 0.3, 0, -2.05, 0.38, 0, 0.04, 6, [0.4, 0.4, 0.4]); S.box(-2.08, 0.2, 0, 0.12, 0.38, 0.08, { col: [0.4, 0.4, 0.4] }); S.box(-2.08, 0.01, 0, 0.18, 0.02, 0.18, { col: [0.35, 0.35, 0.35] }); S.box(1.05, 0.2, 0, 0.08, 0.4, 0.08, { col: [0.4, 0.4, 0.4] }); }),
  // 240 L wheelie bin (body colour per use)
  bin: () => part('bin', (g) => { const P = g('evPlastic'), R = g('evRubber'); const top = 1.0; P.planar([[-0.29, 0.06, 0.36], [0.29, 0.06, 0.36], [0.31, top, 0.4], [-0.31, top, 0.4]], [1, 1, 1], 2); P.planar([[0.29, 0.06, -0.36], [-0.29, 0.06, -0.36], [-0.31, top, -0.4], [0.31, top, -0.4]], [1, 1, 1], 2);
    P.planar([[0.29, 0.06, 0.36], [0.29, 0.06, -0.36], [0.31, top, -0.4], [0.31, top, 0.4]], [1, 1, 1], 2); P.planar([[-0.29, 0.06, -0.36], [-0.29, 0.06, 0.36], [-0.31, top, 0.4], [-0.31, top, -0.4]], [1, 1, 1], 2); P.box(0, top + 0.03, 0.02, 0.66, 0.05, 0.88, { col: [0.9, 0.9, 0.9] }); P.box(0, top - 0.02, -0.43, 0.56, 0.04, 0.06, { col: [0.8, 0.8, 0.8] });
    for (const x of [-0.24, 0.24]) { const w = new MeshBuilder(); tube(w, -0.035, 0, 0, 0.035, 0, 0, 0.1, 10, [0.12, 0.12, 0.12], true); R.geometry(w.build(), new THREE.Matrix4().setPosition(x, 0.1, -0.36)); } P.box(0, 0.04, 0.3, 0.3, 0.08, 0.06, { col: [0.8, 0.8, 0.8] }); }),
  // portable toilet cabin (body colour per use; door +z)
  toilet: () => part('toilet', (g) => { const P = g('evPlastic'), S = g('evSteel'); P.box(0, 1.15, 0, 1.12, 2.1, 1.16, { col: [1, 1, 1], uvScale: 1 }); P.box(0, 0.05, 0, 1.18, 0.1, 1.22, { col: C('#d8d8d8') }); P.box(0, 2.25, 0, 1.2, 0.08, 1.24, { col: C('#ececec') }); P.box(0, 1.1, 0.585, 0.82, 1.9, 0.02, { col: [0.92, 0.92, 0.95] });
    for (let i = 0; i < 6; i++) P.box(0, 0.4 + i * 0.28, 0.598, 0.78, 0.02, 0.006, { col: [0.82, 0.82, 0.86] }); S.box(0.3, 1.1, 0.605, 0.04, 0.12, 0.02, { col: [0.6, 0.6, 0.6] }); P.box(0.3, 1.3, 0.6, 0.1, 0.04, 0.01, { col: C('#2e8b3a') }); S.cylinder(-0.4, 2.29, -0.4, 0.05, 0.05, 0.3, 8, { col: [0.3, 0.3, 0.3] }); }),
  // two-post information board (print area front +z; 1.2 × 1.6)
  infoBoard: () => part('infoBoard', (g) => { const Wd = g('evWood'), S = g('evSteel'); for (const x of [-0.68, 0.68]) { Wd.box(x, 1.15, 0, 0.09, 2.3, 0.09, { col: [0.75, 0.68, 0.6] }); S.box(x, 0.02, 0, 0.3, 0.04, 0.3, { col: [0.5, 0.5, 0.5] }); } Wd.box(0, 1.45, -0.02, 1.36, 1.72, 0.04, { col: [0.65, 0.6, 0.55] }); Wd.box(0, 2.34, 0.02, 1.5, 0.08, 0.2, { col: [0.6, 0.55, 0.5] }); }),
  // security post: small cabin with a window, roof overhang, steps (door +z)
  secHut: () => part('secHut', (g) => { const P = g('evPaint'), B = g('evBlack'), S = g('evSteel'); P.box(0, 1.2, 0, 1.4, 2.2, 1.4, { col: C('#e9e6dd'), uvScale: 1 }); P.box(0, 2.38, 0, 1.7, 0.12, 1.7, { col: C('#33373b') }); B.box(0, 1.5, 0.705, 1.0, 0.6, 0.012, { col: [0.2, 0.25, 0.3] }); B.box(0.705, 1.5, 0, 0.012, 0.6, 1.0, { col: [0.2, 0.25, 0.3] }); B.box(-0.705, 1.0, 0.1, 0.012, 1.9, 0.7, { col: [0.5, 0.5, 0.52] }); S.box(0, 0.06, 0.85, 1.0, 0.12, 0.3, { col: [0.5, 0.5, 0.5] }); }),
  // cable ramp section 0.9 m (yellow lid, black body) — flat, walk-over
  cableRamp: () => part('cableRamp', (g) => { const R = g('evRubber'); R.planar([[-0.45, 0, 0.25], [0.45, 0, 0.25], [0.45, 0.05, 0.1], [-0.45, 0.05, 0.1]], C('#1d1d1d'), 2); R.planar([[0.45, 0, -0.25], [-0.45, 0, -0.25], [-0.45, 0.05, -0.1], [0.45, 0.05, -0.1]], C('#1d1d1d'), 2); R.box(0, 0.052, 0, 0.9, 0.006, 0.2, { col: C('#e5b81a'), uvScale: 0.25 }); }),
  // traffic cone 750 mm with reflective collars
  cone: () => part('cone', (g) => { const P = g('evPlastic'); P.box(0, 0.015, 0, 0.42, 0.03, 0.42, { col: C('#1d1d1d') }); P.cylinder(0, 0.03, 0, 0.16, 0.025, 0.7, 12, { col: C('#ef5a14') }); P.cylinder(0, 0.33, 0, 0.098, 0.083, 0.08, 12, { col: [0.95, 0.95, 0.95], caps: false }); P.cylinder(0, 0.5, 0, 0.066, 0.05, 0.08, 12, { col: [0.95, 0.95, 0.95], caps: false }); }),
  // A-frame road sign base (print panel added per use) + sandbags
  roadSign: () => part('roadSign', (g) => { const S = g('evSteel'), Fb = g('evFabric'); for (const x of [-0.5, 0.5]) { tube(S, x, 0, 0.3, x, 1.3, 0.02, 0.016, 5, [0.8, 0.8, 0.8]); tube(S, x, 0, -0.3, x, 1.3, -0.02, 0.016, 5, [0.8, 0.8, 0.8]); } for (const z of [0.36, -0.36]) Fb.box(0, 0.06, z, 0.5, 0.12, 0.22, { col: C('#b5a37c') }); }),
  // FOH mixing console on its table (operator stands at -z)
  console: () => part('console', (g) => { const B = g('evBlack'), P = g('evPlastic'), Ln = g('evLens'); const s = new MeshBuilder(); s.box(0, 0, 0, 1.1, 0.08, 0.62, { col: [0.9, 0.9, 0.92], uvScale: 0.5 }); B.geometry(s.build(), new THREE.Matrix4().makeRotationX(-0.12).setPosition(0, 0.8, 0));
    for (let i = 0; i < 16; i++) P.box(-0.48 + i * 0.064, 0.86 - 0.012, -0.1, 0.012, 0.012, 0.08, { col: [0.75, 0.75, 0.75] }); P.box(0.3, 1.0, 0.25, 0.4, 0.26, 0.03, { col: C('#202124') }); Ln.box(0.3, 1.0, 0.234, 0.36, 0.22, 0.004, { col: [0.3, 0.5, 0.9] }); }),
  // first-aid stretcher bed (folding cot), kit bag, oxygen case
  cot: () => part('cot', (g) => { const S = g('evAlu'), F = g('evFabric'), B = g('evPaint'); for (const x of [-0.3, 0.3]) tube(S, x, 0.55, -0.95, x, 0.55, 0.95, 0.016, 5, [0.9, 0.9, 0.9]); for (const z of [-0.85, 0.85]) for (const x of [-0.3, 0.3]) tube(S, x, 0, z, x, 0.55, z * 0.95, 0.014, 5, [0.9, 0.9, 0.9]); F.box(0, 0.56, 0, 0.6, 0.03, 1.85, { col: C('#2a5f9e') }); B.box(0.55, 0.12, 0.6, 0.45, 0.24, 0.28, { col: C('#c62828') }); B.box(-0.6, 0.22, 0.5, 0.3, 0.44, 0.3, { col: C('#e6e6e6') }); }),
};
export function partTris(name) { const p = PART[name] && PART[name](); return p ? p.tris : 0; }
// monobloc plastic chair: one geometry (for an InstancedMesh; colour per instance)
let CHAIR = null;
export function chairGeometry() {
  if (CHAIR) return CHAIR; const P = new MeshBuilder(); const sh = 0.44;
  P.planar([[-0.22, sh, 0.22], [0.22, sh, 0.22], [0.23, sh + 0.02, -0.2], [-0.23, sh + 0.02, -0.2]], [1, 1, 1], 2); P.planar([[0.22, sh - 0.025, 0.22], [-0.22, sh - 0.025, 0.22], [-0.23, sh - 0.005, -0.2], [0.23, sh - 0.005, -0.2]], [0.85, 0.85, 0.85], 2);
  P.quad([-0.22, sh - 0.025, 0.22], [0.22, sh - 0.025, 0.22], [0.22, sh, 0.22], [-0.22, sh, 0.22], [0, 0, 1, 0.1]);
  const back = new MeshBuilder(); back.box(0, 0.2, 0, 0.44, 0.4, 0.025, { col: [1, 1, 1], uvScale: 0.5 }); for (let i = 0; i < 4; i++) back.box(-0.15 + i * 0.1, 0.14, 0.014, 0.03, 0.18, 0.004, { col: [0.75, 0.75, 0.75] }); P.geometry(back.build(), new THREE.Matrix4().makeRotationX(0.18).setPosition(0, sh + 0.04, -0.21));
  for (const [x, z] of [[0.21, 0.2], [-0.21, 0.2], [0.21, -0.19], [-0.21, -0.19]]) tube(P, x, sh - 0.02, z, x * 1.12, 0, z * 1.18, 0.022, 6, [0.92, 0.92, 0.92]);
  for (const x of [-0.235, 0.235]) tube(P, x, sh + 0.17, -0.18, x, sh + 0.17, 0.12, 0.016, 5, [1, 1, 1]), tube(P, x, sh + 0.17, 0.12, x, sh, 0.17, 0.016, 5, [1, 1, 1]);
  CHAIR = P.build(); return CHAIR;
}

// ---------------------------------------------------------------------------------------------- the per-site kit
// builds a site in its LOCAL frame (metres; +z toward the stage / back of the site) into one MeshBuilder per material.
export class EvKit {
  constructor() { this.b = new Map(); this.tris = 0; this.colliders = []; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3(); this._e = new THREE.Euler(); }
  mb(mat) { let b = this.b.get(mat); if (!b) this.b.set(mat, (b = new MeshBuilder())); return b; }
  // a cached part at (x, y, z), yaw (multiples of π/2 keep colliders exact), optional uniform / per-axis scale and tint
  part(name, x, y, z, yaw = 0, s = 1, tint = null, pitch = 0, roll = 0) {
    const P = PART[name](); this._e.set(pitch, yaw, roll, 'YXZ'); this._q.setFromEuler(this._e); if (typeof s === 'number') this._s.set(s, s, s); else this._s.set(s[0], s[1], s[2]); this._p.set(x, y, z); this._m.compose(this._p, this._q, this._s);
    for (const [mat, g] of P) this.mb(mat).geometry(g, this._m, tint && (mat === 'evPlastic' || mat === 'evFabric' || mat === 'evCloth' || mat === 'evPaint') ? tint : null); this.tris += P.tris; return this;
  }
  // an axis-aligned solid in the local frame (collider). h = height above the local ground at that point (y0 offsets it)
  solid(x0, z0, x1, z1, h, kind = 'event', extra = {}) { this.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, kind, ...extra }); return this; }
  // a printed panel from the site atlas (px rect in the 2048 × 1024 canvas) on a vertical quad facing +z (yaw rotates)
  print(mat, cx, cy, cz, w, h, yaw, rect, AW = 2048, AH = 1024) { const c = Math.cos(yaw), s = Math.sin(yaw); const P = (lx, ly) => [cx + lx * c, cy + ly, cz - lx * s];
    const u0 = rect[0] / AW, u1 = (rect[0] + rect[2]) / AW, v0 = 1 - (rect[1] + rect[3]) / AH, v1 = 1 - rect[1] / AH; this.mb(mat).quad(P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2), [u0, v0, u1, v1]); return this; }
  build(mats, opts = {}) { const g = new THREE.Group(); for (const [name, b] of this.b) { const geo = b.build(); if (!geo) continue; const m = new THREE.Mesh(geo, mats[name] || evMaterial(name)); m.name = 'ev:' + name; m.castShadow = opts.cast ?? (name !== 'evBeam' && name !== 'evGlow'); m.receiveShadow = name !== 'evBeam'; m.matrixAutoUpdate = false; m.updateMatrix(); g.add(m); } return g; }
}
