// Retargets CMU motion capture (BVH, tools/mocap/bvh.mjs) onto the game's character rig (src/actors/Character.js).
// Direction-based: every game bone takes the world orientation of its BVH counterpart, composed with a fixed rest
// alignment (the game rig stands in an arms-down rest pose, the CMU skeleton in a T-pose), so the limb segments point
// exactly where the actor's did, independent of the two skeletons' proportions. The clip's mean heading is removed (the
// character faces its own +z), the hips' horizontal travel is kept relative to the segment's mean (weight shifts, a step),
// scaled to the game body. Output: per frame, local quaternions for GAME_BONES (rest = identity) + a hip offset.
import * as THREE from 'three';
import { fk } from './bvh.mjs';

export const GAME_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', armL: 'chest', foreL: 'armL', handL: 'foreL', armR: 'chest', foreR: 'armR', handR: 'foreR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };
const SRC = { hips: 'Hips', spine: 'Spine', chest: 'Spine1', neck: 'Neck', head: 'Head', armL: 'LeftArm', foreL: 'LeftForeArm', handL: 'LeftHand', armR: 'RightArm', foreR: 'RightForeArm', handR: 'RightHand', thighL: 'LeftUpLeg', shinL: 'LeftLeg', footL: 'LeftFoot', thighR: 'RightUpLeg', shinR: 'RightLeg', footR: 'RightFoot' };
// child joint that gives each BVH bone's rest direction, and the game bone's rest direction (Character.js rest offsets)
const SRC_CHILD = { armL: 'LeftForeArm', foreL: 'LeftHand', handL: 'LeftHandIndex1', armR: 'RightForeArm', foreR: 'RightHand', handR: 'RightHandIndex1', thighL: 'LeftLeg', shinL: 'LeftFoot', thighR: 'RightLeg', shinR: 'RightFoot' };
export const GAME_REST_DIR = { armL: [0.035, -0.266, -0.009], foreL: [0.015, -0.237, 0.009], handL: [0.0, -1, 0.0], armR: [-0.035, -0.266, -0.009], foreR: [-0.015, -0.237, 0.009], handR: [0.0, -1, 0.0], thighL: [0.005, -0.408, 0.005], shinL: [0, -0.394, -0.014], thighR: [-0.005, -0.408, 0.005], shinR: [0, -0.394, -0.014] };

function restAlign(B) {
  const A = {};
  for (const g of GAME_BONES) {
    if (!SRC_CHILD[g]) { A[g] = new THREE.Quaternion(); continue; }
    const c = B.byName[SRC_CHILD[g]]; const d = new THREE.Vector3(...c.offset).normalize(); const r = new THREE.Vector3(...GAME_REST_DIR[g]).normalize();
    A[g] = new THREE.Quaternion().setFromUnitVectors(r, d); // game rest direction → BVH rest direction (BVH rest frames are world-aligned)
  }
  return A;
}
// standing hip height of the BVH skeleton (hip joint → ankle, rest pose) for the travel scale
function legLen(B) { const j = (n) => new THREE.Vector3(...B.byName[n].offset); return -(j('LeftUpLeg').y + j('LeftLeg').y + j('LeftFoot').y); }

const yawOf = (q) => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q); return Math.atan2(f.x, f.z); };

// f0..f1 (source frames, 120 fps) resampled at fps. opts: { mirror, heading (rad, override), travel (0..1 scale on the hip
// travel), gameLeg (game hip→ankle length, m) }
export function retarget(B, f0, f1, fps = 30, opts = {}) {
  const A = restAlign(B); const step = 1 / (B.dt * fps); const n = Math.floor((f1 - f0) / step) + 1; const idx = (nm) => B.byName[nm].idx;
  const frames = []; let sx = 0, sz = 0, cs = 0, sn = 0;
  for (let i = 0; i < n; i++) { const f = Math.min(B.frames - 1, Math.round(f0 + i * step)); const { Q, P } = fk(B, f); frames.push({ Q, P }); const y = yawOf(Q[idx('Hips')]); cs += Math.cos(y); sn += Math.sin(y); sx += P[idx('Hips')].x; sz += P[idx('Hips')].z; }
  const head = opts.heading ?? Math.atan2(sn, cs); const Hinv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -head);
  const mean = new THREE.Vector3(sx / n, 0, sz / n); const sc = (opts.gameLeg || 0.82) / legLen(B); const travel = opts.travel ?? 1;
  const out = []; const W = {};
  for (const { Q, P } of frames) {
    for (const g of GAME_BONES) W[g] = Hinv.clone().multiply(Q[idx(SRC[g])]).multiply(A[g]);
    const loc = {}; for (const g of GAME_BONES) { const p = PARENT[g]; loc[g] = p ? W[p].clone().invert().multiply(W[g]) : W[g].clone(); }
    const hp = P[idx('Hips')].clone().sub(mean); hp.applyQuaternion(Hinv); const hip = [hp.x * sc * travel, (P[idx('Hips')].y) * sc, hp.z * sc * travel];
    out.push({ loc, hip });
  }
  denoise(out, opts.twistSigma ?? 3);
  if (opts.mirror) for (const fr of out) { // mirror across the body's mid-plane (x → −x): q (x, y, z, w) → (x, −y, −z, w), left ↔ right
    const m = {}; for (const g of GAME_BONES) { const s = g.endsWith('L') ? g.slice(0, -1) + 'R' : g.endsWith('R') ? g.slice(0, -1) + 'L' : g; const q = fr.loc[s]; m[g] = new THREE.Quaternion(q.x, -q.y, -q.z, q.w); }
    fr.loc = m; fr.hip[0] = -fr.hip[0]; }
  return { fps, frames: out, legScale: sc };
}

// CMU limb data carries marker noise, and the upper arm's roll about its own axis is poorly determined when the arm points
// forward (the roll can whip round by ~1 rad in two frames — read as a flailing forearm). Every limb bone is split into swing
// (where the segment points — reliable) and twist about its own axis; the twist is unwrapped and low-passed (Gaussian, σ in
// frames), then everything gets a light σ = 1 frame smoothing.
const LIMBS = ['armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR'];
function gauss(arr, sigma) { if (sigma <= 0) return arr.slice(); const r = Math.ceil(sigma * 3), n = arr.length, out = new Array(n);
  for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let k = -r; k <= r; k++) { const j = Math.max(0, Math.min(n - 1, i + k)); const g = Math.exp(-(k * k) / (2 * sigma * sigma)); s += arr[j] * g; w += g; } out[i] = s / w; } return out; }
function denoise(frames, twistSigma) {
  for (const g of LIMBS) {
    const ax = new THREE.Vector3(...GAME_REST_DIR[g]).normalize(); const sw = [], th = [];
    for (const fr of frames) { const q = fr.loc[g]; const d = q.x * ax.x + q.y * ax.y + q.z * ax.z; let t = 2 * Math.atan2(d, q.w); const tw = new THREE.Quaternion().setFromAxisAngle(ax, t); sw.push(q.clone().multiply(tw.invert())); th.push(t); }
    for (let i = 1; i < th.length; i++) { while (th[i] - th[i - 1] > Math.PI) th[i] -= 2 * Math.PI; while (th[i] - th[i - 1] < -Math.PI) th[i] += 2 * Math.PI; }
    const ts = gauss(th, g.startsWith('hand') ? twistSigma * 1.5 : twistSigma);
    frames.forEach((fr, i) => { fr.loc[g] = sw[i].multiply(new THREE.Quaternion().setFromAxisAngle(ax, ts[i])); });
  }
  for (const g of GAME_BONES) { const c = [[], [], [], []]; let prev = null;
    for (const fr of frames) { const q = fr.loc[g]; if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); prev = q; c[0].push(q.x); c[1].push(q.y); c[2].push(q.z); c[3].push(q.w); }
    const s = c.map((a) => gauss(a, 1)); frames.forEach((fr, i) => fr.loc[g].set(s[0][i], s[1][i], s[2][i], s[3][i]).normalize()); }
}
