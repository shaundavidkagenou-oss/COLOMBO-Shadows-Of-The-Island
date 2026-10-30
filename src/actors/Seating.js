// Seated / riding poses for vehicle occupants.
//
// Every seat in a vehicle model (VehicleModels.js) carries a descriptor in vehicle-local metres:
//   { x, y, z        cushion-top centre (the occupant's root is placed exactly here — never sunk below it)
//     floor          height of the surface the feet rest on (floor pan, footboard, foot pegs)
//     fz, fx         feet target: forward distance from the seat point, half spacing between the feet
//     roof           inner roof / canopy height above this seat (the torso reclines so the head clears it)
//     lean           preferred trunk pitch (+ forward, e.g. riders; − recline, e.g. car seats)
//     hands          'wheel' | 'bars' | 'lap'      wheel: {p, r, tilt}   bars: [[x,y,z],[x,y,z]]
//     kind           'drive' | 'sit' | 'ride' (straddle)        driver: true for the controlling seat
//     exit           [x, z] vehicle-local point beside the vehicle where this occupant steps out }
//
// The pose is solved analytically every update (no damping), so an occupant is correct on the very first frame:
//   • hips sit on the cushion (thigh-joint height above the cushion = thigh radius), trunk pitched to `lean`;
//   • the recline needed to clear the roof is derived from the occupant's real body height;
//   • legs: two-link IK in the leg plane (plane splayed about the forward axis for straddling) to the feet target;
//   • feet flat on the floor / pegs; arms by two-link IK to the steering-wheel rim, handlebar grips or the lap.
import * as THREE from 'three';
import { clamp, lerp, damp } from '../core/math.js';
import { solveArmIK } from './Character.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qw = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _k = new THREE.Vector3(), _fo = new THREE.Vector3();

// Pure leg solver (exported for the unit test). Inputs in root space: hip joint H, ankle target F, link lengths a, b.
// Returns { gamma (splay about +z), theta (forward swing of the thigh from straight down), knee (flexion) }.
export function solveLeg(H, F, a, b) {
  const dx = F.x - H.x, dy = F.y - H.y, dz = F.z - H.z;
  const down = Math.hypot(dx, dy); // distance in the splayed leg plane, "downward" component
  const gamma = Math.atan2(dx, -dy); // rotate the leg plane about the forward axis so it contains the target
  const D = clamp(Math.hypot(dz, down), Math.abs(a - b) + 1e-3, (a + b) * 0.999);
  const phi = Math.atan2(dz, down);
  const alpha = Math.acos(clamp((a * a + D * D - b * b) / (2 * a * D), -1, 1));
  const knee = Math.PI - Math.acos(clamp((a * a + b * b - D * D) / (2 * a * b), -1, 1));
  return { gamma, theta: phi + alpha, knee, reach: Math.hypot(dz, down) / (a + b) };
}

// Seat descriptor (vehicle-local) → the occupant's root-local frame (root sits on the seat point, facing +z).
export function seatLocal(seat) {
  const o = (p) => [p[0] - seat.x, p[1] - seat.y, p[2] - seat.z];
  return {
    ...seat, floorRel: (seat.floor ?? seat.y - 0.45) - seat.y, roofRel: (seat.roof ?? seat.y + 9) - seat.y,
    wheelRel: seat.wheel ? { p: o(seat.wheel.p), r: seat.wheel.r, tilt: seat.wheel.tilt } : null,
    barsRel: seat.bars ? seat.bars.map(o) : null,
  };
}

// Apply the seated pose to a character's bones. `A` is the Animator (state: look timers, steer, seat weight).
// The first time a character takes a seat, the recline / cushion sink are fitted against the roof by measuring the
// real skeleton (pose → measure crown → recline more), then cached for that character + seat.
const _saveQ = [], _saveP = new THREE.Vector3();
export function applySeatPose(A, dt) {
  const S = A.seatL; if (!S || A.seatW <= 0) return;
  if (A.seatFitFor !== S) fitSeat(A);
  poseSeat(A, dt, clamp(A.seatW, 0, 1));
}
function fitSeat(A) {
  const S = A.seatL; const b = A.ch.bones; const bl = Object.values(b); const s = A.s;
  bl.forEach((x, i) => { (_saveQ[i] ||= new THREE.Quaternion()).copy(x.quaternion); }); _saveP.copy(b.hips.position);
  A.fitLean = S.lean ?? -0.12; A.fitSink = 0; A.seatFitFor = S; const lim = S.kind === 'ride' ? 0.5 : 0.75;
  for (let it = 0; it < 14; it++) {
    poseSeat(A, 0, 1, true); A.ch.root.updateWorldMatrix(true, true);
    _v.setFromMatrixPosition(b.head.matrixWorld); A.ch.root.worldToLocal(_v); const crown = _v.y + 0.2 * s + 0.02;
    A.fitCrown = crown; if (crown <= S.roofRel - 0.03) break;
    if (Math.abs(A.fitLean) < lim) A.fitLean += A.fitLean > 0.02 ? 0.06 : -0.06; else if (A.fitSink < 0.045) A.fitSink += 0.015; else break;
  }
  bl.forEach((x, i) => x.quaternion.copy(_saveQ[i])); b.hips.position.copy(_saveP);
}
function poseSeat(A, dt, w, fitting = false) {
  const S = A.seatL; const ch = A.ch; const b = ch.bones; const s = A.s;
  const a = b.shinL.position.length(), bl = b.footL.position.length(); const ankle = A.ankle;
  // ---- trunk: hips on the cushion (thigh joint one thigh-radius above the lightly compressed cushion), fitted recline
  const thighR = 0.075 * s * ch.spec.build;
  const hipUp = thighR - b.thighL.position.y - 0.012 - (A.fitSink || 0);
  const lean = A.fitLean ?? S.lean ?? -0.12; A.seatLean = lean;
  const bounce = S.kind === 'ride' || fitting ? 0 : Math.sin(A.t * 13.0 + A.seed * 9) * 0.004 * clamp(A.vehSpeed / 10, 0, 1);
  const hipZ = S.hipZ ?? -0.03;
  b.hips.position.set(lerp(b.hips.position.x, 0, w), lerp(b.hips.position.y, hipUp + bounce, w), lerp(b.hips.position.z, hipZ, w));
  _e.set(lean + (A.brakeLean || 0), 0, A.cornerLean || 0, 'XYZ'); _qh.setFromEuler(_e); b.hips.quaternion.slerp(_qh, w);
  if (!fitting) { // ---- look-around: drivers watch the road with mirror / shoulder checks, passengers look about or out of the window
  A.seatLookT -= dt; if (A.seatLookT <= 0) {
    const drv = S.driver; const r = Math.random();
    A.seatLookTarget = drv ? (r < 0.75 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.4)) : (r < 0.35 ? 0 : r < 0.75 ? Math.sign(S.x || 1) * (0.6 + Math.random() * 0.5) : (Math.random() - 0.5) * 1.2);
    A.seatLookT = drv ? (A.seatLookTarget ? 0.6 + Math.random() * 0.6 : 2 + Math.random() * 4) : 1.5 + Math.random() * 4;
  }
  A.seatLook = damp(A.seatLook || 0, A.seatLookTarget || 0, 4, dt);
  }
  const phone = A.seatMode === 'phone'; const look = fitting ? 0 : A.seatLook || 0;
  const R = (bone, x, y, z) => { _e.set(x, y, z, 'XYZ'); _q.setFromEuler(_e); b[bone].quaternion.slerp(_q, w); };
  const slouch = S.kind === 'ride' ? 0.06 : 0.05;
  R('spine', slouch, look * 0.12, 0);
  R('chest', 0.03, look * 0.15, 0);
  R('neck', -lean * 0.55 + (phone ? 0.25 : 0.02), look * 0.3, 0);
  R('head', -lean * 0.45 + (phone ? 0.25 : 0), look * 0.45, 0);
  if (fitting) return;
  // ---- legs
  const toe = S.kind === 'ride' ? 0.12 : 0.06;
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1; const tb = b['thigh' + sd];
    _v.copy(tb.position).applyQuaternion(_qh).add(_w.set(0, hipUp, hipZ)); // hip joint, root space
    const F = _k.set(sx * (S.fx ?? 0.13), S.floorRel + ankle, S.fz ?? 0.55);
    if (S.footStagger && sd === 'R') F.z += S.footStagger;
    const fo = sd === 'L' ? A.footOverL : null; if (fo && fo.w > 0) F.lerp(_fo.set(fo.x, fo.y + ankle, fo.z), Math.min(1, fo.w)); // kickstand: the left boot on the stand's tang
    const L = solveLeg(_v, F, a, bl);
    _e.set(-L.theta, 0, L.gamma, 'ZXY'); _qw.setFromEuler(_e); // world (root-space) thigh orientation
    _qt.copy(_qh).invert().multiply(_qw); tb.quaternion.slerp(_qt, w); // local = hips⁻¹ · world
    _e.set(L.knee, 0, 0, 'XYZ'); _qs.setFromEuler(_e); b['shin' + sd].quaternion.slerp(_qs, w);
    // foot flat (or slightly toe-down on pegs): local = (hips·thigh·shin)⁻¹ · desired
    _q.copy(_qw).multiply(_qs).invert(); _e.set(toe, sx * 0.08, 0, 'XYZ'); _qt.setFromEuler(_e).premultiply(_q); b['foot' + sd].quaternion.slerp(_qt, w);
    if (sd === 'L') A._kneeL = L; else A._kneeR = L;
  }
  // ---- arms: IK to wheel / bars / lap (targets computed in root space, converted to chest space for the solver)
  const root = ch.root; root.updateWorldMatrix(true, false); b.chest.updateWorldMatrix(true, false);
  const toChest = (x, y, z) => { _v.set(x, y, z); root.localToWorld(_v); return b.chest.worldToLocal(_v.clone()); };
  const lapT = (sx, fwd = 0.6) => { const L = sx > 0 ? A._kneeL : A._kneeR; const hx = sx * b.thighL.position.x * 1.0; // a point on top of the thigh
    const kz = hipZ + Math.sin(L.theta) * a * fwd, ky = hipUp + b.thighL.position.y - Math.cos(L.theta) * a * fwd + thighR + 0.035; return toChest(hx - sx * 0.02, ky, kz); };
  let tL, tR;
  if (S.hands === 'wheel' && S.wheelRel) {
    const W = S.wheelRel; const st = clamp(A.steer || 0, -1, 1) * 0.9; const ct = Math.cos(W.tilt), sn = Math.sin(W.tilt);
    const rim = (ang) => [W.p[0] + W.r * Math.cos(ang), W.p[1] + W.r * Math.sin(ang) * ct, W.p[2] + W.r * Math.sin(ang) * sn];
    const pl = rim(0.35 + st), pr = rim(Math.PI - 0.35 + st); tL = toChest(pl[0] - 0.02, pl[1] - 0.01, pl[2] - 0.05); tR = toChest(pr[0] + 0.02, pr[1] - 0.01, pr[2] - 0.05); // wrist sits just behind the rim
  } else if (S.hands === 'bars' && S.barsRel) {
    const st = clamp(A.steer || 0, -1, 1) * 0.06; const [gl, gr] = S.barsRel[0][0] > 0 ? S.barsRel : [S.barsRel[1], S.barsRel[0]];
    tL = toChest(gl[0] - 0.02, gl[1] + 0.03, gl[2] - 0.06 - st); tR = toChest(gr[0] + 0.02, gr[1] + 0.03, gr[2] - 0.06 + st); // wrist behind / above the grip
  } else {
    tL = lapT(1, 0.62); tR = lapT(-1, 0.55);
    if (phone) tR = toChest(-0.05, hipUp + 0.36, hipZ + 0.3);
    if (A.seatMode === 'rail' && S.rail) tL = toChest(...S.rail);
  }
  solveArmIK(b, 'L', tL, null, w); solveArmIK(b, 'R', tR, null, w);
  const grip = S.hands === 'wheel' || S.hands === 'bars';
  R('handL', grip ? 0.25 : 0.1, 0, grip ? -0.3 : 0.15); R('handR', grip ? 0.25 : 0.1, 0, grip ? 0.3 : -0.15);
}

// Put a character into a seat of a vehicle mesh (parented, so it follows the vehicle with no per-frame snapping).
export function seatCharacter(ch, vehicle, seat, mode = null) {
  if (ch.root.parent !== vehicle.mesh) { ch.root.parent?.remove(ch.root); vehicle.mesh.add(ch.root); }
  ch.root.position.set(seat.x, seat.y, seat.z); ch.root.rotation.set(0, 0, 0);
  ch.anim.set(null); ch.anim.actionW = 0; ch.anim.sitIn(seat, 1, mode); ch.anim.update(0.001, 0);
}
