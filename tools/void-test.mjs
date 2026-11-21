// Void test (Node, headless): people knocked down by punches, killed (ragdoll) or struck by a car must never end up under the
// ground — on pavements, at kerb edges, on the road, in Viharamahadevi Park, on bridges and next to water — at 60, 30 and 10 fps.
// Every frame, every bone's world position is checked against the walkable ground under it.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js'); await import('../src/world/Parks.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
const { RagdollWorld } = await import('../src/actors/Ragdoll.js');
const V = process.env.V; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// deterministic spot list: kerb edges, roads, pavements, park, bridges, water edges
let ms = +(process.env.SEED || 1); Math.random = () => ((ms = (ms * 48271) % 2147483647) / 2147483647); // the crowd's own randomness, seeded: a failure is reproducible (SEED=n)
let seed = +(process.env.RS || 7); const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const B = L.BOUNDS; const spots = { kerb: [], road: [], walk: [], park: [], bridge: [], shore: [] };
const PK = (await import('../src/world/Parks.js')).PARK;
for (let i = 0; i < 400000 && Object.values(spots).some((a) => a.length < 6); i++) {
  const x = B.minX + 40 + rnd() * (B.maxX - B.minX - 80), z = B.minZ + 40 + rnd() * (B.maxZ - B.minZ - 80);
  const water = L.isWater(x, z), bw = L.bridgeWalkAt(x, z); if (water && !bw) { if (spots.shore.length < 6) { for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (!L.isWater(x + dx, z + dz)) { spots.shore.push([x + dx, z + dz]); break; } } continue; }
  if (bw) { if (spots.bridge.length < 6) spots.bridge.push([x, z]); continue; }
  const r = !!L.roadAt(x, z); const edge = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].some(([dx, dz]) => !!L.roadAt(x + dx, z + dz) !== r);
  if (x > PK.x0 + 4 && x < PK.x1 - 4 && z > PK.z0 + 4 && z < PK.z1 - 4) { if (spots.park.length < 6) spots.park.push([x, z]); continue; }
  const k = edge ? 'kerb' : r ? 'road' : 'walk'; if (spots[k].length < (k === 'kerb' ? 10 : 6)) spots[k].push([x, z]);
}
const col = new Collision(); // terrain + paving only (no buildings): the ground itself is what is under test
const BN = ['hips', 'chest', 'neck', 'head', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
const _v = new THREE.Vector3();
function worst(p) { // deepest bone below the ground under it (m, > 0 = under)
  p.ch.root.updateMatrixWorld(true); let w = -9, wn = ''; for (const n of BN) { const b = p.ch.bones[n]; if (!b) continue; _v.setFromMatrixPosition(b.matrixWorld); let g = 1e9; for (const [ox, oz] of [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]]) g = Math.min(g, col.groundAt(_v.x + ox, _v.z + oz, _v.y + 0.3)); let gy = g; /* a joint within 5 cm of a step face (kerb, parapet) is beside it, not in it */ if (gy < -0.5 && L.isWater(_v.x, _v.z)) continue; /* floating in water is handled by the ragdoll's water floor */ const d = gy - _v.y; if (d > w) { w = d; wn = n; } }
  return [w, wn];
}
const scene = new THREE.Scene();
const C = new Crowd(scene, col, { emit() {}, on() {} }); C.max = 1; C.prepareSpecs(4); const RW = new RagdollWorld(col); C.ragdolls = RW;
let cases = 0, soft = 0, skipped = 0;
const AT = process.env.AT ? process.env.AT.split(',').map(Number) : null; if (AT) { for (const k in spots) spots[k] = []; spots.debug = [[AT[0], AT[1]]]; }
for (const [kind, list] of Object.entries(spots)) for (const [sx, sz] of list) for (const dt of [1 / 60, 1 / 30, 0.1]) for (const how of ['punch', 'kill', 'car']) {
  if (AT && (AT[2] && Math.abs(dt - AT[2]) > 1e-4 || process.env.HOW && process.env.HOW !== how)) continue;
  if (process.env.STATES) console.log('STATE', how, sx.toFixed(1), sz.toFixed(1), dt.toFixed(3), 'MS', ms, 'RS', seed); if (AT && process.env.MS) { ms = +process.env.MS; seed = +process.env.RS; } // replay one case of a full run exactly
  const focus = { x: sx, z: sz }; const ctx = { simTime: 0, vehicles: [], player: { x: sx - 30, z: sz, vehicle: null, ch: null }, bodies: [], hourFactor: 1, hour: 12 };
  for (const p of C.peds.slice()) { C.despawn(p); } C.peds.length = 0;
  for (let i = 0; i < 60 && !C.peds.length; i++) C.update(1 / 30, focus, [0, 1], ctx);
  const p = C.peds[0]; if (!p) { skipped++; continue; } // no pedestrian network near this spot (open water edge / closed lot): nobody walks there
  p.x = sx; p.z = sz; p.y = col.groundAt(sx, sz, 0.4); p.keep = true; p.state = 'idle'; p.timer = 5; p.ch.root.position.set(p.x, p.y, p.z); p.yaw = rnd() * 6.283;
  for (let i = 0; i < 6; i++) C.update(dt, focus, [0, 1], ctx);
  const a = rnd() * 6.283, src = { x: p.x - Math.sin(a) * 0.8, z: p.z - Math.cos(a) * 0.8 }; ctx.player.x = src.x; ctx.player.z = src.z;
  if (how === 'car') C.knock(p, Math.sin(a), Math.cos(a), 6 + rnd() * 14, rnd() - 0.5);
  else { for (let n = 0; n < 14 && p.state !== 'down'; n++) C.punched(p, src, n % 2 ? 'hook' : 'cross'); if (how === 'kill') C.kill(p); }
  let w = -9, wn = '', at = 0, under = 0, sus = 0; const T = 5;
  for (let t = 0; t < T; t += dt) { C.update(dt, focus, [0, 1], ctx); RW.update(dt, []); const [d, n] = worst(p); if (process.env.TRACE && process.env.TRACE === `${how}@${sx.toFixed(1)},${sz.toFixed(1)}@${dt.toFixed(3)}` && p.ch.rag) { const R = p.ch.rag; const PN = { shinL: 'knL', shinR: 'knR', footL: 'anL', footR: 'anR', handL: 'wrL', handR: 'wrR', foreL: 'elL', foreR: 'elR', thighL: 'hipL', thighR: 'hipR' }; const RN = ['pelvis', 'chest', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'hipL', 'hipR', 'knL', 'knR', 'anL', 'anR']; const k = process.env.TRP ? RN.indexOf(process.env.TRP) : RN.indexOf(PN[n] || 'pelvis'); const q = R.p[k];
    console.log('TR', t.toFixed(2), n, (d * 100).toFixed(1), 'cm  part', RN[k], q.x.toFixed(2), q.y.toFixed(3), q.z.toFixed(2), 'gy', R.gy[k].toFixed(3), 'gLow', col.groundAt(q.x, q.z, q.y + 0.25).toFixed(3), 'gHigh', col.groundAt(q.x, q.z, q.y + 1.2).toFixed(3), 'asleep', R.asleep, 'kin', !!R.kin, 'bone', (() => { const b = p.ch.bones[n]; b.updateMatrixWorld(true); const w = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); return `${w.x.toFixed(2)} ${w.y.toFixed(3)} ${w.z.toFixed(2)} g ${col.groundAt(w.x, w.z, w.y + 0.3).toFixed(3)}`; })()); }
    if (AT) { const P = p.ch.rag ? p.ch.rag.pelvis() : null; console.log(t.toFixed(2), p.state, 'xz', p.x.toFixed(2), p.z.toFixed(2), 'y', (p.y || 0).toFixed(3), 'g', col.groundAt(p.x, p.z, (p.y || 0) + 0.3).toFixed(3), 'sY', L.surfaceY(p.x, p.z).toFixed(3), 'rot', p.ch.mesh.rotation.x.toFixed(2), 'worst', d.toFixed(3), n, P ? 'pel ' + P.x.toFixed(2) + ',' + P.y.toFixed(2) + ',' + P.z.toFixed(2) : ''); } if (d > w) { w = d; wn = n; at = t; } under = d > 0.06 ? under + dt : 0; sus = Math.max(sus, under); }
  cases++; if (V) console.log(kind, how, dt.toFixed(3), sx.toFixed(1), sz.toFixed(1), 'worst', w.toFixed(3), wn, at.toFixed(2), p.state, !!p.ch.rag);
  ok(w < 0.25, `${how} at ${kind} (${sx.toFixed(1)}, ${sz.toFixed(1)}) dt ${dt.toFixed(3)}: ${wn} ${(w * 100).toFixed(1)} cm under the ground at t ${at.toFixed(2)} s (void)`);
  ok(sus < 0.25, `${how} at ${kind} (${sx.toFixed(1)}, ${sz.toFixed(1)}) dt ${dt.toFixed(3)}: a joint stayed more than 6 cm under the ground for ${sus.toFixed(2)} s`);
  if (w > 0.06) soft++;
  if (p.ch.rag) { RW.remove(p.ch.rag); p.ch.rag = null; }
}
console.log(`void: ${cases} cases (${skipped} spots without a pedestrian network skipped; ${soft} with a brief < 25 cm landing contact), ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
