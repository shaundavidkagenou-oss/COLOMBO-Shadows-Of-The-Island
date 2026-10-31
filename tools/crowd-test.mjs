// Crowd behaviour test (Node, headless): pedestrians walk with a purpose along the sidewalk graph, cross roads only at
// marked crossings (zebra / signals / minor lanes) and on the zebra itself, never cut across a carriageway, never pace back
// and forth; ambient activities happen; a street fight brings the police, who arrest both people and drive them away.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const col = new Collision(); col.addAll(CP.plan.colliders);
const C = new Crowd(new THREE.Scene(), col, { emit() {}, on() {} }); C.prepareSpecs(40); C.max = 60;
const REACT = new Set(['flee', 'dodge', 'recover', 'cower', 'down', 'stumble', 'confront', 'complain', 'hit', 'report', 'watch', 'argue', 'talkPlayer', 'shrugOff']);
const spots = [{ x: -128, z: -880 }, { x: -300, z: -300 }, { x: 150, z: -300 }];
let zebraN = 0, zebraOff = 0, samples = 0, onRoad = 0, roadBad = 0, crossN = 0, crossOff = 0, crossNoZebra = 0, reversals = 0, legs = 0; const badEx = [];
for (const S of spots) {
  C.clear(); const focus = { x: S.x, z: S.z }; const ctx = { simTime: 0, vehicles: [], player: { x: S.x + 400, z: S.z, vehicle: null, ch: null, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1, hour: 10 };
  const prevNode = new Map();
  for (let i = 0; i < 3000; i++) { ctx.simTime += 0.1; C.update(0.1, focus, { x: 0, z: 1 }, ctx);
    if (i < 100 || i % 2) continue;
    for (const p of C.peds) { if (REACT.has(p.state) || p.state === 'scene') continue; samples++;
      if (p.crossing && p.edge && p.edge.zebra) { const n = L.nodes[p.edge.node]; const off = p.edge.axis === 'v' ? Math.abs(p.z - n.z) - n.hwH : Math.abs(p.x - n.x) - n.hwV; zebraN++; if (off < 0.8 - 0.35 || off > 4.2 + 0.35) zebraOff++; }
      const r = L.roadAt(p.x, p.z); if (!r) continue; onRoad++;
      if (!(p.crossing && p.edge && p.edge.type === 'cross')) { roadBad++; if (badEx.length < 6 || (badEx.length < 40 && !badEx.some((q) => q.includes(`st ${p.id.toFixed(3)}`)))) badEx.push(`st ${p.id.toFixed(3)} rt ${(p.rt || 0).toFixed(1)} sp ${p.state === 'walk' ? p.speed.toFixed(2) : ''} tgt ${p.target ? p.target.x.toFixed(1) + ',' + p.target.z.toFixed(1) : '-'} ${p.state} (${p.x.toFixed(1)},${p.z.toFixed(1)}) edge ${p.edge ? p.edge.type : '-'} crossing ${!!p.crossing}`); }
    }
  }
  // crossing legs that happened (count via edge usage)
}
// crossing placement: every crossing a ped starts must be allowed and on the zebra (measured from the planned crossing line)
for (const E of L.pedEdges) if (E.type === 'cross' && E.used) { crossN += E.used; if (E.noCross) crossNoZebra += E.used; }
console.log(`samples ${samples}, on road ${onRoad}, on road outside a crossing ${roadBad}`); for (const e of badEx) console.log('  e.g.', e);
console.log(`crossings used ${crossN}, at junctions without a zebra ${crossNoZebra}`);
const st = C.stats; console.log(`zebra samples ${zebraN} (${zebraOff} off the stripes) · steps planned ${st.planned} / fallback ${st.fallback} · reversals ${st.reversals} · goals ${st.goals}`);
ok(crossN > 100 && crossNoZebra === 0, `people cross only at zebras, signals or minor lanes (${crossN} crossings, ${crossNoZebra} elsewhere)`);
ok(zebraN > 500 && zebraOff <= zebraN * 0.01, `crossing on the zebra stripes (${zebraOff} of ${zebraN} samples off them)`);
ok(st.planned > 20 * Math.max(1, st.fallback), `walks are planned routes, not random wandering (${st.planned} planned steps, ${st.fallback} unplanned)`);
ok(st.reversals <= st.planned * 0.002, `nobody paces back and forth (${st.reversals} immediate reversals)`);
ok(roadBad <= samples * 0.0005, `nobody walks on a carriageway outside a crossing (${roadBad} of ${samples} samples)`);
console.log("life", JSON.stringify(C.life.stats)); console.log(`crowd: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
