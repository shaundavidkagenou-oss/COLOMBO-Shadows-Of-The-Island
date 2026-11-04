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
export function syncDoors(ud) {
  const D = ud.doors; if (!D || !D.length) return;
  for (const d of D) { if (d.slide) poseDoor(d); const o = isOpen(d); if (o !== d.live) setDoorLive(ud, d, o); }
}
export function setDoorLive(ud, d, on) {
  d.live = on; const B = ud.bake; if (!B) return;
  if (on && !d.pivot.children.length) for (const [name, geo] of B.pivotGeos(d.i)) { const m = new THREE.Mesh(geo, B.mats[name]); m.name = name; m.castShadow = name === 'paint'; m.receiveShadow = name === 'paint'; if (name === 'glass') m.renderOrder = 2; d.pivot.add(m); }
  d.pivot.visible = on; const hidden = new Set(ud.doors.filter((x) => x.live).map((x) => x.i));
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
  if (!d) return null; const h = Math.min(dt, 1 / 30); d.ang = d.ang || 0; d.vel = d.vel || 0; let ev = null;
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
  for (const [d, c] of drivers) { springDoor(c.v, d, c.target, dt, 6, 1); if ((Math.abs(d.ang - c.target) < 0.01 && Math.abs(d.vel) < 0.02) || !c.v.mesh.parent) { d.ang = c.target; d.vel = 0; poseDoor(d); drivers.delete(d); } }
  for (const [d, c] of closers) { c.t += dt; if (c.t < 0) continue; const ev = springDoor(c.v, d, -0.35, dt, 6.5, 0.9);
    if (ev === 'latched' || c.t > 1.6 || !c.v.mesh.parent) { if (ev !== 'latched') { d.ang = 0; d.vel = 0; poseDoor(d); } closers.delete(d); } }
}
// the door a person uses for this seat: same side, the opening that spans the seat (front / rear / sliding); null = none
export function doorForSeat(ud, seat, side) {
  const D = ud && ud.doors; if (!D || !D.length) return null; let best = null, bd = 9;
  for (const d of D) { if (d.side !== side || d.leaf) continue; const zc = d.hz - d.len * 0.55, lo = d.hz - d.len - 0.2, hi = d.hz + 0.12; if (seat.z < lo || seat.z > hi) continue; const e = Math.abs(seat.z - zc); if (e < bd) { bd = e; best = d; } }
  return best;
}
