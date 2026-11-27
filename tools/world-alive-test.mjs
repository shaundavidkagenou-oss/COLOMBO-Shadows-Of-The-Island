// Integration test for the living-world update: the real crowd, traffic, building works, street services and the world
// director running together for a simulated stretch of the day, the way Game.updatePlay drives them. Also the measurement
// for the performance table (per-frame cost of the new systems, with the crowd/traffic baseline beside it).
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast', 'glass', 'tyre', 'chrome', 'plastic', 'light', 'rubber', 'trim', 'decal', 'seat']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { Construction } = await import('../src/world/Construction.js');
const { StreetServices } = await import('../src/world/StreetServices.js');
const { SimDirector } = await import('../src/world/SimDirector.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene();
const bus = { emit() {}, on() {} };
const C = new Crowd(scene, col, bus); C.prepareSpecs(40); C.max = 60;
const T = new Traffic(scene, col, bus); T.max = 18; T.crowd = C;
const player = { x: 0, z: 0, yaw: 0, speed: 0, vehicle: null };
const game = { collision: col, scene, crowd: C, traffic: T, player };
const tP0 = performance.now();
const K = new Construction(game); await K.prewarm(null);
const S = new StreetServices(game); S.prewarm();
const D = new SimDirector(game);
const setupMs = performance.now() - tP0;
console.log(`setup: ${setupMs.toFixed(0)} ms (${K.sites.length} works, ${S.bins.length} bins, ${S.beats.length} sweeping beats)`);
ok(K.sites.length >= 3 && S.bins.length > 10 && D, 'the world builds behind the loading screen');

// a busy corner with a site near it, so everything is in range at once
let spot = null;
for (const s of K.sites) { const beats = S.beats.find((b) => Math.hypot(b[0].x - s.x, b[0].z - s.z) < 190); if (beats) { spot = { x: s.x, z: s.z, site: s, beat: beats }; break; } }
if (!spot) spot = { x: K.sites[0].x, z: K.sites[0].z, site: K.sites[0], beat: S.beats[0] };
player.x = spot.x; player.z = spot.z;
const focus = { x: spot.x, z: spot.z };

const frames = 2400, dt = 1 / 30; // 80 s of game time at 30 Hz
let hour = 11.5, day = 1, simT = 0; const ms = { crowd: 0, traffic: 0, works: 0, street: 0, director: 0 }; let worst = 0, worstWhat = '';
for (let i = 0; i < frames; i++) {
  hour += dt / 60; if (hour >= 24) { hour -= 24; day++; }
  const ctx = { simTime: simT, hour, day, rain: 0, night: 0, vehicles: T.all(), player, hourFactor: D.factor(), bodies: [] };
  const t0 = performance.now(); T.update(dt, focus, { x: 0, z: 1 }, simT, C.peds, player); const t1 = performance.now();
  const t2 = performance.now(); C.update(dt, focus, { x: 0, z: 1 }, ctx); const t3 = performance.now();
  const t4 = performance.now(); K.update(dt, focus, ctx); const t5 = performance.now();
  S.update(dt, focus, ctx); const t6 = performance.now();
  D.update(dt, ctx); const t7 = performance.now();
  ms.traffic += t1 - t0; ms.crowd += t3 - t2; ms.works += t5 - t4; ms.street += (t6 - t5) + (t7 - t6); ms.director; simT += dt;
  const frameNew = (t5 - t4) + (t6 - t5) + (t7 - t6); if (frameNew > worst) { worst = frameNew; worstWhat = `frame ${i}`; }
  if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0));
}
ok(C.peds.length > 4, `the street is populated (${C.peds.length} people)`);
ok(T.vehicles.length > 0, `the traffic is running (${T.vehicles.length} vehicles)`);
ok(K.stats.workers > 0 || spot.site.crew.length > 0, `the works are manned (${K.stats.workers} workers on site)`);
ok(S.bins.some((b) => b.fill > 0), `the bins are filling (mean ${S.stats.fill})`);
ok(D.stats.budget <= 3, `the near-field budget holds (${D.stats.budget} heavy works)`);
ok(Number.isFinite(D.stats.act) && D.stats.act >= 0, `the director reports an activity level (${D.stats.act})`);
const per = (n) => (ms[n] / frames).toFixed(3);
console.log(`per frame (${frames} frames, ${(frames / 30).toFixed(0)} s): crowd ${per('crowd')} ms · traffic ${per('traffic')} ms · works ${per('works')} ms · services+director ${per('street')} ms`);
console.log(`worst new-system frame: ${worst.toFixed(2)} ms (${worstWhat})`);
ok(parseFloat(per('works')) + parseFloat(per('street')) < 4.0, 'the new systems stay inside a sane per-frame budget');
let bad = 0; for (const p of C.peds) if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) bad++;
ok(bad === 0, `nobody ends up at a broken position (${bad} bad)`);
const strays = C.peds.filter((p) => p.job && p.ch.crowdPed !== p).length;
ok(strays === 0, `no orphaned job agents (${strays})`);
console.log(`world-alive: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
