// Traffic-police duty test (Node, headless): every officer on point duty has a police motorcycle parked on its side stand
// on the pavement nearby; at the end of the shift he walks to it, mounts, kicks the stand up (bike upright, stand up), rides
// off the kerb into traffic on a planned road-graph route, and that route reaches the junction in front of Police HQ.
// Also: a parked bike leans on its stand; the stand animation ends fully up / fully down.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const L = await import('../src/world/Layout.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { TrafficDuty, HQ_NODE } = await import('../src/police/TrafficDuty.js');
const K = await import('../src/vehicles/Kickstand.js');
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const scene = new THREE.Scene(); const T = new Traffic(scene, { blocked: () => false, resolveCircle: (x, z) => ({ x, z, hit: false }) }, { emit() {}, on() {} }); T.max = 0;
const g = { scene, traffic: T, collision: { blocked: () => false }, player: { x: 0, z: 0 }, atmos: { hour: 10, night: 0 }, camera: null, police: null, clock: 0, hqLife: null };
const D = new TrafficDuty(g); ok(D.posts.length > 3, `duty posts (${D.posts.length})`);
// pick the post with the shortest drive to HQ that has a valid bike spot
const posts = D.posts.filter((p) => D.bikeSpotFor(p)).sort((a, b) => Math.hypot(a.x - HQ_NODE.x, a.z - HQ_NODE.z) - Math.hypot(b.x - HQ_NODE.x, b.z - HQ_NODE.z));
ok(posts.length >= D.posts.length * 0.8, `bike spots found for ${posts.length}/${D.posts.length} posts`);
const p = posts[1] || posts[0]; g.player.x = p.x + 20; g.player.z = p.z;
const step = (sec, follow) => { for (let i = 0; i < sec * 20; i++) { g.clock += 0.05; if (follow && follow()) { const f = follow(); g.player.x = f.x + 15; g.player.z = f.z; } D.update(0.05); T.update(0.05, g.player, null, g.clock, [], null); } };
step(1); ok(p.on && p.state === 'duty', 'officer on duty'); const bike = p.bike; ok(!!bike && bike.type === 'policebike', 'his police motorcycle is there');
if (bike) { ok(!L.roadAt(bike.x, bike.z), 'parked on the pavement, not the road'); const d = Math.hypot(bike.x - p.x, bike.z - p.z); ok(d > 2 && d < 11, `parked near the post (${d.toFixed(1)} m)`); ok(bike.stand === 1 && bike.leanK === 1, 'resting on its side stand'); ok(bike.mesh.rotation.z < -0.1, 'leaning to the left onto the stand'); ok(T.parked.includes(bike), 'solid / visible as a parked vehicle'); }
g.atmos.hour = 19.95; let sawKick = false, minStand = 1; const seen = new Set();
for (let i = 0; i < 60 * 20 && p.state !== 'ride'; i++) { g.clock += 0.05; D.update(0.05); T.update(0.05, g.player, null, g.clock, [], null); seen.add(p.state); if (p.state === 'kick') { sawKick = true; minStand = Math.min(minStand, bike.stand); } }
ok(seen.has('toBike') && seen.has('mount') && seen.has('kick') && seen.has('pull'), `shift end sequence (${[...seen].join(' → ')})`);
ok(sawKick && bike.stand === 0 && bike.leanK === 0, 'stand kicked up, bike upright');
ok(p.state === 'ride' && T.vehicles.includes(bike) && bike.driverChar === p.ch, 'riding in traffic with the officer at the handlebars');
ok(Array.isArray(p.route) && p.route.length > 0, `planned route to HQ (${p.route ? p.route.length : 0} junctions)`);
let best = Infinity; for (let i = 0; i < 400 * 20 && T.vehicles.includes(bike); i++) { g.clock += 0.05; g.player.x = bike.x + 15; g.player.z = bike.z; D.update(0.05); T.update(0.05, g.player, null, g.clock, [], null); best = Math.min(best, Math.hypot(bike.x - HQ_NODE.x, bike.z - HQ_NODE.z)); if (best < 16) break; }
ok(best < 16, `reaches the junction in front of Police HQ (closest ${best.toFixed(1)} m)`);
// kick down / up end states on a fresh bike
const { Vehicle } = await import('../src/vehicles/Vehicle.js'); const { Character, randomSpec } = await import('../src/actors/Character.js');
const b2 = new Vehicle('bike', 4, scene); const ch = new Character(randomSpec(5, { age: 'adult' })); const s0 = b2.mesh.userData.seats[0];
for (let k = 0; k <= 1.0001; k += 0.05) K.kickDown(b2, ch, s0, Math.min(1, k)); ok(b2.stand === 1 && b2.leanK === 1 && !ch.anim.footOverL, 'kick down ends on the stand');
let fo = 0; for (let k = 0; k <= 1.0001; k += 0.05) { K.kickUp(b2, ch, s0, Math.min(1, k)); if (ch.anim.footOverL) fo = Math.max(fo, ch.anim.footOverL.w); } ok(b2.stand === 0 && b2.leanK === 0 && fo > 0.9, 'kick up: the left boot sweeps the stand up');
console.log(`duty: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
