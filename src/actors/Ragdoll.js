// Ragdoll physics for bodies (dead pedestrians / officers): a Verlet particle skeleton (16 joints) with distance constraints,
// joint limits, ground / wall / vehicle collision and sleeping, written back onto the character's existing bones (so the
// skinned body, the NPC head LOD and the skirt panels all follow).
//
//   particles: pelvis, chest, neck, head-top, shoulders, elbows, wrists, hip joints, knees, ankles
//   torso    : two rigid triangles/quads (pelvis+hips, chest+neck+shoulders) joined by soft cross-braces → it can bend and
//              twist a little but never folds or collapses
//   limits   : neck range, knees bend only forward / elbows only backward (reflected across the limb line), hips and
//              elbows can't fold completely, knees can't pass into the chest
//   bones    : hips/chest from their particle frames; limbs aimed from the parent frame (minimal rotation); hands / feet /
//              clavicles keep their rest orientation relative to the parent
//
// Kinematic mode (Ragdoll.play): the particles are driven along a scripted path (log roll onto the back, lifted onto a
// stretcher, sitting up and getting up after resuscitation) with the limb lengths kept exact, then physics resumes or the
// character is handed back to the Animator.
import * as THREE from 'three';
import * as Lay from '../world/Layout.js';
// a body that goes into the sea / Beira Lake / a canal floats at the surface instead of sinking out of sight to the bed
function waterFloor(x, z) { if (!Lay.isWater(x, z) || Lay.bridgeWalkAt(x, z)) return null; return (Lay.inCanal(z) && !Lay.inLake(x, z) ? -1.0 : Lay.inLake(x, z) ? -0.55 : -0.9) - 0.16; }

export const RAG_N = ['pelvis', 'chest', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'hipL', 'hipR', 'knL', 'knR', 'anL', 'anR'];
const I = Object.fromEntries(RAG_N.map((n, i) => [n, i]));
const BONE_OF = { pelvis: 'hips', chest: 'chest', neck: 'neck', head: 'head', shL: 'armL', shR: 'armR', elL: 'foreL', elR: 'foreR', wrL: 'handL', wrR: 'handR', hipL: 'thighL', hipR: 'thighR', knL: 'shinL', knR: 'shinR', anL: 'footL', anR: 'footR' };
const RAD = [0.11, 0.12, 0.06, 0.1, 0.06, 0.06, 0.045, 0.045, 0.04, 0.04, 0.08, 0.08, 0.06, 0.06, 0.05, 0.05];
const INVM = [0.35, 0.35, 0.8, 0.8, 0.8, 0.8, 1, 1, 1.2, 1.2, 0.6, 0.6, 0.9, 0.9, 1.1, 1.1]; // heavier trunk
const UPPER = new Set(['chest', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR']);
const LEGS = new Set(['hipL', 'hipR', 'knL', 'knR', 'anL', 'anR']);
const v3 = () => new THREE.Vector3();
const _a = v3(), _b = v3(), _c = v3(), _d = v3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const CAPS = [[I.pelvis, I.chest, 0.17], [I.chest, I.neck, 0.15], [I.neck, I.head, 0.11], [I.shL, I.elL, 0.06], [I.shR, I.elR, 0.06], [I.elL, I.wrL, 0.05], [I.elR, I.wrR, 0.05], [I.hipL, I.knL, 0.09], [I.hipR, I.knR, 0.09], [I.knL, I.anL, 0.065], [I.knR, I.anR, 0.065]].map(([a, b, r]) => [a, b, r]);
const smooth = (k) => k * k * (3 - 2 * k);

// rest pose (identity bone rotations) particle positions in skeleton space; feet on y = 0
export function restParticles(ch) {
  const b = ch.bones; const pos = new Map(); const hips = new THREE.Vector3(0, ch.hipY, 0); pos.set(b.hips, hips);
  const restOf = (bone) => { if (pos.has(bone)) return pos.get(bone); const p = restOf(bone.parent).clone().add(bone.position); pos.set(bone, p); return p; };
  const s = ch.spec.height / 1.72; const out = RAG_N.map((n) => restOf(b[BONE_OF[n]]).clone()); out[I.head].y += 0.12 * s; out[I.head].z += 0.01 * s;
  const ay = Math.min(out[I.anL].y, out[I.anR].y) - 0.07 * s; for (const p of out) p.y -= ay; // ankle joints ~7 cm above the sole
  return out;
}

export class Ragdoll {
  constructor(ch, world, opts = {}) {
    this.ch = ch; this.world = world; this.col = world.collision; this.s = ch.spec.height / 1.72;
    const b = ch.bones; ch.root.updateMatrixWorld(true);
    // current animated pose → world particles (includes any tilt the mesh had while falling)
    this.p = RAG_N.map((n) => { const bone = b[BONE_OF[n]]; const w = bone.getWorldPosition(v3()); if (n === 'head') { w.copy(bone.localToWorld(v3().set(0, 0.12 * this.s, 0.01 * this.s))); } return w; });
    this.o = this.p.map((p) => p.clone()); this.gy = new Float32Array(RAG_N.length).fill(NaN); this.contact = new Uint8Array(RAG_N.length);
    // the mesh's own tilt / offset is replaced by the particle pose (root keeps its yaw and is re-based under the pelvis)
    ch.mesh.rotation.set(0, 0, 0); ch.mesh.position.set(0, 0, 0); ch.mesh.updateMatrixWorld(true);
    this.rest = restParticles(ch); const R = this.rest;
    const L = (a, c) => R[I[a]].distanceTo(R[I[c]]); const S = (a, c, k = 1, lo = 1, hi = 1) => this.sticks.push([I[a], I[c], L(a, c), k, lo, hi]);
    this.sticks = [];
    for (const [a, c] of [['pelvis', 'hipL'], ['pelvis', 'hipR'], ['hipL', 'hipR'], ['chest', 'neck'], ['chest', 'shL'], ['chest', 'shR'], ['shL', 'shR'], ['neck', 'shL'], ['neck', 'shR']]) S(a, c);
    S('pelvis', 'chest'); for (const [a, c] of [['hipL', 'shL'], ['hipR', 'shR'], ['hipL', 'shR'], ['hipR', 'shL'], ['pelvis', 'shL'], ['pelvis', 'shR']]) S(a, c, 0.5, 0.9, 1.04); // soft braces: bend + twist
    S('pelvis', 'neck', 1, 0.93, 1.02); S('neck', 'head'); S('chest', 'head', 1, 0.9, 1.03); S('shL', 'head', 1, 0.86, 1.15); S('shR', 'head', 1, 0.86, 1.15);
    for (const sd of ['L', 'R']) { S('sh' + sd, 'el' + sd); S('el' + sd, 'wr' + sd); S('hip' + sd, 'kn' + sd); S('kn' + sd, 'an' + sd);
      const arm = L('sh' + sd, 'el' + sd) + L('el' + sd, 'wr' + sd), leg = L('hip' + sd, 'kn' + sd) + L('kn' + sd, 'an' + sd);
      this.sticks.push([I['sh' + sd], I['wr' + sd], arm, 1, 0.35, 1.02]); // elbow can't fold flat
      this.sticks.push([I['hip' + sd], I['an' + sd], leg, 1, 0.5, 1.02]); // knee can't fold flat
      }
    this.limb = this.sticks.filter((s) => s[3] === 1 && s[4] === 1 && s[5] === 1); // rigid segments (kept exact in kinematic mode)
    // rest frames
    this.restHips = this.frame(R, 'hipL', 'hipR', 'pelvis', 'chest', new THREE.Quaternion(), true); this.restChest = this.frame(R, 'shL', 'shR', 'chest', 'neck', new THREE.Quaternion(), true);
    this.d0 = {}; for (const [n, c] of [['neck', 'head'], ['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'], ['hipL', 'knL'], ['knL', 'anL'], ['hipR', 'knR'], ['knR', 'anR']]) this.d0[n] = R[I[c]].clone().sub(R[I[n]]).normalize();
    this.sleepT = 0; this.asleep = false; this.age = 0; this.kin = null; this.chestPush = 0;
    if (opts.vel) this.setVelocity(...opts.vel, opts.legK ?? 1.2, opts.upK ?? 0.7);
    ch.rag = this; this.rebase(); this.apply(0);
  }
  // orthonormal frame from a left-right pair and a bottom-top pair, relative to the rest frame (→ world rotation of the bone)
  frame(P, l, r, lo, hi, out, raw = false) {
    const X = _a.copy(P[I[l]]).sub(P[I[r]]).normalize(), Y = _b.copy(P[I[hi]]).sub(P[I[lo]]); Y.addScaledVector(X, -Y.dot(X)).normalize(); const Z = _c.crossVectors(X, Y);
    _m.makeBasis(X, Y, Z); out.setFromRotationMatrix(_m); if (!raw) out.multiply(_q2.copy(lo === 'pelvis' ? this.restHips : this.restChest).invert()); return out;
  }
  setVelocity(vx, vy, vz, legK = 1, upK = 1, dt = 1 / 60) { for (let i = 0; i < this.p.length; i++) { const n = RAG_N[i], k = LEGS.has(n) ? legK : UPPER.has(n) ? upK : 1; this.o[i].set(this.p[i].x - vx * k * dt, this.p[i].y - vy * k * dt, this.p[i].z - vz * k * dt); } this.wake(); }
  // push at a point (nearest particles get most of it), m/s
  impulse(vx, vy, vz, at = null, dt = 1 / 60) {
    for (let i = 0; i < this.p.length; i++) { const w = at ? Math.max(0.15, 1 - this.p[i].distanceTo(at) / 0.6) : 1; this.o[i].x -= vx * w * dt; this.o[i].y -= vy * w * dt; this.o[i].z -= vz * w * dt; } this.wake();
  }
  wake() { this.asleep = false; this.sleepT = 0; }
  pelvis() { return this.p[I.pelvis]; }
  part(n) { return this.p[I[n]]; }
  // ray (origin o, unit dir d, up to tMax) against the body's capsules → { t, at } of the nearest hit, or null
  rayHit(o, d, tMax) {
    let best = null; const P = this.p, s = this.s;
    for (const [a, b, r] of CAPS) { const A = P[a], B = P[b]; const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z; const wx = o.x - A.x, wy = o.y - A.y, wz = o.z - A.z;
      const aa = ux * ux + uy * uy + uz * uz, bb = ux * d.x + uy * d.y + uz * d.z, dd = ux * wx + uy * wy + uz * wz, ee = d.x * wx + d.y * wy + d.z * wz; const den = aa - bb * bb; // closest points ray / segment (|d| = 1)
      let sc = den > 1e-8 ? (dd - bb * ee) / den : 0; sc = Math.max(0, Math.min(1, sc)); const t = bb * sc - ee; if (t < 0 || t > tMax) continue;
      const qx = o.x + d.x * t - (A.x + ux * sc), qy = o.y + d.y * t - (A.y + uy * sc), qz = o.z + d.z * t - (A.z + uz * sc); const q2 = qx * qx + qy * qy + qz * qz, rr = r * s; if (q2 > rr * rr) continue;
      const tt = Math.max(0, t - Math.sqrt(rr * rr - q2)); if (!best || tt < best.t) best = { t: tt, at: new THREE.Vector3(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt) }; }
    return best;
  }
  // ---------------------------------------------------------------- simulation
  step(dt, vehicles) {
    this.age += dt;
    if (this.kin) { this.stepKin(dt); return; }
    if (this.asleep) { if (vehicles) for (const v of vehicles) { if (Math.abs(v.speed || 0) < 0.3) continue; const P = this.pelvis(); if (Math.hypot(v.x - P.x, v.z - P.z) < (v.half || 2.3) + 1.6 && v.pushOut(P.x, P.z, 0.9)) { this.wake(); break; } } if (this.asleep) return; }
    const h = 1 / 60; this.acc = Math.min((this.acc || 0) + dt, 3 * h); let maxD = 0, n = 0; // fixed 60 Hz steps (Verlet needs a constant step)
    while (this.acc >= h - 1e-6) { this.acc -= h; n++;
      for (let i = 0; i < this.p.length; i++) { const p = this.p[i], o = this.o[i]; const fr = this.contact[i] ? 0.82 : 0.995; const vx = (p.x - o.x) * fr, vy = (p.y - o.y) * 0.995, vz = (p.z - o.z) * fr; o.copy(p); p.x += vx; p.y += vy - 9.81 * h * h; p.z += vz; }
      for (let it = 0; it < 8; it++) { this.solveSticks(this.sticks); if (it % 2 === 1) this.collide(vehicles, it === 7, true); }
      this.hinges(); this.solveSticks(this.sticks); this.solveSticks(this.sticks); this.collide(null, false, false); // lengths last, then only the ground (never left inside it)
      for (let i = 0; i < this.p.length; i++) maxD = Math.max(maxD, this.p[i].distanceToSquared(this.o[i]));
    }
    if (!n) return;
    this.guard();
    if (Math.sqrt(maxD) < 0.0025 && this.age > 0.6) { this.sleepT += dt; if (this.sleepT > 0.8) { this.asleep = true; for (let i = 0; i < this.p.length; i++) this.o[i].copy(this.p[i]); } } else this.sleepT = 0;
    this.rebase(); this.apply(dt);
  }
  // safety net: a pose that went NaN goes back to the last good one; a body that ended up under the ground (anything that
  // moved the ground or the body outside the solver) is lifted back onto it, at rest
  guard() {
    const P = this.p; let bad = false; for (let i = 0; i < P.length; i++) { const q = P[i]; if (!(q.x === q.x && q.y === q.y && q.z === q.z) || Math.abs(q.y) > 1e4) { bad = true; break; } }
    if (bad) { if (this.good) for (let i = 0; i < P.length; i++) { P[i].copy(this.good[i]); this.o[i].copy(this.good[i]); } this.gy.fill(NaN); const st = this.world && this.world.stats; if (st) st.restored = (st.restored || 0) + 1; return; }
    const pel = P[I.pelvis]; if (this.col) { const rp = RAD[I.pelvis] * this.s; let gy = this.col.groundAt(pel.x, pel.z, pel.y - rp + 0.35); if (gy < -0.5) { const wf = waterFloor(pel.x, pel.z); if (wf !== null && wf > gy) gy = wf; }
      const sink = gy + rp - 0.4 - pel.y; if (sink > 0) { const d = sink + 0.4; for (let i = 0; i < P.length; i++) { P[i].y += d; this.o[i].copy(P[i]); } this.gy.fill(NaN); } }
    if (!this.good) this.good = P.map((q) => q.clone()); else for (let i = 0; i < P.length; i++) this.good[i].copy(P[i]);
  }
  solveSticks(list) {
    const P = this.p;
    for (const [a, c, L, k, lo, hi] of list) { const A = P[a], C = P[c]; const dx = C.x - A.x, dy = C.y - A.y, dz = C.z - A.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      let t; if (lo === 1 && hi === 1) t = L; else { if (d < L * lo) t = L * lo; else if (d > L * hi) t = L * hi; else continue; }
      const wa = INVM[a], wc = INVM[c]; const f = ((d - t) / d) * k / (wa + wc); A.x += dx * f * wa; A.y += dy * f * wa; A.z += dz * f * wa; C.x -= dx * f * wc; C.y -= dy * f * wc; C.z -= dz * f * wc; }
  }
  collide(vehicles, full, walls = full) {
    const col = this.col;
    for (let i = 0; i < this.p.length; i++) { const p = this.p[i], r = RAD[i] * this.s;
      if (full || this.gy[i] !== this.gy[i]) { let gy = col ? col.groundAt(p.x, p.z, p.y - r + 0.35) : 0; if (gy < -0.5) { const wf = waterFloor(p.x, p.z); if (wf !== null && wf > gy) gy = wf; } this.gy[i] = gy; } const g = this.gy[i] + r;
      this.contact[i] = 0; if (p.y < g) { p.y = g; this.contact[i] = 1; const o = this.o[i]; if (o.y < g) o.y = g; /* the snap is not speed: a particle lifted out of the ground (kerb edge, body starting in it) must not be launched */ } else if (p.y < g + 0.01) this.contact[i] = 1;
      if (walls && col) { const q = col.resolveCircle(p.x, p.z, r, p.y - r, 0.3, 0.3); if (q.hit) { p.x = q.x; p.z = q.z; } }
    }
    if (full && vehicles) { const P = this.pelvis(); for (const v of vehicles) { if (Math.abs(v.x - P.x) > 7 || Math.abs(v.z - P.z) > 7) continue; for (let i = 0; i < this.p.length; i++) { const p = this.p[i]; const q = v.pushOut(p.x, p.z, RAD[i] * this.s + 0.05); if (q) { p.x = q.x; p.z = q.z; } } } }
  }
  // knees bend forward, elbows backward: a joint on the wrong side of its limb line is reflected through it (not into the ground)
  hinges() {
    const P = this.p; const X = _a.copy(P[I.hipL]).sub(P[I.hipR]), Y = _b.copy(P[I.chest]).sub(P[I.pelvis]); const F = _c.crossVectors(X, Y).normalize();
    const fix = (j0, j1, j2, sign) => { const A = P[j0], K = P[j1], C = P[j2]; const ax = _d.copy(C).sub(A); const l2 = ax.lengthSq(); if (l2 < 1e-6) return; const t = ((K.x - A.x) * ax.x + (K.y - A.y) * ax.y + (K.z - A.z) * ax.z) / l2; // foot of the perpendicular: the reflection keeps both segment lengths
      const cx = A.x + ax.x * t, cy = A.y + ax.y * t, cz = A.z + ax.z * t; const ox = K.x - cx, oy = K.y - cy, oz = K.z - cz; if ((ox * F.x + oy * F.y + oz * F.z) * sign < -0.015) { // reflect through the limb line (keeps both lengths) unless that would put it into the ground
        const ky = cy - oy, gy = this.gy[j1] === this.gy[j1] ? this.gy[j1] : -1e9; if (ky < gy + RAD[j1] * this.s - 0.005) return;
        K.x = cx - ox; K.y = ky; K.z = cz - oz; const O = this.o[j1]; O.x = K.x; O.y = K.y; O.z = K.z; } };
    for (const sd of ['L', 'R']) { fix(I['hip' + sd], I['kn' + sd], I['an' + sd], 1); fix(I['sh' + sd], I['el' + sd], I['wr' + sd], -1); }
    // hip flexion limit: a thigh can't fold up into the chest (rotated back about the hip joint, its length kept)
    const U = _b.normalize(); for (const sd of ['L', 'R']) { const H = P[I['hip' + sd]], K = P[I['kn' + sd]]; const tx = K.x - H.x, ty = K.y - H.y, tz = K.z - H.z; const tl = Math.hypot(tx, ty, tz) || 1e-6; const c = (tx * U.x + ty * U.y + tz * U.z) / tl;
      if (c > 0.62) { let nx = tx / tl - U.x * (c - 0.62), ny = ty / tl - U.y * (c - 0.62), nz = tz / tl - U.z * (c - 0.62); const nl = Math.hypot(nx, ny, nz) || 1; K.x = H.x + nx / nl * tl; K.y = H.y + ny / nl * tl; K.z = H.z + nz / nl * tl; const O = this.o[I['kn' + sd]]; O.x = (O.x + K.x) / 2; O.y = (O.y + K.y) / 2; O.z = (O.z + K.z) / 2; } }
  }
  // keep the character's root (and so its bounds / shadow / LOD distance) under the body
  rebase() {
    const root = this.ch.root, P = this.pelvis(); if (Math.hypot(root.position.x - P.x, root.position.z - P.z) < 0.5 && Math.abs(root.position.y - (P.y - 0.12)) < 0.8) return;
    root.position.set(P.x, this.col ? this.col.groundAt(P.x, P.z, P.y) : 0, P.z); root.updateMatrixWorld(true);
  }
  // ---------------------------------------------------------------- particles → bones
  apply(dt) {
    const ch = this.ch, b = ch.bones; ch.mesh.updateMatrixWorld(true); _inv.copy(ch.mesh.matrixWorld).invert();
    const L = this._L || (this._L = RAG_N.map(() => v3())); for (let i = 0; i < this.p.length; i++) L[i].copy(this.p[i]).applyMatrix4(_inv);
    if (this.chestPush) L[I.chest].y -= this.chestPush;
    const qH = this.frame(L, 'hipL', 'hipR', 'pelvis', 'chest', this._qH || (this._qH = new THREE.Quaternion()));
    const qC = this.frame(L, 'shL', 'shR', 'chest', 'neck', this._qC || (this._qC = new THREE.Quaternion()));
    const qS = (this._qS || (this._qS = new THREE.Quaternion())).copy(qH).slerp(qC, 0.5);
    b.hips.position.copy(L[I.pelvis]); b.hips.quaternion.copy(qH);
    const loc = (bone, parentW, w) => bone.quaternion.copy(_q.copy(parentW).invert().multiply(w));
    loc(b.spine, qH, qS); loc(b.chest, qS, qC);
    const aim = (parentW, from, to, key, out) => { const D = _a.copy(L[I[to]]).sub(L[I[from]]).normalize(); const d = _b.copy(this.d0[key]).applyQuaternion(parentW); return out.setFromUnitVectors(d, D).multiply(parentW); };
    const qN = aim(qC, 'neck', 'head', 'neck', this._qN || (this._qN = new THREE.Quaternion())); loc(b.neck, qC, qN); b.head.quaternion.identity();
    for (const sd of ['L', 'R']) {
      b['sh' + sd].quaternion.identity(); const qA = aim(qC, 'sh' + sd, 'el' + sd, 'sh' + sd, this['_qA' + sd] || (this['_qA' + sd] = new THREE.Quaternion())); loc(b['arm' + sd], qC, qA);
      const qF = aim(qA, 'el' + sd, 'wr' + sd, 'el' + sd, this['_qF' + sd] || (this['_qF' + sd] = new THREE.Quaternion())); loc(b['fore' + sd], qA, qF); b['hand' + sd].rotation.set(0.25, 0, 0);
      const qT = aim(qH, 'hip' + sd, 'kn' + sd, 'hip' + sd, this['_qT' + sd] || (this['_qT' + sd] = new THREE.Quaternion())); loc(b['thigh' + sd], qH, qT);
      const qK = aim(qT, 'kn' + sd, 'an' + sd, 'kn' + sd, this['_qK' + sd] || (this['_qK' + sd] = new THREE.Quaternion())); loc(b['shin' + sd], qT, qK); b['foot' + sd].rotation.set(0.45, 0, 0);
    }
    if (ch.anim && ch.anim.driveSkirt) ch.anim.driveSkirt();
    if (dt && ch.face && this.faceLive) ch.face.update(dt);
  }
  // ---------------------------------------------------------------- kinematic paths
  // fn(k) fills `out` (world positions) for path parameter k ∈ [0,1]; the limbs are kept at length; done() runs at the end.
  play(fn, dur, done = null, opts = {}) { this.kin = { fn, dur, t: 0, done, hold: !!opts.hold, ease: opts.ease !== false }; this.wake(); }
  snapshot() { return this.p.map((p) => p.clone()); }
  stepKin(dt) {
    const K = this.kin; K.t += dt; const k = Math.min(1, K.t / K.dur); const out = this._out || (this._out = RAG_N.map(() => v3()));
    K.fn(K.ease ? smooth(k) : k, out); for (let i = 0; i < this.p.length; i++) this.p[i].copy(out[i]);
    for (let it = 0; it < 3; it++) this.solveSticks(this.limb);
    for (let i = 0; i < this.p.length; i++) { this.o[i].copy(this.p[i]); this.gy[i] = NaN; }
    this.rebase(); this.apply(dt);
    if (k >= 1 && !K.hold) { this.kin = null; this.sleepT = 0; this.asleep = false; if (K.done) K.done(); }
    else if (k >= 1 && K.done) { const d = K.done; K.done = null; d(); }
  }
  // blend from the current pose to a target pose given in world space (array or function returning one)
  blendTo(target, dur, done, opts) { const from = this.snapshot(); this.play((k, out) => { const T = typeof target === 'function' ? target() : target; for (let i = 0; i < out.length; i++) out[i].lerpVectors(from[i], T[i], k); }, dur, done, opts); }
  // put the character back under the Animator (bones reset to rest; the caller places the root)
  release() { const b = this.ch.bones; for (const n of Object.keys(b)) { if (b[n].isBone) b[n].quaternion.identity(); } b.hips.position.set(0, this.ch.hipY, 0); this.ch.rag = null; this.kin = null; if (this.world) this.world.remove(this); }
}

// ---------------------------------------------------------------- body-frame keys (positions relative to the ground)
// frame: origin = ankle midpoint on the ground, +z = the way the feet point from the head (supine) / the way the person
// faces once sitting / standing. toWorld() maps a key into world space with the ground height under each particle.
export const Keys = {
  supine(R) { const ay = (R[I.anL].y + R[I.anR].y) / 2, sc = R[I.head].y / 1.79; return R.map((p, i) => new THREE.Vector3(p.x, RAD[i] * sc + 0.005 + Math.max(0, p.z) * 0.5, -(p.y - ay))); }, // lying on the back, every joint resting at its collision radius
  sit(R) { const S = Keys.supine(R); const piv = S[I.pelvis].clone(); const a = 1.25; const c = Math.cos(a), s = Math.sin(a);
    return S.map((p, i) => { const n = RAG_N[i]; const q = p.clone(); if (UPPER.has(n)) { const y = p.y - piv.y, z = p.z - piv.z; q.y = piv.y + y * c - z * s; q.z = piv.z + y * s + z * c; }
      if (n === 'knL' || n === 'knR') { q.y += 0.2; q.z -= 0.06; } if (n === 'anL' || n === 'anR') q.z -= 0.22; if (n === 'wrL' || n === 'wrR') { q.y = Math.max(0.07, q.y); q.z = piv.z - 0.18; q.x *= 1.25; } if (n === 'elL' || n === 'elR') q.z = piv.z - 0.1; return q; }); },
  crouch(R) { const S = Keys.supine(R); const zA = S[I.pelvis].z + 0.15; const out = R.map((p) => p.clone()); const lt = R[I.hipL].distanceTo(R[I.knL]), ls = R[I.knL].distanceTo(R[I.anL]);
    const pelY = 0.5 * (lt + ls) + 0.1, pelZ = zA - 0.16; const dP = new THREE.Vector3(0, pelY - R[I.pelvis].y, pelZ - R[I.pelvis].z); const piv = R[I.pelvis]; const a = 0.75, c = Math.cos(a), s = Math.sin(a);
    RAG_N.forEach((n, i) => { const p = R[i]; let y = p.y - piv.y, z = p.z - piv.z; if (UPPER.has(n)) { const y2 = y * c - z * s, z2 = y * s + z * c; y = y2; z = z2; } out[i].set(p.x, piv.y + y + dP.y, piv.z + z + dP.z); });
    for (const sd of ['L', 'R']) { const H = out[I['hip' + sd]]; const A = out[I['an' + sd]].set(R[I['an' + sd]].x * 1.15, 0.08, zA); const d = Math.min(lt + ls - 1e-3, H.distanceTo(A)); const ca = (lt * lt + d * d - ls * ls) / (2 * lt * d); const ang = Math.acos(Math.max(-1, Math.min(1, ca)));
      const dy = A.y - H.y, dz = A.z - H.z; const base = Math.atan2(dz, dy); const kz = H.z + Math.sin(base + ang) * lt, ky = H.y + Math.cos(base + ang) * lt; out[I['kn' + sd]].set((H.x + A.x) / 2 * 1.2, ky, kz);
      out[I['wr' + sd]].set(out[I['kn' + sd]].x * 0.9, out[I['kn' + sd]].y + 0.04, out[I['kn' + sd]].z + 0.06); }
    return out; },
  stand(R) { const S = Keys.supine(R); const zA = S[I.pelvis].z + 0.15; return R.map((p) => new THREE.Vector3(p.x, p.y, p.z + zA)); },
  standZ(R) { return Keys.supine(R)[I.pelvis].z + 0.15; },
  toWorld(key, ox, oz, yaw, col, out = key.map(() => new THREE.Vector3()), yOff = null) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < key.length; i++) { const k = key[i]; const x = ox + k.x * c + k.z * s, z = oz - k.x * s + k.z * c; const gy = yOff !== null ? yOff : col ? col.groundAt(x, z, 0.4 + (out[i].y || 0)) : 0; out[i].set(x, gy + k.y, z); }
    return out;
  },
};
// frame (origin, yaw) that puts a supine key's pelvis under the body's pelvis with the head → feet line kept
export function supineFrame(rag) {
  const P = rag.pelvis(), H = rag.part('head'), Fm = rag.part('anL').clone().add(rag.part('anR')).multiplyScalar(0.5);
  let dx = Fm.x - H.x, dz = Fm.z - H.z; if (Math.hypot(dx, dz) < 0.3) { dx = P.x - H.x; dz = P.z - H.z; } const yaw = Math.atan2(dx, dz);
  const S = Keys.supine(rag.rest); const sp = S[I.pelvis]; const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: P.x - (sp.x * c + sp.z * s), z: P.z - (-sp.x * s + sp.z * c), yaw };
}
// signed roll angle (about the body's long axis) that turns the body face up
export function rollAngle(rag) {
  const P = rag.p; const X = _a.copy(P[I.hipL]).sub(P[I.hipR]).add(_d.copy(P[I.shL]).sub(P[I.shR])), Y = _b.copy(P[I.chest]).sub(P[I.pelvis]);
  const F = _c.crossVectors(X, Y).normalize(); const ax = Y.clone().setY(0).normalize(); if (ax.lengthSq() < 0.5) return 0;
  const Fp = F.clone().addScaledVector(ax, -F.dot(ax)).normalize(); const up = new THREE.Vector3(0, 1, 0); let a = Math.acos(Math.max(-1, Math.min(1, Fp.dot(up)))); if (new THREE.Vector3().crossVectors(Fp, up).dot(ax) < 0) a = -a; return a;
}
export function rotateAbout(src, origin, axis, ang, out) { _q.setFromAxisAngle(axis, ang); for (let i = 0; i < src.length; i++) out[i].copy(src[i]).sub(origin).applyQuaternion(_q).add(origin); return out; }

// every live ragdoll; stepped once per frame by the game
export class RagdollWorld {
  constructor(collision) { this.collision = collision; this.list = []; this.stats = { made: 0 }; }
  add(ch, opts) { if (ch.rag) return ch.rag;
    // someone seated in a car (or any other moving parent) is taken out into the world first, where they are: the body's
    // particles and its root live in world space (a root left inside the car put the body somewhere else entirely)
    const par = ch.root.parent; if (par && !par.isScene) { let top = par; while (top.parent) top = top.parent; if (top.isScene) { top.attach(ch.root); const e = new THREE.Euler().setFromQuaternion(ch.root.quaternion, 'YXZ'); ch.root.rotation.set(0, e.y, 0); ch.root.updateMatrixWorld(true); } }
    const r = new Ragdoll(ch, this, opts); this.list.push(r); this.stats.made++; return r; }
  remove(r) { const i = this.list.indexOf(r); if (i >= 0) this.list.splice(i, 1); }
  update(dt, vehicles) { dt = Math.min(dt, 1 / 20); for (const r of this.list.slice()) { if (!r.ch.root.parent && !r.kin) { this.remove(r); continue; } r.step(dt, vehicles); } }
  clear() { this.list = []; }
}
