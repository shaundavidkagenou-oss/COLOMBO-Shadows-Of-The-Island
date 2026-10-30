// Offline bake: protagonist heads from the CC0 MakeHuman base mesh + targets (data cached by fetch-makehuman.mjs).
//   node tools/mh/fetch-makehuman.mjs && node tools/mh/bake-hero-heads.mjs   →   src/actors/heroHeadData.js
//
// For each protagonist the full-body base mesh is shaped with MakeHuman's macro targets (an adult South-Asian male:
// a weighted blend of the three ethnic macro shapes plus muscle / weight) and per-hero feature targets (nose, jaw,
// cheekbones, brows, ears, lips…), giving three distinct, anatomically built faces. The head + neck region (same
// topology for all three), the teeth, tongue and eyelash helpers are cut out, MakeHuman's authored skin weights are
// folded onto the game skeleton's head / neck / chest bones, and the facial-expression targets (blinks, jaw, smile,
// brows, squint, frown…) are stored as sparse morph deltas. Only CC0 data is used — no MakeHuman / MPFB program code.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, loadBase, loadTarget, applyTarget } from './mhlib.mjs';

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/actors/heroHeadData.js');
const B = loadBase(); const NV = B.P.length / 3;
const RIGW = JSON.parse(fs.readFileSync(path.join(CACHE, 'rigs/standard/weights.default.json'), 'utf8')).weights;

// ---- heroes: ethnic blend (sums to 1), muscle/weight blend, feature targets (name → weight; negative = the decr side)
const HEROES = {
  dineth: { eth: { african: 0.3, asian: 0.14, caucasian: 0.56 }, uni: { 'averagemuscle-averageweight': 0.45, 'averagemuscle-minweight': 0.25, 'maxmuscle-minweight': 0.3 },
    t: { 'head/head-oval': 0.35, 'cheek/l-cheek-bones-incr': 0.35, 'cheek/r-cheek-bones-incr': 0.35, 'nose/nose-flaring-incr': 0.25, 'nose/nose-point-width-incr': 0.2, 'nose/nose-hump-decr': 0.2,
      'mouth/mouth-lowerlip-volume-incr': 0.3, 'mouth/mouth-upperlip-volume-incr': 0.15, 'chin/chin-prominent-incr': 0.25, 'chin/chin-width-decr': 0.15, 'eyes/l-eye-scale-incr': 0.15, 'eyes/r-eye-scale-incr': 0.15,
      'eyebrows/eyebrows-angle-up': 0.2, 'forehead/forehead-scale-vert-decr': 0.2, 'neck/neck-scale-horiz-decr': 0.1 } },
  shashika: { eth: { african: 0.4, asian: 0.08, caucasian: 0.52 }, uni: { 'maxmuscle-averageweight': 0.75, 'averagemuscle-averageweight': 0.25 },
    t: { 'head/head-square': 0.55, 'chin/chin-width-incr': 0.45, 'chin/chin-bones-incr': 0.3, 'chin/chin-height-incr': 0.15, 'nose/nose-scale-horiz-incr': 0.35, 'nose/nose-flaring-incr': 0.4, 'nose/nose-curve-convex': 0.15,
      'nose/nose-volume-incr': 0.25, 'mouth/mouth-scale-horiz-incr': 0.2, 'mouth/mouth-lowerlip-volume-incr': 0.35, 'eyebrows/eyebrows-trans-down': 0.35, 'eyebrows/eyebrows-angle-down': 0.25, 'forehead/forehead-nubian-incr': 0.2,
      'neck/measure-neck-circ-incr': 0.6, 'neck/neck-scale-horiz-incr': 0.35, 'l-ear-flap-decr': 0, 'cheek/l-cheek-volume-decr': 0.2, 'cheek/r-cheek-volume-decr': 0.2, 'eyes/l-eye-height2-decr': 0.2, 'eyes/r-eye-height2-decr': 0.2 } },
  david: { eth: { african: 0.24, asian: 0.18, caucasian: 0.58 }, uni: { 'averagemuscle-averageweight': 0.75, 'averagemuscle-minweight': 0.25 },
    t: { 'head/head-rectangular': 0.35, 'head/head-scale-vert-incr': 0.2, 'nose/nose-scale-vert-incr': 0.35, 'nose/nose-hump-incr': 0.35, 'nose/nose-point-down': 0.25, 'nose/nose-width1-decr': 0.2,
      'chin/chin-height-incr': 0.25, 'chin/chin-prominent-incr': 0.15, 'mouth/mouth-upperlip-volume-decr': 0.15, 'forehead/forehead-scale-vert-incr': 0.3, 'eyes/l-eye-bag-incr': 0.25, 'eyes/r-eye-bag-incr': 0.25,
      'cheek/l-cheek-inner-decr': 0.25, 'cheek/r-cheek-inner-decr': 0.25, 'eyebrows/eyebrows-trans-up': 0.15, 'l-ear-scale-incr': 0, 'ears/l-ear-lobe-incr': 0.3, 'ears/r-ear-lobe-incr': 0.3 } },
};
// expression morphs: name → [[unit, weight]…]  (units are blended per hero with the same ethnic weights as the face)
const MORPHS = {
  blinkL: [['eye-left-closure', 1]], blinkR: [['eye-right-closure', 1]],
  jaw: [['mouth-open', 1]],
  smile: [['mouth-corner-puller', 1], ['mouth-elevation', 0.15]],
  browUp: [['eyebrows-left-up', 1], ['eyebrows-right-up', 1]],
  browDown: [['eyebrows-left-down', 1], ['eyebrows-right-down', 1]],
  browInner: [['eyebrows-left-inner-up', 1], ['eyebrows-right-inner-up', 1]],
  wide: [['eye-left-opened-up', 1], ['eye-right-opened-up', 1]],
  squint: [['eye-left-slit', 1], ['eye-right-slit', 1]],
  frown: [['mouth-depression', 1]],
  press: [['mouth-compression', 1]],
  pucker: [['mouth-pursing', 1]],
  sneer: [['nose-left-elevation', 1], ['nose-right-elevation', 1]],
  stretch: [['mouth-retraction', 1]],
};

// ---- region (fixed topology): chosen on an averaged adult-male shape so all three heroes share it
const P0 = Float64Array.from(B.P); for (const e of ['african', 'asian', 'caucasian']) applyTarget(P0, loadTarget(`macrodetails/${e}-male-young`), 1 / 3); applyTarget(P0, loadTarget('macrodetails/universal-male-young-averagemuscle-averageweight'), 1);
const groupOf = new Array(NV).fill(''); for (const f of B.F) for (const v of f.v) if (!groupOf[v] || groupOf[v].startsWith('joint')) groupOf[v] = f.g;
const eyeC = (g) => { let x = 0, y = 0, z = 0, n = 0; for (let i = 0; i < NV; i++) if (groupOf[i] === g) { x += P0[i * 3]; y += P0[i * 3 + 1]; z += P0[i * 3 + 2]; n++; } return [x / n, y / n, z / n]; };
const eL0 = eyeC('helper-l-eye');
// chin (lowest point of the front mid-line profile) on the averaged shape
let chinY = 1e9; for (let i = 0; i < NV; i++) if (groupOf[i] === 'body') { const x = P0[i * 3], y = P0[i * 3 + 1], z = P0[i * 3 + 2]; if (Math.abs(x) < 0.06 && z > eL0[2] + 0.05 && y < eL0[1] - 0.6 && y > eL0[1] - 1.6) chinY = Math.min(chinY, y); }
// neck: an elliptical cylinder round the neck axis below the jaw (keeps a long neck for the collar, drops the trapezius)
const CUT = eL0[1] - 1.95; const NECK = { z: 0.25, rx: 0.64, rz: 0.75 }; // front limit ≈ 1.0 dm keeps the whole throat
const KEEP = (g) => g === 'body' || g === 'helper-upper-teeth' || g === 'helper-lower-teeth' || g === 'helper-tongue' || g.startsWith('helper-l-eyelashes') || g.startsWith('helper-r-eyelashes');
const inRegion = (v) => { const x = P0[v * 3], y = P0[v * 3 + 1], z = P0[v * 3 + 2]; if (y < CUT) return false; if (y < chinY - 0.05) return (x / NECK.rx) ** 2 + ((z - NECK.z) / NECK.rz) ** 2 < 1; return true; };
const faces = []; for (const f of B.F) { if (!KEEP(f.g)) continue; if (f.g === 'body' && !f.v.every(inRegion)) continue; faces.push(f); }
const used = new Map(); const order = []; for (const f of faces) for (const v of f.v) if (!used.has(v)) { used.set(v, order.length); order.push(v); }
const NH = order.length;
const kind = (g) => (g === 'body' ? 0 : g === 'helper-upper-teeth' ? 1 : g === 'helper-lower-teeth' ? 2 : g === 'helper-tongue' ? 3 : 4);
// triangles per part (quads split along the shorter diagonal on the neutral mesh)
const tris = [[], [], [], [], []];
for (const f of faces) { const k = kind(f.g); const ids = f.v.map((v) => used.get(v));
  if (ids.length === 3) tris[k].push(...ids); else { const d = (a, b) => Math.hypot(P0[f.v[a] * 3] - P0[f.v[b] * 3], P0[f.v[a] * 3 + 1] - P0[f.v[b] * 3 + 1], P0[f.v[a] * 3 + 2] - P0[f.v[b] * 3 + 2]);
    if (d(0, 2) <= d(1, 3)) tris[k].push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]); else tris[k].push(ids[0], ids[1], ids[3], ids[1], ids[2], ids[3]); } }
// boundary (open neck ring) vertices of the skin part — runtime closes the collar around them
const edgeCount = new Map(); const ek = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
for (let i = 0; i < tris[0].length; i += 3) for (let k = 0; k < 3; k++) { const e = ek(tris[0][i + k], tris[0][i + (k + 1) % 3]); edgeCount.set(e, (edgeCount.get(e) || 0) + 1); }
const boundary = new Set(); for (const [e, c] of edgeCount) if (c === 1) { const a = Math.floor(e / 65536), b = e % 65536; const ya = P0[order[a] * 3 + 1], yb = P0[order[b] * 3 + 1]; if (ya < chinY - 0.1 && yb < chinY - 0.1) { boundary.add(a); boundary.add(b); } }
// MakeHuman UVs per region vertex (skin only; seams are rare in the face and only feed tiling detail maps)
const uv = new Float32Array(NH * 2); for (const f of faces) f.v.forEach((v, k) => { const t = f.t[k]; if (t >= 0) { uv[used.get(v) * 2] = B.T[t * 2]; uv[used.get(v) * 2 + 1] = B.T[t * 2 + 1]; } });

// ---- skin weights: MakeHuman bones folded onto head / neck / chest
const wsum = Array.from({ length: NH }, () => [0, 0, 0]);
const boneTo = (b) => (/^neck0[1-2]$/.test(b) ? 1 : b === 'neck03' ? 1.6 : /^(spine|clavicle|shoulder|breast|pectoral)/.test(b) ? 2 : 0); // 1.6 → split neck/head
for (const [bone, list] of Object.entries(RIGW)) { const t = boneTo(bone); for (const [vi, w] of list) { const h = used.get(vi); if (h === undefined) continue; if (t === 1.6) { wsum[h][1] += w * 0.5; wsum[h][0] += w * 0.5; } else wsum[h][t] += w; } }
const weights = new Uint8Array(NH * 3);
for (let i = 0; i < NH; i++) { const g = groupOf[order[i]]; let w = wsum[i]; if (g !== 'body') w = [1, 0, 0]; const s = w[0] + w[1] + w[2] || 1; const q = w.map((v) => Math.round((v / s) * 255)); q[0] = 255 - q[1] - q[2]; weights.set(q, i * 3); }

// ---- anatomical masks from the feature targets (a vertex moved by the lip-volume targets is lip, etc.), 0..255 soft
const maskFrom = (list) => { const m = new Float64Array(NH); for (const t of list) for (const [vi, x, y, z] of loadTarget(t)) { const h = used.get(vi); if (h !== undefined) m[h] = Math.max(m[h], Math.hypot(x, y, z)); } let mx = 0; for (const v of m) mx = Math.max(mx, v); return Uint8Array.from(m, (v) => Math.round((v / (mx || 1)) * 255)); };
const MASKS = {
  lips: maskFrom(['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-lowerlip-volume-incr']),
  ears: maskFrom(['ears/l-ear-scale-incr', 'ears/r-ear-scale-incr']),
  nose: maskFrom(['nose/nose-scale-horiz-incr', 'nose/nose-scale-vert-incr']),
  lids: maskFrom(['expression/units/caucasian/eye-left-closure', 'expression/units/caucasian/eye-right-closure']),
  brows: maskFrom(['eyebrows/eyebrows-trans-up']),
};
// per-hero shapes

const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
const out = { verts: NH, parts: ['skin', 'upperTeeth', 'lowerTeeth', 'tongue', 'lashes'], idx: [], uv: b64(uv), weights: b64(weights), boundary: [...boundary], heroes: {}, morphs: Object.keys(MORPHS), masks: {} };
for (const [k, m] of Object.entries(MASKS)) out.masks[k] = b64(m);
for (const t of tris) out.idx.push(b64(Uint16Array.from(t)));
const ETH = ['african', 'asian', 'caucasian']; const unitCache = new Map(); const unit = (e, n) => { const k = e + '/' + n; if (!unitCache.has(k)) unitCache.set(k, loadTarget(`expression/units/${e}/${n}`)); return unitCache.get(k); };
for (const [id, H] of Object.entries(HEROES)) {
  const P = Float64Array.from(P0);
  for (const e of ETH) applyTarget(P, loadTarget(`macrodetails/${e}-male-young`), H.eth[e] || 0);
  for (const [u, w] of Object.entries(H.uni)) applyTarget(P, loadTarget(`macrodetails/universal-male-young-${u}`), w);
  for (const [t, w] of Object.entries(H.t)) if (w && t.includes('/')) applyTarget(P, loadTarget(t), w);
  // landmarks (decimetres, MakeHuman space)
  const ctr = (g) => { const a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9]; for (let i = 0; i < NV; i++) if (groupOf[i] === g) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], P[i * 3 + k]); b[k] = Math.max(b[k], P[i * 3 + k]); } return a.map((v, k) => (v + b[k]) / 2); }; // bounding-box centre (vertex centroids of low-poly spheres are pole-biased)
  const rad = (g, c) => { const d = []; for (let i = 0; i < NV; i++) if (groupOf[i] === g) d.push(Math.hypot(P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2])); d.sort((a, b) => a - b); return d[d.length >> 1]; };
  const eL = ctr('helper-l-eye'), eR = ctr('helper-r-eye'); const er = rad('helper-l-eye', eL);
  let crown = -1e9, chin = 1e9, chinZ = 0, noseTip = [0, 0, -1e9], front = -1e9, back = 1e9, half = 0;
  for (const v of order) { if (groupOf[v] !== 'body') continue; const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    crown = Math.max(crown, y); if (Math.abs(x) < 0.06 && z > eL[2] + 0.05 && y < eL[1] - 0.6 && y > eL[1] - 1.6 && y < chin) { chin = y; chinZ = z; }
    if (Math.abs(x) < 0.12 && y < eL[1] && y > eL[1] - 0.8 && z > noseTip[2]) noseTip = [x, y, z];
    if (Math.abs(y - eL[1] - 0.35) < 0.15) { front = Math.max(front, z); back = Math.min(back, z); } }
  // neck section at the cut (centre + half extents), mouth line (between the teeth helpers' fronts)
  let nx0 = 1e9, nx1 = -1e9, nz0 = 1e9, nz1 = -1e9; for (const i of boundary) { const v = order[i]; nx0 = Math.min(nx0, P[v * 3]); nx1 = Math.max(nx1, P[v * 3]); nz0 = Math.min(nz0, P[v * 3 + 2]); nz1 = Math.max(nz1, P[v * 3 + 2]); }
  let neckY = 0; for (const i of boundary) neckY += P[order[i] * 3 + 1]; neckY /= boundary.size;
  const ut = ctr('helper-upper-teeth'), lt = ctr('helper-lower-teeth');
  // ear: outermost skin points near eye height
  let earX = 0, earY = 0, earZ = 0; for (const v of order) { if (groupOf[v] !== 'body') continue; const x = P[v * 3]; if (x > earX && Math.abs(P[v * 3 + 1] - eL[1]) < 0.5) { earX = x; earY = P[v * 3 + 1]; earZ = P[v * 3 + 2]; } }
  for (const v of order) half = Math.max(half, Math.abs(P[v * 3]));
  // positions → metres, relative to the head origin (between the eyes), Int16 over ±0.3 m
  const O = [0, (eL[1] + eR[1]) / 2, (eL[2] + eR[2]) / 2]; const Q = 0.3 / 32767;
  const pos = new Int16Array(NH * 3); for (let i = 0; i < NH; i++) { const v = order[i]; for (let k = 0; k < 3; k++) pos[i * 3 + k] = Math.round(((P[v * 3 + k] - O[k]) * 0.1) / Q); }
  // expression morphs: blend ethnic units, sparse Int16 deltas (metres / 2e-6)
  const morphs = {};
  for (const [name, list] of Object.entries(MORPHS)) { const D = new Float64Array(NH * 3);
    for (const [u, uw] of list) for (const e of ETH) { const w = (H.eth[e] || 0) * uw; for (const [vi, x, y, z] of unit(e, u)) { const h = used.get(vi); if (h === undefined) continue; D[h * 3] += x * w; D[h * 3 + 1] += y * w; D[h * 3 + 2] += z * w; } }
    const ids = [], dq = []; for (let i = 0; i < NH; i++) { const x = D[i * 3] * 0.1, y = D[i * 3 + 1] * 0.1, z = D[i * 3 + 2] * 0.1; if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 2e-5) { ids.push(i); dq.push(...[x, y, z].map((v) => Math.max(-32767, Math.min(32767, Math.round(v / 2e-6))))); } }
    morphs[name] = { i: b64(Uint16Array.from(ids)), d: b64(Int16Array.from(dq)) }; }
  const m = (v, k) => +(((v - O[k]) * 0.1).toFixed(5));
  out.heroes[id] = { pos: b64(pos), q: Q, morphs,
    L: { eyeL: eL.map(m), eyeR: eR.map(m), eyeR_: +(er * 0.1).toFixed(5), crown: m(crown, 1), chin: [0, m(chin, 1), m(chinZ, 2)], noseTip: noseTip.map(m), front: m(front, 2), back: m(back, 2), half: +(half * 0.1).toFixed(4),
      neck: { y: m(neckY, 1), x0: m(nx0, 0), x1: m(nx1, 0), z0: m(nz0, 2), z1: m(nz1, 2) }, mouth: [0, m((ut[1] + lt[1]) / 2, 1), m(Math.max(ut[2], lt[2]) + 0.08, 2)], ear: [m(earX, 0), m(earY, 1), m(earZ, 2)] } };
  console.log(id, 'er', out.heroes[id].L.eyeR_, 'front', out.heroes[id].L.front, 'back', out.heroes[id].L.back, 'mouth', out.heroes[id].L.mouth, 'crown', out.heroes[id].L.crown, 'chin', out.heroes[id].L.chin, 'nose', out.heroes[id].L.noseTip, 'neck', out.heroes[id].L.neck, 'ear', out.heroes[id].L.ear);
}
const src = `// GENERATED by tools/mh/bake-hero-heads.mjs — do not edit by hand.
// Protagonist head meshes derived from the MakeHuman base mesh, targets and skin weights (CC0 1.0, makehumancommunity/mpfb2).
export default ${JSON.stringify(out)};
`;
fs.writeFileSync(OUT, src);
console.log('verts', NH, 'tris', tris.map((t) => t.length / 3), 'boundary', boundary.size, 'bytes', src.length);
