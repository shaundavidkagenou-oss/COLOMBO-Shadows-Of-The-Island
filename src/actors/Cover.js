// 73rd: taking cover (Q). Against a wall, a building, a container or stall, or a stopped vehicle within reach: the player
// moves in to it — crouched behind anything lower than his chest, standing with his shoulder to it otherwise — slides along
// it with left / right (stopping at its end, or carrying on along the next piece of the same wall), and aims out of it: up
// over low cover, a step out round the corner of high cover at its end. Q again, Jump (which then climbs / vaults as usual),
// sprinting or pushing away from it leaves cover. Crouched in cover he is a lower target (Firefight.targetPoint).
// Colliders are axis-aligned boxes (Collision.js); a vehicle is its own oriented box. No per-frame cost when not in cover.
import { Input } from '../core/Input.js';

const R = 1.55; // reach (m) from the player's centre to the face
const OFF = 0.36; // body centre off the face (body radius 0.32)
const KINDS = new Set(['building', 'wall', 'container', 'stall', 'cart', 'hedge', 'landmark', 'prop', 'shelter', 'shrine']);
const LOW = 1.35; // anything lower than this is crouch-behind cover
const lowOf = (F) => F.top < (F.kind === 'veh' ? 1.7 : LOW); // a car's roofline (≤ 1.6 m) is crouch-behind cover
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dampA = (a, b, k, dt) => a + wrap(b - a) * (1 - Math.exp(-k * dt));

// a face: origin O (on the face line), unit tangent T, unit normal N (out of the face, toward the player), extent [t0, t1]
// along T, top (height above the player's feet); for a vehicle it is held in the vehicle's frame and re-derived each frame
function boxFaces(P, c, out, fx, fz) {
  if (c.h <= 0 || c.walkUnder || !KINDS.has(c.kind || 'building')) return; const base = c.y0 || 0; if (base > P.y + 0.4) return; const top = base + c.h - P.y; if (top < 0.75) return;
  const qx = clamp(P.x, c.x0, c.x1), qz = clamp(P.z, c.z0, c.z1); const dx = P.x - qx, dz = P.z - qz; const d = Math.hypot(dx, dz); if (d > R || d < 0.05) return;
  const xs = Math.abs(dx) >= Math.abs(dz); const N = xs ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const f = xs ? { O: [N[0] > 0 ? c.x1 : c.x0, 0], T: [0, 1], t0: c.z0, t1: c.z1 } : { O: [0, N[1] > 0 ? c.z1 : c.z0], T: [1, 0], t0: c.x0, t1: c.x1 };
  if (f.t1 - f.t0 < 0.8) return; // a post or a pole is not cover
  const facing = -(N[0] * fx + N[1] * fz); out.push({ kind: 'box', box: c, N, O: f.O, T: f.T, t0: f.t0, t1: f.t1, top, d, score: d - 0.7 * facing });
}
function vehFace(P, v, out, fx, fz) {
  if (!v || v.player || v.disposed || !v.mesh || !v.mesh.parent || Math.abs(v.speed || 0) > 0.6 || !v.T) return; const hw = (v.T.wid || 1.7) / 2, hl = v.half || 2.2;
  const s = Math.sin(v.yaw), c = Math.cos(v.yaw); const rx = P.x - v.x, rz = P.z - v.z; const lx = rx * c - rz * s, lz = rx * s + rz * c; // (right = (c, -s), forward = (s, c))
  const qx = clamp(lx, -hw, hw), qz = clamp(lz, -hl, hl); const dx = lx - qx, dz = lz - qz; const d = Math.hypot(dx, dz); if (d > R || d < 0.05) return;
  const xs = Math.abs(dx) >= Math.abs(dz); const nL = xs ? [Math.sign(dx), 0] : [0, Math.sign(dz)]; const top = (v.T.hgt || 1.45) - 0.05; if (top < 0.75) return;
  const f = { v, nL, side: xs ? 'x' : 'z', hw, hl }; const W = vehWorld(f); const facing = -(W.N[0] * fx + W.N[1] * fz);
  out.push({ kind: 'veh', ...f, ...W, top, d, score: d - 0.7 * facing + 0.15 });
}
function vehWorld(f) { const v = f.v, s = Math.sin(v.yaw), c = Math.cos(v.yaw); const toW = (lx, lz) => [v.x + lx * c + lz * s, v.z - lx * s + lz * c]; const dir = (lx, lz) => [lx * c + lz * s, -lx * s + lz * c];
  if (f.side === 'x') { const ox = f.nL[0] * f.hw; const O = toW(ox, 0); const T = dir(0, 1); return { O, T, N: dir(f.nL[0], 0), t0: -f.hl, t1: f.hl, rel: true }; }
  const oz = f.nL[1] * f.hl; const O = toW(0, oz); const T = dir(1, 0); return { O, T, N: dir(0, f.nL[1]), t0: -f.hw, t1: f.hw, rel: true }; }
// position along T of a point (box faces: absolute coordinate; vehicle faces: from the face centre)
const along = (F, x, z) => (F.rel ? (x - F.O[0]) * F.T[0] + (z - F.O[1]) * F.T[1] : F.T[0] ? x : z);
const pointAt = (F, s, off) => (F.rel ? [F.O[0] + F.T[0] * s + F.N[0] * off, F.O[1] + F.T[1] * s + F.N[1] * off] : F.T[0] ? [s + F.N[0] * off, F.O[1] + F.N[1] * off] : [F.O[0] + F.N[0] * off, s + F.N[1] * off]);

export function findCover(P, traffic) {
  const col = P.collision; if (!col) return null; const fx = Math.sin(P.camYaw + Math.PI), fz = Math.cos(P.camYaw + Math.PI); const out = [];
  for (const c of col.query(P.x - R, P.z - R, P.x + R, P.z + R)) boxFaces(P, c, out, fx, fz);
  if (traffic) for (const v of traffic.all()) { if (Math.abs(v.x - P.x) > 6 || Math.abs(v.z - P.z) > 6) continue; vehFace(P, v, out, fx, fz); }
  if (!out.length) return null; out.sort((a, b) => a.score - b.score); return out[0];
}
// the same wall carrying on past the end of this box (a row of buildings, a long compound wall in sections)
function extend(P, F, end) {
  if (F.kind !== 'box') return false; const col = P.collision; const at = end > 0 ? F.t1 : F.t0; const [ex, ez] = pointAt(F, at, -0.05); const fx = F.N[0], fz = F.N[1];
  for (const c of col.query(ex - 0.6, ez - 0.6, ex + 0.6, ez + 0.6)) { if (c === F.box || c.h <= 0 || !KINDS.has(c.kind || 'building') || (c.y0 || 0) - P.y + c.h < 0.75) continue;
    const line = F.T[0] ? (fz > 0 ? c.z1 : c.z0) : (fx > 0 ? c.x1 : c.x0); const me = F.T[0] ? F.O[1] : F.O[0]; if (Math.abs(line - me) > 0.08) continue;
    const t0 = F.T[0] ? c.x0 : c.z0, t1 = F.T[0] ? c.x1 : c.z1; if (end > 0 ? (t0 > at + 0.05 || t1 <= at + 0.3) : (t1 < at - 0.05 || t0 >= at - 0.3)) continue;
    F.box = c; if (end > 0) F.t1 = t1; else F.t0 = t0; F.top = Math.min(F.top, (c.y0 || 0) + c.h - P.y); return true; }
  return false;
}
export function enterCover(P, F) {
  const s = clamp(along(F, P.x, P.z), F.t0 + 0.3, F.t1 - 0.3); const fx = Math.sin(P.camYaw + Math.PI), fz = Math.cos(P.camYaw + Math.PI);
  P.cover = { F, s, side: (fx * F.T[0] + fz * F.T[1]) >= 0 ? 1 : -1, t: 0, low: lowOf(F), out: 0, edge: 0, awayT: 0 }; P.speed = 0; P.events && P.events.emit && P.events.emit('cover', true);
}
export function leaveCover(P, faceWall = false) {
  const C = P.cover; if (!C) return; P.cover = null; const A = P.ch.anim; if (A.action === 'cover' || A.action === 'crouch') A.set(null); P.crouching = false;
  if (faceWall) P.yaw = Math.atan2(-C.F.N[0], -C.F.N[1]); P.events && P.events.emit && P.events.emit('cover', false);
}
// one frame in cover; false = cover was left this frame and the normal on-foot update carries on
export function updateCover(P, dt, mx, my, mag) {
  const C = P.cover, F = C.F, A = P.ch.anim; C.t += dt;
  if (F.kind === 'veh') { const v = F.v; if (!v.mesh || !v.mesh.parent || v.disposed || Math.abs(v.speed || 0) > 1 || v.player) { leaveCover(P); return false; } Object.assign(F, vehWorld(F)); }
  if (!P.control || P.vehicle || (C.t > 0.1 && Input.wasPressed('cover'))) { leaveCover(P); return false; }
  if (Input.wasPressed('jump')) { leaveCover(P, true); return false; } // (Jump: the normal climb / vault over it)
  const camF = P.camYaw + Math.PI; let ux = 0, uz = 0; if (mag > 0.05) { const a = camF + Math.atan2(-mx, my); ux = Math.sin(a); uz = Math.cos(a); }
  const away = ux * F.N[0] + uz * F.N[1]; C.awayT = mag > 0.5 && away > 0.75 ? C.awayT + dt : 0; if (C.awayT > 0.18 || (Input.isDown('sprint') && mag > 0.5 && away > -0.2)) { leaveCover(P); return false; }
  const aiming = !!P.aiming; const tg = ux * F.T[0] + uz * F.T[1];
  // slide along it (not while aiming out)
  if (!aiming && Math.abs(tg) > 0.3 && mag > 0.05) { const sp = (C.low ? 1.25 : 1.45) * Math.min(1, mag); C.side = tg > 0 ? 1 : -1; let s = C.s + C.side * sp * dt; const lo = F.t0 + 0.3, hi = F.t1 - 0.3;
    if (s > hi && !extend(P, F, 1)) s = hi; if (s < lo && !extend(P, F, -1)) s = lo; C.s = clamp(s, F.t0 + 0.3, F.t1 - 0.3); }
  C.low = lowOf(F); C.edge = C.s >= F.t1 - 0.32 ? 1 : C.s <= F.t0 + 0.32 ? -1 : 0;
  // aiming: up over low cover; out round the corner at the end of high cover
  C.out = Math.min(1, Math.max(0, C.out + (aiming ? 5 : -4) * dt)); const stepOut = !C.low && C.edge && C.edge === C.side ? 0.55 * C.out : 0;
  const [tx, tz] = pointAt(F, C.s + C.side * stepOut, OFF + (stepOut ? 0.1 * C.out : 0));
  const k = 1 - Math.exp(-(C.t < 0.3 ? 12 : 16) * dt); let nx = P.x + (tx - P.x) * k, nz = P.z + (tz - P.z) * k;
  const r = P.collision.resolveCircle(nx, nz, 0.32, P.y, 0.45, 1.75); nx = r.x; nz = r.z; const moved = Math.hypot(nx - P.x, nz - P.z); P.x = nx; P.z = nz; P.speed = moved / Math.max(dt, 1e-4);
  const g = P.collision.groundAt(P.x, P.z, P.y, 0.5); P.y += (g - P.y) * Math.min(1, dt * 20); P.grounded = true; A.air = 0;
  // facing: along the wall (shoulder to it, turned a little out), or the aim
  const y0 = P.yaw; if (aiming) P.yaw = dampA(P.yaw, camF, 18, dt); else { const fx = F.T[0] * C.side * 0.85 + F.N[0] * 0.45, fz = F.T[1] * C.side * 0.85 + F.N[1] * 0.45; P.yaw = dampA(P.yaw, Math.atan2(fx, fz), 10, dt); }
  const low = C.low && !(aiming && C.out > 0.5); P.crouching = low; const armed = !!(P.weapons && P.weapons.drawn);
  if (low) { const want = armed ? 'crouch' : 'cover'; if (A.action !== want) A.set(want); } else if (A.action === 'cover' || A.action === 'crouch') A.set(null);
  A.update(dt, P.speed > 0.15 ? P.speed : 0, wrap(P.yaw - y0) / Math.max(dt, 1e-4)); P.sync();
  if (A.stepped) { A.stepped = false; if (P.speed > 0.4) P.events.emit('footstep', { x: P.x, z: P.z, sprint: false }); }
  return true;
}
