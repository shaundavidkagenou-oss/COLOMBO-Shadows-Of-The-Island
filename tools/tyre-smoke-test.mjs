// Vehicle smoke test (Node): the REAL VehicleSmoke against REAL vehicles (Vehicle.drive for the player's car, traffic-style
// kinematic motion for the rest). Checks
//   • exhaust comes out of each model's tail pipe (behind the car, at pipe height), and only from vehicles whose engine runs;
//   • fuel character: idling diesel buses haze, cruising petrol cars stay clean, accelerating diesels puff dark, tuk-tuks bluish;
//   • tyre smoke: launch wheelspin + burnout at the driven (rear) wheels, handbrake slides, sideways slides, crash shoves; none
//     when driving normally; much less on a wet road;
//   • performance rules: never more puffs per frame than the budget, nothing beyond 70 m, nothing indoors, the pool is never
//     re-allocated, uploads cover only the slots written this frame (≤ 2 ranges), a long burnout is capped (fill-rate);
//   • badly damaged vehicles smoke from under the bonnet.
// Run: node tools/tyre-smoke-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
{ let sd = 11; Math.random = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; }; }
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {};
const { Vehicle, LIVE_VEHICLES } = await import('../src/vehicles/Vehicle.js');
const { VehicleSmoke, SMOKE_POOL, KIND } = await import('../src/gfx/VehicleSmoke.js');
const L = await import('../src/world/Layout.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 60) console.log('  FAIL', m); } };
const collision = { groundAt: (x, z) => L.groundY(x, z), resolveCircle: (x, z) => ({ x, z }), query: () => [] };
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 2000);
const game = { scene, camera, atmos: { w: { rain: 0 } }, indoor: false };
const S = new VehicleSmoke(game, 'high');
const arrays = Object.fromEntries(Object.entries(S.A).map(([k, a]) => [k, a.array]));
// a clear patch of land (no water / roads needed: the smoke does not care)
const X0 = -140, Z0 = -880; camera.position.set(X0, 3, Z0 + 12);
const clear = () => { for (const v of [...LIVE_VEHICLES]) { scene.remove(v.mesh); LIVE_VEHICLES.delete(v); } for (let i = 0; i < SMOKE_POOL; i++) S.A.aT.setXYZW(i, -1e4, 1, 0, 0); S.tyreLoad = 0; };
const mk = (type, x, z, yaw = 0, o = {}) => { const v = new Vehicle(type, 3, scene); v.place(x, z, yaw); Object.assign(v, o); return v; };
// run the simulation; returns the puffs emitted (with their slot data) in that window
function run(secs, step, dt = 1 / 60) {
  const out = []; const n = Math.round(secs / dt);
  for (let f = 0; f < n; f++) { const before = S.stats.emitted, i0 = S.i; step && step(f * dt, dt); S.update(dt); const k = S.stats.emitted - before;
    ok(k <= S.budget, `frame emitted ${k} > budget ${S.budget}`);
    if (k) { const A = S.A.aT; ok(A.updateRanges.length >= 1 && A.updateRanges.length <= 2, 'upload ranges ' + A.updateRanges.length); const tot = A.updateRanges.reduce((s, r) => s + r.count, 0); ok(tot === k * 4, `uploaded ${tot / 4} slots for ${k} puffs`); }
    for (let j = 0; j < k; j++) { const i = (i0 + j) % SMOKE_POOL; out.push({ x: S.A.aP0.getX(i), y: S.A.aP0.getY(i), z: S.A.aP0.getZ(i), kind: S.A.aR.getY(i), grey: S.A.aC.getX(i), alpha: S.A.aC.getY(i), gy: S.A.aC.getZ(i), s1: S.A.aT.getW(i), life: S.A.aT.getY(i) }); } }
  return out;
}
// vehicle-local coordinates of a world point (x left, z forward)
const local = (v, p) => { const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), dx = p.x - v.x, dz = p.z - v.z; return { lx: dx * fz - dz * fx, lz: dx * fx + dz * fz }; };

// 1. a parked car with nobody in it: nothing
clear(); { mk('sedan', X0, Z0, 0, { parked: true }); const P = run(4); ok(P.length === 0, 'parked car smoked ' + P.length); }
// 2. an idling bus (driver aboard, standing at a stop): thin diesel haze from its tail pipe
clear(); { const b = mk('bus', X0, Z0, 0.4, { parked: false, driver: {} }); const P = run(5); const ex = P.filter((p) => p.kind === KIND.DIESEL);
  ok(ex.length >= 8 && ex.length <= 30, 'idle bus puffs ' + ex.length); const pipe = b.mesh.userData.exhaust.p;
  for (const p of ex) { const q = local(b, p); ok(q.lz < -b.T.len / 2 + 0.4 && Math.abs(q.lx - pipe[0]) < 0.25 && Math.abs(p.y - (b.y + pipe[1])) < 0.15, `bus puff not at the pipe ${q.lx.toFixed(2)},${q.lz.toFixed(2)}`); }
  ok(ex.every((p) => p.alpha < 0.25), 'idle haze too thick'); console.log('  idle bus: ' + ex.length + ' puffs / 5 s, alpha ' + (ex[0] ? ex[0].alpha.toFixed(2) : '-')); }
// 3. a petrol car cruising at a steady 14 m/s (traffic-style motion): clean
clear(); { const c = mk('sedan', X0, Z0 - 40, 0, { parked: false, driver: {} }); c.speed = 14; const P = run(5, (t, dt) => { c.z += 14 * dt; camera.position.set(c.x + 3, 3, c.z - 10); });
  ok(P.filter((p) => p.kind === KIND.EXHAUST).length <= 2, 'cruising petrol car smoked ' + P.length); ok(P.filter((p) => p.kind === KIND.TYRE).length === 0, 'cruising car tyre smoke'); }
// 4. a diesel lorry pulling away hard (traffic-style motion, accelerating): dark puffs from the stack, going up
clear(); camera.position.set(X0, 3, Z0 + 12); { const l = mk('lorry', X0, Z0, 0, { parked: false, driver: {} }); let sp = 0; const P = run(4, (t, dt) => { sp = Math.min(12, sp + 1.6 * dt); l.speed = sp; l.z += sp * dt; });
  const ex = P.filter((p) => p.kind === KIND.DIESEL); ok(ex.length > 25, 'lorry pull-away puffs ' + ex.length); const dark = ex.filter((p) => p.grey < 0.35).length; ok(dark > ex.length * 0.5, 'lorry smoke not sooty: ' + dark + '/' + ex.length);
  ok(ex.every((p) => p.y > l.y + 2.8), 'lorry smoke not at the stack top'); console.log('  lorry pull-away: ' + ex.length + ' puffs / 4 s, ' + dark + ' sooty'); }
// 5. a tuk-tuk at idle: bluish two-stroke haze
clear(); { mk('tuktuk', X0, Z0, 0, { parked: false, driver: {} }); const P = run(3); ok(P.filter((p) => p.kind === KIND.TWO_STROKE).length >= 8, 'tuk-tuk haze'); }
// 6. the player floors a sports-ish car from a standstill (real Vehicle.drive): a short launch burst at the REAR wheels + exhaust from the pipe
clear(); camera.position.set(X0 + 4, 2, Z0 - 6); { const c = mk('sedan', X0, Z0, 0, { parked: false, player: true }); const P = run(1.6, (t, dt) => c.drive(dt, { throttle: 1, steer: 0, handbrake: false }, collision, []));
  const ty = P.filter((p) => p.kind === KIND.TYRE); ok(ty.length >= 6, 'launch wheelspin smoke ' + ty.length);
  const zs = ty.map((p) => p.zl = (p.z - Z0)); void zs; const rearW = c.mesh.userData.wheels.filter((w) => !w.userData.front).map((w) => w.position.z);
  ok(ty.every((p) => p.y < c.y + 0.4 && p.y >= p.gy), 'tyre puff height'); ok(rearW.length > 0, 'no rear wheels');
  const ex = P.filter((p) => p.kind === KIND.EXHAUST); ok(ex.length >= 3, 'accelerating petrol car exhaust wisp ' + ex.length); ok(ex.every((p) => p.alpha <= 0.2), 'petrol exhaust too thick');
  const late = run(2, (t, dt) => c.drive(dt, { throttle: 1, steer: 0, handbrake: false }, collision, [])).filter((p) => p.kind === KIND.TYRE); ok(late.length === 0, 'wheelspin did not stop once moving: ' + late.length);
  console.log('  launch: ' + ty.length + ' tyre puffs, ' + ex.length + ' exhaust wisps; then ' + late.length); }
// 7. burnout (throttle against the handbrake): continuous smoke, capped so a long burnout cannot flood the screen
clear(); camera.position.set(X0 + 4, 2, Z0 - 6); { const c = mk('sedan', X0, Z0, 0, { parked: false, player: true }); const P = run(12, (t, dt) => c.drive(dt, { throttle: 1, steer: 0, handbrake: true }, collision, []));
  const ty = P.filter((p) => p.kind === KIND.TYRE); ok(ty.length > 80, 'burnout smoke ' + ty.length); const live = ty.length / 12 * 4.2; ok(live < 330, 'burnout live puffs ≈ ' + live.toFixed(0)); ok(S.tyreLoad < 300, 'tyre load ' + S.tyreLoad.toFixed(0));
  for (const p of ty) { const q = local(c, p); ok(q.lz < 0, 'burnout smoke at the front wheels'); }
  console.log('  burnout: ' + ty.length + ' puffs / 12 s (≈' + live.toFixed(0) + ' alive), load ' + S.tyreLoad.toFixed(0)); }
// 8. handbrake turn at speed + plain sideways slide (traffic car shoved by a crash)
clear(); camera.position.set(X0, 3, Z0 + 12); { const c = mk('sedan', X0, Z0, 0, { parked: false, player: true }); c.speed = 16; const P = run(1.2, (t, dt) => c.drive(dt, { throttle: 0, steer: 0.8, handbrake: true }, collision, []));
  ok(P.filter((p) => p.kind === KIND.TYRE).length > 10, 'handbrake turn smoke ' + P.length); }
clear(); { const c = mk('sedan', X0, Z0, 0, { parked: false, driver: {} }); const P = run(1.0, (t, dt) => { c.x += 7 * dt; c.z += 4 * dt; }); ok(P.filter((p) => p.kind === KIND.TYRE).length > 10, 'sideways slide smoke'); }
// 9. rain: a wet road hardly smokes
clear(); { game.atmos.w.rain = 1; const c = mk('sedan', X0, Z0, 0, { parked: false, driver: {} }); const wet = run(1.0, (t, dt) => { c.x += 7 * dt; c.z += 4 * dt; }).filter((p) => p.kind === KIND.TYRE).length; game.atmos.w.rain = 0;
  clear(); const d = mk('sedan', X0, Z0, 0, { parked: false, driver: {} }); const dry = run(1.0, (t, dt) => { d.x += 7 * dt; d.z += 4 * dt; }).filter((p) => p.kind === KIND.TYRE).length; ok(wet < dry * 0.45, `wet ${wet} vs dry ${dry}`); console.log(`  slide: dry ${dry}, wet ${wet}`); }
// 10. budget with a jam of 40 vehicles all pulling away at once; and nothing from vehicles beyond 70 m
clear(); camera.position.set(X0, 3, Z0); { const vs = []; for (let i = 0; i < 40; i++) vs.push(mk(i % 3 ? 'bus' : 'lorry', X0 + (i % 8) * 4 - 14, Z0 + Math.floor(i / 8) * 9 - 18, 0, { parked: false, driver: {} }));
  const far = mk('bus', X0 + 120, Z0, 0, { parked: false, driver: {} }); let sp = 0;
  const P = run(3, (t, dt) => { sp = Math.min(8, sp + 2 * dt); for (const v of vs) { v.speed = sp; v.z += sp * dt; } far.z += sp * dt; });
  ok(P.every((p) => Math.hypot(p.x - far.x, p.z - far.z) > 12), 'far bus smoked'); ok(P.length <= S.budget * 180, 'jam over budget'); console.log('  40-vehicle jam: ' + P.length + ' puffs / 3 s (budget ' + S.budget + '/frame)'); }
// 11. indoors: nothing
clear(); { game.indoor = true; mk('bus', X0, Z0, 0, { parked: false, driver: {} }); const P = run(2); game.indoor = false; ok(P.length === 0, 'smoke indoors'); }
// 12. a wrecked car smokes from under the bonnet
clear(); camera.position.set(X0, 3, Z0 + 12); { const c = mk('sedan', X0, Z0, 0, { parked: true, damage: 0.95 }); const P = run(3); const en = P.filter((p) => p.kind === KIND.ENGINE); ok(en.length > 15, 'engine smoke ' + en.length);
  for (const p of en) { const q = local(c, p); ok(q.lz > 0.6, 'engine smoke not at the bonnet'); } }
// 13. the pool was never re-allocated; every puff starts on or above the ground it was born on
ok(Object.entries(S.A).every(([k, a]) => a.array === arrays[k]), 'pool re-allocated');
ok(S.mesh.frustumCulled === false && S.mesh.parent === scene, 'smoke mesh not permanently in the scene');
console.log(`tyre-smoke-test: ${pass} checks, ${fail} failed (emitted ${S.stats.emitted}: tyre ${S.stats.tyre}, exhaust ${S.stats.exhaust}, engine ${S.stats.engine})`);
process.exit(fail ? 1 : 0);
