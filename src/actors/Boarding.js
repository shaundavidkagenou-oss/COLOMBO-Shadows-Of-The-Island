// Getting into / out of a vehicle like a person does it, not "bend down and get slid into the seat".
//
// The old transition faced the body at the door, folded both legs into the sitting pose in mid-air and translated the
// whole seated figure sideways into the cabin. Here the whole body is driven explicitly (hips, trunk, each foot, each
// hand) through a choreographed sequence, every frame solved with the same two-link leg / arm IK the seat pose uses:
//
//  car / van / tuk-tuk (driver seat, door on the right):
//    1. standing beside the opening, facing forward, the outer hand on the open door, the inner hand to the door frame
//    2. the inner leg lifts OVER the sill and is set down in the footwell (the outer foot stays planted on the road)
//    3. ducking under the roof edge (trunk pitched + tilted into the opening), the hips lower onto the seat edge and slide
//       across the cushion; the outer leg is now stretched out of the door, its foot still on the road
//    4. the outer leg lifts over the sill into the footwell, hands go to the wheel, the trunk settles into the seat
//  motorcycle (mounted from the left, side stand down):
//    1. standing on the left, left hand on the left grip, right hand on the tank
//    2. the right leg swings up and back OVER the seat (behind the rider) and is set down on the far side
//    3. sitting down onto the saddle, right hand to its grip; 4. both feet up onto the pegs
//
// Getting out plays the same curve backwards (u = 1 → 0). boardCurve() returns targets in VEHICLE-local metres; feet on
// the road are flagged (g) and carry their height above the ground, which the caller resolves against the real ground
// (a bike leaning on its stand tilts the vehicle frame). The last frame (u = 1) equals the seated pose exactly
// (Seating.seatRest + the same foot / hand targets), so handing over to the seat pose does not pop.
import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';
import { solveLeg, seatRest } from './Seating.js';
import { solveArmIK } from './Character.js';
import { springDoor, doorForSeat } from '../vehicles/DoorRig.js';

const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
const mix = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k), lerp(p[2], q[2], k)];

// seconds for the whole curve (getting out runs at EXIT_K of that)
export const BOARD_T = { car: 2.15, van: 2.6, tuk: 2.0, bike: 2.2 };
export const EXIT_K = 0.88;
export const boardKind = (v) => { const e = v.T.entry || 'car'; return e === 'bike' ? 'bike' : e === 'tuk' ? 'tuk' : e === 'van' ? 'van' : e === 'car' ? 'car' : null; }; // buses / lorry cabs keep their own boarding

// standing hips height above the ground for this skeleton (legs nearly straight)
function legLen(A) { const b = A.ch.bones; return { leg: b.shinL.position.length() + b.footL.position.length(), off: Math.abs(b.thighL.position.x) }; }
// a foot still planted on the road lifts once its hip starts to move out of reach (the weight is off it). The moment is
// found once per vehicle + person from the hip track (stateless and smooth in u): returns the lift 0..1 at u.
const reachR = (G, hip, sd, f) => { const sx = sd === 'L' ? 1 : -1; return Math.hypot(f[0] - hip[0] - sx * G.off, f[1] - hip[1] + 0.03, f[2] - hip[2]) / G.leg; };
function liftAt(G, key, hipAt, sd, f, u, earliest) { // earliest: never before the other foot is down again
  G._lift = G._lift || {}; if (G._lift[key] === undefined) { let u0 = 2; for (let i = 0; i <= 200; i++) { if (reachR(G, hipAt(i / 200), sd, f) > 0.975) { u0 = i / 200; break; } } G._lift[key] = Math.max(earliest, u0 - 0.1); }
  return seg(u, G._lift[key], G._lift[key] + 0.3); // once it lifts the step carries on (never left hovering outside)
}
function standHip(A) {
  if (A._hst) return A._hst; const b = A.ch.bones; const a = b.shinL.position.length(), bl = b.footL.position.length();
  const hy = A.ch.hipY ?? b.hips.position.y; const ankleBind = hy + b.thighL.position.y - a - bl; return (A._hst = hy - (ankleBind - A.ankle) - 0.02);
}
// steering wheel rim grips exactly as poseSeat places them (vehicle-local wrist targets), steer 0
function wheelGrips(seat) {
  const W = seat.wheel; if (!W) return null; const ct = Math.cos(W.tilt), sn = Math.sin(W.tilt);
  const rim = (ang) => [W.p[0] + W.r * Math.cos(ang), W.p[1] + W.r * Math.sin(ang) * ct, W.p[2] + W.r * Math.sin(ang) * sn];
  const l = rim(0.35), r = rim(Math.PI - 0.35); return { L: [l[0] - 0.02, l[1] - 0.01, l[2] - 0.05], R: [r[0] + 0.02, r[1] - 0.01, r[2] - 0.05] };
}
function barGrips(seat) { const B = seat.bars; if (!B) return null; const [gl, gr] = B[0][0] > 0 ? B : [B[1], B[0]]; return { L: [gl[0] - 0.02, gl[1] + 0.03, gl[2] - 0.06], R: [gr[0] + 0.02, gr[1] + 0.03, gr[2] - 0.06] }; }

// Everything the curve needs about this vehicle + this person. side: −1 = door on the right (−x), +1 = left.
// door: { x, z (hinge), len, max } of the hinged driver door (null for none) — the standing spot stays behind its open tip
export function boardGeom(v, seat, A, side, door = null) {
  const kind = boardKind(v); const T = v.T; const rest = seatRest(A, seat); const L = rest.L;
  const G = { kind, s: side, hw: T.wid / 2, seat, rest, fl: seat.floor ?? seat.y - 0.3, fz: L.fz ?? 0.55, fx: L.fx ?? 0.13, toe: L.kind === 'ride' ? 0.12 : 0.06,
    roof: seat.roof ?? 9, hst: standHip(A), ankle: A.ankle, sc: A.s || 1, ...legLen(A), inS: side < 0 ? 'L' : 'R', grips: wheelGrips(seat) || barGrips(seat), stag: L.footStagger || 0 };
  G.feetEnd = { L: [seat.x + G.fx, G.fl + G.ankle, seat.z + G.fz], R: [seat.x - G.fx, G.fl + G.ankle, seat.z + G.fz + G.stag] };
  G.hipEnd = [seat.x, seat.y + rest.hipUp, seat.z + rest.hipZ];
  G.z0 = door ? Math.min(seat.z - 0.03, door.z - door.len * Math.cos(door.max * 1.05) - 0.46) : seat.z - 0.03; // standing z (between the open door and the B-pillar)
  G.frameZ = Math.min(G.z0 + 0.55, door ? door.z - 0.14 : seat.z + 0.6); // door-frame grip forward toward the A-pillar (elbow bent, never at the shoulder)
  return G;
}

// Foot targets are { p: [x, y, z], gk }: y is measured from the vehicle frame (gk = 0) or from the road under the foot
// (gk = 1, the caller adds the ground height); gk blends smoothly while a foot travels from the road into the vehicle.
// stepOver: lift almost in place, carry across at height (clearing `top`), set down — a → b.
function stepOver(a, b, q, top, gkA, gkB) {
  const r = sm(q / 0.34), c = sm((q - 0.22) / 0.56), d = sm((q - 0.7) / 0.3);
  const x = lerp(a[0], b[0], c), z = lerp(a[2], b[2], sm(q * 1.15 - 0.05));
  const yTop = Math.max(top, a[1], b[1]); const y = q < 0.7 ? lerp(a[1], yTop, r) : lerp(yTop, b[1], d);
  return { p: [x, y, z], gk: lerp(gkA, gkB, c) };
}

// ---- car / van / tuk-tuk ------------------------------------------------------------------------------------------
function carHip(G, u) {
  const { s, hw, seat: S, hst } = G; const p1 = seg(u, 0, 0.3), p2 = seg(u, 0.26, 0.72), p3 = seg(u, 0.68, 1);
  const H0 = [s * (hw + 0.24), hst, G.z0], H1 = [s * (hw + 0.17), hst - (G.kind === 'van' ? 0.03 : 0.07), G.z0];
  const Hend = G.hipEnd; const H2 = [Hend[0] + s * 0.05, Hend[1] + 0.012, Hend[2]];
  if (p3 > 0) return mix(H2, Hend, sm(p3));
  if (p2 > 0) return [lerp(H1[0], H2[0], sm((p2 - 0.18) / 0.82)), lerp(H1[1], H2[1], sm(p2 / 0.55)), lerp(H1[2], H2[2], sm(p2))];
  return mix(H0, H1, sm(p1));
}
function carCurve(G, u) {
  const { s, hw, seat: S, rest, fl, hst, ankle } = G; const inS = G.inS, outS = inS === 'L' ? 'R' : 'L';
  const van = G.kind === 'van'; const tuk = G.kind === 'tuk';
  const p1 = seg(u, 0, 0.3), p2 = seg(u, 0.26, 0.72), p3 = seg(u, 0.68, 1);
  const hip = carHip(G, u); const H0 = [s * (hw + 0.24), hst, G.z0];
  // trunk: lean into the step, duck (pitch + spine curl + tilt into the opening) while the head passes the roof edge
  const duckMax = (tuk ? 0.35 : van ? 0.6 : 1.1) * (1 + Math.max(0, G.sc - 1) * 1.6); // tall people duck deeper
  const duck = sm(p2 / 0.3) * (1 - sm(p3 / 0.55)) * duckMax; // held until the hips are on the cushion, released while the outer leg comes in
  let pitch = lerp(0, 0.16, sm(p1)); pitch = lerp(pitch, 0.56 * duckMax, sm(p2 / 0.32)); pitch = lerp(pitch, rest.lean, sm((p2 - 0.58) / 0.42));
  const roll = s * 0.22 * duck / Math.max(duckMax, 0.01); // head leans into the opening (toward the cabin centre)
  // feet
  const gIn = [H0[0] - s * 0.11, ankle, G.z0 + 0.02], gOut = [H0[0] + s * 0.11, ankle, G.z0 - 0.03];
  const top = fl + ankle + 0.07; const feet = {};
  const fIn = G.feetEnd[inS], fOut = G.feetEnd[outS];
  const sillIn = [s * (hw - (tuk ? 0.2 : 0.28)), fl + ankle, S.z + (tuk ? 0.12 : 0.2)]; // just inside the sill (reachable while still standing outside)
  feet[inS] = p1 < 1 ? stepOver(gIn, sillIn, p1, top, 1, 0) : { p: mix(sillIn, fIn, sm((p2 - 0.45) / 0.55)), gk: 0 }; // inner leg over the sill, then slides to the pedals once the hips are in
  feet[outS] = stepOver(gOut, fOut, Math.max(p3, liftAt(G, 'out', (x) => carHip(G, x), outS, gOut, u, 0.3)), top + 0.01, 1, 0); // outer leg last (it leaves the road early when the seat is high / far in)
  // hands: inner → door frame (roof edge above the opening) then the wheel; outer → open door top, then the wheel
  const hands = {}, hw8 = {}; const grips = G.grips;
  const frame = [s * (hw - 0.09), Math.min(G.roof + 0.0, hst + 0.75), G.frameZ];
  if (grips) { // frame → wheel along a curve bowed forward (stays at arm's length in front of the ducked shoulder)
    const t = sm((p2 - 0.28) / 0.66), g = grips[inS]; const C = [(frame[0] + g[0]) / 2, (frame[1] + g[1]) / 2, Math.max(frame[2], g[2]) + 0.22];
    hands[inS] = [0, 1, 2].map((k) => (1 - t) * (1 - t) * frame[k] + 2 * t * (1 - t) * C[k] + t * t * g[k]); hw8[inS] = sm(p1 / 0.95); }
  else { hands[inS] = frame; hw8[inS] = sm(p1 / 0.95) * (1 - sm((p2 - 0.45) / 0.45)); }
  const door = G.doorGrip ? G.doorGrip() : null; const outHold = 1 - sm((p3 - 0.1) / 0.5);
  if (grips) { hands[outS] = door ? mix(door, grips[outS], sm((p3 - 0.1) / 0.75)) : grips[outS]; hw8[outS] = door ? sm(p1 / 0.8) : sm((p3 - 0.15) / 0.7); } // door → wheel at full weight (no dip back to the base pose)
  else if (door) { hands[outS] = door; hw8[outS] = sm(p1 / 0.8) * outHold; }
  return { hip, pitch, roll, twist: 0, duck, feet, legSeat: sm((u - 0.86) / 0.14), poleK: { [inS]: sm(p3 / 0.85), [outS]: sm((p3 - 0.2) / 0.8) }, hands, handW: hw8, grip: { [inS]: grips && !G.lap ? sm((p2 - 0.42) / 0.58) : 0, [outS]: grips && !G.lap ? sm((p3 - 0.5) / 0.5) : 0 }, align: sm((u - 0.3) / 0.6), seated: u >= 1 };
}

// Catmull-Rom through key points K at knot times T (0..1)
function spline(K, T, t) {
  let i = 0; while (i < T.length - 2 && t > T[i + 1]) i++; const f = clamp((t - T[i]) / (T[i + 1] - T[i]), 0, 1);
  const P0 = K[Math.max(0, i - 1)], P1 = K[i], P2 = K[i + 1], P3 = K[Math.min(K.length - 1, i + 2)]; const f2 = f * f, f3 = f2 * f;
  return [0, 1, 2].map((k) => 0.5 * (2 * P1[k] + (-P0[k] + P2[k]) * f + (2 * P0[k] - 5 * P1[k] + 4 * P2[k] - P3[k]) * f2 + (-P0[k] + 3 * P1[k] - 3 * P2[k] + P3[k]) * f3));
}
// ---- motorcycle (mount from the left, +x) ----------------------------------------------------------------------------
function bikeHip(G, u) {
  const { seat: S, hst } = G; const p1 = seg(u, 0, 0.5), p2 = seg(u, 0.44, 0.8), p3 = seg(u, 0.76, 1);
  const H0 = [0.4, hst, S.z + 0.06], H1 = [0.17, hst - 0.09, S.z + 0.02]; const Hend = G.hipEnd;
  if (p3 > 0) return [Hend[0], lerp(Hend[1] + 0.01, Hend[1], sm(p3)), Hend[2]];
  if (p2 > 0) return [lerp(H1[0], Hend[0], sm(p2)), lerp(H1[1], Hend[1] + 0.01, sm(p2 / 0.8)), lerp(H1[2], Hend[2], sm(p2))];
  return mix(H0, H1, sm(p1));
}
function bikeCurve(G, u) {
  const { seat: S, rest, hst, ankle } = G; const grips = G.grips;
  const p1 = seg(u, 0, 0.5), p2 = seg(u, 0.44, 0.8), p3 = seg(u, 0.76, 1);
  const H0 = [0.4, hst, S.z + 0.06]; const hip = bikeHip(G, u);
  const pitch = lerp(lerp(0.05, 0.42, sm(p1 / 0.6)), rest.lean, sm(p2)); const roll = 0.12 * Math.sin(Math.PI * p1); // lean over the bike (toward −x) while the leg swings
  const twist = 0.18 * Math.sin(Math.PI * p1);
  const gL = [H0[0] + 0.11, ankle, S.z + 0.04], gR0 = [H0[0] - 0.11, ankle, S.z + 0.0], pR = G.feetEnd.R, pL = G.feetEnd.L;
  const feet = {};
  // right leg: up, back over the saddle (behind the rider) and down onto the right peg (the bike stands on its side stand,
  // so a seated rider needs no foot on the road)
  // (a spline through: road → up and back on the near side → over the rear of the saddle → out to the right and lowering
  // while still behind the hip (leg extended, knee down) → forward onto the peg)
  { const b = Math.min(1.05, G.sc); const K = [gR0, [H0[0] - 0.06, S.y + 0.02, S.z - 0.42 * b], [0.02, S.y + 0.2, S.z - 0.6 * b], [pR[0] - 0.12, S.y - 0.02, S.z - 0.46 * b], pR];
    feet.R = { p: spline(K, [0, 0.27, 0.5, 0.7, 1], p1), gk: 1 - sm(p1 / 0.27) }; }
  // left foot: on the road until the hips are on the saddle (or it runs out of reach), then up onto the left peg
  feet.L = stepOver(gL, pL, Math.max(p3, liftAt(G, 'L', (x) => bikeHip(G, x), 'L', gL, u, 0.5)), pL[1] + 0.06, 1, 0);
  const tank = [S.x, S.y + 0.12, S.z + 0.34];
  const hands = { L: grips ? grips.L : tank, R: grips ? mix(tank, grips.R, sm((p2 - 0.1) / 0.6)) : tank }; const handW = { L: sm(u / 0.25), R: sm(u / 0.3) };
  return { hip, pitch, roll, twist, duck: 0, feet,  legSeat: sm((u - 0.86) / 0.14), hands, handW, grip: { L: 1, R: grips ? sm((p2 - 0.4) / 0.4) : 0 }, align: sm((u - 0.5) / 0.5), seated: u >= 1 };
}

export function boardCurve(G, u) { return G.kind === 'bike' ? bikeCurve(G, clamp(u, 0, 1)) : carCurve(G, clamp(u, 0, 1)); }

// ---- the pose -------------------------------------------------------------------------------------------------------
// A.board = { hip, pitch, roll, twist, duck, feet: {L, R} (root-local ankle targets), toe, hands {L, R} root-local or
// null, handW, grip, lean0 } — applied by the Animator after the base pose (replaces the seat pose while boarding).
const _e = new THREE.Euler(), _qh = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _q = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _k = new THREE.Vector3();
const _u = new THREE.Vector3(), _n = new THREE.Vector3(), _kn = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _mb = new THREE.Matrix4(), _qp = new THREE.Quaternion();
// Two-link leg IK with a knee pole (root space): the knee bends toward `pole` (forward and a little up), so a foot lifted
// to hip height beside the body (stepping over a sill while seated) keeps the knee up and forward instead of the leg plane
// spinning sideways. Writes the thigh's root-space quaternion to qOut and returns the knee flexion.
function poleLeg(H, F, a, b, pole, qOut) {
  _u.subVectors(F, H); let d = _u.length(); _u.divideScalar(d || 1); d = clamp(d, Math.abs(a - b) + 1e-3, (a + b) * 0.999);
  _n.copy(pole).addScaledVector(_u, -pole.dot(_u)); if (_n.lengthSq() < 1e-6) _n.set(0, 0, 1).addScaledVector(_u, -_u.z); _n.normalize();
  const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  _kn.copy(H).addScaledVector(_u, a * ca).addScaledVector(_n, a * sa); // knee point
  _by.subVectors(H, _kn).normalize(); _bz.copy(_n).addScaledVector(_by, -_n.dot(_by)).normalize(); _bx.crossVectors(_by, _bz);
  _mb.makeBasis(_bx, _by, _bz); qOut.setFromRotationMatrix(_mb);
  return Math.PI - Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
}
const _pl = new THREE.Vector3(); const _pole = new THREE.Vector3(), _pd = new THREE.Vector3(); const _qa2 = new THREE.Quaternion(), _qb2 = new THREE.Quaternion();
// P.w < 1 blends from whatever the base pose is (mid-stride as the walk to the sill ends, the standing idle) into the
// boarding pose, so neither end of the motion pops.
const _baseQ = new Map(); const _baseHip = new THREE.Vector3();
export function applyBoardPose(A) {
  const P = A.board; if (!P) return; const b = A.ch.bones; const w = P.w ?? 1;
  if (w < 1) { for (const k in b) { let q = _baseQ.get(k); if (!q) _baseQ.set(k, (q = new THREE.Quaternion())); q.copy(b[k].quaternion); } _baseHip.copy(b.hips.position); }
  boardPoseFull(A, P, b);
  if (w < 1) { for (const k in b) b[k].quaternion.slerp(_baseQ.get(k), 1 - w); b.hips.position.lerp(_baseHip, 1 - w); }
}
function boardPoseFull(A, P, b) {
  const a = b.shinL.position.length(), bl = b.footL.position.length();
  b.hips.position.set(P.hip[0], P.hip[1], P.hip[2]);
  _e.set(P.pitch, P.twist || 0, P.roll || 0, 'YXZ'); _qh.setFromEuler(_e); b.hips.quaternion.copy(_qh);
  const d = P.duck || 0; const lean = P.pitch; const R = (bone, x, y, z) => { _e.set(x, y, z, 'XYZ'); b[bone].quaternion.setFromEuler(_e); };
  R('spine', 0.05 + d * 0.38, -(P.twist || 0) * 0.5, -(P.roll || 0) * 0.3); R('chest', 0.03 + d * 0.2, -(P.twist || 0) * 0.4, -(P.roll || 0) * 0.25);
  R('neck', -lean * 0.55 + 0.02 - d * 0.12, 0, -(P.roll || 0) * 0.3); R('head', -lean * 0.45 - d * 0.1, 0, 0);
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1; const tb = b['thigh' + sd]; const F = P.feet[sd]; if (!F) continue;
    _v.copy(tb.position).applyQuaternion(_qh).add(_w.set(P.hip[0], P.hip[1], P.hip[2]));
    _k.set(F[0], F[1], F[2]); const behind = sm((_v.z - _k.z - 0.05) / 0.55); _pl.set(0, lerp(0.35, -0.8, behind), lerp(1, 0.45, behind)).normalize();
    const po = P.poleOut ? (P.poleOut[sd] || 0) * (1 - behind) : 0; if (po > 0) _pl.lerp(_pd.set(sd === 'L' ? 0.8 : -0.8, -0.1, 0.6).normalize(), po).normalize(); // knee forward-up; down for a foot swung behind the hip (leg over a saddle)
    let knee = poleLeg(_v, _k, a, bl, _pl, _qw); const ls = P.legSeat || 0;
    if (ls > 0) { const Lg = solveLeg(_v, _k, a, bl); _e.set(-Lg.theta, 0, Lg.gamma, 'ZXY'); _qp.setFromEuler(_e); _qw.slerp(_qp, ls); knee = lerp(knee, Lg.knee, ls); } // the seat pose's solver at the very end (seamless hand-over)
    _qt.copy(_qh).invert().multiply(_qw); tb.quaternion.copy(_qt);
    _e.set(knee, 0, 0, 'XYZ'); _qs.setFromEuler(_e); b['shin' + sd].quaternion.copy(_qs);
    _q.copy(_qw).multiply(_qs).invert(); _e.set(P.toe ?? 0.06, sx * 0.08, 0, 'XYZ'); _qt.setFromEuler(_e).premultiply(_q); b['foot' + sd].quaternion.copy(_qt);
  }
  const root = A.ch.root; root.updateWorldMatrix(true, false);
  for (const sd of ['L', 'R']) {
    const t = P.hands && P.hands[sd]; const w = P.handW ? P.handW[sd] ?? 0 : 0; if (!t || w < 0.001) continue;
    // blend the hand POSITION from where the base pose holds it to the grip and always solve at full weight (slerping the
    // arm rotation toward a raised grip ~180° away flips the arm to the other side half-way)
    b['hand' + sd].updateWorldMatrix(true, false); _w.setFromMatrixPosition(b['hand' + sd].matrixWorld); b.chest.worldToLocal(_w);
    b.chest.updateWorldMatrix(true, false); _v.set(t[0], t[1], t[2]); root.localToWorld(_v); b.chest.worldToLocal(_v); if (w < 1) _v.lerpVectors(_w, _v, w);
    // never fold the arm flat (a hand target at the shoulder has no defined elbow): slide the target out along its line
    const arm = b['arm' + sd], par = arm.parent; par.updateWorldMatrix(true, false); _w.copy(arm.position).applyMatrix4(par.matrixWorld); b.chest.worldToLocal(_w);
    { _k.subVectors(_v, _w); const mn = 0.3 * (A.s || 1), soft = mn * 1.5; let dl = _k.length();
      // a path that passes close by the shoulder (rear seats: low roof edge → lap) is eased out forward-and-down in the BODY
      // frame — a fixed direction, so the hand never swings round the shoulder the way sliding it along the (rapidly turning)
      // shoulder→target line does
      if (P.lapSoft && dl < soft) { root.getWorldQuaternion(_qa2); par.getWorldQuaternion(_qb2); _pd.set(0, -0.55, 0.84).applyQuaternion(_qa2).applyQuaternion(_qb2.invert()); const f = (soft - dl) / soft, fade = 1 - (P.legSeat || 0); /* none once settled: the seat pose itself holds the hand there */ _v.addScaledVector(_pd, (soft - dl) * (1.1 + f) * fade); _k.subVectors(_v, _w); dl = _k.length(); }
      if (dl < mn) _v.copy(_w).addScaledVector(dl > 1e-4 ? _k.divideScalar(dl) : _k.set(0, 0, 1), mn); }
    // elbow pole: out, down and a little back in the BODY frame (the chest is pitched far forward while ducking, so a
    // chest-space "down" pole would point straight at the wheel and flip), blended into the seat pose's pole at the end
    const pk = clamp(P.poleK ? P.poleK[sd] ?? 1 : P.grip ? P.grip[sd] || 0 : 0, 0, 1); const sx = sd === 'L' ? 1 : -1;
    root.getWorldQuaternion(_qa2); par.getWorldQuaternion(_qb2); _pole.set(sx * 0.8, -0.45, -0.3).applyQuaternion(_qa2).applyQuaternion(_qb2.invert()).normalize();
    _pole.lerp(_pd.set(sx * 0.45, -1, -0.15).normalize(), pk);
    solveArmIK(b, sd, _v, null, 1, pk >= 0.999 ? null : _pole);
    const g = P.grip ? P.grip[sd] || 0 : 0; if (g > 0.001) { _e.set(0.25, 0, sd === 'L' ? -0.3 : 0.3, 'XYZ'); _q.setFromEuler(_e); b['hand' + sd].quaternion.slerp(_q, Math.min(1, g)); }
  }
}

// Place the root and convert a curve frame (vehicle-local) into A.board (root-local). ground(x, z) → vehicle-local y of
// the road under a vehicle-local point (the caller knows the world); yaw0: root yaw (vehicle frame) while standing.
// The root is upright in the WORLD while standing (a bike leaning on its stand tilts the vehicle frame) and blends into
// the vehicle frame as the person sits (align → 1).
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _p = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
export function poseBoard(A, G, F, vehMesh, ground, yaw0 = 0, w = 1) {
  const root = A.ch.root; const gy = ground(F.hip[0], F.hip[2]);
  // root orientation: world-upright yaw → vehicle frame
  vehMesh.updateMatrixWorld(); vehMesh.getWorldQuaternion(_qa); const wy = new THREE.Euler().setFromQuaternion(_qa, 'YXZ').y;
  _qb.setFromEuler(_e.set(0, wy + yaw0, 0, 'YXZ')); _qa.invert().multiply(_qb); // local quaternion that is upright in the world
  root.quaternion.copy(_qa).slerp(_q.set(0, 0, 0, 1), F.align); root.position.set(F.hip[0], gy, F.hip[2]); // root on the road under the hips; the hips carry the height
  root.updateMatrix(); _mi.copy(_m.compose(root.position, root.quaternion, _one)).invert();
  const L = (p) => { _p.set(p[0], p[1], p[2]).applyMatrix4(_mi); return [_p.x, _p.y, _p.z]; };
  const feet = {}; for (const sd of ['L', 'R']) { const f = F.feet[sd]; if (!f) continue; let p = f.p;
    if (f.gk > 0) p = [p[0], p[1] + f.gk * ground(p[0], p[2]), p[2]];
    feet[sd] = L(p); }
  const hands = {}; for (const sd of ['L', 'R']) if (F.hands[sd]) hands[sd] = L(F.hands[sd]);
  A.board = { w, hip: L(F.hip), pitch: F.pitch, roll: F.roll, twist: F.twist, duck: F.duck, feet, poleOut: F.poleOut, poleK: F.poleK, legSeat: F.legSeat, hands, handW: F.handW, grip: F.grip, toe: G.toe, lapSoft: G.lap && G.kind !== 'tuk' };
}

// ------------------------------------------------------------------ NPC step-in / step-out (police crews, medics, squad)
// The same motion the player uses, run on a timer by the NPC's own update. Helpers shared with Player:
//   boardGroundFn — road height under a vehicle-space point (the body rocks on its springs; a bike leans on its stand),
//   swingDoor     — the driver's door on its damped hinge (opens to the check strap, latches with a slam when pulled shut),
//   npcBoardSetup — geometry for one person + seat, or null when that seat keeps the old path (rear rows, pillion, buses).
const _gm = new THREE.Matrix4(), _gmi = new THREE.Matrix4(), _gp = new THREE.Vector3();
export function boardGroundFn(v, collision) {
  v.mesh.updateMatrixWorld(); _gm.copy(v.mesh.matrixWorld); _gmi.copy(_gm).invert(); const y0 = v.y ?? v.mesh.position.y;
  return (lx, lz) => { _gp.set(lx, 0, lz).applyMatrix4(_gm); _gp.y = collision.groundAt(_gp.x, _gp.z, y0 + 0.6, 1.2); return _gp.applyMatrix4(_gmi).y; };
}
export function swingDoor(v, d, side, target, dt, w = 9, z = 0.7) { if (d && d.side === undefined) d.side = side; return springDoor(v, d, target, dt, w, z); }
// a seat without a wheel / bars (front passenger): the hands' end point is where the seated pose rests them (the lap), measured
// from the seated pose itself so the hand-over between the step-in motion and the seat pose is seamless
export function lapGrips(ch, v, seat, G) {
  if (G.lap || (G.grips && !G.lap)) return; const A = ch.anim, r = ch.root; if (r.parent !== v.mesh) return;
  if (!(A.seated === seat && !A.board)) { r.position.set(seat.x, seat.y, seat.z); r.rotation.set(0, 0, 0); A.sitIn(seat, 1); A.update(0.0001, 0, 0); }
  r.updateMatrixWorld(true); v.mesh.updateMatrixWorld(); _gmi.copy(v.mesh.matrixWorld).invert(); const h = (n) => ch.bones[n].getWorldPosition(new THREE.Vector3()).applyMatrix4(_gmi).toArray();
  G.grips = { L: h('handL'), R: h('handR') }; G.lap = true;
}
export function npcBoardSetup(v, seat, A) {
  const kind = boardKind(v); if (!kind || !seat || !v.driverSeat) return null; const ds = v.driverSeat(); const isDriver = seat === ds || (Math.abs(seat.x - ds.x) < 0.02 && Math.abs(seat.z - ds.z) < 0.02);
  if (kind === 'bike' && !isDriver) return null;
  const ud = v.mesh.userData; let side = kind === 'bike' ? 1 : seat.x < -0.05 ? -1 : seat.x > 0.05 ? 1 : (seat.exit ? Math.sign(seat.exit[0]) || -1 : -1);
  // the seat's own door: front / rear pair, or the van's kerb-side slider (rear rows of a van with no door on the right go in
  // through the slider). Cars with real doors never board a seat no door reaches; tuk-tuks are open at the sides.
  const doored = kind === 'car' || kind === 'van'; let d = doored ? doorForSeat(ud, seat, side) : null;
  if (!d && doored && side < 0 && !isDriver) { const sl = (ud.doors || []).find((q) => q.slide); if (sl && seat.z < sl.hz + 0.12 && seat.z > sl.hz - sl.len - 0.2) { d = sl; side = 1; } }
  if (doored && ud.doors && ud.doors.length && !d) return null;
  if (!doored && kind !== 'tuk' && Math.abs(seat.z - ds.z) > 0.35) return null; // other open bodies: front row only
  const hinged = d && !d.slide; const door = hinged ? { x: d.pivot.position.x, z: d.pivot.position.z, len: d.len, max: d.max } : null;
  const G = boardGeom(v, seat, A, side, door);
  if (door) G.doorGrip = () => { const th = d.max * (d.ang || 0); return [door.x + side * door.len * Math.sin(th) * 0.88, 1.05, door.z - door.len * Math.cos(th) * 0.88]; };
  else if (d) G.doorGrip = () => [d.pivot.position.x + side * 0.02, 1.0, d.pivot.position.z - 0.06]; // slider: its front-edge handle, wherever it has run back to
  const H0 = boardCurve(G, 0).hip; return { v, seat, kind, side, G, door: d || null, H0: [H0[0], H0[2]], T: BOARD_T[kind] };
}
