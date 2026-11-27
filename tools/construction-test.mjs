// Construction sites (Construction.js): plots are picked on clear ground beside a street, the hoarding never narrows the
// pavement, the crew are real crowd people who work, carry crates and go home at night, and everything is released again.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
const { Construction } = await import('../src/world/Construction.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene();
const C = new Crowd(scene, col, { emit() {}, on() {} }); C.prepareSpecs(30); C.max = 40;
const traffic = { guests: [], parked: [], vehicles: [] };
const game = { collision: col, scene, crowd: C, traffic };
const K = new Construction(game);
const t0 = performance.now(); K.pick(1); const pickMs = performance.now() - t0;
ok(K.sites.length >= 3, `sites are picked around the city (${K.sites.length} sites, ${pickMs.toFixed(0)} ms)`);
ok(K.sites.every((s) => s.name && Number.isFinite(s.ground)), 'every site has a name and a ground height');
let apart = true; for (let i = 0; i < K.sites.length; i++) for (let j = i + 1; j < K.sites.length; j++) if (Math.hypot(K.sites[i].x - K.sites[j].x, K.sites[i].z - K.sites[j].z) < 150) apart = false;
ok(apart, 'sites are spread out, not stacked on top of each other');

// plots are clear ground before anything is built, and away from the pavement
let dirty = 0, onPavement = 0;
for (const s of K.sites) {
  for (let a = -4.5; a <= 4.5; a += 1.5) for (let b = -3.5; b <= 3.5; b += 1.5) { const x = s.x + a, z = s.z + b; if (col.blocked(x, z, 0.4) || L.roadAt(x, z)) dirty++; }
  for (const n of L.pedNodes) if (Math.hypot(n.x - s.x, n.z - s.z) < (n.walkW || 2) + 3.4) onPavement++;
}
ok(dirty === 0, `a site is never put through a building, a wall or a road (${dirty} bad samples)`);
ok(onPavement === 0, `the hoarding never stands on a pavement (${onPavement} pavement nodes too close)`);

// build
const s0 = K.sites[0]; const before = col.list.length;
K.build(s0);
ok(s0.built && s0.group.children.length >= 2, `the site builds (${s0.group.children.length} merged meshes)`);
ok(col.list.length > before + 8, `the hoarding and the stores are solid (${col.list.length - before} colliders added)`);
ok(!!s0.truck && traffic.guests.includes(s0.truck), 'the tipper lorry stands in the plot and the traffic treats it as solid');
ok(s0.group.children.every((m) => !m.geometry.attributes.position || m.geometry.attributes.position.count > 0), 'every mesh has geometry');

// crew: working hours
C.biz.hour = 10;
const ctx = { hour: 10, simTime: 0 };
K.staff(s0);
ok(s0.crew.length >= 3, `a crew is put on site (${s0.crew.length} people)`);
for (const w of s0.crew) w.spawn();
ok(s0.crew.filter((w) => w.p).length >= 3, 'the crew take their places on the site');
let moved = 0, carried = 0; const start = s0.crew.map((w) => w.p ? { x: w.p.x, z: w.p.z } : null);
const focus = { x: s0.x, z: s0.z };
for (let i = 0; i < 2600; i++) {
  ctx.simTime += 0.1; C.update(0.1, focus, { x: 0, z: 1 }, { ...ctx, vehicles: [], player: { x: s0.x + 300, z: s0.z, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1 });
  K.update(0.1, focus, ctx);
  for (let k = 0; k < s0.crew.length; k++) { const w = s0.crew[k]; if (!w.p || !start[k]) continue; if (Math.hypot(w.p.x - start[k].x, w.p.z - start[k].z) > 1.5) moved++; if (w.crate) carried++; }
}
ok(moved > 20, `the crew work — they walk about the site (${moved} walking samples)`);
ok((K.stats.fetches || 0) > 0 && carried > 0, `labourers fetch and carry materials (${K.stats.fetches} fetches, ${carried} carrying samples)`);
let inside = 0, outside = 0; for (const w of s0.crew) { if (!w.p) continue; const dx = w.p.x - s0.x, dz = w.p.z - s0.z; if (Math.hypot(dx, dz) < 7) inside++; else outside++; }
ok(inside >= outside, `the crew stay on their site (${inside} in, ${outside} away)`);

// night: the crew clock off, and the watchman is the only one who stays
C.biz.hour = 22;
for (let i = 0; i < 900; i++) { ctx.simTime += 0.1; ctx.hour = 22; C.update(0.1, focus, { x: 0, z: 1 }, { ...ctx, vehicles: [], player: { x: s0.x + 300, z: s0.z, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1 }); K.update(0.1, focus, ctx); }
const night = s0.crew.filter((w) => w.p && w.role !== 'watchman').length;
ok(night === 0, `the site empties at night; only the watchman stays (${night} still on)`);

// and it is all given back
const colsNow = col.list.length;
K.dispose(s0);
ok(!s0.built && s0.group === null, 'the site can be disposed');
ok(col.list.length < colsNow, `its colliders are removed again (${colsNow - col.list.length})`);
ok(!traffic.guests.includes(s0.truck || {}), 'the tipper is taken out of the traffic');
ok(s0.crew.length === 0, 'the crew is released back to the street');

console.log(`construction: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
