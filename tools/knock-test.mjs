// Knock-down test (Node, headless): a pedestrian struck by a vehicle is thrown, but never through a wall — at 60, 30 and 10 fps.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
for (const [dt, sp] of [[1 / 60, 20], [1 / 30, 20], [0.1, 16]]) {
  const col = new Collision(); const X = -300, Z = -120; col.add({ x0: X + 3, x1: X + 3.2, z0: Z - 20, z1: Z + 20, h: 4, kind: 'wall' });
  const C = new Crowd(new THREE.Scene(), col, { emit() {}, on() {} }); C.max = 1; C.prepareSpecs(1);
  const focus = { x: -300, z: -120 }; const ctx = { simTime: 0, vehicles: [], player: { x: X - 30, z: Z, vehicle: null, ch: null }, bodies: [], hourFactor: 1, hour: 12 };
  for (let i = 0; i < 40 && !C.peds.length; i++) C.update(dt, focus, [0, 1], ctx);
  const p = C.peds[0]; if (!p) { ok(false, 'spawned'); continue; } focus.x = X; focus.z = Z; p.x = X; p.z = Z; p.y = 0.15; p.keep = true;
  C.knock(p, 1, 0, sp, 0.2); let maxX = -1e9; for (let i = 0; i < 4 / dt; i++) { C.update(dt, focus, [0, 1], ctx); maxX = Math.max(maxX, p.x); }
  ok(maxX > X + 1.5, `body was actually thrown toward the wall (${(maxX - X).toFixed(2)} m)`); ok(maxX < X + 3 - 0.2, `thrown body stays on the near side of a 0.2 m wall (dt ${dt.toFixed(3)}, car ${sp} m/s: max x ${(maxX - X).toFixed(2)})`);
}
console.log(`knock: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
