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
import { gripFor, solveGrip, boxShape } from '../combat/GripSolver.js';

const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
const mix = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k), lerp(p[2], q[2], k)];

// seconds for the whole curve (getting out runs at EXIT_K of that)
export const BOARD_T = { car: 2.15, van: 2.6, tuk: 2.0, bike: 2.2, cab: 3.6 };
export const EXIT_K = 0.88;
export const boardKind = (v) => { const e = v.T.entry || 'car'; return e === 'bike' ? 'bike' : e === 'tuk' ? 'tuk' : e === 'van' ? 'van' : e === 'cab' ? 'cab' : e === 'car' ? 'car' : null; }; // buses keep their own boarding (BusWalk); lorry cabs climb a step first
// the outer hand's grip on a hinged door (its live rear-top corner)
export function doorGripFn(d, door, side, ch = null) { if (d.cab && d.max > 1.3) return null; /* a lorry door opens ~83° right in front of the climber: nothing on it within a natural reach — the inner hand takes the A-pillar handle, the outer is free */
  const S = side < 0 ? 'R' : 'L'; const H = ch && d.grab ? doorEdgeGrip(ch, d.grab, S) : null;
  if (H) { const out = [0, 0, 0]; return () => { d.pivot.updateMatrix(); _dg.copy(H.wrist).applyMatrix4(d.pivot.matrix); out[0] = _dg.x; out[1] = _dg.y; out[2] = _dg.z; out.q = (out.q || new THREE.Quaternion()).copy(d.pivot.quaternion).multiply(H.q); out.pose = H.pose; out.S = S; out.back = (out.back || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(d.pivot.quaternion); out.inn = (out.inn || new THREE.Vector3()).set(-d.grab.side, 0, 0).applyQuaternion(d.pivot.quaternion); return out; }; } // back: along the door past its rear edge (the way the hand slides off it)
  const f = 0.88, y = d.gripY ?? 1.05; return () => { const th = d.max * (d.ang || 0); return [door.x + side * door.len * Math.sin(th) * f, y, door.z - door.len * Math.cos(th) * f]; }; }
const _dg = new THREE.Vector3(), _dq = new THREE.Quaternion(), _dy = new THREE.Vector3(0, 1, 0);
// how far to open the door so that, standing beside the opening and starting to duck in, the outer hand holds it at a
// comfortable bent-arm reach (~38 cm shoulder → wrist): a sedan's door is held at ~45°, a tall SUV's nearly at its stop.
// (Fully open, the rear edge of a car door is 0.6–0.8 m from the shoulder: out of reach — the old hand floated at it.)
export function doorHoldAngle(G, d, ch, side, force = null) { // force: the door is already at that angle (yanked wide to pull a driver out)
  if (!d || !d.grab || (!d.grab.win && !d.grab.handle) || !ch || (G.kind !== 'car' && G.kind !== 'van')) return 1; /* a cab's door is reached up at from the step: held wide. A frameless car door (no window frame at its rear edge — a coupe's glass tapers to a point there) is held by the panel's top rear corner instead (doorEdgeGrip) */ const S = side < 0 ? 'R' : 'L'; const E = doorEdgeGrip(ch, d.grab, S); if (!E) return 1;
  const sc = G.sc || 1; let best = 1, bc = 1e9;
  const shAt = (u) => { const F = carCurve({ ...G, doorGrip: null }, u); return new THREE.Vector3(F.hip[0] + G.s * 0.18 * sc, F.hip[1] + 0.46 * sc * Math.cos(F.pitch || 0), F.hip[2] + 0.46 * sc * Math.sin(F.pitch || 0)); };
  const US = [0.22, 0.25, 0.28, 0.31, 0.34, 0.37, 0.4]; const SH = US.map(shAt); const bL = ch.bones['fore' + S].position.length() + ch.bones['hand' + S].position.length(), SH30 = shAt(0.3); /* the edge must still be in reach as the duck starts, else the hand lets go before it ever holds the door */
  // the held door must also clear the person standing beside it (hip in the vehicle frame at u 0): a long coupe door held at a
  // sedan's angle passes ~20 cm from the hip and the hanging outer hand is inside it before it reaches for the edge; the hand needs ~36 cm beyond the door card's face
  const H0 = carCurve({ ...G, doorGrip: null }, 0).hip, P0 = d.pivot.position, dLen = d.len || 1; const thick = Math.abs((d.grab.skin || 0) - (d.grab.card || 0)); /* the card stands this far inboard of the hinge line */
  const clearAt = (q) => { const dx = 0, dz = -1; const c = Math.cos(q), s = Math.sin(q); const ux = dx * c + dz * s, uz = -dx * s + dz * c; /* door axis (hinge → rear edge) turned by q about y */
    const px = H0[0] - P0.x, pz = H0[2] - P0.z; const t = Math.max(0, Math.min(dLen, px * ux + pz * uz)); return Math.hypot(px - ux * t, pz - uz * t); };
  for (let a = force ?? 0.5; a <= (force ?? 1) + 0.0001; a += 0.025) { _dq.setFromAxisAngle(_dy.set(0, 1, 0), d.max * a * (side < 0 ? 1 : -1)); _dg.copy(E.wrist).applyQuaternion(_dq).add(d.pivot.position);
    let mn = 9; for (const sh of SH) mn = Math.min(mn, sh.distanceTo(_dg)); const c = Math.abs(SH[1].distanceTo(_dg) - 0.38) + 3 * Math.max(0, 0.3 * sc - mn) + 4 * Math.max(0, SH30.distanceTo(_dg) - bL * 0.8) + 4 * Math.max(0, 0.36 * sc + thick - clearAt(d.max * a * (side < 0 ? 1 : -1))); /* comfortable at the duck, never folded into the shoulder, clear of the hip */ if (c < bc) { bc = c; best = a; } }
  best = +best.toFixed(3); // and where, ducking in, the door's edge passes out of reach: the hand lets go there and goes on to the wheel
  _dq.setFromAxisAngle(_dy.set(0, 1, 0), d.max * best * (side < 0 ? 1 : -1)); const gp = E.wrist.clone().applyQuaternion(_dq).add(d.pivot.position); const b = ch.bones; const L = b['fore' + S].position.length() + b['hand' + S].position.length();
  G.doorRel = 2; for (let u = 0.3; u <= 0.95; u += 0.01) { const F = carCurve({ ...G, doorGrip: null }, u); const sh = _dy.set(F.hip[0] + G.s * 0.18 * sc, F.hip[1] + 0.46 * sc * Math.cos(F.pitch || 0), F.hip[2] + 0.46 * sc * Math.sin(F.pitch || 0)); if (sh.distanceTo(gp) > L * 0.86) { G.doorRel = u; break; } }
  if (force != null && G.doorRel < 0.34) G.doorGrip = null; // wide open: its edge is never within a natural reach — the outer hand goes straight to the wheel
  return best;
}
// the outer hand holding an open door the way people do: palm on the inner door card just ahead of the rear edge, fingers
// round the edge onto the outer skin, thumb up the card — solved on this hero's own hand (GripSolver), in the pivot frame
export function doorEdgeGrip(ch, g, S) {
  return gripFor(ch, g, S, () => { const s = g.side; const W = g.win; // window frame's rear edge (thin: the fingers wrap right round it); cab doors: the panel edge
    const xc = W ? W.x : (g.card + g.skin) / 2, y = W ? W.y : g.y, zR = W ? W.zR : g.zR, t = W ? 0.026 : Math.max(Math.abs(g.skin - g.card), 0.02); const inner = xc - s * t / 2;
    const slab = boxShape(new THREE.Vector3(xc, y, zR + 0.15), 0, [t / 2, 0.12, 0.15], W ? 0.008 : 0.012); if (W && W.tilt) { slab.Y.set(W.tilt, 1, 0).normalize(); slab.X.set(1, -W.tilt, 0).normalize(); } // follows the leaning glass
    return solveGrip(ch.bones, S, { X: new THREE.Vector3(-1, 0, 0), Z: new THREE.Vector3(0, 1, 0), shapes: [slab], at: new THREE.Vector3(inner - s * 0.03, y, zR + 0.05), palm: [0, -0.04, 0.004], thumbAt: new THREE.Vector3(inner - s * 0.012, y + 0.035, zR + 0.1) }); });
}
// the outside door handle (opening the door): the hand comes onto the bar from above, palm on it, fingers curled round its
// lower edge, thumb above it on the skin — pivot frame
export function doorHandleGrip(ch, g, S) {
  if (!g || !g.handle) return null; const h = g.handle;
  return gripFor(ch, g.handle, S, () => { const s = g.side; const bar = h.half ? boxShape(new THREE.Vector3(h.x, h.y, h.z), 0, [h.half, 0.014, 0.065], 0.004) : boxShape(new THREE.Vector3(h.x, h.y, h.z), 0, [Math.abs(h.x - h.skin) + 0.002, 0.015, 0.07], 0.004); /* pull bar standing off the skin (fingers hook behind it) */
    const posts = h.posts ? h.posts.map((dz) => boxShape(new THREE.Vector3((h.x + h.skin) / 2, h.y, h.z + dz), 0, [Math.abs(h.x - h.skin) / 2 + 0.002, 0.01, 0.008], 0.003)) : []; const skin = boxShape(new THREE.Vector3(h.skin - s * 0.03, h.y + 0.05, h.z), 0, [0.03, 0.07, 0.2], 0.01);
    // below the bar the side swells outward (tumblehome): bands of panel at the measured skin, so the curled fingertips stop on it
    const lo = h.lo || [h.skin, h.skin, h.skin]; const band = (dy, x) => boxShape(new THREE.Vector3(x - s * 0.03, h.y - dy, h.z), 0, [0.03, 0.022, 0.2], 0.006);
    const panel = [skin, band(0.0, h.skin), band(0.04, s > 0 ? Math.max(h.skin, lo[0]) : Math.min(h.skin, lo[0])), ...[1, 2].map((i) => band(0.04 * (i + 1), s > 0 ? Math.max(lo[i - 1], lo[i]) : Math.min(lo[i - 1], lo[i])))];
    return solveGrip(ch.bones, S, { rf: 0.0102 /* anatomical finger pads (HeroBody.js) */, X: new THREE.Vector3(1, 0, 0), Z: new THREE.Vector3(0, 0, 1), shapes: [bar, ...posts, ...panel], at: new THREE.Vector3(h.x + s * 0.03, h.y + 0.014, h.z), palm: [0, -0.045, 0.004] /* palm on the bar's outer face, fingers below it curl in under the bar (the old seat put the bar under the first phalanges, which could only open backwards through it) */, thumbAt: new THREE.Vector3(h.skin + s * 0.008, h.y + 0.04, h.z + 0.05) }); });
}

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
  const cs = kind === 'cab' ? v.mesh?.userData?.cabStep : null;
  if (cs) { G.stepY = cs.y; G.z0 = clamp(G.z0, cs.z0 + 0.13, cs.z1 - 0.16); G.handle = [side * cs.handle[0], cs.handle[1], cs.handle[2]]; G.dx = cs.sx - G.hw; G.cabYaw = cs.yaw || 0; G.kneeIn = cs.kneeIn || 0; } // stand ON the tread, inner hand on the A-pillar grab handle
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
  const sy = G.stepY || 0, H0 = [s * (hw + (G.dx ?? 0.24)), hst + sy, G.z0], H1 = [s * (hw + (G.dx ?? 0.24) - 0.07), hst + sy - (G.kind === 'van' ? 0.03 : G.kind === 'cab' ? 0.05 : 0.07), G.z0];
  const Hend = G.hipEnd; const H2 = [Hend[0] + s * 0.05, Hend[1] + 0.012, Hend[2]];
  if (p3 > 0) return mix(H2, Hend, sm(p3));
  if (p2 > 0) return [lerp(H1[0], H2[0], sm((p2 - 0.18) / 0.82)), lerp(H1[1], H2[1], sm(p2 / 0.55)), lerp(H1[2], H2[2], sm(p2))];
  return mix(H0, H1, sm(p1));
}
function carCurve(G, u) {
  const { s, hw, seat: S, rest, fl, hst, ankle } = G; const inS = G.inS, outS = inS === 'L' ? 'R' : 'L';
  const van = G.kind === 'van' || G.kind === 'cab'; const tuk = G.kind === 'tuk'; const cab = G.kind === 'cab', sy = G.stepY || 0;
  const p1 = seg(u, 0, 0.3), p2 = seg(u, 0.26, 0.72), p3 = seg(u, 0.68, 1);
  const hip = carHip(G, u); const H0 = [s * (hw + (G.dx ?? 0.24)), hst + sy, G.z0];
  if (sy || G.kind === 'van') { G.seatHipY ??= carHip(G, 1)[1]; const cap = Math.max(G.seatHipY - 0.025 * (1 - sm((u - 0.84) / 0.16)), G.roof - 0.04 - (1.72 * G.sc - hst)); /* the cushion gives ~2.5 cm under a tall person dropping on (rebounds at the end) */ if (hip[1] > cap) hip[1] = sy ? cap : lerp(hip[1], cap, sm((u - 0.3) / 0.25)); } /* low van cab (no tread): only once going in */
  // ^ truck cab: a person taller than the opening (standing on the tread) keeps the knees bent from the top of the climb (cabCurve rises
  //   straight to this) until the hips are down on the seat — the head never passes the roof edge
  // trunk: lean into the step, duck (pitch + spine curl + tilt into the opening) while the head passes the roof edge
  // truck cab: standing on the tread a person can be taller than the opening (hakobi: 49 cm tread, roof 2.13) -> ducks by the excess
  const cabDuck = cab ? 0.3 + clamp((sy + 1.72 * G.sc - G.roof) * 2, 0, 0.55) : 0;
  // low sports coupés (roof ~1.2–1.3 m): a deeper duck, held a little longer while the hips drop to the low cushion
  const lowR = !van && !tuk && !cab ? clamp((1.34 - (G.roof ?? 2)) * 2.5, 0, 0.35) : 0;
  const duckMax = (cab ? cabDuck : tuk ? 0.35 : van ? 0.6 : 1.1) * (1 + Math.max(0, G.sc - 1) * 1.6) * (1 + lowR * 0.5); // tall people duck deeper
  const dIn = sy ? sm(u / 0.14) : sm(p2 / (0.3 + lowR * 0.8)); // up on a tread the head is level with the roof edge at once (from 0: seamless after the climb)
  const duck = dIn * (1 - (sy ? sm((p3 - 0.3) / 0.6) : sm((p3 - lowR * 1.5) / 0.55))) * duckMax; /* tread (low cab roof): the back stays curled while the trunk passes upright on its way to the seat lean */ // held until the hips are on the cushion, released while the outer leg comes in
  let pitch = lerp(0, 0.16, sm(p1)); pitch = lerp(pitch, 0.56 * duckMax, sy ? dIn : sm(p2 / 0.32)); pitch = lerp(pitch, rest.lean, sm((p2 - 0.58) / 0.42));
  const roll = s * 0.22 * duck / Math.max(duckMax, 0.01); // head leans into the opening (toward the cabin centre)
  // feet
  const gIn = [H0[0] - s * 0.11, ankle + sy, G.z0 + 0.02], gOut = [H0[0] + s * 0.11, ankle + sy, G.z0 - 0.03];
  const top = fl + ankle + (cab ? 0.12 : 0.07); const feet = {};
  const fIn = G.feetEnd[inS], fOut = G.feetEnd[outS];
  const sillIn = [s * (hw - (tuk ? 0.2 : 0.28)), fl + ankle, S.z + (tuk ? 0.12 : 0.2)]; // just inside the sill (reachable while still standing outside)
  feet[inS] = p1 < 1 ? stepOver(gIn, sillIn, p1, top, 1, 0) : { p: mix(sillIn, fIn, sm((p2 - 0.45) / 0.55)), gk: 0 }; // inner leg over the sill, then slides to the pedals once the hips are in
  feet[outS] = stepOver(gOut, fOut, Math.max(p3, liftAt(G, 'out', (x) => carHip(G, x), outS, gOut, u, 0.3)), top + 0.01, 1, 0); // outer leg last (it leaves the road early when the seat is high / far in)
  // hands: inner → door frame (roof edge above the opening) then the wheel; outer → open door top, then the wheel
  const hands = {}, hw8 = {}; const grips = G.grips;
  const frame = G.handle || [s * (hw - 0.09), Math.min(G.roof + 0.0, hst + 0.75), G.frameZ];
  if (grips) { // frame → wheel along a curve bowed forward (stays at arm's length in front of the ducked shoulder)
    const t = sm((p2 - 0.28) / 0.66), g = grips[inS]; const C = [(frame[0] + g[0]) / 2, (frame[1] + g[1]) / 2, Math.max(frame[2], g[2]) + 0.22];
    hands[inS] = [0, 1, 2].map((k) => (1 - t) * (1 - t) * frame[k] + 2 * t * (1 - t) * C[k] + t * t * g[k]); hw8[inS] = cab ? 1 : sm(p1 / 0.95); }
  else { hands[inS] = frame; hw8[inS] = sm(p1 / 0.95) * (1 - sm((p2 - 0.45) / 0.45)); }
  const door = G.doorGrip ? G.doorGrip() : null; const outHold = 1 - sm((p3 - 0.1) / 0.5);
  const tOut = Math.max(sm((p3 - 0.1) / 0.75), seg(u, (G.doorRel ?? 2) - 0.1, (G.doorRel ?? 2) + 0.4)); // leaves the door edge before it is out of reach
  if (grips) { hands[outS] = door ? mix(door, grips[outS], door.back ? sm(seg(tOut, 0.3, 1)) : tOut) : grips[outS]; if (door && door.back) { const b = 0.06 * Math.sin(Math.PI * seg(tOut, 0.12, 0.6)), c = 0.14 * Math.sin(Math.PI * seg(tOut, 0.15, 1)); hands[outS][0] += door.back.x * b + door.inn.x * c; hands[outS][2] += door.back.z * b + door.inn.z * c; } /* slides off the edge (fingers uncurling) before it heads in for the wheel — never dragged back through the frame */ if (door) { const lowK = clamp((1.3 - G.roof) / 0.1, 0, 1); if (lowK > 0) { const ts = door.back ? sm(seg(tOut, 0.3, 1)) : tOut; hands[outS][2] += 0.26 * lowK * Math.sin(Math.PI * ts); hands[outS][1] += 0.05 * lowK * Math.sin(Math.PI * ts); } } /* a low coupe: the deep duck puts the shoulder on the straight door → wheel line, so it bows forward in front of it like the inner hand's */ hw8[outS] = door ? (cab ? 1 : sm(p1 / 0.8)) : sm((p3 - 0.15) / 0.7); } // door → wheel at full weight (no dip back to the base pose)
  else if (door) { hands[outS] = door; hw8[outS] = (cab ? 1 : sm(p1 / 0.8)) * outHold * (1 - sm(seg(u, (G.doorRel ?? 2) - 0.1, (G.doorRel ?? 2) + 0.25))); }
  if (cab && !grips) hw8[inS] = 1 - sm((p2 - 0.45) / 0.45); // passenger: off the handle once seated
  const handQ = {}, fing = {}; if (door && door.q) { const k = grips ? 1 - sm(seg(tOut, 0.25, 0.7)) : outHold * (1 - sm(seg(u, (G.doorRel ?? 2) - 0.1, (G.doorRel ?? 2) + 0.25))); handQ[outS] = { q: door.q, w: k }; fing[outS] = { p: door.pose, w: (grips ? 1 - sm(tOut / 0.3) : k) * sm(seg(hw8[outS] || 0, 0.85, 1)) }; /* fingers close round the edge only as the hand arrives */
    if (door.back && hands[outS]) { const a = 1 - sm(seg(hw8[outS] || 0, 0.3, 1)); hands[outS] = [hands[outS][0] + (door.back.x * 0.08 + door.inn.x * 0.06) * a, hands[outS][1], hands[outS][2] + (door.back.z * 0.08 + door.inn.z * 0.06) * a]; } } // comes onto the edge from behind it, not through the frame // the solved door grasp: hand orientation + fingers, released as the hand leaves for the wheel
  return { yaw: G.stepY ? s * lerp(-(G.cabYaw || CAB_YAW), 0.35, sm(p2 / 0.7)) * (1 - sm((p3 - 0.55) / 0.45)) : 0, /* faces the cab while climbing, then swivelled on the seat toward the door while the outer leg comes in (its knee points out of the opening, not at the hinge) */ hip, pitch, roll, twist: 0, duck, feet, legSeat: sm((u - 0.86) / 0.14), poleK: { [inS]: sm(p3 / 0.85), [outS]: sm((p3 - 0.2) / 0.8) }, poleIn: cab ? { [inS]: 0, [outS]: sm((u - 0.25) / 0.12) * (1 - sm((u - 0.8) / 0.15)) } : null, hands, handW: hw8, handQ, fing, grip: { [inS]: grips && !G.lap ? sm((p2 - 0.42) / 0.58) : 0, [outS]: grips && !G.lap ? sm((p3 - 0.5) / 0.5) : 0 }, align: sm((u - 0.3) / 0.6), seated: u >= 1 };
}

// ---- lorry cab: up onto the tread first ----------------------------------------------------------------------------
// standing on the road beside the step: inner hand to the A-pillar grab handle, outer hand to the open door, the inner foot
// goes up onto the tread, the body pulls up on the handle, the outer foot follows; from there it is the car sequence with
// everything raised by the step (feet over the sill onto the cab floor, hips onto the high seat)
const CLIMB = 0.3, CAB_YAW = 0.75; // climbing faces partly toward the cab (the knee goes in through the opening, not forward past the hinge)
const stepArc = (a, b, q, lift) => { const t = sm(q), h = Math.sin(Math.PI * clamp(q, 0, 1)) * lift; return { p: [lerp(a[0], b[0], t), lerp(a[1], b[1], t) + h, lerp(a[2], b[2], sm(q * 1.1 - 0.05))], gk: 1 }; }; // foot up onto / down off the tread
function cabCurve(G, u) {
  if (!G.stepY) return carCurve(G, u); if (u >= CLIMB) return carCurve(G, (u - CLIMB) / (1 - CLIMB));
  const k = u / CLIMB, B = carCurve(G, 0), { s, hw, hst, ankle } = G, sy = G.stepY, inS = G.inS, outS = inS === 'L' ? 'R' : 'L';
  const R0 = [s * (hw + G.dx + 0.26), hst, G.z0 - 0.04], up = sm((k - 0.3) / 0.6);
  const hip = [lerp(R0[0], B.hip[0], sm((k - 0.12) / 0.7)), lerp(R0[1], B.hip[1], up), lerp(R0[2], B.hip[2], sm(k))];
  const fIn0 = [R0[0] - s * 0.11, ankle, G.z0 + 0.0], fOut0 = [R0[0] + s * 0.11, ankle, G.z0 - 0.08];
  const feet = { [inS]: stepArc(fIn0, B.feet[inS].p, seg(k, 0.18, 0.56), 0.1), [outS]: stepArc(fOut0, B.feet[outS].p, seg(k, 0.38, 0.82), 0.12) }; // the trailing foot pushes off as the hip rises (planted any longer, the 40 cm tread lifts the hip out of its reach)
  const hands = { [inS]: B.hands[inS], [outS]: B.hands[outS] }, handW = { [inS]: sm(k / 0.62), [outS]: (B.handW[outS] || 0) * sm((k - 0.1) / 0.35) };
  const pitch = lerp(0.04, 0.22, Math.sin(Math.PI * sm((k - 0.15) / 0.7))) * (1 - sm((k - 0.8) / 0.2)) + B.pitch * sm((k - 0.8) / 0.2);
  return { ...B, yaw: -s * (G.cabYaw || CAB_YAW) * sm(k / 0.45), hip, pitch, roll: 0, duck: 0, feet, hands, handW, grip: { [inS]: 0, [outS]: 0 }, poleK: { [inS]: 0, [outS]: 0 }, poleIn: { [inS]: (G.kneeIn || 0) * Math.sin(Math.PI * seg(k, 0.18, 0.56)), [outS]: Math.sin(Math.PI * seg(k, 0.38, 0.82)) } /* inner leg: only a touch, where the hinge is right ahead of the tread (lorry) — on the tread its knee must stay outside the lower panel */ /* not the inner leg: on the tread its knee must stay outside the lower panel */, legSeat: 0, align: 0, seated: false };
}

// Catmull-Rom through key points K at knot times T (0..1)
function spline(K, T, t) {
  let i = 0; while (i < T.length - 2 && t > T[i + 1]) i++; const f = clamp((t - T[i]) / (T[i + 1] - T[i]), 0, 1);
  const P0 = K[Math.max(0, i - 1)], P1 = K[i], P2 = K[i + 1], P3 = K[Math.min(K.length - 1, i + 2)]; const f2 = f * f, f3 = f2 * f;
  return [0, 1, 2].map((k) => 0.5 * (2 * P1[k] + (-P0[k] + P2[k]) * f + (2 * P0[k] - 5 * P1[k] + 4 * P2[k] - P3[k]) * f2 + (-P0[k] + 3 * P1[k] - 3 * P2[k] + P3[k]) * f3));
}
// ---- motorcycle (mount from the left, +x) ----------------------------------------------------------------------------
// standing beside a two-wheeler: hips 0.4 m out, or just outside the bars / mirrors on a wide adventure / naked bike
const bikeStandX = (G) => Math.max(0.4, G.hw + 0.04);
function bikeHip(G, u) {
  const { seat: S, hst } = G; const p1 = seg(u, 0, 0.5), p2 = seg(u, 0.44, 0.8), p3 = seg(u, 0.76, 1);
  const H0 = [bikeStandX(G), hst, S.z + 0.06], H1 = [0.17, hst - 0.09, S.z + 0.02]; const Hend = G.hipEnd;
  if (p3 > 0) return [Hend[0], lerp(Hend[1] + 0.01, Hend[1], sm(p3)), Hend[2]];
  if (p2 > 0) return [lerp(H1[0], Hend[0], sm(p2)), lerp(H1[1], Hend[1] + 0.01, sm(p2 / 0.8)), lerp(H1[2], Hend[2], sm(p2))];
  return mix(H0, H1, sm(p1));
}
function bikeCurve(G, u) {
  const { seat: S, rest, hst, ankle } = G; const grips = G.grips;
  const p1 = seg(u, 0, 0.5), p2 = seg(u, 0.44, 0.8), p3 = seg(u, 0.76, 1);
  const H0 = [bikeStandX(G), hst, S.z + 0.06]; const hip = bikeHip(G, u);
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

// ---- standing up from a bus seat into the legroom in front of it (u 1 = seated → 0 = standing, facing the aisle) ----------
// Same frame conventions as the car curve (vehicle-local, poseBoard turns it into A.board): starts exactly on the fitted seat
// pose (hipEnd / feetEnd / legSeat hand-over), hips come forward over the feet and up with the trunk pitched into the push,
// the feet step one at a time to a standing stance under the hips while the body turns toward the aisle.
export function riseGeom(v, seat, A, yaw0, stand) {
  const rest = seatRest(A, seat), L = rest.L;
  const wg = wheelGrips(seat); const G = { kind: 'rise', s: 0, hw: v.T.wid / 2, seat, rest, fl: seat.floor ?? seat.y - 0.3, fz: L.fz ?? 0.5, fx: L.fx ?? 0.12, toe: 0.06, roof: 9, hst: standHip(A), ankle: A.ankle, sc: A.s || 1, ...legLen(A), grips: wg, wheel: !!wg, stag: L.footStagger || 0, yaw0, stand };
  G.feetEnd = { L: [seat.x + G.fx, G.fl + G.ankle, seat.z + G.fz], R: [seat.x - G.fx, G.fl + G.ankle, seat.z + G.fz + G.stag] };
  G.hipEnd = [seat.x, seat.y + rest.hipUp, seat.z + rest.hipZ];
  return G;
}
function riseCurve(G, u) {
  const { rest, fl, hst, ankle } = G; const k = 1 - u; const Hend = G.hipEnd, H0 = [G.stand[0], fl + hst, G.stand[1]];
  const mid = [lerp(Hend[0], H0[0], 0.45), Hend[1] + 0.13 * G.sc, lerp(Hend[2], H0[2], 0.8)]; // weight forward over the feet first
  const hip = spline([Hend, mid, H0], [0, 0.48, 1], sm(k));
  let pitch = lerp(rest.lean, 0.52, sm(k / 0.42)); pitch = lerp(pitch, 0.03, sm((k - 0.42) / 0.58));
  const cs = Math.cos(G.yaw0), sn = Math.sin(G.yaw0); const lx = cs * 0.11, lz = -sn * 0.11; // the character's left in the vehicle frame (facing yaw0)
  const FL = [H0[0] + lx, fl + ankle, H0[2] + lz], FR = [H0[0] - lx, fl + ankle, H0[2] - lz]; const top = fl + ankle + 0.06;
  const feet = { R: stepOver(G.feetEnd.R, FR, sm((k - 0.3) / 0.4), top, 0, 0), L: stepOver(G.feetEnd.L, FL, sm((k - 0.58) / 0.4), top, 0, 0) };
  // hands: off the lap to just in front of the thighs, kept in close along the body's CURRENT heading (a window seat has the
  // side wall at the elbow: the base pose's relaxed arm hang would swing out into it), released to the base pose at the end
  const align = sm((u - 0.3) / 0.6), ps = G.yaw0 * (1 - align), fx = Math.sin(ps), fz = Math.cos(ps), ax = Math.cos(ps), az = -Math.sin(ps);
  const hands = {}, handW = {}; for (const sd of ['L', 'R']) { const sx = sd === 'L' ? 1 : -1; const side = [hip[0] + ax * sx * 0.17 + fx * 0.14, hip[1] - 0.2 - 0.08 * sm(k), hip[2] + az * sx * 0.17 + fz * 0.14];
    hands[sd] = G.grips ? mix(G.grips[sd], side, sm(k / 0.5)) : side; handW[sd] = (G.grips ? 1 : sm(k / 0.3)) * (1 - sm((k - 0.72) / 0.28)); }
  const gw = G.wheel ? sm((u - 0.62) / 0.38) : 0; // fingers close on the wheel rim as the hands arrive
  return { hip, pitch, roll: 0, twist: 0, duck: 0, feet, legSeat: sm((u - 0.86) / 0.14), hands, handW, grip: { L: gw, R: gw }, poleK: { L: 1, R: 1 }, align, seated: u >= 1 };
}
export function boardCurve(G, u) { return G.kind === 'bike' ? bikeCurve(G, clamp(u, 0, 1)) : G.kind === 'rise' ? riseCurve(G, clamp(u, 0, 1)) : G.kind === 'cab' ? cabCurve(G, clamp(u, 0, 1)) : carCurve(G, clamp(u, 0, 1)); }

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
const _bh = new THREE.Vector3(); const _pl = new THREE.Vector3(); const _pole = new THREE.Vector3(), _pd = new THREE.Vector3(); const _qa2 = new THREE.Quaternion(), _qb2 = new THREE.Quaternion();
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
    // truck cab: the tread sits just behind the door hinge, so a knee folded "forward" while stepping up / coming in would go into the
    // open door's inner face; it points into the cab instead (as a climber's does)
    const pin = P.poleIn ? (P.poleIn[sd] || 0) * (1 - behind) : 0; if (pin > 0) _pl.lerp(_pd.set(-(P.poleSide || -1) * 0.8, 0.3, 0.5).normalize(), pin).normalize();
    let knee = poleLeg(_v, _k, a, bl, _pl, _qw); const ls = P.legSeat || 0;
    if (ls > 0) { const Lg = solveLeg(_v, _k, a, bl); _e.set(-Lg.theta, 0, Lg.gamma, 'ZXY'); _qp.setFromEuler(_e); if (P.kneeOut) { _pd.subVectors(_k, _v).normalize(); _qs.setFromAxisAngle(_pd, -sx * P.kneeOut); _qp.premultiply(_qs); } /* the seat pose's sport-riding knee tuck round the hip→ankle axis (Seating) */ _qw.slerp(_qp, ls); knee = lerp(knee, Lg.knee, ls); } // the seat pose's solver at the very end (seamless hand-over)
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
    b.chest.updateWorldMatrix(true, false); _v.set(t[0], t[1], t[2]); root.localToWorld(_v); b.chest.worldToLocal(_v);
    let hold = 1; const hq0 = P.handQ && P.handQ[sd]; if (hq0) { // a door grasp only while the door is really within reach: never a hand floating short of it / folded into the shoulder
      const arm = b['arm' + sd]; arm.parent.updateWorldMatrix(true, false); _bh.copy(arm.position).applyMatrix4(arm.parent.matrixWorld); b.chest.worldToLocal(_bh); const dl = _bh.distanceTo(_v), L = (b['fore' + sd].position.length() + b['hand' + sd].position.length());
      hold = sm((dl - 0.185 * (A.s || 1)) / 0.06); /* full grasp down to ~0.245 (a sharply bent elbow, hand at the chest), matching the fold floor below */ void L; } // (beyond reach the IK just straightens the arm at it: the curve lets go of the edge before that — G.doorRel)
    const wE = w * (hq0 ? Math.max(hold, 1 - hq0.w) : 1); if (wE < 0.001) continue; if (wE < 1) _v.lerpVectors(_w, _v, wE);
    // never fold the arm flat (a hand target at the shoulder has no defined elbow): slide the target out along its line
    const arm = b['arm' + sd], par = arm.parent; par.updateWorldMatrix(true, false); _w.copy(arm.position).applyMatrix4(par.matrixWorld); b.chest.worldToLocal(_w);
    { _k.subVectors(_v, _w); const mn = (0.3 - 0.06 * (hq0 ? hq0.w * hold : 0)) * (A.s || 1), soft = 0.45 * (A.s || 1); /* holding a door edge the elbow is bent and well defined down to ~0.24 (the grasp lets go below 0.245): a 0.3 floor shoved a tall hero's hand off the edge it still held */ let dl = _k.length();
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
    const hq = hq0 && hold > 0.001 ? hq0 : null; if (hq) { root.getWorldQuaternion(_qa2).multiply(hq.q); b['fore' + sd].updateWorldMatrix(false, false); b['fore' + sd].getWorldQuaternion(_qb2).invert().multiply(_qa2); b['hand' + sd].quaternion.slerp(_qb2, Math.min(1, hq.w * hold * Math.min(1, w * 1.5))); } // the solved door grasp's hand orientation
    const fg = P.fing && P.fing[sd]; if (fg && fg.p && A.ch.rig && fg.w * hold > 0.05) A.ch.rig.hand(sd, fg.p, Math.min(1, fg.w * hold * Math.min(1, w * 1.5)));
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
  _qb.setFromEuler(_e.set(0, wy + yaw0 + (F.yaw || 0), 0, 'YXZ')); _qa.invert().multiply(_qb); // local quaternion that is upright in the world
  root.quaternion.copy(_qa).slerp(_q.set(0, 0, 0, 1), F.align); root.position.set(F.hip[0], gy, F.hip[2]); // root on the road under the hips; the hips carry the height
  root.updateMatrix(); _mi.copy(_m.compose(root.position, root.quaternion, _one)).invert();
  const L = (p) => { _p.set(p[0], p[1], p[2]).applyMatrix4(_mi); return [_p.x, _p.y, _p.z]; };
  const feet = {}; for (const sd of ['L', 'R']) { const f = F.feet[sd]; if (!f) continue; let p = f.p;
    if (f.gk > 0) p = [p[0], p[1] + f.gk * ground(p[0], p[2]), p[2]];
    feet[sd] = L(p); }
  const hands = {}; for (const sd of ['L', 'R']) if (F.hands[sd]) hands[sd] = L(F.hands[sd]);
  let handQ = null; if (F.handQ) for (const sd of ['L', 'R']) { const h = F.handQ[sd]; if (!h || h.w < 0.001) continue; (handQ ||= {})[sd] = { q: _qa.copy(root.quaternion).invert().multiply(h.q).clone(), w: h.w }; } // vehicle frame → root frame
  A.board = { w, hip: L(F.hip), pitch: F.pitch, roll: F.roll, twist: F.twist, duck: F.duck, feet, poleOut: F.poleOut, poleIn: F.poleIn, poleSide: G.s, poleK: F.poleK, legSeat: F.legSeat, kneeOut: (G.seat && G.seat.kneeOut) || 0, hands, handW: F.handW, handQ, fing: F.fing || null, grip: F.grip, toe: G.toe, lapSoft: (G.lap && G.kind !== 'tuk') || G.kind === 'cab' }; /* cab: a tall climber crouching under the roof edge brings the shoulder up to the handle → wheel path */
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
  const doored = kind === 'car' || kind === 'van' || kind === 'cab'; let d = doored ? doorForSeat(ud, seat, side) : null;
  if (!d && doored && side < 0 && !isDriver) { const sl = (ud.doors || []).find((q) => q.slide); if (sl && seat.z < sl.hz + 0.12 && seat.z > sl.hz - sl.len - 0.2) { d = sl; side = 1; } }
  if (doored && ud.doors && ud.doors.length && !d) return null;
  if (!doored && kind !== 'tuk' && Math.abs(seat.z - ds.z) > 0.35) return null; // other open bodies: front row only
  const hinged = d && !d.slide; const door = hinged ? { x: d.pivot.position.x, z: d.pivot.position.z, len: d.len, max: d.max } : null;
  const G = boardGeom(v, seat, A, side, door);
  if (door) { G.doorGrip = doorGripFn(d, door, side, A.ch); if (G.doorGrip && G.doorGrip().q) doorHoldAngle(G, d, A.ch, side, 1); } // NPCs swing their door fully open: the outer hand lets go of its edge where, ducking in, it passes out of reach (or never takes it when it is never within reach)
  // slider: no handle grab — once open it has run back BEHIND the seat, and the reach from there to the lap passes the shoulder (elbow flip)
  const H0 = boardCurve(G, 0).hip; return { v, seat, kind, side, G, door: d || null, H0: [H0[0], H0[2]], T: BOARD_T[kind] };
}
