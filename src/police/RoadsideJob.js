// 84th request — the roadside mechanic's job as a real workflow (Roadside.planVan delegates here).
//
// Root causes this replaces (80th–83rd):
//  · equipment popped out of a pool at the van's back (Props.get) and vanished into it again (Props.put): there was no van
//    stock, nothing inside the van, and a prop could appear in a hand from nowhere;
//  · the whole fix was one 8–12 s bend at the car's nose with the bonnet only a sound; no assessment, no safety-first gating,
//    no inspection, no completion check, no closing up;
//  · the work time did not depend on the fault beyond a few seconds.
//
// Now
//  · KIT — every service van owns its equipment for life (v.rsKit): toolbox (holding a spanner and a wheel brace), battery
//    booster, work light, trolley jack, spare wheel, warning triangle, two cones. Stowed, each sits in its own slot in the
//    modelled compartment (RearCompartment.js COMPARTMENT_SLOTS), parented to it, so it rides with the van and shows when
//    the doors open. Taken: scene.attach (same world pose) and it glides into the hand over ~0.45 s; placed: put down at the
//    hand; returned: it glides back into its slot. Identity is kept throughout — only the tyre changes owner: the spare
//    becomes the car's wheel and the punctured wheel goes into the spare's slot (it is the van's spare from then on).
//  · STAGES with configurable durations (JOB_DUR, seconds; scaled by RS.workK): dispatch → drive → park → out → assess
//    (driver + walk-round) → safety (triangle, cones; work light at night) → open van → fetch kit → carry → open bonnet →
//    inspect → repair (simple / involved, by fault) → completion check (the driver tries it) → close bonnet → return kit →
//    collect cones → doors shut → drive off. The bonnet is a real raised panel over a lit engine bay; the lead's hands are
//    IK-planted on the bonnet edge while opening / closing and on the bay while working; the spanner is in his hand.
import * as THREE from 'three';
import { COMPARTMENT_SLOTS } from '../vehicles/RearCompartment.js';
import { buildBay, releaseBay, poseRod, BAY_SHOW } from './EngineBay.js';

export const JOB_DUR = { assess: [8, 15], setup: [8, 15], inspect: [10, 20], simple: [25, 50], involved: [45, 90], cleanup: [10, 20], check: [3, 5] };
export const FAULT_JOB = { battery: 'simple', flat: 'simple', nostart: 'simple', overheat: 'involved', engine: 'involved', mechanical: 'involved' };
const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// ---------------------------------------------------------------- the van's kit
const KIT_KINDS = { toolbox: 'toolbox', battery: 'battery', worklight: 'worklight', jack: 'jack', tyre: 'tyre', triangle: 'triangle', cone0: 'cone', cone1: 'cone', spanner: 'spanner', brace: 'brace' };
const compOf = (v) => v.mesh.userData.rear && v.mesh.userData.rear.cav;
export function vanKit(rs, v) {
  if (v.rsKit) return v.rsKit; const cav = compOf(v); if (!cav) return null; const P = rs.propsOf(); const K = v.rsKit = { v, slots: {}, out: new Set() };
  for (const [slot, kind] of Object.entries(KIT_KINDS)) { const m = P.get(kind); P.live.delete(m); m.userData.slot = slot; m.userData.van = v; K.slots[slot] = m; seatKit(K, m); }
  return K;
}
// into its slot (the toolbox's hand tools ride inside the toolbox, wherever it is)
function seatKit(K, m) {
  const slot = m.userData.slot, S = COMPARTMENT_SLOTS.rsvan[slot]; m.parent?.remove(m); K.out.delete(m); m.rotation.set(0, S.yaw, S.rz || 0); m.scale.set(1, 1, 1);
  if (S.inBox) { const box = K.slots.toolbox; m.position.set(0, 0.06, 0); m.rotation.set(0, 0, 0); m.visible = false; box.add(m); return; }
  m.position.set(S.p[0], S.p[1], S.p[2]); m.visible = true; compOf(K.v).add(m);
}
export function homeKit(v) { const K = v && v.rsKit; if (!K) return 0; let n = 0; for (const m of [...K.out]) { seatKit(K, m); n++; } return n; } // pool reset: every item back in its slot (same objects)
export function kitAt(K, kind) { for (const [slot, m] of Object.entries(K.slots)) if (m && KIT_KINDS[slot] === kind && !K.out.has(m)) return m; return null; }
// out of the van into a mechanic's hand: same object, same world pose, then it glides to the grip (carryPose blends)
export function takeKit(rs, o, K, kind, two = false) {
  const m = K && kitAt(K, kind); if (!m) { const p = rs.propsOf().get(kind); rs.carry(o, p, two); return p; } // (lost kit — should not happen; counted)
  m.updateWorldMatrix(true, false); m.getWorldPosition(_a); rs.g.scene.attach(m); m.visible = true; K.out.add(m); rs.carry(o, m, two); o.carry.from = _a.clone(); o.carry.k = 0; return m;
}
// back into the van: glides from where it is into its slot, then is parented to the compartment
export function stowKit(rs, u, m) {
  const v = u.v, K = v && v.rsKit; if (!m) return; if (!K || m.userData.van !== v) { rs.propsOf().put(m); return; }
  const slot = m.userData.slot; const S = COMPARTMENT_SLOTS.rsvan[slot]; if (S.inBox) { seatKit(K, m); return; }
  const cav = compOf(v); cav.updateWorldMatrix(true, false); _b.set(S.p[0], S.p[1], S.p[2]); cav.localToWorld(_b);
  (u.rs.stowing || (u.rs.stowing = [])).push({ m, from: m.position.clone(), to: _b.clone(), t: 0 }); m.parent !== rs.g.scene && rs.g.scene.attach(m);
}
export function stowStep(rs, u, dt) { const L = u.rs.stowing; if (!L || !L.length) return; const K = u.v.rsKit;
  for (let i = L.length - 1; i >= 0; i--) { const s = L[i]; s.t += dt / 0.45; const k = Math.min(1, s.t); const e = k * k * (3 - 2 * k); s.m.position.lerpVectors(s.from, s.to, e); s.m.position.y += Math.sin(Math.PI * e) * 0.08; if (k >= 1) { seatKit(K, s.m); L.splice(i, 1); } } }
export function stowNow(rs, u) { const L = u.rs.stowing; if (L) { for (const s of L) seatKit(u.v.rsKit, s.m); L.length = 0; } }
// the tyre swap: the spare goes onto the car (back to the prop pool: the car's own wheel shows), the punctured wheel takes its slot
export function swapSpare(rs, K, spare, flat) { if (!K) return; const slot = spare && spare.userData.slot; if (spare) { K.out.delete(spare); delete spare.userData.slot; delete spare.userData.van; rs.propsOf().put(spare); }
  if (flat && slot) { rs.propsOf().live.delete(flat); flat.userData.slot = slot; flat.userData.van = K.v; K.slots[slot] = flat; K.out.add(flat); } }
export function kitReport(v) { const K = v && v.rsKit; if (!K) return null; const r = { stowed: 0, out: K.out.size, slots: Object.keys(K.slots).length, missing: 0 };
  for (const [slot, m] of Object.entries(K.slots)) { if (!m) { r.missing++; continue; } const S = COMPARTMENT_SLOTS.rsvan[slot]; if (!K.out.has(m) && (S.inBox ? m.parent === K.slots.toolbox : m.parent === compOf(v))) r.stowed++; } return r; }

// ---------------------------------------------------------------- the bonnet (a raised panel over a lit engine bay)
// 89th: the bonnet is the painted run from the nose back to the scuttle. Before, a fixed 27 % of the length was used: on the
// short-bonneted models it ran 0.3–0.5 m under the windscreen (the hinge in the glass, the bay poking through the dash) and on
// the cab-over van / lorries the 'bonnet' was the cab front. And its height came from VehicleDamage.surfaceY, which builds the
// type's whole collision proxy on first use (40–70 ms: the frame hitch as the bonnet went up). Now: one pass over the paint
// mesh keeps the triangles that cross the centre line in the front 30 % (a few dozen), then the top surface is sampled every
// 6 cm back from the nose until the windscreen (no paint) or the scuttle step. ~1–2 ms once per model (cached), at the breakdown.
const _tv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], _tm = new THREE.Matrix4(), _ti = new THREE.Matrix4();
function centreTris(car, zMin) {
  const out = []; car.mesh.updateWorldMatrix(true, true); _ti.copy(car.mesh.matrixWorld).invert();
  car.mesh.traverse((o) => { if (!o.isMesh || o.name !== 'paint' || !o.visible) return; const g = o.geometry, P = g.attributes.position, I = g.index; _tm.multiplyMatrices(_ti, o.matrixWorld);
    const e = _tm.elements, A = P.array, st = P.isInterleavedBufferAttribute ? P.data.stride : 3, of = P.isInterleavedBufferAttribute ? P.offset : 0, ix = I ? I.array : null, n = I ? I.count : P.count;
    const X = (j) => e[0] * A[j] + e[4] * A[j + 1] + e[8] * A[j + 2] + e[12], Z = (j) => e[2] * A[j] + e[6] * A[j + 1] + e[10] * A[j + 2] + e[14];
    for (let i = 0; i < n; i += 3) { const ja = (ix ? ix[i] : i) * st + of, jb = (ix ? ix[i + 1] : i + 1) * st + of, jc = (ix ? ix[i + 2] : i + 2) * st + of; // raw arrays: ~1 µs a triangle
      const za = Z(ja), zb = Z(jb), zc = Z(jc); if (za < zMin && zb < zMin && zc < zMin) continue; const xa = X(ja), xb = X(jb), xc = X(jc); if ((xa > 0 && xb > 0 && xc > 0) || (xa < 0 && xb < 0 && xc < 0)) continue;
      for (const j of [ja, jb, jc]) { _tv[0].set(A[j], A[j + 1], A[j + 2]).applyMatrix4(_tm); out.push(_tv[0].x, _tv[0].y, _tv[0].z); } } });
  return out;
}
function topY(T, z) { // the highest paint surface over (0, z), or null
  let best = null; for (let i = 0; i < T.length; i += 9) { const ax = T[i], az = T[i + 2], bx = T[i + 3], bz = T[i + 5], cx = T[i + 6], cz = T[i + 8];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-9) continue; const l1 = ((bz - cz) * (0 - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (0 - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue; const y = l1 * T[i + 1] + l2 * T[i + 4] + l3 * T[i + 7]; if (best == null || y > best) best = y; }
  return best;
}
const BONNETS = new Map();
export function bonnetFrame(car) { // vehicle-local: hinge (rear edge) and front edge of the bonnet, from the body's real surface
  const key = car.type + ':' + car.T.len.toFixed(2); if (BONNETS.has(key)) return BONNETS.get(key);
  const ch = car.T.len / 2, zf = ch - 0.16, zMin = ch - car.T.len * 0.3; const T = centreTris(car, zMin); const yf = topY(T, zf - 0.04); let F = null;
  if (yf != null && yf < 1.35) { let last = zf - 0.04, py = yf;
    for (let z = zf - 0.1; z > zMin; z -= 0.06) { const y = topY(T, z); if (y == null || y < py - 0.03 || y > py + 0.1) break; last = z; py = y; }
    const Lb = (zf - last) - 0.05; if (Lb >= 0.55) { const zh = zf - Lb, yh = topY(T, zh + 0.03) ?? py; if (yh >= yf - 0.05) F = { zf, zh, yf, yh, Lb, w: car.T.wid * 0.78 }; } }
  BONNETS.set(key, F); return F;
}
export const BONNET_OPEN = 1.15; // rad, the raised panel's angle to the closed bonnet
export function bonnetOpen(rs, u, car) {
  const R = u.rs; if (R.bonnet) return R.bonnet; if (car.type === 'tuktuk' || car.T.base === 'tuktuk') return null; const F = bonnetFrame(car); if (!F) return null;
  const hex = typeof car.mesh.userData.customHex === 'string' ? car.mesh.userData.customHex : typeof car.mesh.userData.color === 'string' ? car.mesh.userData.color : '#8a8f94';
  // 89th: the modelled engine bay + the bonnet's outer skin / inner frame / pad / prop rod (EngineBay.js) — all pre-compiled and
  // uploaded on the loading screen; the panel and the body-colour parts use the vehicles' own paint material (the car's colour)
  const B = buildBay(F, hex); car.mesh.add(B.hinge, B.bay, B.rodG); B.hinge.rotation.x = B.slope;
  R.bonnet = { hinge: B.hinge, bay: B.bay, rodG: B.rodG, B, F, k: 0, goal: 1, slope: B.slope, car }; return R.bonnet;
}
export function bonnetStep(R, dt) { const B = R.bonnet; if (!B) return; B.k += Math.sign(B.goal - B.k) * Math.min(Math.abs(B.goal - B.k), dt / 1.4); const e = B.k * B.k * (3 - 2 * B.k);
  B.hinge.rotation.x = B.slope - e * BONNET_OPEN; B.hinge.visible = true; const show = B.k > BAY_SHOW; B.bay.visible = show; B.rodG.visible = show; if (show) poseRod(B.B, B.k, BONNET_OPEN);
  if (B.k <= 0.001 && B.goal === 0) bonnetGone(R); }
export function bonnetGone(R) { const B = R.bonnet; if (!B) return; B.hinge.parent?.remove(B.hinge); B.bay.parent?.remove(B.bay); B.rodG.parent?.remove(B.rodG); releaseBay(B.B); R.bonnet = null; }
// world points: the bonnet's front edge (where the hands lift it) and spots in the bay to work at
export function bonnetEdge(R, car) { const B = R.bonnet; if (!B) return null; const e = B.k * B.k * (3 - 2 * B.k); const a = B.slope - e * BONNET_OPEN; const y = B.F.yh + 0.012 - Math.sin(a) * B.F.Lb, z = B.F.zh + Math.cos(a) * B.F.Lb;
  car.mesh.updateWorldMatrix(true, false); const L = _a.set(0.28, y, z).applyMatrix4(car.mesh.matrixWorld).clone(), Rr = _b.set(-0.28, y, z).applyMatrix4(car.mesh.matrixWorld).clone(); return [{ x: L.x, y: L.y, z: L.z }, { x: Rr.x, y: Rr.y, z: Rr.z }]; }
export function bayPoints(R, car, lx = 0, depth = 0.5) { const F = R.bonnet ? R.bonnet.F : bonnetFrame(car); if (!F) return null; const z = F.zf - F.Lb * depth, y = F.yf + (F.yh - F.yf) * depth - 0.05;
  car.mesh.updateWorldMatrix(true, false); const A = _a.set(lx + 0.22, y, z).applyMatrix4(car.mesh.matrixWorld), a = { x: A.x, y: A.y, z: A.z }; const B = _b.set(lx - 0.22, y, z).applyMatrix4(car.mesh.matrixWorld); return [a, { x: B.x, y: B.y, z: B.z }]; }

// ---------------------------------------------------------------- the hand tool (a spanner / wheel brace in the right hand)
// 89th: the tool sits IN the fist. Before, its centre was put on the wrist (the hand bone's origin) in the bone's orientation —
// the spanner floated through the back of the hand at a random angle. Hand frame (FuelStations' nozzle grip, the game's one
// measured grip): a handle along the hand's z through the palm at (0.012, -0.085, 0.01), fingers wrapping toward -y, the
// index / thumb side toward +z. Per tool: the grip point in the tool's own frame and the hand's axes there.
const HAND_IN_GRIP = new THREE.Vector3(-0.012, 0.085, -0.01); // the wrist in the grip frame
const GRIP_DEF = {
  spanner: { g: [0, 0, -0.045], ax: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }, // handle along z, the open end (+z) out past the index finger
  brace: { g: [0.2, 0, 0], ax: [[0, 1, 0], [0, 0, -1], [-1, 0, 0]] }, // the right hand round the +x arm's end, wrist toward -z (the mechanic)
};
const GRIPS = {};
function gripOf(kind) {
  let G = GRIPS[kind]; if (G) return G; const D = GRIP_DEF[kind] || GRIP_DEF.spanner; const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...D.ax[0]), new THREE.Vector3(...D.ax[1]), new THREE.Vector3(...D.ax[2]));
  const q = new THREE.Quaternion().setFromRotationMatrix(M); const w = HAND_IN_GRIP.clone().applyQuaternion(q).add(new THREE.Vector3(...D.g)); // the wrist in tool coordinates
  const H = new THREE.Matrix4().compose(w, q, new THREE.Vector3(1, 1, 1)); G = GRIPS[kind] = { q, w, Hi: H.clone().invert() }; return G;
}
const _m = new THREE.Matrix4(), _s1 = new THREE.Vector3();
// the tool's pose: anchored (o.toolAt: on a bolt / a wheel nut, the hands IK'd to it) or riding in the right fist
export function toolPose(o) { const m = o.tool; if (!m) return; m.visible = true;
  if (o.toolAt) { m.position.copy(o.toolAt.p); m.quaternion.copy(o.toolAt.q); return; }
  const h = o.ch.bones && o.ch.bones.handR; if (!h) return; h.updateWorldMatrix(true, false); _m.multiplyMatrices(h.matrixWorld, gripOf(m.userData.kind).Hi); _m.decompose(m.position, m.quaternion, _s1); }
// the right wrist + hand orientation that hold a tool posed (p, q) in the world
function handFor(kind, p, q, outW, outQ) { const G = gripOf(kind); outW.copy(G.w).applyQuaternion(q).add(p); outQ.copy(q).multiply(G.q); }
const _up = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _bp = new THREE.Vector3(), _tq = new THREE.Quaternion(), _tp = new THREE.Vector3(), _mb = new THREE.Matrix4();
const ease = (k) => k * k * (3 - 2 * k);
// working spots in the bay (bay layout space, EngineBay.js: x across, y up, z from the hinge), per fault
export const BAY_SPOTS = {
  battery: [[0.42, 0.137, 0.73], [0.42, 0.132, 0.93], [0.42, 0.137, 0.73]],
  overheat: [[0.26, 0.05, 1.0], [0.3, 0.066, 0.73], [0.32, 0.07, 0.86], [0.56, 0.116, 0.6]],
  other: [[-0.03, 0.13, 0.6], [0.42, 0.045, 0.66], [-0.47, 0.1, 0.84], [0.08, 0.13, 0.6], [-0.5, 0.08, 0.5]],
};
export function baySpot(R, kind, i) { const L = BAY_SPOTS[kind] || BAY_SPOTS.other; return L[i % L.length]; }
export function bayWorld(R, sp, out) { const B = R.bonnet; if (!B || !B.bay) return null; B.bay.updateWorldMatrix(true, false); return out.set(sp[0], sp[1], sp[2]).applyMatrix4(B.bay.matrixWorld); }
// a spanner on a bolt in the bay: ratchet strokes about the bolt's axis (pull, reset), the left hand braced beside the work.
// Sets the right hand's wrist + orientation (W.holdR / W.qR) so the spanner in the fist sits on the bolt; returns false if no bay
export function spannerWork(rs, o, R, sp, W, t) {
  const b = bayWorld(R, sp, _bp); if (!b) return false; const dx = b.x - o.x, dz = b.z - o.z, dl = Math.hypot(dx, dz) || 1;
  const P = 1.15, u = (t % P) / P; const A = 0.34; const th = u < 0.55 ? -A + 2 * A * ease(u / 0.55) : A - 2 * A * ease((u - 0.55) / 0.45); // pull … reset
  const c = Math.cos(th), s = Math.sin(th); _z.set((dx * c + dz * s) / dl, 0, (-dx * s + dz * c) / dl); _x.crossVectors(_up, _z); _mb.makeBasis(_x, _up, _z); _tq.setFromRotationMatrix(_mb);
  _tp.copy(b).addScaledVector(_z, -0.11); _tp.y += 0.012 + (u < 0.55 ? 0 : Math.sin(Math.PI * (u - 0.55) / 0.45) * 0.012); // the open end (+0.11) on the bolt; lifts a touch on the reset
  const hw = W.holdR || (W.holdR = { x: 0, y: 0, z: 0 }); const q = W.qR || (W.qR = new THREE.Quaternion()); handFor('spanner', _tp, _tq, _s1, q); hw.x = _s1.x; hw.y = _s1.y; hw.z = _s1.z;
  const lx = Math.cos(o.yaw), lz = -Math.sin(o.yaw); W.holdL = { x: b.x + lx * 0.24 - dx / dl * 0.06, y: b.y + 0.035, z: b.z + lz * 0.24 - dz / dl * 0.06 }; // left palm braced on the engine beside the work
  return true;
}
// the wheel brace on a wheel nut: the socket on the nut, the bar turned about the axle by both hands (cracking / torquing:
// short heaves; running down: continuous turns), nut to nut round the hub. The brace is anchored (o.toolAt), both wrists IK'd to its arms
const _ax = new THREE.Vector3(), _fw = new THREE.Vector3(), _hub = new THREE.Vector3(), _nut = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3();
export function braceWork(rs, o, car, w, W, t, mode) {
  car.mesh.updateWorldMatrix(true, false); w.updateWorldMatrix(true, false); w.getWorldPosition(_hub); const c = Math.cos(car.yaw), sn = Math.sin(car.yaw); const sx = Math.sign(w.position.x) || 1;
  _ax.set(c * sx, 0, -sn * sx); _fw.set(sn, 0, c); // the axle, outward; the car's forward
  const per = mode === 'spin' ? 2.4 : 1.6; const ni = Math.floor(t / per) % 4, a0 = ni * Math.PI / 2 + 0.4; const r = 0.058; // four nuts on the hub face
  _nut.copy(_hub).addScaledVector(_ax, 0.085).addScaledVector(_fw, Math.cos(a0) * r); _nut.y += Math.sin(a0) * r;
  const u = (t % per) / per; let phi; if (mode === 'spin') phi = u * Math.PI * 2; else phi = u < 0.5 ? ease(u / 0.5) * 0.7 : 0.7 - ease((u - 0.5) / 0.5) * 0.7; // heave (crack / torque) or spin
  if (mode === 'loosen') phi = -phi;
  _z.copy(_ax).negate(); // the brace's +z (socket end) into the nut
  _bx.copy(_fw).multiplyScalar(Math.cos(phi)).addScaledVector(_up, Math.sin(phi)); _by.crossVectors(_z, _bx); _mb.makeBasis(_bx, _by, _z); _tq.setFromRotationMatrix(_mb);
  _tp.copy(_nut).addScaledVector(_z, -0.2); o.toolAt = o.toolAt || { p: new THREE.Vector3(), q: new THREE.Quaternion() }; o.toolAt.p.copy(_tp); o.toolAt.q.copy(_tq);
  // right hand: the +x arm's end (handFor); left hand: the -x arm's end, wrist toward the mechanic
  const q = W.qR || (W.qR = new THREE.Quaternion()); handFor('brace', _tp, _tq, _s1, q); W.holdR = { x: _s1.x, y: _s1.y, z: _s1.z };
  _s1.copy(_bx).multiplyScalar(-0.2).add(_tp).addScaledVector(_ax, 0.08); W.holdL = { x: _s1.x, y: _s1.y + 0.02, z: _s1.z };
  return true;
}
export function takeTool(rs, o, K, kind) { const m = K && K.slots[kind]; if (!m) return null; m.updateWorldMatrix(true, false); m.getWorldPosition(_a); rs.g.scene.attach(m); K.out.add(m); m.visible = true; o.tool = m; return m; }
export function putTool(rs, o) { const m = o.tool; o.tool = null; if (!m) return; const K = m.userData.van && m.userData.van.rsKit; if (K) seatKit(K, m); else rs.propsOf().put(m); }

// ---------------------------------------------------------------- the van job plan
export function planVanJob(rs, u) {
  const R = u.rs, v = u.v, inc = R.inc, car = inc.v, A = u.officers[0], B = u.officers[1] || A; const K = vanKit(rs, v); const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const ch = car.T.len / 2, cw = car.T.wid / 2; const night = rs.g.atmos && rs.g.atmos.night > 0.4; const kindJob = FAULT_JOB[inc.kind] || 'simple';
  const D = { assess: rnd(JOB_DUR.assess), setup: rnd(JOB_DUR.setup), inspect: rnd(JOB_DUR.inspect), repair: rnd(JOB_DUR[kindJob]), check: rnd(JOB_DUR.check), cleanup: rnd(JOB_DUR.cleanup) }; R.plan = { kind: kindJob, D, stage: 'assess', log: [] };
  const stage = (s) => () => { R.plan.stage = s; R.plan.log.push(`${rs.t.toFixed(1)} ${s}`); };
  const roadC = -(v.T.wid / 2 + 0.25);
  const atRear = (lx) => Object.assign(() => { const p = rs.w(v, lx, -(v.T.len / 2 + 0.55)); return rs.faceTo(p, p.x + fx, p.z + fz); }, { rear: true }); // (Roadside.mech: waits beside the doors until they are open)
  const openVan = (o, lx) => ({ at: atRear(lx), act: 'mechBend', lean: 0.25, dur: 1.4, start: () => { if (!R.rearOpen) { R.rearOpen = true; rs.sound('rs.van.door', v.x - fx * 2.5, v.z - fz * 2.5, 8); } }, wait: () => true });
  const fetch = (o, kind, two = false, lx = 0) => ({ at: atRear(lx), act: 'mechBend', lean: 0.45, dur: 1.1, wait: () => R.rear > 0.85, start: () => { R.rearOpen = true; rs.sound('rs.tools', v.x - fx * 2.5, v.z - fz * 2.5, 8); }, end: () => takeKit(rs, o, K, kind, two) });
  const putAt = (o, at, act, sound, extra = {}) => ({ at, act, lean: 0.25, dur: extra.dur ?? 1.2, end: () => { const m = rs.unCarry(o); if (!m) return; const p = rs.lastAt(o); const fd = extra.fwd ?? 0.45; rs.place(u, m, p.x + Math.sin(p.yaw) * fd, p.z + Math.cos(p.yaw) * fd, p.yaw + (extra.yaw || 0), extra); if (sound) rs.sound(sound, p.x, p.z, 10); if (extra.then) extra.then(m); } });
  // ---- B: safety first. Out, round to the back, doors open, triangle 12 m behind, two cones on the traffic side (setup time)
  const per = D.setup / (night ? 4 : 3);
  B.q.push(openVan(B, 0.35), fetch(B, 'triangle', false, 0.35), putAt(B, () => rs.w(v, roadC + 0.6, -(v.T.len / 2 + 12), Math.PI), 'mechSquat', 'rs.triangle', { yaw: 0, dur: per * 0.5, then: () => { R.safe = true; } }));
  for (const [k, z] of [[0, -(v.T.len / 2 + 3.5)], [1, -(v.T.len / 2 + 7)]]) B.q.push(fetch(B, 'cone', false, 0.35), putAt(B, () => rs.w(v, roadC - 0.1 + k * 0.4, z, Math.PI), 'mechSquat', 'rs.cone', { dur: per * 0.35 }));
  if (night) B.q.push(fetch(B, 'worklight', false, 0.35), putAt(B, () => rs.faceTo(rs.w(car, -(cw + 0.9), ch * 0.4), car.x, car.z), 'mechBend', null, { yaw: 0, dur: per * 0.4 }));
  // ---- A: assess — the driver first (what happened), then a slow walk round the car looking at it
  const drv = () => rs.faceTo(rs.w(car, -(cw + 0.55), 0.3), car.x, car.z);
  A.q.push({ at: drv, act: null, dur: D.assess * 0.45, look: 0.15, start: () => { stage('assess')(); if (inc.own && rs.g.hud && rs.dP(car.x, car.z) < 30) rs.g.hud.notify('Street Customs Roadside', `The mechanic asks what happened — ${FAULTS_LABEL(inc)}.`, 'info', 3); } });
  for (const [lx, lz] of [[-(cw + 0.7), ch + 0.4], [0, ch + 0.8]]) A.q.push({ at: () => rs.faceTo(rs.w(car, lx, lz), car.x, car.z), act: lz > ch + 0.6 ? 'mechBend' : null, lean: 0.25, look: 0.6, dur: D.assess * 0.27 });
  if (inc.kind === 'flat') { planTyre(rs, u, K, A, B, D, stage, fetch, putAt); return; }
  const usePack = inc.kind === 'battery'; const kit = usePack ? 'battery' : 'toolbox';
  // ---- A: to the van for the kit (waits for the scene to be safe), carried to the car's nose, set down beside the wheel
  A.q.push({ ...fetch(A, kit, false, -0.35), wait: () => R.safe && R.rear > 0.85, start: () => { stage('fetch kit')(); R.rearOpen = true; rs.sound('rs.tools', v.x - fx * 2.5, v.z - fz * 2.5, 8); } });
  A.q.push(putAt(A, () => rs.faceTo(rs.w(car, 0.75, ch + 0.5), car.x, car.z), 'mechSquat', usePack ? 'rs.battery' : 'rs.toolbox.open', { yaw: Math.PI / 2, dur: 1.4 }));
  // ---- open the bonnet: hands to the front edge, release, lift; the edge follows the panel up and the hands with it
  const front = (dx = 0) => () => rs.faceTo(rs.w(car, dx, ch + 0.45), car.x, car.z);
  A.q.push({ at: front(0), act: 'mechBend', lean: 0.45, look: 0.5, dur: 2.2, start: () => { stage('open bonnet')(); const b = bonnetOpen(rs, u, car); if (b) b.goal = 1; rs.sound('rs.bonnet.open', car.x + Math.sin(car.yaw) * ch, car.z + Math.cos(car.yaw) * ch, 9); }, holds: () => bonnetEdge(R, car) || bayPoints(R, car) || [null, null] });
  // ---- inspect: torch-and-look over the bay (B helps: holds the light / looks on the other side)
  A.q.push({ at: front(0), act: 'mechBend', lean: 0.65, look: 0.6, dur: D.inspect, start: () => { stage('inspect')(); R.working = true; rs.sound('rs.inspect', car.x, car.z, 8); }, holds: () => bayPoints(R, car, 0.1, 0.35 + 0.15 * Math.sin(rs.t * 0.7)) || [null, null] });
  // 84th: the battery job needs a spanner too (terminal clamps loosened, cleaned, re-tightened round the jump) — B brings the toolbox
  A.q.push({ at: () => rs.faceTo(rs.w(car, 0.75, ch + 0.95), car.x, car.z), act: 'mechSquat', lean: 0.4, dur: 1.2, wait: () => R.props.some((p) => p.m.userData.kind === 'toolbox') || R.done, start: () => rs.sound('rs.toolbox.open', car.x, car.z, 8), end: () => takeTool(rs, A, K, 'spanner') });
  // ---- repair: several working spells at different spots in the bay (the hands move, the spanner works), with pauses to look
  // 89th: each spell is the spanner on a real fitting of the modelled bay for this fault (terminal clamps, hose clips + the radiator /
  // tank caps, coil packs / alternator / fuse box / air-box clips), ratchet strokes with the left hand braced (spannerWork)
  const sk = inc.kind === 'battery' ? 'battery' : inc.kind === 'overheat' ? 'overheat' : 'other'; const sxB = car.T.wid * 0.78 / 1.3;
  const spells = Math.max(3, Math.round(D.repair / 9)); for (let i = 0; i < spells; i++) { const sp = baySpot(R, sk, i), lx = Math.max(-0.45, Math.min(0.45, sp[0] * sxB * 0.8)), lx0 = [0.15, -0.2, 0.32, -0.05][i % 4], dp = [0.45, 0.6, 0.3, 0.7][i % 4];
    A.q.push({ at: () => rs.faceTo(rs.w(car, lx, ch + 0.36), car.x, car.z), act: 'mechBend', lean: 0.68 + 0.08 * (i % 2), look: 0.7, dur: D.repair / spells * (i % 3 === 2 ? 0.7 : 1), start: i === 0 ? () => { stage('repair')(); } : null,
      holds: () => bayPoints(R, car, lx0, dp) || [null, null], work: (o, W) => (o.tool ? spannerWork(rs, o, R, sp, W, rs.t + i * 0.37) : false),
      every: [usePack ? 3.2 : 2.1, () => rs.sound(usePack ? 'rs.battery' : Math.random() < 0.5 ? 'rs.ratchet' : 'rs.spanner', car.x + Math.sin(car.yaw) * ch, car.z + Math.cos(car.yaw) * ch, 9)] });
    if (i % 3 === 2 && i < spells - 1) A.q.push({ at: front(lx * 0.6 + 0.3), act: null, look: 0.5, dur: 2.5 }); }
  A.q.push({ at: () => rs.faceTo(rs.w(car, 0.75, ch + 0.95), car.x, car.z), act: 'mechSquat', lean: 0.4, dur: 1.0, start: () => putTool(rs, A) });
  // ---- completion check: to the driver's window — "try it now"; the verdict is the car starting (or not)
  const job = rs.faultOf(inc.kind);
  A.q.push({ at: drv, act: null, dur: D.check, look: 0.2, start: () => { stage('check')(); rs.sound(inc.kind === 'battery' || inc.kind === 'nostart' ? 'rs.starter.fail' : 'rs.inspect', car.x, car.z, 8); }, end: () => rs.verdict(u, job) });
  // ---- close the bonnet (hands on the edge as it comes down), pick the kit up, back to the van, into its slot
  A.q.push({ at: front(0), act: 'mechBend', lean: 0.45, dur: 2.0, start: () => { stage('close bonnet')(); if (R.bonnet) R.bonnet.goal = 0; }, end: () => rs.sound('rs.bonnet.close', car.x + Math.sin(car.yaw) * ch, car.z + Math.cos(car.yaw) * ch, 9), holds: () => bonnetEdge(R, car) || [null, null] });
  A.q.push({ at: () => rs.faceTo(rs.w(car, 1.25, ch + 0.5), car.x, car.z), act: 'mechSquat', dur: 1.0, start: () => { stage('return kit')(); rs.sound(usePack ? 'rs.battery' : 'rs.toolbox.close', car.x, car.z, 9); }, end: () => { const kp = R.props.find((p) => p.m.userData.kind === kit); if (kp) { rs.pick(u, kp.m); rs.carry(A, kp.m); } } });
  if (usePack) B.q.push({ ...fetch(B, 'toolbox', false, 0.35), wait: () => R.safe && R.rear > 0.85 }, putAt(B, () => rs.faceTo(rs.w(car, 1.4, ch + 1.2), car.x, car.z), 'mechSquat', 'rs.toolbox.open', { yaw: Math.PI / 2, dur: 1.2 }));
  // ---- B meanwhile: once the bonnet is up, at the other front corner looking in / lighting it for A
  B.q.push({ at: front(0.95), act: 'mechBend', lean: 0.3, look: 0.5, dur: D.inspect * 0.6, wait: () => R.working || R.done, holds: () => { const b = bayPoints(R, car, 0.42, 0.06); return b ? [{ x: b[0].x, y: b[0].y + 0.07, z: b[0].z }, null] : [null, null]; } }); // 89th: palm on the wing's front edge (it was 40 % into the bay: out of reach, the hand sank into the headlamp)
  B.q.push({ at: () => rs.faceTo(rs.w(car, cw + 0.9, ch * 0.2), car.x, car.z), act: null, look: 0.3, dur: D.repair * 0.4, wait: () => R.working || R.done });
}
function FAULTS_LABEL(inc) { return { battery: 'a flat battery', flat: 'a flat tyre', overheat: 'it overheated', nostart: 'it will not start', engine: 'the engine cut out', mechanical: 'a mechanical fault' }[inc.kind] || 'a breakdown'; }
// the tyre change: B brings the jack and the toolbox, A the spare; nuts cracked before the car goes up, wheel off, spare on,
// nuts run down, car down, nuts torqued, the punctured wheel into the van as the new spare
function planTyre(rs, u, K, A, B, D, stage, fetch, putAt) {
  const R = u.rs, car = R.inc.v; const w = rs.wheelOf(car, false); const wl = () => { const wp = w.position; const sx = Math.sign(wp.x) || 1; return { lx: wp.x + sx * 0.75, lz: wp.z, sx }; };
  const atWheel = (off = 0) => () => { const q = wl(); const p = rs.w(car, q.lx, q.lz + off); const c = rs.w(car, q.lx - q.sx * 0.8, q.lz + off); return rs.faceTo(p, c.x, c.z); };
  const hub = () => { car.mesh.updateWorldMatrix(true, false); w.updateWorldMatrix(true, false); w.getWorldPosition(_a); return [{ x: _a.x, y: _a.y + 0.08, z: _a.z + 0.05 }, { x: _a.x, y: _a.y - 0.05, z: _a.z - 0.06 }]; };
  const nut = (t) => D.repair * t; const P = rs.propsOf();
  B.q.push(fetch(B, 'jack', false, 0.35), putAt(B, atWheel(0.55), 'mechSquat', 'rs.equipment', { then: () => { R.jackOut = true; } }));
  B.q.push(fetch(B, 'toolbox', false, 0.35), putAt(B, atWheel(1.5), 'mechSquat', 'rs.toolbox.open', { yaw: Math.PI / 2 }));
  A.q.push({ ...fetch(A, 'tyre', true, -0.35), wait: () => R.safe && R.rear > 0.85, start: () => stage('fetch spare')() }, putAt(A, atWheel(-0.9), 'mechSquat', 'rs.tyre', { rz: Math.PI / 2, dy: 0.1 }));
  A.q.push({ at: atWheel(1.1), act: 'mechSquat', dur: 1.0, wait: () => R.props.some((p) => p.m.userData.kind === 'toolbox'), end: () => takeTool(rs, A, K, 'brace') });
  A.q.push({ at: atWheel(0), act: 'mechSquat', lean: 0.5, dur: nut(0.18), start: () => { stage('crack nuts')(); R.working = true; }, holds: hub, work: (o, W) => (o.tool ? braceWork(rs, o, car, w, W, rs.t, 'loosen') : false), every: [1.6, () => rs.sound('rs.wheelnut', car.x, car.z, 9)] });
  A.q.push({ at: atWheel(0.55), act: 'mechSquat', lean: 0.5, dur: 2.6, wait: () => R.jackOut, start: () => { stage('jack up')(); R.jack = { w, k: 0, goal: 1 }; rs.sound('rs.equipment', car.x, car.z, 8); } });
  A.q.push({ at: atWheel(0), act: 'mechSquat', lean: 0.5, dur: nut(0.22), wait: () => R.jack && R.jack.k > 0.95, holds: hub, work: (o, W) => (o.tool ? braceWork(rs, o, car, w, W, rs.t, 'spin') : false), every: [1.2, () => rs.sound('rs.wheelnut', car.x, car.z, 9)], start: () => stage('wheel off')(),
    end: () => { w.visible = false; const m = P.get('tyre'); const q = wl(); const p = rs.w(car, q.lx - q.sx * 0.15, q.lz + 1.2); rs.place(u, m, p.x, p.z, car.yaw, { rz: Math.PI / 2, dy: 0.1 }); R.flatTyre = m; rs.sound('rs.tyre', p.x, p.z, 9); } });
  A.q.push({ at: atWheel(-0.9), act: 'mechSquat', dur: 1.0, end: () => { const sp = R.props.find((p) => p.m.userData.kind === 'tyre' && p.m !== R.flatTyre); if (sp) { rs.pick(u, sp.m); rs.carry(A, sp.m, true); } } });
  A.q.push({ at: atWheel(0), act: 'mechSquat', lean: 0.5, dur: nut(0.25), every: [1.2, () => rs.sound('rs.wheelnut', car.x, car.z, 9)], holds: hub, work: (o, W) => (o.tool ? braceWork(rs, o, car, w, W, rs.t, 'spin') : false), start: () => { stage('spare on')(); const m = rs.unCarry(A); swapSpare(rs, K, m, R.flatTyre); w.visible = true; rs.fixTyres(car); rs.sound('rs.tyre', car.x, car.z, 9); }, end: () => { if (R.jack) R.jack.goal = 0; } });
  A.q.push({ at: atWheel(0), act: 'mechSquat', lean: 0.5, dur: nut(0.2), wait: () => !R.jack || R.jack.k < 0.02, holds: hub, work: (o, W) => (o.tool ? braceWork(rs, o, car, w, W, rs.t, 'tight') : false), start: () => stage('torque')(), every: [1.8, () => rs.sound('rs.wheelnut', car.x, car.z, 9)] });
  A.q.push({ at: atWheel(1.1), act: 'mechSquat', dur: 1.0, start: () => putTool(rs, A), end: () => { R.ok = true; rs.stats.repaired++; R.working = false; R.done = true; stage('check')(); rs.sound('rs.restart', car.x, car.z, 12); } });
  B.q.push({ at: atWheel(0.55), act: 'mechSquat', dur: 1.0, wait: () => R.done, start: () => { stage('return kit')(); if (R.jack) R.jack = null; }, end: () => { const jp = R.props.find((p) => p.m.userData.kind === 'jack'); if (jp) { rs.pick(u, jp.m); rs.carry(B, jp.m); } } });
  A.q.push({ at: () => { const p = R.flatTyre ? { x: R.flatTyre.position.x, z: R.flatTyre.position.z } : atWheel(1.2)(); return rs.faceTo({ x: p.x + Math.sin(car.yaw) * 0.6, z: p.z + Math.cos(car.yaw) * 0.6 }, p.x, p.z); }, act: 'mechSquat', dur: 1.0, end: () => { if (R.flatTyre) { rs.pick(u, R.flatTyre); rs.carry(A, R.flatTyre, true); R.flatTyre = null; } } });
}
