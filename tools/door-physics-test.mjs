// Free-door physics test (Node): real vehicles, doors left open with nobody holding them (DoorRig free doors + VehicleDamage).
//   • parked: an open door stays where it was left (no drift)
//   • driving off: accelerating + the wind swing it shut and it LATCHES (folded back into the body, slam with the closing speed)
//   • cruising: released at speed, the wind closes it within ~2 s
//   • braking throws a half-open door onto its check strap; a left turn closes the left door and swings the right one open
//   • a door someone holds (entry / exit spring) is never moved by the physics
//   • a wall at speed tears it off (debris body in the real paint, opening stays open); slower it is knocked shut
//   • reversing very fast blows it onto the strap hard enough to tear the hinges
//   • crashes: an open door on the side that is hit comes off; a hard side hit can spring a shut door's latch
//   • repair refits torn-off doors
// Run: node tools/door-physics-test.mjs   (V=1 details, TYPES=a,b)
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { VehicleDamage } = await import('../src/vehicles/VehicleDamage.js');
const DR = await import('../src/vehicles/DoorRig.js');
const Vb = !!process.env.V;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 60) console.log('  FAIL', m); } if (Vb) console.log('   ', c ? 'ok ' : 'NO ', m); };
let seed = 7; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera();
const fx = { emit() {}, sparkEmit() {}, flush() {}, burn() {}, blast() {}, burners: [], fire: {}, smoke: {}, spark: {} };
const traffic = { vehicles: [], parked: [], release() {}, dropPax(v) { v.pax = []; }, abandon() { return true; } };
let wall = null; // { x0, x1, z0, z1 } world box the free edge can hit
const collision = { query: (x0, z0, x1, z1) => (wall && x1 > wall.x0 && x0 < wall.x1 && z1 > wall.z0 && z0 < wall.z1 ? [{ ...wall, h: 3, y0: 0, kind: 'wall' }] : []), groundAt: () => 0, resolveCircle: (x, z) => ({ x, z, hit: false }), blocked: () => false, raycast: () => 1 };
const game = { scene, camera, explosions: fx, traffic, collision, player: { x: 9999, z: 9999 }, crowd: { alarm() {} }, health: { damage() {} }, hud: { notify() {} } };
const VD = new VehicleDamage(game);
const DT = 1 / 60;
const want = process.env.TYPES ? process.env.TYPES.split(',') : ['ventra', 'raiden', 'vanta', 'car', 'suv', 'van'];
const types = want.filter((t) => VTYPES[t]);
const fresh = (type) => { const v = new Vehicle(type, 3, scene); v.place(0, 0, 0); v.sync(0); v.mesh.updateMatrixWorld(true); v.slams = []; v.slam = (s) => v.slams.push(s); return v; };
const hingedDoors = (v) => (v.mesh.userData.doors || []).filter((d) => !d.leaf && !d.slide);
// one frame: the car moves (kinematic: speed along its heading, yaw rate), then the Vehicle LOD pass (syncDoors) and the door closers
const step = (v, sp, yawRate = 0) => { v.yaw += yawRate * DT; v.speed = sp; v.x += Math.sin(v.yaw) * sp * DT; v.z += Math.cos(v.yaw) * sp * DT; v.mesh.position.set(v.x, v.y || 0, v.z); v.mesh.rotation.set(0, v.yaw, 0); v.mesh.updateMatrixWorld(true); DR.syncDoors(v.mesh.userData, v); DR.updateDoorClosers(DT); VD.update(DT); };
const leaveOpen = (v, d, k) => { d.ang = k; d.vel = 0; DR.poseDoor(d); d.holdT = -9; step(v, v.speed || 0); }; // someone left it like this and walked off
const rows = [];
for (const type of types) {
  const tag = type; let v = fresh(type); const D = hingedDoors(v); if (!D.length) { console.log(`${tag}: no hinged doors — skipped`); continue; }
  const row = { type, doors: D.length }; const d = D.find((q) => q === v.mesh.userData.door) || D[0];
  // ---- parked: stays put
  leaveOpen(v, d, 0.7); for (let i = 0; i < 180; i++) step(v, 0); ok(Math.abs(d.ang - 0.7) < 0.01, `${tag}: parked, a door left open stays put (0.70 → ${d.ang.toFixed(3)})`);
  ok(d.live && d.pivot.visible, `${tag}: an open door is on its pivot (live)`);
  // ---- driving off: accelerate at 2.5 m/s² → latched
  let t = 0, sp = 0; v.slams = []; while (d.ang > 0 && t < 8) { sp += 2.5 * DT; step(v, sp); t += DT; } step(v, sp);
  ok(d.ang === 0, `${tag}: driving off, the door swings shut and latches (${t.toFixed(2)} s, ${(sp * 3.6).toFixed(0)} km/h)`); row.latchS = +t.toFixed(2); row.latchKmh = +(sp * 3.6).toFixed(0);
  ok(!d.live, `${tag}: latched door folded back into the body`); ok(!DR._doorTesting().OPEN.has(d), `${tag}: latched door left the free-door set`);
  ok(v.slams.length >= 1, `${tag}: latching made the slam sound (${v.slams.map((s) => s.toFixed(2)).join(',')})`);
  // ---- cruising: released at 15 m/s
  v = fresh(type); const d2 = hingedDoors(v).find((q) => q === v.mesh.userData.door) || hingedDoors(v)[0]; for (let i = 0; i < 30; i++) step(v, 15); leaveOpen(v, d2, 0.8); t = 0; while (d2.ang > 0 && t < 5) { step(v, 15); t += DT; }
  ok(d2.ang === 0 && t < 2.5, `${tag}: at 54 km/h the wind closes a released door (${t.toFixed(2)} s)`); row.windS = +t.toFixed(2);
  // ---- braking from 8 m/s at 8 m/s² (at higher speed the wind keeps it pressed shut): a door ajar is thrown open onto the strap
  v = fresh(type); const d3 = hingedDoors(v).find((q) => q === v.mesh.userData.door) || hingedDoors(v)[0]; for (let i = 0; i < 30; i++) step(v, 8); leaveOpen(v, d3, 0.3); sp = 8; let mx3 = 0; while (sp > 0) { sp = Math.max(0, sp - 8 * DT); step(v, sp); mx3 = Math.max(mx3, d3.ang); } for (let i = 0; i < 30; i++) { step(v, 0); mx3 = Math.max(mx3, d3.ang); }
  row.brakeW = +(d3.strapW || 0).toFixed(2); ok(mx3 > 0.9 && !d3.gone, `${tag}: hard braking throws a door ajar open to its strap (max ${mx3.toFixed(2)}), hinges intact`); row.brakeMax = +mx3.toFixed(2);
  // ---- turning left at 6 m/s, 1.2 rad/s: left (+x) door closes, right door swings out
  v = fresh(type); const L = hingedDoors(v).filter((q) => q.side > 0).sort((a, b) => b.hz - a.hz)[0], R = hingedDoors(v).filter((q) => q.side < 0).sort((a, b) => b.hz - a.hz)[0];
  if (L && R) { for (let i = 0; i < 30; i++) step(v, 6); leaveOpen(v, L, 0.5); leaveOpen(v, R, 0.5); for (let i = 0; i < 40; i++) step(v, 6, 1.2);
    ok(L.ang < 0.35, `${tag}: turning left the left door swings in (${L.ang.toFixed(2)})`); ok(R.ang > 0.6, `${tag}: turning left the right door swings out (${R.ang.toFixed(2)})`); }
  // ---- held: someone's entry spring holds it at 0.9 while the car accelerates — the physics leaves it alone
  v = fresh(type); const d4 = hingedDoors(v)[0]; sp = 0; let dev = 0; for (let i = 0; i < 180; i++) { sp += 3 * DT; DR.springDoor(v, d4, 0.9, DT, 9, 0.7); step(v, sp); if (i > 90) dev = Math.max(dev, Math.abs(d4.ang - 0.9)); }
  ok(dev < 0.03, `${tag}: a door someone holds is not moved by the physics (max deviation ${dev.toFixed(3)})`);
  // ---- wall at 9 m/s: torn off; at 4 m/s knocked shut
  for (const [spd, expectGone] of [[9, true], [4, false]]) { v = fresh(type); const dw = hingedDoors(v).filter((q) => q.side > 0)[0] || hingedDoors(v)[0]; for (let i = 0; i < 20; i++) step(v, spd); leaveOpen(v, dw, 0.75);
    const side = dw.side; const wx = v.x + side * (v.T.wid / 2 + 0.3); wall = { x0: Math.min(wx, wx + side * 2), x1: Math.max(wx, wx + side * 2), z0: v.z + dw.hz + 0.4, z1: v.z + 30 }; /* a parked lorry / pillar just ahead of the open door */ const b0 = VD.stats.doors || 0;
    for (let i = 0; i < 150 && !dw.gone && dw.ang > 0; i++) step(v, spd); wall = null; for (let i = 0; i < 120 && !dw.gone && dw.ang > 0; i++) step(v, spd);
    if (expectGone) { ok(dw.gone, `${tag}: an open door hitting a wall at ${spd * 3.6} km/h is torn off`); ok((VD.stats.doors || 0) > b0 && VD.bodies[VD.bodies.length - 1].obj.name === 'doorDebris', `${tag}: torn-off door is a debris body`);
      const deb = VD.bodies[VD.bodies.length - 1]; ok(deb && deb.obj.children.some((m) => m.name === 'paint' && m.material && !/char/i.test(m.material.name || '')), `${tag}: debris door keeps its own paint`);
      for (let i = 0; i < 240; i++) VD.update(DT); ok(deb && deb.obj.position.y < 1.2, `${tag}: torn-off door falls to the road (y ${deb && deb.obj.position.y.toFixed(2)})`);
      for (let i = 0; i < 5; i++) step(v, 0); ok(dw.live && !dw.pivot.visible && !dw.pivot.parent, `${tag}: the opening stays open (body view without the door, no pivot)`);
      VD.repair(v); step(v, 0); ok(!dw.gone && dw.pivot.parent === v.mesh && !dw.live, `${tag}: repair refits the torn-off door`); }
    else ok(!dw.gone && dw.ang === 0, `${tag}: at ${spd * 3.6} km/h the wall knocks the door shut instead (ang ${dw.ang.toFixed(2)}, gone ${dw.gone})`); }
  // ---- reversing at 22 m/s (79 km/h): blown open onto the strap → hinges tear
  v = fresh(type); const d5 = hingedDoors(v)[0]; for (let i = 0; i < 30; i++) step(v, -22); leaveOpen(v, d5, 0.15); for (let i = 0; i < 180 && !d5.gone; i++) step(v, -22);
  row.revW = +(d5.strapW || 0).toFixed(2); ok(d5.gone, `${tag}: reversing at 79 km/h blows an open door off its hinges`);
  v = fresh(type); const d6 = hingedDoors(v)[0]; for (let i = 0; i < 30; i++) step(v, -6); leaveOpen(v, d6, 0.15); for (let i = 0; i < 180 && !d6.gone; i++) step(v, -6);
  row.slowRevW = +(d6.strapW || 0).toFixed(2); ok(!d6.gone && d6.ang > 0.9, `${tag}: reversing slowly swings it open, hinges intact (${d6.ang.toFixed(2)})`);
  // ---- head-on stop from 50 km/h in 0.12 s (a wall): a half-open door is flung forward onto the strap and torn off (nearly shut it has no lever)
  v = fresh(type); const d7 = hingedDoors(v)[0]; for (let i = 0; i < 30; i++) step(v, 14); leaveOpen(v, d7, 0.45); sp = 14; for (let i = 0; i < 60 && !d7.gone; i++) { sp = Math.max(0, sp - 14 / 0.12 * DT); step(v, sp); }
  row.crashStopW = +(d7.strapW || 0).toFixed(2); ok(d7.gone, `${tag}: a head-on stop from 50 km/h tears off a half-open door (strap hit ${row.crashStopW} rad/s)`);
  v = fresh(type); const d8 = hingedDoors(v)[0]; for (let i = 0; i < 30; i++) step(v, 14); leaveOpen(v, d8, 0); for (let i = 0; i < 60; i++) step(v, 0); ok(!d8.gone && d8.ang === 0, `${tag}: a shut (latched) door is not thrown open by the same stop`);
  // ---- crashes
  let torn = 0, popped = 0, freed = 0; const N = 16;
  for (let k = 0; k < N; k++) { v = fresh(type); const dd = hingedDoors(v).filter((q) => q.side > 0)[0] || hingedDoors(v)[0]; const s = dd.side; leaveOpen(v, dd, 0.6);
    // obstacle on the door's side: contact normal pushes the car away from it (world -x·side at yaw 0), contact at the door
    VD.onImpact(v, 13, { nx: -s, nz: 0, t: dd.hz - (dd.len || 1) / 2 }); if (dd.gone) torn++; }
  ok(torn >= N * 0.6, `${tag}: a 47 km/h side hit tears off the open door on that side (${torn}/${N})`); row.crashTorn = `${torn}/${N}`;
  for (let k = 0; k < N; k++) { v = fresh(type); const dd = hingedDoors(v).filter((q) => q.side > 0)[0] || hingedDoors(v)[0]; const s = dd.side; step(v, 0);
    VD.onImpact(v, 19, { nx: -s, nz: 0, t: dd.hz - (dd.len || 1) / 2 }); if (dd.ang > 0) { popped++; for (let i = 0; i < 20; i++) step(v, 0); if (dd.ang > 0.05 && dd.live) freed++; } }
  ok(popped >= 2 && popped <= N - 2, `${tag}: a 68 km/h side hit sometimes springs a shut door's latch (${popped}/${N})`); ok(freed === popped, `${tag}: a sprung door swings free (${freed}/${popped})`); row.popped = `${popped}/${N}`;
  { v = fresh(type); const dd = hingedDoors(v)[0]; let n = 0; for (let k = 0; k < 20; k++) { VD.onImpact(v, 6, { nx: -dd.side, nz: 0, t: dd.hz - 0.5 }); if (dd.ang > 0) n++; } ok(n === 0, `${tag}: a 22 km/h bump never springs a latch (${n}/20)`); }
  rows.push(row);
}
console.table(rows);
console.log(`door-physics: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
