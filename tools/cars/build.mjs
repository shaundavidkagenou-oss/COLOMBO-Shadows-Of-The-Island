// Real-car asset pipeline (offline, Node): source GLB (CC BY, see tools/cars/models.mjs) → game-native vehicle GLB in
// public/assets/vehicles/<type>.glb. Run: node tools/cars/build.mjs [type ...] [--debug] [--view=box]
//
//  1. orient: uniform scale to real size, +z forward, ground at y = 0, centred on x and on the body length
//  2. islands: connected pieces (welded by position) so a logo / badge / handle is removed as a whole piece
//  3. wheels: four wheel cylinders found from the model's wheel parts (centre, radius, width)
//  4. classify: every triangle → a game category (paint, glass, chrome, rubber, lens, vlight, vtail, vind, vrev, mirror,
//     tyre, rim, caliper) or dropped (logos, badges, plates, the source interior: the game keeps its own fitted interior)
//  5. doors: the door panels cut out along each door's seam outline, given an inner door card and shut faces, with the
//     sampled outer skin for the grasp solver (doorGrab); the body gets jamb walls round the openings
//  6. LOD0 / LOD1 / LOD2 per category (meshoptimizer simplify, borders locked so door seams stay closed)
//  7. vertex colours baked from the base-colour textures; paint carries a plain shade (the game recolours it)
//  8. written as a quantized, meshopt-compressed GLB + metadata (asset.extras) + credits (public/assets/vehicles/CREDITS.md)
import fs from 'fs';
import path from 'path';
import { loadDoc, flatten, render, stackPNG, keyColour, srgbToLin, linToSrgb } from './lib.mjs';
import { MODELS } from './models.mjs';
import { sampleXS } from '../../src/vehicles/RealSpec.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SRC = process.env.CARSRC || path.join(process.env.HOME, 'carsrc');
const args = process.argv.slice(2); const DEBUG = args.includes('--debug'); const VIEW = (args.find((a) => a.startsWith('--view=')) || '').slice(7);
const only = args.filter((a) => !a.startsWith('--'));

export const CAT_COL = { paint: '#4f86c6', glass: '#86e0f0', chrome: '#e8e8e8', rubber: '#303030', lens: '#c8f0c8', vlight: '#fff27a', vtail: '#e01010', vind: '#ff9a10', vrev: '#ffffff', mirror: '#b0b0ff',
  tyre: '#151515', rim: '#a06030', caliper: '#c01060', interior: '#6a4a2a', drop: '#ff00ff', plate: '#ffff00', engine: '#507050' };

// ---------- 1. load + orient ----------
export async function loadModel(id) {
  const cfg = MODELS[id]; const parts = await flatten(await loadDoc(path.join(SRC, cfg.src)));
  const s = cfg.scale || 1, ry = cfg.rotY || 0, cy = Math.cos(ry), sy = Math.sin(ry);
  for (const p of parts) { const P = p.pos, N = p.nrm;
    for (let i = 0; i < P.length; i += 3) { const x = P[i] * s, y = P[i + 1] * s, z = P[i + 2] * s; P[i] = cy * x + sy * z; P[i + 1] = y; P[i + 2] = -sy * x + cy * z;
      if (N) { const a = N[i], c = N[i + 2]; N[i] = cy * a + sy * c; N[i + 2] = -sy * a + cy * c; } } }
  // triangles as a flat table (keeps the source part for material / texture lookups)
  const T = []; for (const p of parts) for (let t = 0; t < p.idx.length / 3; t++) { const tr = { p, t, mat: p.mat, node: p.path.join('/'), a: p.triCol[t * 4 + 3] }; tr.hex = hexOf(tr); T.push(tr); }
  return { cfg, parts, T };
}

// ---------- 2. islands (union-find over vertices welded by quantized position) ----------
function islands(M) {
  const key = new Map(); let nv = 0; const vid = []; // per part: vertex → global welded id
  for (const p of M.parts) { const ids = new Int32Array(p.pos.length / 3); for (let i = 0; i < ids.length; i++) { const k = Math.round(p.pos[i * 3] * 5000) + ',' + Math.round(p.pos[i * 3 + 1] * 5000) + ',' + Math.round(p.pos[i * 3 + 2] * 5000); let g = key.get(k); if (g === undefined) { g = nv++; key.set(k, g); } ids[i] = g; } vid.push(ids); }
  const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i; const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const pi = new Map(M.parts.map((p, i) => [p, i]));
  for (const tr of M.T) { const ids0 = vid[pi.get(tr.p)], I0 = tr.p.idx; tr.w = [ids0[I0[tr.t * 3]], ids0[I0[tr.t * 3 + 1]], ids0[I0[tr.t * 3 + 2]]]; }
  M.nWeld = nv;
  for (const tr of M.T) { const ids = vid[pi.get(tr.p)], I = tr.p.idx; const a = find(ids[I[tr.t * 3]]), b = find(ids[I[tr.t * 3 + 1]]), c = find(ids[I[tr.t * 3 + 2]]); if (a !== b) par[a] = b; const b2 = find(b); if (c !== b2) par[c] = b2; }
  const isl = new Map(); for (const tr of M.T) { const ids = vid[pi.get(tr.p)]; const r = find(ids[tr.p.idx[tr.t * 3]]); let o = isl.get(r); if (!o) isl.set(r, (o = { id: isl.size, n: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9], mats: new Set() })); tr.isl = o; o.n++; o.mats.add(tr.p.mat);
    for (const v of tri(tr)) for (let k = 0; k < 3; k++) { if (v[k] < o.lo[k]) o.lo[k] = v[k]; if (v[k] > o.hi[k]) o.hi[k] = v[k]; } }
  for (const o of isl.values()) { o.size = o.hi.map((v, k) => v - o.lo[k]); o.c = o.hi.map((v, k) => (v + o.lo[k]) / 2); }
  return isl;
}
export const tri = (tr) => { const P = tr.p.pos, I = tr.p.idx, t = tr.t; return [0, 1, 2].map((j) => { const i = I[t * 3 + j]; return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; }); };
const cen = (v) => [(v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][1] + v[1][1] + v[2][1]) / 3, (v[0][2] + v[1][2] + v[2][2]) / 3];
const fnorm = (v) => { const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]]; const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n); return { n: l ? n.map((x) => x / l) : [0, 1, 0], area: l / 2 }; };
export const hexOf = (tr) => { const c = tr.p.triCol, t = tr.t; return '#' + [0, 1, 2].map((k) => Math.round(linToSrgb(Math.min(1, c[t * 4 + k])) * 255).toString(16).padStart(2, '0')).join(''); };

// ---------- normalise: centre x / z, ground y = 0 (lowest tyre point), optional target length ----------
function normalise(M) {
  const cfg = M.cfg; let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; let gy = 1e9;
  for (const tr of M.T) { for (const v of tri(tr)) { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); } } }
  gy = cfg.groundY ?? lo[1]; /* the tyres' contact patch is the lowest point of a car model */ let k = 1; if (cfg.len) k = cfg.len / (cfg.lenOf ? cfg.lenOf(lo, hi) : hi[2] - lo[2]);
  const ox = (lo[0] + hi[0]) / 2, oz = (lo[2] + hi[2]) / 2;
  for (const p of M.parts) for (let i = 0; i < p.pos.length; i += 3) { p.pos[i] = (p.pos[i] - ox) * k; p.pos[i + 1] = (p.pos[i + 1] - gy) * k; p.pos[i + 2] = (p.pos[i + 2] - oz) * k; }
  M.scaleK = k; M.lo = [(lo[0] - ox) * k, (lo[1] - gy) * k, (lo[2] - oz) * k]; M.hi = [(hi[0] - ox) * k, (hi[1] - gy) * k, (hi[2] - oz) * k];
}

// ---------- 3. wheels ----------
function findWheels(M) {
  const W = [0, 1, 2, 3].map(() => ({ lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9], n: 0 })); // order: FL(+x,+z) FR(−x,+z) RL(+x,−z) RR(−x,−z)
  for (const tr of M.T) { if (!M.cfg.isWheel(tr)) continue; const v = tri(tr), c = cen(v); const w = W[(c[0] > 0 ? 0 : 1) + (c[2] > 0 ? 0 : 2)]; w.n++; for (const p of v) for (let k = 0; k < 3; k++) { w.lo[k] = Math.min(w.lo[k], p[k]); w.hi[k] = Math.max(w.hi[k], p[k]); } }
  return W.map((w) => ({ c: w.hi.map((v, k) => (v + w.lo[k]) / 2), rimR: Math.max(w.hi[1] - w.lo[1], w.hi[2] - w.lo[2]) / 2, get R() { return this.c[1]; }, /* tyre radius: the wheel centre's height over the ground */ xin: Math.min(Math.abs(w.lo[0]), Math.abs(w.hi[0])), xout: Math.max(Math.abs(w.lo[0]), Math.abs(w.hi[0])), n: w.n }));
}
function wheelOf(M, c) { for (let i = 0; i < 4; i++) { const w = M.wheels[i]; if (Math.sign(c[0]) !== (i % 2 ? -1 : 1)) continue; const ax = Math.abs(c[0]); if (ax < w.xin - 0.06 || ax > w.xout + 0.01) continue; if (Math.hypot(c[1] - w.c[1], c[2] - w.c[2]) < w.R + 0.004) return i; } return -1; }

// ---------- 4. classify ----------
export async function prepare(id) {
  const M = await loadModel(id); normalise(M); M.isl = islands(M); M.wheels = findWheels(M);
  for (const tr of M.T) { const v = tri(tr); tr.v = v; tr.c = cen(v); const f = fnorm(v); tr.n = f.n; tr.area = f.area; tr.wheel = wheelOf(M, tr.c); }
  { const votes = new Map(); for (const tr of M.T) { let v = votes.get(tr.isl); if (!v) votes.set(tr.isl, (v = [0, 0, 0, 0, 0])); v[tr.wheel + 1]++; } /* a wheel part is a whole piece (tyre, rim, disc) inside one wheel cylinder */
    for (const tr of M.T) { const v = votes.get(tr.isl), n = tr.isl.n; let best = -1; for (let i = 0; i < 4; i++) if (v[i + 1] >= 0.85 * n) best = i; tr.wheel = best; } }
  const ctx = { M, inBox: (c, b) => c[0] >= b[0] && c[0] <= b[1] && c[1] >= b[2] && c[1] <= b[3] && c[2] >= b[4] && c[2] <= b[5], islIn: (o, b) => o.lo[0] >= b[0] && o.hi[0] <= b[1] && o.lo[1] >= b[2] && o.hi[1] <= b[3] && o.lo[2] >= b[4] && o.hi[2] <= b[5] };
  for (const tr of M.T) tr.cat = M.cfg.classify(tr, ctx) || 'drop';
  M.logos = new Set(); for (const tr of M.T) if (tr.cat === 'logo') { M.logos.add(tr.isl); tr.cat = 'drop'; } // badges removed; the holes they leave are capped (capLogoHoles)
  return M;
}

// ---------- debug renders ----------
async function debugRender(M, id, box) {
  const hide = new Set((process.env.HIDE || '').split(',')); const sel0 = box ? M.T.filter((tr) => tr.c[0] >= box[0] && tr.c[0] <= box[1] && tr.c[1] >= box[2] && tr.c[1] <= box[3] && tr.c[2] >= box[4] && tr.c[2] <= box[5]) : M.T; const sel = sel0.filter((tr) => !hide.has(tr.cat));
  const mk = (useCat) => sel.map((tr) => ({ a: tr.v[0], b: tr.v[1], c: tr.v[2], col: useCat ? (CAT_COL[tr.cat] ? hexLin(CAT_COL[tr.cat]) : keyColour(tr.cat)) : [tr.p.triCol[tr.t * 4], tr.p.triCol[tr.t * 4 + 1], tr.p.triCol[tr.t * 4 + 2]] }));
  const lo = box ? [box[0], box[2], box[4]] : M.lo, hi = box ? [box[1], box[3], box[5]] : M.hi; const px = box ? Math.min(500, 900 / Math.max(box[1] - box[0], box[5] - box[4], box[3] - box[2])) : 110;
  const views = [{ right: [0, 0, 1], up: [0, 1, 0], look: [1, 0, 0] }, { right: [0, 0, -1], up: [0, 1, 0], look: [-1, 0, 0] }, { right: [-1, 0, 0], up: [0, 1, 0], look: [0, 0, -1] }, { right: [1, 0, 0], up: [0, 1, 0], look: [0, 0, 1] }, { right: [0, 0, 1], up: [-1, 0, 0], look: [0, -1, 0] }];
  for (const useCat of [false, true]) { const tris = mk(useCat); const out = `${process.env.HOME}/cp/${id}${box ? '-box' : ''}-${useCat ? 'cat' : 'col'}.png`; await stackPNG(out, views.map((v) => render(tris, v, { px, lo, hi, pad: 0.05, grid: box ? 0.1 : 0.5 }))); console.log('wrote', out); }
}
const hexLin = (h) => [1, 3, 5].map((i) => srgbToLin(parseInt(h.slice(i, i + 2), 16) / 255));

// ---------- 5. doors ----------
// cfg.doors: [{ role, zone: [z0, z1, y0, y1], xmin, split: [z0, z1], splitY: [y0, y1] }] (one per role, both sides)
// zone: a piece lying wholly inside it (|x| ≥ xmin on that side) moves with the door (skin, mirror, frame, glass);
// split / splitY: pieces crossing it (one glass piece for both side windows, frames) are cut per triangle there.
const MOVES = new Set(['paint', 'glass', 'rubber', 'chrome', 'mirror', 'lens', 'vind']);
function assignDoors(M) {
  const cfg = M.cfg; M.doors = []; if (!cfg.doors) return;
  for (const D of cfg.doors) for (const side of [-1, 1]) M.doors.push({ ...D, side, i: M.doors.length });
  const inZone = (o, D) => { const z = D.zone, e = 0.004; return o.lo[2] >= z[0] - e && o.hi[2] <= z[1] + e && o.lo[1] >= z[2] - e && o.hi[1] <= z[3] + e && (D.side < 0 ? o.hi[0] <= -D.xmin : o.lo[0] >= D.xmin); };
  for (const tr of M.T) { tr.door = -1; if (tr.cat === 'drop' || !MOVES.has(tr.cat) || tr.wheel >= 0) continue;
    for (const D of M.doors) { if (inZone(tr.isl, D)) { tr.door = D.i; break; }
      const sp = D.split, sy = D.splitY; if (!sp || tr.cat === 'paint') continue; const c = tr.c;
      if (Math.sign(c[0]) === D.side && Math.abs(c[0]) >= D.xmin && c[2] >= sp[0] && c[2] < sp[1] && c[1] >= sy[0] && c[1] <= sy[1]) { tr.door = D.i; break; } } }
  if (cfg.isHandle) for (const tr of M.T) if (tr.door >= 0 && cfg.isHandle(tr, M.doors[tr.door])) tr.cat = 'drop'; // the game puts its own handle (grasp solver) in the same recess
}

// door spec: what doorGrab / handleBar read (hinge-local grasp targets), sampled from the real door skin
const GS = 0.01; // height-field cell (m)
// the rear-most point of the door (glass + frame) at window height near the rear edge: where the open door is held by its frame
function winR(mine, zR, glY, roofY, z0, nz, GS) { const iz = Math.max(0, Math.min(nz - 1, Math.round((zR + 0.004 - z0) / GS))); const g0 = glY[iz], g1 = roofY[iz]; if (!(g1 - g0 > 0.2)) return null; const wy = g0 + Math.min(0.2, (g1 - g0) * 0.42);
  let zMin = 9; for (const tr of mine) { if (tr.cat !== 'glass' && tr.cat !== 'rubber' && tr.cat !== 'paint') continue; for (const v of tr.v) if (Math.abs(v[1] - wy) < 0.06 && v[2] < zMin) zMin = v[2]; } return zMin < 9 ? +zMin.toFixed(4) : null; }
function doorSpec(M, D) {
  const mine = M.T.filter((tr) => tr.door === D.i && tr.cat !== 'drop'); const paint = mine.filter((tr) => tr.cat === 'paint');
  const isl = new Map(); for (const tr of paint) isl.set(tr.isl, (isl.get(tr.isl) || 0) + 1); const main = [...isl].sort((a, b) => b[0].size[2] - a[0].size[2])[0][0]; /* the door skin: the longest painted piece (a mirror housing can have more triangles) */ D.main = main;
  const skin = paint.filter((tr) => tr.isl === main); const glass = mine.filter((tr) => tr.cat === 'glass');
  const lo = main.lo, hi = main.hi; const z0 = Math.floor(lo[2] / GS) * GS, y0 = Math.floor(lo[1] / GS) * GS; const nz = Math.ceil((hi[2] - z0) / GS) + 1, ny = Math.ceil((hi[1] - y0) / GS) + 1;
  const xs = new Float32Array(nz * ny); // outermost |x| of the skin per (z, y) cell, 0 = no skin
  for (const tr of skin) { if (tr.n[0] * D.side < 0.05) continue; rasterYZ(tr.v, z0, y0, nz, ny, (iz, iy, x) => { const k = iy * nz + iz, ax = Math.abs(x); if (ax > xs[k]) xs[k] = ax; }); }
  const col = (iz) => { let top = -1, bot = -1; for (let iy = 0; iy < ny; iy++) if (xs[iy * nz + iz] > 0) { if (bot < 0) bot = iy; top = iy; } return [bot, top]; };
  const topA = new Float32Array(nz); for (let iz = 0; iz < nz; iz++) { const [, t] = col(iz); topA[iz] = t >= 0 ? y0 + t * GS : NaN; }
  const fill = (a) => { let last = NaN; for (let i = 0; i < a.length; i++) if (!isNaN(a[i])) { last = a[i]; } else a[i] = last; last = NaN; for (let i = a.length - 1; i >= 0; i--) if (!isNaN(a[i])) last = a[i]; else a[i] = last; return a; };
  // belt (by): the panel's top a little ahead of its rear edge; rear / front edge at by − 0.1
  const zAt = (iz) => z0 + iz * GS; const rowEdge = (y) => { const iy = Math.round((y - y0) / GS); let a = -1, b = -1; for (let iz = 0; iz < nz; iz++) if (xs[iy * nz + iz] > 0) { if (a < 0) a = iz; b = iz; } return [zAt(a), zAt(b)]; };
  const midTop = topA[Math.floor(nz / 2)]; let [zR, zF] = rowEdge(midTop - 0.12); const by = fill(topA.slice())[Math.min(nz - 1, Math.round((zR + 0.15 - z0) / GS))];
  [zR, zF] = rowEdge(by - 0.1);
  const glY = new Float32Array(nz).fill(NaN), roofY = new Float32Array(nz).fill(NaN); let gw0 = 0, gw1 = 0, n0 = 0, n1 = 0;
  // the window's lower / upper line per column: each glass triangle cut by the column plane (a pane is a few big triangles)
  for (const tr of glass) { const v = tr.v; const za = Math.min(v[0][2], v[1][2], v[2][2]), zb = Math.max(v[0][2], v[1][2], v[2][2]);
    for (let iz = Math.max(0, Math.ceil((za - z0) / GS)); iz < nz && z0 + iz * GS <= zb; iz++) { const z = z0 + iz * GS; let lo = 9, hi = -9;
      for (let j = 0; j < 3; j++) { const p = v[j], q = v[(j + 1) % 3]; if ((p[2] - z) * (q[2] - z) > 0) continue; const t = Math.abs(q[2] - p[2]) < 1e-9 ? 0 : (z - p[2]) / (q[2] - p[2]); const yy = p[1] + (q[1] - p[1]) * Math.min(1, Math.max(0, t)); lo = Math.min(lo, yy); hi = Math.max(hi, yy); if (Math.abs(q[2] - p[2]) < 1e-9) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); } }
      if (hi < lo) continue; if (isNaN(glY[iz]) || lo < glY[iz]) glY[iz] = lo; if (isNaN(roofY[iz]) || hi > roofY[iz]) roofY[iz] = hi; } }
  fill(glY); fill(roofY); for (const tr of glass) for (const v of tr.v) { if (v[2] > zR + 0.08) continue; /* the pane near the rear edge: where the hand holds the frame */ const iz = Math.max(0, Math.min(nz - 1, Math.round((v[2] - z0) / GS))); if (v[1] < glY[iz] + 0.03) { gw0 += Math.abs(v[0]); n0++; } if (v[1] > roofY[iz] - 0.03) { gw1 += Math.abs(v[0]); n1++; } }
  const skinAt = (z, y) => sampleXS(xs, z0, y0, nz, ny, GS, z, y);
  const depth = M.cfg.doorDepth || 0.075; const xc = -(skinAt(zR + 0.06, by - 0.1) - depth);
  const hx = skinAt(zF - 0.02, by - 0.15); const yb = lo[1];
  D.spec = { z0, y0, nz, ny, step: GS, xs: Array.from(xs, (v) => Math.round(v * 1000)), topA: Array.from(fill(topA), (v) => +v.toFixed(4)), glY: glass.length ? Array.from(glY, (v) => +v.toFixed(4)) : null, roofY: glass.length ? Array.from(roofY, (v) => +v.toFixed(4)) : null,
    winR: winR(mine, zR, glY, roofY, z0, nz, GS),
    gw0: n0 ? +(gw0 / n0).toFixed(4) : null, gw1: n1 ? +(gw1 / n1).toFixed(4) : null, zR: +zR.toFixed(4), zF: +zF.toFixed(4), by: +by.toFixed(4), xc: +xc.toFixed(4), rects: [[+zR.toFixed(4), +zF.toFixed(4), +yb.toFixed(4)]] };
  D.hinge = [+(D.side * hx).toFixed(4), +zF.toFixed(4)]; D.len = +(zF - zR).toFixed(4); D.depth = depth;
}
// rasterize a triangle into the (z, y) grid; cb(iz, iy, x) with x interpolated at the cell centre
function rasterYZ(v, z0, y0, nz, ny, cb) {
  const P = v.map((p) => [(p[2] - z0) / GS, (p[1] - y0) / GS, p[0]]); const minZ = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxZ = Math.min(nz - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
  const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxY = Math.min(ny - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1]))); const A = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]); if (Math.abs(A) < 1e-9) return;
  for (let iy = minY; iy <= maxY; iy++) for (let iz = minZ; iz <= maxZ; iz++) { const w0 = ((P[1][0] - iz) * (P[2][1] - iy) - (P[2][0] - iz) * (P[1][1] - iy)) / A, w1 = ((P[2][0] - iz) * (P[0][1] - iy) - (P[0][0] - iz) * (P[2][1] - iy)) / A, w2 = 1 - w0 - w1;
    if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue; cb(iz, iy, w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2]); }
}
// ---------- solid doors: inner card (skin offset inwards along the vertex normals), shut faces round the panel edge, jamb walls round the body opening
function boundaryEdges(trs) { const E = new Map(); for (const tr of trs) for (let j = 0; j < 3; j++) { const a = tr.w[j], b = tr.w[(j + 1) % 3]; const k = a < b ? a + ',' + b : b + ',' + a; const e = E.get(k); if (e) e.n++; else E.set(k, { n: 1, a: tr.v[j], b: tr.v[(j + 1) % 3], tr }); } return [...E.values()].filter((e) => e.n === 1); }
function solidDoor(M, D, extra) {
  const skin = M.T.filter((tr) => tr.door === D.i && tr.isl === D.main && tr.cat === 'paint'); const d = D.depth;
  const vn = new Map(); for (const tr of skin) for (let j = 0; j < 3; j++) { const k = tr.w[j]; const n = vn.get(k) || [0, 0, 0]; for (let a = 0; a < 3; a++) n[a] += tr.n[a] * tr.area; vn.set(k, n); }
  for (const n of vn.values()) { const l = Math.hypot(...n) || 1; n[0] /= l; n[1] /= l; n[2] /= l; }
  const off = (v, k) => { const n = vn.get(k); return [v[0] - n[0] * d, v[1] - n[1] * d * 0.3, v[2] - n[2] * d * 0.3]; }; // mostly straight in: the card stays a flat-ish panel
  const card = M.cfg.cardCol || [0.07, 0.07, 0.075];
  for (const tr of skin) extra.push({ door: D.i, cat: 'interior', v: [off(tr.v[0], tr.w[0]), off(tr.v[2], tr.w[2]), off(tr.v[1], tr.w[1])], col: card });
  for (const e of boundaryEdges(skin)) { const ka = e.tr.w[e.tr.v.indexOf(e.a)], kb = e.tr.w[e.tr.v.indexOf(e.b)]; const a2 = off(e.a, ka), b2 = off(e.b, kb);
    extra.push({ door: D.i, cat: 'paint', v: [e.a, e.b, b2], k: 0.78 }, { door: D.i, cat: 'paint', v: [e.a, b2, a2], k: 0.78 }, { door: D.i, cat: 'paint', v: [e.a, b2, e.b], k: 0.78 }, { door: D.i, cat: 'paint', v: [e.a, a2, b2], k: 0.78 }); }
}
function jambs(M, extra) {
  if (!M.doors.length) return; const body = M.T.filter((tr) => tr.door < 0 && tr.cat === 'paint' && tr.wheel < 0); const d = M.cfg.doorDepth || 0.075;
  const near = (p, D) => { const z = D.zone; return Math.sign(p[0]) === D.side && Math.abs(p[0]) > D.xmin - 0.05 && p[2] > z[0] - 0.03 && p[2] < z[1] + 0.03 && p[1] > z[2] - 0.03 && p[1] < z[3] + 0.03; };
  for (const e of boundaryEdges(body)) { const m = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (e.a[2] + e.b[2]) / 2]; const D = M.doors.find((q) => near(m, q)); if (!D) continue;
    const a2 = [e.a[0] - D.side * d, e.a[1], e.a[2]], b2 = [e.b[0] - D.side * d, e.b[1], e.b[2]];
    extra.push({ door: -1, cat: 'paint', v: [e.a, e.b, b2], k: 0.72 }, { door: -1, cat: 'paint', v: [e.a, b2, a2], k: 0.72 }, { door: -1, cat: 'paint', v: [e.a, b2, e.b], k: 0.72 }, { door: -1, cat: 'paint', v: [e.a, a2, b2], k: 0.72 }); }
}

// ---------- logo holes: a removed emblem that sat in an opening of the panel leaves its outline as a hole; the hole is capped with
// the surrounding surface (same category and colour), so no badge silhouette remains
function capLogoHoles(M, extra) {
  if (!M.logos.size) return; const keep = M.T.filter((tr) => tr.cat !== 'drop' && tr.wheel < 0); const E = boundaryEdges(keep); let caps = 0;
  for (const o of M.logos) { const lo = o.lo.map((v) => v - 0.008), hi = o.hi.map((v) => v + 0.008);
    const mine = E.filter((e) => [e.a, e.b].every((p) => p[0] >= lo[0] && p[0] <= hi[0] && p[1] >= lo[1] && p[1] <= hi[1] && p[2] >= lo[2] && p[2] <= hi[2]));
    // chain edges into loops by welded vertex id
    const key = (p) => p.map((v) => Math.round(v * 5000)).join(','); const next = new Map(); for (const e of mine) { (next.get(key(e.a)) || next.set(key(e.a), []).get(key(e.a))).push(e); (next.get(key(e.b)) || next.set(key(e.b), []).get(key(e.b))).push(e); }
    const used = new Set();
    for (const e0 of mine) { if (used.has(e0)) continue; const loop = [e0.a]; let at = e0.b; used.add(e0);
      for (let it = 0; it < 5000; it++) { loop.push(at); const cand = (next.get(key(at)) || []).find((e) => !used.has(e)); if (!cand) break; used.add(cand); at = key(cand.a) === key(at) ? cand.b : cand.a; if (key(at) === key(loop[0])) break; }
      if (loop.length < 6) continue; const c = [0, 1, 2].map((k) => loop.reduce((s2, p) => s2 + p[k], 0) / loop.length);
      const owners = mine.filter((e) => used.has(e)); const cats = new Map(); for (const e of owners) cats.set(e.tr.cat, (cats.get(e.tr.cat) || 0) + 1); const cat = [...cats].sort((a2, b2) => b2[1] - a2[1])[0][0]; const ref = owners.find((e) => e.tr.cat === cat).tr;
      const nAvg = [0, 0, 0]; for (const e of owners) for (let k = 0; k < 3; k++) nAvg[k] += e.tr.n[k];
      const col = cat === 'paint' ? null : [ref.p.triCol[ref.t * 4], ref.p.triCol[ref.t * 4 + 1], ref.p.triCol[ref.t * 4 + 2]];
      for (let i = 0; i < loop.length - 1; i++) { let v = [c, loop[i], loop[i + 1]]; const f = fnorm(v).n; if (f[0] * nAvg[0] + f[1] * nAvg[1] + f[2] * nAvg[2] < 0) v = [c, loop[i + 1], loop[i]]; extra.push(cat === 'paint' ? { door: -1, cat, v, k: 1 } : { door: -1, cat, v, col }); }
      caps++; } }
  M.caps = caps; console.log('  logo holes capped:', caps, 'of', M.logos.size, 'logo pieces');
}

// ---------- headliner: the real roof is a single-sided skin; the cabin gets a ceiling that follows it (the source headliner went
// with the source cabin)
function headliner(M, extra) {
  const roofTop = M.T.filter((tr) => tr.cat === 'paint' && tr.door < 0 && tr.wheel < 0).reduce((b, tr) => (!b || tr.isl.hi[1] > b.hi[1] ? tr.isl : b), null); if (!roofTop) return;
  const col = M.cfg.headliner || [0.47, 0.45, 0.41]; let n = 0;
  const sk = M.T.filter((tr) => tr.isl === roofTop && tr.cat === 'paint'); const vn = new Map(); // smooth vertex normals over the roof skin: the ceiling is the skin moved 2.5 cm inward along them
  for (const tr of sk) for (let j = 0; j < 3; j++) { const q = vn.get(tr.w[j]) || [0, 0, 0]; for (let k = 0; k < 3; k++) q[k] += tr.n[k] * tr.area; vn.set(tr.w[j], q); }
  for (const tr of sk) { if (tr.n[1] < 0.35) continue; const v = tr.v.map((p, j) => { const q = vn.get(tr.w[j]), l = Math.hypot(...q) || 1; return [p[0] - q[0] / l * 0.025, p[1] - q[1] / l * 0.025, p[2] - q[2] / l * 0.025]; }); extra.push({ door: -1, cat: 'interior', v: [v[0], v[2], v[1]], col }); n++; }
  M.headliner = n;
}

// ---------- meshes: welded indexed geometry per (piece, category) ----------
// piece: 'body' | 'door<i>' (hinge space) | 'wheel' (hub space, the +x front wheel) | 'cal'
const SOLID = new Set(['glass', 'lens', 'vlight', 'vtail', 'vind', 'vrev', 'mirror', 'tyre']); // flat-colour game materials: no vertex colours needed
function collect(M, extra) {
  const groups = new Map(); const add = (piece, cat, v, n, col) => { const k = piece + '|' + cat; let g = groups.get(k); if (!g) groups.set(k, (g = { piece, cat, v: [], n: [], c: [] })); for (let j = 0; j < 3; j++) { g.v.push(...v[j]); g.n.push(...n[j]); g.c.push(...col); } };
  const W0 = M.wheels[0]; const paintRef = M.cfg.paintRef || null;
  // paint normals recomputed over the welded skin (area-weighted, 35° crease): the source normals carry ripples that show on dark / glossy paint
  const RN = M.cfg.renormal !== false && process.env.RENORM !== '0'; const adj = new Map(); if (RN) for (const tr of M.T) if (tr.cat === 'paint' && tr.wheel < 0) for (let j = 0; j < 3; j++) (adj.get(tr.w[j]) || adj.set(tr.w[j], []).get(tr.w[j])).push(tr);
  const smoothN = (tr, j) => { const q = [0, 0, 0]; for (const o of adj.get(tr.w[j])) { const d = o.n[0] * tr.n[0] + o.n[1] * tr.n[1] + o.n[2] * tr.n[2]; if (d < 0.82) continue; for (let k = 0; k < 3; k++) q[k] += o.n[k] * o.area; } const l = Math.hypot(...q) || 1; return q.map((x) => x / l); };
  for (const tr of M.T) { if (tr.cat === 'drop') continue; const N = tr.p.nrm; const vn = RN && tr.cat === 'paint' && tr.wheel < 0 ? [0, 1, 2].map((j) => smoothN(tr, j)) : [0, 1, 2].map((j) => { const i = tr.p.idx[tr.t * 3 + j]; return N ? [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]] : tr.n; });
    const tc = [tr.p.triCol[tr.t * 4], tr.p.triCol[tr.t * 4 + 1], tr.p.triCol[tr.t * 4 + 2]];
    let col = tc; if (tr.cat === 'paint') { const k = tr.k != null ? tr.k : paintRef ? Math.min(1.2, lum(tc) / paintRef) : 1; col = [k, k, k]; } else if (M.cfg.colOf) col = M.cfg.colOf(tr, tc) || tc;
    if (tr.wheel >= 0) { if (tr.wheel !== 0) continue; const piece = tr.cat === 'caliper' ? 'cal' : 'wheel'; const v = tr.v.map((p) => [p[0] - W0.c[0], p[1] - W0.c[1], p[2] - W0.c[2]]); add(piece, tr.cat === 'tyre' ? 'tyre' : 'rim', v, vn, col); continue; }
    if (tr.door >= 0) { const D = M.doors[tr.door]; add('door' + D.i, tr.cat, tr.v.map((p) => [p[0] - D.hinge[0], p[1], p[2] - D.hinge[1]]), vn, col); continue; }
    if (tr.flip) { add('body', tr.cat, [tr.v[0], tr.v[2], tr.v[1]], [vn[0], vn[2], vn[1]].map((n) => n.map((x) => -x)), col); continue; } /* a piece facing the wrong way (cfg.classify sets tr.flip) */
    add('body', tr.cat, tr.v, vn, col); }
  for (const x of extra) { const f = fnorm(x.v).n; const col = x.cat === 'paint' ? [x.k, x.k, x.k] : x.col; if (x.door >= 0) { const D = M.doors[x.door]; add('door' + D.i, x.cat, x.v.map((p) => [p[0] - D.hinge[0], p[1], p[2] - D.hinge[1]]), [f, f, f], col); } else add('body', x.cat, x.v, [f, f, f], col); }
  return [...groups.values()].map(weld);
}
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function weld(g) {
  const map = new Map(); const pos = [], nrm = [], col = [], idx = []; const solid = SOLID.has(g.cat);
  for (let i = 0; i < g.v.length / 3; i++) { const p = [g.v[i * 3], g.v[i * 3 + 1], g.v[i * 3 + 2]], n = [g.n[i * 3], g.n[i * 3 + 1], g.n[i * 3 + 2]], c = solid ? [1, 1, 1] : [g.c[i * 3], g.c[i * 3 + 1], g.c[i * 3 + 2]];
    const k = p.map((x) => Math.round(x * 1e4)).join(',') + '|' + n.map((x) => Math.round(x * 100)).join(',') + '|' + c.map((x) => Math.round(x * 200)).join(','); let id = map.get(k);
    if (id === undefined) { id = pos.length / 3; map.set(k, id); pos.push(...p); nrm.push(...n); col.push(...c); } idx.push(id); }
  // drop degenerate triangles left by welding
  const I = []; for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (a !== b && b !== c && a !== c) I.push(a, b, c); }
  return { piece: g.piece, cat: g.cat, pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), idx: new Uint32Array(I) };
}

// ---------- 6. LODs ----------
async function simplify(m, ratio, err, lock = true) {
  const { MeshoptSimplifier: S } = await import('meshoptimizer'); await S.ready; const target = Math.max(3, Math.floor(m.idx.length * ratio / 3) * 3);
  if (target >= m.idx.length) return m; const attrs = new Float32Array(m.pos.length / 3 * 6); for (let i = 0; i < m.pos.length / 3; i++) { attrs.set(m.nrm.subarray(i * 3, i * 3 + 3), i * 6); attrs[i * 6 + 3] = m.col[i * 3]; attrs[i * 6 + 4] = m.col[i * 3 + 1]; attrs[i * 6 + 5] = m.col[i * 3 + 2]; }
  let [I] = S.simplifyWithAttributes(m.idx, m.pos, 3, attrs, 6, [0.5, 0.5, 0.5, 1, 1, 1], null, target, err, lock ? ['LockBorder', 'ErrorAbsolute'] : ['ErrorAbsolute']);
  if (!lock && I.length > target * 1.5) [I] = S.simplifySloppy(I, m.pos, 3, null, target, err); // far LODs: small loose pieces (trim strips, lamp parts) collapse
  return compact({ ...m, idx: I });
}
function compact(m) { const remap = new Int32Array(m.pos.length / 3).fill(-1); let n = 0; const I = new Uint32Array(m.idx.length); for (let i = 0; i < m.idx.length; i++) { const v = m.idx[i]; if (remap[v] < 0) remap[v] = n++; I[i] = remap[v]; }
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3); for (let v = 0; v < remap.length; v++) { const r = remap[v]; if (r < 0) continue; for (let k = 0; k < 3; k++) { pos[r * 3 + k] = m.pos[v * 3 + k]; nrm[r * 3 + k] = m.nrm[v * 3 + k]; col[r * 3 + k] = m.col[v * 3 + k]; } }
  return { ...m, pos, nrm, col, idx: I }; }
// LOD budgets (triangles): body + doors share one budget; the wheel template its own
export const BUDGET = { lod0: +(process.env.LOD0 || 60000), lod1: 10000, lod2: 2500, wheel0: 3000, wheel1: 500 };
async function makeLODs(meshes, cfg) {
  const B = { ...BUDGET, ...(cfg.budget || {}) }; const tris = (L) => L.reduce((s, m) => s + m.idx.length / 3, 0);
  const car = meshes.filter((m) => m.piece === 'body' || m.piece.startsWith('door')), wh = meshes.filter((m) => m.piece === 'wheel' || m.piece === 'cal');
  const fit = async (L, budget, err0, lock = false) => { let r = Math.min(1, budget / Math.max(1, tris(L))), out = L, err = err0; for (let it = 0; it < 8; it++) { out = await Promise.all(L.map((m) => simplify(m, r, err, lock))); const t = tris(out); if (t <= budget * 1.04) break; r *= budget / t * 0.97; err *= 1.8; } return out; };
  const lod0 = await fit(car, B.lod0, 0.002, true);
  // far LODs: from the full mesh with the doors shut, welded by position only (normal seams no longer block collapses, no cracks
  // between door and body), simplified per material with locked material borders for LOD1, normals rebuilt afterwards
  const blanks = []; /* badge blanks (shade 0.995): tiny loose plates the simplifier would collapse, re-opening the badge outline — kept whole */
  const shutFull = (L) => { const by = new Map(); for (const m of L) { let pos = m.pos; if (m.piece.startsWith('door')) { const D = cfg.__doors[+m.piece.slice(4)]; pos = m.pos.slice(); for (let i = 0; i < pos.length; i += 3) { pos[i] += D.hinge[0]; pos[i + 2] += D.hinge[1]; } }
    let idx = m.idx; if (m.cat === 'paint') { const keep = [], bl = []; const isB = (i) => Math.abs(m.col[i * 3] - 0.995) < 0.002; for (let t = 0; t < idx.length; t += 3) { if (m.col[idx[t] * 3] < 0.9 && m.col[idx[t + 1] * 3] < 0.9 && m.col[idx[t + 2] * 3] < 0.9) continue; (isB(idx[t]) && isB(idx[t + 1]) && isB(idx[t + 2]) ? bl : keep).push(idx[t], idx[t + 1], idx[t + 2]); } idx = new Uint32Array(keep); if (bl.length) blanks.push(compact({ ...m, pos, idx: new Uint32Array(bl), piece: 'body' })); } /* door jambs (shades 0.72 / 0.78) are hidden with the doors shut */
    (by.get(m.cat) || by.set(m.cat, []).get(m.cat)).push({ ...m, pos, idx }); } return [...by].map(([cat, list]) => posWeld(mergeMeshes(list, cat))); };
  const farFit = async (L, budget, err0, lock) => { let r = Math.min(1, budget / Math.max(1, tris(L))), out = L, err = err0; for (let it = 0; it < 10; it++) { out = await Promise.all(L.map((m) => simplifyFar(m, r, err, lock))); const t = tris(out); if (t <= budget * 1.04) break; r *= budget / t * 0.97; err *= 1.7; } return out.map((m) => renormal(m)).filter((m) => m.idx.length); };
  const far = shutFull(car.filter((m) => m.cat !== 'interior' && m.cat !== 'plate'));
  const lod1 = await farFit(far, B.lod1, 0.003, false), lod2 = await farFit(far.filter((m) => !['lens', 'mirror'].includes(m.cat)), B.lod2, 0.015, false);
  for (const b of blanks) { const r = renormal(posWeld(b)); lod1.push(r); lod2.push(r); }
  const w0 = await fit(wh, B.wheel0, 0.0008), w1 = await fit(wh.filter((m) => m.piece === 'wheel'), B.wheel1, 0.004);
  // LOD1 / LOD2 are drawn with the doors shut: their door pieces go back to model space and merge with the body
  const shut = (L, doors) => { const by = new Map(); for (const m of L) { let pos = m.pos; if (m.piece.startsWith('door')) { const D = doors[+m.piece.slice(4)]; pos = m.pos.slice(); for (let i = 0; i < pos.length; i += 3) { pos[i] += D.hinge[0]; pos[i + 2] += D.hinge[1]; } }
    const g = by.get(m.cat); if (!g) by.set(m.cat, { piece: 'body', cat: m.cat, list: [{ ...m, pos }] }); else g.list.push({ ...m, pos }); }
    return [...by.values()].map((g) => mergeMeshes(g.list, g.cat)); };
  return { lod0, lod1, lod2, w0, w1, shut, tris: { src: tris(car), lod0: tris(lod0), lod1: tris(lod1), lod2: tris(lod2), wheel0: tris(w0), wheel1: tris(w1) } };
}
// weld by position (paint: + its shade, others: + colour) so the simplifier sees one connected surface per material
function posWeld(m) { const map = new Map(); const pos = [], col = [], idx = []; const paint = m.cat === 'paint';
  for (let i = 0; i < m.pos.length / 3; i++) { const p = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]], c = [m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]]; const k = p.map((x) => Math.round(x * 2e3)).join(',') + (paint ? '' : '|' + c.map((x) => Math.round(x * 50)).join(',')); let id = map.get(k); if (id === undefined) { id = pos.length / 3; map.set(k, id); pos.push(...p); col.push(...c); } map.set(i + '#', id); }
  for (let t = 0; t < m.idx.length; t += 3) { const a = map.get(m.idx[t] + '#'), b = map.get(m.idx[t + 1] + '#'), c = map.get(m.idx[t + 2] + '#'); if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  return { piece: 'body', cat: m.cat, pos: new Float32Array(pos), nrm: new Float32Array(pos.length), col: new Float32Array(col), idx: new Uint32Array(idx) }; }
async function simplifyFar(m, ratio, err, lock) { const { MeshoptSimplifier: S } = await import('meshoptimizer'); await S.ready; const target = Math.max(3, Math.floor(m.idx.length * ratio / 3) * 3); if (target >= m.idx.length) return m;
  const [I] = S.simplifyWithAttributes(m.idx, m.pos, 3, m.col, 3, [0.4, 0.4, 0.4], null, target, err, lock ? ['LockBorder', 'ErrorAbsolute'] : ['ErrorAbsolute']); return compact({ ...m, idx: I }); }
// normals for a simplified mesh: per corner, the area-weighted normal of the faces around the vertex within 40° (hard edges stay hard)
function renormal(m) { const nT = m.idx.length / 3, fn = new Float32Array(nT * 3), around = new Map();
  for (let t = 0; t < nT; t++) { const v = [0, 1, 2].map((j) => { const i = m.idx[t * 3 + j]; return [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]]; }); const f = fnorm(v); fn.set(f.n.map((x) => x * f.area), t * 3); for (let j = 0; j < 3; j++) (around.get(m.idx[t * 3 + j]) || around.set(m.idx[t * 3 + j], []).get(m.idx[t * 3 + j])).push(t); }
  const unit = (t) => { const x = fn[t * 3], y = fn[t * 3 + 1], z = fn[t * 3 + 2], l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const pos = [], nrm = [], col = [], idx = [], map = new Map();
  for (let t = 0; t < nT; t++) { const ft = unit(t); for (let j = 0; j < 3; j++) { const i = m.idx[t * 3 + j]; const q = [0, 0, 0]; for (const o of around.get(i)) { const fo = unit(o); if (fo[0] * ft[0] + fo[1] * ft[1] + fo[2] * ft[2] < 0.77) continue; q[0] += fn[o * 3]; q[1] += fn[o * 3 + 1]; q[2] += fn[o * 3 + 2]; } const l = Math.hypot(...q) || 1; const n = q.map((x) => x / l);
    const k = i + '|' + n.map((x) => Math.round(x * 60)).join(','); let id = map.get(k); if (id === undefined) { id = pos.length / 3; map.set(k, id); pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); nrm.push(...n); col.push(m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]); } idx.push(id); } }
  return { ...m, pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), idx: new Uint32Array(idx) }; }
function mergeMeshes(list, cat) { let nv = 0, ni = 0; for (const m of list) { nv += m.pos.length / 3; ni += m.idx.length; } const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni); let vo = 0, io = 0;
  for (const m of list) { pos.set(m.pos, vo * 3); nrm.set(m.nrm, vo * 3); col.set(m.col, vo * 3); for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i] + vo; vo += m.pos.length / 3; io += m.idx.length; }
  return { piece: 'body', cat, pos, nrm, col, idx }; }

// ---------- 8. write ----------
async function writeGLB(id, M, L, outPath) {
  const { Document } = await import('@gltf-transform/core'); const { quantize, meshopt, reorder } = await import('@gltf-transform/functions'); const { MeshoptEncoder } = await import('meshoptimizer'); const { getIO } = await import('./lib.mjs');
  const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene(id); const root = doc.getRoot();
  const prim = (m) => { const p = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.pos).setBuffer(buf)).setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normalize(m.nrm)).setBuffer(buf)).setIndices(doc.createAccessor().setType('SCALAR').setArray(m.pos.length / 3 > 65535 ? m.idx : Uint16Array.from(m.idx)).setBuffer(buf));
    if (!SOLID.has(m.cat)) p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(m.col.map((v) => Math.min(1, Math.max(0, v)))).setBuffer(buf)); return p; };
  const put = (lod, m) => { if (!m.idx.length) return; const node = doc.createNode(`${lod}|${m.piece}|${m.cat}`).setMesh(doc.createMesh(`${lod}|${m.piece}|${m.cat}`).addPrimitive(prim(m))); scene.addChild(node); };
  for (const m of L.lod0) put('lod0', m); for (const m of L.shut(L.lod1, M.doors)) put('lod1', m); for (const m of L.shut(L.lod2, M.doors)) put('lod2', m); for (const m of L.w0) put('w0', m); for (const m of L.w1) put('w1', m);
  const cfg = M.cfg; const W = M.wheels;
  root.getAsset().extras = { colombo: 1, type: id, credit: { title: cfg.title, url: cfg.url, author: cfg.author, license: 'CC BY 4.0', extra: cfg.creditExtra || null },
    dims: { len: +(M.hi[2] - M.lo[2]).toFixed(3), wid: +(cfg.bodyWid || (M.bodyHalfW * 2)).toFixed(3), hgt: +(M.hi[1] - M.lo[1]).toFixed(3), lo: M.lo.map((v) => +v.toFixed(3)), hi: M.hi.map((v) => +v.toFixed(3)) },
    wheels: W.map((w) => [+w.c[0].toFixed(4), +w.c[1].toFixed(4), +w.c[2].toFixed(4), +(w.xout - w.xin).toFixed(4)]), wheelR: +((W[0].R + W[1].R + W[2].R + W[3].R) / 4).toFixed(4),
    doors: M.doors.map((D) => ({ role: D.role, side: D.side, hinge: D.hinge, len: D.len, spec: D.spec })), plates: M.plates, exhaust: cfg.exhaust || null, lamps: cfg.lamps || null, tris: L.tris };
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await (await getIO()).write(outPath, doc);
}
const normalize = (n) => { const o = new Float32Array(n.length); for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; o[i] = n[i] / l; o[i + 1] = n[i + 1] / l; o[i + 2] = n[i + 2] / l; } return o; };

// number plates: the game draws its own (Sri Lankan plates, PlateKit) — positions [cx, cy, z, hw, hh, front]
function plates(M) {
  const P = M.cfg.plates || {}; const out = [];
  const pl = M.T.filter((tr) => tr.cat === 'plate'); if (pl.length) { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const tr of pl) for (const v of tr.v) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
    const front = lo[2] > 0; out.push([+((lo[0] + hi[0]) / 2).toFixed(4), +((lo[1] + hi[1]) / 2).toFixed(4), +(front ? hi[2] + 0.003 : lo[2] - 0.003).toFixed(4), +((hi[0] - lo[0]) / 2).toFixed(4), +((hi[1] - lo[1]) / 2).toFixed(4), front]); for (const tr of pl) tr.cat = 'drop'; }
  for (const key of ['front', 'rear']) { const q = P[key]; if (!Array.isArray(q)) continue; const front = key === 'front'; const [cx, cy] = q; let z = front ? -1e9 : 1e9;
    for (const tr of M.T) { if (tr.cat !== 'paint' || tr.door >= 0) continue; if (Math.abs(tr.c[0] - cx) > 0.12 || Math.abs(tr.c[1] - cy) > 0.04) continue; z = front ? Math.max(z, tr.c[2]) : Math.min(z, tr.c[2]); }
    out.push([cx, cy, +(z + (front ? 0.006 : -0.006)).toFixed(4), q[2] ?? 0.26, q[3] ?? 0.055, front]); }
  M.plates = out;
}
export async function buildOne(id, M0) {
  const M = M0 || await prepare(id); assignDoors(M); for (const D of M.doors) doorSpec(M, D);
  { let hw = 0; for (const tr of M.T) if (tr.cat === 'paint' && tr.door < 0) for (const v of tr.v) if (v[1] > 0.3 && v[1] < M.hi[1] - 0.25) hw = Math.max(hw, Math.abs(v[0])); M.bodyHalfW = hw; } // body width without the mirrors
  plates(M);
  const extra = []; for (const D of M.doors) solidDoor(M, D, extra); jambs(M, extra); capLogoHoles(M, extra); headliner(M, extra);
  const meshes = collect(M, extra); const L = await makeLODs(meshes, { ...M.cfg, __doors: M.doors });
  const out = path.join(ROOT, 'public/assets/vehicles', id + '.glb'); fs.mkdirSync(path.dirname(out), { recursive: true }); await writeGLB(id, M, L, out);
  return { M, L, out, bytes: fs.statSync(out).size };
}

// ---------- main ----------
if (import.meta.url === 'file://' + process.argv[1]) {
  for (const id of only.length ? only : Object.keys(MODELS)) {
    const M = await prepare(id); const cnt = {}; for (const tr of M.T) cnt[tr.cat] = (cnt[tr.cat] || 0) + 1;
    console.log(id, 'size', M.lo.map((v, k) => (M.hi[k] - v).toFixed(3)).join(' x '), 'k', M.scaleK.toFixed(4), 'tris', M.T.length, JSON.stringify(cnt));
    console.log(' wheels', M.wheels.map((w) => `c(${w.c.map((v) => v.toFixed(3)).join(',')}) R ${w.R.toFixed(3)} x ${w.xin.toFixed(3)}..${w.xout.toFixed(3)} n ${w.n}`).join(' | '));
    if (DEBUG) { await debugRender(M, id, VIEW ? VIEW.split(',').map(Number) : null); continue; }
    const r = await buildOne(id, M); console.log(' ->', path.relative(ROOT, r.out), (r.bytes / 1024).toFixed(0) + ' KB', JSON.stringify(r.L.tris), 'doors', r.M.doors.map((D) => `${D.role}${D.side} hinge ${D.hinge} len ${D.len} by ${D.spec.by} zR ${D.spec.zR}`).join(' | '));
  }
}
