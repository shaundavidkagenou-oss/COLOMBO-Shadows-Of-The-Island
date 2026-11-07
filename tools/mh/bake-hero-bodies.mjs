// Offline bake: the three protagonists' BODIES (Dineth, Shashika, David) as one continuous anatomical surface from the CC0
// MakeHuman base mesh — torso, shoulders, arms, real hands with jointed fingers, legs — shaped with MakeHuman's male macro
// targets (the same South-Asian ethnic blend and muscle / weight mix as each hero's baked head, so the neck and skin
// match) plus per-hero body targets (V-taper, pectorals, deltoids, forearm / calf muscle, waist).
//   node tools/mh/fetch-makehuman.mjs && node tools/mh/bake-hero-bodies.mjs   →   src/actors/heroBodyData.js
//
// Unlike the club dancers (who get their own skeleton), the body is FITTED TO THE EXISTING 70-BONE HERO SKELETON: every
// MakeHuman bone segment (upper arm, forearm, each finger phalanx, thigh, shin, foot) is mapped onto the matching game
// joint → child joint segment, and the torso onto the game hips / shoulder heights and widths. Weapon grips, seat fits, IK,
// ragdolls and every animation keep working unchanged; only the skin on the bones becomes anatomical.
// The head is NOT part of this bake (HeroHead.js owns it); the neck stops inside the collar and is conformed to the head's
// neck at runtime (HeroBody.js). Only CC0 data is used — no MakeHuman / MPFB program code.
import fs from 'node:fs';
import path from 'node:path';
import '../node-dom-stub.mjs';
import { CACHE, loadBase, loadTarget, applyTarget } from './mhlib.mjs';
const { HEROES, joints } = await import('../../src/actors/Character.js');
const { heroJoints, fingerLayout } = await import('../../src/actors/HeroRig.js');

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/actors/heroBodyData.js');
const B = loadBase(); const NV = B.P.length / 3;
const RIG = JSON.parse(fs.readFileSync(path.join(CACHE, 'rigs/standard/rig.game_engine_with_breast.json'), 'utf8'));
const RIGW = JSON.parse(fs.readFileSync(path.join(CACHE, 'rigs/standard/weights.game_engine_with_breast.json'), 'utf8')).weights;
const ETH = ['african', 'asian', 'caucasian'];

// ---------------------------------------------------------------- body shapes (eth / uni identical to bake-hero-heads.mjs)
const SHAPES = {
  dineth: { eth: { african: 0.3, asian: 0.14, caucasian: 0.56 }, uni: { 'averagemuscle-averageweight': 0.45, 'averagemuscle-minweight': 0.25, 'maxmuscle-minweight': 0.3 },
    t: { 'torso/torso-vshape-incr': 0.3, 'torso/torso-muscle-pectoral-incr': 0.25, 'torso/measure-waist-circ-decr': 0.2, 'stomach/stomach-pregnant-decr': 0.35,
      'arms/l-upperarm-muscle-incr': 0.35, 'arms/r-upperarm-muscle-incr': 0.35, 'arms/l-lowerarm-muscle-incr': 0.3, 'arms/r-lowerarm-muscle-incr': 0.3,
      'arms/l-upperarm-shoulder-muscle-incr': 0.25, 'arms/r-upperarm-shoulder-muscle-incr': 0.25, 'legs/l-lowerleg-muscle-incr': 0.25, 'legs/r-lowerleg-muscle-incr': 0.25,
      'neck/neck-scale-horiz-decr': 0.1 } },
  shashika: { eth: { african: 0.4, asian: 0.08, caucasian: 0.52 }, uni: { 'maxmuscle-averageweight': 0.75, 'averagemuscle-averageweight': 0.25 },
    t: { 'torso/torso-vshape-incr': 0.45, 'torso/torso-muscle-pectoral-incr': 0.5, 'torso/torso-muscle-dorsi-incr': 0.45, 'arms/measure-upperarm-circ-incr': 0.35,
      'arms/l-upperarm-muscle-incr': 0.6, 'arms/r-upperarm-muscle-incr': 0.6, 'arms/l-lowerarm-muscle-incr': 0.55, 'arms/r-lowerarm-muscle-incr': 0.55,
      'arms/l-upperarm-shoulder-muscle-incr': 0.55, 'arms/r-upperarm-shoulder-muscle-incr': 0.55, 'legs/measure-thigh-circ-incr': 0.3, 'legs/measure-calf-circ-incr': 0.3,
      'hands/measure-wrist-circ-incr': 0.3, 'neck/measure-neck-circ-incr': 0.6, 'neck/neck-scale-horiz-incr': 0.35 } },
  david: { eth: { african: 0.24, asian: 0.18, caucasian: 0.58 }, uni: { 'averagemuscle-averageweight': 0.75, 'averagemuscle-minweight': 0.25 },
    t: { 'torso/measure-waist-circ-decr': 0.1, 'torso/torso-vshape-incr': 0.1, 'arms/l-lowerarm-muscle-incr': 0.15, 'arms/r-lowerarm-muscle-incr': 0.15,
      'hands/l-hand-fingers-length-incr': 0.2, 'hands/r-hand-fingers-length-incr': 0.2 } },
};

// ---------------------------------------------------------------- topology: the 'body' group minus the head
const groupOf = new Array(NV).fill(''); for (const f of B.F) for (const v of f.v) if (!groupOf[v] || groupOf[v].startsWith('joint')) groupOf[v] = f.g;
const headW = new Float64Array(NV); for (const [mb, list] of Object.entries(RIGW)) if (mb === 'head') for (const [vi, w] of list) headW[vi] += w;
const faces = B.F.filter((f) => f.g === 'body' && !f.v.every((v) => headW[v] > 0.6));
const USED = [...new Set(faces.flatMap((f) => f.v))].sort((a, b) => a - b); const UIDX = new Map(USED.map((v, i) => [v, i])); const NU = USED.length;
const P0 = Float64Array.from(B.P); for (const e of ETH) applyTarget(P0, loadTarget(`macrodetails/${e}-male-young`), 1 / 3); applyTarget(P0, loadTarget('macrodetails/universal-male-young-averagemuscle-averageweight'), 1);
const TRI = [];
for (const f of faces) { const ids = f.v.map((v) => UIDX.get(v)); if (ids.length === 3) { TRI.push(...ids); continue; }
  const d = (a, b) => Math.hypot(P0[f.v[a] * 3] - P0[f.v[b] * 3], P0[f.v[a] * 3 + 1] - P0[f.v[b] * 3 + 1], P0[f.v[a] * 3 + 2] - P0[f.v[b] * 3 + 2]);
  if (d(0, 2) <= d(1, 3)) TRI.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]); else TRI.push(ids[0], ids[1], ids[3], ids[1], ids[2], ids[3]); }

// ---------------------------------------------------------------- weights folded onto the hero skeleton
const FINGERS = { index: 'idx', middle: 'mid', ring: 'rng', pinky: 'pnk', thumb: 'thb' };
const fold = (mb) => { const m = /^(.*)_(l|r)$/.exec(mb); const S = m ? m[2].toUpperCase() : ''; const base = m ? m[1] : mb;
  if (mb === 'pelvis' || mb === 'Root') return 'hips'; if (mb === 'spine_01') return 'spine01'; if (mb === 'spine_02') return 'spine02'; if (mb === 'spine_03') return 'chest';
  if (mb === 'neck_01') return 'neck'; if (mb === 'head') return 'head';
  if (base === 'clavicle') return 'sh' + S; if (base === 'upperarm') return 'arm' + S; if (base === 'lowerarm') return 'fore' + S; if (base === 'hand') return 'hand' + S;
  if (base === 'thigh') return 'thigh' + S; if (base === 'calf') return 'shin' + S; if (base === 'foot') return 'foot' + S; if (base === 'ball') return 'toe' + S;
  if (base === 'breast') return 'chest';
  const fm = /^(index|middle|ring|pinky|thumb)_0([123])$/.exec(base); if (fm) return FINGERS[fm[1]] + fm[2] + S;
  throw new Error('unmapped bone ' + mb); };
const MW = Array.from({ length: NU }, () => []); // [[mhBone, w]]
for (const [mb, list] of Object.entries(RIGW)) for (const [vi, w] of list) { const u = UIDX.get(vi); if (u !== undefined && w > 1e-4) MW[u].push([mb, w]); }
for (const L of MW) if (!L.length) L.push(['neck_01', 1]);

// ---------------------------------------------------------------- math
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]); const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t; const clamp = (x, a, b) => Math.max(a, Math.min(b, x)); const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const t = scl(crs(q, v), 2); return add(add(v, scl(t, q[3])), crs(q, t)); };
const qaxis = (ax, a) => { const s = Math.sin(a / 2), n = nrm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)]; };
const qfromTo = (a, b) => { a = nrm(a); b = nrm(b); const c = dot(a, b); if (c > 1 - 1e-9) return [0, 0, 0, 1]; if (c < -1 + 1e-9) return qaxis(Math.abs(a[0]) < 0.9 ? crs(a, [1, 0, 0]) : crs(a, [0, 1, 0]), Math.PI);
  const x = crs(a, b); const q = [x[0], x[1], x[2], 1 + c]; const l = Math.hypot(...q); return q.map((v) => v / l); };
const cubeC = new Map(); const cubeVerts = (name) => { if (!cubeC.has(name)) { const s = new Set(); for (const f of B.F) if (f.g === name) for (const v of f.v) s.add(v); cubeC.set(name, [...s]); } return cubeC.get(name); };
const joint = (P, spec) => { if (spec.strategy === 'CUBE') { let x = 0, y = 0, z = 0, n = 0; for (const v of cubeVerts(spec.cube_name)) { x += P[v * 3]; y += P[v * 3 + 1]; z += P[v * 3 + 2]; n++; } return [x / n, y / n, z / n]; }
  if (spec.strategy === 'VERTEX') { const v = spec.vertex_index; return [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; }
  if (spec.strategy === 'MEAN') { let x = 0, y = 0, z = 0; for (const v of spec.vertex_indices) { x += P[v * 3]; y += P[v * 3 + 1]; z += P[v * 3 + 2]; } const n = spec.vertex_indices.length; return [x / n, y / n, z / n]; }
  const d = spec.default_position; return [d[0] * 10, d[2] * 10, -d[1] * 10]; };
const ORDER = []; { const seen = new Set(); const visit = (n) => { if (seen.has(n)) return; const p = RIG[n].parent; if (p && RIG[p]) visit(p); seen.add(n); ORDER.push(n); }; for (const n of Object.keys(RIG)) visit(n); }
const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');

// ---------------------------------------------------------------- bake
const out = { nu: NU, idx: b64(Uint16Array.from(TRI)), heroes: {} };
let weightsDone = false;
for (const [id, D] of Object.entries(SHAPES)) {
  const sp = HEROES[id];
  const P = Float64Array.from(B.P);
  for (const e of ETH) applyTarget(P, loadTarget(`macrodetails/${e}-male-young`), D.eth[e] || 0);
  for (const [u, w] of Object.entries(D.uni)) applyTarget(P, loadTarget(`macrodetails/universal-male-young-${u}`), w);
  for (const [t, w] of Object.entries(D.t)) if (w) applyTarget(P, loadTarget(t), w);
  // ---- re-pose from the A-pose into the hero rest pose (arms hanging, palms to the thighs, thumbs forward, feet flat)
  const J0 = {}; for (const n of ORDER) J0[n] = { h: joint(P, RIG[n].head), t: joint(P, RIG[n].tail) };
  const G = {}; const side = (n) => (/_l$/.test(n) ? 1 : /_r$/.test(n) ? -1 : 0);
  for (const n of ORDER) {
    const par = RIG[n].parent && G[RIG[n].parent] ? G[RIG[n].parent] : null; const r = J0[n];
    const h = par ? add(qrot(par.q, sub(r.h, J0[RIG[n].parent].h)), par.h) : r.h.slice();
    let q = par ? par.q.slice() : [0, 0, 0, 1]; const sx = side(n); const base = n.replace(/_(l|r)$/, '');
    const dirNow = () => nrm(qrot(q, sub(r.t, r.h)));
    if (base === 'upperarm') q = qmul(qfromTo(dirNow(), [sx * 0.13, -1, -0.03]), q);
    else if (base === 'lowerarm') q = qmul(qfromTo(dirNow(), [sx * 0.05, -1, 0.04]), q);
    else if (base === 'hand') { q = qmul(qfromTo(dirNow(), [0, -1, 0.06]), q);
      const fd = nrm(qrot(q, sub(J0['middle_01' + n.slice(-2)].h, r.h))); const i2p = nrm(qrot(q, sub(J0['pinky_01' + n.slice(-2)].h, J0['index_01' + n.slice(-2)].h)));
      const back = nrm(scl(crs(fd, i2p), sx)); const want = nrm(sub([sx, 0, 0], scl(fd, dot([sx, 0, 0], fd)))); const bp = nrm(sub(back, scl(fd, dot(back, fd))));
      const ang = Math.atan2(dot(crs(bp, want), fd), dot(bp, want)); q = qmul(qaxis(fd, ang), q); }
    else if (base === 'thigh') q = qmul(qfromTo(dirNow(), [sx * -0.01, -1, 0.0]), q);
    else if (base === 'calf') q = qmul(qfromTo(dirNow(), [0, -1, -0.035]), q);
    else if (base === 'foot' || base === 'ball') q = [0, 0, 0, 1];
    G[n] = { q, h };
  }
  const posed = (n, p) => add(G[n].h, qrot(G[n].q, sub(p, J0[n].h)));
  const dqOf = {}; for (const n of ORDER) { const { q, h } = G[n]; const t = sub(h, qrot(q, J0[n].h)); dqOf[n] = [q, qmul([t[0], t[1], t[2], 0], q).map((x) => x * 0.5)]; }
  const PP = new Float64Array(NU * 3);
  for (let u = 0; u < NU; u++) { const v = USED[u]; const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; const L = MW[u];
    let r0 = [0, 0, 0, 0], d0 = [0, 0, 0, 0]; const ref = dqOf[L[0][0]][0];
    for (const [mb, w] of L) { const [q, d] = dqOf[mb]; const sg = (q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3]) < 0 ? -w : w; for (let k = 0; k < 4; k++) { r0[k] += q[k] * sg; d0[k] += d[k] * sg; } }
    const l = Math.hypot(...r0); r0 = r0.map((x) => x / l); d0 = d0.map((x) => x / l);
    const t = scl(qmul(d0, [-r0[0], -r0[1], -r0[2], r0[3]]), 2); PP.set(add(qrot(r0, p), [t[0], t[1], t[2]]), u * 3); }
  // ---- metres: soles on the ground, pelvis over the origin, uniform scale to the hero's height (crown estimated from the
  // full-mesh head top so the cut neck does not change the scale)
  let ymin = 1e9, ymax = -1e9; for (let v = 0; v < NV; v++) { if (groupOf[v] !== 'body') continue; ymin = Math.min(ymin, P[v * 3 + 1]); }
  for (let v = 0; v < NV; v++) if (groupOf[v] === 'body') ymax = Math.max(ymax, P[v * 3 + 1]); // A-pose: the head is not re-posed, so its top is unchanged
  for (let u = 0; u < NU; u++) ymin = Math.min(ymin, PP[u * 3 + 1]);
  const k = sp.height / (ymax - ymin); const pel = G.pelvis.h; const O = [0, ymin, pel[2]];
  const toM = (p) => [(p[0] - O[0]) * k, (p[1] - O[1]) * k, (p[2] - O[2]) * k];
  // ---- MakeHuman joints in metres (posed) and the game joints they must land on
  const MJ = {}; for (const n of ORDER) MJ[n] = { h: toM(G[n].h), t: toM(posed(n, J0[n].t)) };
  const GJ = joints(sp); Object.assign(GJ, heroJoints(sp, GJ));
  for (const S of ['L', 'R']) { const F = fingerLayout(sp, S, GJ); for (const f of F.fingers) GJ[f.name + 'Tip' + S] = f.joints[3]; GJ['thbTip' + S] = F.thumb[3]; }
  // the game palm (wrist joint → middle knuckle ≈ 6.4 cm) is much shorter than a real one (≈ 9.5 cm): the skin's wrist crease
  // sits 3 cm up the forearm from the pivot, so the palm keeps ~82 % of its length (forearm ~84 %) instead of being squashed into a paw
  for (const S of ['L', 'R']) { const h = GJ['hand' + S], f = GJ['fore' + S]; const d = nrm(sub(f, h)); GJ['wrist' + S] = add(h, scl(d, 0.03)); }
  // per-bone fit: limb segments map head→head, tail→tail (rotation + axial stretch, girth kept); the torso maps by height
  // (hips line → game hips joint height, shoulder joints → game shoulder height) and width (hip joints, shoulder joints)
  const tY0 = MJ.thigh_l.h[1], tY1 = MJ.upperarm_l.h[1], gY0 = GJ.thighL[1], gY1 = GJ.armL[1];
  const sxHip = GJ.thighL[0] / MJ.thigh_l.h[0], sxSh = GJ.armL[0] / MJ.upperarm_l.h[0];
  const torso = (p) => { const t = (p[1] - tY0) / (tY1 - tY0); const y = lerp(gY0, gY1, t); const sx = lerp(sxHip, sxSh, sstep(0.15, 0.95, t)); const sz = 1 + (sx - 1) * 0.45; return [p[0] * sx, y, p[2] * sz]; };
  const seg = {}; // mhBone → [game head, game tail]
  for (const [S, sl] of [['L', 'l'], ['R', 'r']]) {
    seg['upperarm_' + sl] = ['arm' + S, 'fore' + S]; seg['lowerarm_' + sl] = ['fore' + S, 'wrist' + S]; seg['hand_' + sl] = ['wrist' + S, 'mid1' + S];
    seg['thigh_' + sl] = ['thigh' + S, 'shin' + S]; seg['calf_' + sl] = ['shin' + S, 'foot' + S]; seg['foot_' + sl] = ['foot' + S, 'toe' + S];
    for (const [mf, gf] of Object.entries(FINGERS)) for (let j = 1; j <= 3; j++) seg[`${mf}_0${j}_${sl}`] = [gf + j + S, j < 3 ? gf + (j + 1) + S : gf + 'Tip' + S];
  }
  const fitOf = {};
  for (const n of ORDER) {
    const sg = seg[n];
    if (!sg) { if (/^ball_/.test(n)) { const ft = seg['foot_' + n.slice(-1)]; fitOf[n] = { ref: 'foot_' + n.slice(-1) }; void ft; } else fitOf[n] = { torso: true }; continue; }
    // MakeHuman's hand bone ends a few cm past the wrist: measure the palm to the middle knuckle instead (else it stretches ×2.4)
    const mh = MJ[n].h, mt = /^hand_/.test(n) ? MJ['middle_01_' + n.slice(-1)].h : MJ[n].t, A = GJ[sg[0]], Bt = GJ[sg[1]]; const dm = sub(mt, mh), dg = sub(Bt, A);
    // palm-side soft tissue (palm pad, finger pads) is fitted to the grip solver's skin model (GripSolver PALM_X 17.5–19 mm,
    // finger half-thickness ≈ r0): measured below, squeezed on the palm side only — the back of the hand stays anatomical
    const palm = /^hand_|^(index|middle|ring|pinky)_0[123]_/.test(n) ? nrm(sub([n.endsWith('_l') ? -1 : 1, 0, 0], scl(nrm(dm), dot([n.endsWith('_l') ? -1 : 1, 0, 0], nrm(dm))))) : null;
    fitOf[n] = { mh, u: nrm(dm), a: len(dg) / len(dm), R: qfromTo(dm, dg), A, palm };
  }
  for (const n of ORDER) if (fitOf[n].ref) fitOf[n] = fitOf[fitOf[n].ref];
  // finger girth = the grip solver's finger radius (fingerLayout r0, tapering 9 % per segment; thumb as in the old build):
  // the MakeHuman male fingers come out chunkier, which buried them in every grip tuned on the solver's stick model
  { const R0 = { index: 0.0088, middle: 0.0091, ring: 0.0086, pinky: 0.0076 }; const TH = [0.0112, 0.0098, 0.0088];
    const toMp = (u) => toM([PP[u * 3], PP[u * 3 + 1], PP[u * 3 + 2]]); const RS = {};
    for (let u = 0; u < NU; u++) for (const [mb, w] of MW[u]) { if (w < 0.7 || !/^(index|middle|ring|pinky|thumb)_0[123]_/.test(mb)) continue; const f = fitOf[mb]; const d = sub(toMp(u), f.mh); const pr = dot(d, f.u); const r = len(sub(d, scl(f.u, pr))); (RS[mb] = RS[mb] || []).push(r); }
    for (const [mb, rs] of Object.entries(RS)) { rs.sort((a, b) => a - b); const med = rs[rs.length >> 1]; const m = /^(\w+)_0([123])_/.exec(mb); const j = +m[2] - 1;
      const want = (m[1] === 'thumb' ? TH[j] : R0[m[1]] * (1 - 0.09 * (j + 0.5))) * 1.05; fitOf[mb].rad = clamp(want / med, 0.7, 1.0); }
    for (const n of Object.keys(fitOf)) { const f = fitOf[n]; if (!f.palm || !n.endsWith(n.endsWith('_l') ? '_l' : '_r')) continue; const cs = [];
      for (let u = 0; u < NU; u++) for (const [mb, w] of MW[u]) { if (mb !== n || w < 0.7) continue; const d = sub(toMp(u), f.mh); const perp = scl(sub(d, scl(f.u, dot(d, f.u))), f.rad || 1); cs.push(dot(perp, f.palm)); }
      if (cs.length < 5) continue; cs.sort((a, b) => a - b); const p95 = cs[Math.floor(cs.length * 0.95)]; const m = /^(index|middle|ring|pinky)_0([123])_/.exec(n);
      const T = m ? R0[m[1]] * (1 - 0.09 * (+m[2] - 0.5)) * 0.98 : 0.0172; f.palmK = clamp(T / Math.max(p95, 1e-4), 0.55, 1); }
    if (process.env.DBG && id === 'dineth') console.log('palm squeeze', Object.entries(fitOf).filter(([n, f]) => f.palmK && n.endsWith('_l')).map(([n, f]) => n.replace('_l', '') + ':' + f.palmK.toFixed(2)).join(' '));
    if (process.env.DBG && id === 'dineth') console.log('finger radial', Object.entries(fitOf).filter(([n, f]) => f.rad && n.endsWith('_l')).map(([n, f]) => n.replace('_l', '') + ':' + f.rad.toFixed(2)).join(' ')); }
  const applyFit = (f, p) => { if (f.torso) return torso(p); const d = sub(p, f.mh); const pr = dot(d, f.u); let perp = sub(d, scl(f.u, pr)); if (f.rad) perp = scl(perp, f.rad); if (f.palm) { const c = dot(perp, f.palm); if (c > 0) perp = sub(perp, scl(f.palm, c * (1 - (f.palmK ?? 0.7)))); } return add(f.A, qrot(f.R, add(scl(f.u, pr * f.a), perp))); };
  const POS = new Float32Array(NU * 3);
  if (process.env.DBG && id === 'dineth') { const r3 = (v) => v.map((x) => +x.toFixed(3)); for (const n of ['lowerarm_l', 'hand_l', 'index_01_l', 'index_02_l', 'index_03_l', 'thumb_01_l', 'thumb_03_l']) console.log(n, 'MH', r3(MJ[n].h), r3(MJ[n].t), 'fit', fitOf[n].A && r3(fitOf[n].A), 'a', fitOf[n].a && fitOf[n].a.toFixed(2)); }
  for (let u = 0; u < NU; u++) { const p = toM([PP[u * 3], PP[u * 3 + 1], PP[u * 3 + 2]]); let acc = [0, 0, 0], ws = 0;
    for (const [mb, w] of MW[u]) { acc = add(acc, scl(applyFit(fitOf[mb], p), w)); ws += w; } POS.set(scl(acc, 1 / ws), u * 3); }
  if (process.env.DBG && id === 'dineth') { let worst = -1, wy = 9; for (let u = 0; u < NU; u++) { if (POS[u * 3] < 0.15) continue; if (POS[u * 3 + 1] < wy && MW[u].some(([m]) => m === 'hand_l')) { wy = POS[u * 3 + 1]; worst = u; } }
    const p = toM([PP[worst * 3], PP[worst * 3 + 1], PP[worst * 3 + 2]]); console.log('lowest hand_l vert', worst, 'y', wy.toFixed(3), 'mh pos', p.map((x) => +x.toFixed(3)), JSON.stringify(MW[worst].map(([m, w]) => [m, +w.toFixed(2)]))); }
  // ---- weights (once; topology and MakeHuman weights are shared): fold, then split the arm / forearm onto the twist bones
  // by position along the game segment (as the old build did: mid upper arm 30 % twist, wrist fully on the forearm twist)
  if (!weightsDone) {
    const names = []; const NI = new Map(); const nameIdx = (nm) => { if (!NI.has(nm)) { NI.set(nm, names.length); names.push(nm); } return NI.get(nm); };
    const SKI = new Uint8Array(NU * 4), SKW = new Uint8Array(NU * 4);
    for (let u = 0; u < NU; u++) { const p = [POS[u * 3], POS[u * 3 + 1], POS[u * 3 + 2]]; const acc = new Map(); const put = (g, w) => acc.set(g, (acc.get(g) || 0) + w);
      for (const [mb, w] of MW[u]) { const g = fold(mb);
        if (g === 'spine01') { put('hips', w * 0.45); put('spine', w * 0.55); continue; } if (g === 'spine02') { put('spine', w * 0.7); put('chest', w * 0.3); continue; }
        const am = /^(arm|fore)([LR])$/.exec(g);
        if (am) { const S = am[2]; const A = GJ[am[1] === 'arm' ? 'arm' + S : 'fore' + S], Bt = GJ[am[1] === 'arm' ? 'fore' + S : 'hand' + S]; const d = sub(Bt, A); const t = clamp(dot(sub(p, A), d) / dot(d, d), 0, 1);
          const tw = am[1] === 'arm' ? 0.45 * sstep(0.15, 0.95, t) : sstep(0.05, 0.95, t); put(g, w * (1 - tw)); put((am[1] === 'arm' ? 'armTwist' : 'foreTwist') + S, w * tw); continue; }
        // skin behind a finger joint stays with the palm / previous phalanx (MakeHuman binds palm skin behind the knuckles
        // to the finger, which swung it through anything the hand grips once the fingers curl)
        const fg = /^(idx|mid|rng|pnk|thb)([123])([LR])$/.exec(g);
        if (fg) { const j = +fg[2]; const A = GJ[g], Bt = GJ[j < 3 ? fg[1] + (j + 1) + fg[3] : fg[1] + 'Tip' + fg[3]]; const sd = dot(sub(p, A), nrm(sub(Bt, A)));
          const mv = 0.85 * sstep(0.0, 0.01, -sd); if (mv > 0) { put(g, w * (1 - mv)); put(j === 1 ? 'hand' + fg[3] : fg[1] + (j - 1) + fg[3], w * mv); continue; } }
        put(g, w); }
      let e = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); const sm = e.reduce((a, b) => a + b[1], 0);
      const q = e.map(([, w]) => Math.round((w / sm) * 255)); q[0] += 255 - q.reduce((a, b) => a + b, 0); e.forEach(([g], j) => { SKI[u * 4 + j] = nameIdx(g); SKW[u * 4 + j] = q[j]; }); }
    out.bones = names; out.skinIndex = b64(SKI); out.skinWeight = b64(SKW);
    // nails: distal phalanx, last 45 % of the segment, on the back of the finger (the side facing away from the palm)
    const NAIL = new Uint8Array(NU);
    for (let u = 0; u < NU; u++) { let best = null, bw = 0; for (const [mb, w] of MW[u]) if (/_03_[lr]$/.test(mb) && w > bw) { bw = w; best = mb; } if (!best || bw < 0.5) continue;
      const S = best.endsWith('_l') ? 'L' : 'R'; const sx = S === 'L' ? 1 : -1; const [h0, t0] = seg[best].map((g) => GJ[g]); const d = sub(t0, h0); const p = [POS[u * 3], POS[u * 3 + 1], POS[u * 3 + 2]];
      const t = dot(sub(p, h0), d) / dot(d, d); if (t < 0.5) continue; const thumb = best.startsWith('thumb');
      const axis = nrm(d); const back = thumb ? nrm(sub([sx, 0, 0.35], scl(axis, dot([sx, 0, 0.35], axis)))) : nrm(sub([sx, 0, 0], scl(axis, dot([sx, 0, 0], axis))));
      const radial = sub(sub(p, h0), scl(axis, dot(sub(p, h0), axis))); const c = dot(nrm(radial), back); NAIL[u] = Math.round(clamp((c - 0.55) / 0.3, 0, 1) * sstep(0.5, 0.62, t) * 255); }
    out.nail = b64(NAIL); weightsDone = true;
  }
  const q = 2.0 / 32767; const pos16 = Int16Array.from(POS, (v) => Math.max(-32767, Math.min(32767, Math.round(v / q))));
  out.heroes[id] = { pos: b64(pos16), q, k: +k.toFixed(5) };
  const ext = (f) => { let lo = 1e9, hi = -1e9; for (let u = 0; u < NU; u++) { const v = f(u); if (v === null) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); } return [+lo.toFixed(3), +hi.toFixed(3)]; };
  console.log(id, 'k', k.toFixed(4), 'y', ext((u) => POS[u * 3 + 1]), 'x', ext((u) => POS[u * 3]), 'z', ext((u) => POS[u * 3 + 2]), 'hipsMH→game', MJ.thigh_l.h.map((v) => +v.toFixed(3)), GJ.thighL.map((v) => +v.toFixed(3)), 'sh', MJ.upperarm_l.h.map((v) => +v.toFixed(3)), GJ.armL.map((v) => +v.toFixed(3)));
}
const src = `// GENERATED by tools/mh/bake-hero-bodies.mjs — do not edit by hand.\n// Protagonist bodies derived from the MakeHuman base mesh, targets, rig and skin weights (CC0 1.0, makehumancommunity/mpfb2).\nexport default ${JSON.stringify(out)};\n`;
fs.writeFileSync(OUT, src);
console.log('verts', NU, 'tris', TRI.length / 3, 'bones', out.bones.length, out.bones.join(' '), 'bytes', src.length);
