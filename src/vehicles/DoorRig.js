// Runtime side of the car doors (VehicleModels builds them).
// Shut doors cost nothing extra: their geometry is baked into the body meshes (one draw call per material, as before).
// The moment a door moves it goes "live": the body meshes of that vehicle switch to a view of the shared geometry that
// skips the door's triangles (geometry groups over the same buffers — nothing is copied), and the door's own meshes on
// its hinge pivot appear. Once it is shut again it is folded back into the body. Hinged doors swing about the front
// edge; the van's sliding door steps out 15 cm (clear of its own shell depth) and runs back along the body side.
import * as THREE from 'three';

// pose a door from its normalised opening d.ang (0 shut .. 1 open)
export function poseDoor(d) {
  const k = Math.max(0, d.ang || 0);
  if (d.slide) { const out = Math.min(1, k / 0.18), back = Math.max(0, (k - 0.12) / 0.88); d.pivot.position.set(d.hx + d.side * 0.15 * out, 0, d.hz - (d.len + 0.05) * back); d.pivot.rotation.y = 0; return; }
  if (d.leaf) { d.pivot.rotation.y = -d.leaf * d.max * k; return; } // bus door leaf: swings out to the street
  d.pivot.rotation.y = d.max * k * (d.side < 0 ? 1 : -1);
}
const isOpen = (d) => (d.slide ? (d.ang || 0) > 1e-4 : Math.abs(d.pivot.rotation.y) > 1e-5 || (d.ang || 0) > 1e-4);
// per frame (Vehicle LOD pass): fold shut doors into the body, bring moving ones out
export function syncDoors(ud, v = null) {
  const D = ud.doors; if (!D || !D.length) return;
  for (const d of D) { if (d.gone) { if (!d.live) setDoorLive(ud, d, true); continue; } // torn off: its opening stays open
    if (d.slide) poseDoor(d); const o = isOpen(d); if (o !== d.live) setDoorLive(ud, d, o);
    if (o && v && !d.slide && !d.leaf && !OPEN.has(d)) OPEN.set(d, v); } // an open hinged door: the free-door physics watches it
}
export function setDoorLive(ud, d, on) {
  d.live = on; const B = ud.bake; if (!B) { d.pivot.visible = !d.gone; return; }
  if (on && !d.pivot.children.length) for (const [name, geo] of B.pivotGeos(d.i)) { const m = new THREE.Mesh(geo, B.mats[name]); m.name = name; m.castShadow = name === 'paint'; m.receiveShadow = name === 'paint'; if (name === 'glass') m.renderOrder = 2; d.pivot.add(m); }
  d.pivot.visible = on && !d.gone; const hidden = new Set(ud.doors.filter((x) => x.live).map((x) => x.i));
  for (const name in B.ranges) {
    const R = B.ranges[name], mesh = B.meshes[name]; if (!mesh || !R.doors.some((r) => r.door === d.i)) continue;
    if (!R.doors.some((r) => hidden.has(r.door))) { mesh.geometry = B.shared[name]; mesh.material = B.mats[name]; continue; }
    let view = mesh.userData.view; const src = B.shared[name];
    if (!view) { view = new THREE.BufferGeometry(); for (const k in src.attributes) view.setAttribute(k, src.attributes[k]); view.setIndex(src.index); view.boundingSphere = src.boundingSphere; view.boundingBox = src.boundingBox; mesh.userData.view = view; } // shares the buffers: never dispose it
    view.clearGroups(); const iv = [[0, R.body], ...R.doors.filter((r) => !hidden.has(r.door)).map((r) => [r.i0, r.i1])].filter(([a, b]) => b > a);
    const merged = []; for (const [a, b] of iv) { const l = merged[merged.length - 1]; if (l && l[1] === a) l[1] = b; else merged.push([a, b]); }
    for (const [a, b] of merged) view.addGroup(a, b - a, 0);
    mesh.geometry = view; mesh.material = [B.mats[name]];
  }
}
// tests / tools: bring every door out (their meshes on the pivots), or fold them all back
export function allDoorsLive(ud, on = true) { for (const d of ud.doors || []) setDoorLive(ud, d, on); }

// door spring (critically-ish damped toward a target opening; target < 0 pulls it onto the latch). Returns 'latched' on the
// frame it shuts (the slam sound comes from v.slam with the closing speed).
export function springDoor(v, d, target, dt, w = 9, z = 0.7) {
  if (!d) return null; d.holdT = CLOCK; const h = Math.min(dt, 1 / 30); d.ang = d.ang || 0; d.vel = d.vel || 0; let ev = null;
  d.vel += (w * w * (target - d.ang) - 2 * z * w * d.vel) * h; d.ang += d.vel * h;
  const top = d.slide ? 1 : 1.05; if (d.ang > top) { d.ang = top; if (d.vel > 0) d.vel *= d.slide ? -0.1 : -0.25; } // a sliding door stops on its track
  if (d.ang < 0) { const s = -d.vel; d.ang = 0; d.vel = 0; ev = 'latched'; if (s > 0.6 && v && v.slam) v.slam(s); }
  poseDoor(d); return ev;
}
// doors someone pulls shut behind them: after `delay` s (the person has stepped clear) the door is swung onto its latch
const closers = new Map(); // door -> { v, t }
export function shutDoorLater(v, d, delay = 0) { if (d) { drivers.delete(d); closers.set(d, { v, t: -delay }); } }
export function cancelShut(d) { closers.delete(d); }
// powered doors (bus leaves): swung to a target opening and held there; shutDoorLater brings them back onto the seal
const drivers = new Map(); // door -> { v, target }
export function driveDoor(v, d, target = 1) { if (!d) return; closers.delete(d); const c = drivers.get(d); if (c) { c.target = target; c.v = v; } else drivers.set(d, { v, target }); }
// the folding-door leaves of the bus doorway nearest vehicle-local z (pairs: both leaves of one doorway)
export function busLeaves(ud, z) { const L = ((ud && ud.doors) || []).filter((d) => d.leaf); if (!L.length) return []; let best = L[0]; const zc = (d) => d.hz - d.leaf * d.len; for (const d of L) if (Math.abs(zc(d) - z) < Math.abs(zc(best) - z)) best = d; return L.filter((d) => Math.abs(zc(d) - zc(best)) < 0.2); }
export function openBusDoor(v, z, open = true, delay = 0) { for (const d of busLeaves(v.mesh.userData, z)) { if (open) driveDoor(v, d, 1); else shutDoorLater(v, d, delay); } }
export function updateDoorClosers(dt) {
  CLOCK += dt;
  for (const [d, c] of drivers) { springDoor(c.v, d, c.target, dt, 6, 1); if ((Math.abs(d.ang - c.target) < 0.01 && Math.abs(d.vel) < 0.02) || !c.v.mesh.parent) { d.ang = c.target; d.vel = 0; poseDoor(d); drivers.delete(d); } }
  for (const [d, c] of closers) { c.t += dt; if (c.t < 0) continue; const ev = springDoor(c.v, d, -0.35, dt, 6.5, 0.9);
    if (ev === 'latched' || c.t > 1.6 || !c.v.mesh.parent) { if (ev !== 'latched') { d.ang = 0; d.vel = 0; poseDoor(d); } closers.delete(d); } }
  for (const [d, v] of OPEN) { // doors left open that nobody is holding
    if (d.gone || v.disposed || v.wrecked || !v.mesh.parent || !(d.ang > 1e-4)) { OPEN.delete(d); d.phAng = undefined; continue; }
    if (doorHeld(d)) { d.phAng = undefined; continue; }
    if (d.phAng !== undefined && Math.abs(d.ang - d.phAng) > 1e-6) { d.holdT = CLOCK; d.phAng = undefined; continue; } // someone else moved it since the last step
    freeDoor(v, d, dt); d.phAng = d.gone ? undefined : d.ang;
  }
}

// ---------------------------------------------------------------- free doors
// A door left open with nobody holding it (an NPC who ran off, a carjacked car, a door popped by a crash) is a hinged leaf:
//   • the car's own motion swings it — accelerating pushes it shut, braking throws it open, a turn swings it out or in (the
//     acceleration is measured from the car's real movement, so collisions and spins count too); gravity on a slope;
//   • air: driving forward the wind presses it back onto the body (it closes as the speed rises); reversing fast blows it open;
//   • hinge friction; the check strap stops it fully open with a bounce;
//   • reaching the jamb it LATCHES (folded back into the body, slam sound by closing speed) — a car door locks itself shut;
//   • it breaks off — the hinges tear — when it slams into the check strap too hard (a crash stop, reversing very fast) or its
//     free edge hits a wall / pole / tree at speed (slower: knocked shut); VehicleDamage turns it into tumbling debris.
// Units: d.ang is the normalised opening (0 shut .. 1 = d.max radians), d.vel its rate (1/s); the physics is in radians.
export const DOOR_HOOKS = { blocked: null, detach: null }; // set by VehicleDamage: world obstacle test, tear-off
const OPEN = new Map(); // door -> vehicle (open hinged doors)
let CLOCK = 0;
export function holdDoor(d) { if (d) d.holdT = CLOCK; } // someone's hand is on it this frame (entry / exit animations)
export function doorHeld(d) { return closers.has(d) || drivers.has(d) || CLOCK - (d.holdT ?? -9) < 0.25; }
export function freeDoorNow(v, d) { if (d && !d.gone && !d.slide && !d.leaf) { OPEN.set(d, v); d.holdT = -9; } } // a crash popped the latch
export function _doorTesting() { return { OPEN, clock: () => CLOCK }; }
const AIR = 0.05, FRICTION = 1.6, TEAR_W = 4.8, PIN_A = 16; // + the sustained strap load the hinges hold (rad/s²: reversing at ~68 km/h) // air (rad/s² per (m/s)²), hinge friction (1/s), strap hit that tears the hinges (rad/s)
const gL = new THREE.Vector3(), qI = new THREE.Quaternion();
function kin(v) { // the car's velocity / acceleration (world, from its positions), smoothed; one update per frame per car
  let k = v._dk;
  if (!k || CLOCK - k.t > 0.5) { const sp = v.speed || 0; k = v._dk = { t: CLOCK, x: v.x, z: v.z, vx: Math.sin(v.yaw) * sp, vz: Math.cos(v.yaw) * sp, ax: 0, az: 0 }; } // starts from the car's current velocity: no false jolt when a door comes free on a moving car
  else if (k.t !== CLOCK) { const h = CLOCK - k.t; let vx = (v.x - k.x) / h, vz = (v.z - k.z) / h; if (vx * vx + vz * vz > 90 * 90) { vx = k.vx; vz = k.vz; } // teleported
    const ax = Math.max(-200, Math.min(200, (vx - k.vx) / h)), az = Math.max(-200, Math.min(200, (vz - k.vz) / h)); /* a wall stop is ~140 m/s² */ const b = Math.min(1, h / 0.05);
    k.ax += (ax - k.ax) * b; k.az += (az - k.az) * b; k.vx = vx; k.vz = vz; k.x = v.x; k.z = v.z; k.t = CLOCK; }
  return k;
}
export function vehicleVelocity(v) { const k = v._dk; if (k && CLOCK - k.t < 0.5) return [k.vx, k.vz]; const s = v.speed || 0; return [Math.sin(v.yaw) * s, Math.cos(v.yaw) * s]; }
function freeDoor(v, d, dt) {
  const k = kin(v); const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw); // vehicle local axes: +x left = (cy, -sy), +z forward = (sy, cy)
  const alx = k.ax * cy - k.az * sy, alz = k.ax * sy + k.az * cy, vlx = k.vx * cy - k.vz * sy, vlz = k.vx * sy + k.vz * cy;
  qI.copy(v.mesh.quaternion).invert(); gL.set(0, -9.81, 0).applyQuaternion(qI); // gravity in the car's frame (slopes, body roll)
  const fx = gL.x - alx, fz = gL.z - alz, wx = -vlx, wz = -vlz, ws = Math.hypot(wx, wz); // inertial + gravity per unit mass; relative wind
  const len = d.len || 1, mx = d.max || 1.2, side = d.side || 1; const n = 3, h = Math.min(dt, 1 / 20) / n;
  for (let i = 0; i < n; i++) {
    const phi = d.ang * mx, sn = Math.sin(phi), cs = Math.cos(phi); const nx = side * cs, nz = sn; // direction the leaf's free edge moves as it opens
    let a = 1.5 / len * (fx * nx + fz * nz); // uniform leaf about its hinge: generalised force / inertia (3/(2L))
    a += AIR * (wx * nx + wz * nz) * ws; // wind on the leaf
    a -= FRICTION * d.vel * mx; // hinge friction
    if (d.ang >= 0.999 && a > PIN_A) { d.pinT = (d.pinT || 0) + h; if (d.pinT > 0.4 && DOOR_HOOKS.detach && DOOR_HOOKS.detach(v, d, a / 4)) return; } else d.pinT = Math.max(0, (d.pinT || 0) - h); // pinned on the strap by a load the hinges can't hold
    d.vel += a / mx * h; d.ang += d.vel * h;
    if (d.ang >= 1) { const w = d.vel * mx; d.ang = 1; if (d.vel > 0) { d.strapW = Math.max(d.strapW || 0, w); if (w > TEAR_W && DOOR_HOOKS.detach && DOOR_HOOKS.detach(v, d, w)) return; d.vel *= -0.3; } } // check strap
    if (d.ang <= 0) { const s = -d.vel; d.ang = 0; d.vel = 0; poseDoor(d); OPEN.delete(d); if (s > 0.15 && v.slam) v.slam(Math.max(0.65, s)); return; } // latched (a swung-shut door thunks onto its latch)
  }
  poseDoor(d);
  // the free edge against the world: a wall / pole at speed tears the door off, slower it is knocked shut
  if (ws > 2 && d.ang > 0.12 && DOOR_HOOKS.blocked) {
    const phi = d.ang * mx, lx = d.hx + side * len * Math.sin(phi), lz = d.hz - len * Math.cos(phi);
    const ex = v.x + lx * cy + lz * sy, ez = v.z - lx * sy + lz * cy;
    if (DOOR_HOOKS.blocked(ex, ez, v.y || 0)) {
      if (ws > 7 && d.ang > 0.2 && DOOR_HOOKS.detach && DOOR_HOOKS.detach(v, d, ws)) return;
      d.vel = -Math.max(Math.abs(d.vel), ws * 0.35 / mx); if (v.slam) v.slam(0.7); }
  }
}
// the door a person uses for this seat: same side, the opening that spans the seat (front / rear / sliding); null = none
export function doorForSeat(ud, seat, side) {
  const D = ud && ud.doors; if (!D || !D.length) return null; let best = null, bd = 9;
  for (const d of D) { if (d.side !== side || d.leaf) continue; const zc = d.hz - d.len * 0.55, lo = d.hz - d.len - 0.2, hi = d.hz + 0.12; if (seat.z < lo || seat.z > hi) continue; const e = Math.abs(seat.z - zc); if (e < bd) { bd = e; best = d; } }
  return best;
}
