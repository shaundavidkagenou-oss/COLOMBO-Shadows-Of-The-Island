// Motion-capture clips (src/anim/mocapData.js, built by tools/mocap/build.mjs from real CMU performances) and the layer
// that lays them over the procedural animator (Character.js Animator.update):
//   phase 'body' — hips, legs, spine, chest, neck, head — runs right after the procedural trunk pose, so act-specific
//                  additions (a sigh's breath, a lean, an aim's torso pitch) still layer on top;
//   phase 'arms' — upper / fore arms and hands — runs after the procedural arm pose, before every IK pass (weapons, props,
//                  hand-on-object reaches), so a hand that has to be somewhere still gets there.
// Standing takes add only their *motion* (deviation from the take's mean pose, low-passed — see cleanTake) to the hips and
// trunk; both feet stay planted by IK exactly where the procedural stance put them, so a swaying hip never drags a foot.
// Idles never move the arms or wrists; gesture clips move the upper / fore arms, the wrists stay procedural. Clips blend
// from the last shown pose on every change (0.35 s), and the whole layer fades out with walking speed, crouching, sitting,
// fights, vehicles, swimming — those stay procedural.
import * as THREE from 'three';
import { MOCAP_BONES, MOCAP_CLIPS } from './mocapData.js';

const decode = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Int16Array(u.buffer); };
const NB = MOCAP_BONES.length;
const BI = Object.fromEntries(MOCAP_BONES.map((b, i) => [b, i]));
const BODY = ['hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const cache = new Map();
// Clean-up of a raw take before it is ever sampled (the CMU markers are sparse at the hands and every capture carries a
// few millimetres of marker jitter — played straight, that jitter reads as wrists and fingers squirming "like worms"):
//   * a loop's end is made to meet its start (the difference is spread linearly over the clip — no pop at the seam);
//   * every channel is low-passed with a Gaussian over neighbouring frames (sigma 2 frames for gestures, 4 for idles);
//   * the clip's mean pose per bone is kept so the idle layer can add only the take's *motion* on top of the procedural
//     posture (stoop, mood, build), instead of replacing it with the performer's own stance.
function qAlign(Q, a, b) { return Q[a] * Q[b] + Q[a + 1] * Q[b + 1] + Q[a + 2] * Q[b + 2] + Q[a + 3] * Q[b + 3] < 0 ? -1 : 1; }
function cleanTake(n, loop, Q, H, sigma) {
  for (let k = 0; k < NB; k++) for (let i = 1; i < n; i++) { const a = (i * NB + k) * 4, p = ((i - 1) * NB + k) * 4; if (qAlign(Q, a, p) < 0) for (let j = 0; j < 4; j++) Q[a + j] = -Q[a + j]; } // one hemisphere along time
  if (loop && n > 2) { // seam: frame n would be frame 0 again — remove the drift so the take's end runs into its start
    for (let k = 0; k < NB; k++) { const a0 = k * 4, aN = ((n - 1) * NB + k) * 4; const sg = qAlign(Q, a0, aN); const d = [0, 1, 2, 3].map((j) => Q[aN + j] - Q[a0 + j] * sg);
      for (let i = 0; i < n; i++) { const a = (i * NB + k) * 4, f = i / (n - 1); for (let j = 0; j < 4; j++) Q[a + j] -= d[j] * f * (n - 1) / n; } }
    for (let j = 0; j < 3; j++) { const d = H[(n - 1) * 3 + j] - H[j]; for (let i = 0; i < n; i++) H[i * 3 + j] -= d * (i / (n - 1)) * (n - 1) / n; }
  }
  const R = Math.ceil(sigma * 2.5), wt = []; let ws = 0; for (let r = -R; r <= R; r++) { const w = Math.exp(-(r * r) / (2 * sigma * sigma)); wt.push(w); ws += w; }
  const at = (i) => (loop ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  const Qs = new Float32Array(Q.length), Hs = new Float32Array(H.length);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < NB; k++) { const c = (i * NB + k) * 4; let x = 0, y = 0, z = 0, w = 0;
      for (let r = -R; r <= R; r++) { const a = (at(i + r) * NB + k) * 4, f = wt[r + R] * qAlign(Q, a, c); x += Q[a] * f; y += Q[a + 1] * f; z += Q[a + 2] * f; w += Q[a + 3] * f; }
      const l = Math.hypot(x, y, z, w) || 1; Qs[c] = x / l; Qs[c + 1] = y / l; Qs[c + 2] = z / l; Qs[c + 3] = w / l; }
    for (let j = 0; j < 3; j++) { let v = 0; for (let r = -R; r <= R; r++) v += H[at(i + r) * 3 + j] * wt[r + R]; Hs[i * 3 + j] = v / ws; }
  }
  const mean = new Float32Array(NB * 4 + 3);
  for (let k = 0; k < NB; k++) { let x = 0, y = 0, z = 0, w = 0; for (let i = 0; i < n; i++) { const a = (i * NB + k) * 4, f = qAlign(Qs, a, k * 4); x += Qs[a] * f; y += Qs[a + 1] * f; z += Qs[a + 2] * f; w += Qs[a + 3] * f; }
    const l = Math.hypot(x, y, z, w) || 1; mean[k * 4] = x / l; mean[k * 4 + 1] = y / l; mean[k * 4 + 2] = z / l; mean[k * 4 + 3] = w / l; }
  for (let j = 0; j < 3; j++) { let v = 0; for (let i = 0; i < n; i++) v += Hs[i * 3 + j]; mean[NB * 4 + j] = v / n; }
  return { Q: Qs, H: Hs, mean };
}
function clip(name) {
  let c = cache.get(name); if (c) return c; const C = MOCAP_CLIPS[name]; if (!C) return null;
  const q = decode(C.q), h = decode(C.h); const Q = new Float32Array(q.length), H = new Float32Array(h.length);
  for (let i = 0; i < q.length; i++) Q[i] = q[i] / 32767; for (let i = 0; i < h.length; i++) H[i] = h[i] / 1000;
  const T = cleanTake(C.n, C.loop, Q, H, name.startsWith('idle') ? 4 : 2);
  c = { n: C.n, fps: C.fps, loop: C.loop, dur: (C.n - (C.loop ? 0 : 1)) / C.fps, Q: T.Q, H: T.H, mean: T.mean }; cache.set(name, c); return c;
}
export const clipDuration = (name) => { const c = clip(name); return c ? c.dur : 0; };
export const hasClip = (name) => !!MOCAP_CLIPS[name];

// act → clip. arms: the clip drives the arms too (gesture clips); legs: false keeps the idle legs under an upper-body clip.
// rate: playback speed; hold: a one-shot clip that holds its last frame.
const ACT_CLIPS = {
  talk: { clip: 'talk', arms: true, loop: true },
  argue: { clip: 'argue', arms: true, loop: true },
  point: { clip: 'point', arms: true },
  shrug: { clip: 'shrug', arms: true },
  rise: { clip: 'rise', arms: true, full: true, rate: 1.6 / 1.25, when: (A) => A.prevAction === 'sit' || A.seated }, // standing up from a chair (not the squad's rise from a crouch): the whole body
};
// acts that pose only the arms (or nothing) procedurally: the idle body (weight shifts, breathing, small head moves) runs under them
const IDLE_BODY = new Set(['listen', 'look', 'crossarms', 'hips', 'watch', 'phone', 'text', 'suitcase', 'sigh', 'smoke', 'paper', 'photo', 'umbrella', 'browse', 'wave', 'beckon', 'interact', 'clap', 'comms', 'glasses', 'gloves', 'straps', 'torch', 'nod', 'laugh', 'glance', 'carry', 'handsup']);
// bones the take adds its motion to (on top of the procedural pose) — the legs are never taken from a standing take: they stay
// planted by IK under wherever the hips sway
const ADD = ['hips', 'spine', 'chest', 'neck', 'head'];
const ARM_ONLY = ['armL', 'foreL', 'armR', 'foreR']; // the wrists stay procedural: CMU's hand markers are too sparse for a clean wrist
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
// sample a clip at time t into out (Float32Array NB*4 + 3 hip): Catmull-Rom through the 30 fps keys (quaternion components
// aligned to one hemisphere, then normalised) — linear keys would put a velocity kink at every key of a fast gesture
function sample(c, t, out) {
  const n = c.n, f = t * c.fps; let i1, u;
  if (c.loop) { const ff = ((f % n) + n) % n; i1 = Math.floor(ff); u = ff - i1; } else { const ff = Math.max(0, Math.min(n - 1, f)); i1 = Math.min(n - 2, Math.floor(ff)); u = ff - i1; }
  const at = (i) => (c.loop ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  const i0 = at(i1 - 1), i2 = at(i1 + 1), i3 = at(i1 + 2); i1 = at(i1);
  const u2 = u * u, u3 = u2 * u; const w0 = -0.5 * u3 + u2 - 0.5 * u, w1 = 1.5 * u3 - 2.5 * u2 + 1, w2 = -1.5 * u3 + 2 * u2 + 0.5 * u, w3 = 0.5 * u3 - 0.5 * u2;
  const Q = c.Q, H = c.H;
  for (let k = 0; k < NB; k++) { const b1 = (i1 * NB + k) * 4, b0 = (i0 * NB + k) * 4, b2 = (i2 * NB + k) * 4, b3 = (i3 * NB + k) * 4;
    const sg = (b) => (Q[b] * Q[b1] + Q[b + 1] * Q[b1 + 1] + Q[b + 2] * Q[b1 + 2] + Q[b + 3] * Q[b1 + 3] < 0 ? -1 : 1); const s0 = sg(b0) * w0, s2 = sg(b2) * w2, s3 = sg(b3) * w3;
    let x = Q[b0] * s0 + Q[b1] * w1 + Q[b2] * s2 + Q[b3] * s3, y = Q[b0 + 1] * s0 + Q[b1 + 1] * w1 + Q[b2 + 1] * s2 + Q[b3 + 1] * s3, z = Q[b0 + 2] * s0 + Q[b1 + 2] * w1 + Q[b2 + 2] * s2 + Q[b3 + 2] * s3, w = Q[b0 + 3] * s0 + Q[b1 + 3] * w1 + Q[b2 + 3] * s2 + Q[b3 + 3] * s3;
    const l = Math.hypot(x, y, z, w) || 1; const o = k * 4; out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l; }
  for (let j = 0; j < 3; j++) out[NB * 4 + j] = H[i0 * 3 + j] * w0 + H[i1 * 3 + j] * w1 + H[i2 * 3 + j] * w2 + H[i3 * 3 + j] * w3;
}
// per-animator state
function state(A) { return A._mc || (A._mc = { key: null, cur: null, fade: 0, fadeE: 0, z: 0, pose: new Float32Array(NB * 4 + 3), snap: new Float32Array(NB * 4 + 3), snapOk: false, snapA: new Float32Array(NB * 4), snapAOk: false, W: 0, armsW: 0 }); }

// which clip plays for the current action, and how much of the body the layer owns. An idle never drives the arms: a standing
// person's hands hang still (the procedural arms breathe with the chest) — a captured idle's hands only ever read as fidgeting
function plan(A, act) {
  const S = ACT_CLIPS[act]; if (S && hasClip(S.clip) && (!S.when || S.when(A))) return S;
  if (!act || IDLE_BODY.has(act)) return { clip: (A.idleClip || 'idle'), arms: false, loop: true, idle: true };
  return null;
}

const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(), _qh = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _X = new THREE.Vector3(1, 0, 0);
const PLANT = { L: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, R: { p: new THREE.Vector3(), q: new THREE.Quaternion() } };
// ankle position / foot orientation in the hips' parent space through the current local rotations
function anklePos(b, S, out) { return out.copy(b['foot' + S].position).applyQuaternion(b['shin' + S].quaternion).add(b['shin' + S].position).applyQuaternion(b['thigh' + S].quaternion).add(b['thigh' + S].position).applyQuaternion(b.hips.quaternion).add(b.hips.position); }
function footQ(b, S, out) { return out.copy(b.hips.quaternion).multiply(b['thigh' + S].quaternion).multiply(b['shin' + S].quaternion).multiply(b['foot' + S].quaternion); }
// two-bone leg IK: the ankle back onto its planted point (knee as a hinge, the thigh swung the shortest way so the knee keeps
// pointing where it pointed), the foot keeping its planted orientation (sole flat, toes where they were)
function plantLeg(b, S, tgt, qF) {
  const T = b['thigh' + S], Sh = b['shin' + S], F = b['foot' + S];
  const hip = _ta.copy(T.position).applyQuaternion(b.hips.quaternion).add(b.hips.position);
  const la = Sh.position.length(), lb = F.position.length(); const d = Math.min(la + lb - 1e-3, Math.max(Math.abs(la - lb) + 1e-3, hip.distanceTo(tgt)));
  const inner = Math.acos(Math.max(-1, Math.min(1, (la * la + lb * lb - d * d) / (2 * la * lb)))); Sh.quaternion.setFromAxisAngle(_X, Math.max(0, Math.PI - inner));
  _tb.copy(F.position).applyQuaternion(Sh.quaternion).add(Sh.position).applyQuaternion(_qt.copy(b.hips.quaternion).multiply(T.quaternion)).normalize();
  _tc.copy(tgt).sub(hip).normalize(); _qi.setFromUnitVectors(_tb, _tc); _qt.premultiply(_qi); // thigh orientation in the hips' parent space
  T.quaternion.copy(_qh.copy(b.hips.quaternion).invert().multiply(_qt));
  F.quaternion.copy(_qf.copy(_qt).multiply(Sh.quaternion).invert().multiply(qF));
}
const ease = (f) => f * f * (3 - 2 * f);

// phase 'body': after the procedural trunk / legs / head pose. ctx: { dt, w (walk weight), seatT, gT, crouch, air, act, aw, at }
//   standing clips (idles, gestures): the take's *motion* — its deviation from its own mean pose — is added to the hips and
//     trunk, the hips may sway with the performer, and both feet stay exactly where the procedural stance planted them;
//   'rise' (out of a chair) owns the whole body, legs included, grounded on the lower ankle.
// A change of clip blends from the last pose shown (held for 0.35 s while the new clip takes over) — no pops between clips.
export function mocapBody(A, b, ctx) {
  const M = state(A); const P = A.mocapOff ? null : plan(A, ctx.act);
  if (M.z) { b.hips.position.z -= M.z; M.z = 0; }
  // eligibility: standing on the ground, not walking / crouching / seated / fighting / in a vehicle / ragdoll / swimming
  const block = !P || ctx.seatT > 0.001 && ctx.act !== 'rise' || ctx.gT > 0.001 || A.board || A.fight && A.fight.w > 0.01 || A.ch.rag || ctx.act === 'swim' || ctx.act === 'drive' || ctx.act === 'ride' || A.drunkSway > 0.05 || A.duck > 0.01;
  const free = block ? 0 : (1 - ctx.w) * (1 - Math.min(1, ctx.crouch * 4)) * (1 - Math.min(1, (A.airW || 0) * 3)) * (ctx.act === 'rise' ? 1 : 1 - ctx.seatT) * (A.reach ? 1 - Math.min(1, A.reach.w ?? 1) : 1); // a reach (a hand onto a door handle / a case) owns the body's lean
  const tgt = free; const k = 1 - Math.exp(-(tgt > M.W ? 7 : 10) * Math.min(ctx.dt, 0.1)); M.W = ctx.dt > 0.2 ? tgt : M.W + (tgt - M.W) * k; if (M.W < 0.003) { M.W = 0; }
  const fw = A.fadeAct && A.fadeW > 0 && !ACT_CLIPS[A.fadeAct] ? A.fadeW * A.fadeW * (3 - 2 * A.fadeW) : 0; // a procedural gesture still easing out keeps its arms until it has
  const armsT = P && P.arms ? M.W * (1 - fw) : 0; M.armsW = ctx.dt > 0.2 ? armsT : M.armsW + (armsT - M.armsW) * Math.min(1, ctx.dt * 6); // arms hand over smoothly to a procedural / IK act
  if (!P) { M.snapOk = false; if (M.plant) M.plant.ok = false; return; }
  const key = P.clip + (P.idle ? '' : ':' + ctx.act); const phase = A.mocapPhase ?? (A.seed || 0) * 41.3;
  if (key !== M.key) { M.fade = M.W > 0 && M.snapOk && ctx.dt < 0.2 ? 1 : 0; M.key = key; M.cur = { P, t0: P.idle ? 0 : A.t - (ctx.at || 0) }; }
  if (M.W <= 0) { M.snapOk = false; M.fade = 0; if (M.plant) M.plant.ok = false; return; }
  const S = M.cur, c = clip(P.clip); if (!c) return;
  const t = S.P.idle ? A.t + phase : (A.t - S.t0) * (S.P.rate || 1) + (S.P.loop ? phase * 0.37 : 0) + (A.mocapOffset || 0); // mocapOffset: start a gesture clip part-way in (the trailer's cues)
  const sc = (A.a + A.b) / 0.845, ho = NB * 4, W = M.W, z0 = b.hips.position.z;
  sample(c, t, M.pose);
  if (!P.full) {
    // where the feet are planted: latched from the procedural stance when the layer takes over (the procedural idle's own weight
    // shift slides the hips — feet included — a few cm; under the take the feet stay put and only the body above them moves)
    const L = M.plant || (M.plant = { L: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, R: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, ok: false });
    for (const S2 of ['L', 'R']) { anklePos(b, S2, PLANT[S2].p); footQ(b, S2, PLANT[S2].q); if (!L.ok) { L[S2].p.copy(PLANT[S2].p); L[S2].q.copy(PLANT[S2].q); }
      PLANT[S2].p.lerp(L[S2].p, W); PLANT[S2].q.slerp(L[S2].q, W); }
    L.ok = true;
    const mn = c.mean;
    for (const n of ADD) { const o = BI[n] * 4; _qa.set(M.pose[o], M.pose[o + 1], M.pose[o + 2], M.pose[o + 3]).multiply(_qb.set(-mn[o], -mn[o + 1], -mn[o + 2], mn[o + 3])); // the take's deviation from its mean
      _qb.identity().slerp(_qa, W); b[n].quaternion.premultiply(_qb); }
    b.hips.position.x += (M.pose[ho] - mn[ho]) * sc * W; b.hips.position.y += (M.pose[ho + 1] - mn[ho + 1]) * sc * W * 0.5;
    b.hips.position.z += ((M.pose[ho + 2] - mn[ho + 2]) * sc + (P.idle ? (A.mocapBias || 0) : 0)) * W; // mocapBias: where the idle stance stands relative to the root (the trailer's OIC after standing up)
  } else { if (M.plant) M.plant.ok = false;
    for (const n of BODY) { const o = BI[n] * 4; _qa.set(M.pose[o], M.pose[o + 1], M.pose[o + 2], M.pose[o + 3]); b[n].quaternion.slerp(_qa, W); }
    b.hips.position.x += (M.pose[ho] * sc - b.hips.position.x) * W; b.hips.position.z += M.pose[ho + 2] * sc * W;
    const ank = (S2) => anklePos(b, S2, _v).y - b.hips.position.y; // ankle height above the hips' origin through the current leg rotations
    const lo = Math.min(ank('L'), ank('R')); const want = A.ankle + 0.02 * A.s - lo; b.hips.position.y += (want - b.hips.position.y) * W;
  }
  // a change of clip: ease out of the last pose shown
  M.fadeE = M.fade > 0 ? ease(M.fade) : 0;
  if (M.fadeE > 0) { const e = M.fadeE; for (const n of BODY) { const o = BI[n] * 4; _qa.set(M.snap[o], M.snap[o + 1], M.snap[o + 2], M.snap[o + 3]); b[n].quaternion.slerp(_qa, e); }
    b.hips.position.x += (M.snap[ho] - b.hips.position.x) * e; b.hips.position.y += (M.snap[ho + 1] - b.hips.position.y) * e; b.hips.position.z += (M.snap[ho + 2] - b.hips.position.z) * e; }
  M.fade = Math.max(0, M.fade - ctx.dt / 0.35);
  if (!P.full) for (const S2 of ['L', 'R']) plantLeg(b, S2, PLANT[S2].p, PLANT[S2].q); // feet stay planted however the hips moved
  M.z = b.hips.position.z - z0; // (the procedural pose never moves the hips along z: the offset is taken off again next frame)
  for (const n of BODY) { const o = BI[n] * 4, q = b[n].quaternion; M.snap[o] = q.x; M.snap[o + 1] = q.y; M.snap[o + 2] = q.z; M.snap[o + 3] = q.w; }
  M.snap[ho] = b.hips.position.x; M.snap[ho + 1] = b.hips.position.y; M.snap[ho + 2] = b.hips.position.z; M.snapOk = true;
  // a target the head is told to look at (crowd: a partner, the player) still turns it on top of the take
  if (A.look) { _qb.setFromAxisAngle(_w.set(0, 1, 0), A.look * 0.6 * W); b.head.quaternion.multiply(_qb); }
}
// phase 'arms': after the procedural arm / hand pose, before IK — gesture clips only (talk, argue, point, shrug, rise)
export function mocapArms(A, b) {
  const M = A._mc; if (!M || M.armsW <= 0) { if (M) M.snapAOk = false; return; } const W = M.armsW;
  for (const n of ARM_ONLY) { const o = BI[n] * 4; _qa.set(M.pose[o], M.pose[o + 1], M.pose[o + 2], M.pose[o + 3]); b[n].quaternion.slerp(_qa, W); }
  if (M.fadeE > 0 && M.snapAOk) for (const n of ARM_ONLY) { const o = BI[n] * 4; _qa.set(M.snapA[o], M.snapA[o + 1], M.snapA[o + 2], M.snapA[o + 3]); b[n].quaternion.slerp(_qa, M.fadeE); }
  for (const n of ARM_ONLY) { const o = BI[n] * 4, q = b[n].quaternion; M.snapA[o] = q.x; M.snapA[o + 1] = q.y; M.snapA[o + 2] = q.z; M.snapA[o + 3] = q.w; } M.snapAOk = true;
}
// solid surfaces near the hands (A.handBlock: [{ x0, x1, z0, z1, top, bottom? }] world axis-aligned boxes, set by whoever
// stages the actor — the trailer's jewellery-store counter): after every arm pass (clip, swing, act, IK, reach) a fingertip,
// wrist or mid-forearm inside a box is moved out by the shortest way (over the top, or out through the nearest side) by
// turning the whole arm about the shoulder — the elbow bend and the hand's grasp are kept, only the arm's aim changes.
const _s = new THREE.Vector3(), _e = new THREE.Vector3(), _h = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Vector3(), _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _push = new THREE.Vector3(), _qd = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const MARGIN = 0.02;
function pushOut(p, boxes, out) { // largest required push over all boxes for point p (0 if clear)
  let best = 0;
  for (const B of boxes) {
    if (p.x < B.x0 - MARGIN || p.x > B.x1 + MARGIN || p.z < B.z0 - MARGIN || p.z > B.z1 + MARGIN || p.y > B.top + MARGIN || (B.bottom != null && p.y < B.bottom)) continue;
    const c = [[B.top + MARGIN - p.y, 0, 1, 0], [p.x - (B.x0 - MARGIN), -1, 0, 0], [B.x1 + MARGIN - p.x, 1, 0, 0], [p.z - (B.z0 - MARGIN), 0, 0, -1], [B.z1 + MARGIN - p.z, 0, 0, 1]];
    let k = c[0]; for (const q of c) if (q[0] < k[0]) k = q; if (k[0] > best) { best = k[0]; out.set(k[1] * k[0], k[2] * k[0], k[3] * k[0]); }
  }
  return best;
}
export function blockHands(A, b) {
  const boxes = A.handBlock; if (!boxes || !boxes.length || A.ch.rag) return 0; let moved = 0;
  A.ch.root.updateMatrixWorld(true);
  for (const S of ['L', 'R']) {
    const arm = b['arm' + S], fore = b['fore' + S], hand = b['hand' + S]; if (!arm || !fore || !hand || !arm.parent) continue;
    for (let it = 0; it < 4; it++) {
      arm.getWorldPosition(_s); fore.getWorldPosition(_e); hand.getWorldPosition(_h);
      _f.copy(_h).sub(_e).normalize().multiplyScalar(0.1).add(_h); _m.copy(_e).add(_h).multiplyScalar(0.5); // fingertips ~10 cm past the wrist; mid forearm
      let worst = 0, P = null;
      for (const p of [_f, _h, _m]) { const d = pushOut(p, boxes, _d2); if (d > worst) { worst = d; P = p; _push.copy(_d2); } }
      if (!P) break;
      _d1.copy(P).sub(_s); const r = _d1.length(); if (r < 0.05) break; _d2.copy(P).add(_push).sub(_s).setLength(r); _d1.normalize(); _d2.normalize();
      _qd.setFromUnitVectors(_d1, _d2); arm.getWorldQuaternion(_qw); arm.parent.getWorldQuaternion(_qp);
      _qw.premultiply(_qd); arm.quaternion.copy(_qp.invert().multiply(_qw)); arm.updateMatrixWorld(true); moved = Math.max(moved, worst);
    }
  }
  return moved;
}
