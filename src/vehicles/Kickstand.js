// Motorcycle side stand (kickstand), shared by every two-wheeler and every rider (player, traffic police, HQ officers).
// The stand sits on the LEFT of the bike (+x in vehicle space; riders mount from the left). A parked bike rests on it,
// leaning ~8° to the left. Getting on: the rider sits, pulls the bike upright, puts the left foot on the stand's tang and
// sweeps it back up. Getting off is the reverse: the left foot flicks the stand down, the bike is leaned onto it, then the
// rider climbs off. Vehicle state: v.stand (0 = up … 1 = down) and v.leanK (0 = upright … 1 = resting on the stand).
import * as THREE from 'three';

export const STAND = { pivot: [0.13, 0.3, -0.02], down: [0.25, 0.015, 0.08], up: [0.16, 0.34, -0.32], len: 0.32 };
export const LEAN = 0.14; // rad, towards +x
export const KICK_UP = 1.05, KICK_DOWN = 1.0; // seconds
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);
const dir = (p) => new THREE.Vector3(p[0] - STAND.pivot[0], p[1] - STAND.pivot[1], p[2] - STAND.pivot[2]).normalize();
export const Q_DOWN = new THREE.Quaternion().setFromUnitVectors(DOWN_AXIS, dir(STAND.down));
export const Q_UP = new THREE.Quaternion().setFromUnitVectors(DOWN_AXIS, dir(STAND.up));
const _q = new THREE.Quaternion(), _t = new THREE.Vector3();
const sm = (a, b, k) => { const t = Math.min(1, Math.max(0, (k - a) / (b - a))); return t * t * (3 - 2 * t); };

let geo = null;
export function standMeshes(mat) {
  if (!geo) { const rod = new THREE.CylinderGeometry(0.011, 0.013, STAND.len, 6); rod.translate(0, -STAND.len / 2, 0); const pad = new THREE.BoxGeometry(0.035, 0.012, 0.05); pad.translate(0.004, -STAND.len, 0.008); const tang = new THREE.BoxGeometry(0.05, 0.012, 0.016); tang.translate(0.03, -STAND.len * 0.55, 0); geo = [rod, pad, tang]; }
  const pv = new THREE.Group(); pv.position.set(...STAND.pivot); for (const g of geo) { const m = new THREE.Mesh(g, mat); m.castShadow = true; pv.add(m); } pv.quaternion.copy(Q_DOWN); return pv;
}
// pose the stand pivot for v.stand
export function syncStand(pivot, k) { pivot.quaternion.slerpQuaternions(Q_UP, Q_DOWN, k); }
// the tang (where the boot pushes) in vehicle space, for stand position k
export function tangAt(k) { _q.slerpQuaternions(Q_UP, Q_DOWN, k); _t.set(0.03, -STAND.len * 0.55, 0).applyQuaternion(_q); return [STAND.pivot[0] + _t.x, STAND.pivot[1] + _t.y, STAND.pivot[2] + _t.z]; }
// the rider's left boot target (seat-root space) during a kick, blended in by weight w
function foot(ch, seat, k, w) { const p = tangAt(k); ch.anim.footOverL = w > 0.001 ? { x: p[0] - seat.x + 0.035, y: p[1] - seat.y + 0.03, z: p[2] - seat.z - 0.07, w } : null; }
// getting on, k = 0…1 over KICK_UP: straighten the bike, boot onto the tang, sweep the stand up, boot back to the peg
export function kickUp(v, ch, seat, k) {
  v.leanK = Math.min(v.leanK ?? 1, 1 - sm(0, 0.35, k)); v.stand = Math.min(v.stand ?? 1, 1 - sm(0.45, 0.8, k));
  foot(ch, seat, v.stand, Math.sin(sm(0.28, 0.98, k) * Math.PI)); if (k >= 1) { v.stand = 0; v.leanK = 0; ch.anim.footOverL = null; }
}
// getting off, k = 0…1 over KICK_DOWN: boot flicks the stand down, then the bike is leaned onto it
export function kickDown(v, ch, seat, k) {
  v.stand = Math.max(v.stand ?? 0, sm(0.15, 0.5, k)); v.leanK = Math.max(v.leanK ?? 0, sm(0.6, 0.95, k));
  foot(ch, seat, v.stand, Math.sin(sm(0.0, 0.62, k) * Math.PI)); if (k >= 1) { v.stand = 1; v.leanK = 1; ch.anim.footOverL = null; }
}
export const isTwoWheel = (v) => v && v.T && v.T.entry === 'bike';
export function parkOnStand(v) { if (isTwoWheel(v)) { v.stand = 1; v.leanK = 1; } }
