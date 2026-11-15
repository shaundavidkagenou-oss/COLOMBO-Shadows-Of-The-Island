// Motion-capture clips (src/anim/mocapData.js, built by tools/mocap/build.mjs from real CMU performances) and the layer
// that lays them over the procedural animator (Character.js Animator.update):
//   phase 'body' — hips, legs, spine, chest, neck, head — runs right after the procedural trunk pose, so act-specific
//                  additions (a sigh's breath, a lean, an aim's torso pitch) still layer on top;
//   phase 'arms' — upper / fore arms and hands — runs after the procedural arm pose, before every IK pass (weapons, props,
//                  hand-on-object reaches), so a hand that has to be somewhere still gets there.
// The legs are grounded each frame: the hips are set so the lower ankle stands exactly at the standing ankle height (no
// sinking or floating feet whatever the actor's proportions). Clips cross-fade on every change (0.35 s), and the whole
// layer fades out with walking speed, crouching, sitting, fights, vehicles, swimming — those stay procedural.
import * as THREE from 'three';
import { MOCAP_BONES, MOCAP_CLIPS } from './mocapData.js';

const decode = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Int16Array(u.buffer); };
const NB = MOCAP_BONES.length;
const BI = Object.fromEntries(MOCAP_BONES.map((b, i) => [b, i]));
const BODY = ['hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const LEGS = ['hips', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const ARMS = ['armL', 'foreL', 'handL', 'armR', 'foreR', 'handR'];
const cache = new Map();
function clip(name) {
  let c = cache.get(name); if (c) return c; const C = MOCAP_CLIPS[name]; if (!C) return null;
  const q = decode(C.q), h = decode(C.h); const Q = new Float32Array(q.length), H = new Float32Array(h.length);
  for (let i = 0; i < q.length; i++) Q[i] = q[i] / 32767; for (let i = 0; i < h.length; i++) H[i] = h[i] / 1000;
  c = { n: C.n, fps: C.fps, loop: C.loop, dur: (C.n - (C.loop ? 0 : 1)) / C.fps, Q, H }; cache.set(name, c); return c;
}
export const clipDuration = (name) => { const c = clip(name); return c ? c.dur : 0; };
export const hasClip = (name) => !!MOCAP_CLIPS[name];

// act → clip. arms: the clip drives the arms too (gesture clips); legs: false keeps the idle legs under an upper-body clip.
// rate: playback speed; hold: a one-shot clip that holds its last frame.
const ACT_CLIPS = {
  talk: { clip: 'talk', arms: true, loop: true },
  argue: { clip: 'argue', arms: true, loop: true },
  point: { clip: 'point', arms: true },
  shrug: { clip: 'shrug', arms: true, legs: false },
  rise: { clip: 'rise', arms: true, rate: 1.6 / 1.25, when: (A) => A.prevAction === 'sit' || A.seated }, // standing up from a chair (not the squad's rise from a crouch)
};
// acts that pose only the arms (or nothing) procedurally: the idle body (weight shifts, breathing, small head moves) runs under them
const IDLE_BODY = new Set(['listen', 'look', 'crossarms', 'hips', 'watch', 'phone', 'text', 'suitcase', 'sigh', 'smoke', 'paper', 'photo', 'umbrella', 'browse', 'wave', 'beckon', 'interact', 'clap', 'comms', 'glasses', 'gloves', 'straps', 'torch', 'nod', 'laugh', 'glance', 'carry', 'handsup']);

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
function blendInto(dst, src, w) { // dst = nlerp(dst, src, w)
  for (let k = 0; k < NB; k++) { const o = k * 4; const d = dst[o] * src[o] + dst[o + 1] * src[o + 1] + dst[o + 2] * src[o + 2] + dst[o + 3] * src[o + 3]; const s = d < 0 ? -1 : 1;
    let x = dst[o] + (src[o] * s - dst[o]) * w, y = dst[o + 1] + (src[o + 1] * s - dst[o + 1]) * w, z = dst[o + 2] + (src[o + 2] * s - dst[o + 2]) * w, q = dst[o + 3] + (src[o + 3] * s - dst[o + 3]) * w; const l = Math.hypot(x, y, z, q) || 1;
    dst[o] = x / l; dst[o + 1] = y / l; dst[o + 2] = z / l; dst[o + 3] = q / l; }
  for (let j = 0; j < 3; j++) dst[NB * 4 + j] += (src[NB * 4 + j] - dst[NB * 4 + j]) * w;
}

// per-animator state
function state(A) { return A._mc || (A._mc = { key: null, cur: null, prev: null, fade: 0, z: 0, pose: new Float32Array(NB * 4 + 3), tmp: new Float32Array(NB * 4 + 3), legs: new Float32Array(NB * 4 + 3), W: 0, armsW: 0 }); }

// which clip plays for the current action, and how much of the body the layer owns
function plan(A, act) {
  const S = ACT_CLIPS[act]; if (S && hasClip(S.clip) && (!S.when || S.when(A))) return S;
  if (!act || IDLE_BODY.has(act)) return { clip: (A.idleClip || 'idle'), arms: !act, loop: true, idle: true };
  return null;
}

// phase 'body': after the procedural trunk / legs / head pose. ctx: { dt, w (walk weight), seatT, gT, crouch, air, act, aw, at }
export function mocapBody(A, b, ctx) {
  const M = state(A); const P = A.mocapOff ? null : plan(A, ctx.act);
  if (M.z) { b.hips.position.z -= M.z; M.z = 0; }
  // eligibility: standing on the ground, not walking / crouching / seated / fighting / in a vehicle / ragdoll / swimming
  const block = !P || ctx.seatT > 0.001 && ctx.act !== 'rise' || ctx.gT > 0.001 || A.board || A.fight && A.fight.w > 0.01 || A.ch.rag || ctx.act === 'swim' || ctx.act === 'drive' || ctx.act === 'ride' || A.drunkSway > 0.05 || A.duck > 0.01;
  const free = block ? 0 : (1 - ctx.w) * (1 - Math.min(1, ctx.crouch * 4)) * (1 - Math.min(1, (A.airW || 0) * 3)) * (ctx.act === 'rise' ? 1 : 1 - ctx.seatT) * (A.reach ? 1 - Math.min(1, A.reach.w ?? 1) : 1); // a reach (a hand onto a door handle / a case) owns the body's lean
  const tgt = free; const k = 1 - Math.exp(-(tgt > M.W ? 7 : 10) * Math.min(ctx.dt, 0.1)); M.W = ctx.dt > 0.2 ? tgt : M.W + (tgt - M.W) * k; if (M.W < 0.003) { M.W = 0; }
  const fw = A.fadeAct && A.fadeW > 0 && !ACT_CLIPS[A.fadeAct] ? A.fadeW * A.fadeW * (3 - 2 * A.fadeW) : 0; // a procedural gesture still easing out keeps its arms until it has
  const armsT = P && P.arms ? M.W * (1 - fw) : 0; M.armsW = ctx.dt > 0.2 ? armsT : M.armsW + (armsT - M.armsW) * Math.min(1, ctx.dt * 6); // arms hand over smoothly to a procedural / IK act
  if (!P) return;
  const key = P.clip + (P.idle ? '' : ':' + ctx.act); const phase = A.mocapPhase ?? (A.seed || 0) * 41.3;
  if (key !== M.key) { if (M.cur && M.W > 0) { M.prev = M.cur; M.fade = 1; } M.key = key; M.cur = { P, t0: P.idle ? 0 : A.t - (ctx.at || 0) }; }
  if (M.W <= 0) return;
  const tOf = (S) => (S.P.idle ? A.t + phase : (A.t - S.t0) * (S.P.rate || 1) + (S.P.loop ? phase * 0.37 : 0) + (A.mocapOffset || 0)); // mocapOffset: start a gesture clip part-way in (the trailer's cues)
  const sc = (A.a + A.b) / 0.845, ho = NB * 4;
  const c = clip(P.clip); if (!c) return; sample(c, tOf(M.cur), M.pose); if (P.idle && A.mocapBias) M.pose[ho + 2] += A.mocapBias / sc; // mocapBias: where the idle stance stands relative to the root (after standing up from a chair, the trailer's OIC)
  if (M.fade > 0 && M.prev) { const pc = clip(M.prev.P.clip); if (pc) { sample(pc, tOf(M.prev), M.tmp); if (M.prev.P.idle && A.mocapBias) M.tmp[ho + 2] += A.mocapBias / sc; const w = 1 - M.fade, sw = w * w * (3 - 2 * w); blendInto(M.tmp, M.pose, sw); M.pose.set(M.tmp); } M.fade = Math.max(0, M.fade - ctx.dt / 0.35); if (M.fade === 0) M.prev = null; }
  // an upper-body clip keeps the idle legs (and hips) underneath
  let legsSrc = M.pose; if (P.legs === false) { const ic = clip(A.idleClip || 'idle'); sample(ic, A.t + phase, M.legs); legsSrc = M.legs; }
  const W = M.W;
  for (const n of BODY) { const src = LEGS.includes(n) ? legsSrc : M.pose; const o = BI[n] * 4; _qa.set(src[o], src[o + 1], src[o + 2], src[o + 3]); b[n].quaternion.slerp(_qa, W); }
  // hips: horizontal offset from the take (scaled to this body), height from grounding the lower ankle
  b.hips.position.x += (legsSrc[ho] * sc - b.hips.position.x) * W; M.z = legsSrc[ho + 2] * sc * W; b.hips.position.z += M.z; // (the procedural pose never moves the hips along z: the offset is taken off again next frame)
  const ank = (S) => { // ankle height above the hips' origin through the current (blended) leg rotations
    _v.copy(b['foot' + S].position).applyQuaternion(b['shin' + S].quaternion).add(b['shin' + S].position).applyQuaternion(b['thigh' + S].quaternion).add(b['thigh' + S].position).applyQuaternion(b.hips.quaternion); return _v.y; };
  const lo = Math.min(ank('L'), ank('R')); const want = A.ankle + 0.02 * A.s - lo; b.hips.position.y += (want - b.hips.position.y) * W;
  // a target the head is told to look at (crowd: a partner, the player) still turns it on top of the take
  if (A.look) { _qb.setFromAxisAngle(_w.set(0, 1, 0), A.look * 0.6 * W); b.head.quaternion.multiply(_qb); }
}
// phase 'arms': after the procedural arm / hand pose, before IK
export function mocapArms(A, b) {
  const M = A._mc; if (!M || M.armsW <= 0) return; const W = M.armsW;
  for (const n of ARMS) { const o = BI[n] * 4; _qa.set(M.pose[o], M.pose[o + 1], M.pose[o + 2], M.pose[o + 3]); b[n].quaternion.slerp(_qa, n.startsWith('hand') ? W * 0.6 : W); } // CMU hands are coarse (few markers): 60 %
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
