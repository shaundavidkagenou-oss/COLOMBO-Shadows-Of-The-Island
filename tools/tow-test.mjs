// Tow acceptance test (Node, headless): a vehicle the player leaves behind is never culled by distance; it is towed only
// after the player has been more than TOW_DIST away for TOW_TIME seconds (coming back resets the clock); the tow truck
// spawns on a lane, wheel-lifts the car (front axle in the cradle behind the truck, nose up, rear wheels on the road),
// drives off with it, and removing the truck disposes the car. A mission vehicle released with tow=false is never towed.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const L = await import('../src/world/Layout.js');
const { Traffic, TOW_DIST, TOW_TIME } = await import('../src/vehicles/Traffic.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const towed = []; const events = { emit(n, v) { if (n === 'towed') towed.push(v); }, on() {} };
const T = new Traffic(new THREE.Scene(), { blocked: () => false, resolveCircle: (x, z) => ({ x, z, hit: false }) }, events); T.max = 0;
const seg = T.drivableSegs.find((s) => s.level === 1 && !s.crossing && s.dir === 'v'); const mx = (seg.x0 + seg.x1) / 2, mz = (seg.z0 + seg.z1) / 2;
const car = new Vehicle('car', 5, T.scene); car.place(mx + 9, mz, 0); T.release(car);
const mission = new Vehicle('tuktuk', 7, T.scene); mission.place(mx + 12, mz + 10, 0); T.release(mission, false);
const near = { x: mx + 20, z: mz }, far = { x: mx + TOW_DIST + 60, z: mz };
const run = (sec, focus) => { for (let i = 0; i < sec * 10; i++) T.update(0.1, focus, null, i * 0.1, [], null); };
run(TOW_TIME * 0.8, far); ok(T.parked.includes(car) && !towed.length, 'still parked after 4 min away (not culled by distance)');
run(5, near); ok(car.left.away === 0, 'coming back resets the clock');
run(TOW_TIME * 0.8, far); ok(T.parked.includes(car) && !towed.length, 'clock restarted: still there 4 more min later');
run(TOW_TIME * 0.25, far); ok(towed[0] === car && !T.parked.includes(car), 'towed after 5 continuous minutes away');
ok(T.parked.includes(mission) && !towed.includes(mission), 'mission vehicle (tow=false) never towed');
const truck = car.towedBy; ok(truck && truck.type === 'tow', 'tow truck spawned');
if (truck) {
  const fx = Math.sin(truck.yaw), fz = Math.cos(truck.yaw); const behind = (truck.x - car.x) * fx + (truck.z - car.z) * fz;
  ok(behind > truck.T.len / 2 && behind < truck.T.len / 2 + car.T.len + 1.5, `car hitched behind the truck (${behind.toFixed(2)} m)`);
  ok(car.pitch < -0.05 && car.pitch > -0.3, `nose up (pitch ${car.pitch.toFixed(3)})`);
  ok(Math.abs(car.yaw - truck.yaw) < 1e-6, 'aligned with the truck');
  const d0 = Math.hypot(truck.x - car.x, truck.z - car.z); const x0 = truck.x, z0 = truck.z;
  if (truck.ai) { truck.ai.v0 = 8; for (let i = 0; i < 60; i++) T.update(0.1, { x: truck.x + 60, z: truck.z }, null, 0, [], null); }
  ok(Math.hypot(truck.x - x0, truck.z - z0) > 5, 'truck drives off'); ok(Math.abs(Math.hypot(truck.x - car.x, truck.z - car.z) - d0) < 0.3, 'car stays on the hitch while moving');
  let disposed = false; const od = car.dispose.bind(car); car.dispose = () => { disposed = true; od(); };
  run(2, { x: truck.x + 2000, z: truck.z }); ok(!T.vehicles.includes(truck) && disposed, 'truck despawns out of range and the towed car goes with it');
}
console.log(`tow: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
