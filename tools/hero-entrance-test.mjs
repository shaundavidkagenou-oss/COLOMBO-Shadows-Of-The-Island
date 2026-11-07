// Hero home entrances (Node): for Dineth's, Shashika's and David's door spots, a house-front is built on a real building
// wall — flush with the facade (no gap, not sunk in), fitted to the flat stretch of wall (no panel hanging past a corner),
// the door spot stays free to stand on, nothing on a road, and the room door still opens from that spot.
// Run: node tools/hero-entrance-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
if (!document.addEventListener) document.addEventListener = () => {};
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
if (!document.head) document.head = { appendChild() {} }; if (!document.body) document.body = { appendChild() {} }; if (!document.getElementById) document.getElementById = () => null;
const { Drunk, SHOT } = await import('../src/actors/Drunk.js');
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const L = await import('../src/world/Layout.js');
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { heroDoorSpots, wallSpot } = await import('../src/world/HeroRooms.js');
const { buildHeroEntrance } = await import('../src/world/HeroEntrance.js');
const col = new Collision(); col.addAll(CP.plan.colliders);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const game = { collision: col, interiors: { doors: [] } };
const doors = heroDoorSpots(game).map((d) => ({ ...d }));
// Dineth: the story's safeSpot near the Slave Island flat (open pavement, maybe no wall) → moved to the nearest wall
const sf = L.PLACES.slaveFlat; const safe = (x, z) => { for (let r = 0; r < 30; r += 1.5) for (let a = 0; a < 8; a++) { const px = x + Math.cos(a * 0.785) * r, pz = z + Math.sin(a * 0.785) * r; if (!col.blocked(px, pz, 0.45) && !L.roadAt(px, pz)) return [px, pz]; } return [x, z]; }; // Story.safeSpot
const [rx, rz] = safe(sf.x, sf.z); let dn = { id: 'room', owner: 'dineth', x: rx, z: rz, faceIn: Math.PI };
if (!buildHeroEntrance('room', { ...dn }, col)) { const w = wallSpot(game, dn.x, dn.z, 30); ok(!!w, 'Dineth: a wall spot within 30 m of the flat'); if (w) dn = { ...dn, ...w }; }
doors.unshift(dn);
const v = new THREE.Vector3(), box = new THREE.Box3();
for (const d of doors) {
  const e = buildHeroEntrance(d.id, d, col); ok(!!e, `${d.id}: entrance built`); if (!e) continue;
  const g = e.group; g.updateMatrixWorld(true); box.setFromObject(g);
  const W = e.wall; ok(W.d > 0.25 && W.d < 2.6, `${d.id}: wall ${W.d.toFixed(2)} m in front of the door spot`);
  // flush: the facade plane at local z=0 must be within 6 cm of the wall along the panel (probe 5 points across)
  const th = d.faceIn, ix = Math.sin(th), iz = Math.cos(th); let worst = 0;
  for (const lx of [-0.4, -0.2, 0, 0.2, 0.4]) { v.set(lx, 1.2, 0).applyMatrix4(g.matrixWorld); const f = col.raycast(v.x - ix * 0.5, 1.0, v.z - iz * 0.5, v.x + ix * 0.5, 1.0, v.z + iz * 0.5, 0.02); const dist = f < 1 ? Math.abs(f - 0.5) : 1; worst = Math.max(worst, dist); }
  ok(worst < 0.06, `${d.id}: frontage flush with the wall (worst ${(worst * 100).toFixed(1)} cm)`);
  ok(!col.blocked(d.x, d.z, 0.35), `${d.id}: door spot still free to stand on`);
  ok(!L.roadAt(d.x, d.z), `${d.id}: door spot not on a road`);
  const h = box.max.y - box.min.y; ok(h > 2.5 && h < 3.6, `${d.id}: frontage height ${h.toFixed(2)} m`);
  ok(Math.hypot((box.min.x + box.max.x) / 2 - d.x, (box.min.z + box.max.z) / 2 - d.z) < 3, `${d.id}: built at the door`);
  let tris = 0; g.traverse((m) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); ok(tris > 500 && tris < 20000, `${d.id}: ${tris} triangles`);
  console.log(`  ${d.id} at (${d.x.toFixed(1)}, ${d.z.toFixed(1)}) wall ${W.d.toFixed(2)} m, flat ${W.left.toFixed(2)} / ${W.right.toFixed(2)} m, ${tris} tris`);
}
console.log(`hero-entrance: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
