// Railway + trains acceptance test (Node, headless): track path quality, platform/crossing geometry, train service,
// curve speed limits, cars staying on the rails, level crossings closing in time, AI stopping, obstacle braking.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); } // textures aren't built under Node
const L = await import('../src/world/Layout.js');
const R = await import('../src/world/Railway.js');
const { Trains, TRAIN_LEN, CAR_LEN, CAR_GAP, speedLimitAt } = await import('../src/vehicles/Trains.js');

let pass = 0, fail = 0; const ok = (c, msg) => { if (c) { pass++; if (process.env.V) console.log('ok  ', msg); } else { fail++; console.log('FAIL', msg); } };

// ---- path
let minR = 1e9, dev = 0; const P = R.PATH;
for (let i = 2; i < P.xs.length - 2; i++) {
  const a = Math.atan2(P.xs[i] - P.xs[i - 2], P.zs[i] - P.zs[i - 2]), b = Math.atan2(P.xs[i + 2] - P.xs[i], P.zs[i + 2] - P.zs[i]);
  let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; minR = Math.min(minR, 4 / Math.max(d, 1e-6)); dev = Math.max(dev, L.distToRail(P.xs[i], P.zs[i]));
}
ok(minR >= 38, `min curve radius ${minR.toFixed(1)} m ≥ 38`); ok(dev <= 6, `path stays in the rail corridor (max deviation ${dev.toFixed(2)} m)`);
let maxStep = 0; for (let i = 1; i < P.xs.length; i++) maxStep = Math.max(maxStep, Math.abs(Math.hypot(P.xs[i] - P.xs[i - 1], P.zs[i] - P.zs[i - 1]) - 2)); ok(maxStep < 0.05, 'path evenly sampled');
ok(R.STOPS.length === 6, '6 stations on the line'); ok(R.CROSSINGS.length >= 6, `level crossings found (${R.CROSSINGS.length})`);
ok(Math.abs(R.GAUGE - 1.676) < 1e-6, 'broad gauge 1,676 mm');
for (const st of R.STOPS) { const r = R.nearestS(st.x, st.z); ok(r.d < 1.0, `${st.name} on the track (${r.d.toFixed(2)} m)`); }
// ---- ground hook: bed + humped crossings
const c0 = R.CROSSINGS[2]; const gy = (d) => L.groundY(c0.x - c0.rdz * d, c0.z + c0.rdx * d);
ok(Math.abs(gy(0) - (R.RAIL_TOP - 0.006)) < 1e-3, 'crossing deck level with rail heads'); ok(gy(R.DECK_HW + R.RAMP + 1) <= L.ROAD_Y + 0.01, 'crossing ramps back to road level');
let mono = true; for (let d = 0; d < R.DECK_HW + R.RAMP; d += 0.25) if (gy(d + 0.25) > gy(d) + 1e-6) mono = false; ok(mono, 'crossing hump is a smooth monotone ramp');
const pb = R.sampleAt(600); ok(Math.abs(L.groundY(pb.x, pb.z) - R.BALLAST_Y) < 1e-6, 'standing on the ballast bed, not sunk into it');
ok(L.groundY(-300, 400) === L.LAND_Y || L.groundY(-300, 400) === L.ROAD_Y, 'ground away from the railway unchanged');

// ---- trains
const scene = new THREE.Scene(); const T = new Trains(scene);
ok(T.trains.length === 1, 'one train works the single-track line'); ok(T.bodies.length === 5, '5 cars as collision bodies');
const visits = T.trains.map(() => []); let minEnd = 1e9, overSpeed = 0, offRail = 0, overlap = 0, lateClose = 0, maxV = 0, closedAtPass = 0, passes = 0;
const pa = {}, pb2 = {};
const dt = 0.1; const prevFront = T.trains.map((t) => t.front);
for (let step = 0; step < 36000; step++) { // 3600 s simulated at 0.1 s
  T.update(dt, { focus: { x: 0, z: 0 }, vehicles: [] });
  T.trains.forEach((t, k) => {
    if (t.state === 'dwell' && t.stoppedAt && visits[k][visits[k].length - 1] !== t.stoppedAt) visits[k].push(t.stoppedAt);
    maxV = Math.max(maxV, t.speed);
    for (let s = t.sLow; s <= t.sLow + TRAIN_LEN; s += 4) if (t.speed > speedLimitAt(s) + 0.6) { overSpeed++; break; }
    for (let i = 0; i < t.bodies.length; i++) {
      const b = t.bodies[i]; const r = R.nearestS(b.x, b.z); if (r.d > 0.65) offRail++; // body centre sits on the chord between its bogies
      if (i) { const q = t.bodies[i - 1]; const [qf, qz] = q.forward(), [bf, bz] = b.forward(); for (const sd of [-1.5, 1.5]) { const ax = q.x + qf * CAR_LEN / 2 + qz * sd, az = q.z + qz * CAR_LEN / 2 - qf * sd, bx = b.x - bf * CAR_LEN / 2 + bz * sd, bz2 = b.z - bz * CAR_LEN / 2 - bf * sd; const gap = Math.hypot(ax - bx, az - bz2); minEnd = Math.min(minEnd, gap); if (gap < 0.12) overlap++; } } // facing end corners keep clear on curves
    }
    // crossings must be closed (lamps) when the front reaches them and booms ≥ 90 % down
    for (const c of T.crossings) {
      const was = (c.s - prevFront[k]) * t.dir, now = (c.s - t.front) * t.dir;
      if (was > 0 && now <= 0) { passes++; if (!c.closed) lateClose++; if (c.boom > 0.9) closedAtPass++; }
    }
    prevFront[k] = t.front;
  });
}
console.log('stops served in 1 h:', visits.map((v, k) => `train ${k}: ${v.length}`).join(', '));
for (let k = 0; k < T.trains.length; k++) { for (const st of R.STOPS) ok(visits[k].includes(st.name), `train ${k} served ${st.name}`); ok((T.trains[k].reversals || 0) >= 1, `train ${k} reversed at a terminus`); }
ok(overSpeed === 0, `curve/line speed limits respected (${overSpeed} violations)`); ok(maxV > 10, `trains reach line speed (${maxV.toFixed(1)} m/s)`);
ok(offRail === 0, `cars stay on the rails (${offRail})`); ok(overlap === 0, `car ends never touch, min corner gap ${minEnd.toFixed(2)} m (${overlap})`);
ok(passes > 10, `trains crossed level crossings (${passes})`); ok(lateClose === 0, `crossings closed before every train (${lateClose} late)`); ok(closedAtPass === passes, `booms fully down at every pass (${closedAtPass}/${passes})`);

// ---- AI car approaching an active crossing stops before the ramp
const c = T.crossings.find((q) => q.dir === 'v'); c.active = true; const fakeCar = { x: c.x + 1.5, z: c.z - 40, yaw: 0, half: 2.2 };
const sd = T.stopDistance(fakeCar); ok(sd < 40 && sd > 25, `AI stop line before crossing (${sd.toFixed(1)} m ahead)`);
fakeCar.z = c.z + 30; ok(T.stopDistance(fakeCar) === Infinity, 'AI past the crossing keeps going');

// ---- obstacle braking: a person standing on the track ahead → train stops short
{
  const T2 = new Trains(new THREE.Scene(), { count: 1 }); const t = T2.trains[0]; t.state = 'run'; t.dwell = 0; t.speed = 12; t.dir = 1; t.sLow = 900; t.nextStop = R.STOPS.find((s) => s.s > 1400);
  const sObs = t.front + 140; const p = R.sampleAt(sObs); const person = { x: p.x, z: p.z, y: R.BALLAST_Y };
  let minGap = 1e9; for (let i = 0; i < 600; i++) { T2.update(0.05, { player: person, vehicles: [] }); minGap = Math.min(minGap, sObs - t.front); }
  ok(t.speed < 0.05 && minGap > 2, `train brakes to a stop before someone on the track (gap ${minGap.toFixed(1)} m)`);
  // person on a platform (raised) is not an obstacle
  const person2 = { x: p.x, z: p.z, y: R.RAIL_TOP + 0.7 }; ok(t.obstacleAhead([person2]) === Infinity, 'someone on a platform does not trigger braking');
  // push-out: a moving car pushes sideways, never drags along in front
  const b = t.bodies[t.bodies.length - 1]; b.speed = 5; const [fx, fz] = b.forward(); const q = b.pushOut(b.x + fx * (CAR_LEN / 2 + 0.1), b.z + fz * (CAR_LEN / 2 + 0.1), 0.32);
  ok(q && Math.abs((q.x - b.x) * fz - (q.z - b.z) * fx) >= 1.5 + 0.3, 'struck person is pushed off the track sideways');
}
// ---- safety net: if two trains are ever put on the single line they stop short of each other (never overlap)
{
  const T3 = new Trains(new THREE.Scene(), { count: 2 }); let minSep = 1e9;
  for (let i = 0; i < 12000; i++) { T3.update(0.1, { vehicles: [] }); const [a, b] = T3.trains; const sep = a.sLow < b.sLow ? b.sLow - (a.sLow + TRAIN_LEN) : a.sLow - (b.sLow + TRAIN_LEN); minSep = Math.min(minSep, sep); }
  ok(minSep > 2, `two trains on the single line never collide (min separation ${minSep.toFixed(1)} m)`);
}
// level-crossing booms: a car crashing through a lowered boom swings it up smoothly (no snap), the arm never passes
// through the car, it settles back down afterwards, and it rests steadily on a vehicle stopped under it
{
  const T4 = new Trains(new THREE.Scene(), { count: 1 }); let maxJump = 0, through = 0, settled = 0, restJit = 0, restAng = 0, raised = 0;
  for (const c of T4.crossings) {
    const sd = c.sides[0]; const UP = Math.PI / 2 * 0.95; for (let i = 0; i < 400; i++) T4.stepBoom(sd, 1, [], 1 / 60);
    // car approaching along the road, aimed at the middle of the arm, at 10 m/s
    const mx = sd.px + sd.bdx * sd.len * 0.5, mz = sd.pz + sd.bdz * sd.len * 0.5; const dx = sd.bdz, dz = -sd.bdx; // across the arm
    const car = { x: mx - dx * 12, z: mz - dz * 12, y: 0.15, yaw: Math.atan2(dx, dz), speed: 10, T: { len: 4.2, wid: 1.75, hgt: 1.5 } };
    let prev = sd.arm.rotation.z, top = 0;
    for (let i = 0; i < 60 * 12; i++) { if (i < 60 * 2.4) { car.x += dx * 10 / 60; car.z += dz * 10 / 60; } else car.speed = 0; if (i === 60 * 2.4) { car.x += dx * 30; car.z += dz * 30; } // drives through, then away
      T4.stepBoom(sd, 1, [car], 1 / 60); const a = sd.arm.rotation.z; maxJump = Math.max(maxJump, Math.abs(a - prev)); prev = a; top = Math.max(top, a);
      if (a < T4.armClearance(sd, car) - 1e-6) through++; }
    if (top > 0.4) raised++; if (sd.arm.rotation.z < 0.01) settled++;
    // a car parked under the lowered arm: the arm lies on its roof, steady
    const pk = { x: mx, z: mz, y: 0.15, yaw: Math.atan2(dx, dz), speed: 0, T: { len: 4.2, wid: 1.75, hgt: 1.5 } };
    for (let i = 0; i < 600; i++) T4.stepBoom(sd, 1, [pk], 1 / 60); const a0 = sd.arm.rotation.z;
    for (let i = 0; i < 60; i++) { T4.stepBoom(sd, 1, [pk], 1 / 60); restJit = Math.max(restJit, Math.abs(sd.arm.rotation.z - a0)); }
    restAng = Math.max(restAng, Math.abs(a0 - T4.armClearance(sd, pk)));
  }
  const n = T4.crossings.length;
  ok(raised === n, `a car crashing a lowered boom swings it up (${raised}/${n})`); ok(maxJump < 0.3, `boom arm never snaps (max step ${maxJump.toFixed(3)} rad/frame)`);
  ok(through === 0, `boom arm never passes through the car (${through} frames)`); ok(settled === n, `boom settles back down after the car (${settled}/${n})`);
  ok(restJit < 1e-4 && restAng < 1e-3, `boom rests steadily on a car parked under it (jitter ${restJit.toExponential(1)}, gap ${restAng.toExponential(1)})`);
}
console.log(`metrics: min radius ${minR.toFixed(1)} m, corridor deviation ${dev.toFixed(2)} m, crossings ${R.CROSSINGS.length}, top speed ${maxV.toFixed(1)} m/s, crossing passes ${passes}, min car-end gap ${minEnd.toFixed(2)} m`);
console.log(`rail: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
