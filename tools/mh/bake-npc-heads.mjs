// Offline bake: crowd (NPC) heads from the CC0 MakeHuman base mesh + targets (data cached by fetch-makehuman.mjs).
//   node tools/mh/fetch-makehuman.mjs && node tools/mh/bake-npc-heads.mjs   →   src/actors/npcHeadData.js
//
// The protagonists get full-resolution heads (bake-hero-heads.mjs). The crowd needs the same anatomy at a fraction of
// the cost, so this bake:
//  • cuts the head (no neck: the body's neck carries on under it) + teeth out of the base mesh,
//  • decimates the skin with quadric half-edge collapses on an averaged adult shape — feature-weighted, so the eyelids,
//    brows, lips and nose keep their density while the scalp (under hair) and the back of the head are thinned out.
//    Half-edge collapses keep original MakeHuman vertices, so every shape / target / morph is sampled exactly,
//  • builds 24 face variants (12 men, 12 women; young adults to elders) from MakeHuman's ethnic macro shapes (weighted
//    towards Sri Lankan faces — the same blend family as the heroes) and randomised feature targets,
//  • fits an ellipsoid to each variant's cranium and settles the scalp onto it, so the game's hair / caps / scarves
//    (built around an ellipsoid) sit on the real skull,
//  • stores anatomical masks (lips, brows, lash line, inner mouth, beard / moustache areas, ears), a baked concavity
//    (ambient occlusion) term, and expression morphs once per sex (sparse deltas).
// Only CC0 data is used — no MakeHuman / MPFB program code.
import fs from 'node:fs';
import path from 'node:path';
import { loadBase, loadTarget, applyTarget } from './mhlib.mjs';

// NPC_OUT=npcHeadDataLo.js NPC_VERTS=450 NPC_EDGE=0.5 NPC_TEETH=14 → the distance LOD (same variants / landmarks / masks / morphs)
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/actors/' + (process.env.NPC_OUT || 'npcHeadData.js'));
const SKIN_TARGET = +(process.env.NPC_VERTS || 1400); // skin vertices after decimation
const B = loadBase(); const NV = B.P.length / 3;
const ETH = ['african', 'asian', 'caucasian'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rngOf = (seed) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const tcache = new Map(); const T = (n) => { if (!tcache.has(n)) tcache.set(n, loadTarget(n)); return tcache.get(n); };

// ---- shapes
function shape({ sex = 'm', eth = { african: 0.33, asian: 0.17, caucasian: 0.5 }, old = 0, uni = { 'averagemuscle-averageweight': 1 }, t = {} }) {
  const P = Float64Array.from(B.P); const g = sex === 'f' ? 'female' : 'male';
  for (const e of ETH) { applyTarget(P, T(`macrodetails/${e}-${g}-young`), (eth[e] || 0) * (1 - old)); applyTarget(P, T(`macrodetails/${e}-${g}-old`), (eth[e] || 0) * old); }
  for (const [u, w] of Object.entries(uni)) applyTarget(P, T(`macrodetails/universal-${g}-young-${u}`), w * (1 - old * 0.5));
  for (const [n, w] of Object.entries(t)) if (w) applyTarget(P, T(n), w);
  return P;
}
const groupOf = new Array(NV).fill(''); for (const f of B.F) for (const v of f.v) if (!groupOf[v] || groupOf[v].startsWith('joint')) groupOf[v] = f.g;
// topology chosen on a sex-averaged young adult
const PM = shape({ sex: 'm' }), PF = shape({ sex: 'f' }); const P0 = PM.map((v, i) => (v + PF[i]) / 2);
const bbox = (P, g) => { const a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9]; for (let i = 0; i < NV; i++) if (groupOf[i] === g) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], P[i * 3 + k]); b[k] = Math.max(b[k], P[i * 3 + k]); } return a.map((v, k) => (v + b[k]) / 2); };
const eL0 = bbox(P0, 'helper-l-eye');
let chinY = 1e9, chinZ = 0; for (let i = 0; i < NV; i++) if (groupOf[i] === 'body') { const x = P0[i * 3], y = P0[i * 3 + 1], z = P0[i * 3 + 2]; if (Math.abs(x) < 0.06 && z > eL0[2] + 0.05 && y < eL0[1] - 0.6 && y > eL0[1] - 1.6 && y < chinY) { chinY = y; chinZ = z; } }
let backZ = 1e9; for (let i = 0; i < NV; i++) if (groupOf[i] === 'body' && Math.abs(P0[i * 3 + 1] - eL0[1]) < 0.2 && Math.abs(P0[i * 3]) < 0.3) backZ = Math.min(backZ, P0[i * 3 + 2]);

// ---- region: the head down to just under the jaw (front) / the nape (back); a slanted cut plane between them
const yFront = chinY - 0.22, yBack = eL0[1] - 0.95;
const cutAt = (z) => { const t = clamp((chinZ - z) / (chinZ - backZ), 0, 1); return yFront + (yBack - yFront) * t; };
const inRegion = (v) => P0[v * 3 + 1] >= cutAt(P0[v * 3 + 2]);
const KEEP = (g) => g === 'body' || g === 'helper-upper-teeth' || g === 'helper-lower-teeth';
const kindOf = (g) => (g === 'body' ? 0 : g === 'helper-upper-teeth' ? 1 : 2);
const faces = B.F.filter((f) => KEEP(f.g) && (f.g !== 'body' || f.v.every(inRegion)));
const dist = (P, a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
const triP = [[], [], []]; // triangles in ORIGINAL vertex ids, per part
for (const f of faces) { const k = kindOf(f.g); const v = f.v; if (v.length === 3) triP[k].push([v[0], v[1], v[2]]); else if (dist(P0, v[0], v[2]) <= dist(P0, v[1], v[3])) triP[k].push([v[0], v[1], v[2]], [v[0], v[2], v[3]]); else triP[k].push([v[0], v[1], v[3]], [v[1], v[2], v[3]]); }

// ---- masks from feature targets (original vertex ids)
const maskFrom = (list) => { const m = new Float64Array(NV); for (const t of list) for (const [vi, x, y, z] of T(t)) m[vi] = Math.max(m[vi], Math.hypot(x, y, z)); let mx = 0; for (const v of m) mx = Math.max(mx, v); return m.map((v) => clamp(v / (mx || 1) * 1.6, 0, 1)); };
const M = {
  lips: maskFrom(['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-lowerlip-volume-incr']).map((v) => sstep(0.55, 0.98, v)), // the vermilion only, not the corners / cheeks
  ears: (() => { const m = new Float64Array(NV); for (const t of ['ears/l-ear-trans-backward', 'ears/r-ear-trans-backward']) for (const [vi, x, y, z] of T(t)) m[vi] = Math.max(m[vi], Math.hypot(x, y, z)); let mx = 0; for (const v of m) mx = Math.max(mx, v); return m.map((v) => sstep(0.25, 0.7, v / mx)); })(), // a rigid ear move: full on the ear, fading at its root
  nose: maskFrom(['nose/nose-scale-horiz-incr', 'nose/nose-scale-vert-incr']),
  lids: maskFrom(['expression/units/caucasian/eye-left-closure', 'expression/units/caucasian/eye-right-closure']),
  brows: maskFrom(['eyebrows/eyebrows-trans-up']),
};

const er0 = (() => { const d = []; for (let i = 0; i < NV; i++) if (groupOf[i] === 'helper-l-eye') d.push(Math.hypot(P0[i * 3] - eL0[0], P0[i * 3 + 1] - eL0[1], P0[i * 3 + 2] - eL0[2])); d.sort((a, b) => a - b); return d[d.length >> 1]; })();
const BROW = new Float64Array(NV);
  // eyebrows: a tapered arch on the brow ridge above each eye (inner end thick, tail thin)
  for (let v = 0; v < NV; v++) { if (groupOf[v] !== 'body') continue; const x = Math.abs(P0[v * 3]), y = P0[v * 3 + 1], z = P0[v * 3 + 2]; const ex = Math.abs(eL0[0]), er = er0;
    if (z < eL0[2] - 0.15) continue; const t = (x - (ex - er * 1.05)) / (er * 2.45); if (t < -0.15 || t > 1.12) continue;
    const yb = eL0[1] + er * 1.32 + er * 0.22 * Math.sin(Math.PI * clamp(t, 0, 1) * 0.85) - er * 0.25 * clamp(t - 0.6, 0, 1); const half = er * (0.32 - 0.14 * clamp(t, 0, 1));
    const m = (1 - sstep(0.55, 1.15, Math.abs(y - yb) / half)) * sstep(-0.15, 0.02, t) * (1 - sstep(0.92, 1.12, t)); BROW[v] = clamp(m, 0, 1); }

// ---- quadric half-edge-collapse decimation of the skin part
function decimate(tris, P, target, weight, lockedExtra = new Set(), maxEdge = 1e9) {
  const live = new Set(); for (const t of tris) for (const v of t) live.add(v);
  const T2 = tris.map((t) => t.slice()); const dead = new Uint8Array(T2.length);
  const vt = new Map(); for (const v of live) vt.set(v, new Set()); T2.forEach((t, i) => t.forEach((v) => vt.get(v).add(i)));
  const ec = new Map(); const ek = (a, b) => (a < b ? a * 100000 + b : b * 100000 + a);
  for (const t of T2) for (let k = 0; k < 3; k++) { const e = ek(t[k], t[(k + 1) % 3]); ec.set(e, (ec.get(e) || 0) + 1); }
  const locked = new Set(lockedExtra); for (const [e, c] of ec) if (c === 1) { locked.add(Math.floor(e / 100000)); locked.add(e % 100000); }
  const Q = new Map(); for (const v of live) Q.set(v, new Float64Array(10));
  const nrm = (t) => { const [a, b, c] = t; const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
  for (const t of T2) { const n = nrm(t); const l = Math.hypot(...n) || 1e-12; const [a, b, c] = [n[0] / l, n[1] / l, n[2] / l]; const d = -(a * P[t[0] * 3] + b * P[t[0] * 3 + 1] + c * P[t[0] * 3 + 2]); const w = l / 2;
    const q = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d]; for (const v of t) { const Qv = Q.get(v); for (let i = 0; i < 10; i++) Qv[i] += q[i] * w; } }
  const evalQ = (q, v) => { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9]; };
  const ver = new Map(); for (const v of live) ver.set(v, 0);
  const heap = []; const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const nbrs = (v) => { const s = new Set(); for (const ti of vt.get(v)) for (const w of T2[ti]) if (w !== v) s.add(w); return s; };
  const edgeLen = (u, v) => dist(P, u, v);
  const cand = (u, v) => { if (locked.has(u)) return; const q = Q.get(u), r = Q.get(v); const s = new Float64Array(10); for (let i = 0; i < 10; i++) s[i] = q[i] + r[i]; const c = (Math.max(0, evalQ(s, v)) + 1e-7 * edgeLen(u, v) ** 2) * weight(u); push([c, u, v, ver.get(u), ver.get(v)]); };
  for (const v of live) for (const w of nbrs(v)) cand(v, w);
  let alive = live.size;
  while (alive > target && heap.length) {
    const [, u, v, su, sv] = pop(); if (!live.has(u) || !live.has(v) || ver.get(u) !== su || ver.get(v) !== sv) continue;
    const nu = nbrs(u), nv = nbrs(v); if (!nu.has(v)) continue; let common = 0; for (const w of nu) if (nv.has(w)) common++; if (common !== 2) continue;
    // validity: no flipped / sliver triangles
    let ok = true; for (const ti of vt.get(u)) { const t = T2[ti]; if (t.includes(v)) continue; const n0 = nrm(t); const t2 = t.map((w) => (w === u ? v : w)); const n1 = nrm(t2); const l0 = Math.hypot(...n0), l1 = Math.hypot(...n1);
      if (l1 < 1e-10 || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1 + 1e-20) < 0.35) { ok = false; break; }
      const e = Math.max(edgeLen(t2[0], t2[1]), edgeLen(t2[1], t2[2]), edgeLen(t2[2], t2[0])); if (l1 / (e * e) < 0.08 || e > maxEdge) { ok = false; break; } }
    if (!ok) continue;
    for (const ti of [...vt.get(u)]) { const t = T2[ti]; if (t.includes(v)) { dead[ti] = 1; for (const w of t) vt.get(w).delete(ti); } else { t[t.indexOf(u)] = v; vt.get(v).add(ti); } }
    vt.delete(u); live.delete(u); alive--; const qv = Q.get(v), qu = Q.get(u); for (let i = 0; i < 10; i++) qv[i] += qu[i];
    ver.set(v, ver.get(v) + 1); for (const w of nbrs(v)) { cand(v, w); cand(w, v); }
  }
  return T2.filter((t, i) => !dead[i]);
}
// feature weight: eyes / lids / brows / lips / nose are expensive to simplify, the scalp is cheap
const weight = (v) => { const x = P0[v * 3], y = P0[v * 3 + 1], z = P0[v * 3 + 2]; const de = Math.min(Math.hypot(x - eL0[0], y - eL0[1], z - eL0[2]), Math.hypot(x + eL0[0], y - eL0[1], z - eL0[2]));
  let w = 1 + 40 * Math.max(M.lids[v], M.lips[v]) + 25 * M.brows[v] + 60 * BROW[v] + 14 * M.nose[v] + 3 * M.ears[v] + (de < 0.55 ? 30 * (1 - de / 0.55) : 0);
  if (y > eL0[1] + 0.75 || z < eL0[2] - 1.0) w *= 0.7; return w; }; // scalp: kept fine enough for a clean hairline (hair is grown from it)
const nSkin0 = new Set(triP[0].flat()).size;
const skinTris = decimate(triP[0], P0, SKIN_TARGET, weight, new Set(), +(process.env.NPC_EDGE || 0.13)); // ≤ 1.3 cm edges: the hairline / silhouette stay smooth
// teeth: thinned too (only their fronts are ever seen)
const NT_ = +(process.env.NPC_TEETH || 70); const teethTris = [decimate(triP[1], P0, NT_, () => 1), decimate(triP[2], P0, NT_, () => 1)];
// ---- final vertex order: skin, upper teeth, lower teeth
const order = []; const idOf = new Map(); const part = [];
[skinTris, ...teethTris].forEach((tris, p) => { for (const t of tris) for (const v of t) if (!idOf.has(v)) { idOf.set(v, order.length); order.push(v); part.push(p); } });
const nSkin = part.filter((p) => p === 0).length;
// neck opening: the largest boundary loop of the skin (the others are the eye openings); a short vertical skirt hangs from
// it so the body's neck tube can slide inside without a gap showing at any nod / turn
let loop = []; { const ec = new Map(); const ek = (a, b) => a + ',' + b; for (const t of skinTris) for (let k = 0; k < 3; k++) ec.set(ek(t[k], t[(k + 1) % 3]), 1);
  const next = new Map(); for (const t of skinTris) for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; if (!ec.has(ek(b, a))) next.set(a, b); }
  const seen = new Set(); for (const s0 of next.keys()) { if (seen.has(s0)) continue; const L = []; let v = s0; while (v !== undefined && !seen.has(v)) { seen.add(v); L.push(v); v = next.get(v); } if (L.length > loop.length) loop = L; } }
const loopH = loop.map((v) => idOf.get(v)); const nLoop = loopH.length; const N = order.length + nLoop;
const skirtIdx = []; for (let j = 0; j < nLoop; j++) { const a = loopH[j], b = loopH[(j + 1) % nLoop], a2 = order.length + j, b2 = order.length + (j + 1) % nLoop; skirtIdx.push(a, a2, b, b, a2, b2); }
const idx = [...[skinTris, ...teethTris].map((tris) => Uint16Array.from(tris.flat().map((v) => idOf.get(v)))), Uint16Array.from(skirtIdx)];
console.log('neck loop', nLoop, 'verts');

// ---- landmarks of a shape (decimetres) and head-local metres conversion
function landmarks(P) {
  const eL = bbox(P, 'helper-l-eye'), eR = bbox(P, 'helper-r-eye'); const d = []; for (let i = 0; i < NV; i++) if (groupOf[i] === 'helper-l-eye') d.push(Math.hypot(P[i * 3] - eL[0], P[i * 3 + 1] - eL[1], P[i * 3 + 2] - eL[2])); d.sort((a, b) => a - b); const er = d[d.length >> 1];
  let crown = -1e9, chin = [0, 1e9, 0], nose = [0, 0, -1e9], lobe = [0, 1e9, 0], ear = [0, 0, 0], brow = -1e9;
  for (const v of order) { if (groupOf[v] !== 'body') continue; const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; crown = Math.max(crown, y);
    if (Math.abs(x) < 0.06 && z > eL[2] + 0.05 && y < eL[1] - 0.6 && y > eL[1] - 1.6 && y < chin[1]) chin = [0, y, z];
    if (Math.abs(x) < 0.12 && y < eL[1] && y > eL[1] - 0.8 && z > nose[2]) nose = [x, y, z];
    if (M.ears[v] > 0.25 && x > 0 && x > ear[0]) ear = [x, y, z];
    if (Math.abs(x - eL[0]) < 0.08 && y > eL[1] && y < eL[1] + 0.5) brow = Math.max(brow, z); }
  for (const v of order) { if (groupOf[v] !== 'body' || M.ears[v] < 0.5) continue; const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; if (x > ear[0] - 0.25 && Math.abs(z - ear[2]) < 0.3 && y < lobe[1]) lobe = [x, y, z]; } // lowest point of the ear shell itself
  const ut = bbox(P, 'helper-upper-teeth'), lt = bbox(P, 'helper-lower-teeth');
  let lipsZ = -1e9; for (const v of order) if (M.lips[v] > 0.3) lipsZ = Math.max(lipsZ, P[v * 3 + 2]);
  return { eL, eR, er, crown, chin, nose, lobe, ear, brow, mouth: [0, (ut[1] + lt[1]) / 2, lipsZ] };
}
const L0 = landmarks(P0);
// ---- derived masks on the averaged shape (original ids)
const D = (P, v, O) => [(P[v * 3] - O[0]) / 1, (P[v * 3 + 1] - O[1]), (P[v * 3 + 2] - O[2])];
const derived = { lash: new Float64Array(NV), inner: new Float64Array(NV), beard: new Float64Array(NV), mous: new Float64Array(NV), ao: new Float64Array(NV).fill(1) };
{ // lash line: the eye-opening rim (boundary loop round each eye) — full on the upper lid, light on the lower
  const ec = new Map(); const ek = (a, b) => (a < b ? a * 100000 + b : b * 100000 + a); for (const t of skinTris) for (let k = 0; k < 3; k++) { const e = ek(t[k], t[(k + 1) % 3]); ec.set(e, (ec.get(e) || 0) + 1); }
  for (const [e, c] of ec) if (c === 1) for (const v of [Math.floor(e / 100000), e % 100000]) { const x = P0[v * 3], y = P0[v * 3 + 1], z = P0[v * 3 + 2]; const sx = x > 0 ? 1 : -1; const ex = L0.eL[0] * (sx > 0 ? 1 : -1) * Math.sign(L0.eL[0]);
    if (Math.hypot(x - ex, y - L0.eL[1], z - L0.eL[2]) < L0.er * 2.2) derived.lash[v] = y > L0.eL[1] - L0.er * 0.15 ? 1 : 0.35; }
  // inner mouth: skin near the mouth that is hidden from the front (a ray towards +z hits the face) — the mouth cavity
  const hitFront = (ox, oy, oz) => { for (const t of triP[0]) { const [a, b, c] = t; const ax = P0[a * 3], ay = P0[a * 3 + 1], bx = P0[b * 3], by = P0[b * 3 + 1], cx = P0[c * 3], cy = P0[c * 3 + 1];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-12) continue; const l1 = ((by - cy) * (ox - cx) + (cx - bx) * (oy - cy)) / d, l2 = ((cy - ay) * (ox - cx) + (ax - cx) * (oy - cy)) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue; const z = l1 * P0[a * 3 + 2] + l2 * P0[b * 3 + 2] + l3 * P0[c * 3 + 2]; if (z > oz + 0.02) return true; } return false; };
  for (const v of order) { if (groupOf[v] !== 'body') continue; const x = P0[v * 3], y = P0[v * 3 + 1], z = P0[v * 3 + 2]; if (Math.abs(x) > 0.3 || Math.abs(y - L0.mouth[1]) > 0.3 || z > L0.mouth[2] - 0.04 || z < L0.mouth[2] - 1.0) continue;
    if (hitFront(x, y, z)) derived.inner[v] = 1; }

  // beard / moustache areas (on the male average): lower face in front of the ears, under the jaw, sideburns
  const Pm = PM; const Lm = landmarks(Pm); const noseBase = Lm.nose[1] - 0.12;
  for (const v of order) { if (groupOf[v] !== 'body') continue; const x = Math.abs(Pm[v * 3]), y = Pm[v * 3 + 1], z = Pm[v * 3 + 2]; if (M.lips[v] > 0.35 || derived.inner[v] > 0.2) continue;
    const front = sstep(Lm.ear[2] - 0.15, Lm.ear[2] + 0.1, z); const low = 1 - sstep(noseBase - 0.25, noseBase + 0.05, y);
    const side = sstep(Lm.ear[0] * 0.55, Lm.ear[0] * 0.8, x) * sstep(Lm.eL[1] + 0.15, Lm.eL[1] - 0.05, y) * sstep(Lm.ear[2] - 0.1, Lm.ear[2] + 0.05, z) * (1 - sstep(Lm.ear[2] + 0.3, Lm.ear[2] + 0.5, z));
    const cheekLimit = 1 - sstep(-0.1, 0.12, y - (noseBase - 0.25 + (x / Lm.ear[0]) * 0.45));
    derived.beard[v] = clamp(Math.max(low * front * cheekLimit, side) * (1 - M.ears[v]), 0, 1);
    derived.mous[v] = (1 - sstep(0.2, 0.3, x)) * sstep(Lm.mouth[1] + 0.03, Lm.mouth[1] + 0.09, y) * (1 - sstep(noseBase - 0.05, noseBase + 0.04, y)) * sstep(Lm.mouth[2] - 0.35, Lm.mouth[2] - 0.15, z); }
  // concavity → ambient occlusion (nostrils, eye corners, ear folds, mouth corners)
  const nb = new Map(); for (const t of skinTris) for (const a of t) { if (!nb.has(a)) nb.set(a, new Set()); for (const b of t) if (b !== a) nb.get(a).add(b); }
  const vn = new Map(); for (const t of skinTris) { const [a, b, c] = t; const u = [P0[b * 3] - P0[a * 3], P0[b * 3 + 1] - P0[a * 3 + 1], P0[b * 3 + 2] - P0[a * 3 + 2]], w = [P0[c * 3] - P0[a * 3], P0[c * 3 + 1] - P0[a * 3 + 1], P0[c * 3 + 2] - P0[a * 3 + 2]]; const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; for (const v of t) { const s = vn.get(v) || [0, 0, 0]; vn.set(v, [s[0] + n[0], s[1] + n[1], s[2] + n[2]]); } }
  for (const [v, s] of nb) { let cx = 0, cy = 0, cz = 0, el = 0; for (const w of s) { cx += P0[w * 3]; cy += P0[w * 3 + 1]; cz += P0[w * 3 + 2]; el += dist(P0, v, w); } const k = s.size; cx /= k; cy /= k; cz /= k; el /= k; const n = vn.get(v); const nl = Math.hypot(...n) || 1;
    const conc = ((cx - P0[v * 3]) * n[0] + (cy - P0[v * 3 + 1]) * n[1] + (cz - P0[v * 3 + 2]) * n[2]) / nl / (el || 1); derived.ao[v] = 1 - clamp(conc * 0.9, 0, 0.42); }
  void D;
}

// ---- variants
const FEAT = [ // [target(s), min, max]  (l/r pairs applied together)
  [['head/head-oval'], 0, 0.6], [['head/head-round'], 0, 0.5], [['head/head-square'], 0, 0.45], [['head/head-rectangular'], 0, 0.4], [['head/head-invertedtriangular'], 0, 0.35], [['head/head-diamond'], 0, 0.3],
  [['nose/nose-scale-horiz-incr'], -0.25, 0.5], [['nose/nose-flaring-incr'], -0.2, 0.6], [['nose/nose-hump-incr'], -0.3, 0.45], [['nose/nose-scale-vert-incr'], -0.35, 0.35], [['nose/nose-point-width-incr'], -0.2, 0.5], [['nose/nose-volume-incr'], -0.2, 0.4], [['nose/nose-point-down'], 0, 0.4],
  [['mouth/mouth-lowerlip-volume-incr'], -0.1, 0.55], [['mouth/mouth-upperlip-volume-incr'], -0.2, 0.4], [['mouth/mouth-scale-horiz-incr'], -0.3, 0.3], [['mouth/mouth-cupidsbow-incr'], 0, 0.4],
  [['chin/chin-prominent-incr'], -0.3, 0.4], [['chin/chin-width-incr'], -0.35, 0.45], [['chin/chin-height-incr'], -0.3, 0.3], [['chin/chin-bones-incr'], -0.2, 0.4],
  [['cheek/l-cheek-bones-incr', 'cheek/r-cheek-bones-incr'], -0.2, 0.5], [['cheek/l-cheek-volume-incr', 'cheek/r-cheek-volume-incr'], -0.35, 0.4],
  [['eyes/l-eye-scale-incr', 'eyes/r-eye-scale-incr'], -0.15, 0.3], [['eyes/l-eye-bag-incr', 'eyes/r-eye-bag-incr'], 0, 0.4], [['eyes/l-eye-height2-decr', 'eyes/r-eye-height2-decr'], -0.25, 0.3],
  [['eyebrows/eyebrows-trans-down'], -0.3, 0.4], [['eyebrows/eyebrows-angle-up'], -0.35, 0.35], [['forehead/forehead-scale-vert-incr'], -0.3, 0.35], [['forehead/forehead-nubian-incr'], -0.2, 0.3],
  [['ears/l-ear-scale-incr', 'ears/r-ear-scale-incr'], -0.3, 0.25], [['ears/l-ear-flap-decr', 'ears/r-ear-flap-decr'], 0, 0.5],
];
const tw = (n, w, t) => { const m = n.match(/^(.*)-(incr|decr)$/); if (w < 0 && m) t[`${m[1]}-${m[2] === 'incr' ? 'decr' : 'incr'}`] = -w; else if (w > 0) t[n] = w; };
const variants = [];
for (const sex of ['m', 'f']) for (let i = 0; i < 14; i++) { // per sex: 0..11 local faces, 12 European visitor, 13 East Asian visitor
  const r = rngOf((sex === 'f' ? 7919 : 104729) + i * 977); const R = (a, b) => a + (b - a) * r();
  const a = R(0.22, 0.52), s = R(0.03, 0.2); const eth = i === 12 ? { african: 0.03, asian: 0.05, caucasian: 0.92 } : i === 13 ? { african: 0.03, asian: 0.85, caucasian: 0.12 } : { african: a, asian: s, caucasian: 1 - a - s };
  const old = i >= 12 ? R(0.02, 0.25) : i % 4 === 3 ? R(0.55, 0.8) : i % 4 === 1 ? R(0.18, 0.32) : R(0, 0.1); // 3 elders, 3 middle-aged, 6 young adults per sex
  const uni = sex === 'f' ? { 'averagemuscle-averageweight': R(0.4, 0.9) } : { 'averagemuscle-averageweight': R(0.3, 0.7) };
  const extra = r(); if (extra < 0.3) uni['averagemuscle-minweight'] = R(0.2, 0.5); else if (extra < 0.6) uni['averagemuscle-maxweight'] = R(0.15, 0.45); else if (sex === 'm') uni['maxmuscle-averageweight'] = R(0.2, 0.5);
  const t = { 'ears/l-ear-flap-decr': 0.3, 'ears/r-ear-flap-decr': 0.3, 'ears/l-ear-scale-decr': 0.12, 'ears/r-ear-scale-decr': 0.12 }; const pickN = 8 + Math.floor(r() * 5); const used = new Set(); for (let k = 0; k < pickN; k++) { const j = Math.floor(r() * FEAT.length); if (used.has(j)) continue; used.add(j); const [names, lo, hi] = FEAT[j]; const w = R(lo, hi); for (const n of names) tw(n, w, t); }
  variants.push({ sex, old, def: { sex, eth, old, uni, t } });
}

const Qm = 0.25 / 32767; const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
const out = { verts: N, skinVerts: nSkin, idx: idx.map(b64), masks: {}, variants: [], morphs: {}, morphNames: [] };
const q8 = (arr) => { const o = new Uint8Array(N); order.forEach((v, i) => { o[i] = Math.round(clamp(arr[v], 0, 1) * 255); }); return o; };
for (const k of ['lips', 'ears', 'nose', 'lids']) out.masks[k] = b64(q8(M[k])); out.masks.brows = b64(q8(BROW)); for (const k of ['lash', 'inner', 'beard', 'mous']) out.masks[k] = b64(q8(derived[k]));
{ const a = q8(derived.ao); a.fill(255, order.length); out.masks.ao = b64(a); }

// Nelder–Mead (small, dependency-free)
function nelder(f, x0, step, iters = 600) { const n = x0.length; let S = [x0.slice()]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step[i]; S.push(x); } let F = S.map(f);
  for (let it = 0; it < iters; it++) { const o = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = o.map((i) => S[i]); F = o.map((i) => F[i]); const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += S[i][k] / n;
    const w = S[n]; const xr = c.map((v, k) => v + (v - w[k])); const fr = f(xr);
    if (fr < F[0]) { const xe = c.map((v, k) => v + 2 * (v - w[k])); const fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = c.map((v, k) => v + 0.5 * (w[k] - v)); const fc = f(xc); if (fc < F[n]) { S[n] = xc; F[n] = fc; } else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, k) => S[0][k] + 0.5 * (v - S[0][k])); F[i] = f(S[i]); } } }
  return S[0]; }

for (const V of variants) {
  const P = shape(V.def); const Lm = landmarks(P);
  const O = [0, (Lm.eL[1] + Lm.eR[1]) / 2, (Lm.eL[2] + Lm.eR[2]) / 2];
  const pos = new Float64Array(N * 3); order.forEach((v, i) => { for (let k = 0; k < 3; k++) pos[i * 3 + k] = (P[v * 3 + k] - O[k]) * 0.1; });
  let ny0 = 1e9, ny1 = -1e9, nx = 0, nz0 = 1e9, nz1 = -1e9; for (const h of loopH) { ny0 = Math.min(ny0, pos[h * 3 + 1]); ny1 = Math.max(ny1, pos[h * 3 + 1]); nx = Math.max(nx, Math.abs(pos[h * 3])); nz0 = Math.min(nz0, pos[h * 3 + 2]); nz1 = Math.max(nz1, pos[h * 3 + 2]); }
  const ncz = (nz0 + nz1) / 2, yS = ny0 - 0.035; loopH.forEach((h, j) => { const o = (order.length + j) * 3; pos[o] = pos[h * 3] * 0.985; pos[o + 1] = yS; pos[o + 2] = ncz + (pos[h * 3 + 2] - ncz) * 0.985; });
  const m = (p) => p.map((v, k) => +((v - O[k]) * 0.1).toFixed(5));
  // cranium points (metres, head-local): scalp above the brow line / behind the ears, no ears, no face
  const crown = (Lm.crown - O[1]) * 0.1, ezf = (Lm.brow - O[2]) * 0.1, earZ = (Lm.ear[2] - O[2]) * 0.1;
  const scalp = []; for (let i = 0; i < nSkin; i++) { const v = order[i]; if (M.ears[v] > 0.04) continue; const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if ((y > 0.045 && z < ezf - 0.012) || (y > 0.075) || (z < earZ - 0.015 && y > -0.045)) scalp.push([x, y, z]); }
  const fitErr = (q) => { const [cy, cz, rx, ry, rz] = q; if (rx < 0.05 || ry < 0.05 || rz < 0.05) return 1e9; let e = 0; for (const [x, y, z] of scalp) { const d = Math.sqrt((x / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2) - 1; e += d * d; } return e / scalp.length; };
  const [cy, cz, rx, ry, rz] = nelder(fitErr, [0.01, -0.07, 0.075, 0.1, 0.1], [0.01, 0.01, 0.01, 0.01, 0.01]);
  // settle the scalp onto the ellipsoid (just inside it) so hair / caps built on the ellipsoid sit on the skull
  const ellQ = (x, y, z) => (x / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2; let moved = 0;
  for (let i = 0; i < nSkin; i++) { const v = order[i]; const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const fz = sstep(ezf - 0.04, ezf - 0.01, z); // 1 = front of the head
    const wy = fz * sstep(0.055, 0.085, y) + (1 - fz) * (z < earZ - 0.012 ? sstep(-0.07, -0.035, y) : sstep(0.02, 0.05, y));
    const w = wy * (1 - sstep(0.02, 0.15, M.ears[v])); if (w <= 0) continue; const k = 0.996 / Math.sqrt(ellQ(x, y, z));
    const nx = x * k, ny = cy + (y - cy) * k, nz = cz + (z - cz) * k; pos[i * 3] = x + (nx - x) * w; pos[i * 3 + 1] = y + (ny - y) * w; pos[i * 3 + 2] = z + (nz - z) * w; moved = Math.max(moved, Math.hypot(nx - x, ny - y, nz - z) * w); }
  const qp = Int16Array.from(pos, (v) => Math.round(v / Qm));
  out.variants.push({ sex: V.sex, old: +V.old.toFixed(2), pos: b64(qp), q: Qm,
    L: { eyeL: m(Lm.eL), eyeR: m(Lm.eR), er: +(Lm.er * 0.1).toFixed(5), crown: +crown.toFixed(4), chin: m(Lm.chin), nose: m(Lm.nose), lobe: m(Lm.lobe), ear: m(Lm.ear), brow: +ezf.toFixed(4), mouth: m(Lm.mouth),
      ell: { c: [0, +cy.toFixed(4), +cz.toFixed(4)], r: [+rx.toFixed(4), +ry.toFixed(4), +rz.toFixed(4)] },
      neck: { y0: +yS.toFixed(4), y1: +ny1.toFixed(4), yf: +ny0.toFixed(4), cz: +ncz.toFixed(4), rx: +nx.toFixed(4), rz: +((nz1 - nz0) / 2).toFixed(4) } } });
  console.log(V.sex, 'old', V.old.toFixed(2), 'ell r', [rx, ry, rz].map((v) => v.toFixed(3)).join(','), 'c', cy.toFixed(3), cz.toFixed(3), 'fit rms', Math.sqrt(fitErr([cy, cz, rx, ry, rz])).toFixed(3), 'scalp moved max', (moved * 1000).toFixed(1), 'mm');
}

// ---- expression morphs, once per sex (ethnic units blended like the variants' average)
const MORPHS = {
  blinkL: [['eye-left-closure', 1]], blinkR: [['eye-right-closure', 1]], jaw: [['mouth-open', 1]], smile: [['mouth-corner-puller', 1], ['mouth-elevation', 0.15]],
  browUp: [['eyebrows-left-up', 1], ['eyebrows-right-up', 1]], browDown: [['eyebrows-left-down', 1], ['eyebrows-right-down', 1]], browInner: [['eyebrows-left-inner-up', 1], ['eyebrows-right-inner-up', 1]],
  wide: [['eye-left-opened-up', 1], ['eye-right-opened-up', 1]], squint: [['eye-left-slit', 1], ['eye-right-slit', 1]], frown: [['mouth-depression', 1]], press: [['mouth-compression', 1]], stretch: [['mouth-retraction', 1]],
};
out.morphNames = Object.keys(MORPHS); const EW = { african: 0.36, asian: 0.12, caucasian: 0.52 };
for (const sex of ['m', 'f']) { out.morphs[sex] = {};
  for (const [name, list] of Object.entries(MORPHS)) { const Dl = new Float64Array(N * 3);
    for (const [u, uw] of list) for (const e of ETH) { const w = EW[e] * uw; for (const [vi, x, y, z] of T(`expression/units/${e}/${u}`)) { const h = idOf.get(vi); if (h === undefined) continue; Dl[h * 3] += x * w; Dl[h * 3 + 1] += y * w; Dl[h * 3 + 2] += z * w; } }
    const ids = [], dq = []; for (let i = 0; i < N; i++) { const x = Dl[i * 3] * 0.1, y = Dl[i * 3 + 1] * 0.1, z = Dl[i * 3 + 2] * 0.1; if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 2e-5) { ids.push(i); dq.push(...[x, y, z].map((v) => clamp(Math.round(v / 2e-6), -32767, 32767))); } }
    out.morphs[sex][name] = { i: b64(Uint16Array.from(ids)), d: b64(Int16Array.from(dq)) }; } }

const src = `// GENERATED by tools/mh/bake-npc-heads.mjs — do not edit by hand.\n// Crowd head meshes derived from the MakeHuman base mesh and targets (CC0 1.0, makehumancommunity/mpfb2).\nexport default ${JSON.stringify(out)};\n`;
fs.writeFileSync(OUT, src);
console.log('skin verts', nSkin0, '→', nSkin, '| total verts', N, '| tris', idx.map((a) => a.length / 3).join(' + '), '| bytes', src.length);
