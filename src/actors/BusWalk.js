// Bus / private bus passengers on foot inside the vehicle (vehicle-local; the character root is parented to the bus mesh).
// Getting off: stand up from the seat into the legroom, side-step to the aisle, walk the aisle to the nearer doorway, turn and
// walk down the stairwell treads (BUS_STEPS) to the kerb. Getting on is the same path played the other way. No sliding through
// panels: the doorways are real openings (VehicleModels) and their leaves are opened first (DoorRig.openBusDoor).
import { clamp, lerp } from '../core/math.js';
import { BUS_STEPS } from '../vehicles/VehicleModels.js';
import { riseGeom, boardCurve, poseBoard, lapGrips } from './Boarding.js';

const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const BUS_FLOOR = 0.92;
export const STAND_T = 1.35; // seat -> standing in the legroom
// floor height under vehicle-local x in a doorway (smoothed tread edges: the body drops as the foot comes down on the next tread)
export function stairY(W, x, floor = BUS_FLOOR) {
  const T = BUS_STEPS(W); const e = 0.07; let y = floor;
  y = lerp(y, T[1][0], sm((x - (T[1][1] - e)) / (2 * e)));
  y = lerp(y, T[0][0], sm((x - (T[0][1] - e)) / (2 * e)));
  y = lerp(y, 0, sm((x - (T[0][2] - e)) / (2 * e)));
  return y;
}
// doorway a seat's passenger uses: the seat's own exit z (front door for the front rows, centre door for the rest)
export function busDoorZ(v, seat) { const ex = seat.exit; if (ex && ex[0] > 0) return ex[1]; const L = v.T.len; return seat.z > 1.2 ? L / 2 - 1.05 : -0.6; }
// polyline from standing in the seat's legroom to the kerb outside its doorway
export function busExitPath(v, seat) {
  const W = v.T.wid / 2, fl = seat.floor ?? BUS_FLOOR, dz = busDoorZ(v, seat); const lz = seat.z + 0.36; const ax = 0; // the aisle runs down the middle
  const pts = [[seat.x, fl, lz], [ax, fl, lz], [ax, fl, dz], [W - 0.66, fl, dz], [W + 0.65, 0, dz]];
  // drop repeated points (a seat on the aisle / already level with the door)
  const out = [pts[0]]; for (const p of pts.slice(1)) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[2] - q[2]) > 0.02) out.push(p); }
  const seg = []; let tot = 0; for (let i = 1; i < out.length; i++) { const d = Math.hypot(out[i][0] - out[i - 1][0], out[i][2] - out[i - 1][2]); seg.push(d); tot += d; }
  return { pts: out, seg, len: tot, W, fl, dz };
}
// point at distance s along the path: position (y follows the treads in the stairwell) and travel heading (vehicle-local yaw)
export function busPathAt(P, s) {
  s = clamp(s, 0, P.len); let i = 0; while (i < P.seg.length - 1 && s > P.seg[i]) { s -= P.seg[i]; i++; }
  const a = P.pts[i], b = P.pts[i + 1], f = P.seg[i] > 1e-6 ? clamp(s / P.seg[i], 0, 1) : 1;
  const x = lerp(a[0], b[0], f), z = lerp(a[2], b[2], f); const y = x > P.W - 0.75 && Math.abs(z - P.dz) < 0.44 ? stairY(P.W, x, P.fl) : P.fl; // treads only in the doorway (a kerb-side window seat is as far out but on the floor)
  return { x, y, z, yaw: Math.atan2(b[0] - a[0], b[2] - a[2]), seg: i };
}
// walking pace along the path: slower on the stairs and round the turns
export function busPace(P, s) { const p = busPathAt(P, s); return p.x > P.W - 0.7 && Math.abs(p.z - P.dz) < 0.44 ? 0.75 : 1.05; }
// turn toward a heading at a limited rate (no snapping round at the aisle corners)
export function turnToward(cur, want, dt, rate = 5) { let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return cur + clamp(d, -rate * dt, rate * dt); }
// getting off, one frame: o = { ch, seat, t, P, s, yaw }. Returns true when the passenger is standing on the kerb.
export function busAlightStep(o, dt) {
  const A = o.ch.anim, r = o.ch.root, seat = o.seat;
  if (o.t < STAND_T) { // stand up into the legroom (Boarding riseCurve: starts on the seat pose, ends standing facing the aisle)
    if (!o.G) { const p0 = o.P.pts[0], p1 = o.P.pts[1] || [p0[0] - Math.sign(p0[0] || 1), 0, p0[2]]; const yaw0 = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
      o.G = riseGeom(o.v, seat, A, yaw0, [p0[0], p0[2]]); lapGrips(o.ch, o.v, seat, o.G); A.set(null); A.standUp(); A.duck = 0; o.yaw = yaw0; }
    const u = 1 - o.t / STAND_T, fl = o.G.fl; poseBoard(A, o.G, boardCurve(o.G, u), o.v.mesh, () => fl, o.G.yaw0, Math.min(1, (STAND_T - o.t) / 0.25 + 0.0)); A.update(dt, 0, 0); return false; }
  if (!o.walking) { o.walking = true; A.board = null; A.standUp(); A.set(null); o.s = 0; r.rotation.set(0, o.yaw, 0); }
  const v = busPace(o.P, o.s); o.s = Math.min(o.P.len, o.s + v * dt); const p = busPathAt(o.P, o.s + 0.25 < o.P.len ? o.s + 0.25 : o.s);
  const q = busPathAt(o.P, o.s); r.position.set(q.x, q.y, q.z); o.yaw = turnToward(o.yaw, p.yaw, dt, 6); r.rotation.set(0, o.yaw, 0);
  A.update(dt, o.s < o.P.len ? v : 0); return o.s >= o.P.len - 1e-4;
}
