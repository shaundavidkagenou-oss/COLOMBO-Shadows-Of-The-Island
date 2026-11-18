// Retargeting between the game rig (src/actors/Character.js — rest pose = identity local rotations, character faces +z) and
// any other humanoid skeleton (an uploaded GLB / FBX / DAE character, a BVH / FBX / GLB animation file — Mixamo, Unreal /
// Unity humanoids, Blender rigify-style DEF bones, CMU BVH, VRM, MakeHuman …). Direction based like tools/mocap/retarget.mjs:
// a limb bone takes the world rotation of its counterpart relative to that skeleton's rest pose, composed with a fixed rest
// alignment (rest bone direction → rest bone direction), so arms-down and T-pose rigs map onto each other and proportions
// don't matter. Two directions:
//   importClip(...)   another skeleton's animation → a game animation clip (quaternion tracks + hip offset), used by AnimRuntime
//   RigDriver         the game skeleton (as animated by the game: procedural Animator, mocap, IK, weapons…) → an uploaded
//                     skinned model that replaces a character's look
import * as THREE from 'three';

export const MAP_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const BONE_LABEL = { hips: 'Hips / pelvis', spine: 'Spine (lower)', chest: 'Chest (upper spine)', neck: 'Neck', head: 'Head', shL: 'Left shoulder / clavicle', armL: 'Left upper arm', foreL: 'Left forearm', handL: 'Left hand', shR: 'Right shoulder / clavicle', armR: 'Right upper arm', foreR: 'Right forearm', handR: 'Right hand', thighL: 'Left thigh', shinL: 'Left shin / calf', footL: 'Left foot', thighR: 'Right thigh', shinR: 'Right shin / calf', footR: 'Right foot' };
const CHILD = { hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head', shL: 'armL', armL: 'foreL', foreL: 'handL', shR: 'armR', armR: 'foreR', foreR: 'handR', thighL: 'shinL', shinL: 'footL', thighR: 'shinR', shinR: 'footR' };
const ALIGN = new Set(['shL', 'armL', 'foreL', 'shR', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR', 'spine', 'chest', 'neck']); // bones whose rest direction is aligned

// ---- bone names: normalise, then match per game bone (side words: left/l/lft, right/r/rgt)
const norm = (n) => String(n).toLowerCase().replace(/^.*[:|]/, '').replace(/mixamorig\d*/g, '').replace(/^(def|org|mch|bip0?1|bip|j_bip_c|j_bip_l|j_bip_r|j_bip|cc_base|rig|armature)[_\-. ]*/g, '').replace(/[^a-z0-9]/g, '');
const SIDE = { L: ['left', 'l', 'lft'], R: ['right', 'r', 'rgt'] };
function sideOf(raw) {
  const s = String(raw).toLowerCase().replace(/^.*[:|]/, '');
  if (/(^|[^a-z])(left|lft)([^a-z]|$)|^left|left$|j_bip_l/.test(s) || /(^|[_\-. ])l([_\-. ]|$)|[_\-.]l$|^l[_\-.]/.test(s)) return 'L';
  if (/(^|[^a-z])(right|rgt)([^a-z]|$)|^right|right$|j_bip_r/.test(s) || /(^|[_\-. ])r([_\-. ]|$)|[_\-.]r$|^r[_\-.]/.test(s)) return 'R';
  const n = norm(raw); if (/^left|left$/.test(n)) return 'L'; if (/^right|right$/.test(n)) return 'R';
  if (/^l(?=[a-z]{3,})/.test(n) && /^l(shoulder|clavicle|collar|humerus|uparm|upperarm|arm|forearm|lowarm|lowerarm|radius|hand|wrist|thigh|upleg|upperleg|femur|leg|shin|calf|knee|lowleg|lowerleg|tibia|foot|ankle)/.test(n)) return 'L';
  if (/^r(?=[a-z]{3,})/.test(n) && /^r(shoulder|clavicle|collar|humerus|uparm|upperarm|arm|forearm|lowarm|lowerarm|radius|hand|wrist|thigh|upleg|upperleg|femur|leg|shin|calf|knee|lowleg|lowerleg|tibia|foot|ankle)/.test(n)) return 'R';
  return null;
}
const stripSide = (n) => n.replace(/^(left|right|lft|rgt)/, '').replace(/(left|right|lft|rgt)$/, '').replace(/^[lr](?=[a-z]{3,})/, '').replace(/[lr]$/, '');
const PAT = {
  hips: [/^(hips?|pelvis|hip|cog|root(hips)?|hipsroot)$/],
  spine: [/^(spine|spine0|spine00|spine1|abdomen|torso|lowerback|spinelower)$/],
  chest: [/^(spine2|chest|upperchest|spine02|spine3|spine03|thorax|ribcage|spineupper|upperback|spine1)$/],
  neck: [/^(neck|neck0|neck1|neck01|necklower)$/],
  head: [/^(head|head0|headtop|skull)$/],
  sh: [/^(shoulder|clavicle|collar|collarbone|clav)$/],
  arm: [/^(arm|upperarm|uparm|humerus|shoulderjoint)$/],
  fore: [/^(forearm|lowerarm|lowarm|elbow|radius|forearm0)$/],
  hand: [/^(hand|wrist|palm)$/],
  thigh: [/^(upleg|upperleg|thigh|femur|hipjoint|uplegjoint)$/],
  shin: [/^(leg|lowerleg|lowleg|shin|calf|knee|tibia|crus)$/],
  foot: [/^(foot|ankle|footjoint)$/],
};
export function autoMap(names) {
  const out = {}; const used = new Set(); const info = names.map((n) => ({ raw: n, n: norm(n), side: sideOf(n) }));
  const find = (pats, side) => { for (const p of pats) for (const it of info) { if (used.has(it.raw)) continue; if (side && it.side !== side) continue; if (!side && it.side) continue; const core = side ? stripSide(it.n) : it.n; if (p.test(core)) return it.raw; } return null; };
  for (const g of ['hips', 'spine', 'chest', 'neck', 'head']) { let r = find(PAT[g], null); if (g === 'chest' && r && r === out.spine) r = null; if (r) { out[g] = r; used.add(r); } }
  // spine chains (Spine, Spine1, Spine2): the lowest is the spine, the highest below the neck the chest
  const sp = info.filter((it) => !it.side && /^spine\d*$/.test(it.n)).sort((a, b) => (parseInt(a.n.slice(5) || '0', 10) - parseInt(b.n.slice(5) || '0', 10)));
  if (sp.length >= 2) { out.spine = sp[0].raw; out.chest = sp[sp.length - 1].raw; }
  for (const S of ['L', 'R']) for (const [g, p] of [['sh', 'sh'], ['arm', 'arm'], ['fore', 'fore'], ['hand', 'hand'], ['thigh', 'thigh'], ['shin', 'shin'], ['foot', 'foot']]) { const r = find(PAT[p], S); if (r) { out[g + S] = r; used.add(r); } }
  return out;
}

// ---- skeleton helpers
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
// rotation / position of o in the space of root (root's own transform removed)
export function relQ(o, root, out = new THREE.Quaternion()) { _m.copy(root.matrixWorld).invert().multiply(o.matrixWorld); _m.decompose(_p, out, _s); return out.normalize(); }
export function relP(o, root, out = new THREE.Vector3()) { _m.copy(root.matrixWorld).invert().multiply(o.matrixWorld); return out.setFromMatrixPosition(_m); }
export function bonesOf(root) { const out = []; root.traverse((o) => { if (o.isBone || (o.type === 'Bone')) out.push(o); }); if (!out.length) root.traverse((o) => { if (o !== root && !o.isMesh && o.children.some((c) => !c.isMesh)) out.push(o); }); return out; }
const byName = (root) => { const m = new Map(); root.traverse((o) => { if (o.name && !m.has(o.name)) m.set(o.name, o); }); return m; };

// rest information of a mapped foreign skeleton: root-space rest rotation / position per mapped bone + rest directions
function foreignRest(root, map, facing) {
  root.updateMatrixWorld(true); const N = byName(root); const H = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing || 0);
  const R = { bones: {}, H }; let minY = Infinity;
  for (const [g, name] of Object.entries(map)) { const o = N.get(name); if (!o) continue; const q = relQ(o, root); const p = relP(o, root).applyQuaternion(H); R.bones[g] = { o, q, p }; }
  root.traverse((o) => { if (o.isBone) minY = Math.min(minY, relP(o, root, _p).applyQuaternion(H).y); });
  R.minY = Number.isFinite(minY) ? minY : 0; R.hipH = R.bones.hips ? Math.max(1e-4, R.bones.hips.p.y - R.minY) : 1; return R;
}
// game rig rest: directions (bone → child joint) in character space; the rig's rest rotations are identity
export function gameRest(ch) {
  const out = {}; for (const g of MAP_BONES) { const b = ch.bones[g]; if (!b) continue; const c = CHILD[g] && ch.bones[CHILD[g]];
    out[g] = c ? c.position.clone().normalize() : null; }
  return out;
}
const dirTo = (R, g) => { const a = R.bones[g], c = R.bones[CHILD[g]]; if (!a || !c) return null; const d = c.p.clone().sub(a.p); return d.lengthSq() > 1e-12 ? d.normalize() : null; };

// ---- import: foreign animation → game clip { mode:'replace', quat:true, fps, length, n, q:{bone:[x,y,z,w,…]}, hip:[x,y,z,…] }
// src: { root: Object3D with the bones, clip: THREE.AnimationClip }, ch: a game Character (its rig gives rest directions + hip
// height). opts: { map, facing (rad), fps (30), start, end (s), inPlace (true), mirror (false), restFrame0 (false), key, loop }
export function importClip(src, ch, opts = {}) {
  const root = src.root, clip = src.clip; const map = opts.map || autoMap(bonesOf(root).map((b) => b.name)); const fps = opts.fps || 30;
  const mixer = new THREE.AnimationMixer(root); const act = mixer.clipAction(clip); act.play();
  if (opts.restFrame0) { mixer.setTime(0); } else { act.stop(); }
  const R = foreignRest(root, map, opts.facing); act.reset(); act.play();
  const G = gameRest(ch); const A = {};
  for (const g of MAP_BONES) { A[g] = new THREE.Quaternion(); if (!ALIGN.has(g) || !G[g]) continue; const fd = dirTo(R, g); if (fd) A[g].setFromUnitVectors(G[g], fd); }
  const t0 = Math.max(0, opts.start || 0), t1 = Math.min(clip.duration, opts.end > 0 ? opts.end : clip.duration); const n = Math.max(2, Math.round((t1 - t0) * fps) + 1);
  const bones = MAP_BONES.filter((g) => R.bones[g] && ch.bones[g]); const q = Object.fromEntries(bones.map((g) => [g, []])); const hip = [];
  const parentOf = (g) => { let p = ch.bones[g].parent; while (p && p.isBone) { if (bones.includes(p.name)) return p.name; p = p.parent; } return null; };
  const par = Object.fromEntries(bones.map((g) => [g, parentOf(g)])); const order = bones.slice().sort((a, b) => depth(ch.bones[a]) - depth(ch.bones[b]));
  const hipH = ch.hipY || 0.95, sc = hipH / R.hipH; const Hinv = R.H.clone().invert(); const W = {}, srcQ = new THREE.Quaternion(), d = new THREE.Quaternion(), inv = new THREE.Quaternion(), pw = new THREE.Quaternion();
  const prevQ = {};
  for (let i = 0; i < n; i++) {
    mixer.setTime(t0 + (i / (n - 1)) * (t1 - t0)); root.updateMatrixWorld(true);
    for (const g of order) {
      const r = R.bones[g]; relQ(r.o, root, srcQ); d.copy(srcQ).multiply(inv.copy(r.q).invert()); d.premultiply(R.H).multiply(Hinv); // world-space delta from rest, facing corrected
      const w = (W[g] ||= new THREE.Quaternion()).copy(d).multiply(A[g]);
      // the game parent's world rotation: its computed one, or (unmapped in-between bones) identity rest under it
      pw.identity(); const p = par[g]; if (p) pw.copy(W[p]);
      const loc = inv.copy(pw).invert().multiply(w).normalize(); if (opts.mirror) { /* applied below */ }
      if (prevQ[g] && prevQ[g].dot(loc) < 0) loc.set(-loc.x, -loc.y, -loc.z, -loc.w); prevQ[g] = (prevQ[g] || new THREE.Quaternion()).copy(loc);
      q[g].push(+loc.x.toFixed(5), +loc.y.toFixed(5), +loc.z.toFixed(5), +loc.w.toFixed(5));
    }
    if (R.bones.hips) { const hp = relP(R.bones.hips.o, root).applyQuaternion(R.H).sub(R.bones.hips.p).multiplyScalar(sc); if (opts.inPlace !== false) { hp.x = 0; hp.z = 0; } hip.push(+hp.x.toFixed(4), +hp.y.toFixed(4), +hp.z.toFixed(4)); }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  const out = { key: opts.key || 'idle', mode: 'replace', quat: true, weight: 1, speed: 1, fps, n, length: (n - 1) / fps, loop: opts.loop !== false, q, hip: hip.length ? hip : null, map };
  if (opts.mirror) mirrorClip(out);
  return out;
}
const depth = (o) => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
// left ↔ right (the rig is symmetric about x): swap the side tracks and reflect (x, y, z, w) → (x, −y, −z, w)
export function mirrorClip(c) {
  const sw = (g) => (g.endsWith('L') ? g.slice(0, -1) + 'R' : g.endsWith('R') ? g.slice(0, -1) + 'L' : g); const nq = {};
  for (const [g, a] of Object.entries(c.q)) { const t = sw(g); const b = a.slice(); for (let i = 0; i < b.length; i += 4) { b[i + 1] = -b[i + 1]; b[i + 2] = -b[i + 2]; } nq[t] = b; }
  c.q = nq; if (c.hip) for (let i = 0; i < c.hip.length; i += 3) c.hip[i] = -c.hip[i]; return c;
}

// ---- drive an uploaded skinned model from a game Character (model replacement)
// model: the uploaded scene (under a container in ch.root); map: { gameBone: modelBoneName }; fix: { gameBone: [rx, ry, rz] deg }
export class RigDriver {
  constructor(ch, container, model, map, { facing = 0, fix = null } = {}) {
    this.ch = ch; this.c = container; this.model = model; this.map = map; this.fix = {};
    for (const [g, e] of Object.entries(fix || {})) if (e) this.fix[g] = new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.map((v) => THREE.MathUtils.degToRad(v || 0))));
    container.updateMatrixWorld(true); const root = ch.root; root.updateMatrixWorld(true);
    const N = byName(model); this.items = []; const G = gameRest(ch); const H = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);
    const rest = {}; for (const [g, name] of Object.entries(map)) { const o = N.get(name); if (o && ch.bones[g]) rest[g] = { o, q: relQ(o, root), p: relP(o, root) }; }
    // every bone of the model, parents first: mapped ones follow the game, the rest keep their rest local rotation
    const all = []; model.traverse((o) => { if (o.isBone) all.push(o); }); all.sort((a, b) => depth(a) - depth(b)); const g2 = new Map(Object.entries(rest).map(([g, r]) => [r.o, g]));
    for (const o of all) { const g = g2.get(o); const it = { o, g: g || null, restLocal: o.quaternion.clone(), restPos: o.position.clone(), B: new THREE.Quaternion(), restRootQ: relQ(o, root) };
      if (g && ALIGN.has(g) && G[g]) { const c = CHILD[g] && rest[CHILD[g]]; if (c) { const td = c.p.clone().sub(rest[g].p).normalize(); it.B.setFromUnitVectors(td.applyQuaternion(H.clone().invert()).applyQuaternion(H), G[g]); } }
      this.items.push(it); }
    this.hips = rest.hips || null; this.gameHip0 = ch.bones.hips ? ch.bones.hips.position.clone() : new THREE.Vector3(); this.k = container.scale.x || 1;
    this.W = new Map(); this.frame = -1;
  }
  update() {
    const root = this.ch.root, W = this.W; const gq = new THREE.Quaternion(), w = new THREE.Quaternion(), pinv = new THREE.Quaternion(); root.updateMatrixWorld(false);
    const crq = relQ(this.c, root); // the container's own rotation in character space
    for (const it of this.items) {
      const par = it.o.parent; const pw = W.get(par) || (par === this.model || !par || !par.isBone ? relQ(par || this.c, root) : relQ(par, root));
      if (it.g) { const gb = this.ch.bones[it.g]; relQ(gb, root, gq); w.copy(gq).multiply(it.B).multiply(it.restRootQ); if (this.fix[it.g]) w.multiply(this.fix[it.g]); }
      else w.copy(pw).multiply(it.restLocal);
      W.set(it.o, w.clone()); it.o.quaternion.copy(pinv.copy(pw).invert().multiply(w)).normalize();
    }
    if (this.hips && this.ch.bones.hips) { const d = this.ch.bones.hips.position.clone().sub(this.gameHip0); const it = this.items.find((x) => x.g === 'hips'); if (it) { const par = it.o.parent; const pq = par ? relQ(par, root) : crq; const ps = par ? new THREE.Vector3().setFromMatrixScale(_m.copy(root.matrixWorld).invert().multiply(par.matrixWorld)) : new THREE.Vector3(1, 1, 1);
      it.o.position.copy(it.restPos).add(d.applyQuaternion(pq.clone().invert()).divide(ps)); } }
    W.clear(); this.c.updateMatrixWorld(true);
  }
}
export const _test = { norm, sideOf, autoMap };
