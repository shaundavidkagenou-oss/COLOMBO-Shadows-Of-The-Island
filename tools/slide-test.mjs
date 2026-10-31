// No-slide test (Node, headless): AI cars move like cars — never sideways relative to their own heading and never spinning
// on the spot. Covered: free-flowing city traffic, pulling out round a kerb-parked car, recovering after a knock (shove),
// and a unit rejoining its lane from 8 m off it (as after a chase). A physical skid (vehicle.free) is excluded: that is a real slide.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Traffic, evalPiece } = await import('../src/vehicles/Traffic.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const events = { emit() {}, on() {} };
const stub = { blocked: () => false, resolveCircle: (x, z) => ({ x, z, hit: false }) };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// body-frame sideways speed and on-the-spot yaw rate of every lane-driven car, worst case over a run
function track(T, steps, dt, focus, extra = () => {}) {
  const prev = new Map(); let worstLat = 0, worstSpin = 0, who = '', samples = 0;
  for (let i = 0; i < steps; i++) {
    T.update(dt, focus, null, i * dt, [], null); extra(i);
    for (const v of T.vehicles) {
      const p = prev.get(v); const skid = !!v.free || !v.ai || !!(v.ai && v.ai.chase) || !!v.towedBy;
      if (p && !skid && !p.skid) {
        const dx = v.x - p.x, dz = v.z - p.z, ym = p.yaw + wrap(v.yaw - p.yaw) / 2; const d = Math.hypot(dx, dz);
        if (d < 3) { // ignore respawns / recycles
          const lat = Math.abs(dx * Math.cos(ym) - dz * Math.sin(ym)) / dt; samples++;
          if (lat > worstLat) { worstLat = lat; who = `${v.type} #${v.id} sp ${v.speed.toFixed(1)} lat ${v.ai.lat?.toFixed(2)} rejoin ${!!v.ai.rejoin}`; }
          if (d / dt < 0.05) worstSpin = Math.max(worstSpin, Math.abs(wrap(v.yaw - p.yaw)) / dt);
        }
      }
      prev.set(v, { x: v.x, z: v.z, yaw: v.yaw, skid });
    }
  }
  return { worstLat, worstSpin, who, samples };
}
function laneCar(T, s = 6, v0 = 9) {
  const seg = T.drivableSegs.filter((q) => (q.level === 1 || q.level === 2) && !q.crossing && Math.abs((q.z1 - q.z0) + (q.x1 - q.x0)) > 75)[2];
  const ln = T.laneNear((seg.x0 + seg.x1) / 2, (seg.z0 + seg.z1) / 2, seg.dir === 'v' ? 0 : Math.PI / 2); ln.s = s;
  const car = new Vehicle('car', 11, T.scene); T.adoptAI(car, ln, { v0 }); return { car, ln };
}
const LAT_MAX = 0.35; // m/s sideways in the body frame (heading smoothing lag); a crabbing car shows 2+ m/s

// 1. city traffic, 90 s at 30 fps
{ const T = new Traffic(new THREE.Scene(), stub, events); T.max = 40; const focus = { x: -120, z: -300 };
  const r = track(T, 90 * 30, 1 / 30, focus);
  ok(r.samples > 20000, `enough traffic samples (${r.samples})`);
  ok(r.worstLat < LAT_MAX, `city traffic never moves sideways (worst ${r.worstLat.toFixed(2)} m/s: ${r.who})`);
  ok(r.worstSpin < 0.05, `no car turns on the spot (worst ${r.worstSpin.toFixed(3)} rad/s)`); }

// 2. pulling out round a kerb-parked car (and waiting behind it first when there is oncoming traffic)
{ const T = new Traffic(new THREE.Scene(), stub, events); T.max = 0; const { car, ln } = laneCar(T);
  const [px, pz, pyaw] = evalPiece(ln.piece, 40); const fx = Math.sin(pyaw), fz = Math.cos(pyaw); const pk = new Vehicle('sedan', 12, T.scene); pk.place(px + fz * 1.0, pz - fx * 1.0, pyaw); T.release(pk);
  let maxLat = 0; const r = track(T, 20 * 30, 1 / 30, { x: px, z: pz }, () => { maxLat = Math.max(maxLat, Math.abs(car.ai ? car.ai.lat : 0)); });
  ok(maxLat > 0.5, `the car really pulled out round the parked car (${maxLat.toFixed(2)} m)`);
  ok(r.worstLat < LAT_MAX, `pulling out is driven, not slid (worst ${r.worstLat.toFixed(2)} m/s)`); }

// 3. knocked by a collision: skids (excluded), then drives itself back into the lane
{ const T = new Traffic(new THREE.Scene(), stub, events); T.max = 0; const { car } = laneCar(T, 20, 9);
  for (let i = 0; i < 30; i++) T.update(1 / 30, { x: car.x, z: car.z }, null, i / 30, [], null);
  const [fx, fz] = car.forward(); car.shove(fz * 4.5, -fx * 4.5, 0.8); let wasRejoin = false, back = false;
  const r = track(T, 25 * 30, 1 / 30, { x: car.x, z: car.z }, () => { if (car.ai && car.ai.rejoin) wasRejoin = true; if (wasRejoin && car.ai && !car.ai.rejoin && !car.free) back = true; });
  ok(wasRejoin, 'after the skid the car steers back (rejoin mode)'); ok(back, 'and is back in lane-following within 25 s');
  ok(r.worstLat < LAT_MAX, `recovery is driven, not slid (worst ${r.worstLat.toFixed(2)} m/s: ${r.who})`); ok(r.worstSpin < 0.05, `no spinning on the spot while recovering (${r.worstSpin.toFixed(3)})`); }

// 4. a unit 8 m off its lane and turned 35° (end of a chase) drives back onto it
{ const T = new Traffic(new THREE.Scene(), stub, events); T.max = 0; const { car, ln } = laneCar(T, 10, 9);
  const [x, z, yaw] = evalPiece(ln.piece, 10); car.x = x + Math.cos(yaw) * 8; car.z = z - Math.sin(yaw) * 8; car.yaw = yaw + 0.6; car.ai.rejoin = true; car.speed = 3;
  let back = -1; const r = track(T, 25 * 30, 1 / 30, { x, z }, (i) => { if (back < 0 && car.ai && !car.ai.rejoin) back = i / 30; });
  ok(back > 0, `rejoined the lane (${back.toFixed(1)} s)`); ok(r.worstLat < LAT_MAX, `rejoin is driven, not slid (worst ${r.worstLat.toFixed(2)} m/s: ${r.who})`);
  const [lx, lz] = evalPiece(car.ai.pieces[0], car.ai.s); ok(Math.hypot(car.x - lx, car.z - lz) < 0.3, `ends on the lane (${Math.hypot(car.x - lx, car.z - lz).toFixed(2)} m off)`); }

console.log(`slide: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
