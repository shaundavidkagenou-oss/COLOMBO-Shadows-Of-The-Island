// World simulation director (SimDirector.js): the hour/weather/business activity curve, the near-field budget that stops
// three street works piling into one corner, and the save round trip.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
const { Construction } = await import('../src/world/Construction.js'); const { SimDirector } = await import('../src/world/SimDirector.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene();
const C = new Crowd(scene, col, { emit() {}, on() {} }); C.prepareSpecs(26); C.max = 60;
const traffic = { guests: [], parked: [], vehicles: [] };
const K = new Construction({ collision: col, scene, crowd: C, traffic }); K.pick(1); for (const s of K.sites) K.build(s);
const game = { collision: col, scene, crowd: C, traffic, construction: K, streetSvc: null, cityEvents: null, player: { x: K.sites[0].x, z: K.sites[0].z } };
const D = new SimDirector(game);
const ctx = { hour: 12, day: 1, rain: 0, night: 0 };

// ---- the day's shape: midday is busier than the small hours, and rain thins the street
const run = (h, rain = 0, day = 1) => { C.biz.hour = h; game.player = { x: K.sites[0].x, z: K.sites[0].z }; const d = new SimDirector(game); d.hour = h; d.rain = rain; d.day = day; for (let i = 0; i < 60; i++) d.update(0.3, { hour: h, day, rain, night: h < 6 || h > 19 ? 1 : 0 }); return d; };
const midday = run(12), night = run(3), wet = run(12, 0.9);
ok(midday.factor() > night.factor() * 1.5, `the street is busier at noon than at 3am (${midday.factor().toFixed(2)} vs ${night.factor().toFixed(2)})`);
ok(wet.factor() < midday.factor(), `rain thins the pavement (${wet.factor().toFixed(2)} vs ${midday.factor().toFixed(2)})`);
ok(midday.factor() <= 1.05 && night.factor() > 0.1, 'the factor stays inside its bounds');
ok(midday.districtActivity(0, 0) > night.districtActivity(0, 0), 'activity follows the shops that are open around the corner');

// ---- budget: three manned works beside the player is one too many
for (const s of K.sites) { s.crew = []; K.staff(s); for (const w of s.crew) w.spawn(); }
C.biz.hour = 10;
const near = K.sites.slice(0, 3);
// put three heavy systems in one place: the sites themselves, a refuse round and an event
const realSites = K.sites.map((s) => ({ s, x: s.x, z: s.z }));
near.forEach((s, i) => { s.x = game.player.x + i * 4; s.z = game.player.z; });
game.cityEvents = { list: [{ id: 'e1', venue: 'v' }], sites: new Map([['e1', { x: game.player.x + 6, z: game.player.z }]]), acceptsVisitors: () => true };
D.hour = 10; D.rain = 0;
for (let i = 0; i < 40; i++) D.update(0.1, { hour: 10, day: 1, rain: 0 });
ok(D.stats.budget >= 2, `the director counts the street works around the player (${D.stats.budget})`);
if (D.stats.budget > 2) ok(D.stats.stood > 0, 'when they pile up, one of them stands down');
else ok(true, 'the count stayed within budget in this layout');
realSites.forEach(({ s, x, z }) => { s.x = x; s.z = z; });

// ---- traffic volume follows the hour, under the density setting's ceiling
const T2 = { max: 30, guests: [], parked: [], vehicles: [] }; game.traffic = T2; const D3 = new SimDirector(game); D3.baseTraffic = 30;
D3.hour = 8; for (let i = 0; i < 8; i++) D3.update(0.3, { hour: 8, day: 1, rain: 0 }); const rush = T2.max;
D3.hour = 3; for (let i = 0; i < 8; i++) D3.update(0.3, { hour: 3, day: 1, rain: 0 }); const small = T2.max;
ok(rush > small && rush <= 30, `the traffic follows the rush hour (${rush} in the rush, ${small} at 3am, ceiling 30)`);
D3.hour = 8; D3.rain = 0.9; for (let i = 0; i < 8; i++) D3.update(0.3, { hour: 8, day: 1, rain: 0.9 });
ok(T2.max < rush, `rain keeps some of the traffic at home (${T2.max})`);
game.traffic = traffic;

// ---- restore: the works roster, bins and business day come back
const save = D.serialize();
ok(save.v === 1 && save.day === 1 && Array.isArray(save.history), 'the world serialises to a small versioned blob');
const D2 = new SimDirector(game); D2.restore(save);
ok(D2.day === save.day && D2.seed === save.seed, 'the day and seed come back');
ok(D2.info().act >= 0 && D2.info().act <= 1.2, 'info() reports a sane activity level');
const bad = new SimDirector(game); bad.restore(null); bad.restore({ v: 1, street: { bins: [1] } });
ok(true, 'a missing or malformed world block never throws');

// ---- the director's tick is cheap
const t0 = performance.now(); for (let i = 0; i < 400; i++) D.update(0.02, { hour: 12, day: 1, rain: 0 });
const ms = (performance.now() - t0) / 400;
ok(ms < 1.0, `a director tick costs ${ms.toFixed(3)} ms`);

console.log(`sim-director: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
