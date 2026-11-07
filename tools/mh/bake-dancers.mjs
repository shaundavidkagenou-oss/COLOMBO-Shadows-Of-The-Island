// Offline bake: the four club dancers (world/ClubCast.js) as whole, seamless bodies from the CC0 MakeHuman base mesh.
//   node tools/mh/fetch-makehuman.mjs && node tools/mh/bake-dancers.mjs   →   src/actors/dancerBodyData.js
//
// Each dancer is an adult woman (24–31) shaped with MakeHuman's own anatomical targets: the female macro shapes (a blend of
// the three ethnic macros, giving a South-Asian adult), muscle / weight, the bust macros (cup size × firmness — a different
// size and shape per dancer), waist / hips / stomach / buttocks measurements and per-dancer face features. The one
// continuous body surface (head, neck, torso, arms with real hands and fingers, legs, feet) is then RE-POSED from
// MakeHuman's A-pose into the game skeleton's rest pose (arms hanging, palms in, legs straight, toes flexed up for the
// heels) with dual-quaternion skinning on MakeHuman's authored weights, and those weights are folded onto the game
// skeleton: the crowd's 23 bones + 30 finger bones (hero naming) + toe bones + two breast bones (secondary motion).
// Also baked: per-vertex feature masks (lips, lids, brows, nose, ears, cheeks, nails…) used to paint the skin, the
// facial-expression morphs (blinks, smile, brows, jaw…), and landmarks for clothing / hair / heels.
// Only CC0 data is used — no MakeHuman / MPFB program code.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, loadBase, loadTarget, applyTarget } from './mhlib.mjs';

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/actors/dancerBodyData.js');
const B = loadBase(); const NV = B.P.length / 3;
const RIG = JSON.parse(fs.readFileSync(path.join(CACHE, 'rigs/standard/rig.game_engine_with_breast.json'), 'utf8'));
const RIGW = JSON.parse(fs.readFileSync(path.join(CACHE, 'rigs/standard/weights.game_engine_with_breast.json'), 'utf8')).weights;
const ETH = ['african', 'asian', 'caucasian'];

// ---------------------------------------------------------------- the dancers (adults; fictional)
// cup: [mincup, maxcup] weights (0 = MakeHuman's average cup); firm: [minfirmness, maxfirmness]
export const DANCERS = {
  ruby: { height: 1.69, eth: { african: 0.22, asian: 0.3, caucasian: 0.48 }, uni: { 'averagemuscle-averageweight': 0.8, 'averagemuscle-minweight': 0.2 },
    cup: [0, 0.5], firm: [0, 0.35],
    t: { 'torso/measure-waist-circ-decr': 0.55, 'torso/measure-hips-circ-incr': 0.25, 'stomach/stomach-pregnant-decr': 0.55, 'buttocks/buttocks-volume-incr': 0.3, 'hip/hip-scale-horiz-incr': 0.12,
      'torso/measure-underbust-circ-decr': 0.2, 'legs/upperlegs-height-incr': 0.15,
      'head/head-oval': 0.5, 'mouth/mouth-upperlip-volume-incr': 0.35, 'mouth/mouth-lowerlip-volume-incr': 0.45, 'eyes/l-eye-scale-incr': 0.2, 'eyes/r-eye-scale-incr': 0.2, 'nose/nose-scale-horiz-decr': 0.15,
      'chin/chin-width-decr': 0.25, 'cheek/l-cheek-bones-incr': 0.25, 'cheek/r-cheek-bones-incr': 0.25, 'eyebrows/eyebrows-angle-up': 0.25 } },
  jade: { height: 1.66, eth: { african: 0.3, asian: 0.22, caucasian: 0.48 }, uni: { 'averagemuscle-minweight': 0.45, 'maxmuscle-minweight': 0.3, 'averagemuscle-averageweight': 0.25 },
    cup: [0.3, 0], firm: [0, 0.55],
    t: { 'torso/measure-waist-circ-decr': 0.35, 'stomach/stomach-pregnant-decr': 0.7, 'stomach/stomach-navel-in': 0.3, 'torso/torso-vshape-incr': 0.15, 'buttocks/buttocks-volume-incr': 0.2,
      'head/head-invertedtriangular': 0.25, 'cheek/l-cheek-bones-incr': 0.5, 'cheek/r-cheek-bones-incr': 0.5, 'cheek/l-cheek-volume-decr': 0.3, 'cheek/r-cheek-volume-decr': 0.3, 'nose/nose-point-width-decr': 0.25,
      'mouth/mouth-scale-horiz-incr': 0.15, 'mouth/mouth-lowerlip-volume-incr': 0.3, 'eyes/l-eye-height2-decr': 0.15, 'eyes/r-eye-height2-decr': 0.15, 'chin/chin-prominent-incr': 0.15, 'eyebrows/eyebrows-trans-up': 0.2 } },
  opal: { height: 1.71, eth: { african: 0.2, asian: 0.28, caucasian: 0.52 }, uni: { 'averagemuscle-minweight': 0.6, 'averagemuscle-averageweight': 0.4 },
    cup: [0.6, 0], firm: [0, 0.7],
    t: { 'torso/measure-waist-circ-decr': 0.4, 'stomach/stomach-pregnant-decr': 0.6, 'legs/upperlegs-height-incr': 0.3, 'legs/lowerlegs-height-incr': 0.25, 'neck/neck-scale-vert-incr': 0.2,
      'head/head-invertedtriangular': 0.4, 'eyes/l-eye-scale-incr': 0.35, 'eyes/r-eye-scale-incr': 0.35, 'nose/nose-scale-vert-decr': 0.2, 'nose/nose-point-width-decr': 0.3, 'mouth/mouth-upperlip-volume-incr': 0.4,
      'chin/chin-width-decr': 0.4, 'chin/chin-height-decr': 0.15, 'eyebrows/eyebrows-angle-up': 0.35, 'forehead/forehead-scale-vert-decr': 0.15 } },
  saffron: { height: 1.64, eth: { african: 0.28, asian: 0.3, caucasian: 0.42 }, uni: { 'averagemuscle-averageweight': 0.7, 'averagemuscle-maxweight': 0.3 },
    cup: [0, 0.85], firm: [0.15, 0],
    t: { 'torso/measure-hips-circ-incr': 0.45, 'buttocks/buttocks-volume-incr': 0.5, 'hip/hip-scale-horiz-incr': 0.25, 'torso/measure-waist-circ-decr': 0.3, 'stomach/stomach-pregnant-decr': 0.3,
      'legs/measure-thigh-circ-incr': 0.25,
      'head/head-round': 0.45, 'cheek/l-cheek-volume-incr': 0.3, 'cheek/r-cheek-volume-incr': 0.3, 'mouth/mouth-lowerlip-volume-incr': 0.55, 'mouth/mouth-upperlip-volume-incr': 0.3, 'nose/nose-flaring-incr': 0.2,
      'eyes/l-eye-scale-incr': 0.15, 'eyes/r-eye-scale-incr': 0.15, 'chin/chin-prominent-decr': 0.15, 'eyebrows/eyebrows-trans-down': 0.1 } },
};
const ARMS = { 'arms/measure-upperarm-length-incr': 0.6, 'arms/measure-lowerarm-length-incr': 0.6 };
const HEEL = { pitch: 0.55, plat: 0.024 }; // platform stage heels (≈ 10 cm): forefoot pitch, platform thickness under the ball

// ---------------------------------------------------------------- mesh parts (shared topology)
const groupOf = new Array(NV).fill(''); for (const f of B.F) for (const v of f.v) if (!groupOf[v] || groupOf[v].startsWith('joint')) groupOf[v] = f.g;
const PART = (g) => (g === 'body' ? 0 : g.startsWith('helper-l-eyelashes') || g.startsWith('helper-r-eyelashes') ? 1 : g === 'helper-upper-teeth' ? 2 : g === 'helper-lower-teeth' ? 3 : g === 'helper-tongue' ? 4 : -1);
const faces = B.F.filter((f) => PART(f.g) >= 0);
const cubeC = new Map(); // joint cube centroids are recomputed per shape
const joint = (P, spec) => { if (spec.strategy === 'CUBE') { let x = 0, y = 0, z = 0, n = 0; for (const v of cubeVerts(spec.cube_name)) { x += P[v * 3]; y += P[v * 3 + 1]; z += P[v * 3 + 2]; n++; } return [x / n, y / n, z / n]; }
  if (spec.strategy === 'VERTEX') { const v = spec.vertex_index; return [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; }
  if (spec.strategy === 'MEAN') { let x = 0, y = 0, z = 0; for (const v of spec.vertex_indices) { x += P[v * 3]; y += P[v * 3 + 1]; z += P[v * 3 + 2]; } const n = spec.vertex_indices.length; return [x / n, y / n, z / n]; }
  const d = spec.default_position; return [d[0] * 10, d[2] * 10, -d[1] * 10]; };
function cubeVerts(name) { if (!cubeC.has(name)) { const s = new Set(); for (const f of B.F) if (f.g === name) for (const v of f.v) s.add(v); cubeC.set(name, [...s]); } return cubeC.get(name); }

// split vertices on UV seams: one render vertex per (position, uv) pair; `orig` welds them back for normals / skinning
const keyMap = new Map(); const ORIG = [], UVS = [], RPART = []; const tris = [[], [], [], [], []];
const rv = (v, t, part) => { const k = v * 65536 + (t + 1); let i = keyMap.get(k); if (i === undefined) { i = ORIG.length; keyMap.set(k, i); ORIG.push(v); UVS.push(t >= 0 ? B.T[t * 2] : 0, t >= 0 ? B.T[t * 2 + 1] : 0); RPART.push(part); } return i; };
const P0 = Float64Array.from(B.P); for (const e of ETH) applyTarget(P0, loadTarget(`macrodetails/${e}-female-young`), 1 / 3); applyTarget(P0, loadTarget('macrodetails/universal-female-young-averagemuscle-averageweight'), 1);
for (const f of faces) { const part = PART(f.g); const ids = f.v.map((v, k) => rv(v, f.t[k], part));
  if (ids.length === 3) tris[part].push(...ids); else { const d = (a, b) => Math.hypot(P0[f.v[a] * 3] - P0[f.v[b] * 3], P0[f.v[a] * 3 + 1] - P0[f.v[b] * 3 + 1], P0[f.v[a] * 3 + 2] - P0[f.v[b] * 3 + 2]);
    if (d(0, 2) <= d(1, 3)) tris[part].push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]); else tris[part].push(ids[0], ids[1], ids[3], ids[1], ids[2], ids[3]); } }
const USED = [...new Set(ORIG)].sort((a, b) => a - b); const UIDX = new Map(USED.map((v, i) => [v, i])); const NU = USED.length; // compact original-vertex index
const NR = ORIG.length;

// ---------------------------------------------------------------- game skeleton + weight folding
const FINGERS = { index: 'idx', middle: 'mid', ring: 'rng', pinky: 'pnk', thumb: 'thb' };
const GAME = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'skirtF', 'skirtB', 'skirtF2', 'skirtB2'];
const EXTRA = []; for (const S of ['L', 'R']) for (const f of ['idx', 'mid', 'rng', 'pnk', 'thb']) for (let j = 1; j <= 3; j++) EXTRA.push(f + j + S);
EXTRA.push('toeL', 'toeR', 'breastL', 'breastR');
const BONES = [...GAME, ...EXTRA]; const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
// MakeHuman bone → [[game bone, share]…]
const fold = (mb) => { const m = /^(.*)_(l|r)$/.exec(mb); const S = m ? m[2].toUpperCase() : '';
  const base = m ? m[1] : mb;
  if (mb === 'pelvis' || mb === 'Root') return [['hips', 1]]; if (mb === 'spine_01') return [['hips', 0.45], ['spine', 0.55]]; if (mb === 'spine_02') return [['spine', 0.7], ['chest', 0.3]]; if (mb === 'spine_03') return [['chest', 1]];
  if (mb === 'neck_01') return [['neck', 1]]; if (mb === 'head') return [['head', 1]];
  if (base === 'clavicle') return [['sh' + S, 1]]; if (base === 'upperarm') return [['arm' + S, 1]]; if (base === 'lowerarm') return [['fore' + S, 1]]; if (base === 'hand') return [['hand' + S, 1]];
  if (base === 'thigh') return [['thigh' + S, 1]]; if (base === 'calf') return [['shin' + S, 1]]; if (base === 'foot') return [['foot' + S, 1]]; if (base === 'ball') return [['toe' + S, 1]];
  if (base === 'breast') return [['breast' + S, 1]];
  const fm = /^(index|middle|ring|pinky|thumb)_0([123])$/.exec(base); if (fm) return [[FINGERS[fm[1]] + fm[2] + S, 1]];
  throw new Error('unmapped bone ' + mb); };
const WSUM = Array.from({ length: NU }, () => new Map());
for (const [mb, list] of Object.entries(RIGW)) { const tg = fold(mb); for (const [vi, w] of list) { const u = UIDX.get(vi); if (u === undefined) continue; for (const [g, s] of tg) WSUM[u].set(g, (WSUM[u].get(g) || 0) + w * s); } }
const SKI = new Uint8Array(NU * 4), SKW = new Uint8Array(NU * 4);
for (let u = 0; u < NU; u++) { let e = [...WSUM[u].entries()]; if (!e.length) e = [['head', 1]]; e.sort((a, b) => b[1] - a[1]); e = e.slice(0, 4); const s = e.reduce((a, b) => a + b[1], 0);
  const q = e.map(([, w]) => Math.round((w / s) * 255)); q[0] += 255 - q.reduce((a, b) => a + b, 0); e.forEach(([g], k) => { SKI[u * 4 + k] = BI[g]; SKW[u * 4 + k] = q[k]; }); }

// ---------------------------------------------------------------- per-vertex feature masks (on the averaged female shape)
const maskFrom = (list, pow = 1) => { const m = new Float64Array(NU); for (const t of list) for (const [vi, x, y, z] of loadTarget(t)) { const u = UIDX.get(vi); if (u !== undefined) m[u] = Math.max(m[u], Math.hypot(x, y, z)); } let mx = 0; for (const v of m) mx = Math.max(mx, v); return Uint8Array.from(m, (v) => Math.round(Math.pow(v / (mx || 1), pow) * 255)); };
const MASKS = {
  lips: maskFrom(['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-lowerlip-volume-incr']),
  lids: maskFrom(['expression/units/caucasian/eye-left-closure', 'expression/units/caucasian/eye-right-closure']),
  brows: maskFrom(['eyebrows/eyebrows-trans-up']),
  nose: maskFrom(['nose/nose-scale-horiz-incr', 'nose/nose-scale-vert-incr']),
  ears: maskFrom(['ears/l-ear-scale-incr', 'ears/r-ear-scale-incr']),
  cheeks: maskFrom(['cheek/l-cheek-volume-incr', 'cheek/r-cheek-volume-incr'], 0.7),
  bust: Uint8Array.from({ length: NU }, (_, u) => Math.round(Math.min(1, ((WSUM[u].get('breastL') || 0) + (WSUM[u].get('breastR') || 0)) / 0.6) * 255)),
};

// ---------------------------------------------------------------- expression morphs (shared; per-dancer scale at runtime)
const MORPHS = {
  blinkL: [['eye-left-closure', 1]], blinkR: [['eye-right-closure', 1]], jaw: [['mouth-open', 1]], smile: [['mouth-corner-puller', 1], ['mouth-elevation', 0.15]],
  browUp: [['eyebrows-left-up', 1], ['eyebrows-right-up', 1]], browDown: [['eyebrows-left-down', 1], ['eyebrows-right-down', 1]], browInner: [['eyebrows-left-inner-up', 1], ['eyebrows-right-inner-up', 1]],
  wide: [['eye-left-opened-up', 1], ['eye-right-opened-up', 1]], squint: [['eye-left-slit', 1], ['eye-right-slit', 1]], frown: [['mouth-depression', 1]], press: [['mouth-compression', 1]],
  pucker: [['mouth-pursing', 1]], sneer: [['nose-left-elevation', 1], ['nose-right-elevation', 1]], stretch: [['mouth-retraction', 1]],
};
const ETHM = { african: 0.25, asian: 0.27, caucasian: 0.48 };
const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
const morphs = {};
for (const [name, list] of Object.entries(MORPHS)) { const D = new Float64Array(NU * 3);
  for (const [u, uw] of list) for (const e of ETH) { const w = ETHM[e] * uw; for (const [vi, x, y, z] of loadTarget(`expression/units/${e}/${u}`)) { const k = UIDX.get(vi); if (k === undefined) continue; D[k * 3] += x * w; D[k * 3 + 1] += y * w; D[k * 3 + 2] += z * w; } }
  const ids = [], dq = []; for (let i = 0; i < NU; i++) { const x = D[i * 3] * 0.1, y = D[i * 3 + 1] * 0.1, z = D[i * 3 + 2] * 0.1; if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 2e-5) { ids.push(i); dq.push(...[x, y, z].map((v) => Math.max(-32767, Math.min(32767, Math.round(v / 2e-6))))); } }
  morphs[name] = { i: b64(Uint16Array.from(ids)), d: b64(Int16Array.from(dq)) }; }

// ---------------------------------------------------------------- math helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const t = scl(crs(q, v), 2); return add(add(v, scl(t, q[3])), crs(q, t)); };
const qaxis = (ax, a) => { const s = Math.sin(a / 2), n = nrm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)]; };
const qfromTo = (a, b) => { a = nrm(a); b = nrm(b); const c = dot(a, b); if (c > 1 - 1e-9) return [0, 0, 0, 1]; if (c < -1 + 1e-9) return qaxis(Math.abs(a[0]) < 0.9 ? crs(a, [1, 0, 0]) : crs(a, [0, 1, 0]), Math.PI); const x = crs(a, b); const q = [x[0], x[1], x[2], 1 + c]; const l = Math.hypot(...q); return q.map((v) => v / l); };
const qtwist = (q, axis) => { const p = scl(axis, dot([q[0], q[1], q[2]], axis)); const t = [p[0], p[1], p[2], q[3]]; const l = Math.hypot(...t) || 1; return t.map((v) => v / l); };

// ---------------------------------------------------------------- bake each dancer
const ORDER = []; { const seen = new Set(); const visit = (n) => { if (seen.has(n)) return; const p = RIG[n].parent; if (p && RIG[p]) visit(p); seen.add(n); ORDER.push(n); }; for (const n of Object.keys(RIG)) visit(n); }
const out = { verts: NR, parts: ['skin', 'lashes', 'upperTeeth', 'lowerTeeth', 'tongue'], idx: tris.map((t) => b64(Uint16Array.from(t))), orig: b64(Uint16Array.from(ORIG.map((v) => UIDX.get(v)))),
  uv: b64(Float32Array.from(UVS)), nu: NU, bones: BONES, skinIndex: b64(SKI), skinWeight: b64(SKW), masks: {}, morphs, morphNames: Object.keys(MORPHS), dancers: {} };
for (const [k, m] of Object.entries(MASKS)) out.masks[k] = b64(m);
const unitCache = new Map();
for (const [id, D] of Object.entries(DANCERS)) {
  const P = Float64Array.from(B.P);
  for (const e of ETH) applyTarget(P, loadTarget(`macrodetails/${e}-female-young`), D.eth[e] || 0);
  for (const [u, w] of Object.entries(D.uni)) applyTarget(P, loadTarget(`macrodetails/universal-female-young-${u}`), w);
  const cupW = { mincup: D.cup[0], maxcup: D.cup[1] }, firmW = { minfirmness: D.firm[0], maxfirmness: D.firm[1] };
  for (const [c, cw] of Object.entries(cupW)) if (cw) applyTarget(P, loadTarget(`breast/female-young-averagemuscle-averageweight-${c}-averagefirmness`), cw);
  for (const [f, fw] of Object.entries(firmW)) if (fw) applyTarget(P, loadTarget(`breast/female-young-averagemuscle-averageweight-averagecup-${f}`), fw);
  for (const [t, w] of Object.entries(D.t)) if (w) applyTarget(P, loadTarget(t), w);
  // MakeHuman's default arms are short for these heights (wrist ≈ 7 cm above the crotch line; real arm ≈ 0.33·H shoulder→wrist):
  // lengthen upper and lower arm so the hands hang at mid-thigh and the pole grips are within reach
  for (const [t, w] of Object.entries(ARMS)) applyTarget(P, loadTarget(t), w);
  // ---- joints (MakeHuman space, decimetres) and the re-pose into the game rest pose
  const J0 = {}; for (const n of ORDER) J0[n] = { h: joint(P, RIG[n].head), t: joint(P, RIG[n].tail) };
  const G = {}; // bone → { q (global rotation), h (posed head) }
  const side = (n) => (/_l$/.test(n) ? 1 : /_r$/.test(n) ? -1 : 0);
  for (const n of ORDER) {
    const par = RIG[n].parent && G[RIG[n].parent] ? G[RIG[n].parent] : null; const r = J0[n];
    const h = par ? add(qrot(par.q, sub(r.h, J0[RIG[n].parent].h)), par.h) : r.h.slice();
    let q = par ? par.q.slice() : [0, 0, 0, 1]; const sx = side(n); const base = n.replace(/_(l|r)$/, '');
    const dirNow = () => nrm(qrot(q, sub(r.t, r.h)));
    if (base === 'upperarm') q = qmul(qfromTo(dirNow(), [sx * 0.13, -1, -0.03]), q);
    else if (base === 'lowerarm') q = qmul(qfromTo(dirNow(), [sx * 0.03, -1, 0.1]), q);
    else if (base === 'hand') { // fingers down (a touch forward), back of the hand facing out → palm toward the thigh, thumb forward
      q = qmul(qfromTo(dirNow(), [0, -1, 0.06]), q);
      const fd = nrm(qrot(q, sub(J0['middle_01' + n.slice(-2)].h, r.h))); const i2p = nrm(qrot(q, sub(J0['pinky_01' + n.slice(-2)].h, J0['index_01' + n.slice(-2)].h)));
      const back = nrm(scl(crs(fd, i2p), sx)); const want = nrm(sub([sx, 0, 0], scl(fd, dot([sx, 0, 0], fd)))); const bp = nrm(sub(back, scl(fd, dot(back, fd))));
      const ang = Math.atan2(dot(crs(bp, want), fd), dot(bp, want)); q = qmul(qaxis(fd, ang), q); D._roll = (D._roll || []).concat([+ang.toFixed(3)]); }
    else if (base === 'thigh') q = qmul(qfromTo(dirNow(), [sx * -0.01, -1, 0.0]), q);
    else if (base === 'calf') q = qmul(qfromTo(dirNow(), [0, -1, -0.035]), q);
    else if (base === 'foot') q = [0, 0, 0, 1]; // the foot keeps its own (flat) orientation
    else if (base === 'ball') q = qaxis([1, 0, 0], -HEEL.pitch); // toes flexed up by the heel pitch (flat on the platform when worn)
    G[n] = { q, h };
  }
  // dual-quaternion skinning of every used vertex with MakeHuman's weights
  const bw = Array.from({ length: NU }, () => []); for (const [mb, list] of Object.entries(RIGW)) for (const [vi, w] of list) { const u = UIDX.get(vi); if (u !== undefined && w > 1e-4) bw[u].push([mb, w]); }
  const dqOf = {}; for (const n of ORDER) { const { q, h } = G[n]; const t = sub(h, qrot(q, J0[n].h)); const d = qmul([t[0], t[1], t[2], 0], q).map((x) => x * 0.5); dqOf[n] = [q, d]; }
  const PP = new Float64Array(NU * 3);
  for (let u = 0; u < NU; u++) { const v = USED[u]; const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; let L = bw[u]; if (!L.length) L = [['head', 1]];
    let r0 = [0, 0, 0, 0], d0 = [0, 0, 0, 0]; const ref = dqOf[L[0][0]][0];
    for (const [mb, w] of L) { const [q, d] = dqOf[mb]; const s = (q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3]) < 0 ? -w : w; for (let k = 0; k < 4; k++) { r0[k] += q[k] * s; d0[k] += d[k] * s; } }
    const l = Math.hypot(...r0); r0 = r0.map((x) => x / l); d0 = d0.map((x) => x / l);
    const t = scl(qmul(d0, [-r0[0], -r0[1], -r0[2], r0[3]]), 2); const pr = add(qrot(r0, p), [t[0], t[1], t[2]]); PP.set(pr, u * 3); }
  // ---- metres, feet on the ground, hips over the origin; uniform scale to the dancer's height
  let ymin = 1e9, ymax = -1e9; for (let u = 0; u < NU; u++) { if (groupOf[USED[u]] !== 'body') continue; ymin = Math.min(ymin, PP[u * 3 + 1]); ymax = Math.max(ymax, PP[u * 3 + 1]); }
  const k = D.height / (ymax - ymin); const pel = G.pelvis.h; const O = [0, ymin, pel[2]];
  const toM = (p) => [(p[0] - O[0]) * k, (p[1] - O[1]) * k, (p[2] - O[2]) * k];
  const POS = new Float32Array(NU * 3); for (let u = 0; u < NU; u++) POS.set(toM([PP[u * 3], PP[u * 3 + 1], PP[u * 3 + 2]]), u * 3);
  // ---- game joints
  const jh = (n) => toM(G[n].h); const J = {};
  J.hips = jh('pelvis'); J.spine = jh('spine_02'); J.chest = jh('spine_03'); J.neck = jh('neck_01'); J.head = jh('head');
  for (const [S, s] of [['L', 'l'], ['R', 'r']]) { J['sh' + S] = jh('clavicle_' + s); J['arm' + S] = jh('upperarm_' + s); J['fore' + S] = jh('lowerarm_' + s); J['hand' + S] = jh('hand_' + s);
    J['thigh' + S] = jh('thigh_' + s); J['shin' + S] = jh('calf_' + s); J['foot' + S] = jh('foot_' + s); J['toe' + S] = jh('ball_' + s);
    for (const [mf, gf] of Object.entries(FINGERS)) for (let j = 1; j <= 3; j++) J[gf + j + S] = jh(`${mf}_0${j}_${s}`); }
  // breast bones: at the base of each breast on the chest wall (weighted centroid of the bust, pushed back to the ribs)
  for (const S of ['L', 'R']) { let x = 0, y = 0, z = 0, ws = 0, zmax = -1e9; for (let u = 0; u < NU; u++) { const w = WSUM[u].get('breast' + S) || 0; if (w < 0.25) continue; x += POS[u * 3] * w; y += POS[u * 3 + 1] * w; z += POS[u * 3 + 2] * w; ws += w; zmax = Math.max(zmax, POS[u * 3 + 2]); }
    J['breast' + S] = [x / ws, y / ws, z / ws - 0.035]; J['_bustTip' + S] = [x / ws, y / ws, zmax]; }
  // garment hinges, as the crowd skeleton has them (unused by the dancers' cloth, kept so every shared bone exists)
  const s = D.height / 1.72; J.skirtF = [0, J.thighL[1], 0.12]; J.skirtB = [0, J.thighL[1], -0.12]; J.skirtF2 = [0, 0.5 * s, 0.15]; J.skirtB2 = [0, 0.5 * s, -0.15];
  // ---- landmarks
  const eyeC = (g) => { let x = 0, y = 0, z = 0, n = 0; for (let u = 0; u < NU; u++) if (groupOf[USED[u]] === g) { x += POS[u * 3]; y += POS[u * 3 + 1]; z += POS[u * 3 + 2]; n++; } if (n) return [x / n, y / n, z / n];
    let a = [0, 0, 0]; const vs = [...new Set(B.F.filter((f) => f.g === g).flatMap((f) => f.v))]; for (const v of vs) a = add(a, toM(qrot([0, 0, 0, 1], [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]))); return scl(a, 1 / vs.length); };
  const eyeR = (g, c) => { const vs = [...new Set(B.F.filter((f) => f.g === g).flatMap((f) => f.v))]; const d = vs.map((v) => Math.hypot(...sub(toM([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]), c))).sort((a, b) => a - b); return d[d.length >> 1]; };
  const eL = eyeC('helper-l-eye'), eR = eyeC('helper-r-eye'); const er = eyeR('helper-l-eye', eL);
  // ankle / ball / sole for the heels: sole = lowest foot point; ball contact under the ball joint
  const L = { eyeL: eL, eyeR: eR, eyeRad: er, k, height: D.height };
  let crown = -1e9; for (let u = 0; u < NU; u++) if (groupOf[USED[u]] === 'body') crown = Math.max(crown, POS[u * 3 + 1]); L.crown = crown;
  // waist (narrowest torso circumference between under-bust and hips) / under-bust (lowest bust point) / hip line
  const ringW = (y) => { let x0 = 1e9, x1 = -1e9; for (let u = 0; u < NU; u++) { const p = [POS[u * 3], POS[u * 3 + 1], POS[u * 3 + 2]]; if (Math.abs(p[1] - y) > 0.006 || groupOf[USED[u]] !== 'body' || Math.abs(p[0]) > 0.22) continue; const W = WSUM[u]; if ((W.get('armL') || 0) + (W.get('armR') || 0) + (W.get('foreL') || 0) + (W.get('foreR') || 0) + (W.get('handL') || 0) + (W.get('handR') || 0) > 0.2) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); } return x1 - x0; };
  let waistY = 0, wmin = 1e9; for (let y = J.hips[1] + 0.06; y < J.chest[1]; y += 0.004) { const w = ringW(y); if (w < wmin) { wmin = w; waistY = y; } } L.waistY = waistY; L.waistW = wmin;
  let ubY = 1e9; for (let u = 0; u < NU; u++) { if ((WSUM[u].get('breastL') || 0) + (WSUM[u].get('breastR') || 0) > 0.12) ubY = Math.min(ubY, POS[u * 3 + 1]); } L.underBustY = ubY;
  L.bustTip = [J._bustTipL, J._bustTipR]; delete J._bustTipL; delete J._bustTipR;
  // heel fit: the ball contact on the sole (under the ball joint), the heel point, in the flat-foot (rest) frame
  for (const S of ['L']) { const ft = J['foot' + S], ball = J['toe' + S]; let sole = 1e9; for (let u = 0; u < NU; u++) { const W = WSUM[u]; if ((W.get('foot' + S) || 0) + (W.get('toe' + S) || 0) < 0.5) continue; sole = Math.min(sole, POS[u * 3 + 1]); }
    let heelZ = 1e9; for (let u = 0; u < NU; u++) { const W = WSUM[u]; if ((W.get('foot' + S) || 0) < 0.6 || POS[u * 3 + 1] > sole + 0.02) continue; heelZ = Math.min(heelZ, POS[u * 3 + 2]); }
    const c = Math.cos(HEEL.pitch), sn = Math.sin(HEEL.pitch); const ballP = [0, sole - HEEL.plat - ft[1], ball[2] - ft[2]]; // contact under the platform, relative to the ankle (flat frame)
    const rot = (y, z) => [y * c - z * sn, y * sn + z * c]; const b = rot(ballP[1], ballP[2]); const ht = [sole - ft[1] + 0.004, heelZ - ft[2] + 0.012]; const h = rot(ht[0], ht[1]);
    L.heel = { pitch: HEEL.pitch, plat: HEEL.plat, ball: ballP, ankleH: -b[0], sole, heelTop: ht, heelLen: h[0] - b[0], dir: [-c, sn], ballZ: ball[2], heelZ }; }
  // morph deltas were stored in metres for a decimetre → metre factor of 0.1; this dancer's factor is k
  const q = 2.0 / 32767; const pos16 = Int16Array.from(POS, (v) => Math.max(-32767, Math.min(32767, Math.round(v / q)))); // ±2 m at 0.06 mm
  const rnd = (a) => a.map((v) => +v.toFixed(5));
  out.dancers[id] = { pos: b64(pos16), q, morphK: +(k / 0.1).toFixed(5), joints: Object.fromEntries(Object.entries(J).map(([n, p]) => [n, rnd(p)])),
    L: { ...L, eyeL: rnd(eL), eyeR: rnd(eR), bustTip: L.bustTip.map(rnd) } };
  console.log(id, 'k', k.toFixed(4), 'hips', rnd(J.hips), 'waist', waistY.toFixed(3), (wmin * 100).toFixed(1) + 'cm', 'underbust', ubY.toFixed(3), 'bustTip z', L.bustTip[0][2].toFixed(3), 'hand roll', D._roll, 'heel', JSON.stringify(rnd([L.heel.ankleH, L.heel.heelLen])));
}
const src = `// GENERATED by tools/mh/bake-dancers.mjs — do not edit by hand.\n// Club dancer bodies derived from the MakeHuman base mesh, targets, rig and skin weights (CC0 1.0, makehumancommunity/mpfb2).\nexport default ${JSON.stringify(out)};\n`;
fs.writeFileSync(OUT, src);
console.log('render verts', NR, 'orig', NU, 'tris', tris.map((t) => t.length / 3), 'bones', BONES.length, 'bytes', src.length);
