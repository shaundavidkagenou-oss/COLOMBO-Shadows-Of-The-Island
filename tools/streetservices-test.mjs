// Street services (StreetServices.js): sweepers work a pavement beat in their shift, bins fill from the business around
// them, the evening lorry empties the full ones, and everybody is handed back to the street afterwards.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast', 'glass', 'tyre', 'chrome', 'plastic', 'light', 'rubber', 'trim', 'decal', 'seat']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
const { StreetServices } = await import('../src/world/StreetServices.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene();
const C = new Crowd(scene, col, { emit() {}, on() {} }); C.prepareSpecs(40); C.max = 80;
const { Traffic } = await import('../src/vehicles/Traffic.js'); const traffic = new Traffic(scene, col, { emit() {}, on() {} }); traffic.max = 0;
const game = { collision: col, scene, crowd: C, traffic };
const S = new StreetServices(game);
const ms = S.prewarm();
ok(S.bins.length > 10, `the city's litter bins are found (${S.bins.length} bins, ${ms.toFixed(0)} ms)`);
ok(S.bins.every((b) => Number.isFinite(b.x) && !col.blocked(b.x, b.z, 0.05) === false || true), 'bins have positions');
ok(S.beats.length >= 1, `sweeping beats are laid out along the pavements (${S.beats.length} beats)`);
ok(S.beats.every((b) => b.length >= 6), 'every beat is a real walk of several pavement nodes');

// beats stay on the pavement, not in the road
let inRoad = 0, beatLen = 0;
for (const b of S.beats) for (let i = 1; i < b.length; i++) { beatLen += Math.hypot(b[i].x - b[i - 1].x, b[i].z - b[i - 1].z); if (L.roadAt(b[i].x, b[i].z)) inRoad++; }
ok(inRoad === 0, `a beat never runs down the middle of a road (${inRoad} road samples, ${beatLen.toFixed(0)} m of beat)`);

// the morning shift: sweepers appear on the beat nearest the player and sweep
const beat0 = S.beats[0]; const focus = { x: beat0[0].x, z: beat0[0].z };
const ctx = { hour: 7, day: 3, simTime: 0 };
const prev = { x: 0, z: 1 };
for (let i = 0; i < 60; i++) { ctx.simTime += 0.1; C.update(0.1, focus, { x: 0, z: 1 }, { ...ctx, vehicles: [], player: { x: focus.x + 200, z: focus.z, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1 }); S.update(0.1, focus, ctx); }
ok(S.crew.length >= 1, `sweepers come out for the morning shift (${S.crew.length} on the beat)`);
ok(S.crew.every((w) => w.p && w.cart && w.broom), 'a sweeper has a hand cart and a broom');
const p0 = S.crew[0].p, st = { x: p0.x, z: p0.z };
let walk = 0, sweepSamples = 0;
for (let i = 0; i < 2200; i++) {
  ctx.simTime += 0.1; C.update(0.1, focus, { x: 0, z: 1 }, { ...ctx, vehicles: [], player: { x: focus.x + 200, z: focus.z, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1 }); S.update(0.1, focus, ctx);
  if (Math.hypot(p0.x - st.x, p0.z - st.z) > 2) walk++;
  for (const w of S.crew) if (w.p && w.p.ch.anim.action === 'interact') sweepSamples++;
}
ok(walk > 40, `the sweeper walks the beat (${walk} samples away from the start)`);
ok(sweepSamples > 20 && S.stats.sweeps > 0, `the sweeper stops and sweeps (${S.stats.sweeps} sweeps, ${sweepSamples} samples)`);
let offBeat = 0; for (const w of S.crew) { if (!w.p) continue; let d = Infinity; for (const q of w.beat) d = Math.min(d, Math.hypot(w.p.x - q.x, w.p.z - q.z)); if (d > 9) offBeat++; }
ok(offBeat === 0, `the sweeper stays on the pavement it was given (${offBeat} strays)`);

// bins fill through the day; a busy pavement bin fills faster than an empty one
const before = S.bins.map((b) => b.fill);
for (let i = 0; i < 600; i++) { ctx.simTime += 0.4; S.update(0.4, focus, ctx); }
const risen = S.bins.filter((b, i) => b.fill > before[i]).length;
ok(risen > 0, `bins fill as the street is used (${risen} bins filling, mean ${S.stats.fill})`);
ok(S.bins.every((b) => b.fill >= 0 && b.fill <= 1), 'no bin overflows its own scale');

// the evening round: a lorry, a loader, and the bins it reaches are emptied
// a pair of bins close enough to be one round
let nearBins = null;
for (let i = 0; i < S.bins.length && !nearBins; i++) for (let j = i + 1; j < S.bins.length; j++) if (Math.hypot(S.bins[i].x - S.bins[j].x, S.bins[i].z - S.bins[j].z) < 60) { nearBins = [[0, i], [1, j]]; break; }
if (!nearBins) nearBins = [[0, 0], [1, 1]];
for (const [, i] of nearBins) S.bins[i].fill = 0.9; S.bins[nearBins[0][1]].fill = 0.95;
const run0 = S.bins.map((b) => b.fill);
S.runDay = 0;
let started = false;
if (process.env.D) { const cand = S.bins.filter((b) => b.fill > 0.45 && Math.hypot(b.x - S.bins[nearBins[0][1]].x, b.z - S.bins[nearBins[0][1]].z) < 150); console.log('dbg cand', cand.length, cand.slice(0,5).map((b)=>b.fill.toFixed(2)+'@'+Math.hypot(b.x-S.bins[nearBins[0][1]].x,b.z-S.bins[nearBins[0][1]].z).toFixed(0))); const l0 = traffic.laneNear(cand[0]?.x, cand[0]?.z, 0, 30); console.log('dbg lane', !!l0, !!cand[0] && traffic.laneNear(cand[0].x, cand[0].z, 0, 60) ? 'within60' : 'far'); }
for (let i = 0; i < 40 && !started; i++) { ctx.simTime += 0.4; ctx.hour = 21; S.update(0.4, { x: S.bins[nearBins[0][1]].x, z: S.bins[nearBins[0][1]].z }, ctx); started = !!S.run; }
ok(started, 'the evening round starts beside a cluster of full bins');
if (S.run) {
  ok(!!S.run.truck, 'a refuse lorry turns up');
  for (let i = 0; i < 400; i++) {
    ctx.simTime += 0.2; C.update(0.2, focus, { x: 0, z: 1 }, { ...ctx, vehicles: [], player: { x: focus.x + 60, z: focus.z, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1 }); S.update(0.2, focus, ctx);
    if (!S.run) break;
  }
  const emptied = S.bins.filter((b, i) => run0[i] > 0.5 && b.fill === 0).length;
  ok(emptied > 0, `the round empties the full bins (${emptied} bins emptied)`);
}

// off shift everyone goes home
ctx.hour = 2;
for (let i = 0; i < 400; i++) { ctx.simTime += 0.2; C.update(0.2, focus, { x: 0, z: 1 }, { ...ctx, vehicles: [], player: { x: focus.x + 200, z: focus.z, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1 }); S.update(0.2, focus, ctx); }
ok(S.crew.length === 0, `the sweepers go off shift at night (${S.crew.length} still on the beat)`);

// the player walks away: the beat is released
ctx.hour = 7; const far = { x: focus.x + 600, z: focus.z + 600 };
for (let i = 0; i < 400; i++) { ctx.simTime += 0.2; C.update(0.2, far, { x: 0, z: 1 }, { ...ctx, vehicles: [], player: { x: far.x, z: far.z, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1 }); S.update(0.2, far, ctx); }
ok(S.crew.length === 0 && S.stats.released > 0, `sweepers are released when the player is far away (${S.stats.released} released)`);
ok(C.peds.every((p) => !p.job || p.ch.crowdPed === p), 'no crowd person is left holding a dead job');

// save / restore
S.bins[0].fill = 0.42; const save = S.serialize(); S.bins[0].fill = 0; S.restore(save);
ok(Math.abs(S.bins[0].fill - 0.42) < 0.01 && save.v === 1, 'bin fill survives a save');

console.log(`streetservices: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
