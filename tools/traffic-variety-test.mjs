// Traffic variety (Node, headless; 54th): 8 minutes of real ambient traffic (Traffic.js on the city plan, the loading-screen
// model warm-up first) around two places; every 3 s the moving vehicles within 140 m are sampled.
//   - the three-wheeler stays the most common single vehicle but well under half of the street
//   - the same exact look (model + paint) almost never appears twice at once, never more than twice; the same model rarely
//   - many different models are seen
//   node tools/traffic-variety-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js'); const { Traffic } = await import('../src/vehicles/Traffic.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('FAIL', m); } };
const col = new Collision(); col.addAll(CP.plan.colliders);
for (const [fx, fz, name] of [[-140, -890, 'Fort'], [300, -480, 'Beira Lake / Lotus Tower']]) {
  const T = new Traffic(new THREE.Scene(), col, { emit() {}, on() {} }); await T.warmModels([[fx, fz]]);
  const focus = { x: fx, z: fz }; const types = new Map(); let samples = 0, dupSum = 0, maxSame = 0, tuk = 0, n = 0, typeDup = 0, maxType = 0;
  for (let i = 0; i < 30 * 480; i++) { T.update(1 / 30, focus, [0, 1], i / 30, [], null);
    if (i > 900 && i % 90 === 0) { samples++; const near = T.vehicles.filter((v) => !v.parked && Math.hypot(v.x - focus.x, v.z - focus.z) < 140); const m = new Map(), mt = new Map();
      for (const v of near) { const k = v.look || v.type; m.set(k, (m.get(k) || 0) + 1); if (v.type !== 'tuktuk') mt.set(v.type, (mt.get(v.type) || 0) + 1); types.set(v.type, (types.get(v.type) || 0) + 1); n++; if (v.type === 'tuktuk') tuk++; }
      maxSame = Math.max(maxSame, 0, ...m.values()); dupSum += [...m.values()].reduce((a, b) => a + Math.max(0, b - 1), 0) / Math.max(1, near.length); typeDup += [...mt.values()].reduce((a, b) => a + Math.max(0, b - 1), 0) / Math.max(1, near.length); maxType = Math.max(maxType, 0, ...mt.values()); } }
  const top = [...types.entries()].sort((a, b) => b[1] - a[1]); console.log(`${name}: ${samples} samples, ${(n / samples).toFixed(1)} moving vehicles in 140 m, ${types.size} models seen; top: ${top.slice(0, 6).map(([k, v]) => k + ' ' + (100 * v / n).toFixed(0) + '%').join(' · ')}`);
  ok(top[0][0] === 'tuktuk' || tuk / n > 0.15, `${name}: the three-wheeler is still a common sight (${(100 * tuk / n).toFixed(0)}%)`);
  ok(tuk / n < 0.36, `${name}: three-wheelers under 36% of the street (${(100 * tuk / n).toFixed(0)}%; before the 54th: 46% Fort, 42% Beira Lake)`);
  ok(dupSum / samples < 0.06, `${name}: an exact repeat look among nearby vehicles ${(100 * dupSum / samples).toFixed(1)}% (before: 1.8% / 4.5%)`);
  ok(typeDup / samples < 0.05 && maxType <= 2, `${name}: the same model (other than three-wheelers) twice at once ${(100 * typeDup / samples).toFixed(1)}% of vehicles, at most ${maxType} together (before: 2.5% / 4.2%, up to 3)`);
  ok(maxSame <= 2, `${name}: never more than two of the same look at once (max ${maxSame})`);
  ok(types.size >= 20, `${name}: ${types.size} different models seen in 8 minutes (before: 29 / 36)`); }
console.log(`traffic-variety-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
